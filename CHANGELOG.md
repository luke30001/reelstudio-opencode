# Changelog

## 0.5.0
- OpenCode edition: the skill is `reelstudio` (`~/.config/opencode/skills/reelstudio`), with a `/reel` command and a `reelstudio-producer` agent for headless runs.
- The web app drives `opencode run --format json` instead of `codex exec`; port 4748, settings in `~/ReelStudio/app-settings.json`.
- Portable install: paths are filled in at install time (`@SKILL_DIR@`), `XDG_CONFIG_HOME` and `REELSTUDIO_HOME` are respected.
- `install.sh` replaces an older copy instead of stacking versions; new `uninstall.sh`.
- `reelstudio` launcher: `setup`, `update` (git pull + reinstall), `doctor`, `key`, `version`.
- Long lessons: `rs lesson make lesson.md` plans typed scenes, narrates with local Piper and renders a 3–10 minute vertical film.
- Based on reelstudio-codex 0.4.5 (natural voice pacing, raw takes, `--repolish`, −14 LUFS mix).

## 0.4.5
- Voice no longer sounds out of breath: normal breathing pauses are kept (only pauses over 0.65 s are shortened), the compressor is much gentler so breath noise is not pumped up, and the voice instructions ask for a natural, relaxed pace.
- 0.2 s between scenes (about 0.45 s of silence in all, like a sentence break).
- The untouched take is kept in `assets/vo/raw/`; `voice <reel> --repolish` redoes the polish without paying for a new take.

## 0.4.4
- Smoother voice: every clip is trimmed at both ends, pauses over 0.3 s are shortened, and a light EQ and compressor even it out. In a test reel the dead air dropped from 5.4 s to 0.6 s.
- The final video is mixed to -14 LUFS, the usual level for Reels and TikTok (it was about -18, too quiet).
- Scenes follow each other with a 0.1 s gap instead of about 0.8 s; voice instructions ask for a fluid pace (`"pace": "free"` in a brand turns that off); `--raw-voice` skips the polish.

## 0.4.3
- No more robotic voice by surprise: the macOS draft voice is used only when you ask for it (`--local`), and `render` refuses draft-voice scenes. A missing key or a network blocked by the Codex sandbox now stops with a clear message instead of falling back silently.
- New commands: `reelstudio doctor` (health check, including whether OpenRouter accepts your key), `reelstudio update` (latest version from GitHub in one step), `reelstudio version`, `reelstudio help`.
- `install.sh` offers to install Node.js 20+ and ffmpeg with Homebrew and ends with a health check.
- New README with a preview, troubleshooting and uninstall steps; CI checks on every push.

## 0.4.2
- The call to action is its own full screen (`EndScreen`): opaque brand background, mascot, title, handle and actions, never on top of photos.
- Fixed a stale render cache that could crash the last scenes; `RS_DEV=1` shows readable React errors.

## 0.4.1
- `render --speed 1.5` (or `"speed"` in reel.json): faster cut, voice pitch kept.
- Components use the brand font; the mascot blends into light paper backgrounds.

## 0.4.0
- Real archive photos from Wikimedia Commons (free licenses, automatic credits), with grading, grain and Ken Burns.
- 4K AI images for shots the camera zooms into.
- Gemini TTS, voice Charon: native-sounding Italian. ElevenLabs and Microsoft voices as options.
- `reelstudio key`: hidden prompt, key saved with chmod 600.

## 0.3.0
- Camera zoom format: one world per story, a virtual camera that glides and zooms between shots, editorial kit (headline, pill, pins, rings, stat cards, charts).
