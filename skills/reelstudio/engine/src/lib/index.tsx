// ReelStudio component library. Reels import from '@rs'.
// Canvas 1080x1920. Safe zones: content in y 200..1180, captions ~1240..1440, keep y>1500 empty (Instagram UI).
import React, {createContext, useContext} from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing, delayRender, continueRender} from 'remotion';
import {loadFont} from '@remotion/fonts';

export {AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing};

export type Word = {text: string; start: number; end: number};
export type TScene = {id: string; from: number; duration: number; audio: string; voiceover: string; words: Word[]};
export type Timeline = {fps: number; width: number; height: number; total: number; scenes: TScene[]};
export type Brand = {
  name?: string; handle?: string; font?: string;
  /** Headline font (the look's `display` font), e.g. a serif. Falls back to `font`. */
  display?: string;
  colors: {bg1: string; bg2: string; accent: string; text: string; muted: string; card?: string};
  captions?: 'stroke' | 'pill' | 'clean';
  background?: 'gradient' | 'paper' | 'solid' | 'editorial';
  mascot?: string;
  fontFiles?: {family: string; weight: string; src: string}[];
};
export function isLight(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}
const shadowFor = (b: Brand) => (isLight(b.colors.bg1) ? 'none' : '0 2px 4px rgba(0,0,0,.85), 0 6px 34px rgba(0,0,0,.75), 0 0 80px rgba(0,0,0,.5)');
export type ReelProps = {timeline: Timeline; brand: Brand; reel: any};

export type CreditEntry = {file: string; title?: string; author?: string; date?: string; license?: string; source?: string};
const CreditsCtx = createContext<CreditEntry[]>([]);
const Ctx = createContext<{brand: Brand; scene?: TScene; still?: boolean}>({brand: {colors: {bg1: '#000', bg2: '#111', accent: '#ff0', text: '#fff', muted: '#aaa'}}});
export const useBrand = () => useContext(Ctx).brand;
export const useScene = () => useContext(Ctx).scene!;
/** Current frame, or a large number on a Cover still so every animation is finished. */
export const useF = () => { const still = useContext(Ctx).still; const f = useCurrentFrame(); return still ? 9999 : f; };
export const SAFE = {top: 200, bottom: 1180, side: 80, captionY: 1250};

/** Pick a font size so `text` fits in `lines` lines of `width` px. */
export function fitFont(text: string, {width = 920, lines = 3, max = 120, min = 44, charW = 0.56} = {}) {
  const len = Math.max(1, text.length);
  for (let fs = max; fs >= min; fs -= 2) {
    const perLine = Math.floor(width / (fs * charW));
    const words = text.split(/\s+/);
    let l = 1, cur = 0;
    for (const w of words) {
      if (cur && cur + 1 + w.length > perLine) { l++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length;
      if (w.length > perLine) l += Math.ceil(w.length / perLine) - 1;
    }
    if (l <= lines) return fs;
  }
  return min;
}

/** Spring 0→1 starting at `delay` frames. */
export function usePop(delay = 0, damping = 14) {
  const f = useF();
  const {fps} = useVideoConfig();
  return spring({frame: f - delay, fps, config: {damping, mass: 0.8}});
}

/** Rich text: wrap words in *stars* to color them with the accent. */
export const Rich: React.FC<{text: string; accent?: string}> = ({text, accent}) => {
  const b = useBrand();
  const parts = text.split(/(\*[^*]+\*)/g);
  return <>{parts.map((p, i) => p.startsWith('*') ? <span key={i} style={{color: accent || b.colors.accent}}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>)}</>;
};
const plain = (t: string) => t.replace(/\*/g, '');

// ---------- frame ----------
export const GradientBG: React.FC<{a?: string; b?: string}> = ({a, b}) => {
  const br = useBrand();
  const f = useF();
  const ang = 160 + Math.sin(f / 90) * 20;
  const x = 50 + Math.sin(f / 70) * 25, y = 30 + Math.cos(f / 85) * 15;
  return (
    <AbsoluteFill style={{background: `linear-gradient(${ang}deg, ${a || br.colors.bg1}, ${b || br.colors.bg2})`}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${x}% ${y}%, ${br.colors.accent}33 0%, transparent 45%)`}} />
      <AbsoluteFill style={{opacity: 0.07, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '36px 36px'}} />
    </AbsoluteFill>
  );
};

/** Warm paper: flat brand color, soft vignette, fine grain, faint ruled lines. */
export const PaperBG: React.FC = () => {
  const b = useBrand();
  const f = useF();
  return (
    <AbsoluteFill style={{background: b.colors.bg1}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${50 + Math.sin(f / 80) * 10}% 35%, ${b.colors.bg2} 0%, transparent 70%)`}} />
      <AbsoluteFill style={{opacity: 0.35, backgroundImage: `repeating-linear-gradient(0deg, transparent 0 63px, ${b.colors.muted}22 63px 64px)`}} />
      <AbsoluteFill style={{opacity: 0.18, backgroundImage: 'radial-gradient(rgba(0,0,0,.35) 0.6px, transparent 0.8px)', backgroundSize: '5px 5px'}} />
    </AbsoluteFill>
  );
};

/** Editorial: soft vertical wash bg1 -> bg2, faint grain. Calm backdrop for the camera world and headlines. */
export const EditorialBG: React.FC = () => {
  const b = useBrand();
  return (
    <AbsoluteFill style={{background: `linear-gradient(180deg, ${b.colors.bg1} 0%, ${b.colors.bg1} 30%, ${b.colors.bg2} 100%)`}}>
      <AbsoluteFill style={{opacity: 0.12, backgroundImage: 'radial-gradient(rgba(0,0,0,.35) 0.6px, transparent 0.8px)', backgroundSize: '5px 5px'}} />
    </AbsoluteFill>
  );
};

/** Background chosen by the look: paper | gradient | solid | editorial. */
export const BrandBG: React.FC = () => {
  const b = useBrand();
  if (b.background === 'editorial') return <EditorialBG />;
  if (b.background === 'paper') return <PaperBG />;
  if (b.background === 'solid') return <AbsoluteFill style={{background: b.colors.bg1}} />;
  return <GradientBG />;
};

/** The look's mascot. pos: 'corner' (small, bottom-right of content), 'center' (hero), 'peek' (from the right edge). */
export const Mascot: React.FC<{src?: string; pos?: 'corner' | 'center' | 'peek'; size?: number; delay?: number}> = ({src, pos = 'corner', size, delay = 4}) => {
  const b = useBrand();
  const f = useF();
  const p = usePop(delay, 11);
  const img = src || b.mascot;
  if (!img) return null;
  const bob = Math.sin(f / 14) * 8;
  const sz = size || (pos === 'center' ? 620 : pos === 'peek' ? 420 : 300);
  const style: React.CSSProperties =
    pos === 'center' ? {left: (1080 - sz) / 2, top: 360} :
    pos === 'peek' ? {left: 1080 - sz * 0.72 + (1 - p) * sz, top: SAFE.bottom - sz - 10} :
    {left: 1080 - 60 - sz, top: SAFE.bottom - sz + 40};
  return (
    // multiply on light backgrounds: white fills of an ink-drawn mascot blend into the paper instead of showing a white box
    // (set on the outer layer: an inner blend would be isolated by this layer's transform/opacity)
    <AbsoluteFill style={{...style, right: 'auto', bottom: 'auto', width: sz, height: sz, transform: `translateY(${bob + (1 - p) * 80}px) rotate(${Math.sin(f / 20) * 2}deg)`, opacity: p, mixBlendMode: isLight(b.colors.bg1) ? 'multiply' : 'normal'}}>
      <Img src={staticFile(img)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
    </AbsoluteFill>
  );
};

/** Full-bleed image with slow Ken Burns zoom and a dark gradient for legibility. */
export const ImageBG: React.FC<{src: string; dim?: number; zoom?: [number, number]; pan?: number}> = ({src, dim = 0.45, zoom = [1.05, 1.18], pan = 30}) => {
  const f = useF();
  const s = useScene();
  const d = s?.duration || 150;
  const z = interpolate(f, [0, d], zoom, {extrapolateRight: 'clamp'});
  const x = interpolate(f, [0, d], [0, -pan], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z}) translateX(${x}px)`}} />
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.6}) 0%, rgba(0,0,0,${dim * 0.3}) 40%, rgba(0,0,0,${dim + 0.25}) 100%)`}} />
    </AbsoluteFill>
  );
};

