// Cut Studio: noise removal / voice isolation jobs. Runs DeepFilterNet3 on Apple's MLX through
// ~/Library/Application Support/Cut Studio/ml (a Python venv with mlx-audio) and writes the
// cleaned media next to the source under media/cut/, leaving the original untouched.
import type { Hono } from "hono";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import type { StudioApiAdapter } from "../types.js";
import { resolveWithinProject } from "../helpers/safePath.js";

interface CutJob {
  status: "running" | "complete" | "failed";
  progress: number;
  stage: string;
  output?: string;
  error?: string;
}

const ML_DIR = join(homedir(), "Library", "Application Support", "Cut Studio", "ml");
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);

export function registerCutAudioRoutes(api: Hono, adapter: StudioApiAdapter): void {
  const jobs = new Map<string, CutJob>();
  let seq = 0;

  api.post("/projects/:id/cut/denoise", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { src?: string; amount?: number; mode?: string } | null;
    const src = body?.src?.replace(/^\.\//, "").split(/[?#]/)[0];
    if (!src) return c.json({ error: "src required" }, 400);
    const abs = resolveWithinProject(project.dir, decodeURIComponent(src));
    if (!abs || !existsSync(abs)) return c.json({ error: "source not found" }, 404);
    const mode = body?.mode === "voice" ? "voice" : "noise";
    const amount = Math.min(1, Math.max(0, Number(body?.amount ?? 0.6)));
    const ext = extname(abs).toLowerCase();
    const outExt = VIDEO_EXT.has(ext) ? ext : ".wav";
    const stem = basename(abs, extname(abs)).replace(/\.(noise|voice)-\d+$/, "");
    const outAbs = join(project.dir, "media", "cut", `${stem}.${mode}-${Math.round(amount * 100)}${outExt}`);
    const output = relative(project.dir, outAbs).split("\\").join("/");
    const jobId = `cut-${Date.now()}-${++seq}`;
    const job: CutJob = { status: "running", progress: 0, stage: "Starting" };
    jobs.set(jobId, job);
    if (existsSync(outAbs)) {
      Object.assign(job, { status: "complete", progress: 1, stage: "Done", output });
      return c.json({ jobId });
    }
    const p = spawn(join(ML_DIR, ".venv", "bin", "python"), ["-I", join(ML_DIR, "cut_denoise.py"), abs, outAbs, String(amount), mode], {
      cwd: dirname(abs),
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}` },
    });
    let err = "";
    p.stdout.on("data", (d) => {
      for (const line of String(d).split("\n")) {
        try {
          const m = JSON.parse(line) as { progress: number; stage: string };
          job.progress = m.progress;
          job.stage = m.stage;
        } catch {
          /* not a progress line */
        }
      }
    });
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("close", (code) => {
      if (code === 0) Object.assign(job, { status: "complete", progress: 1, stage: "Done", output });
      else Object.assign(job, { status: "failed", error: err.trim().split("\n").slice(-3).join("\n") || `exit ${code}` });
    });
    return c.json({ jobId });
  });

  api.get("/projects/:id/cut/jobs/:jobId", (c) => {
    const job = jobs.get(c.req.param("jobId"));
    return job ? c.json(job) : c.json({ error: "not found" }, 404);
  });
}
