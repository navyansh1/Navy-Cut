---
name: navy-cut
description: Navy Cut — Navyansh's Final Cut Pro–style Mac video editor (fork of HyperFrames Studio + native Swift app). Use when he asks to open/start Navy Cut or a project, fix or add an editor feature (timeline, inspector, multicam, compound clips, audio, export), troubleshoot the app/server, make a project openable in Navy Cut, or push the code to GitHub (navyansh1/Navy-Cut).
---

# Navy Cut

Final Cut Pro look and behaviour on top of HyperFrames Studio. Projects are HyperFrames HTML compositions.
He uses it daily: every change must feel like FCP, and must not break his real projects.

## Where things live
| What | Path |
|---|---|
| Source (git, branch `cut-studio`) | `~/Library/Application Support/Cut Studio/hyperframes` (= `R`) |
| Native app | `/Applications/Navy Cut.app` (pinned in Dock); source `R/navy-cut/app` (`main.swift`, `icon.swift`, `Info.plist`, `build.sh`) |
| Server | LaunchAgent `com.navyansh.navycut.server` (bun + vite, `http://127.0.0.1:5190`), plist in `~/Library/LaunchAgents/` |
| Server log | `~/Library/Logs/Navy Cut.log` |
| ML tools | `~/Library/Application Support/Cut Studio/ml/` (`.venv`, `cut_denoise.py`, `cut_sync.py`, `cut_scenes.py`, `cut-stabilize`) |
| Recent projects | `~/Library/Application Support/Cut Studio/recent-projects.json` |
| Projects inside Studio | symlinks in `R/packages/studio/data/projects/` (git-ignored) |
| Test project | `test-sandbox` — test every change here, never on his real projects |
| GitHub | https://github.com/navyansh1/Navy-Cut (public, `main`) |

The source lives in App Support, not Desktop, and the server runs as a LaunchAgent so macOS file permissions
belong to `bun` and the app never re-asks for Desktop/external-drive access.

## How he opens it
- **Dock / Launchpad / Spotlight:** "Navy Cut". It shows the last project; the project name in the header is a dropdown with Recents, New Project (16:9 / 9:16) and Open Project….
- **Double-click a `.navycut` file** (JSON `{"path": "<project folder>"}`), e.g. `~/Desktop/tv-demo/youtube-edit/TV Ad Free (YouTube).navycut`.
- **Browser fallback:** `http://127.0.0.1:5190` while the server runs.
- A project is a HyperFrames folder with `index.html` (+ `compositions/`). Each `compositions/timeline-*.html` with `data-cut-timeline="Name"` is a timeline in the switcher.