/** Content box inside the safe zone. align: 'center' | 'top'. */
export const Stage: React.FC<{children: React.ReactNode; align?: 'center' | 'top'; gap?: number}> = ({children, align = 'center', gap = 36}) => (
  <AbsoluteFill style={{top: SAFE.top, height: SAFE.bottom - SAFE.top, left: SAFE.side, right: SAFE.side, width: 'auto', display: 'flex', flexDirection: 'column', justifyContent: align === 'center' ? 'center' : 'flex-start', gap}}>
    {children}
  </AbsoluteFill>
);

// ---------- scene building blocks ----------
export const Kicker: React.FC<{text: string; delay?: number}> = ({text, delay = 0}) => {
  const b = useBrand();
  const p = usePop(delay);
  return (
    <div style={{alignSelf: 'flex-start', padding: '12px 26px', borderRadius: 999, background: b.colors.accent, color: isLight(b.colors.accent) ? b.colors.bg1 : '#fff', fontWeight: 800, fontSize: 38, letterSpacing: 2, textTransform: 'uppercase', transform: `scale(${p})`, transformOrigin: 'left center'}}>
      {text}
    </div>
  );
};

/** Big headline, words fly in one by one. Use *word* for accent. */
export const Title: React.FC<{text: string; kicker?: string; size?: number; lines?: number; delay?: number; align?: 'left' | 'center'}> = ({text, kicker, size, lines = 4, delay = 0, align = 'left'}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const fs = size || fitFont(plain(text), {lines, max: 132, min: 56});
  const tokens = text.split(/(\s+)/);
  let inStar = false, wi = 0;
  return (
    <Stage>
      {kicker ? <Kicker text={kicker} delay={delay} /> : null}
      <div style={{fontSize: fs, lineHeight: 1.05, fontWeight: 900, color: b.colors.text, letterSpacing: -1.5, textAlign: align, textShadow: shadowFor(b)}}>
        {tokens.map((t, i) => {
          if (/^\s+$/.test(t)) return <span key={i}> </span>;
          const startStar = t.startsWith('*');
          if (startStar) inStar = true;
          const accent = inStar;
          if (t.endsWith('*')) inStar = false;
          const p = spring({frame: f - delay - 4 - wi++ * 3, fps, config: {damping: 13}});
          return <span key={i} style={{display: 'inline-block', color: accent ? b.colors.accent : undefined, opacity: p, transform: `translateY(${(1 - p) * 40}px)`}}>{t.replace(/\*/g, '')}</span>;
        })}
      </div>
    </Stage>
  );
};

/** List that reveals items spread across the scene (or at given frames). */
export const Bullets: React.FC<{title?: string; items: string[]; at?: number[]; numbered?: boolean}> = ({title, items, at, numbered}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const s = useScene();
  const d = s?.duration || 150;
  const times = at || items.map((_, i) => Math.round(8 + (i * (d * 0.75)) / items.length));
  const longest = items.reduce((a, x) => (x.length > a.length ? x : a), '');
  const fs = Math.min(64, fitFont(plain(longest), {width: 800, lines: 2, max: 64, min: 40}));
  return (
    <Stage gap={30}>
      {title ? <div style={{fontSize: fitFont(plain(title), {lines: 2, max: 84, min: 50}), fontWeight: 900, color: b.colors.text, marginBottom: 12}}><Rich text={title} /></div> : null}
      {items.map((it, i) => {
        const p = spring({frame: f - times[i], fps, config: {damping: 14}});
        const active = f >= times[i] && (i === items.length - 1 || f < times[i + 1]);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, opacity: p * (active ? 1 : 0.55) + (1 - p) * 0, transform: `translateX(${(1 - p) * -80}px)`}}>
            <div style={{flex: '0 0 auto', width: 78, height: 78, borderRadius: 22, background: active ? b.colors.accent : (isLight(b.colors.bg1) ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.12)'), color: active ? (isLight(b.colors.accent) ? b.colors.bg1 : '#fff') : b.colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900}}>
              {numbered ? i + 1 : '✓'}
            </div>
            <div style={{fontSize: fs, fontWeight: 750, color: b.colors.text, lineHeight: 1.12}}><Rich text={it} /></div>
          </div>
        );
      })}
    </Stage>
  );
};

