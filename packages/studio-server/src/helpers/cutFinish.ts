// Cut Studio: finishing pass after a render — 720p (hardware H.264 on Apple silicon) or audio only.
import { spawn } from "node:child_process";
import { unlinkSync } from "node:fs";
import type { RenderJobState } from "../types.js";

export type CutFinish = "720p" | "audio-m4a" | "audio-wav";
export const CUT_FINISHES = new Set<string>(["720p", "audio-m4a", "audio-wav"]);

function finishArgs(finish: CutFinish, input: string, output: string): string[] {
  if (finish === "audio-m4a") return ["-y", "-i", input, "-vn", "-c:a", "aac", "-b:a", "256k", output];
  if (finish === "audio-wav") return ["-y", "-i", input, "-vn", "-c:a", "pcm_s24le", output];
  // VideoToolbox: Apple's media engine does the scale-down encode.
  return ["-y", "-i", input, "-vf", "scale=-2:720:flags=lanczos", "-c:v", "h264_videotoolbox",
    "-b:v", "8M", "-tag:v", "avc1", "-c:a", "copy", "-movflags", "+faststart", output];
}

export function finishOutputPath(finish: CutFinish, outputPath: string): string {
  const base = outputPath.replace(/\.[a-z0-9]+$/i, "");
  return finish === "audio-m4a" ? `${base}.m4a` : finish === "audio-wav" ? `${base}.wav` : `${base}_720p.mp4`;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`))));
  });
}

/** Holds the job at "rendering" until the finishing pass is done, then swaps in its output. */
export function attachFinish(job: RenderJobState, finish: CutFinish): void {
  let status = job.status;
  Object.defineProperty(job, "status", {
    configurable: true,
    enumerable: true,
    get: () => status,
    set: (next: RenderJobState["status"]) => {
      if (next !== "complete" || !job.outputPath) {
        status = next;
        return;
      }
      job.stage = finish === "720p" ? "Encoding 720p (VideoToolbox)" : "Extracting audio";
      const source = job.outputPath;
      const target = finishOutputPath(finish, source);
      runFfmpeg(finishArgs(finish, source, target))
        .then(() => {
          job.outputPath = target;
          try {
            unlinkSync(source);
          } catch {
            /* keep the full render if it cannot be removed */
          }
          status = "complete";
        })
        .catch((e: unknown) => {
          job.error = e instanceof Error ? e.message : String(e);
          status = "failed";
        });
    },
  });
}
