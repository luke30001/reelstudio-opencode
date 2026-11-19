// LessonFilm: a long vertical "reel-style" film built from data (reel.json scenes), no hand-written scenes.
// Every scene is a station on a winding path through one big world; the camera glides from station to station,
// and each scene type has its own animated overlay. Used by `rs lesson` (lesson markdown → film).
import React from 'react';
import {
  AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate,
  Reel, ReelProps, Shot, useBrand, useScene, useCam, useF, usePop, useReveal, fitFont, isLight,
  Title, Bullets, BigStat, Quote, Compare, ChartCard, Lenses, SvgIcon, Pill, Tag, EndScreen, Credit, Source, CoverFrame, Rich, Word,
} from './index';

export type LessonScene = {
  id: string; voiceover: string; type: string; chapter?: number;
  title?: string; kicker?: string; pill?: string; items?: string[]; value?: number; prefix?: string; suffix?: string; decimals?: number; label?: string;
  text?: string; author?: string; left?: {title: string; items: string[]}; right?: {title: string; items: string[]};
  chart?: {type?: 'line' | 'bar'; data: number[]; labels?: string[]; unit?: string; highlight?: number};
  photo?: {file: string; w: number; h: number}; caption?: string; icons?: {icon: string; label: string}[];
  term?: string; question?: string; options?: string[]; answer?: number; source?: string; sub?: string; actions?: string[];
};

const STEP_Y = 1700;
const station = (i: number) => ({x: i % 2 ? 2200 : 1040, y: 1100 + i * STEP_Y});
const worldSize = (n: number): [number, number] => [3240, 1100 + n * STEP_Y + 1100];
const plain = (t = '') => t.replace(/\*/g, '');
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Frames at which each item is spoken: first meaningful word of the item found in the scene's word timings, in order. */
function syncTimes(items: string[], words: Word[] | undefined, duration: number): number[] {
  const fallback = items.map((_, i) => Math.round(8 + (i * duration * 0.75) / items.length));
  if (!words?.length) return fallback;
  let from = 0;
  return items.map((it, i) => {
    const keys = plain(it).split(/\s+/).map(norm).filter((w) => w.length > 3).slice(0, 3);
    for (const k of keys) {
      const j = words.findIndex((w, idx) => idx >= from && norm(w.text).startsWith(k.slice(0, 6)));
      if (j >= 0) { from = j + 1; return Math.max(fallback[0], words[j].start - 4); }
    }
    return fallback[i];
  }).map((t, i, a) => (i && t < a[i - 1] ? a[i - 1] + 10 : t));
}

// ---------- the world: path, stations, photos (only what is near the camera is drawn) ----------
const LessonWorld: React.FC<{scenes: LessonScene[]}> = ({scenes}) => {
  const b = useBrand();
  const cam = useCam();
  const reach = 1500 / cam.zoom;
  const step = 56;
  const gx = Math.floor((cam.x - reach * 1.6) / step) * step, gy = Math.floor((cam.y - reach * 1.6) / step) * step;
  const near = (i: number) => Math.abs(station(i).y - cam.y) < reach + STEP_Y;
  return (
    <>
      <div style={{position: 'absolute', left: gx, top: gy, width: reach * 3.2, height: reach * 3.2, backgroundImage: `radial-gradient(${b.colors.muted}40 2.2px, transparent 2.7px)`, backgroundSize: `${step}px ${step}px`}} />
      {scenes.map((s, i) => {
        if (!near(i)) return null;
        const a = station(i), nx = i + 1 < scenes.length ? station(i + 1) : null;
        return (
          <React.Fragment key={s.id}>
            {nx ? (
              <svg style={{position: 'absolute', left: 0, top: a.y, overflow: 'visible'}} width={3240} height={STEP_Y}>
                <path d={`M${a.x},0 C${a.x},${STEP_Y * 0.55} ${nx.x},${STEP_Y * 0.45} ${nx.x},${STEP_Y}`} fill="none" stroke={b.colors.accent} strokeOpacity={0.5} strokeWidth={6} strokeDasharray="4 22" strokeLinecap="round" />
              </svg>
            ) : null}
            {s.type === 'chapter' ? (
              <div style={{position: 'absolute', left: a.x, top: a.y - 40, transform: 'translate(-50%,-50%)', fontFamily: b.display || b.font, fontSize: 1100, fontWeight: 700, lineHeight: 1, color: b.colors.accent, opacity: 0.12, letterSpacing: -40}}>{s.chapter}</div>
            ) : null}
            {s.type === 'photo' && s.photo ? (() => {
              const w = 900, h = Math.min(780, Math.round((w * s.photo.h) / s.photo.w));
              return (
                <div style={{position: 'absolute', left: a.x, top: a.y - 210, width: w, height: h, transform: `translate(-50%,-50%) rotate(${i % 2 ? 1.6 : -1.6}deg)`, background: '#fff', padding: 14, boxSizing: 'border-box', borderRadius: 8, boxShadow: '0 40px 70px -30px rgba(10,15,25,.55), 0 3px 8px rgba(10,15,25,.15)'}}>
                  <Img src={staticFile(s.photo.file)} style={{width: '100%', height: '100%', objectFit: 'cover', borderRadius: 3}} />
                </div>
              );
            })() : null}
            <div style={{position: 'absolute', left: a.x + (i % 2 ? -560 : 560), top: a.y - 860, transform: 'translate(-50%,-50%)', fontFamily: b.font, fontSize: 30, fontWeight: 700, letterSpacing: 4, color: b.colors.muted, opacity: 0.5}}>{String(i + 1).padStart(2, '0')}</div>
          </React.Fragment>
        );
      })}
    </>
  );
};