/** Animated count-up number with a label. */
export const BigStat: React.FC<{value: number; prefix?: string; suffix?: string; label: string; decimals?: number; kicker?: string}> = ({value, prefix = '', suffix = '', label, decimals = 0, kicker}) => {
  const b = useBrand();
  const f = useF();
  const v = interpolate(f, [6, 45], [0, value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const txt = prefix + v.toLocaleString('it-IT', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) + suffix;
  const p = usePop(40);
  const fsNum = fitFont(prefix + value.toLocaleString('it-IT') + suffix + '00', {lines: 1, max: 300, min: 120, charW: 0.62});
  return (
    <Stage gap={20}>
      {kicker ? <Kicker text={kicker} /> : null}
      <div style={{fontSize: fsNum, fontWeight: 900, color: b.colors.accent, letterSpacing: -6, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{txt}</div>
      <div style={{fontSize: fitFont(plain(label), {lines: 3, max: 72, min: 44}), fontWeight: 750, color: b.colors.text, opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}><Rich text={label} /></div>
    </Stage>
  );
};

export const Quote: React.FC<{text: string; author?: string}> = ({text, author}) => {
  const b = useBrand();
  const p = usePop(4), q = usePop(22);
  return (
    <Stage>
      <div style={{fontSize: 260, lineHeight: 0.6, color: b.colors.accent, fontWeight: 900, height: 120, opacity: p}}>“</div>
      <div style={{fontSize: fitFont(plain(text), {lines: 6, max: 86, min: 48}), fontWeight: 800, color: b.colors.text, lineHeight: 1.15, fontStyle: 'italic', opacity: p, transform: `scale(${0.92 + p * 0.08})`, transformOrigin: 'left'}}><Rich text={text} /></div>
      {author ? <div style={{fontSize: 44, color: b.colors.muted, fontWeight: 700, opacity: q}}>— {author}</div> : null}
    </Stage>
  );
};

/** Two columns, e.g. myth vs fact, before vs after. */
export const Compare: React.FC<{left: {title: string; items: string[]}; right: {title: string; items: string[]}; vs?: string}> = ({left, right, vs = 'VS'}) => {
  const b = useBrand();
  const pl = usePop(4), pr = usePop(30), pv = usePop(18);
  const col = (c: {title: string; items: string[]}, p: number, good: boolean) => (
    <div style={{flex: 1, borderRadius: 36, padding: 36, background: good ? b.colors.accent : (b.colors.card || 'rgba(255,255,255,.1)'), color: good ? (isLight(b.colors.accent) ? b.colors.bg1 : '#fff') : b.colors.text, opacity: p, transform: `translateY(${(1 - p) * 60}px)`, display: 'flex', flexDirection: 'column', gap: 22}}>
      <div style={{fontSize: 52, fontWeight: 900}}>{c.title}</div>
      {c.items.map((x, i) => <div key={i} style={{fontSize: fitFont(x, {width: 330, lines: 3, max: 40, min: 28}), fontWeight: 700, lineHeight: 1.15}}>{x}</div>)}
    </div>
  );
  return (
    <Stage>
      <div style={{display: 'flex', gap: 28, alignItems: 'stretch', position: 'relative'}}>
        {col(left, pl, false)}
        {col(right, pr, true)}
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${pv})`, width: 120, height: 120, borderRadius: 999, background: b.colors.bg1, color: b.colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 40, border: `6px solid ${b.colors.text}`}}>{vs}</div>
      </div>
    </Stage>
  );
};

/** Big emoji / symbol with a line of text. */
export const Icon: React.FC<{char: string; text?: string}> = ({char, text}) => {
  const b = useBrand();
  const f = useF();
  const p = usePop(2, 8);
  return (
    <Stage>
      <div style={{fontSize: 340, textAlign: 'center', transform: `scale(${p}) rotate(${Math.sin(f / 12) * 4}deg)`}}>{char}</div>
      {text ? <div style={{fontSize: fitFont(plain(text), {lines: 3, max: 90, min: 50}), fontWeight: 900, color: b.colors.text, textAlign: 'center'}}><Rich text={text} /></div> : null}
    </Stage>
  );
};

/** Image card (not full-bleed). */
export const Card: React.FC<{src: string; caption?: string; height?: number}> = ({src, caption, height = 720}) => {
  const b = useBrand();
  const p = usePop(2);
  const f = useF();
  return (
    <Stage>
      <div style={{height, borderRadius: 44, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)', transform: `scale(${0.85 + p * 0.15})`, opacity: p}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.05 + f / 3000})`}} />
      </div>
      {caption ? <div style={{fontSize: fitFont(plain(caption), {lines: 2, max: 64, min: 40}), fontWeight: 800, color: b.colors.text}}><Rich text={caption} /></div> : null}
    </Stage>
  );
};

export const CTA: React.FC<{text: string; sub?: string}> = ({text, sub}) => {
  const b = useBrand();
  const p = usePop(4);
  const f = useF();
  return (
    <Stage>
      <div style={{fontSize: fitFont(plain(text), {lines: 3, max: 110, min: 60}), fontWeight: 900, color: b.colors.text, textAlign: 'center', opacity: p}}><Rich text={text} /></div>
      <div style={{alignSelf: 'center', padding: '26px 54px', borderRadius: 999, background: b.colors.accent, color: isLight(b.colors.accent) ? b.colors.bg1 : '#fff', fontSize: 54, fontWeight: 900, transform: `scale(${p * (1 + Math.sin(f / 6) * 0.03)})`}}>{sub || b.handle}</div>
    </Stage>
  );
};

// ---------- overlays ----------
/** Karaoke captions from word timings; 3-word chunks, current word in accent. */
export const Captions: React.FC<{y?: number; size?: number; chunk?: number}> = ({y = SAFE.captionY, size = 74, chunk = 3}) => {
  const b = useBrand();
  const s = useScene();
  const f = useF();
  if (!s?.words?.length) return null;
  const groups: Word[][] = [];
  let g: Word[] = [];
  s.words.forEach((w, i) => {
    g.push(w);
    const brk = /[.,!?;:]$/.test(w.text) || g.length >= chunk || i === s.words.length - 1;
    if (brk) {
      const prev = groups[groups.length - 1];
      if (g.length === 1 && prev && prev.length < 4 && !/[.!?]$/.test(prev[prev.length - 1].text)) prev.push(...g);
      else groups.push(g);
      g = [];
    }
  });
  const gi = groups.findIndex((gr, i) => f >= gr[0].start && (i === groups.length - 1 || f < groups[i + 1][0].start));
  if (gi < 0) return null;
  const gr = groups[gi];
  const p = spring({frame: f - gr[0].start, fps: 30, config: {damping: 12, mass: 0.5}});
  const len = gr.map((w) => w.text).join(' ').length;
  const fs = len > 22 ? Math.round(size * 22 / len) + 8 : size;
  const mode = b.captions || 'stroke';
  const light = isLight(b.colors.bg1);
  const box: React.CSSProperties =
    mode === 'pill' ? {background: b.colors.card || (light ? '#fff' : 'rgba(0,0,0,.6)'), padding: '18px 34px', borderRadius: 34, boxShadow: '0 24px 50px -22px rgba(0,0,0,.35)', textTransform: 'none', fontWeight: 700}
    : mode === 'clean' ? {textTransform: 'none', fontWeight: 800, textShadow: light ? 'none' : '0 3px 18px rgba(0,0,0,.8)'}
    : {textTransform: 'uppercase', fontWeight: 900, WebkitTextStroke: '10px rgba(0,0,0,.9)', paintOrder: 'stroke fill'};
  return (
    <AbsoluteFill style={{top: y, height: 220, left: 60, right: 60, width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: mode === 'stroke' ? fs : Math.round(fs * 0.92), textAlign: 'center', lineHeight: 1.12, transform: `scale(${0.85 + p * 0.15})`, letterSpacing: -0.5, ...box} as React.CSSProperties}>
        {gr.map((w, i) => {
          const on = f >= w.start && f < (gr[i + 1]?.start ?? w.end + 6);
          return <span key={i} style={{color: on ? b.colors.accent : b.colors.text}}>{w.text}{i < gr.length - 1 ? ' ' : ''}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Progress: React.FC<{total: number}> = ({total}) => {
  const b = useBrand();
  const f = useF();
  return (
    <AbsoluteFill style={{top: 0, height: 10}}>
      <div style={{height: 10, width: `${(f / total) * 100}%`, background: b.colors.accent}} />
    </AbsoluteFill>
  );
};

export const Handle: React.FC = () => {
  const b = useBrand();
  if (!b.handle) return null;
  return <AbsoluteFill style={{top: 80, left: SAFE.side, height: 60, fontSize: 34, fontWeight: 700, color: b.colors.muted, opacity: 0.9}}>{b.handle}</AbsoluteFill>;
};

// ---------- camera: one big world, a virtual camera that zooms and travels between shots ----------
/**
 * A shot frames a point of the world. x, y: world px the camera centers on; zoom: 1 = world px are screen px.
 * at: when the move starts, as a fraction of the scene (0 = scene start). move: frames the move takes (default 26).
 * fly: zoom out a bit mid-move (on by default for long moves), like a map flying to a new place.
 */
export type Shot = {x: number; y: number; zoom?: number; at?: number; move?: number; fly?: boolean};
export type CamState = {x: number; y: number; zoom: number};
type CamKey = CamState & {frame: number; move: number; fly?: boolean};
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function buildKeys(timeline: Timeline, camera: Record<string, Shot | Shot[]>): CamKey[] {
  const keys: CamKey[] = [];
  for (const s of timeline.scenes) {
    const list = camera[s.id];
    if (!list) continue;
    const arr = Array.isArray(list) ? list : [list];
    arr.forEach((sh, i) => keys.push({
      x: sh.x, y: sh.y, zoom: sh.zoom ?? 1, fly: sh.fly, move: sh.move ?? 26,
      frame: s.from + Math.round((sh.at ?? (i === 0 ? 0 : i / arr.length)) * s.duration),
    }));
  }
  return keys.sort((a, b) => a.frame - b.frame);
}

/** Camera state at global frame g. Moves ease in-out; zoom is interpolated in log space; long moves "fly" (dip out). */
function camAt(keys: CamKey[], g: number, drift: number): CamState {
  if (!keys.length) return {x: 540, y: 960, zoom: 1};
  let from: CamState = {x: keys[0].x, y: keys[0].y, zoom: keys[0].zoom};
  const seg = (a: CamState, k: CamKey, f: number): CamState => {
    const t = Math.max(0, Math.min(1, (f - k.frame) / Math.max(1, k.move)));
    const e = easeIO(t);
    const dist = Math.hypot(k.x - a.x, k.y - a.y) * Math.min(a.zoom, k.zoom);
    const fly = (k.fly ?? dist > 700) ? Math.min(0.45, dist / 3000) * Math.sin(Math.PI * e) : 0;
    const z = Math.exp(Math.log(a.zoom) + (Math.log(k.zoom) - Math.log(a.zoom)) * e) * (1 - fly);
    // slow push-in while the shot holds, so the frame never feels frozen
    const hold = Math.max(0, f - k.frame - k.move);
    return {x: a.x + (k.x - a.x) * e, y: a.y + (k.y - a.y) * e, zoom: z * (1 + drift * Math.min(1, hold / 240))};
  };
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].frame > g) return seg(from, keys[i - 1], g);
    from = seg(from, keys[i - 1], keys[i].frame);
  }
  return seg(from, keys[keys.length - 1], g);
}

/** Keep the frame inside the world, so its edge never shows (centers the world if the view is wider than it). */
function clampCam(c: CamState, size: [number, number]): CamState {
  const hw = 540 / c.zoom, hh = 960 / c.zoom;
  const cl = (v: number, half: number, max: number) => (2 * half >= max ? max / 2 : Math.max(half, Math.min(max - half, v)));
  return {zoom: c.zoom, x: cl(c.x, hw, size[0]), y: cl(c.y, hh, size[1])};
}

const CamCtx = createContext<{at: (g: number) => CamState} | null>(null);
/** Current camera state, and a function mapping world points to screen points. Works inside scenes and in the world. */
export function useCam() {
  const c = useContext(CamCtx);
  const ctx = useContext(Ctx);
  const local = useCurrentFrame();
  const g = ctx.still ? 0 : (ctx.scene?.from ?? 0) + local;
  const st = c ? c.at(g) : {x: 540, y: 960, zoom: 1};
  const toScreen = (p: [number, number]): [number, number] => [540 + (p[0] - st.x) * st.zoom, 960 + (p[1] - st.y) * st.zoom];
  return {...st, toScreen};
}

/** The world layer: children are laid out in world px, the camera moves over them. Vector content stays sharp at any zoom. */
const WorldLayer: React.FC<{children: React.ReactNode; size: [number, number]}> = ({children, size}) => {
  const {x, y, zoom} = useCam();
  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: size[0], height: size[1], transformOrigin: '0 0', transform: `translate(${540 - x * zoom}px, ${960 - y * zoom}px) scale(${zoom})`}}>
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** Place anything at world coordinates (inside `world`). */
export const At: React.FC<{x: number; y: number; w?: number; h?: number; center?: boolean; children: React.ReactNode; style?: React.CSSProperties}> = ({x, y, w, h, center = true, children, style}) => (
  <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: center ? 'translate(-50%,-50%)' : undefined, ...style}}>{children}</div>
);

/** A generated image placed in the world as a framed card. Keep it at or below its native size on screen (zoom × w ≤ ~1.2× the PNG width). */
export const WorldImage: React.FC<{src: string; x: number; y: number; w: number; h: number; radius?: number; frame?: boolean; rotate?: number; grade?: Grade; shadow?: boolean}> = ({src, x, y, w, h, radius = 28, frame = true, rotate = 0, grade = 'none', shadow = true}) => (
  <At x={x} y={y} w={w} h={h} style={{transform: `translate(-50%,-50%) rotate(${rotate}deg)`}}>
    <div style={{width: '100%', height: '100%', borderRadius: radius, overflow: 'hidden', background: frame ? '#fff' : 'transparent', padding: frame ? 10 : 0, boxSizing: 'border-box', boxShadow: shadow ? '0 30px 60px -30px rgba(20,30,50,.45), 0 2px 6px rgba(20,30,50,.12)' : 'none'}}>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: frame ? radius - 8 : radius, filter: gradeFilter(grade)}} />
    </div>
  </At>
);

