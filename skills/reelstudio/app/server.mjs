// ReelStudio app server (OpenCode edition): local only (127.0.0.1). OpenCode is the producer; rs does voice/images/render.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME = process.env.REELSTUDIO_HOME || path.join(os.homedir(), 'ReelStudio');
const APP = path.dirname(fileURLToPath(import.meta.url));
const RS = path.join(HOME, 'engine', 'bin', 'rs.mjs');
const AGENT = process.env.REELSTUDIO_AGENT || 'reelstudio-producer';
const OPENCODE = process.env.OPENCODE_BIN || 'opencode';
const LIB = path.join(HOME, 'engine', 'src', 'lib', 'index.tsx');
const REELS = path.join(HOME, 'reels'), BRANDS = path.join(HOME, 'brands'), LOOKS = path.join(HOME, 'looks');
const PORT = Number(process.env.PORT || 4748);
const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]);

const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'reel';
const safeId = (s) => /^[a-z0-9][a-z0-9_-]{0,60}$/.test(s || '');
const env = () => { const o = {}; for (const l of (fs.existsSync(path.join(HOME, '.env')) ? fs.readFileSync(path.join(HOME, '.env'), 'utf8') : '').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) o[m[1]] = m[2]; } return o; };
const SETTINGS = path.join(HOME, 'app-settings.json');
const LEGACY_SETTINGS = path.join(HOME, 'app-settings-opencode.json');
const settings = () => ({model: '', maxImages: 3, ...readJSON(LEGACY_SETTINGS, {}), ...readJSON(SETTINGS, {})});
let OC_MODELS = [];
execFile(OPENCODE, ['models'], {maxBuffer: 1e7}, (e, so) => { if (!e) OC_MODELS = so.split('\n').map((s) => s.trim()).filter((s) => /^[\w.-]+\/\S+$/.test(s)); });

// ---------------- jobs ----------------
const running = new Map(); // slug -> child process
const jobPath = (slug) => path.join(REELS, slug, 'job.json');
const getJob = (slug) => readJSON(jobPath(slug), {phase: 'new', log: [], cost: 0});
function saveJob(slug, patch) {
  const j = {...getJob(slug), ...patch, updated: Date.now()};
  if (j.log.length > 400) j.log = j.log.slice(-400);
  writeJSON(jobPath(slug), j);
  return j;
}
function pushLog(slug, kind, text) {
  const j = getJob(slug);
  j.log.push({t: Date.now(), kind, text: String(text).slice(0, 2000)});
  saveJob(slug, {log: j.log});
}

