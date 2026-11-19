#!/usr/bin/env node
// ReelStudio CLI — the parts the agent cannot do itself: voice, images, word timings, rendering.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HOME = process.env.REELSTUDIO_HOME || path.join(os.homedir(), 'ReelStudio');
const SRC_ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = path.join(HOME, 'engine');
const REELS = path.join(HOME, 'reels');
const BRANDS = path.join(HOME, 'brands');
const LOOKS = path.join(HOME, 'looks');
const FPS = 30;
const OR = 'https://openrouter.ai/api/v1';

// ---------- helpers ----------
const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const log = (m) => console.log(m);
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { if (d !== undefined) return d; die('cannot read ' + p); } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(o, null, 2)); };
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

function loadEnv() {
  const f = path.join(HOME, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
const KEY = () => process.env.OPENROUTER_API_KEY;

function models() {
  const base = readJSON(path.join(fs.existsSync(path.join(ENGINE, 'models.json')) ? ENGINE : SRC_ENGINE, 'models.json'));
  const over = readJSON(path.join(HOME, 'config.json'), {});
  for (const k of Object.keys(over)) base[k] = {...base[k], ...over[k]};
  return base;
}

function args(argv) {
  const pos = [], flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return {pos, flags};
}

function reelDir(slug) {
  if (!slug) die('missing reel name');
  const d = path.join(REELS, slug);
  if (!fs.existsSync(d)) die(`reel "${slug}" not found in ${REELS}`);
  return d;
}

function probeSeconds(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out);
}

async function orFetch(endpoint, body, {raw = false} = {}) {
  if (!KEY()) die(`OPENROUTER_API_KEY not set. Put it in ${path.join(HOME, '.env')} as OPENROUTER_API_KEY=sk-or-...`);
  let res;
  try {
    res = await fetch(OR + endpoint, {
      method: 'POST',
      headers: {Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json', 'X-Title': 'ReelStudio'},
      body: JSON.stringify(body),
    });
  } catch (e) {
    die(`cannot reach openrouter.ai (${e.cause?.code || e.message}). The network is blocked, most likely by the agent sandbox: run this same command again with network access (escalated permissions). Do NOT switch to --local: that is the robotic macOS draft voice.`);
  }
  if (!res.ok) throw new Error(`${endpoint} ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// ---------- brands + looks ----------
function loadLook(id) {
  if (!id) return null;
  const f = path.join(LOOKS, id, 'look.json');
  return fs.existsSync(f) ? {...readJSON(f), id, dir: path.join(LOOKS, id)} : null;
}
function loadBrand(id) {
  const b = readJSON(path.join(BRANDS, id + '.json'));
  const look = loadLook(b.look);
  return {brand: b, look};
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
/** Download a Google Font (woff2) once into ~/ReelStudio/fonts/<family>/ */
async function ensureFont(family, weights = [400, 600, 800]) {
  const dir = path.join(HOME, 'fonts', family.replace(/\s+/g, '_'));
  const meta = path.join(dir, 'files.json');
  if (fs.existsSync(meta)) return readJSON(meta);
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`, {headers: {'User-Agent': UA}})).text();
  const files = [];
  // keep the latin subset of each weight
  for (const block of css.split('}')) {
    if (!/\/\* latin \*\//.test(block) && css.includes('/* latin */')) continue;
    const w = block.match(/font-weight:\s*(\d+)/)?.[1], u = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!w || !u || files.find((x) => x.weight === w)) continue;
    fs.mkdirSync(dir, {recursive: true});
    const name = `${w}.woff2`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(await (await fetch(u)).arrayBuffer()));
    files.push({family, weight: w, file: name});
  }
  if (!files.length) throw new Error('font not found on Google Fonts: ' + family);
  writeJSON(meta, files);
  return files;
}
/** Merge brand + look into the props the Remotion components read; copy look assets into the reel. */
async function brandProps(reelDirPath, brandId) {
  const {brand, look} = loadBrand(brandId);
  const out = {...brand};
  if (look) {
    out.colors = {...look.colors, ...(brand.colors || {})};
    out.captions = brand.captions || look.captions;
    out.background = brand.background || look.background;
    const la = path.join(reelDirPath, 'assets', 'look');
    fs.mkdirSync(la, {recursive: true});
    if (look.mascot && fs.existsSync(path.join(look.dir, look.mascot))) {
      fs.copyFileSync(path.join(look.dir, look.mascot), path.join(la, look.mascot));
      out.mascot = 'look/' + look.mascot;
    }
    for (const x of look.poses || []) if (fs.existsSync(path.join(look.dir, x.file))) fs.copyFileSync(path.join(look.dir, x.file), path.join(la, x.file));
    if (look.font?.family) {
      try {
        const files = await ensureFont(look.font.family, look.font.weights);
        fs.mkdirSync(path.join(la, 'fonts'), {recursive: true});
        out.fontFiles = files.map((x) => {
          fs.copyFileSync(path.join(HOME, 'fonts', look.font.family.replace(/\s+/g, '_'), x.file), path.join(la, 'fonts', x.file));
          return {family: x.family, weight: x.weight, src: 'look/fonts/' + x.file};
        });
        out.font = `"${look.font.family}", ${look.font.fallback || '-apple-system, sans-serif'}`;
      } catch (e) { console.error('  (font: ' + e.message + ')'); }
    }
    // optional headline font (e.g. a serif), loaded the same way
    if (look.display?.family) {
      try {
        const fam = look.display.family, files = await ensureFont(fam, look.display.weights || [500, 600, 700]);
        fs.mkdirSync(path.join(la, 'fonts', 'display'), {recursive: true});
        out.fontFiles = [...(out.fontFiles || []), ...files.map((x) => {
          fs.copyFileSync(path.join(HOME, 'fonts', fam.replace(/\s+/g, '_'), x.file), path.join(la, 'fonts', 'display', x.file));
          return {family: x.family, weight: x.weight, src: 'look/fonts/display/' + x.file};
        })];
        out.display = `"${fam}", ${look.display.fallback || 'Georgia, serif'}`;
      } catch (e) { console.error('  (display font: ' + e.message + ')'); }
    }
  }
  return out;
}