/** Large textured ground for the world, so camera moves read as motion. pattern: dots | grid | lines | none. */
export const WorldGround: React.FC<{w: number; h: number; pattern?: 'dots' | 'grid' | 'lines' | 'none'; color?: string; ink?: string; step?: number}> = ({w, h, pattern = 'dots', color, ink, step = 48}) => {
  const b = useBrand();
  const c = ink || b.colors.muted;
  const bgImg = pattern === 'dots' ? `radial-gradient(${c}33 2px, transparent 2.5px)`
    : pattern === 'grid' ? `linear-gradient(${c}1f 1.5px, transparent 1.5px), linear-gradient(90deg, ${c}1f 1.5px, transparent 1.5px)`
    : pattern === 'lines' ? `repeating-linear-gradient(0deg, transparent 0 ${step - 2}px, ${c}22 ${step - 2}px ${step}px)` : 'none';
  return <div style={{position: 'absolute', left: 0, top: 0, width: w, height: h, background: color || b.colors.bg2, backgroundImage: bgImg, backgroundSize: `${step}px ${step}px`}} />;
};

// ---------- the reel ----------
type SceneMap = Record<string, React.ReactNode | (() => React.ReactNode)>;

/**
 * Lays out every scene from the timeline with its voice track.
 * scenes:      id -> visual for that scene (overlays when a world is used)
 * backgrounds: id -> background (defaults to the look's background; ignored where the world shows)
 * world:       optional big canvas (world px) the camera travels over, shared by every scene, never cut
 * worldSize:   [w, h] of the world in px (default [3240, 5760])
 * camera:      id -> Shot or Shot[]: where the camera goes in that scene
 * drift:       slow push-in while a shot holds (default 0.04 = +4%)
 * transition:  frames of the overlay fade between scenes
 */
export const Reel: React.FC<ReelProps & {scenes: SceneMap; backgrounds?: SceneMap; captions?: boolean; progress?: boolean; handle?: boolean; transition?: number;
  world?: React.ReactNode; worldSize?: [number, number]; camera?: Record<string, Shot | Shot[]>; drift?: number; overlay?: React.ReactNode}> = ({
  timeline, brand, reel, scenes, backgrounds = {}, captions = true, progress = true, handle = true, transition = 8,
  world, worldSize = [3240, 5760], camera = {}, drift = 0.04, overlay,
}) => {
  const reelCredits: CreditEntry[] = reel?.credits || [];
  const b: Brand = {...brand, colors: {...brand.colors}};
  useFonts(b);
  const keys = React.useMemo(() => buildKeys(timeline, camera), [timeline, camera]);
  const cam = React.useMemo(() => ({at: (g: number) => clampCam(camAt(keys, g, drift), worldSize)}), [keys, drift, worldSize]);
  return (
    <Ctx.Provider value={{brand: b}}>
      <CreditsCtx.Provider value={reelCredits}>
      <CamCtx.Provider value={cam}>
        <AbsoluteFill style={{fontFamily: b.font || 'Inter, -apple-system, sans-serif', background: b.colors.bg1, overflow: 'hidden'}}>
          {world ? <><BrandBG /><WorldLayer size={worldSize}>{world}</WorldLayer></> : null}
          {timeline.scenes.map((s) => {
            const v = scenes[s.id];
            const bg = backgrounds[s.id];
            return (
              <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
                <Ctx.Provider value={{brand: b, scene: s}}>
                  <SceneFade duration={s.duration} t={transition} soft={!!world}>
                    {bg ? (typeof bg === 'function' ? (bg as any)() : bg) : world ? null : <BrandBG />}
                    {typeof v === 'function' ? (v as any)() : v ?? <Title text={`⚠ missing scene "${s.id}"`} />}
                  </SceneFade>
                  {captions ? <Captions /> : null}
                  <Audio src={staticFile(s.audio)} />
                </Ctx.Provider>
              </Sequence>
            );
          })}
          {overlay}
          {handle ? <Handle /> : null}
          {progress ? <Progress total={timeline.total} /> : null}
        </AbsoluteFill>
      </CamCtx.Provider>
      </CreditsCtx.Provider>
    </Ctx.Provider>
  );
};

/** soft: overlays over a continuous world fade in and out without scaling, so only the camera moves. */
const SceneFade: React.FC<{children: React.ReactNode; duration: number; t: number; soft?: boolean}> = ({children, duration, t, soft}) => {
  const f = useF();
  if (soft) {
    const o = Math.min(interpolate(f, [0, t], [0, 1], {extrapolateRight: 'clamp'}), interpolate(f, [duration - 6, duration], [1, 0], {extrapolateLeft: 'clamp'}));
    return <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>;
  }
  const o = Math.min(interpolate(f, [0, t], [0, 1], {extrapolateRight: 'clamp'}), interpolate(f, [duration - 4, duration], [1, 0.6], {extrapolateLeft: 'clamp'}));
  const s = interpolate(f, [0, t], [1.04, 1], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: o, transform: `scale(${s})`}}>{children}</AbsoluteFill>;
};