## Start / restart / troubleshoot
```bash
launchctl kickstart -k gui/$(id -u)/com.navyansh.navycut.server   # restart server
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5190/      # 200 = up
tail -50 ~/Library/Logs/Navy\ Cut.log
```
- Not loaded at all: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.navyansh.navycut.server.plist`.
- Fresh Mac: clone to `R`, run `R/navy-cut/install.sh` (deps, builds, ML venv, LaunchAgent, app).
- The server is not always on (RunAtLoad/KeepAlive false): opening the app bootstraps + kickstarts it. He prefers it stopped when not editing (`launchctl kill SIGTERM gui/$(id -u)/com.navyansh.navycut.server`). The app waits forever; a blank window = server failed → check the log.
- Black preview / slow playback on big or external media → proxies (`helpers/proxyTranscoder.ts`, `PROXY_PARAMS_VERSION`); heavy = >150 MB or on `/Volumes`.

## Building after a change
Tools: Bun `~/.bun/bin`, Node 22 `~/.nvm/versions/node/v22.23.3/bin`.
- `packages/studio` (UI): Vite hot-reloads — just reload the app (⌘R).
- `packages/core` (runtime): `bun run --filter @hyperframes/core build`, then reload.
- `packages/studio-server` (routes/helpers): `bun run --filter @hyperframes/studio-server build` + kickstart.
- Native app: `cd R/navy-cut/app && ./build.sh` (re-signs ad-hoc; the server keeps permissions, so no new prompts).
- Typecheck before committing: `bunx tsc --noEmit -p packages/studio`.
- Commit on `cut-studio` with messages starting `Navy Cut: …`.
- Push: GitHub `main` is the local branch `navy-main` (orphan upstream snapshot + cherry-picked Navy Cut commits; `cut-studio` has different hashes and can't be pushed directly). So: `git checkout navy-main && git cherry-pick <new commits> && git push navycut navy-main:main && git checkout cut-studio`. Keep project media out (`packages/studio/data/` is git-ignored).

## Code map (studio = `R/packages/studio/src`)
- Timeline look: `styles/fcp.css` (clip colours video #3d5f99, audio #2f7a4f, title #6b4fa8, compound #2f7f86, multicam #35518a, selection #f5c33b), `player/components/TimelineClip.tsx`, `timelineLayout.ts` (`TRACK_H`).
- Keys: `hooks/appHotkeysDispatch.ts`, `player/lib/playbackShortcuts.ts`, `hooks/linkShortcuts.ts`.
- Click-to-seek: `player/lib/cutClickToSeek.ts`; Fit: `utils/cutFitTimeline.ts`.
- Timelines/projects: `utils/cutTimelines.ts`, `components/TimelineSwitcher.tsx`, `components/ProjectSwitcher.tsx`; server `routes/cutCompound.ts`.
- Compound / multicam / scenes: `utils/cutCompoundClips.ts` (`cutStudioBridge`), `utils/cutMulticam.ts`, `utils/cutScenes.ts`; server `routes/cutMulticam.ts`, `routes/cutAudio.ts`.
- Inspector: `components/editor/PropertyPanelFlat.tsx`, `FlatVideoInspector.tsx` (transform, crop via `--crop-*` vars, keyframes), `AudioEnhancementsPanel.tsx`, `NoiseRemovalControl.tsx`, `StabilizationControl.tsx`.
- Clip overlays: `ClipVolumeLine.tsx` (−30…+12 dB, writes `data-volume`), `MulticamCutMarks.tsx`, fade dots.
- Export: `components/renders/*`, server `helpers/cutFinish.ts` (720p / audio via VideoToolbox).
- Layout/workspaces: `components/dock/dockLayout.ts` (Standard, Vertical Video).
- Runtime fixes: `packages/core/src/runtime/init.ts`, `timeline.ts` (don't turn wrappers / `__hf_` ids into clips).

## Features and shortcuts (keep FCP-faithful)
⌘B blade · J/K/L and ⌘L shuttle up to 16× · ⇧Z fit · ⌘N new timeline · ⌥G compound / ⇧⌘G break apart (double-click opens) ·
⇧⌘M multicam, 1–4 cut & switch, ⇧1–4 audio angle · ⌃S Expand Audio (J/L cuts) · ⌘C then ⇧⌘V Paste Attributes ·
right-click Speed · Detect Scene Cuts · volume line + fade dots on waveforms · Inspector tabs Video / Color / Audio ·
noise removal & stabilization with % amount · export 720p/1080p/4K, 24–60 fps, M4A/WAV.

## Apple-silicon tech choices (what worked)
- Noise removal: DeepFilterNet3 on MLX (mlx-audio), ~8× real time; amount = dry/wet mix.
- Stabilization: Vision `VNTranslationalImageRegistrationRequest` + Core Image + AVAssetWriter HEVC; correction sign is **−1 on both axes** (positive doubled the shake).
- Multicam sync: audio envelope cross-correlation (`cut_sync.py`).
- Scene cuts: PySceneDetect AdaptiveDetector.
- Export and proxies: VideoToolbox (`h264_videotoolbox`), proxies CRF 23, GOP 15, max 1280 px.

## Gotchas
- Every rebuild of the app re-signs it ad-hoc → TCC would re-prompt if the app itself touched files; keep file access in the server.
- React hooks: never put a hook after an early return (StabilizationControl crashed the inspector).
- Quiet attribute setters can't write `src`; use `onSetHtmlAttribute`.
- Fit must be a one-shot action (`fitTimelineNow`), not a toggle.
- Disk is tight (~2–3 GB free): clear `hyperframes-extract-cache`, puppeteer profiles, pip cache; render big jobs on Navy2TB.
- License: Apache-2.0 — keep `LICENSE` and `NOTICE` when pushing.

## Still open (Oct 2026)
- Timeline frame-rate setting (per timeline).
- Verify preview-canvas select / move / resize / delete maps to the timeline clip.
- Verify crop keyframes end to end.

Related: `talking-head-screen-edit` (how his videos are cut), `hyperframes-studio` (timeline conventions).