function stepOf(cmd) {
  if (/rs\.mjs"?\s+voice/.test(cmd)) return ['voice', 'Registro la voce e i tempi delle parole'];
  if (/rs\.mjs"?\s+image/.test(cmd)) return ['images', 'Genero un\'illustrazione' + (/--hero/.test(cmd) ? ' (qualità hero)' : '')];
  if (/rs\.mjs"?\s+frames/.test(cmd)) return ['check', 'Renderizzo i frame di controllo'];
  if (/rs\.mjs"?\s+render/.test(cmd)) return ['render', 'Render finale MP4 + copertina'];
  return null;
}

function producerPrompt(slug, opts) {
  const reel = readJSON(path.join(REELS, slug, 'reel.json'));
  const brand = readJSON(path.join(BRANDS, reel.brand + '.json'), {});
  const look = brand.look ? readJSON(path.join(LOOKS, brand.look, 'look.json'), null) : null;
  const rs = `node "${RS}"`;
  return `You are the ReelStudio producer. Load the reelstudio skill with the skill tool (id: reelstudio) and follow it. Use exactly this command for rs: ${rs}
The component library source is ${LIB}. The reel folder already exists: ${path.join(REELS, slug)} (reel name "${slug}"). Work only inside ${HOME}. Run each shell command on its own (no 'cd … &&', no pipes, no ';'): this headless OpenCode session only allows simple commands, and it cannot ask the user questions.

BRIEF
- Topic / script from the user: ${reel.brief?.topic}
- Brand "${reel.brand}": ${JSON.stringify({name: brand.name, handle: brand.handle, language: brand.language, tone: brand.tone})}
- Target length: about ${reel.brief?.seconds || 30} seconds. Language: ${brand.language || 'it'}.
- Images: at most ${reel.brief?.maxImages ?? 3}. ${reel.brief?.hero ? 'Use --hero (GPT Image 2.6 Sunburst) for the cover/hook image.' : 'Default model is fine; use --hero only for the single most important image.'} Use --mascot when the mascot must appear in an illustration.
${reel.brief?.notes ? '- Extra notes from the user: ' + reel.brief.notes : ''}
${look ? `\nLOOK "${look.name}" — the creative line every reel of this brand must follow:\n${look.description}\nRules:\n${look.bible}\nImage art direction is appended automatically by rs; still describe subjects in a way that fits it.` : ''}`;
}

// OpenCode producer: `opencode run --format json`, one JSON event per line.
// Tolerant of both the V2 event stream (session.*) and the V1 part stream (text / tool_use / step_finish).
function runProducer(slug, prompt, {resume, phaseWhenDone}) {
  const s = settings();
  const args = ['run', '--format', 'json', '--agent', AGENT, '--title', `ReelStudio: ${slug}`];
  if (s.model) args.push('--model', s.model);
  if (resume) args.push('--session', resume);
  args.push(prompt);
  const child = spawn(OPENCODE, args, {cwd: path.join(REELS, slug), env: {...process.env, ...env()}, stdio: ['ignore', 'pipe', 'pipe']});
  running.set(slug, child);
  saveJob(slug, {error: null});
  let buf = '', sawSession = !!resume, failed = null;
  const onTool = (name, input) => {
    input = input || {};
    const cmd = input.command || input.cmd || '';
    const file = input.filePath || input.file_path || input.path || '';
    const st = cmd && stepOf(cmd);
    if (st) { saveJob(slug, {step: st[0]}); pushLog(slug, 'step', st[1]); }
    else if (/write|edit|patch/i.test(name || '') && file) pushLog(slug, 'tool', `${/write/i.test(name) ? 'Scrivo' : 'Modifico'} ${path.basename(file)}`);
    else if (/\.png$/i.test(file) && !/write|edit/i.test(name || '')) pushLog(slug, 'tool', `Guardo ${path.basename(file)}`);
  };
  const names = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      const type = ev.type || '';
      const data = ev.data || ev.properties || {};
      const part = ev.part || data.part || {};
      const sid = data.sessionID || part.sessionID || ev.sessionID;
      if (sid && !sawSession) { sawSession = true; saveJob(slug, {ocSessionId: sid}); }
      if (type === 'session.text.ended' || (type === 'text' && part.text)) {
        const txt = (data.text ?? part.text ?? '').trim();
        if (txt) pushLog(slug, 'say', txt);
      } else if (type === 'session.tool.input.started') {
        names.set(data.id, data.name);
      } else if (type === 'session.tool.called') {
        onTool(names.get(data.id) || data.name, data.input);
      } else if (type === 'tool_use' || type === 'tool') {
        onTool(part.tool, part.state?.input);
        if (part.state?.status === 'error') pushLog(slug, 'warn', String(part.state.error || 'tool error').slice(0, 400));
      } else if (type === 'session.tool.failed') {
        const er = data.error; pushLog(slug, 'warn', (typeof er === 'string' ? er : er?.message || JSON.stringify(er || data.content || '')).slice(0, 400));
      } else if (type === 'session.step.ended' || type === 'step_finish' || (type === 'session.usage.recorded' && data.source !== 'generate')) {
        const c = Number(data.cost ?? part.cost ?? 0);
        if (c > 0) saveJob(slug, {cost: (getJob(slug).cost || 0) + c});
      } else if (type === 'session.execution.failed' || type === 'session.step.failed' || type === 'error') {
        const er = data.error || ev.error; failed = typeof er === 'string' ? er : er?.message || er?.data?.message || JSON.stringify(er || ev);
        pushLog(slug, 'warn', failed.slice(0, 400));
      }
    }
  });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += String(e.message || e); });
  child.on('close', (code) => {
    running.delete(slug);
    if ((code !== 0 || (failed && !fs.existsSync(path.join(REELS, slug, 'reel.json')))) && !getJob(slug).stopped) { saveJob(slug, {phase: 'error', error: (failed || err).slice(-800) || `opencode exited ${code}`}); return; }
    if (getJob(slug).stopped) { saveJob(slug, {phase: 'stopped', stopped: false}); return; }
    const next = phaseWhenDone();
    saveJob(slug, {phase: next, step: null});
    pushLog(slug, 'done', next === 'review' ? 'Script pronto: rivedilo e approva' : next === 'done' ? 'Reel pronto' : 'Fine');
  });
}

