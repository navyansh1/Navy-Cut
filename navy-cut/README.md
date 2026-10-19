# Navy Cut

A Final Cut Pro–style video editor for macOS (Apple silicon), built as a fork of
[HyperFrames](https://github.com/heygen-com/hyperframes) Studio. Projects are HyperFrames HTML compositions,
so everything is editable as code too.

## What it adds
- **Final Cut timeline** — dark UI, blue/purple/green/teal clips, file-name labels, yellow selection,
  click anywhere to move the playhead, ⇧Z fit, ⌘B blade, J/K/L (and ⌘L) shuttle up to 16×, edge trims.
- **Projects and timelines** — project picker with recents, New Project (16:9 / 9:16), Open Project,
  several timelines per project (⌘N, “+”, rename by double-click), copy/paste clips across timelines.
- **Clips** — Speed/Retime menu, compound clips (⌥G, ⇧⌘G, double-click to open), multicam synced by audio
  (⇧⌘M, 1–4 cut & switch, ⇧1–4 audio angle), Detect Scene Cuts, Expand Audio for J/L cuts (⌃S),
  Paste Attributes (⌘C, ⇧⌘V).
- **Inspector** — Video (Compositing, Transform, Crop with keyframes, Stabilization), Color (Exposure,
  Highlights, Shadows, Contrast, Saturation, Warmth…), Audio (EQ presets, Bass/Treble, Loudness, Hum Removal,
  Noise Removal / Voice Isolation).
- **Audio on the timeline** — waveforms on audio and video clips, Final Cut fade dots, volume line.
- **Apple silicon** — DeepFilterNet3 noise removal on MLX, Vision + Core Image + VideoToolbox stabilization,
  VideoToolbox export, proxies for heavy/external media.
- **Export** — 720p / 1080p / 4K, 24–60 fps, audio-only M4A/WAV.
- **Workspaces** — Standard and Vertical Video (viewer on the right), ⌘0 / ⌥⌘0.

## Install
Clone this repo to `~/Library/Application Support/Cut Studio/hyperframes`, then run `navy-cut/install.sh`.
It installs Bun dependencies, builds the packages, sets up the ML tools, registers the background server
(LaunchAgent `com.navyansh.navycut.server`) and builds `/Applications/Navy Cut.app`.
Double-click a `.navycut` project file or use File › Open Project.

## Layout
- `packages/studio`, `packages/studio-server`, `packages/core` — the editor changes (search for “Cut Studio”).
- `navy-cut/app` — native macOS wrapper (Swift, WKWebView).
- `navy-cut/ml` — noise removal, multicam sync, scene detection, stabilizer.

Licensed under Apache-2.0 like HyperFrames; see `LICENSE` and `NOTICE`.
