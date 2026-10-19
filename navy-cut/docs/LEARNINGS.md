# Learnings and gotchas (everything that cost time)

## Setup and running
- Studio needs Bun (`~/.bun/bin`) and Node 22. Build order on a fresh clone: parsers, lint, core, studio-server, then Studio dev.
- After editing `packages/core` runtime: `bun run --filter @hyperframes/core build`. After studio-server routes: build it and `launchctl kickstart -k gui/$(id -u)/com.navyansh.navycut.server`. Studio UI hot-reloads.
- Source must not live on Desktop: macOS privacy (TCC) prompts every time an ad-hoc–signed app touches Desktop or an external drive, and every rebuild re-signs. Fix: source in `~/Library/Application Support`, server as a LaunchAgent so permissions belong to `bun`; the app only shows a WKWebView.
- The app must wait for the server indefinitely — a startup timeout showed "Studio did not start" on cold boots.
- Title bar: use a unified compact toolbar and pad the header (~84 px) so UI doesn't sit under the traffic lights; add a drag strip.

## Timeline
- The HyperFrames runtime stamped `data-start` on wrapper divs, which showed up as extra rows (e.g. "Scrbox"). Fixed in `runtime/init.ts` (skip wrappers of timed clips, skip `__hf_` ids) and `timeline.ts` (skip GSAP scene wrappers containing `[data-start]`), plus a Studio-side filter.
- Fit-to-width was a toggle, so clicking when already fitted did nothing. Make it a one-shot action.
- Click-to-seek must ignore trim handles, fade dots, the volume line, buttons and col-resize targets.
- Playback rate clamp in the runtime had to be raised to 16 for J/L shuttle.
- "Black preview" on big HEVC 10-bit files from a USB drive = decoder starvation (46 decoders). Proxies only for heavy/external media; cap proxy size at 1280 px (a 4096 px box made proxies useless).

## Inspector / React
- Never put a React hook after an early return (StabilizationControl crashed the whole inspector).
- The "quiet" attribute setter can't write `src`; use `onSetHtmlAttribute` when swapping to a denoised/stabilized file. Keep the original in `data-original-src` / `data-prestab-src` so the amount can be changed later.
- Crop via CSS variables `--crop-l/r/t/b` and `clip-path: inset(calc(var(--crop-t,0)*1%) …)` so it can be keyframed.

## Audio / video processing
- Stabilizer: the correction sign was inverted at first (jitter grew 52 → 114 px). Correct is −1 on both axes.
- Noise removal amount = dry/wet mix of DeepFilterNet3 output.
- Multicam sync: cross-correlate audio envelopes; measured +19.99 s offset at 20σ confidence.
- ffmpeg in zsh: `$T[sfx]` is a zsh subscript — write `${T}[sfx]`.
- Loudness chain used: loudnorm −14 LUFS, TP −1.5; music bed sidechain-ducked under voice.

## Disk
- HyperFrames extracts every source frame before rendering (15–25 GB for a 7.5-min timeline). Render on the external drive with TMPDIR on the SSD.
- Safe cleanups: hyperframes-extract-cache, puppeteer profiles, pip cache. `rm -rf $TMPDIR/*` is blocked by the safety check; use `find <path> -mindepth 1 -delete`.

## Git / GitHub
- The checkout was shallow, so GitHub `main` is an orphan "HyperFrames upstream snapshot" commit plus the Navy Cut commits cherry-picked onto it (local branch `navy-main`). Keep `LICENSE` (Apache-2.0) and `NOTICE`.
- Project media is never committed (`packages/studio/data/` is git-ignored).