// ---------- setup ----------
function setup() {
  for (const d of [HOME, REELS, BRANDS, LOOKS, ENGINE]) fs.mkdirSync(d, {recursive: true});
  const prevPkg = fs.existsSync(path.join(ENGINE, 'package.json')) ? fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8') : '';
  fs.rmSync(path.join(ENGINE, 'src'), {recursive: true, force: true});
  fs.rmSync(path.join(ENGINE, 'bin'), {recursive: true, force: true});
  fs.rmSync(path.join(ENGINE, 'piper'), {recursive: true, force: true});
  for (const f of ['src', 'bin', 'piper', 'package.json', 'models.json']) fs.cpSync(path.join(SRC_ENGINE, f), path.join(ENGINE, f), {recursive: true});
  const pkg = fs.readFileSync(path.join(ENGINE, 'package.json'), 'utf8');
  if (pkg !== prevPkg || !fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion'))) {
    log('Installing Remotion (first run only)…');
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {cwd: ENGINE, stdio: 'inherit'});
    if (r.status !== 0) die('npm install failed');
  }
  // seed looks and brands that ship with the plugin (never overwrite the user's)
  const seed = path.join(SRC_ENGINE, '..', 'seed');
  if (fs.existsSync(seed)) {
    for (const l of fs.readdirSync(path.join(seed, 'looks'))) if (!fs.existsSync(path.join(LOOKS, l))) fs.cpSync(path.join(seed, 'looks', l), path.join(LOOKS, l), {recursive: true});
    for (const b of fs.readdirSync(path.join(seed, 'brands'))) if (!fs.existsSync(path.join(BRANDS, b))) fs.copyFileSync(path.join(seed, 'brands', b), path.join(BRANDS, b));
  }
  const appSrc = path.join(SRC_ENGINE, '..', 'app');
  if (fs.existsSync(appSrc)) { fs.rmSync(path.join(HOME, 'app'), {recursive: true, force: true}); fs.cpSync(appSrc, path.join(HOME, 'app'), {recursive: true}); }
  const def = path.join(BRANDS, 'default.json');
  if (!fs.existsSync(def)) writeJSON(def, {
    name: 'Default', handle: '@yourhandle', language: 'it',
    tone: 'Diretto, curioso, frasi brevi. Niente clickbait vuoto: ogni frase porta un fatto.',
    colors: {bg1: '#0B1020', bg2: '#1B2350', accent: '#FFD23F', text: '#FFFFFF', muted: '#A9B1D6'},
    font: 'Inter, "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif',
    voice: {voice: 'JBFqnCBsd6RMkjVDRZzb', instructions: 'Energico ma naturale, ritmo da social, pause brevi.'},
    sayVoice: 'Alice',
  });
  if (!fs.existsSync(path.join(HOME, '.env'))) fs.writeFileSync(path.join(HOME, '.env'), '# OPENROUTER_API_KEY=sk-or-...\n', {mode: 0o600});
  log(`✓ ReelStudio ready in ${HOME}`);
  log(KEY() ? '✓ OpenRouter key found' : `! No OpenRouter key: voice and images are off until the user runs  reelstudio key  (or adds it to ${path.join(HOME, '.env')})`);
}