// ---------- overlays per scene type ----------
const Card: React.FC<{children: React.ReactNode; y?: number; delay?: number; w?: number}> = ({children, y = 720, delay = 4, w = 920}) => {
  const b = useBrand();
  const p = usePop(delay, 15);
  return (
    <div style={{position: 'absolute', left: 540, top: y, width: w, transform: `translate(-50%,-50%) translateY(${(1 - p) * 60}px)`, opacity: Math.min(1, p * 1.4), background: b.colors.card || '#fff', borderRadius: 40, padding: '46px 52px', boxSizing: 'border-box', boxShadow: '0 30px 60px -30px rgba(20,30,50,.45), 0 2px 6px rgba(20,30,50,.12)'}}>
      {children}
    </div>
  );
};

const ChapterCard: React.FC<{n?: number; title: string; total: number}> = ({n, title, total}) => {
  const b = useBrand();
  const p = usePop(4, 12);
  const r = useReveal(10, 22);
  const on = isLight(b.colors.accent) ? b.colors.bg1 : '#fff';
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', top: 160, height: 1000, gap: 40, display: 'flex', flexDirection: 'column'}}>
      <div style={{width: 230, height: 230, borderRadius: '50%', background: b.colors.accent, color: on, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: b.display || b.font, fontSize: 130, fontWeight: 700, transform: `scale(${p}) rotate(${(1 - p) * -40}deg)`, boxShadow: '0 30px 60px -25px rgba(0,0,0,.45)'}}>{n}</div>
      <div style={{fontFamily: b.font, fontSize: 28, fontWeight: 700, letterSpacing: 8, color: b.colors.muted, opacity: r}}>CAPITOLO {n} / {total}</div>
      <div style={{fontFamily: b.display || b.font, fontSize: fitFont(plain(title), {width: 900, lines: 3, max: 104, min: 58, charW: 0.5}), fontWeight: 650, lineHeight: 1.06, letterSpacing: -1, color: b.colors.text, textAlign: 'center', maxWidth: 940, transform: `translateY(${(1 - r) * 40}px)`, opacity: r}}><Rich text={title} /></div>
    </AbsoluteFill>
  );
};

const Definition: React.FC<{term: string; text: string}> = ({term, text}) => {
  const b = useBrand();
  const r = useReveal(16, 20);
  return (
    <Card y={700}>
      <div style={{fontFamily: b.font, fontSize: 26, fontWeight: 700, letterSpacing: 6, color: b.colors.accent}}>DEFINIZIONE</div>
      <div style={{fontFamily: b.display || b.font, fontSize: fitFont(plain(term), {width: 800, lines: 2, max: 92, min: 54, charW: 0.5}), fontWeight: 650, color: b.colors.text, lineHeight: 1.05, margin: '14px 0 22px'}}><Rich text={term} /></div>
      <div style={{height: 6, width: 120 * r, background: b.colors.accent, borderRadius: 3, marginBottom: 26}} />
      <div style={{fontFamily: b.font, fontSize: fitFont(plain(text), {width: 800, lines: 6, max: 46, min: 32}), fontWeight: 500, color: b.colors.text, lineHeight: 1.3, opacity: r}}><Rich text={text} /></div>
    </Card>
  );
};

