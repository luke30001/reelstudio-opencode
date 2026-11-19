#!/bin/sh
# ReelStudio for OpenCode: uninstaller.
#   ./uninstall.sh            remove the skill, agent, /reel command and launcher (keeps ~/ReelStudio)
#   ./uninstall.sh --purge    also delete ~/ReelStudio (all reels, brands, looks and the OpenRouter key)
set -e
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
RS_HOME="${REELSTUDIO_HOME:-$HOME/ReelStudio}"

rm -rf "$CONFIG/skills/reelstudio"
rm -f "$CONFIG/agents/reelstudio-producer.md" "$CONFIG/commands/reel.md" "$HOME/.local/bin/reelstudio"
echo "✓ removed the reelstudio skill, the reelstudio-producer agent, /reel and ~/.local/bin/reelstudio"

if [ "${1:-}" = "--purge" ]; then
  if [ -t 0 ]; then
    printf 'Delete %s too (all reels, brands, looks and the OpenRouter key)? [y/N] ' "$RS_HOME"
    read -r yn
    case "$yn" in [yY]*) ;; *) echo "· kept $RS_HOME"; exit 0;; esac
  fi
  rm -rf "$RS_HOME"
  echo "✓ removed $RS_HOME"
else
  echo "· kept $RS_HOME (add --purge to delete your reels and key too)"
fi
echo "· restart OpenCode (or run /reload) to drop the skill"