function startScript(slug) {
  const reel = readJSON(path.join(REELS, slug, 'reel.json'));
  saveJob(slug, {phase: 'scripting', step: 'script', log: [], cost: 0});
  pushLog(slug, 'step', 'Il producer scrive lo script');
  const auto = reel.brief?.autoApprove;
  const prompt = producerPrompt(slug) + (auto
    ? '\n\nDo the whole job, steps 1–7, without waiting for approval. Finish with the render.'
    : '\n\nDo ONLY steps 1–2 now: write reel.json with the script (scenes with id, voiceover, visual). Do not run voice, images or render. Stop after writing it.');
  runProducer(slug, prompt, {phaseWhenDone: () => (auto ? (fs.existsSync(path.join(REELS, slug, 'final.mp4')) ? 'done' : 'review') : 'review')});
}

function startProduce(slug, feedback) {
  const j = getJob(slug);
  const before = fs.existsSync(path.join(REELS, slug, 'final.mp4')) ? fs.statSync(path.join(REELS, slug, 'final.mp4')).mtimeMs : 0;
  saveJob(slug, {phase: 'producing', step: 'voice'});
  pushLog(slug, 'step', feedback ? 'Applico la modifica richiesta' : 'Script approvato: si produce');
  const msg = feedback
    ? `The user asks for this change to the reel "${slug}": "${feedback}". Re-read reel.json and src/Reel.tsx (they may have been edited), apply the change, re-run voice only if voiceovers changed, then frames (self-check every PNG) and render a new version.`
    : `The user approved the script (they may have edited ${path.join(REELS, slug, 'reel.json')} — re-read it and keep their wording exactly). Now do steps 3–7: voice, images, Reel.tsx with an optional Cover export, frames with a full self-check of every PNG, render.`;
  const prompt = j.ocSessionId ? msg : producerPrompt(slug) + '\n\n' + msg;
  runProducer(slug, prompt, {resume: j.ocSessionId, phaseWhenDone: () => {
    const f = path.join(REELS, slug, 'final.mp4');
    return fs.existsSync(f) && fs.statSync(f).mtimeMs > before ? 'done' : 'error';
  }});
}

