// rs lesson: lesson markdown → long vertical film, fully automatic.
//   plan     DeepSeek (OpenRouter) turns the lesson into chapters and typed scenes (JSON)
//   visuals  real photos from Wikimedia Commons + Lucide SVG icons (no AI images)
//   voice    Piper, local TTS, with word timings from Piper's own alignments
//   render   the LessonFilm composition (engine/src/lib/lesson.tsx)
// Progress lines for apps: "@@ {json}" on stdout.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';

const TYPES = ['hook', 'chapter', 'bullets', 'steps', 'stat', 'quote', 'compare', 'chart', 'photo', 'icons', 'definition', 'quiz', 'recap', 'end'];
const PIPER_PY = process.env.PIPER_PYTHON || path.join(os.homedir(), '.local/share/uv/tools/piper-tts/bin/python');
const WORDS_PER_MIN = 150;

export async function cmdLesson(pos, flags, X) {
  const {log, die} = X;
  const progress = (step, pct, msg) => { log(`@@ ${JSON.stringify({step, pct, msg})}`); if (msg) log(`· ${msg}`); };
  const sub = pos[0];
  const lessonDir = (slug) => X.reelDir(slug);
  const conf = () => ({planner: 'deepseek/deepseek-v4.1-flash-1017', voice: 'it_IT-paola-medium', lengthScale: 0.95, ...(X.models().lesson || {})});

  // ---------- new ----------
  function create(mdPath) {
    if (!mdPath || !fs.existsSync(mdPath)) die('usage: rs lesson new <lesson.md> [--brand b] [--minutes 4] [--voice it_IT-paola-medium] [--speed 1.1]');
    const md = fs.readFileSync(mdPath, 'utf8');
    const title = (md.match(/^#\s+(.+)$/m)?.[1] || path.basename(mdPath, path.extname(mdPath))).trim();
    let slug = flags.slug || 'lezione-' + X.slugify(title).slice(0, 48);
    for (let n = 2; fs.existsSync(path.join(X.REELS, slug)); n++) slug = slug.replace(/-\d+$/, '') + '-' + n;
    const brand = flags.brand || (fs.existsSync(path.join(X.BRANDS, 'scriba.json')) ? 'scriba' : 'default');
    if (!fs.existsSync(path.join(X.BRANDS, brand + '.json'))) die(`brand "${brand}" not found`);
    const d = path.join(X.REELS, slug);
    fs.mkdirSync(path.join(d, 'src'), {recursive: true});
    fs.mkdirSync(path.join(d, 'assets', 'img'), {recursive: true});
    fs.copyFileSync(mdPath, path.join(d, 'lesson.md'));
    fs.writeFileSync(path.join(d, 'src', 'Reel.tsx'), "// Lesson film: everything comes from reel.json (rs lesson plan). Edit the scenes there, not here.\nexport {LessonFilm as default, LessonCover as Cover} from '@rs/lesson';\n");
    X.writeJSON(path.join(d, 'reel.json'), {
      title, brand, kind: 'lesson', minutes: Number(flags.minutes) || 4, speed: Number(flags.speed) || 1,
      lessonVoice: {engine: 'piper', model: flags.voice || conf().voice, lengthScale: Number(flags['length-scale']) || conf().lengthScale}, scenes: [],
    });
    log(slug);
    return slug;
  }

  // ---------- plan ----------
  async function plan(slug) {
    const d = lessonDir(slug);
    const reel = X.readJSON(path.join(d, 'reel.json'));
    const md = fs.readFileSync(path.join(d, 'lesson.md'), 'utf8');
    const minutes = Number(flags.minutes) || reel.minutes || 4;
    const words = Math.round(minutes * WORDS_PER_MIN);
    const model = flags.planner || conf().planner;
    progress('plan', 5, `scrivo la sceneggiatura con ${model} (~${minutes} min, ~${words} parole)`);
    const LANGS = {it: 'ITALIAN', en: 'ENGLISH', es: 'SPANISH', fr: 'FRENCH', de: 'GERMAN'};
    const sys = PLANNER_PROMPT.replace('{LANG}', LANGS[flags.lang || reel.lang || 'it'] || String(flags.lang).toUpperCase()).replace('{WORDS}', String(words)).replace('{SCENES}', String(Math.round(minutes * 9))).replace('{CHAPTERS}', String(Math.max(2, Math.min(7, Math.round(minutes / 1.2)))));
    let out;
    for (let attempt = 1; attempt <= 2 && !out; attempt++) {
      const r = await X.orFetch('/chat/completions', {
        model, temperature: 0.7, max_tokens: 32000, response_format: {type: 'json_object'}, reasoning: {effort: 'medium'},
        messages: [{role: 'system', content: sys}, {role: 'user', content: `LESSON (markdown):\n\n${md}`}],
      });
      const txt = (r.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
      try { out = JSON.parse(txt); } catch { log(`  (risposta non valida [${r.choices?.[0]?.finish_reason || r.error?.message || '?'}], riprovo: ${txt.slice(0, 120)})`); }
      if (r.usage?.cost) log(`  costo sceneggiatura: $${Number(r.usage.cost).toFixed(4)}`);
    }
    if (!out?.scenes?.length) die('the planner returned no scenes');
    const scenes = sanitize(out.scenes);
    reel.title = out.title || reel.title;
    reel.scenes = scenes;
    reel.minutes = minutes;
    X.writeJSON(path.join(d, 'reel.json'), reel);
    const n = scenes.reduce((a, s) => a + s.voiceover.split(/\s+/).length, 0);
    progress('plan', 15, `${scenes.length} scene, ${scenes.filter((s) => s.type === 'chapter').length} capitoli, ${n} parole (~${(n / WORDS_PER_MIN).toFixed(1)} min)`);
  }

  function sanitize(raw) {
    const seen = new Set();
    let ch = 0;
    const scenes = raw.filter((s) => s && typeof s.voiceover === 'string' && s.voiceover.trim()).map((s, i) => {
      const type = TYPES.includes(s.type) ? s.type : 'bullets';
      let id = X.slugify(String(s.id || `${type}-${i + 1}`)).slice(0, 30) || `s${i + 1}`;
      while (seen.has(id)) id += '-' + i;
      seen.add(id);
      if (type === 'chapter') ch++;
      const o = {...s, id, type, voiceover: s.voiceover.replace(/\*/g, '').trim(), chapter: type === 'hook' || type === 'end' ? undefined : Math.max(1, ch)};
      if (type === 'chapter') o.chapter = ch;
      if (['bullets', 'steps', 'recap'].includes(type)) o.items = (s.items || []).map(String).slice(0, 5);
      if (type === 'quiz') { o.options = (s.options || []).map(String).slice(0, 4); o.answer = Math.max(0, Math.min(o.options.length - 1, Number(s.answer) || 0)); }
      if (type === 'chart' && !(s.chart?.data?.length >= 2)) o.type = 'bullets', o.items = (s.chart?.labels || [s.title || '']).slice(0, 4);
      if (type === 'stat' && !Number.isFinite(Number(s.value))) o.type = 'definition', o.term = s.label || s.title, o.text = s.voiceover;
      if (type === 'compare' && !(s.left?.items && s.right?.items)) o.type = 'bullets', o.items = [...(s.left?.items || []), ...(s.right?.items || [])].slice(0, 5);
      return o;
    });
    if (scenes[0]?.type !== 'hook') scenes.unshift({id: 'hook', type: 'hook', title: scenes[0]?.title || 'Pronto?', voiceover: 'Pronto? Partiamo.'});
    if (scenes[scenes.length - 1]?.type !== 'end') scenes.push({id: 'end', type: 'end', title: 'Hai imparato\nqualcosa di nuovo', voiceover: 'Se ti è stato utile, salvalo per il ripasso.'});
    return scenes;
  }

  // ---------- visuals: photos + icons ----------
  async function visuals(slug) {
    const d = lessonDir(slug);
    const reel = X.readJSON(path.join(d, 'reel.json'));
    const scenes = reel.scenes;
    const photos = scenes.filter((s) => s.type === 'photo');
    let done = 0;
    for (const s of photos) {
      if (s.photo && fs.existsSync(path.join(d, 'assets', s.photo.file))) { done++; continue; }
      const kind = s.source === 'historical' ? 'storica' : 'stock';
      progress('visuals', 18 + Math.round((done++ / Math.max(1, photos.length)) * 10), `foto ${kind}: ${s.query || s.caption}`);
      const got = await findPhoto(d, s, reel).catch((e) => { log(`  (foto non trovata: ${e.message})`); return null; });
      if (got) s.photo = got;
      else { s.type = 'icons'; s.title = s.title || s.caption; s.icons = s.icons?.length ? s.icons : [{draw: s.query, label: s.caption || ''}]; }
    }
    const tags = await lucideTags();
    const dir = path.join(d, 'assets', 'icons');
    fs.mkdirSync(dir, {recursive: true});
    const icons = new Set();
    let drawn = 0;
    for (const s of scenes.filter((x) => x.type === 'icons')) {
      const out = [];
      for (const it of (s.icons || []).slice(0, 4)) {
        const label = String(it.label || '').slice(0, 28);
        const m = it.draw ? {name: '', score: 0} : resolveIcon(tags, it.icon, label);
        let name = m.name;
        if (m.score < 5) {  // no standard icon fits: DeepSeek draws one in the same line style
          progress('visuals', 29, `disegno un'icona: ${it.draw || it.icon || label}`);
          name = await drawIcon(dir, it.draw || `${it.icon || ''} ${label}`.trim()).catch((e) => { log(`  (icona non disegnata: ${e.message})`); return m.name || 'sparkles'; });
          if (name.startsWith('custom-')) drawn++;
        }
        out.push({icon: name, label});
        icons.add(name);
      }
      s.icons = out;
    }
    for (const n of icons) {
      const f = path.join(dir, n + '.svg');
      if (fs.existsSync(f) || n.startsWith('custom-')) continue;
      const r = await fetch(`https://cdn.jsdelivr.net/npm/lucide-static@1.75.0/icons/${n}.svg`);
      if (r.ok) fs.writeFileSync(f, await r.text());
    }
    X.writeJSON(path.join(d, 'reel.json'), reel);
    progress('visuals', 30, `${photos.filter((s) => s.photo).length} foto, ${icons.size} icone (${drawn} disegnate da zero)`);
  }

  // ---- photos: stock (Openverse, free licenses that allow commercial use and edits) or historical (Wikimedia Commons);
  //      DeepSeek reads the candidates and picks the one that fits the scene ----
  const OV_UA = 'LessonFilm/0.1 (local educational video tool)';
  async function searchStock(q) {
    const u = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({q, page_size: '20', license_type: 'commercial,modification', mature: 'false'});
    const r = await fetch(u, {headers: {'User-Agent': OV_UA}});
    if (!r.ok) return [];
    const j = await r.json();
    return (j.results || []).filter((x) => x.url && x.width >= 800 && x.height >= 450).map((x) => ({
      title: x.title || '', description: (x.tags || []).slice(0, 8).map((t) => t.name).join(', '), width: x.width, height: x.height, url: x.url,
      license: `CC ${String(x.license).toUpperCase()} ${x.license_version || ''}`.replace('CC CC0', 'CC0').replace('CC PDM', 'Public domain').trim(),
      licenseUrl: x.license_url, author: x.creator || '', page: x.foreign_landing_url, via: x.provider === 'wikimedia' ? 'Wikimedia Commons' : 'Openverse/' + (x.provider || x.source),
    }));
  }
  async function searchHistorical(q) {
    const r = await X.commons({action: 'query', generator: 'search', gsrsearch: q + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: '20',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1800'});
    return Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index).map((p) => ({p, x: X.photoInfo(p)}))
      .filter(({x}) => /image\/(jpeg|png|webp|tiff)/.test(x.mime || '') && X.FREE.test(x.license || '') && x.width >= 700 && x.height >= 450)
      .map(({p, x}) => ({title: x.title.replace(/^File:/, ''), description: x.description, width: x.width, height: x.height, url: p.imageinfo[0].thumburl || x.url,
        license: x.license, licenseUrl: x.licenseUrl, author: x.author || x.credit, date: x.date, page: x.page, via: 'Wikimedia Commons'}));
  }
  async function findPhoto(d, s, reel) {
    const q = s.query || s.caption || reel.title;
    const order = s.source === 'historical' ? [searchHistorical, searchStock] : [searchStock, searchHistorical];
    let cands = [];
    for (const f of order) { cands.push(...(await f(q).catch(() => []))); if (cands.length >= 8) break; }
    cands = cands.filter((c) => c.width / c.height < 2.2 && c.width / c.height > 0.6).slice(0, 24);
    if (!cands.length) throw new Error('no free photo for "' + q + '"');
    const list = cands.map((c, i) => `${i}. "${c.title}" — ${c.description?.slice(0, 160) || ''} [${c.width}x${c.height}, ${c.via}${c.date ? ', ' + c.date : ''}]`).join('\n');
    let pick = 0;
    try {
      const r = await X.orFetch('/chat/completions', {model: flags.planner || conf().planner, temperature: 0, response_format: {type: 'json_object'}, max_tokens: 1500, reasoning: {effort: 'low'}, messages: [
        {role: 'system', content: 'You pick the photo for one scene of an educational video. Choose the candidate that shows exactly what the scene is about, as a real photograph (not a diagram, map, chart, logo, scan of text or unrelated subject). Prefer clear, striking, well-composed, large images. Answer JSON: {"pick": index or null if none fits, "why": "few words"}.'},
        {role: 'user', content: `Scene voiceover: "${s.voiceover}"\nOn-screen caption: "${s.caption || ''}"\nWanted: ${s.source === 'historical' ? 'a historical/archival photo' : 'a stock photo'} of "${q}"\n\nCandidates:\n${list}`}]});
      const j = JSON.parse((r.choices?.[0]?.message?.content || '{}').replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (j.pick === null) throw new Error('none fits "' + q + '"');
      if (Number.isInteger(j.pick) && cands[j.pick]) pick = j.pick;
      log(`  scelta ${pick}: ${cands[pick].title.slice(0, 70)} (${j.why || ''})`);
    } catch (e) { if (/none fits/.test(e.message)) throw e; }
    const c = cands[pick];
    const name = s.id;
    const out = path.join(d, 'assets', 'img', name + '.jpg');
    const tmp = out + '.src';
    const buf = Buffer.from(await (await fetch(c.url, {headers: {'User-Agent': c.via.startsWith('Wiki') ? X.COMMONS_UA : OV_UA}})).arrayBuffer());
    fs.writeFileSync(tmp, buf);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-vf', 'scale=min(1800\\,iw):-2', '-q:v', '2', out]);
    fs.rmSync(tmp);
    const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', out]).toString().trim().split('x').map(Number);
    const credits = X.readJSON(path.join(d, 'assets', 'credits.json'), []).filter((x) => x.file !== `img/${name}.jpg`);
    credits.push({file: `img/${name}.jpg`, title: c.title, author: c.author, date: c.date, license: c.license, licenseUrl: c.licenseUrl, source: c.page, via: c.via});
    X.writeJSON(path.join(d, 'assets', 'credits.json'), credits);
    return {file: `img/${name}.jpg`, w, h};
  }

  // ---- icons: DeepSeek draws a new one in the Lucide line style when no standard icon fits ----
  async function drawIcon(dir, what) {
    const slug = 'custom-' + X.slugify(what).slice(0, 40);
    const f = path.join(dir, slug + '.svg');
    if (fs.existsSync(f)) return slug;
    const r = await X.orFetch('/chat/completions', {model: flags.planner || conf().planner, temperature: 0.3, max_tokens: 3000, response_format: {type: 'json_object'}, reasoning: {effort: 'low'}, messages: [
      {role: 'system', content: 'You are an icon designer for the Lucide icon set. Draw ONE simple, instantly readable pictogram on a 24x24 grid, Lucide style: outline only, 2px strokes, round caps and joins, 2px padding, no text, no fills, at most 10 shapes. Allowed elements: path, circle, rect, line, polyline, polygon, ellipse. Answer JSON: {"elements": ["<path d=\\"...\\" />", "<circle cx=\\"12\\" cy=\\"12\\" r=\\"3\\" />"]}'},
      {role: 'user', content: `Icon for: ${what}`}]});
    const j = JSON.parse((r.choices?.[0]?.message?.content || '{}').replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const ATTR = /\s(d|cx|cy|r|rx|ry|x|y|width|height|x1|y1|x2|y2|points)="([-0-9.,\s a-zA-Z]*)"/g;
    const els = (j.elements || []).slice(0, 12).map((e) => {
      const m = String(e).match(/^\s*<(path|circle|rect|line|polyline|polygon|ellipse)\b([^<>]*)\/?>\s*(<\/\1>)?\s*$/);
      if (!m) return '';
      const attrs = [...m[2].matchAll(ATTR)].map((a) => ` ${a[1]}="${a[2].replace(/[^-0-9.,\s a-zA-Z]/g, '')}"`).join('');
      return attrs ? `<${m[1]}${attrs} />` : '';
    }).filter(Boolean);
    if (!els.length) throw new Error('no usable shapes');
    fs.writeFileSync(f, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n  ${els.join('\n  ')}\n</svg>\n`);
    return slug;
  }

  async function lucideTags() {
    const f = path.join(X.HOME, 'cache', 'lucide-tags.json');
    if (fs.existsSync(f)) return X.readJSON(f);
    const r = await fetch('https://cdn.jsdelivr.net/npm/lucide-static@1.75.0/tags.json');
    const j = r.ok ? await r.json() : {};
    X.writeJSON(f, j);
    return j;
  }
  function resolveIcon(tags, name, label) {
    const n = String(name || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (tags[n]) return {name: n, score: 99};
    const words = [n, ...n.split('-'), ...String(label || '').toLowerCase().split(/\W+/)].filter((w) => w.length > 2);
    let best = 'sparkles', score = 0;
    for (const [k, t] of Object.entries(tags)) {
      let sc = 0;
      for (const w of words) { if (k === w) sc += 5; else if (k.split('-').includes(w)) sc += 3; if (t.includes(w)) sc += 2; }
      if (sc > score) { score = sc; best = k; }
    }
    return {name: best, score};
  }

  // ---------- voice: Piper, local ----------
  async function voice(slug) {
    const d = lessonDir(slug);
    const reel = X.readJSON(path.join(d, 'reel.json'));
    const lv = reel.lessonVoice || {};
    const modelName = flags.voice || lv.model || conf().voice;
    const onnx = path.join(X.HOME, 'piper', modelName + '.onnx');
    if (!fs.existsSync(PIPER_PY)) die(`Piper is not installed: uv tool install 'piper-tts[alignment]'`);
    if (!fs.existsSync(onnx)) {
      progress('voice', 31, `scarico la voce Piper ${modelName}`);
      fs.mkdirSync(path.dirname(onnx), {recursive: true});
      const r = spawnSync(PIPER_PY, ['-m', 'piper.download_voices', '--download-dir', path.dirname(onnx), modelName], {stdio: 'inherit'});
      if (r.status !== 0 || !fs.existsSync(onnx)) die('could not download the Piper voice ' + modelName);
    }
    const vo = path.join(d, 'assets', 'vo');
    const raw = path.join(vo, 'raw');
    fs.mkdirSync(raw, {recursive: true});
    const jobs = reel.scenes.map((s) => ({id: s.id, text: speakable(s.voiceover), out: path.join(raw, s.id + '.wav')}));
    progress('voice', 33, `voce locale Piper (${modelName}) per ${jobs.length} scene`);
    const r = spawnSync(PIPER_PY, ['-I', path.join(X.ENGINE_SRC, 'piper', 'speak.py'), onnx], {
      input: JSON.stringify({length_scale: Number(lv.lengthScale) || conf().lengthScale, sentence_silence: 0.28, noise_scale: 0.6, noise_w_scale: 0.75, jobs}),
      maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'],
    });
    if (r.status !== 0) die('Piper failed');
    const res = JSON.parse(r.stdout.toString());
    const scenes = [];
    let from = 0;
    reel.scenes.forEach((s, i) => {
      const mp3 = path.join(vo, s.id + '.mp3');
      X.polishVoice(path.join(raw, s.id + '.wav'), mp3, {});
      const secs = X.probeSeconds(mp3);
      const hold = s.hold ?? (s.type === 'chapter' ? 0.7 : s.type === 'quiz' ? 1.6 : s.type === 'hook' ? 0.4 : 0.3);
      const duration = Math.ceil((secs + hold) * X.FPS);
      const words = (res[s.id]?.words || []).map((w) => ({text: w.text, start: Math.round(w.start * X.FPS), end: Math.max(Math.round(w.end * X.FPS), Math.round(w.start * X.FPS) + 2)}));
      scenes.push({id: s.id, from, duration, audio: `vo/${s.id}.mp3`, voiceover: s.voiceover, via: 'piper ' + modelName, words});
      from += duration;
      if (i % 5 === 0) progress('voice', 33 + Math.round((i / reel.scenes.length) * 17), null);
    });
    X.writeJSON(path.join(d, 'timeline.json'), {fps: X.FPS, width: 1080, height: 1920, total: from, scenes});
    progress('voice', 50, `voce pronta: ${(from / X.FPS / 60).toFixed(1)} minuti`);
  }

  // Piper reads "%" and some symbols badly: spell them out
  const SUB = {'₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'};
  const speakable = (t) => t.replace(/[₀-₉]/g, (c) => SUB[c]).replace(/\bCO2\b/g, 'ci o due').replace(/\bH2O\b/g, 'acca due o').replace(/\bO2\b/g, 'o due').replace(/\*/g, '').replace(/(\d)\s?%/g, '$1 per cento').replace(/€\s?(\d[\d.,]*)/g, '$1 euro').replace(/\s&\s/g, ' e ').replace(/\s+/g, ' ').trim();

  // ---------- make: everything ----------
  if (sub === 'new') return create(pos[1]);
  if (sub === 'plan') return plan(pos[1]);
  if (sub === 'visuals') return visuals(pos[1]);
  if (sub === 'voice') return voice(pos[1]);
  if (sub === 'render') { progress('render', 52, 'rendering del film (qualche minuto)'); await X.cmdRender([pos[1]], flags); progress('done', 100, 'film pronto'); return; }
  if (sub === 'make') {
    const slug = flags.reel || create(pos[1]);
    progress('new', 2, `progetto ${slug}`);
    await plan(slug);
    await visuals(slug);
    await voice(slug);
    progress('render', 52, 'rendering del film (qualche minuto)');
    await X.cmdRender([slug], flags, (p) => progress('render', 52 + Math.round(p * 46), null));
    log(`@@ ${JSON.stringify({step: 'done', pct: 100, msg: 'film pronto', file: path.join(X.REELS, slug, 'final.mp4'), reel: slug})}`);
    return;
  }
  die(`rs lesson — lesson markdown → long vertical film (Piper voice, real photos, SVG icons)
  lesson make <lesson.md> [--brand b] [--minutes 4] [--voice it_IT-paola-medium] [--speed 1.1]   all steps
  lesson new <lesson.md> …   then: lesson plan <reel> · lesson visuals <reel> · lesson voice <reel> · lesson render <reel>`);
}

const PLANNER_PROMPT = `You are the head writer of a hugely popular educational video channel. You turn a lesson (markdown) into a LONG vertical video (9:16) that feels like a gripping Instagram reel stretched to several minutes: fast, visual, curious, never boring, faithful to the lesson.

Write the video in {LANG}, whatever the language of the lesson (it may be bilingual: use only the content, once). Address the viewer directly ("tu"). Return ONLY a JSON object:
{"title": "...", "scenes": [ ... ]}

LENGTH: total voiceover ≈ {WORDS} words, about {SCENES} scenes, {CHAPTERS} chapters. Cover ALL the key content of the lesson, in a logical order; do not invent facts that are not in the lesson or common knowledge.

EVERY scene has: "id" (short, kebab-case, unique), "type", "voiceover" (1-3 spoken sentences, 10-45 words, natural spoken language, no markdown, no emoji, no lists read aloud, numbers may be digits). On-screen text must be SHORT (titles ≤ 8 words, items ≤ 7 words); you may wrap 1-2 key words in *stars* to color them. On-screen text supports the voice, it does not repeat it word for word.

SCENE TYPES and their fields:
- "hook": {"title", "kicker"?} — FIRST scene. A scroll-stopping question, surprising fact or bold promise. Voiceover ≤ 25 words, ends with a curiosity gap.
- "chapter": {"title"} — opens each chapter. Voiceover: one short line that teases what comes ("Ma perché succede? Ecco il punto.").
- "bullets": {"title", "items": [2-4]} — key points; mention each item in the voiceover, in order.
- "steps": {"title", "items": [2-5]} — a process in order; say "primo… poi… infine…".
- "definition": {"term", "text"} — a key concept, text ≤ 30 words.
- "stat": {"value": number, "prefix"?, "suffix"?, "decimals"?, "label", "source"?} — one striking number from the lesson.
- "chart": {"title", "chart": {"type": "line"|"bar", "data": [numbers], "labels": [...], "unit"?}} — only with real numbers from the lesson.
- "compare": {"left": {"title", "items": [2-3]}, "right": {"title", "items": [2-3]}} — myth vs fact, before vs after, A vs B.
- "quote": {"text", "author"} — only real, well-known quotes.
- "photo": {"query", "source", "caption"} — a REAL photo of something concrete and photographable. "source": "historical" for archival photos of real people, companies, places and events of the past (searched on Wikimedia Commons, e.g. "Intel 1103 DRAM chip", "Michael Porter", "Silicon Valley 1980s"), or "stock" for modern generic imagery (searched in free stock libraries, e.g. "semiconductor clean room", "container port cranes", "business meeting"). "query" is in ENGLISH, 2-5 words. Never for abstract ideas. caption ≤ 6 words.
- "icons": {"title", "icons": [{"icon": "lucide-icon-name", "label": "≤ 3 words"} or {"draw": "short English description of a simple pictogram", "label"}] (2-4)} — abstract ideas shown as symbols. Use "draw" when no standard icon fits (a new icon is drawn for you). Icon names from lucide.dev (e.g. brain, dna, atom, microscope, book-open, lightbulb, scale, globe, heart-pulse, zap, leaf, flask-conical, calculator, clock, users, landmark, trending-up, shield, target, puzzle, rocket, sun, droplets, mountain, factory, coins, graduation-cap).
- "quiz": {"question", "options": [3 short options], "answer": index} — the voiceover asks the question and says "pensaci… la risposta è…" revealing it at the end. Put one quiz in the middle of every chapter or so.
- "recap": {"items": [3-5]} — near the end, the take-aways.
- "end": {"title" (2 short lines with \\n), "sub"?} — LAST scene: invite to save the video for revision and follow. Voiceover ≤ 20 words.

RHYTHM: alternate types; never 3 scenes of the same type in a row; use visual types (photo, icons, stat, chart, compare, quiz) often; open each chapter with "chapter"; re-hook attention every 4-5 scenes with a question, a surprising detail, or "ed ecco la parte che quasi nessuno sa". The tone is warm, energetic, clear — a great teacher who is also a great storyteller.`;