// ---------- macOS launcher ----------
function installApp() {
  if (process.platform !== 'darwin') die('macOS only');
  const appDir = path.join(os.homedir(), 'Applications', 'ReelStudio.app');
  const mac = path.join(appDir, 'Contents', 'MacOS'), res = path.join(appDir, 'Contents', 'Resources');
  fs.mkdirSync(mac, {recursive: true}); fs.mkdirSync(res, {recursive: true});
  fs.writeFileSync(path.join(mac, 'ReelStudio'), `#!/bin/zsh -l\nexec "${process.execPath}" "${path.join(ENGINE, 'bin', 'rs.mjs')}" app >> "${path.join(HOME, 'app.log')}" 2>&1\n`, {mode: 0o755});
  fs.writeFileSync(path.join(appDir, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>ReelStudio</string><key>CFBundleDisplayName</key><string>ReelStudio</string>
<key>CFBundleIdentifier</key><string>local.reelstudio.app</string><key>CFBundleVersion</key><string>1</string>
<key>CFBundleExecutable</key><string>ReelStudio</string><key>CFBundleIconFile</key><string>icon</string>
<key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><false/>
</dict></plist>`);
  // icon: mascot on a cream rounded tile
  const mascot = path.join(HOME, 'app', 'public', 'mascot.png');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rsicon-'));
  const set = path.join(tmp, 'icon.iconset'); fs.mkdirSync(set);
  const base = path.join(tmp, 'base.png');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xFBF4EA:s=1024x1024', '-i', mascot, '-filter_complex',
    "[1]scale=800:800[m];[0][m]overlay=112:120,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(hypot(max(abs(X-512)-330,0),max(abs(Y-512)-330,0)),150),0,255)'", '-frames:v', '1', base]);
  for (const sz of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(sz), String(sz), base, '--out', path.join(set, `icon_${sz}x${sz}.png`)], {stdio: 'ignore'});
    execFileSync('sips', ['-z', String(sz * 2), String(sz * 2), base, '--out', path.join(set, `icon_${sz}x${sz}@2x.png`)], {stdio: 'ignore'});
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(res, 'icon.icns')]);
  fs.rmSync(tmp, {recursive: true, force: true});
  try { execFileSync('touch', [appDir]); } catch {}
  log('✓ ' + appDir);
}

// ---------- new ----------
function cmdNew(pos, flags) {
  const title = pos.join(' ');
  if (!title) die('usage: rs new "<topic>" [--brand default]');
  const slug = flags.slug || slugify(title);
  const d = path.join(REELS, slug);
  if (fs.existsSync(d)) die(`reel "${slug}" already exists`);
  const brand = flags.brand || 'default';
  if (!fs.existsSync(path.join(BRANDS, brand + '.json'))) die(`brand "${brand}" not found`);
  fs.mkdirSync(path.join(d, 'src'), {recursive: true});
  fs.mkdirSync(path.join(d, 'assets', 'img'), {recursive: true});
  writeJSON(path.join(d, 'reel.json'), {title, brand, scenes: []});
  log(slug);
}

// ---------- voice ----------
// Voice polish, applied to every TTS clip: trim the dead air TTS leaves at both ends and cap only the really long
// pauses inside (shorter ones are breathing room: cutting them makes the voice sound out of breath), clean low rumble,
// add a touch of presence, set an even level. Gentle on purpose: no heavy compression, which pumps up breath noise.
// The untouched clip stays in assets/vo/raw/, so `voice --repolish` can redo this for free.
const VOICE_POLISH = [
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06',
  'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2', 'areverse',
  'silenceremove=stop_periods=-1:stop_duration=0.65:stop_threshold=-50dB:stop_silence=0.45',
  'highpass=f=70', 'equalizer=f=3500:t=q:w=1:g=1.5',
  'acompressor=threshold=-16dB:ratio=1.6:attack=15:release=200:makeup=1',
  'loudnorm=I=-15:TP=-1.5:LRA=9', 'aresample=44100',
].join(',');
function polishVoice(raw, outMp3, flags = {}) {
  const af = flags['raw-voice'] ? 'aresample=44100' : VOICE_POLISH;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', af, '-ac', '1', '-b:a', '192k', outMp3]);
}
const rawClip = (outMp3) => {
  const dir = path.join(path.dirname(outMp3), 'raw'), id = path.basename(outMp3, '.mp3');
  return ['.wav', '.mp3'].map((e) => path.join(dir, id + e)).find((f) => fs.existsSync(f));
};
const PACE = 'Natural, conversational pace: relaxed, with normal breathing pauses between sentences; never rushed, never dragging.';
async function ttsScene(text, brand, m, outMp3, flags) {
  const model = flags.model || brand.voice?.model || m.tts[flags.tier || 'model'] || m.tts.model;
  if (flags.local) {
    const aiff = outMp3.replace(/\.mp3$/, '.aiff');
    execFileSync('say', ['-v', brand.sayVoice || 'Alice', '-o', aiff, text]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '44100', '-b:a', '192k', outMp3]);
    fs.rmSync(aiff);
    return 'macOS say';
  }
  if (!KEY()) die(`No OpenRouter key, so no real voice. The user sets it in their own Terminal with: reelstudio key (or OPENROUTER_API_KEY=… in ${path.join(HOME, '.env')}). The macOS draft voice is used only with --local, when the user asks for it.`);
  const body = {model, input: text, response_format: 'mp3'};
  // brand.voice.voices: {model: voice}. brand.voice.voice applies to brand.voice.model, or to ElevenLabs if no model is set (older brands)
  const bv = brand.voice || {};
  const brandVoice = bv.voices?.[model] || (bv.voice && (bv.model ? bv.model === model : model.startsWith('elevenlabs/')) ? bv.voice : '');
  const voice = flags.voice || brandVoice || m.tts.voices?.[model] || (model.startsWith('elevenlabs/') ? m.tts.default_voice : '');
  if (voice) body.voice = voice;
  const pace = bv.pace === 'free' ? '' : PACE;
  if (bv.instructions || pace) body.instructions = [bv.instructions, pace].filter(Boolean).join(' ');
  if (brand.voice?.speed) body.speed = brand.voice.speed;
  if (model.startsWith('google/')) {
    // Gemini TTS returns raw PCM only (16-bit, 24 kHz, mono): convert it to mp3
    body.response_format = 'pcm';
    const rawDir = path.join(path.dirname(outMp3), 'raw'), id = path.basename(outMp3, '.mp3');
    fs.mkdirSync(rawDir, {recursive: true});
    const pcm = path.join(rawDir, id + '.pcm'), wav = path.join(rawDir, id + '.wav');
    fs.writeFileSync(pcm, await orFetch('/audio/speech', body, {raw: true}));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, wav]);
    fs.rmSync(pcm);
    fs.rmSync(path.join(rawDir, id + '.mp3'), {force: true});
    polishVoice(wav, outMp3, flags);
    return model;
  }
  const rawDir = path.join(path.dirname(outMp3), 'raw'), id = path.basename(outMp3, '.mp3');
  fs.mkdirSync(rawDir, {recursive: true});
  const raw = path.join(rawDir, id + '.mp3');
  fs.writeFileSync(raw, await orFetch('/audio/speech', body, {raw: true}));
  fs.rmSync(path.join(rawDir, id + '.wav'), {force: true});
  polishVoice(raw, outMp3, flags);
  return model;
}

async function wordTimes(mp3, lang, m) {
  if (!KEY()) return null;
  for (const model of [m.stt.model, m.stt.fallback].filter(Boolean)) {
    try {
      const r = await orFetch('/audio/transcriptions', {
        model, language: lang, response_format: 'verbose_json', timestamp_granularities: ['word'],
        input_audio: {data: fs.readFileSync(mp3).toString('base64'), format: 'mp3'},
      });
      if (r.words?.length) return r.words.map((w) => ({text: (w.word ?? w.text).trim(), start: w.start, end: w.end}));
    } catch (e) { console.error(`  (timestamps via ${model} failed: ${e.message.slice(0, 120)})`); }
  }
  return null;
}

// Use the script's own words (correct spelling) and the STT timings when counts line up; otherwise spread by length.
function alignWords(script, stt, secs) {
  const words = script.split(/\s+/).filter(Boolean);
  if (stt && stt.length === words.length) return words.map((w, i) => ({text: w, start: stt[i].start, end: stt[i].end}));
  if (stt && stt.length) {
    const t0 = stt[0].start, t1 = stt[stt.length - 1].end;
    return spread(words, t0, t1);
  }
  return spread(words, 0.05, secs - 0.1);
}
function spread(words, t0, t1) {
  const w = words.map((x) => x.length + 2), tot = w.reduce((a, b) => a + b, 0);
  let t = t0;
  return words.map((x, i) => { const d = ((t1 - t0) * w[i]) / tot; const o = {text: x, start: t, end: t + d}; t += d; return o; });
}

async function cmdVoice(pos, flags) {
  const d = reelDir(pos[0]);
  const reel = readJSON(path.join(d, 'reel.json'));
  const {brand} = loadBrand(reel.brand);
  const m = models();
  if (!reel.scenes?.length) die('reel.json has no scenes');
  const only = flags.scene ? new Set(String(flags.scene).split(',')) : null;
  const old = readJSON(path.join(d, 'timeline.json'), {scenes: []});
  const vo = path.join(d, 'assets', 'vo');
  fs.mkdirSync(vo, {recursive: true});
  const scenes = [];
  let from = 0;
  for (const s of reel.scenes) {
    if (!s.id || !s.voiceover) die('every scene needs id and voiceover');
    const file = path.join(vo, s.id + '.mp3');
    const prev = old.scenes.find((x) => x.id === s.id);
    let words = prev?.words, secs, via = prev?.via;
    const stale = !fs.existsSync(file) || prev?.voiceover !== s.voiceover || (only && only.has(s.id) && !flags.repolish) || flags.force;
    const repolish = !stale && flags.repolish && (!only || only.has(s.id)) && rawClip(file);
    if (repolish) {
      // same take, polish redone (e.g. after an engine update): only the word timings are fetched again
      polishVoice(repolish, file, flags);
      secs = probeSeconds(file);
      words = alignWords(s.voiceover, await wordTimes(file, brand.language || 'it', m), secs);
      log(`  ${s.id}: ${secs.toFixed(2)}s re-polished`);
    } else if (stale) {
      via = await ttsScene(s.voiceover, brand, m, file, flags);
      secs = probeSeconds(file);
      words = alignWords(s.voiceover, await wordTimes(file, brand.language || 'it', m), secs);
      log(`  ${s.id}: ${secs.toFixed(2)}s via ${via}`);
    } else secs = probeSeconds(file);
    const hold = s.hold ?? 0.2;  // clips end with 0.2 s of air: about 0.45 s between scenes, like a sentence break
    const duration = Math.ceil((secs + hold) * FPS);
    scenes.push({id: s.id, from, duration, audio: `vo/${s.id}.mp3`, voiceover: s.voiceover, via,
      words: words.map((w) => ({text: w.text, start: Math.round(w.start * FPS), end: Math.max(Math.round(w.end * FPS), Math.round(w.start * FPS) + 2)}))});
    from += duration;
  }
  writeJSON(path.join(d, 'timeline.json'), {fps: FPS, width: 1080, height: 1920, total: from, scenes});
  log(`✓ timeline: ${scenes.length} scenes, ${(from / FPS).toFixed(1)}s`);
  const draft = scenes.filter((s) => s.via === 'macOS say').map((s) => s.id);
  if (draft.length) log(`! draft macOS voice in: ${draft.join(', ')}. render refuses it unless --draft-voice; redo with: voice ${pos[0]} --scene ${draft.join(',')} --force`);
}

// ---------- image ----------
const toDataUrl = (f) => `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`;

async function generateImage({prompt, out, model, look, refs = [], flags = {}}) {
  const m = models();
  let fullPrompt = prompt;
  const refFiles = [...refs];
  if (look && !flags['no-style']) {
    if (look.imageStyle) fullPrompt += `\n\nArt direction (follow strictly): ${look.imageStyle}`;
    if (flags.mascot && look.mascot) {
      refFiles.unshift(path.join(look.dir, look.mascot));
      fullPrompt += `\n\nThe first reference image is the mascot character${look.mascotDescription ? ` (${look.mascotDescription})` : ''}. Keep it exactly on-model: same face, markings, line style and accessories.`;
    }
    for (const r of look.references || []) refFiles.push(path.join(look.dir, r));
  }
  const max = m.image.maxRefs?.[model] ?? 5;
  const used = refFiles.filter((f) => fs.existsSync(f)).slice(0, max);
  const body = {model, prompt: fullPrompt, n: 1, aspect_ratio: flags.aspect || '9:16', output_format: 'png', ...(m.image.params?.[model] || {})};
  if (used.length) body.input_references = used.map((f) => ({type: 'image_url', image_url: {url: toDataUrl(f)}}));
  if (flags.quality) body.quality = flags.quality;
  // output resolution tier (1K | 2K | 4K): needed for images the camera zooms into
  const res = flags.res || m.image.resolution?.[model];
  if (res) body.resolution = String(res).toUpperCase();
  if (flags.transparent) body.background = 'transparent';
  log(`  generating with ${model}${used.length ? ` + ${used.length} reference image(s)` : ''}…`);
  let r;
  try { r = await orFetch('/images', body); } catch (e) {
    // some models reject optional fields ("does not support: output_format, background"): drop them and retry once
    const bad = String(e.message).match(/does not support:\s*([a-z_,\s]+)/i)?.[1];
    if (!bad) throw e;
    for (const k of bad.split(/[,\s]+/).filter(Boolean)) delete body[k];
    log(`  retrying without: ${bad.trim()}`);
    r = await orFetch('/images', body);
  }
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) die('no image returned: ' + JSON.stringify(r).slice(0, 300));
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  log(`✓ ${out} via ${model}${r.usage?.cost ? ` ($${r.usage.cost})` : ''}`);
}

function pickImageModel(flags) {
  const m = models();
  if (flags.model) return flags.model;
  if (flags.hero) return m.image.hero;
  if (flags.world) return m.image.world;
  return m.image[flags.tier || 'model'] || m.image.model;
}

async function cmdImage(pos, flags) {
  const d = reelDir(pos[0]);
  const name = pos[1], prompt = pos.slice(2).join(' ');
  if (!name || !prompt) die('usage: rs image <reel> <name> "<prompt>" [--hero] [--mascot] [--ref file] [--no-style]');
  const reel = readJSON(path.join(d, 'reel.json'));
  const {look} = loadBrand(reel.brand);
  const refs = flags.ref ? String(flags.ref).split(',').map((f) => path.isAbsolute(f) ? f : path.join(d, 'assets', f)) : [];
  await generateImage({prompt, out: path.join(d, 'assets', 'img', name + '.png'), model: pickImageModel(flags), look, refs, flags});
}

/** Generate an image for a look itself (sample frames, mascot poses). */
async function cmdLookImage(pos, flags) {
  const look = loadLook(pos[0]);
  if (!look) die('look not found: ' + pos[0]);
  const name = pos[1], prompt = pos.slice(2).join(' ');
  if (!name || !prompt) die('usage: rs look-image <look> <name> "<prompt>" [--mascot] [--hero]');
  await generateImage({prompt, out: path.join(look.dir, name + '.png'), model: pickImageModel(flags), look, flags});
}

// ---------- bundle / frames / render ----------
async function bundleReel(d) {
  const {bundle} = await import(path.join(ENGINE, 'node_modules/@remotion/bundler/dist/index.js'));
  if (!fs.existsSync(path.join(d, 'src', 'Reel.tsx'))) die('src/Reel.tsx missing');
  return bundle({
    entryPoint: path.join(ENGINE, 'src', 'index.ts'),
    publicDir: path.join(d, 'assets'),
    // webpack's persistent cache can serve a stale @rs library after an update (React error #130): always rebuild
    enableCaching: false,
    webpackOverride: (c) => ({
      ...c,
      // RS_DEV=1 rs frames …  → readable React errors instead of minified ones
      ...(process.env.RS_DEV ? {mode: 'development', optimization: {...c.optimization, minimize: false}} : {}),
      resolve: {
        ...c.resolve,
        alias: {...(c.resolve?.alias || {}), '@reel': path.join(d, 'src'), '@rs': path.join(ENGINE, 'src', 'lib')},
        modules: [path.join(ENGINE, 'node_modules'), 'node_modules'],
      },
    }),
  });
}

async function prep(slug) {
  const d = reelDir(slug);
  // Remotion caches its headless Chrome under <cwd>/node_modules/.remotion: keep it inside the engine, not wherever rs was launched
  process.chdir(ENGINE);
  const timeline = readJSON(path.join(d, 'timeline.json'));
  const reel = readJSON(path.join(d, 'reel.json'));
  const brand = await brandProps(d, reel.brand);
  const R = await import(path.join(ENGINE, 'node_modules/@remotion/renderer/dist/index.js'));
  const serveUrl = await bundleReel(d);
  const credits = readJSON(path.join(d, 'assets', 'credits.json'), []);
  const inputProps = {timeline, brand, reel: {...reel, credits}};
  return {d, timeline, reel, R, serveUrl, inputProps};
}

async function cmdFrames(pos, flags) {
  const {d, timeline, R, serveUrl, inputProps} = await prep(pos[0]);
  const comp = await R.selectComposition({serveUrl, id: 'Reel', inputProps});
  const out = path.join(d, 'frames');
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out, {recursive: true});
  const at = flags.at ? [Number(flags.at)] : null;
  const shots = at ? at.map((f) => ({name: 'f' + f, frame: f})) :
    timeline.scenes.flatMap((s) => [
      {name: `${s.id}-a`, frame: s.from + Math.min(18, Math.floor(s.duration / 3))},
      {name: `${s.id}-b`, frame: s.from + Math.floor(s.duration * 0.8)},
    ]);
  for (const s of shots) {
    await R.renderStill({composition: comp, serveUrl, inputProps, frame: s.frame, output: path.join(out, s.name + '.png'), scale: 0.5});
  }
  log(`✓ ${shots.length} frames in ${out} (half-res). Look at every one.`);
  if (flags.strip && !at) {
    // one contact sheet per scene: 5 moments side by side, to judge camera moves and timing
    const tmp = path.join(out, '.strip');
    fs.mkdirSync(tmp, {recursive: true});
    for (const s of timeline.scenes) {
      const fr = [0, 0.15, 0.35, 0.6, 0.9].map((t) => s.from + Math.min(s.duration - 1, Math.round(t * s.duration)));
      const files = [];
      for (const [i, frame] of fr.entries()) {
        const f = path.join(tmp, `${s.id}-${i}.png`);
        await R.renderStill({composition: comp, serveUrl, inputProps, frame, output: f, scale: 0.25});
        files.push(f);
      }
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `hstack=inputs=${files.length}`, path.join(out, `${s.id}-strip.png`)]);
    }
    fs.rmSync(tmp, {recursive: true, force: true});
    log(`✓ ${timeline.scenes.length} strips (<id>-strip.png: 0%, 15%, 35%, 60%, 90% of each scene) to judge the motion.`);
  }
}

// ---------- real photos (Wikimedia Commons: public domain and free licenses only) ----------
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const COMMONS_UA = 'ReelStudio/0.5 (local video tool; https://github.com/luke30001/reelstudio-opencode)';
const FREE = /public domain|^pd|cc0|cc[ -]by|attribution|gfdl|no restrictions/i;
const strip = (h = '') => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
async function commons(params) {
  const u = COMMONS + '?' + new URLSearchParams({format: 'json', origin: '*', ...params});
  const r = await fetch(u, {headers: {'User-Agent': COMMONS_UA}});
  if (!r.ok) throw new Error('Wikimedia Commons ' + r.status);
  return r.json();
}
function photoInfo(p) {
  const ii = p.imageinfo?.[0] || {}, em = ii.extmetadata || {};
  let author = strip(em.Artist?.value);
  if (!author || /unknown author/i.test(author)) author = /NARA/.test(p.title) ? 'U.S. National Archives (NARA)' : /LC-|Library of Congress/i.test(p.title + strip(em.Credit?.value)) ? 'Library of Congress' : 'autore sconosciuto';
  return {title: p.title, author: author.slice(0, 160), width: ii.width, height: ii.height, mime: ii.mime, url: ii.url, thumb: ii.thumburl, page: ii.descriptionurl,
    license: strip(em.LicenseShortName?.value), licenseUrl: strip(em.LicenseUrl?.value),
    credit: strip(em.Credit?.value).slice(0, 200), date: strip(em.DateTimeOriginal?.value).replace(/date QS:.*$/, '').trim().slice(0, 60), description: strip(em.ImageDescription?.value).slice(0, 240)};
}
/**
 * rs photo <reel> search "<query>" [--limit 12]   → numbered results + frames/photos-sheet.png (contact sheet, row by row)
 * rs photo <reel> get <n | "File:Title.jpg"> <name> → assets/img/<name>.jpg (up to 3000 px) + credit in assets/credits.json
 */
async function cmdPhoto(pos, flags) {
  const d = reelDir(pos[0]);
  const sub = pos[1];
  const dir = path.join(d, 'assets', 'photos');
  fs.mkdirSync(dir, {recursive: true});
  if (sub === 'search') {
    const q = pos.slice(2).join(' ');
    if (!q) die('usage: rs photo <reel> search "<query>" [--limit 12]');
    const limit = Math.min(30, Number(flags.limit) || 12);
    const r = await commons({action: 'query', generator: 'search', gsrsearch: q + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: String(limit * 2),
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '400'});
    const pages = Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index).map(photoInfo)
      .filter((x) => /image\/(jpeg|png|tiff|webp)/.test(x.mime || '') && FREE.test(x.license || '')).slice(0, limit);
    if (!pages.length) die('no free-licensed photos found: try other words (English often works better), a year, a place');
    writeJSON(path.join(dir, 'search.json'), {query: q, results: pages});
    const thumbs = path.join(dir, '.thumbs');
    fs.rmSync(thumbs, {recursive: true, force: true});
    fs.mkdirSync(thumbs, {recursive: true});
    const files = [];
    for (const [i, x] of pages.entries()) {
      log(`${String(i + 1).padStart(2)}. ${x.title.replace(/^File:/, '')}  ${x.width}x${x.height}  ${x.license}${x.date ? '  ' + x.date : ''}${x.author ? '  — ' + x.author.slice(0, 60) : ''}`);
      try {
        const t = path.join(thumbs, `${String(i).padStart(2, '0')}.jpg`);
        fs.writeFileSync(t, Buffer.from(await (await fetch(x.thumb, {headers: {'User-Agent': COMMONS_UA}})).arrayBuffer()));
        files.push(t);
      } catch {}
    }
    // contact sheet: 4 per row, 300x300 cells, in result order
    const sheet = path.join(d, 'frames', 'photos-sheet.png');
    fs.mkdirSync(path.dirname(sheet), {recursive: true});
    const cols = 4, rows = Math.ceil(files.length / cols);
    const inputs = files.flatMap((f) => ['-i', f]);
    const cells = files.map((_, i) => `[${i}:v]scale=300:300:force_original_aspect_ratio=decrease,pad=300:300:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1[c${i}]`);
    const layout = files.map((_, i) => `${(i % cols) * 300}_${Math.floor(i / cols) * 300}`).join('|');
    try {
      const graph = files.length === 1 ? cells[0].replace(/\[c0\]$/, '') : `${cells.join(';')};${files.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=white`;
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', sheet]);
      log(`✓ contact sheet ${sheet} (${cols} per row, ${rows} rows, same order as the list). Look at it, then: rs photo ${pos[0]} get <n> <name>`);
    } catch (e) { log('  (contact sheet failed: ' + e.message.split('\n')[0] + ')'); }
    return;
  }
  if (sub === 'get') {
    const which = pos[2], name = pos[3];
    if (!which || !name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) die('usage: rs photo <reel> get <n | "File:Title.jpg"> <name>');
    let title = which;
    if (/^\d+$/.test(which)) {
      const s = readJSON(path.join(dir, 'search.json'), null);
      if (!s) die('run rs photo <reel> search first');
      title = s.results[Number(which) - 1]?.title || die('no result #' + which);
    }
    if (!/^File:/i.test(title)) title = 'File:' + title;
    const width = Math.min(Number(flags.width) || 3000, 4000);
    const r = await commons({action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(width)});
    const p = Object.values(r.query?.pages || {})[0];
    if (!p?.imageinfo) die('not found on Wikimedia Commons: ' + title);
    const x = photoInfo(p);
    if (!FREE.test(x.license || '')) die(`license "${x.license}" is not clearly free: pick another photo`);
    const src = x.width > width ? p.imageinfo[0].thumburl : x.url; // thumbs are jpg even for tiff originals
    const buf = Buffer.from(await (await fetch(src, {headers: {'User-Agent': COMMONS_UA}})).arrayBuffer());
    const out = path.join(d, 'assets', 'img', name + '.jpg');
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const tmp = out + '.src';
    fs.writeFileSync(tmp, buf);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-q:v', '2', out]); // normalize to jpg
    fs.rmSync(tmp);
    const dims = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', out]).toString().trim();
    const credits = readJSON(path.join(d, 'assets', 'credits.json'), []).filter((c) => c.file !== `img/${name}.jpg`);
    credits.push({file: `img/${name}.jpg`, title: x.title, author: x.author || x.credit, date: x.date, license: x.license, licenseUrl: x.licenseUrl, source: x.page});
    writeJSON(path.join(d, 'assets', 'credits.json'), credits);
    log(`✓ img/${name}.jpg  ${dims}  ${x.license}${x.author ? '  — ' + x.author.slice(0, 80) : ''}\n  credit saved in assets/credits.json (show it with <Credit file="img/${name}.jpg" />)`);
    return;
  }
  die('usage: rs photo <reel> search "<query>" | rs photo <reel> get <n> <name>');
}

/** Download Lucide icons (ISC license) as SVG into the reel: assets/icons/<name>.svg, used with <SvgIcon name=…>. */
async function cmdIcon(pos) {
  const d = reelDir(pos[0]);
  const names = pos.slice(1);
  if (!names.length) die('usage: rs icon <reel> <name> [name…]   (names from https://lucide.dev/icons, e.g. map-pin coffee train)');
  const dir = path.join(d, 'assets', 'icons');
  fs.mkdirSync(dir, {recursive: true});
  for (const n of names) {
    if (!/^[a-z0-9-]+$/.test(n)) die('bad icon name: ' + n);
    const r = await fetch(`https://cdn.jsdelivr.net/npm/lucide-static@1.75.0/icons/${n}.svg`);
    if (!r.ok) { console.error(`✗ ${n}: not found (see https://lucide.dev/icons)`); continue; }
    fs.writeFileSync(path.join(dir, n + '.svg'), await r.text());
    log(`✓ icons/${n}.svg`);
  }
}

async function cmdRender(pos, flags = {}, onProgress = null) {
  const tl = readJSON(path.join(reelDir(pos[0]), 'timeline.json'), {scenes: []});
  const draft = tl.scenes.filter((s) => s.via === 'macOS say').map((s) => s.id);
  if (draft.length && !flags['draft-voice']) die(`scenes ${draft.join(', ')} use the robotic macOS draft voice. Regenerate them: voice ${pos[0]} --scene ${draft.join(',')} --force (needs the OpenRouter key and network access). Only if the user explicitly wants a draft: render --draft-voice`);
  const {d, R, serveUrl, inputProps} = await prep(pos[0]);
  const comp = await R.selectComposition({serveUrl, id: 'Reel', inputProps});
  const outDir = path.join(d, 'out');
  fs.mkdirSync(outDir, {recursive: true});
  const n = fs.readdirSync(outDir).filter((f) => /^v\d+\.mp4$/.test(f)).length + 1;
  const file = path.join(outDir, `v${n}.mp4`);
  // playback speed: --speed 1.5 (or "speed" in reel.json). Voice keeps its pitch; every frame is kept (30 fps × speed, max 60).
  const speed = Number(flags.speed ?? inputProps.reel.speed ?? 1);
  if (!(speed >= 0.5 && speed <= 2)) die('--speed must be between 0.5 and 2');
  const raw = path.join(outDir, `.v${n}-1x.mp4`);
  let last = -1;
  await R.renderMedia({
    composition: comp, serveUrl, inputProps, codec: 'h264', outputLocation: raw, crf: 18, audioBitrate: '192k',
    onProgress: ({progress}) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; process.stdout.write(`  ${p * 10}%\r`); if (onProgress) onProgress(progress); } },
  });
  // final audio: social loudness (-14 LUFS, peaks under -1 dB); with --speed also the faster cut
  const loud = 'loudnorm=I=-14:TP=-1:LRA=9,aresample=48000';
  if (speed !== 1) {
    const fps = Math.min(60, Math.round(30 * speed));
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-filter_complex', `[0:v]setpts=PTS/${speed},fps=${fps}[v];[0:a]atempo=${speed},${loud}[a]`,
      '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '192k', file]);
    log(`  speed ${speed}× → ${(probeSeconds(file)).toFixed(1)}s at ${fps} fps`);
  } else {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', loud, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', file]);
  }
  fs.rmSync(raw);
  fs.copyFileSync(file, path.join(d, 'final.mp4'));
  const coverComp = (await R.getCompositions(serveUrl, {inputProps})).find((c) => c.id === 'Cover');
  await R.renderStill({composition: coverComp || comp, serveUrl, inputProps, frame: coverComp ? 0 : (inputProps.reel.coverFrame ?? 20), output: path.join(d, 'cover.png')});
  log(`✓ ${file}\n✓ ${path.join(d, 'final.mp4')}\n✓ ${path.join(d, 'cover.png')}`);
}