/** Helper for an optional Cover still: brand context with no timeline. Pass world + shot to frame the cover on the world. */
export const CoverFrame: React.FC<{brand: Brand; children: React.ReactNode; world?: React.ReactNode; worldSize?: [number, number]; shot?: Shot}> = ({brand, children, world, worldSize = [3240, 5760], shot}) => {
  useFonts(brand);
  const cam = React.useMemo(() => ({at: () => ({x: shot?.x ?? 540, y: shot?.y ?? 960, zoom: shot?.zoom ?? 1})}), [shot]);
  return (
    <Ctx.Provider value={{brand, still: true}}>
      <CamCtx.Provider value={cam}>
        <AbsoluteFill style={{fontFamily: brand.font || 'Inter, -apple-system, sans-serif', background: brand.colors.bg1}}>
          {world ? <><BrandBG /><WorldLayer size={worldSize}>{world}</WorldLayer></> : null}
          {children}
        </AbsoluteFill>
      </CamCtx.Provider>
    </Ctx.Provider>
  );
};

const loaded = new Set<string>();
/** Loads the look's font files (copied into the reel's assets by rs) before the first frame. */
function useFonts(b: Brand) {
  const [handle] = React.useState(() => {
    const todo = (b.fontFiles || []).filter((x) => !loaded.has(x.src));
    if (!todo.length) return null;
    const h = delayRender('fonts');
    Promise.all(todo.map((x) => { loaded.add(x.src); return loadFont({family: x.family, url: staticFile(x.src), weight: x.weight}); }))
      .then(() => continueRender(h)).catch((e) => { console.error(e); continueRender(h); });
    return h;
  });
  return handle;
}

// ---------- editorial kit: headline, pills, anchored callouts, cards, charts ----------
const SHADOW = '0 18px 40px -18px rgba(20,30,50,.45), 0 2px 6px rgba(20,30,50,.10)';
const sans = 'Inter, -apple-system, "Helvetica Neue", sans-serif';
const displayOf = (b: Brand) => b.display || b.font || sans;
const ink = (b: Brand) => b.colors.text;
const onAccent = (b: Brand) => (isLight(b.colors.accent) ? '#111' : '#fff');
/** Ease-out reveal 0..1 starting at `delay`, lasting `dur` frames (smooth, no bounce). */
export function useReveal(delay = 0, dur = 18) {
  const f = useF();
  return interpolate(f, [delay, delay + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1)});
}

/** Rounded label in the accent color (the "red pill"). tone: accent | ink | light. */
export const Pill: React.FC<{text: string; tone?: 'accent' | 'ink' | 'light'; size?: number; delay?: number; style?: React.CSSProperties}> = ({text, tone = 'accent', size = 38, delay = 0, style}) => {
  const b = useBrand();
  const p = usePop(delay, 15);
  const bg = tone === 'accent' ? b.colors.accent : tone === 'ink' ? ink(b) : (b.colors.card || '#fff');
  const fg = tone === 'accent' ? onAccent(b) : tone === 'ink' ? b.colors.bg1 : ink(b);
  return (
    <div style={{display: 'inline-block', width: 'fit-content', alignSelf: 'center', padding: `${size * 0.24}px ${size * 0.66}px`, borderRadius: 999, background: bg, color: fg, fontFamily: b.font || sans, fontWeight: 700, fontSize: size, letterSpacing: -0.2, lineHeight: 1.1, whiteSpace: 'nowrap', boxShadow: tone === 'light' ? SHADOW : '0 10px 24px -14px rgba(0,0,0,.45)', transform: `scale(${0.6 + p * 0.4})`, opacity: Math.min(1, p * 1.4), ...style}}>
      <Rich text={text} accent={tone === 'accent' ? fg : b.colors.accent} />
    </div>
  );
};

/**
 * The editorial header: tiny tracked kicker, serif headline, accent pill. Sits at the top on a soft fade
 * so the world shows below. enter={false} shows it already in place (use in scenes after the first).
 */
export const Headline: React.FC<{title: string; kicker?: string | false; pill?: string; y?: number; size?: number; delay?: number; enter?: boolean; fade?: boolean; align?: 'center' | 'left'}> = ({title, kicker, pill, y = 210, size, delay = 0, enter = true, fade = true, align = 'center'}) => {
  const b = useBrand();
  const k = kicker === false ? null : (kicker ?? b.name ?? '').toUpperCase();
  const fs = size || fitFont(plain(title), {width: 900, lines: 2, max: 96, min: 60, charW: 0.5});
  const lines = title.split('\n');
  const rk0 = useReveal(delay, 14);
  const rk = enter ? rk0 : 1;
  return (
    <>
      {fade ? <AbsoluteFill style={{height: y + fs * 2.6 + (pill ? 160 : 60), background: `linear-gradient(180deg, ${b.colors.bg1} 0%, ${b.colors.bg1}F2 55%, ${b.colors.bg1}00 100%)`}} /> : null}
      <AbsoluteFill style={{top: y, left: 70, right: 70, width: 'auto', height: 'auto', bottom: 'auto', display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 22, textAlign: align}}>
        {k ? <div style={{fontFamily: b.font || sans, fontSize: 24, fontWeight: 600, letterSpacing: 6, color: b.colors.muted, opacity: rk}}>{k}</div> : null}
        <div style={{fontFamily: displayOf(b), fontSize: fs, fontWeight: 600, lineHeight: 1.06, letterSpacing: -1, color: ink(b)}}>
          {lines.map((ln, i) => {
            const r0 = useRevealSafe(delay + 4 + i * 6);
            const r = enter ? r0 : 1;
            return (
              <div key={i} style={{overflow: 'hidden', paddingBottom: fs * 0.08}}>
                <div style={{transform: `translateY(${(1 - r) * 105}%)`, opacity: Math.min(1, r * 1.5)}}><Rich text={ln} /></div>
              </div>
            );
          })}
        </div>
        {pill ? <Pill text={pill} delay={enter ? delay + 14 + lines.length * 6 : -100} /> : null}
      </AbsoluteFill>
    </>
  );
};
// hooks inside map: stable count per render (lines don't change), wrapped for readability
function useRevealSafe(delay: number) { return useReveal(delay, 20); }

/** Small white label, for screen-space use (inside an AbsoluteFill you position). */
export const Tag: React.FC<{text: string; size?: number; tone?: 'light' | 'ink' | 'accent'; style?: React.CSSProperties}> = ({text, size = 30, tone = 'light', style}) => {
  const b = useBrand();
  const bg = tone === 'light' ? (b.colors.card || '#fff') : tone === 'ink' ? ink(b) : b.colors.accent;
  const fg = tone === 'light' ? ink(b) : tone === 'ink' ? b.colors.bg1 : onAccent(b);
  return <div style={{display: 'inline-block', width: 'fit-content', padding: `${size * 0.3}px ${size * 0.6}px`, borderRadius: size * 0.55, background: bg, color: fg, fontFamily: b.font || sans, fontSize: size, fontWeight: 650, lineHeight: 1.1, whiteSpace: 'nowrap', boxShadow: SHADOW, ...style}}><Rich text={text} accent={tone === 'light' ? b.colors.accent : fg} /></div>;
};

/**
 * A point in the world with a label that follows the camera but keeps its screen size.
 * at: world [x, y]. side: where the label sits. Use inside a scene of a reel that has a world.
 */