const Quiz: React.FC<{question: string; options: string[]; answer: number}> = ({question, options, answer}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const s = useScene();
  // reveal right after the voice says "la risposta è…" (else at 72% of the scene)
  const ws = s?.words || [];
  const j = ws.map((w) => norm(w.text)).findLastIndex((w) => /^(rispost|soluzion|answer|corrett)/.test(w));
  const reveal = j >= 0 ? (ws[j + 1]?.start ?? ws[j].end) : Math.round((s?.duration || 200) * 0.72);
  const shown = f >= reveal;
  const tick = Math.max(0, Math.ceil((reveal - f) / fps));
  return (
    <AbsoluteFill style={{top: 200, height: 980, left: 70, right: 70, width: 'auto', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
        <Pill text="QUIZ" size={34} style={{alignSelf: 'flex-start'}} />
        {!shown && tick <= 5 ? <div style={{fontFamily: b.font, fontSize: 40, fontWeight: 800, color: b.colors.accent}}>{tick}</div> : null}
      </div>
      <div style={{fontFamily: b.display || b.font, fontSize: fitFont(plain(question), {width: 920, lines: 3, max: 76, min: 46, charW: 0.5}), fontWeight: 650, color: b.colors.text, lineHeight: 1.1}}><Rich text={question} /></div>
      {options.map((o, i) => {
        const p = spring({frame: f - 14 - i * 6, fps, config: {damping: 14}});
        const right = shown && i === answer, wrong = shown && i !== answer;
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 22, padding: '24px 30px', borderRadius: 28, background: right ? b.colors.accent : (b.colors.card || '#fff'), color: right ? (isLight(b.colors.accent) ? b.colors.bg1 : '#fff') : b.colors.text, opacity: Math.min(1, p * 1.4) * (wrong ? 0.45 : 1), transform: `translateX(${(1 - p) * -60}px) scale(${right ? 1.03 : 1})`, boxShadow: '0 20px 40px -24px rgba(20,30,50,.4)', fontFamily: b.font, fontSize: fitFont(plain(o), {width: 760, lines: 2, max: 42, min: 30}), fontWeight: 650}}>
            <div style={{width: 58, height: 58, flex: '0 0 auto', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: right ? 'rgba(255,255,255,.25)' : `${b.colors.muted}22`, fontWeight: 800}}>{right ? '✓' : String.fromCharCode(65 + i)}</div>
            <Rich text={o} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const PhotoOverlay: React.FC<{s: LessonScene}> = ({s}) => {
  const h = s.photo ? Math.min(780, Math.round((900 * s.photo.h) / s.photo.w)) : 640;
  const y = 750 + h / 2 + 40;
  return (
    <>
      {s.photo ? <Credit file={s.photo.file} x={90} y={y - 6} /> : null}
      {s.caption ? <AbsoluteFill style={{top: y + 40, height: 'auto', bottom: 'auto', display: 'flex', alignItems: 'center'}}><Pill text={s.caption} size={40} delay={10} /></AbsoluteFill> : null}
    </>
  );
};

const Scene: React.FC<{s: LessonScene; chapters: number}> = ({s, chapters}) => {
  const sc = useScene();
  switch (s.type) {
    case 'hook': return <Title text={s.title || ''} kicker={s.kicker} align="center" lines={4} />;
    case 'chapter': return <ChapterCard n={s.chapter} title={s.title || ''} total={chapters} />;
    case 'bullets': case 'steps': case 'recap': {
      const items = (s.items || []).slice(0, 5);
      return <Bullets title={s.title || (s.type === 'recap' ? 'Ricapitolando' : undefined)} items={items} numbered={s.type === 'steps'} at={syncTimes(items, sc?.words, sc?.duration || 200)} />;
    }
    case 'stat': return <>{<BigStat value={Number(s.value) || 0} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} label={s.label || ''} kicker={s.kicker} />}{s.source ? <Source text={s.source} /> : null}</>;
    case 'quote': return <Quote text={s.text || ''} author={s.author} />;
    case 'compare': return s.left && s.right ? <Compare left={s.left} right={s.right} /> : null;
    case 'chart': return s.chart ? <>{<ChartCard type={s.chart.type} data={s.chart.data} labels={s.chart.labels} unit={s.chart.unit} highlight={s.chart.highlight} title={s.title} y={700} h={600} />}{s.source ? <Source text={s.source} y={1060} /> : null}</> : null;
    case 'photo': return <PhotoOverlay s={s} />;
    case 'icons': {
      const items = (s.icons || []).slice(0, 4);
      const b = useBrand();
      return (
        <>
          {s.title ? <AbsoluteFill style={{top: 300, height: 'auto', bottom: 'auto', left: 80, right: 80, width: 'auto', textAlign: 'center', fontFamily: b.display || b.font, fontSize: fitFont(plain(s.title), {width: 900, lines: 2, max: 80, min: 50, charW: 0.5}), fontWeight: 650, color: b.colors.text}}><Rich text={s.title} /></AbsoluteFill> : null}
          <Lenses y={760} size={items.length > 3 ? 190 : 230} items={items.map((it) => ({node: <SvgIcon name={it.icon} size={items.length > 3 ? 92 : 112} color={b.colors.accent} stroke={1.8} />, label: it.label}))} />
        </>
      );
    }
    case 'definition': return <Definition term={s.term || s.title || ''} text={s.text || ''} />;
    case 'quiz': return <Quiz question={s.question || ''} options={(s.options || []).slice(0, 4)} answer={s.answer ?? 0} />;
    case 'end': return <EndScreen title={s.title || 'Hai imparato\nqualcosa di nuovo'} sub={s.sub} actions={s.actions || ['Salva', 'Condividi', 'Segui']} />;
    default: return <Title text={s.title || s.text || plain(s.voiceover).split(/[.!?]/)[0]} align="center" />;
  }
};

/** Chapter HUD: which chapter we are in, top left, plus the minute mark. */
const Hud: React.FC<{scenes: LessonScene[]; from: number[]; chapters: string[]}> = ({scenes, from, chapters}) => {
  const b = useBrand();
  const f = useCurrentFrame();
  let i = from.findIndex((x, k) => f >= x && (k === from.length - 1 || f < from[k + 1]));
  if (i < 0) i = 0;
  const s = scenes[i];
  if (!s || s.type === 'end' || s.type === 'hook' || !s.chapter) return null;
  const t = chapters[s.chapter - 1] || '';
  return (
    <AbsoluteFill style={{top: 140, left: 70, height: 'auto', bottom: 'auto', width: 'auto', right: 'auto'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '10px 22px 10px 10px', borderRadius: 999, background: `${b.colors.card || '#fff'}E6`, boxShadow: '0 10px 30px -18px rgba(0,0,0,.4)', fontFamily: b.font, fontSize: 26, fontWeight: 650, color: b.colors.text, maxWidth: 760, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
        <span style={{width: 44, height: 44, borderRadius: '50%', background: b.colors.accent, color: isLight(b.colors.accent) ? b.colors.bg1 : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800}}>{s.chapter}</span>
        {plain(t)}
      </div>
    </AbsoluteFill>
  );
};

export const LessonFilm: React.FC<ReelProps> = (props) => {
  const {timeline, reel} = props;
  const scenes: LessonScene[] = reel.scenes || [];
  const chapters: string[] = scenes.filter((s) => s.type === 'chapter').map((s) => s.title || '');
  const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
  const idx = Object.fromEntries(scenes.map((s, i) => [s.id, i]));
  const camera: Record<string, Shot> = {};
  for (const s of scenes) {
    const a = station(idx[s.id]);
    camera[s.id] = s.type === 'chapter' ? {x: a.x, y: a.y, zoom: 0.62, move: 40} : s.type === 'photo' ? {x: a.x, y: a.y + 0, zoom: 1, move: 34} : {x: a.x, y: a.y, zoom: 1, move: 34};
  }
  const views = Object.fromEntries(scenes.map((s) => [s.id, () => <Scene s={byId[s.id]} chapters={chapters.length} />]));
  const from = timeline.scenes.map((s) => s.from);
  return (
    <Reel {...props} scenes={views} world={<LessonWorld scenes={scenes} />} worldSize={worldSize(scenes.length)} camera={camera} drift={0.03} transition={10}
      overlay={<Hud scenes={timeline.scenes.map((t) => byId[t.id]).filter(Boolean)} from={from} chapters={chapters} />} />
  );
};

export const LessonCover: React.FC<ReelProps> = ({brand, reel}) => {
  const scenes: LessonScene[] = reel.scenes || [];
  const hook = scenes.find((s) => s.type === 'hook');
  return (
    <CoverFrame brand={brand} world={<LessonWorld scenes={scenes} />} worldSize={worldSize(scenes.length)} shot={{x: station(0).x, y: station(0).y, zoom: 1}}>
      <Title text={hook?.title || reel.title || ''} kicker={hook?.kicker} align="center" />
    </CoverFrame>
  );
};

export default LessonFilm;
