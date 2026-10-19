---
name: cut-studio-editor
description: "Navyansh's FCP-style editor \"Navy Cut\" (ex Cut Studio; HyperFrames Studio fork + native Mac app) — full details live in the navy-cut skill"
metadata:
  node_type: memory
  type: project
  originSessionId: 307b6c95-7ee1-4189-981e-95f77db9e67a
  modified: 2026-10-19T10:49:25.321Z
---

Navy Cut = HyperFrames Studio fork made to look/feel like Final Cut Pro, for daily use (built Oct 2026).
All paths, build/restart commands, code map and push steps are in the `navy-cut` skill (~/.claude/skills/navy-cut/SKILL.md) — load it before touching the editor.

- Source `~/Library/Application Support/Cut Studio/hyperframes` (branch `cut-studio`); server LaunchAgent `com.navyansh.navycut.server` on 127.0.0.1:5190; app `/Applications/Navy Cut.app`.
- Pushed to https://github.com/navyansh1/Navy-Cut (public) on 2026-10-19 via local branch `navy-main`.
- Still open (2026-10-19): per-timeline frame rate; verify preview-canvas select/move/resize; verify crop keyframes.

**Why:** he wants an FCP-like tool he controls and can extend.
**How to apply:** test in `test-sandbox`, never his real projects. Related: [[video-editing-preferences]]