// ---------- info ----------
async function cmdModels() {
  const m = models();
  log('Current picks:');
  for (const k of ['tts', 'image', 'stt']) log(`  ${k.padEnd(5)} ${m[k].model}   — ${m[k]._why}`);
  log('\nLive OpenRouter catalog (compare with https://artificialanalysis.ai arenas before switching):');
  for (const [label, q] of [['speech', 'speech'], ['image', 'image'], ['transcription', 'transcription']]) {
    const r = await (await fetch(`${OR}/models?output_modalities=${q}`)).json();
    const list = r.data.filter((x) => x.architecture.output_modalities.includes(q)).sort((a, b) => b.created - a.created);
    log(`\n[${label}] ${list.length} models, newest first:`);
    for (const x of list.slice(0, 25)) {
      const p = Object.entries(x.pricing).filter(([, v]) => v !== '0').map(([k, v]) => `${k}=${v}`).join(' ');
      log(`  ${x.id.padEnd(44)} ${new Date(x.created * 1000).toISOString().slice(0, 10)}  ${p}`);
    }
  }
}

function cmdList() {
  if (!fs.existsSync(REELS)) die('run `rs setup` first');
  for (const s of fs.readdirSync(REELS).filter((x) => !x.startsWith('.')).sort()) {
    const d = path.join(REELS, s);
    const r = readJSON(path.join(d, 'reel.json'), {});
    const t = readJSON(path.join(d, 'timeline.json'), null);
    log(`${s.padEnd(40)} ${(r.brand || '').padEnd(10)} ${t ? (t.total / FPS).toFixed(1) + 's' : 'no voice'}  ${fs.existsSync(path.join(d, 'final.mp4')) ? '✓ rendered' : ''}`);
  }
  log('\nBrands: ' + fs.readdirSync(BRANDS).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).join(', '));
  log('Looks: ' + (fs.existsSync(LOOKS) ? fs.readdirSync(LOOKS).join(', ') : ''));
}