// ---------------- data ----------------
function reelSummary(slug) {
  const d = path.join(REELS, slug);
  const reel = readJSON(path.join(d, 'reel.json'), {});
  const t = readJSON(path.join(d, 'timeline.json'));
  const j = getJob(slug);
  const st = fs.statSync(d);
  return {
    slug, title: reel.title || slug, brand: reel.brand, phase: running.has(slug) ? j.phase : (j.phase === 'scripting' || j.phase === 'producing' ? 'stopped' : j.phase),
    step: j.step, seconds: t ? +(t.total / t.fps).toFixed(1) : null,
    video: fs.existsSync(path.join(d, 'final.mp4')) ? `/files/reels/${slug}/final.mp4?v=${Math.round(fs.statSync(path.join(d, 'final.mp4')).mtimeMs)}` : null,
    cover: fs.existsSync(path.join(d, 'cover.png')) ? `/files/reels/${slug}/cover.png?v=${Math.round(fs.statSync(path.join(d, 'cover.png')).mtimeMs)}` : null,
    updated: Math.max(st.mtimeMs, j.updated || 0),
  };
}
function listDir(d) { return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => !x.startsWith('.')) : []; }
function looks() {
  return listDir(LOOKS).map((id) => {
    const l = readJSON(path.join(LOOKS, id, 'look.json'), {});
    const files = listDir(path.join(LOOKS, id)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    return {id, ...l, files: files.map((f) => `/files/looks/${id}/${f}?v=${Math.round(fs.statSync(path.join(LOOKS, id, f)).mtimeMs)}`)};
  });
}
function state() {
  const reels = listDir(REELS).filter((s) => fs.existsSync(path.join(REELS, s, 'reel.json'))).map(reelSummary).sort((a, b) => b.updated - a.updated);
  const brands = listDir(BRANDS).filter((f) => f.endsWith('.json')).map((f) => ({id: f.slice(0, -5), ...readJSON(path.join(BRANDS, f), {})}));
  const models = readJSON(path.join(HOME, 'engine', 'models.json'), {});
  return {reels, brands, looks: looks(), key: !!env().OPENROUTER_API_KEY, models, settings: settings(), home: HOME, producer: 'opencode', ocModels: OC_MODELS};
}

// ---------------- http ----------------
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
function sendFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(file).size, type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : size - 1;
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1});
    return fs.createReadStream(file, {start, end}).pipe(res);
  }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache'});
  fs.createReadStream(file).pipe(res);
}
const json = (res, code, o) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d; if (b.length > 30e6) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } }); });
const rs = (args) => new Promise((ok) => execFile('node', [RS, ...args], {env: {...process.env, ...env()}, maxBuffer: 1e7}, (e, so, se) => ok({ok: !e, out: so + se})));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const o = req.headers.origin;
      if (o && !ORIGINS.has(o)) return json(res, 403, {error: 'origin'});
    }
    // static
    if (p === '/' || p === '/index.html') return sendFile(req, res, path.join(APP, 'public', 'index.html'));
    if (p.startsWith('/static/')) return sendFile(req, res, path.join(APP, 'public', path.normalize(p.slice(8)).replace(/^(\.\.[/\\])+/, '')));
    if (p.startsWith('/files/')) {
      const f = path.resolve(HOME, '.' + p.slice(6));
      if (!f.startsWith(HOME + path.sep) || /\/\.env$|app-settings/.test(f)) { res.writeHead(403); return res.end(); }
      return sendFile(req, res, f);
    }
    // api
    if (p === '/api/state') return json(res, 200, state());
    const m = p.match(/^\/api\/reels\/([a-z0-9-]+)(?:\/(\w+))?$/);
    if (p === '/api/reels' && req.method === 'POST') {
      const b = await body(req);
      if (!b.topic?.trim()) return json(res, 400, {error: 'Scrivi un argomento'});
      if (!fs.existsSync(path.join(BRANDS, (b.brand || 'default') + '.json'))) return json(res, 400, {error: 'brand'});
      let slug = slugify(b.topic.split('\n')[0]); let n = 2;
      while (fs.existsSync(path.join(REELS, slug))) slug = slugify(b.topic.split('\n')[0]).slice(0, 46) + '-' + n++;
      fs.mkdirSync(path.join(REELS, slug, 'src'), {recursive: true});
      fs.mkdirSync(path.join(REELS, slug, 'assets', 'img'), {recursive: true});
      writeJSON(path.join(REELS, slug, 'reel.json'), {title: b.topic.split('\n')[0].slice(0, 80), brand: b.brand || 'default', scenes: [],
        brief: {topic: b.topic, seconds: +b.seconds || 30, maxImages: +b.maxImages, hero: !!b.hero, autoApprove: !!b.autoApprove, notes: b.notes || ''}});
      startScript(slug);
      return json(res, 200, {slug});
    }
    if (m) {
      const [, slug, action] = m;
      const d = path.join(REELS, slug);
      if (!fs.existsSync(d)) return json(res, 404, {error: 'not found'});
      if (!action && req.method === 'GET') {
        const outs = listDir(path.join(d, 'out')).filter((f) => f.endsWith('.mp4')).sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
        const frames = listDir(path.join(d, 'frames')).filter((f) => f.endsWith('.png')).sort();
        const imgs = listDir(path.join(d, 'assets', 'img')).filter((f) => f.endsWith('.png'));
        return json(res, 200, {...reelSummary(slug), reel: readJSON(path.join(d, 'reel.json')), timeline: readJSON(path.join(d, 'timeline.json')), job: getJob(slug), running: running.has(slug),
          versions: outs.map((f) => ({name: f.replace('.mp4', ''), url: `/files/reels/${slug}/out/${f}`})),
          frames: frames.map((f) => `/files/reels/${slug}/frames/${f}?v=${Math.round(fs.statSync(path.join(d, 'frames', f)).mtimeMs)}`),
          images: imgs.map((f) => `/files/reels/${slug}/assets/img/${f}`)});
      }
      if (running.has(slug) && ['approve', 'revise', 'script'].includes(action)) return json(res, 409, {error: 'Il producer sta già lavorando'});
      if (action === 'script' && req.method === 'PUT') {
        const b = await body(req); const reel = readJSON(path.join(d, 'reel.json'));
        reel.scenes = (b.scenes || []).filter((s) => s.id && s.voiceover).map((s) => ({...reel.scenes.find((x) => x.id === s.id), ...s}));
        if (b.title) reel.title = b.title;
        writeJSON(path.join(d, 'reel.json'), reel);
        return json(res, 200, {ok: true});
      }
      if (action === 'approve' && req.method === 'POST') { startProduce(slug); return json(res, 200, {ok: true}); }
      if (action === 'revise' && req.method === 'POST') { const b = await body(req); if (!b.feedback?.trim()) return json(res, 400, {error: 'empty'}); startProduce(slug, b.feedback.trim()); return json(res, 200, {ok: true}); }
      if (action === 'rescript' && req.method === 'POST') { if (running.has(slug)) return json(res, 409, {}); startScript(slug); return json(res, 200, {ok: true}); }
      if (action === 'stop' && req.method === 'POST') { const c = running.get(slug); if (c) { saveJob(slug, {stopped: true}); c.kill('SIGTERM'); } return json(res, 200, {ok: true}); }
      if (action === 'reveal' && req.method === 'POST') { execFile('open', [d]); return json(res, 200, {ok: true}); }
      if (!action && req.method === 'DELETE') {
        if (running.has(slug)) return json(res, 409, {});
        const trash = path.join(HOME, 'trash'); fs.mkdirSync(trash, {recursive: true});
        fs.renameSync(d, path.join(trash, slug + '-' + Date.now()));
        return json(res, 200, {ok: true});
      }
    }
    const bm = p.match(/^\/api\/brands\/([a-z0-9_-]+)$/);
    if (bm && req.method === 'PUT') {
      if (!safeId(bm[1])) return json(res, 400, {});
      const b = await body(req); delete b.id;
      writeJSON(path.join(BRANDS, bm[1] + '.json'), b);
      return json(res, 200, {ok: true});
    }
    const lm = p.match(/^\/api\/looks\/([a-z0-9_-]+)(?:\/(\w+))?$/);
    if (lm) {
      const [, id, action] = lm;
      if (!safeId(id)) return json(res, 400, {});
      const dir = path.join(LOOKS, id);
      if (!action && req.method === 'PUT') {
        const b = await body(req); delete b.id; delete b.files;
        writeJSON(path.join(dir, 'look.json'), b);
        return json(res, 200, {ok: true});
      }
      if (action === 'upload' && req.method === 'POST') {
        const b = await body(req);
        const mm = String(b.dataUrl || '').match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
        if (!mm) return json(res, 400, {error: 'immagine non valida'});
        const name = (b.kind === 'mascot' ? 'mascot' : 'ref-' + Date.now()) + '.' + (mm[1] === 'jpeg' ? 'jpg' : mm[1]);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, name), Buffer.from(mm[2], 'base64'));
        const l = readJSON(path.join(dir, 'look.json'), {});
        if (b.kind === 'mascot') l.mascot = name; else l.references = [...(l.references || []), name];
        writeJSON(path.join(dir, 'look.json'), l);
        return json(res, 200, {ok: true, name});
      }
      if (action === 'remove' && req.method === 'POST') {
        const b = await body(req); const l = readJSON(path.join(dir, 'look.json'), {});
        l.references = (l.references || []).filter((r) => r !== b.file);
        writeJSON(path.join(dir, 'look.json'), l);
        return json(res, 200, {ok: true});
      }
      if (action === 'sample' && req.method === 'POST') {
        const b = await body(req);
        const l = readJSON(path.join(dir, 'look.json'), {});
        const prompt = b.prompt || `A typical illustration for this brand: ${l.description || ''}`;
        const r = await rs(['look-image', id, 'sample-' + Date.now(), prompt, ...(l.mascot && b.mascot !== false ? ['--mascot'] : []), ...(b.hero ? ['--hero'] : [])]);
        return json(res, r.ok ? 200 : 500, {out: r.out});
      }
    }
    if (p === '/api/settings' && req.method === 'PUT') {
      const b = await body(req);
      if (typeof b.key === 'string' && b.key.trim()) {
        const lines = (fs.existsSync(path.join(HOME, '.env')) ? fs.readFileSync(path.join(HOME, '.env'), 'utf8') : '').split('\n').filter((l) => !/^\s*#?\s*OPENROUTER_API_KEY=/.test(l) && l.trim());
        lines.push('OPENROUTER_API_KEY=' + b.key.trim());
        fs.writeFileSync(path.join(HOME, '.env'), lines.join('\n') + '\n', {mode: 0o600});
      }
      const s = settings();
      if (typeof b.model === 'string') s.model = b.model;
      writeJSON(SETTINGS, s);
      return json(res, 200, {ok: true});
    }
    json(res, 404, {error: 'not found'});
  } catch (e) { console.error(e); json(res, 500, {error: e.message}); }
});

// mark jobs that died with a previous server as stopped
for (const s of listDir(REELS)) { const j = readJSON(jobPath(s)); if (j && (j.phase === 'scripting' || j.phase === 'producing')) saveJob(s, {phase: 'stopped'}); }

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`ReelStudio app → ${url}`);
  if (!process.env.NO_OPEN) {
    const chrome = '/Applications/Google Chrome.app';
    if (fs.existsSync(chrome)) execFile('open', ['-na', chrome, '--args', `--app=${url}`, '--window-size=1320,880']);
    else execFile('open', [url]);
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log('Already running → http://localhost:' + PORT); if (!process.env.NO_OPEN) execFile('open', [`http://localhost:${PORT}`]); }
  else throw e;
});