export const Pin: React.FC<{at: [number, number]; label?: string; side?: 'top' | 'bottom' | 'left' | 'right'; delay?: number; tone?: 'light' | 'ink' | 'accent'; dot?: boolean; size?: number}> = ({at, label, side = 'top', delay = 6, tone = 'light', dot = true, size = 30}) => {
  const b = useBrand();
  const {toScreen} = useCam();
  const f = useF();
  const p = usePop(delay, 13);
  const [sx, sy] = toScreen(at);
  const off = 26 + size;
  const pos: Record<string, React.CSSProperties> = {
    top: {left: sx, top: sy - off, transform: `translate(-50%,-100%) scale(${p})`, transformOrigin: '50% 100%'},
    bottom: {left: sx, top: sy + off, transform: `translate(-50%,0) scale(${p})`, transformOrigin: '50% 0'},
    left: {left: sx - off, top: sy, transform: `translate(-100%,-50%) scale(${p})`, transformOrigin: '100% 50%'},
    right: {left: sx + off, top: sy, transform: `translate(0,-50%) scale(${p})`, transformOrigin: '0 50%'},
  };
  const lineEnd = side === 'top' ? [sx, sy - off] : side === 'bottom' ? [sx, sy + off] : side === 'left' ? [sx - off, sy] : [sx + off, sy];
  const pulse = (f - delay) % 45 / 45;
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        {label ? <line x1={sx} y1={sy} x2={sx + (lineEnd[0] - sx) * p} y2={sy + (lineEnd[1] - sy) * p} stroke={ink(b)} strokeWidth={3} strokeLinecap="round" opacity={0.7} /> : null}
        {dot ? <>
          <circle cx={sx} cy={sy} r={10 + pulse * 26} fill="none" stroke={b.colors.accent} strokeWidth={3} opacity={(1 - pulse) * 0.6 * p} />
          <circle cx={sx} cy={sy} r={11 * p} fill={b.colors.accent} stroke="#fff" strokeWidth={4} />
        </> : null}
      </svg>
      {label ? <div style={{position: 'absolute', ...pos[side], opacity: Math.min(1, p * 1.5)}}><Tag text={label} tone={tone} size={size} /></div> : null}
    </AbsoluteFill>
  );
};

/** A circle drawn around a world point (radius in world px), with an optional label at its top. */
export const Ring: React.FC<{at: [number, number]; r: number; label?: string; delay?: number; dashed?: boolean; fill?: boolean; color?: string}> = ({at, r, label, delay = 4, dashed, fill = true, color}) => {
  const b = useBrand();
  const {toScreen, zoom} = useCam();
  const d = useReveal(delay, 30);
  const [sx, sy] = toScreen(at);
  const R = r * zoom, c = color || b.colors.accent, C = 2 * Math.PI * R;
  const lp = useReveal(delay + 22, 14);
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        {fill ? <circle cx={sx} cy={sy} r={R} fill={c} opacity={0.1 * d} /> : null}
        <circle cx={sx} cy={sy} r={R} fill="none" stroke={c} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={dashed ? '14 12' : `${C * d} ${C}`} opacity={dashed ? d : 1} transform={`rotate(-90 ${sx} ${sy})`} />
      </svg>
      {label ? <div style={{position: 'absolute', left: sx, top: sy - R - 18, transform: `translate(-50%,-100%) scale(${0.7 + lp * 0.3})`, opacity: lp}}><Tag text={label} tone="accent" /></div> : null}
    </AbsoluteFill>
  );
};

/** Dashed measuring line between two world points, drawn progressively, with a label in the middle. */
export const Measure: React.FC<{from: [number, number]; to: [number, number]; label?: string; delay?: number}> = ({from, to, label, delay = 6}) => {
  const b = useBrand();
  const {toScreen} = useCam();
  const d = useReveal(delay, 26);
  const lp = useReveal(delay + 20, 14);
  const [ax, ay] = toScreen(from), [bx, by] = toScreen(to);
  const ex = ax + (bx - ax) * d, ey = ay + (by - ay) * d;
  return (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
        <line x1={ax} y1={ay} x2={ex} y2={ey} stroke={ink(b)} strokeWidth={4} strokeDasharray="12 10" strokeLinecap="round" />
        <circle cx={ax} cy={ay} r={9} fill={b.colors.accent} stroke="#fff" strokeWidth={3} />
        {d > 0.98 ? <circle cx={bx} cy={by} r={9} fill={b.colors.accent} stroke="#fff" strokeWidth={3} /> : null}
      </svg>
      {label ? <div style={{position: 'absolute', left: (ax + bx) / 2, top: (ay + by) / 2, transform: `translate(-50%,-50%) scale(${0.7 + lp * 0.3})`, opacity: lp}}><Tag text={label} /></div> : null}
    </AbsoluteFill>
  );
};

/** Dims everything except a circle around a world point: pulls the eye to one place. */
export const Spotlight: React.FC<{at: [number, number]; r: number; dim?: number; delay?: number}> = ({at, r, dim = 0.45, delay = 0}) => {
  const {toScreen, zoom} = useCam();
  const d = useReveal(delay, 20);
  const [sx, sy] = toScreen(at);
  const R = r * zoom;
  return <AbsoluteFill style={{background: `radial-gradient(circle at ${sx}px ${sy}px, transparent ${R}px, rgba(15,22,35,${dim * d}) ${R + 3}px)`}} />;
};