// ---------- main ----------
const [cmd, ...rest] = process.argv.slice(2);
const {pos, flags} = args(rest);
const needEngine = ['frames', 'render'];
if (needEngine.includes(cmd) && !fs.existsSync(path.join(ENGINE, 'node_modules', 'remotion'))) die('run `rs setup` first');
const table = {setup, new: () => cmdNew(pos, flags), voice: () => cmdVoice(pos, flags), image: () => cmdImage(pos, flags),
  frames: () => cmdFrames(pos, flags), render: () => cmdRender(pos, flags), models: cmdModels, list: cmdList, icon: () => cmdIcon(pos), photo: () => cmdPhoto(pos, flags),
  'look-image': () => cmdLookImage(pos, flags), 'install-app': installApp, brand: async () => log(JSON.stringify(await brandProps(reelDir(pos[0]), readJSON(path.join(reelDir(pos[0]), 'reel.json')).brand), null, 2)),
  app: () => import(path.join(HOME, 'app', 'server.mjs')),
  lesson: async () => (await import('./lesson.mjs')).cmdLesson(pos, flags, {log, die, reelDir, slugify, readJSON, writeJSON, models, orFetch, commons, photoInfo, FREE, COMMONS_UA,
    polishVoice, probeSeconds, cmdRender, FPS, HOME, REELS, BRANDS, ENGINE_SRC: fs.existsSync(path.join(ENGINE, 'piper')) ? ENGINE : SRC_ENGINE})};
