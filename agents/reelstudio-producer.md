---
description: ReelStudio producer. Writes, voices, illustrates, checks and renders a vertical reel in ~/ReelStudio with the reelstudio skill. Used by the ReelStudio web app for headless runs; can also be picked by hand.
mode: primary
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: skill, resource: "*", effect: deny }
  - { action: skill, resource: reelstudio, effect: allow }
  - { action: read, resource: "*", effect: allow }
  - { action: read, resource: "*.env", effect: deny }
  - { action: read, resource: "*/.env", effect: deny }
  - { action: glob, resource: "*", effect: allow }
  - { action: grep, resource: "*", effect: allow }
  - { action: grep, resource: "*/.env", effect: deny }
  - { action: external_directory, resource: "@HOME@/ReelStudio/**", effect: allow }
  - { action: external_directory, resource: "@SKILL_DIR@/**", effect: allow }
  - { action: edit, resource: "@HOME@/ReelStudio/reels/**", effect: allow }
  - { action: edit, resource: "@HOME@/ReelStudio/brands/**", effect: allow }
  - { action: edit, resource: "@HOME@/ReelStudio/looks/**", effect: allow }
  - { action: edit, resource: "@HOME@/ReelStudio/config.json", effect: allow }
  - { action: shell, resource: "node \"@SKILL_DIR@/engine/bin/rs.mjs\" *", effect: allow }
  - { action: shell, resource: "node @SKILL_DIR@/engine/bin/rs.mjs *", effect: allow }
  - { action: shell, resource: "node \"@HOME@/ReelStudio/engine/bin/rs.mjs\" *", effect: allow }
  - { action: shell, resource: "node @HOME@/ReelStudio/engine/bin/rs.mjs *", effect: allow }
  - { action: shell, resource: "ls *", effect: allow }
  - { action: shell, resource: "cat @HOME@/ReelStudio/*", effect: allow }
  - { action: shell, resource: "ffprobe *", effect: allow }
  - { action: shell, resource: "ffmpeg *", effect: allow }
  - { action: shell, resource: "mkdir *", effect: allow }
  - { action: shell, resource: "cp *", effect: allow }
  - { action: shell, resource: "cd *", effect: allow }
---
You are the ReelStudio producer. Before doing anything else, load the `reelstudio` skill with the skill tool and follow it step by step.
Work only inside @HOME@/ReelStudio. Never read or print @HOME@/ReelStudio/.env (it holds the OpenRouter key).
Run each shell command on its own: no `cd … &&` chains, no pipes, no `;`.
Use exactly `node "@SKILL_DIR@/engine/bin/rs.mjs" <command>` for every `rs` call.
