#!/bin/sh
# shellcheck disable=SC2088  # "~/..." in messages is meant literally
# ReelStudio for OpenCode: installer (macOS).
#   git clone https://github.com/luke30001/reelstudio-opencode.git && cd reelstudio-opencode && ./install.sh
# Installs the skill, the producer agent, the /reel command and the reelstudio launcher,
# then sets up the engine in ~/ReelStudio. The only credential is the OpenRouter key:
# in a terminal the script asks for it hidden and saves it in ~/ReelStudio/.env (chmod 600).
set -e
DIR=$(cd "$(dirname "$0")" && pwd)
RS_HOME="${REELSTUDIO_HOME:-$HOME/ReelStudio}"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
SKILL_DIR="$CONFIG/skills/reelstudio"
QUIET=""
if [ "${1:-}" = "--quiet" ]; then QUIET=1; fi
ok() { [ -n "$QUIET" ] || printf '✓ %s\n' "$1"; }
warn() { printf '! %s\n' "$1"; }
has() { command -v "$1" >/dev/null 2>&1; }
say() { [ -n "$QUIET" ] || printf '%s\n' "$1"; }
VERSION=$(tr -d '[:space:]' < "$DIR/VERSION")

[ "$(uname)" = "Darwin" ] || warn "ReelStudio is built for macOS; other systems are untested."
if ! has opencode && [ ! -x "$HOME/.local/bin/opencode" ]; then
  echo "✗ OpenCode CLI not found: install it from https://opencode.ai/docs/ first"; exit 1
fi

# Node.js 20+ and ffmpeg: offered through Homebrew when missing
need=""
if has node; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "$NODE_MAJOR" -ge 20 ] || need="$need node"
else need="$need node"; fi
has ffmpeg || need="$need ffmpeg"
if [ -n "$need" ]; then
  if has brew && [ -t 0 ]; then
    printf 'ReelStudio needs:%s. Install with Homebrew now? [Y/n] ' "$need"; read -r yn
    case "$yn" in [nN]*) echo "✗ Install them yourself:  brew install$need"; exit 1;; esac
    for f in $need; do if has "$f"; then brew upgrade "$f" || true; else brew install "$f"; fi; done
  else
    echo "✗ Missing:$need. Install them (with Homebrew: brew install$need) and run ./install.sh again"; exit 1
  fi
fi
ok "Node.js $(node -p 'process.versions.node') and ffmpeg"

# 1. skill: replace any older copy, then fill in this machine's paths
mkdir -p "$CONFIG/skills" "$CONFIG/agents" "$CONFIG/commands"
rm -rf "$SKILL_DIR"
mkdir -p "$SKILL_DIR"
(cd "$DIR/skills/reelstudio" && tar -cf - .) | (cd "$SKILL_DIR" && tar -xf -)
printf '%s\n' "$VERSION" > "$SKILL_DIR/VERSION"
sed -i '' "s|@SKILL_DIR@|$SKILL_DIR|g" "$SKILL_DIR/SKILL.md"
ok "skill reelstudio $VERSION → $SKILL_DIR"

# 2. producer agent and /reel command
sed -e "s|@SKILL_DIR@|$SKILL_DIR|g" -e "s|@HOME@|$HOME|g" "$DIR/agents/reelstudio-producer.md" > "$CONFIG/agents/reelstudio-producer.md"
cp "$DIR/commands/reel.md" "$CONFIG/commands/reel.md"
ok "agent reelstudio-producer and command /reel"

# 3. launcher (setup, update, doctor, key, version + the engine)
mkdir -p "$HOME/.local/bin"
sed -e "s|@SKILL_DIR@|$SKILL_DIR|g" -e "s|@REPO_DIR@|$DIR|g" "$DIR/bin/reelstudio" > "$HOME/.local/bin/reelstudio.new"
chmod +x "$HOME/.local/bin/reelstudio.new"
mv "$HOME/.local/bin/reelstudio.new" "$HOME/.local/bin/reelstudio"
ok "launcher ~/.local/bin/reelstudio"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) warn "~/.local/bin is not on your PATH: add  export PATH=\"\$HOME/.local/bin:\$PATH\"  to ~/.zshrc";; esac

# 4. engine + Remotion into ~/ReelStudio (first run downloads Remotion with npm)
"$HOME/.local/bin/reelstudio" setup
ok "engine and Remotion in $RS_HOME/engine"

# 5. the only credential: the OpenRouter key (voice, images, word timings). Asked hidden, only in a real terminal.
if grep -q '^OPENROUTER_API_KEY=sk-or-' "$RS_HOME/.env" 2>/dev/null; then
  ok "OpenRouter key already set"
  KEYMSG="Key already set (change it any time with: reelstudio key)"
elif [ -t 0 ] && [ -t 1 ] && [ -z "$QUIET" ]; then
  echo; echo "ReelStudio needs one key: OpenRouter (create it at https://openrouter.ai/keys and add a few dollars of credit)."
  "$HOME/.local/bin/reelstudio" key || warn "key not saved: run  reelstudio key  later"
  KEYMSG="Change the key any time with: reelstudio key"
else
  KEYMSG="Open the Terminal app and run:  reelstudio key   (it asks for your OpenRouter key without showing it; never paste it into a chat)"
fi

[ -n "$QUIET" ] || { echo; "$HOME/.local/bin/reelstudio" doctor || true; }

cat <<EOF

ReelStudio for OpenCode $VERSION is installed.
Next:
  1. $KEYMSG
     Without a key the voice and the illustrations are off.
  2. In OpenCode:  /reel <your topic>   (or just ask for a reel)
  3. Optional web app:  node "$SKILL_DIR/app/server.mjs"   → http://localhost:4748
EOF