/** Colored stat box with a direction arrow, e.g. "◀ ovest 50%". Screen-space: give x, y (center). */
export const Badge: React.FC<{value: string; label?: string; x: number; y: number; color?: string; arrow?: 'left' | 'right' | 'up' | 'down'; delay?: number}> = ({value, label, x, y, color, arrow, delay = 8}) => {
  const b = useBrand();
  const p = usePop(delay, 14);
  const ar = arrow ? {left: '◀ ', right: '', up: '▲ ', down: '▼ '}[arrow] : '';
  return (
    <div style={{position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) scale(${p})`, background: color || ink(b), color: '#fff', borderRadius: 18, padding: '12px 22px', fontFamily: b.font || sans, textAlign: 'center', boxShadow: SHADOW, minWidth: 130}}>
      {label ? <div style={{fontSize: 22, fontWeight: 600, opacity: 0.9}}>{ar}{label}{arrow === 'right' ? ' ▶' : ''}</div> : null}
      <div style={{fontSize: 54, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums'}}>{value}</div>
    </div>
  );
};

/** White card with a counting number and a label. Screen-space at x, y (center). */
export const StatCard: React.FC<{value: number; prefix?: string; suffix?: string; decimals?: number; label: string; x?: number; y?: number; w?: number; delay?: number}> = ({value, prefix = '', suffix = '', decimals = 0, label, x = 540, y = 1000, w = 640, delay = 6}) => {
  const b = useBrand();
  const f = useF();
  const p = usePop(delay, 15);
  const v = interpolate(f, [delay + 4, delay + 40], [0, value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, transform: `translate(-50%,-50%) translateY(${(1 - p) * 60}px)`, opacity: Math.min(1, p * 1.4), background: b.colors.card || '#fff', borderRadius: 36, padding: '34px 40px', boxShadow: SHADOW, textAlign: 'center'}}>
      <div style={{fontFamily: displayOf(b), fontSize: fitFont(prefix + value.toLocaleString('it-IT', {minimumFractionDigits: decimals}) + suffix, {width: w - 90, lines: 1, max: 150, min: 64, charW: 0.6}), fontWeight: 600, color: b.colors.accent, letterSpacing: -3, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>{prefix}{v.toLocaleString('it-IT', {minimumFractionDigits: decimals, maximumFractionDigits: decimals})}{suffix}</div>
      <div style={{fontFamily: b.font || sans, fontSize: 36, fontWeight: 600, color: ink(b), marginTop: 12, lineHeight: 1.2}}><Rich text={label} /></div>
    </div>
  );
};

/**
 * White card with an animated chart. type: line (draws left to right, area under it) | bar (bars grow).
 * data: numbers; labels: x-axis labels (first and last are shown for line, all for bar); highlight: index to color with the accent.
 */
export const ChartCard: React.FC<{type?: 'line' | 'bar'; data: number[]; labels?: string[]; title?: string; unit?: string; highlight?: number; x?: number; y?: number; w?: number; h?: number; delay?: number; baseline?: number}> = ({type = 'line', data, labels = [], title, unit = '', highlight, x = 540, y = 1000, w = 900, h = 520, delay = 6, baseline}) => {
  const b = useBrand();
  const p = usePop(delay, 16);
  const d = useReveal(delay + 8, 40);
  const pad = {l: 40, r: 40, t: title ? 90 : 40, b: 70};
  const W = w - pad.l - pad.r, H = h - pad.t - pad.b;
  const max = Math.max(...data, baseline ?? -Infinity) * 1.08, min = Math.min(0, ...data);
  const X = (i: number) => pad.l + (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const Y = (v: number) => pad.t + H - ((v - min) / (max - min || 1)) * H;
  const pts = data.map((v, i) => [X(i), Y(v)] as [number, number]);
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const area = `${line} L${X(data.length - 1)},${Y(min)} L${X(0)},${Y(min)} Z`;
  const last = Math.max(0, Math.min(data.length - 1, Math.floor(d * (data.length - 1))));
  const bw = (W / data.length) * 0.62;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `translate(-50%,-50%) translateY(${(1 - p) * 60}px)`, opacity: Math.min(1, p * 1.4), background: b.colors.card || '#fff', borderRadius: 32, boxShadow: SHADOW, overflow: 'hidden'}}>
      {title ? <div style={{position: 'absolute', left: pad.l, top: 30, fontFamily: b.font || sans, fontSize: 32, fontWeight: 700, color: ink(b)}}><Rich text={title} /></div> : null}
      <svg width={w} height={h} style={{position: 'absolute', left: 0, top: 0}}>
        <defs>
          <linearGradient id="rs-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={b.colors.accent} stopOpacity={0.28} /><stop offset="1" stopColor={b.colors.accent} stopOpacity={0} /></linearGradient>
          <clipPath id="rs-clip"><rect x={0} y={0} width={pad.l + W * d + 2} height={h} /></clipPath>
        </defs>
        <line x1={pad.l} x2={pad.l + W} y1={Y(min)} y2={Y(min)} stroke={b.colors.muted} strokeOpacity={0.4} strokeWidth={2} />
        {baseline !== undefined ? <line x1={pad.l} x2={pad.l + W} y1={Y(baseline)} y2={Y(baseline)} stroke={b.colors.muted} strokeDasharray="8 8" strokeWidth={2} /> : null}
        {type === 'line' ? (
          <g clipPath="url(#rs-clip)">
            <path d={area} fill="url(#rs-area)" />
            <path d={line} fill="none" stroke={b.colors.accent} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ) : data.map((v, i) => {
          const g = Math.max(0, Math.min(1, d * data.length - i * 0.6));
          const top = Y(min) - (Y(min) - Y(v)) * g;
          return <rect key={i} x={X(i) - bw / 2 + (data.length === 1 ? 0 : 0)} y={top} width={bw} height={Y(min) - top} rx={10} fill={highlight === i ? b.colors.accent : `${ink(b)}`} opacity={highlight === undefined || highlight === i ? 1 : 0.28} />;
        })}
        {type === 'line' ? <circle cx={pts[last][0]} cy={pts[last][1]} r={11} fill={b.colors.accent} stroke="#fff" strokeWidth={4} /> : null}
      </svg>
      {type === 'line' && d > 0.95 ? <div style={{position: 'absolute', left: pts[data.length - 1][0], top: pts[data.length - 1][1] - 22, transform: 'translate(-100%,-100%)', fontFamily: b.font || sans, fontWeight: 800, fontSize: 34, color: b.colors.accent}}>{data[data.length - 1].toLocaleString('it-IT')}{unit}</div> : null}
      {(type === 'line' ? [0, labels.length - 1] : labels.map((_, i) => i)).filter((i) => labels[i] !== undefined).map((i) => (
        <div key={i} style={{position: 'absolute', top: h - pad.b + 18, left: type === 'line' ? (i === 0 ? pad.l : pad.l + W) : X(i), transform: type === 'line' ? (i === 0 ? 'none' : 'translateX(-100%)') : 'translateX(-50%)', fontFamily: b.font || sans, fontSize: 24, fontWeight: 600, color: b.colors.muted, whiteSpace: 'nowrap'}}>{labels[i]}</div>
      ))}
    </div>
  );
};

/** A row of round white "lenses", each framing an image or any node, with a label; one can be highlighted. Screen-space. */
export const Lenses: React.FC<{items: {src?: string; node?: React.ReactNode; label?: string; highlight?: boolean}[]; y?: number; size?: number; delay?: number; stagger?: number}> = ({items, y = 1000, size = 230, delay = 6, stagger = 5}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const gap = Math.min(40, (1000 - items.length * size) / Math.max(1, items.length - 1));
  const total = items.length * size + (items.length - 1) * gap;
  return (
    <AbsoluteFill>
      {items.map((it, i) => {
        const p = spring({frame: f - delay - i * stagger, fps, config: {damping: 13, mass: 0.8}});
        const s = it.highlight ? size * 1.18 : size;
        const cx = 540 - total / 2 + i * (size + gap) + size / 2;
        const cy = y + Math.sin(i * 1.7) * 30;
        return (
          <div key={i} style={{position: 'absolute', left: cx, top: cy, transform: `translate(-50%,-50%) translateY(${(1 - p) * 120}px) scale(${0.5 + p * 0.5})`, opacity: Math.min(1, p * 1.5), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14}}>
            <div style={{width: s, height: s, borderRadius: '50%', background: b.colors.card || '#fff', boxShadow: SHADOW, overflow: 'hidden', border: `${it.highlight ? 8 : 6}px solid ${it.highlight ? b.colors.accent : '#fff'}`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              {it.src ? <Img src={staticFile(it.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} /> : it.node}
            </div>
            {it.label ? <Tag text={it.label} size={26} tone={it.highlight ? 'accent' : 'light'} /> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Small source line at the bottom of the content area ("Fonte: ISTAT 2025"). Facts need a source. */
export const Source: React.FC<{text: string; y?: number}> = ({text, y = 1180}) => {
  const b = useBrand();
  const o = useReveal(10, 14);
  return (
    <AbsoluteFill style={{top: y, height: 'auto', bottom: 'auto', left: 70, right: 70, width: 'auto', display: 'flex', alignItems: 'center', opacity: o}}>
      <div style={{width: 'fit-content', maxWidth: '100%', padding: '8px 18px', borderRadius: 14, background: `${b.colors.bg1}E6`, fontFamily: b.font || sans, fontSize: 24, fontWeight: 500, color: b.colors.muted, textAlign: 'center', lineHeight: 1.3}}>{text}</div>
    </AbsoluteFill>
  );
};

// ---------- end screen: the CTA always gets its own clean screen ----------
/**
 * Full, opaque closing screen in the brand's background: it covers the world/photos (no overlap), wiping in.
 * title: 1-2 lines (\n), handle: defaults to the brand handle, actions: small pills ("Salva", "Segui"…), mascot: show the look's mascot.
 * wipe: circle (opens from the center) | up (slides up) | fade.
 */
export const EndScreen: React.FC<{title: string; handle?: string; sub?: string; actions?: string[]; mascot?: boolean; wipe?: 'circle' | 'up' | 'fade'; kicker?: string | false}> = ({title, handle, sub, actions = [], mascot = true, wipe = 'circle', kicker}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const t = useReveal(0, 18);
  const clip = wipe === 'circle' ? `circle(${t * 120}% at 50% 50%)` : undefined;
  const lines = title.split('\n');
  const fs = fitFont(plain(lines.reduce((a, x) => (x.length > a.length ? x : a), '')), {width: 900, lines: 1, max: 112, min: 64, charW: 0.52});
  const pm = spring({frame: f - 8, fps, config: {damping: 12, mass: 0.8}});
  const k = kicker === false ? null : (kicker ?? b.name ?? '').toUpperCase();
  const img = mascot ? b.mascot : undefined;
  return (
    <AbsoluteFill style={{clipPath: clip, opacity: wipe === 'fade' ? t : 1, transform: wipe === 'up' ? `translateY(${(1 - t) * 100}%)` : undefined}}>
      <BrandBG />
      <AbsoluteFill style={{top: SAFE.top, height: SAFE.bottom - SAFE.top, left: 70, right: 70, width: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center'}}>
        {img ? (
          <div style={{width: 380, height: 380, transform: `translateY(${(1 - pm) * 60}px) scale(${0.8 + pm * 0.2}) rotate(${Math.sin(f / 22) * 2}deg)`, opacity: Math.min(1, pm * 1.4), mixBlendMode: isLight(b.colors.bg1) ? 'multiply' : 'normal'}}>
            <Img src={staticFile(img)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
          </div>
        ) : null}
        {k ? <div style={{fontFamily: b.font || sans, fontSize: 26, fontWeight: 600, letterSpacing: 6, color: b.colors.muted, opacity: useReveal(10, 14)}}>{k}</div> : null}
        <div style={{fontFamily: displayOf(b), fontSize: fs, fontWeight: 650, lineHeight: 1.06, letterSpacing: -1, color: ink(b)}}>
          {lines.map((ln, i) => {
            const r = useReveal(12 + i * 6, 20);
            return <div key={i} style={{overflow: 'hidden', paddingBottom: fs * 0.08}}><div style={{transform: `translateY(${(1 - r) * 105}%)`}}><Rich text={ln} /></div></div>;
          })}
        </div>
        {sub ? <div style={{fontFamily: b.font || sans, fontSize: 38, fontWeight: 500, color: b.colors.muted, opacity: useReveal(22, 14), maxWidth: 900, lineHeight: 1.3, textWrap: 'balance'} as React.CSSProperties}><Rich text={sub} /></div> : null}
        <Pill text={handle || b.handle || ''} size={48} delay={24} />
        {actions.length ? (
          <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center'}}>
            {actions.map((a, i) => { const p = usePop(32 + i * 5, 14); return <div key={i} style={{transform: `scale(${p})`, opacity: Math.min(1, p * 1.4)}}><Tag text={a} size={30} /></div>; })}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- photos: archival treatment, grain, credits ----------
export type Grade = 'none' | 'bw' | 'sepia' | 'faded' | 'punch';
/** CSS filter for a photo grade: bw (rich black and white), sepia (warm archival), faded (soft, low contrast), punch (vivid). */
export const gradeFilter = (g: Grade = 'none') => ({
  none: 'none', bw: 'grayscale(1) contrast(1.12) brightness(1.03)', sepia: 'grayscale(1) sepia(.42) contrast(1.08) brightness(1.02)',
  faded: 'contrast(.9) saturate(.75) brightness(1.05)', punch: 'contrast(1.12) saturate(1.18)',
}[g]);

/** Animated film grain + soft vignette over everything below it. Deterministic (seed changes with the frame). */
export const Grain: React.FC<{amount?: number; vignette?: number}> = ({amount = 0.16, vignette = 0.35}) => {
  const f = useCurrentFrame();
  const id = `rs-grain-${f % 7}`;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity: amount, mixBlendMode: 'multiply'}}>
        <filter id={id}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 7} /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,${vignette}) 100%)`}} />
    </AbsoluteFill>
  );
};

