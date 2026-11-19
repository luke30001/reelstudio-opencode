# ReelStudio for OpenCode

Make short vertical videos (Instagram Reels, TikTok, YouTube Shorts) on your Mac with
[OpenCode](https://opencode.ai). OpenCode is the producer: it writes the script, codes the
scenes and checks its own frames. OpenRouter does the voice (Gemini or ElevenLabs), the
illustrations and the word timings. Remotion and ffmpeg render the MP4 on your computer.

![ReelStudio](docs/showcase.jpg)

This is the OpenCode edition of [reelstudio-codex](https://github.com/luke30001/reelstudio-codex).
Same engine, same looks, no Codex: the skill, the producer agent and the app are native
OpenCode V2.

## Requirements

- macOS with [OpenCode](https://opencode.ai/docs/) (V2) installed and signed in to a model
- Node.js 20+ and ffmpeg: `brew install node ffmpeg`
- An [OpenRouter](https://openrouter.ai/keys) key (a few dollars of credit is enough)

## Install

```bash
git clone https://github.com/luke30001/reelstudio-opencode.git
cd reelstudio-opencode
./install.sh
```

The installer:

1. copies the `reelstudio` skill to `~/.config/opencode/skills/reelstudio` (replacing an older copy),
2. installs the `reelstudio-producer` agent and the `/reel` command,
3. installs the `reelstudio` launcher in `~/.local/bin`,
4. sets up the engine in `~/ReelStudio` (the first run downloads Remotion with npm),
5. asks for your OpenRouter key when run in a terminal.

Everything is plain files: no daemon, no cloud account beyond OpenRouter.

### Install somewhere else

```bash
XDG_CONFIG_HOME=~/somewhere ./install.sh   # skill/agent/command under ~/somewhere/opencode
REELSTUDIO_HOME=~/Videos/ReelStudio ./install.sh   # data and engine elsewhere
```

### The only credential: your OpenRouter key

Voice, images and word timings all go through OpenRouter. The key is saved in
`~/ReelStudio/.env`, readable only by you. To set or change it later, run this yourself in
the Terminal app:

```bash
reelstudio key
```

It reads the key without showing it. Never paste the key into a chat.

## Use

In OpenCode:

```text
/reel why lists help your memory
```

or just ask: "make me a 30 second reel about …". OpenCode shows you the script first, then
does the voice, the images, the frame check and the render. Videos end up in
`~/ReelStudio/reels/<name>/final.mp4`.

**Premium editorial look (the zoom format):** pick the `editoriale` brand (or point your
brand at the `editoriale` look). OpenCode builds one big vector world for the story and a
virtual camera glides and zooms over it, with a serif headline, a red pill, anchored
labels, rings, measures, stat cards and animated charts. Edit
`~/ReelStudio/brands/editoriale.json` to set your name, handle and voice.

**Long lessons:** `reelstudio lesson make lesson.md --minutes 4` turns a markdown lesson
into a 3–10 minute vertical film with local Piper narration and real photos. Needs
`uv tool install 'piper-tts[alignment]'` once.

### The web app

```bash
node ~/.config/opencode/skills/reelstudio/app/server.mjs
```

→ http://localhost:4748. It runs `opencode run --agent reelstudio-producer` for every job,
shows the script, the frames, the versions and the cost, and lets you approve, revise or
stop. The producer model is chosen in Settings (it must be able to see images).

You can also create a macOS app: `reelstudio install-app`.

## Update

```bash
cd reelstudio-opencode && git pull
./install.sh
```

or, from anywhere:

```bash
reelstudio update
```

Both replace the skill and refresh the engine; your reels, brands, looks and key stay.

## Uninstall

```bash
./uninstall.sh           # skill, agent, /reel, launcher; keeps ~/ReelStudio
./uninstall.sh --purge   # also deletes ~/ReelStudio (reels and key)
```

## Layout

```text
skills/reelstudio/SKILL.md      the producer's playbook (OpenCode skill `reelstudio`)
skills/reelstudio/engine/       the `rs` engine: voice, images, timings, Remotion render
skills/reelstudio/seed/         starter brands and looks
skills/reelstudio/app/          local web app that drives `opencode run`
agents/reelstudio-producer.md   headless agent with scoped permissions (installed to ~/.config/opencode/agents)
commands/reel.md                the /reel command (installed to ~/.config/opencode/commands)
bin/reelstudio                  launcher: setup, update, doctor, key, version + the engine
install.sh / uninstall.sh       installer and uninstaller (macOS)
VERSION                         released version
```

The skill uses `@SKILL_DIR@` in the repository; `install.sh` replaces it with the real
path on this machine, so the same files work in any home directory.

## How a reel is made

1. **Brief** – topic, brand, language, length.
2. **Script** – `reel.json` with 5–9 scenes, one idea each.
3. **Voice** – OpenRouter TTS + word timestamps, polished to a natural pace (raw take kept,
   `rs voice <reel> --repolish` redoes the polish for free).
4. **Visuals** – real Wikimedia photos, AI images (4K for camera worlds), vector charts and
   icons, mixed per shot.
5. **Scenes** – `src/Reel.tsx` from the component library (`Title`, `BigStat`, `WorldImage`,
   `Headline`, `StatCard`, `EndScreen`, …) or the camera-world zoom format.
6. **Self-check** – `rs frames` renders stills, OpenCode opens every PNG and fixes what is
   wrong.
7. **Render** – `final.mp4` + `cover.png`, versioned, mixed to −14 LUFS.

## Troubleshooting

- `reelstudio doctor` checks Node, ffmpeg, OpenCode, skill, engine and whether OpenRouter
  accepts your key.
- The first `rs setup` downloads Remotion: it needs the network and a few minutes.
- If OpenCode does not see the skill, confirm the file is
  `~/.config/opencode/skills/reelstudio/SKILL.md` and run `/reload`.
- Reels and brands are normal files: back up `~/ReelStudio` and you keep everything.
