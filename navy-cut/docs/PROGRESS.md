# Navy Cut — progress and what's pending (19 Oct 2026)

Navy Cut is a Final Cut Pro–style editor built in one long session on top of HyperFrames Studio, plus a native
macOS wrapper. It was used to edit "I removed every ad from my Google TV" (YouTube, 7:28) and its Short.
The project is parked here on GitHub; the editing workflow moved to Final Cut Pro (FCPXML hand-off).

## Done
### Timeline (FCP look and feel)
- FCP clip colours (video #3d5f99, audio #2f7a4f, title #6b4fa8, compound #2f7f86, multicam #35518a), yellow selection, taller clips (TRACK_H 64).
- File names as clip labels (aliases so a select file shows its camera name, e.g. DJI_…MP4).
- Click anywhere on the ruler/track to move the playhead; clicking a clip selects it and seeks.
- ⌘B blade, J/K/L shuttle up to 16×, ⌘L alias, ⇧Z / Fit button (one-shot fit, not a toggle).
- Edge trims by dragging; wrapper/scene rows hidden (runtime no longer stamps timing on wrappers).
- Waveforms on video and audio clips, FCP fade dots at both ends, volume line (drag −30…+12 dB, snaps to 0 dB).
- Expand Audio for J/L cuts (⌃S, ⌥⇧D).
### Clips
- Right-click Speed / Retime menu.
- Compound clips: ⌥G make, ⇧⌘G break apart, double-click to open.
- Multicam: ⇧⌘M, angles synced by audio cross-correlation, 1–4 cut & switch, ⇧1–4 audio angle, cut marks on the clip.
- Detect Scene Cuts (PySceneDetect AdaptiveDetector).
- Copy (⌘C) and Paste Attributes (⇧⌘V) dialog: colour, opacity, volume, audio FX, fades, speed.
### Projects and timelines
- Project switcher next to the project name: recents, New Project 16:9 / 9:16, Open Project.
- Several timelines per project: ⌘N, "+" button, "Timeline N" names, double-click rename, copy/paste across timelines.
- `.navycut` project files (JSON `{"path": …}`) open by double-click.
### Inspector
- Video: Compositing (blend, opacity), Transform (position, rotation, scale), Crop (L/R/T/B), keyframe buttons, Stabilization with %.
- Color: Exposure, Highlights, Shadows, Contrast, Saturation, Warmth sliders.
- Audio: EQ presets, Bass/Treble/Presence, high-pass, hum removal, loudness; Noise Removal / Voice Isolation with %.
### Apple-silicon processing
- Noise removal: DeepFilterNet3 on MLX (~8× real time).
- Stabilization: Vision translational registration + Core Image + AVAssetWriter HEVC (jitter 21.7 → 5.8 px on a test clip).
- Export: VideoToolbox; 720p/1080p/4K, 24–60 fps, audio-only M4A/WAV.
- Proxies only for heavy (>150 MB) or external-drive media: CRF 23, GOP 15, max 1280 px.
### App
- Swift WKWebView app with unified compact toolbar, dark-only UI, Navy Cut icon, Dock-pinnable.
- Server runs as a LaunchAgent (so macOS file permissions belong to `bun`, no repeated prompts); the app starts it on launch.
- Workspaces: Standard and Vertical Video (viewer on the right).

## Pending (never finished)
- Per-timeline frame-rate setting (export fps exists).
- Verify that clicking an element in the preview selects its clip and that move/resize/delete in the preview work.
- Verify crop keyframes end to end.
- Rounded corners / masks in the inspector; real FCP-style titles browser.
- Proper code signing (currently ad-hoc).

## Where the films ended up
YouTube_TV_Ad_Free.mp4 (448.4 s), Short_TV_Ad_Free_MyVoice.mp4 (31.2 s), Short_TV_Ad_Free_AIVoice.mp4 (27.3 s).
They are now handed to Final Cut Pro as FCPXML built from the original camera/screen files (see the
`talking-head-screen-edit` skill), not edited in Navy Cut.