if (!table[cmd]) {
  log(`rs — ReelStudio
  setup                          install engine into ${HOME}
  new "<topic>" [--brand b]      create a reel, prints its name
  voice <reel> [--scene id] [--voice Charon] [--repolish] [--raw-voice] [--tier eleven|native|budget] [--force] [--local = macOS draft voice, only on request]
  image <reel> <name> "<prompt>" [--hero] [--world] [--res 2K|4K] [--aspect 1:1] [--mascot] [--ref img/x.png] [--no-style]
  look-image <look> <name> "<prompt>" [--mascot] [--hero]
  app                            start the ReelStudio app (http://localhost:4748)
  install-app                    create ~/Applications/ReelStudio.app
  icon <reel> <name> [name…]     download Lucide SVG icons into <reel>/assets/icons
  photo <reel> search "<query>"  find real photos on Wikimedia Commons (free licenses) + contact sheet
  photo <reel> get <n> <name>    download photo n as assets/img/<name>.jpg, credit in assets/credits.json
  frames <reel> [--at frame] [--strip]   check stills to <reel>/frames (--strip: motion sheet per scene)
  render <reel> [--speed 1.5]    final.mp4 + cover.png (speed: faster playback, voice pitch kept)
  lesson make <lesson.md> [--minutes 4] [--brand b]   lesson markdown → long film (Piper voice, real photos, SVG icons)
  models                         current picks + live OpenRouter catalog
  list                           reels and brands`);
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(table[cmd]()).catch((e) => die(e.stack || e.message));