/** Credit line for a photo fetched with `rs photo` (author · license · source), read from assets/credits.json. */
export const Credit: React.FC<{file: string; x?: number; y?: number; align?: 'left' | 'right' | 'center'; light?: boolean}> = ({file, x = 70, y = 1150, align = 'left', light}) => {
  const b = useBrand();
  const c = useContext(CreditsCtx).find((e) => e.file === file);
  if (!c) return null;
  const who = (c.author || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 48);
  const txt = ['Foto', who, c.license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
  return (
    <div style={{position: 'absolute', left: align === 'right' ? undefined : x, right: align === 'right' ? 70 : undefined, top: y, width: align === 'center' ? 940 : undefined, textAlign: align, fontFamily: b.font || sans, fontSize: 20, fontWeight: 500, letterSpacing: 0.2, color: light ? 'rgba(255,255,255,.82)' : b.colors.muted, textShadow: light ? '0 1px 6px rgba(0,0,0,.6)' : 'none'}}>{txt}</div>
  );
};

/**
 * A photo on screen (screen px), framed or full-bleed, with a slow Ken Burns move and an optional archival grade.
 * full: covers the screen (then x/y/w/h are ignored). from/to: [scale, xPct, yPct] start and end of the move.
 */
export const Photo: React.FC<{src: string; x?: number; y?: number; w?: number; h?: number; full?: boolean; grade?: Grade; frame?: boolean; rotate?: number;
  from?: [number, number, number]; to?: [number, number, number]; delay?: number; credit?: boolean; dim?: number}> = ({src, x = 540, y = 820, w = 900, h = 640, full, grade = 'none', frame = true, rotate = 0, from = [1.06, 50, 50], to = [1.16, 50, 45], delay = 0, credit = true, dim = 0}) => {
  const f = useF();
  const s = useScene();
  const d = s?.duration || 150;
  const t = interpolate(f, [0, d], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin)});
  const sc = from[0] + (to[0] - from[0]) * t, px = from[1] + (to[1] - from[1]) * t, py = from[2] + (to[2] - from[2]) * t;
  const p = usePop(delay, 16);
  const img = <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${sc})`, transformOrigin: `${px}% ${py}%`, filter: gradeFilter(grade)}} />;
  if (full) return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
      {img}
      {dim ? <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.7}) 0%, rgba(0,0,0,${dim * 0.25}) 45%, rgba(0,0,0,${dim}) 100%)`}} /> : null}
      {credit ? <Credit file={src} y={1170} light /> : null}
    </AbsoluteFill>
  );
  return (
    <>
      <div style={{position: 'absolute', left: x, top: y, width: w, height: h, transform: `translate(-50%,-50%) rotate(${rotate}deg) translateY(${(1 - p) * 70}px) scale(${0.92 + p * 0.08})`, opacity: Math.min(1, p * 1.4),
        background: '#fff', padding: frame ? 14 : 0, boxSizing: 'border-box', borderRadius: frame ? 10 : 24, boxShadow: '0 40px 70px -30px rgba(10,15,25,.6), 0 3px 8px rgba(10,15,25,.15)'}}>
        <div style={{width: '100%', height: '100%', overflow: 'hidden', borderRadius: frame ? 4 : 24}}>{img}</div>
      </div>
      {credit ? <Credit file={src} x={x - w / 2} y={y + h / 2 + 16} /> : null}
    </>
  );
};

/** An SVG icon downloaded with `rs icon` (assets/icons/<name>.svg), tinted, any size. Crisp at any zoom. */
export const SvgIcon: React.FC<{name: string; size?: number; color?: string; stroke?: number; style?: React.CSSProperties}> = ({name, size = 120, color, stroke = 2, style}) => {
  const b = useBrand();
  const [svg, setSvg] = React.useState<string | null>(null);
  const [h] = React.useState(() => delayRender('icon ' + name));
  React.useEffect(() => {
    fetch(staticFile(`icons/${name}.svg`)).then((r) => r.text()).then((t) => { setSvg(t); continueRender(h); }).catch(() => continueRender(h));
  }, [name, h]);
  if (!svg) return <div style={{width: size, height: size, ...style}} />;
  const html = svg.replace(/width="[^"]*"/, `width="${size}"`).replace(/height="[^"]*"/, `height="${size}"`).replace(/stroke="currentColor"/g, `stroke="${color || ink(b)}"`).replace(/stroke-width="[^"]*"/g, `stroke-width="${stroke}"`);
  return <div style={{width: size, height: size, lineHeight: 0, ...style}} dangerouslySetInnerHTML={{__html: html}} />;
};
