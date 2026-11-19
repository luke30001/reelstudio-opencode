---
name: ReelStudio
description: Make short vertical videos (Instagram Reels, TikTok, YouTube Shorts) locally with ReelStudio. You (the OpenCode agent) write the script, plan and code the scenes, and check your own frames; OpenRouter does the voice (ElevenLabs v4 Turbo), images (MAI-Image-2.7, GPT Image 2.6 Sunburst for hero shots) and word timestamps; Remotion renders the MP4 on this Mac. Use when the user asks for a reel, short, TikTok, vertical video, video from a topic or script, or asks about their ReelStudio reels, brands or voices.
---

# ReelStudio: topic in, reel out

You are the producer and the crew. Do what only you can do (writing, directing, coding scenes, judging frames) and run `rs` with the shell tool for what you can't (voice, images, timestamps, rendering).

```bash
RS="node @SKILL_DIR@/engine/bin/rs.mjs"
```

`$RS` below is shorthand: shell state does not persist between tool calls, so write the full `node …/rs.mjs <cmd>` each time. Run each command on its own (no `cd … &&` chains or pipes), so permission rules match cleanly. Commands that render (`setup`, `frames`, `render`) can take a few minutes: use a generous timeout.

Everything lives in `~/ReelStudio/`: `reels/<name>/`, `brands/*.json`, `looks/<id>/look.json` (+ mascot and reference images), `.env` (OpenRouter key), `config.json` (optional model overrides). The user can also drive everything from the OpenCode web app: `node @SKILL_DIR@/app/server.mjs` (http://127.0.0.1:4748; it runs `opencode run` as the producer).

## 0. First time
Run `$RS setup` (copies the engine, installs Remotion once, makes the `default` brand). If it reports no OpenRouter key, voice and images cannot run: stop and tell the user to set it themselves (in their own Terminal: `reelstudio key`, or `OPENROUTER_API_KEY=...` in `~/ReelStudio/.env`). Never ask them to paste the key into chat. Re-run `$RS setup` after updating this skill (or run `reelstudio update` in a terminal).

## 1. Brief
Get the topic (or the user's script), the brand (`$RS list` shows brands and looks), the language and the target length (default 25–40 s). For premium editorial quality (smooth camera zooms over one world, serif headline, red pill, clean cards) use a brand with the `editoriale` look (or `cronaca` for history and true stories with real photos, brand `storia`) and the zoom format of step 5b; any topic works. Read `~/ReelStudio/brands/<brand>.json` and follow its `tone`.

**The look is the creative line.** Every brand points to a look in `~/ReelStudio/looks/<id>/look.json`. Read it before writing anything and obey its `bible` (layout rules, mascot use, what to avoid). Its colors, font, caption style and background are applied automatically. Its `imageStyle` and reference images are added to every `rs image` call automatically, so all images in the brand share one style. Every reel of a brand must look like part of the same series.

## 2. Script and storyboard
`$RS new "<topic>" --brand <brand>` prints the reel name. Write `reels/<name>/reel.json`:

```json
{"title": "...", "brand": "default", "scenes": [
  {"id": "hook", "voiceover": "...", "visual": "what is on screen", "hold": 0.2}
]}
```

Rules for the script:
- **Hook in the first 2 seconds**: a surprising claim, number or question. No "Ciao a tutti", no "In questo video".
- 5–9 scenes, one idea each, 6–20 words of voiceover per scene. Short spoken sentences. Write numbers the way they should be spoken ("quattro", not "4"), because the TTS reads exactly what you write.
- Facts must be true. If you're not sure of a number, leave it out.
- End with a payoff, then a short CTA scene (follow, save, comment a word). The CTA always gets **its own clean screen**: `<EndScreen title="…" sub="…" actions={['Salva', 'Segui']} />` (opaque brand background that covers the world/photos, mascot if the look has one, brand handle pill). Never lay the CTA over photos, a world or another scene's visuals.
- `id`s are short, stable slugs. Changing a scene's `voiceover` re-voices only that scene.

Show the user the script (voiceover lines only) and wait for an OK before spending on voice, unless they said to go straight through.

## 3. Voice and timing
`$RS voice <name>`: generates one MP3 per scene with **Gemini 3.8 Flash TTS** (voice Charon: #1 in the TTS arena, native-sounding Italian) via OpenRouter, gets word timestamps from Nemotron transcription, and writes `timeline.json` (frames at 30 fps per scene and per word). The brand's `voice.instructions` steers tone and pace (write them in the reel's language, e.g. "tono da documentario, ritmo deciso"). Options: `--scene id1,id2` to redo some scenes, `--voice <name>` (Gemini: Charon, Kore, Puck, Aoede, Fenrir, Leda, Orus, Zephyr…), `--tier eleven` (ElevenLabs v4: most expressive, understands `[excited]` `[whispers]` `[pause]` tags, but its premade voices are English speakers), `--tier native` (Microsoft MAI-Voice-2.1, true it-IT voices Luca/Rosa, slower and pausier), `--tier budget`, `--local` (robotic macOS draft voice: **only when the user explicitly asks for a free draft**. Never use it as a fallback: if `voice` fails because of the network or the key, fix that, e.g. re-run the same command with network access, and `render` refuses draft-voice scenes anyway). Every clip is polished automatically: dead air trimmed at both ends, only pauses over 0.65 s shortened (normal breathing pauses stay, or the voice sounds out of breath), gentle EQ and level (`--raw-voice` skips it); the untouched take is kept in `assets/vo/raw/`, and `voice <reel> --repolish` redoes the polish without paying for a new take. The render brings the mix to −14 LUFS. Scenes follow each other with a 0.2 s `hold`; raise it for a deliberate dramatic beat (0.5–0.8). Voice instructions get a natural-pace note; set `"pace": "free"` in the brand voice to drop it. With `--speed` above 1.3 even a calm voice starts to sound breathless: suggest 1.2–1.3 for speech-heavy reels. Write voiceover as connected sentences that flow into the next scene, not isolated captions. A brand can pin voices per model: `"voice": {"voices": {"google/gemini-3.8-flash-tts": "Kore"}}`.

## 4. Visual material: choose what serves each shot
Nothing is forced: per shot, pick the material that looks best and is honest, and mix freely. Ask the user's limit for paid images (default ≤ 4).
- **Real photos** (history, news, real places, people, objects that exist): `$RS photo <name> search "<english query, year, place>"` lists free-licensed results from Wikimedia Commons (public domain, CC0, CC BY/BY-SA) and writes `frames/photos-sheet.png` (4 per row, list order): look at it, pick, then `$RS photo <name> get <n> <imgname>` → `assets/img/<imgname>.jpg` (up to 3000 px) with author/license saved in `assets/credits.json`. Always show the credit (`<Credit file="img/x.jpg" />`, or `<Photo … credit>`). Prefer real photos over AI pictures whenever the subject really existed; never present an AI image as a historical photo.
- **AI images** (illustration, concepts, reconstructions, scenes no camera caught): `$RS image <name> <imgname> "<prompt>"` with the look's art direction and references.
  - `--world`: Nano Banana 2.1 at **4K** (3072×5504, ~$0.12): a picture big enough to be the camera's world or a large print; stays sharp up to ~2.8× zoom.
  - `--res 2K|4K` with `--model bytedance-seed/seedream-4.5` (4K, $0.04, denser detail) or other models that support it; `--aspect 1:1|3:4|16:9` for non-vertical prints.
  - default (MAI-Image-2.7, ~800 px, ~$0.035) and `--hero` (GPT Image 2.6 Sunburst, best detail, ~860 px, ~$0.15–0.21): only for small cards or inserts, never for deep zooms or full-screen backgrounds.
  - `--mascot`, `--ref img/other.png` (continuity), `--no-style`. Describe subject and composition; the look handles the style. Always add "vertical composition, no text" (or the right aspect). Look at every image you generate (open the PNG with the read tool).
- **Vector (SVG/React)** where it is cleaner than any picture: charts, numbers, maps and diagrams, timelines, icons (`$RS icon <name> <lucide-name…>`), UI, labels. Build it with care: consistent stroke widths, the look's palette only, soft shadows and gradients, generous spacing. Never fake an object or a scene with crude shapes: if it needs a drawing, use an AI image; if it existed, use a photo.
- Resolution rule: on screen an image must never be shown larger than its pixel width (zoom × world width ≤ PNG width); `rs frames` will show blur if you break it.

## 5. Build the scenes: `reels/<name>/src/Reel.tsx`
Compose the components from `@rs` (source: `@SKILL_DIR@/engine/src/lib/index.tsx`, read it when you need detail):

```tsx
import React from 'react';
import {Reel, Title, BigStat, Bullets, Quote, Compare, Icon, Card, CTA, ImageBG, Mascot, CoverFrame, BrandBG, ReelProps} from '@rs';

export default (p: ReelProps) => (
  <Reel {...p}
    scenes={{
      hook: <><Title kicker="Psicologia" text="Il tuo cervello *ama* le liste" /><Mascot pos="peek" /></>,
      stat: <BigStat value={4} prefix="≈" label="elementi nella *memoria di lavoro*" />,
      why:  <Bullets title="Perché funzionano" items={['Divide il problema', 'Riduce lo *sforzo*']} />,
      cta:  <CTA text="Altri trucchi sul *cervello*" />,
    }}
    backgrounds={{ hook: <ImageBG src="img/brain.png" /> }}
  />
);

// Optional: a cover image. Animations render already finished here.
export const Cover = (p: ReelProps) => (
  <CoverFrame brand={p.brand}><BrandBG /><Title text="Il tuo cervello *ama* le liste" /><Mascot pos="peek" /></CoverFrame>
);
```

- Every scene id in `reel.json` needs an entry in `scenes`. `*word*` puts that word in the accent color.
- Components: `Title`, `Kicker`, `BigStat` (count-up), `Bullets` (reveal timed across the scene, or `at=[frames]` synced to `timeline.json` word frames), `Quote`, `Compare` (two columns), `Icon` (big emoji), `Card` (framed image), `CTA`, `ImageBG` (full-bleed Ken Burns), `BrandBG` (the look's background: paper, gradient or solid; it is the default background), `Mascot` (the look's mascot: `pos="peek"` slides in from the right edge, `"corner"` sits bottom-right of the content area, `"center"` is a large hero; `src="img/pose.png"` uses a generated pose). Overlays are automatic: karaoke captions, progress bar, handle. Turn them off with `captions={false}` and similar props.
- On-screen text **complements** the voiceover. Don't repeat it word for word, because the captions already do that. Keep it to 2–7 words per scene.
- Custom visuals are fine: write your own React components in `src/` with `useF()`, `useScene()`, `useBrand()`, `interpolate`, `spring`, `fitFont`, `Stage` from `@rs`. Keep everything deterministic (no `Math.random`, no `Date`).
- **Safe zones** (1080×1920): content between y=200 and y=1180, inside `Stage`. Captions sit at y≈1250–1450. Nothing important below y=1500, where Instagram puts its UI.
- Vary the layouts: never use the same component three scenes in a row.

## 5b. The zoom format (premium editorial quality)
The way to reach top-tier explainer quality on any topic, with the `editoriale` look (clean explainers) or the `cronaca` look (history, economy, true stories with real photos): **one big world, one camera that glides and zooms over it, never a hard cut.** Read the look's `bible` and follow it. The world can be made of real photos, 4K AI images and vector pieces in any mix (step 4).

```tsx
import React from 'react';
import {Reel, ReelProps, Headline, Pill, StatCard, Badge, ChartCard, Source, Credit, Grain, At, WorldGround, WorldImage, EndScreen, CoverFrame, AbsoluteFill, useBrand, useReveal} from '@rs';

const W: [number, number] = [3240, 6300];
// Prints laid out on a paper table, far apart so the camera travels (photos from `rs photo`, 3000 px wide)
const P = {crowd: {x: 1050, y: 1600, w: 1600, h: 1186, r: -2}, line: {x: 2200, y: 5050, w: 1500, h: 1206, r: 1.5}};
const world = (
  <>
    <WorldGround w={W[0]} h={W[1]} pattern="lines" step={64} />
    {Object.entries(P).map(([k, p]) => <WorldImage key={k} src={`img/${k}.jpg`} x={p.x} y={p.y} w={p.w} h={p.h} rotate={p.r} radius={6} grade="bw" />)}
    {/* museum-style labels, a red thread between prints, an AI 4K image or SVG pieces can live here too */}
  </>
);
const OVER = {x: 1620, y: 3250, zoom: 0.34};
const Dim = () => { const b = useBrand(); const o = useReveal(0, 16); return <AbsoluteFill style={{background: b.colors.bg1, opacity: 0.82 * o}} />; };

export default (p: ReelProps) => (
  <Reel {...p} world={world} worldSize={W} overlay={<Grain amount={0.14} />}
    camera={{
      hook: OVER,                                                                  // overview of the whole table
      crowd: [{x: 1050, y: 1850, zoom: 0.62}, {x: 1170, y: 1720, zoom: 0.95, at: 0.42, move: 40}], // fly in, then dive into a detail
      chart: {x: 1620, y: 4400, zoom: 0.42},                                       // pull back, dim the world, show data
      line: {x: 2200, y: 5280, zoom: 0.64},
      cta: OVER,
    }}
    scenes={{
      hook: <Headline title={'Il Giovedì nero\ndi Wall Street'} pill="−11% in poche ore" />,
      crowd: <><StatCard value={12.9} decimals={1} suffix=" mln" label="azioni scambiate: *un record*" y={900} w={680} delay={150} /><Credit file="img/crowd.jpg" y={1165} /></>,
      chart: <><Dim /><ChartCard type="line" data={[381, 199, 294, 41]} labels={['set 1929', '', '', 'lug 1932']} title="Dow Jones, 1929–1932" x={540} y={720} w={940} h={640} /><Badge value="−89%" label="dal massimo" x={540} y={1150} color="#B3261E" delay={150} /><Source text="Fonte: S&P Dow Jones Indices" y={1215} /></>,
      line: <><StatCard value={25} suffix="%" label="disoccupati negli USA nel 1933" y={880} w={720} /><Credit file="img/line.jpg" y={1170} /></>,
      cta: <EndScreen title={"Storie che hanno\ncambiato l'economia"} sub="Ogni settimana una crisi, spiegata" actions={['Salva', 'Segui']} />,  // own screen, never over the world
    }}
  />
);
export const Cover = (p: ReelProps) => (
  <CoverFrame brand={p.brand} world={world} worldSize={W} shot={{x: 1050, y: 1900, zoom: 0.62}}>
    <Headline title={'Il Giovedì nero\ndi Wall Street'} pill="24 ottobre 1929" /><Grain />
  </CoverFrame>
);
```

- **World**: children of `world` are in world px; `At` places anything (centered), `WorldGround` gives a subtle texture so moves read as motion (`dots`, `grid`, `lines`), `WorldImage` adds a framed print (`grade="bw"|"sepia"|"faded"|"punch"`, `frame`, `rotate`, `radius`). A single `--world` 4K AI image can also be the whole world (`<WorldImage … frame={false} shadow={false} radius={0} w={3072} h={5504} />`, `worldSize={[3072, 5504]}`, zoom 0.36–1). Build the places of the story far apart (≥ 900 px) so the camera really travels. Icons: `$RS icon <name> <icon…>` then `<SvgIcon name=…>`. Make the world taller than the lowest place by at least half a screen at your zoom (the camera is clamped inside the world, so a place near the edge cannot be centered).
- **Photos on screen** (without a world, or over it): `<Photo src="img/x.jpg" full grade="bw" dim={0.4} />` full-bleed with a slow Ken Burns (`from`/`to` = [scale, x%, y%]) or framed `<Photo src x y w h rotate />`; both print the credit. `<Grain />` (as `overlay`) adds film grain and a vignette for archival stories.
- **Camera**: `camera={{sceneId: Shot | Shot[]}}`, `Shot = {x, y, zoom, at?, move?, fly?}`. `x, y` is the world point at the center of the screen; zoom 0.33 shows a 3240-wide world whole, 1 = world px are screen px, 2–3.5 = detail. A move takes `move` frames (default 26, eased in-out); long moves dip out ("fly") automatically. While a shot holds the camera pushes in slowly (`drift`, default 4%). Every scene gets at least one shot; vary scale (overview → detail → another detail → overview).
- **Overlays (screen-space, follow the camera)**: `Headline` (kicker = brand name, `title` with `\n` for the 2-line break, `pill` = the twist; `enter={false}` to keep it in place in later scenes), `Pin at=[x,y] label side`, `Ring at r label` (r in world px), `Measure from to label`, `Spotlight at r`, `Badge value label x y arrow color`, `StatCard value suffix label x y`, `ChartCard type="line"|"bar" data labels title unit highlight x y w h`, `Lenses items=[{src|node,label,highlight}]`, `Tag`, `Pill`, `Source text`, `Credit file`. Use `useCam().toScreen([x,y])` to anchor custom overlays. To show data over the world, pull the camera back and lay a `Dim` (bg1 at ~80%) under the card. Keep cards from covering credits and captions (content y 200–1200).
- **Typography**: the look loads a serif `display` font for `Headline`; everything else is Inter. Two fonts only. Headline ≤ 2 lines, pill ≤ 4 words.
- **Quality bar** (check it in the frames): generous margins (≥ 70 px), nothing touching the edges, aligned centers, white cards with soft shadows, one accent color, no emoji, no clutter (≤ 3 overlays at once), every number with a `Source`, every real photo with its `Credit`, no image shown above its native resolution, no crude SVG standing in for a real object, the camera never static for a whole scene and never cutting. The captions stay (pill style) unless the user turns them off.

## 6. Self-check (mandatory)
`$RS frames <name>` renders two stills per scene to `reels/<name>/frames/` (`<id>-a` shortly after entry, `<id>-b` near the end). A bundling error means a code bug: fix it and run again. For a minified React error ("Minified React error #…"), run the same command with `RS_DEV=1` in front to get the readable message. With a camera world add `--strip`: one `<id>-strip.png` per scene with 5 moments (0, 15, 35, 60, 90%) to judge the moves.
**Open every PNG with the read tool** and check: text cut off or overflowing, overlaps with the captions, unreadable contrast on images, an empty or broken scene, typos, too much text, the same layout over and over, labels pointing at the wrong place, a blurry image (zoomed past its resolution), a move that goes nowhere. Fix `Reel.tsx` (or regenerate an image) and run `frames` again until it's clean. Check one exact moment with `--at <frame>`. Two rounds are normal.

## 7. Render
`$RS render <name>` produces `out/vN.mp4` (a new version on every render), `final.mp4` and `cover.png`. A 30 s reel takes about 1–2 minutes. To make it faster ("velocizza 1.5x"), put `"speed": 1.5` in `reel.json` (kept on every re-render) or pass `--speed 1.5`: the whole video plays faster, the voice keeps its pitch, every frame is kept (30 fps × speed, max 60). Write the timings for normal speed; check frames at normal speed.
To re-brand a reel, copy its folder to a new name (without `out/`, `frames/`, `final.mp4`), change `brand` in `reel.json`, run `voice --force` (the new brand's voice instructions), replace hard-coded colors in `Reel.tsx` with the brand's, then frames and render. Give the user the paths, the duration and the cost of the paid calls. Suggest a caption and 3–5 hashtags in the brand's language.

## 8. Long lessons (optional)
When the user gives you a markdown lesson (or asks for a long film, 3–10 minutes, not a reel), use the lesson pipeline: `$RS lesson make <lesson.md> --minutes 4 --brand <brand>`. It plans typed scenes with the lesson planner model, pulls real photos from Wikimedia Commons, speaks with the local Piper voice (word timings included) and renders the `LessonFilm` composition. Check the frames exactly like step 6 and render with the same command. Piper needs a one-time `uv tool install 'piper-tts[alignment]'`; tell the user rather than installing it for them. Everything lives in the same `reels/<name>/` folder, with `kind: "lesson"` in `reel.json`.

## Edits later
"Change scene 3" means: edit `reel.json` and/or `Reel.tsx`, run `$RS voice <name>` (only changed scenes are redone), then `frames` and `render`. The earlier versions stay in `out/`.

## Models
Picks and the reasons for them are in `@SKILL_DIR@/engine/models.json`. `$RS models` lists the live OpenRouter catalog for speech, image and transcription. If the user asks to re-evaluate the models, compare the catalog with the Artificial Analysis arenas (text-to-speech, text-to-image, speech-to-text), test the candidate with one real call, and put the winner in `~/ReelStudio/config.json`, e.g. `{"tts": {"model": "..."}}`.
