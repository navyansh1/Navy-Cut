// Cut Studio: Final Cut multicam clips.
//  POST /cut/multicam          {targetPath, ids, audioAngle?} → syncs the selected clips' media by sound
//                              (ml/cut_sync.py) and replaces them with one multicam clip.
//  POST /cut/multicam/switch   {targetPath, hostId, time, angle} → cut & switch the video angle at a local time.
//  POST /cut/multicam/audio    {targetPath, hostId, angle} → which angle's sound plays for the whole clip.
// The angle cut list lives on the host (data-multicam-cuts, so the timeline can draw it); the multicam
// file holds the synced angles and a GSAP timeline generated from that list.
import type { Context, Hono } from "hono";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { parseHTML } from "linkedom";
import type { StudioApiAdapter } from "../types.js";
import { resolveWithinProject } from "../helpers/safePath.js";
import { snapshotBeforeWrite } from "../helpers/backupJournal.js";

const run = promisify(execFile);
const ML = join(homedir(), "Library", "Application Support", "Cut Studio", "ml");
type Cut = [number, number]; // [local time, angle number 1..n]
interface Angle { src: string; start: number; duration: number; label: string }

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const num = (v: string | null, d = 0) => (Number.isFinite(Number.parseFloat(v ?? "")) ? Number.parseFloat(v!) : d);

function multicamHtml(name: string, w: string, h: string, duration: number, angles: Angle[], cuts: Cut[], audioAngle: number) {
  const vids = angles
    .map((a, i) =>
      `        <video class="mc-angle" data-multicam="${name}" data-angle="${i + 1}" data-label="${a.label}" src="${a.src}" ` +
      `data-start="${r4(a.start)}" data-duration="${r4(a.duration)}" data-media-start="0" data-track-index="${i}" muted playsinline` +
      `${(cuts[0]?.[1] ?? 1) === i + 1 ? "" : ' style="opacity: 0"'}></video>`)
    .join("\n");
  const audio = angles[audioAngle - 1]!;
  return `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #root { position: absolute; inset: 0; overflow: hidden; background: #000; }
        #root > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      </style>
      <div id="root" data-composition-id="${name}" data-width="${w}" data-height="${h}" data-duration="${r4(duration)}" data-multicam-audio="${audioAngle}">
${vids}
        <audio id="${name}-audio" data-label="Audio · ${audio.label}" src="${audio.src}" data-start="${r4(audio.start)}" data-duration="${r4(audio.duration)}" data-media-start="0" data-track-index="${angles.length}" data-volume="1"></audio>
      </div>
      <script>
        (function () {
          window.__timelines = window.__timelines || {};
          var tl = gsap.timeline({ paused: true });
          var cuts = ${JSON.stringify(cuts)};
          var vids = function () { return document.querySelectorAll('video[data-multicam="${name}"]'); };
          cuts.forEach(function (c) {
            vids().forEach(function (v) {
              tl.set(v, { opacity: Number(v.getAttribute("data-angle")) === c[1] ? 1 : 0 }, Math.max(0.0001, c[0]));
            });
          });
          tl.set({}, {}, ${r4(duration)});
          window.__timelines["${name}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}

function readMulticam(projectDir: string, src: string) {
  const abs = resolveWithinProject(projectDir, src);
  if (!abs || !existsSync(abs)) return null;
  const text = readFileSync(abs, "utf-8");
  const tpl = parseHTML(text).document.querySelector("template");
  const doc = parseHTML(`<html><body>${tpl?.innerHTML ?? ""}</body></html>`).document;
  const root = doc.querySelector("[data-composition-id]");
  const angles: Angle[] = [...doc.querySelectorAll("video[data-angle]")].map((v) => ({
    src: v.getAttribute("src") ?? "",
    start: num(v.getAttribute("data-start")),
    duration: num(v.getAttribute("data-duration")),
    label: v.getAttribute("data-label") ?? "",
  }));
  return {
    abs, text, angles,
    name: root?.getAttribute("data-composition-id") ?? "",
    w: root?.getAttribute("data-width") ?? "1920",
    h: root?.getAttribute("data-height") ?? "1080",
    duration: num(root?.getAttribute("data-duration") ?? null),
    audioAngle: num(root?.getAttribute("data-multicam-audio") ?? null, 1),
  };
}

const serialize = (document: Document, original: string) =>
  `${/^\s*<!doctype[^>]*>/i.exec(original)?.[0] ?? "<!doctype html>"}\n${document.documentElement.outerHTML}\n`;

export function registerCutMulticamRoutes(api: Hono, adapter: StudioApiAdapter): void {
  api.post("/projects/:id/cut/multicam", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { targetPath?: string; ids?: string[]; audioAngle?: number } | null;
    if (!body?.targetPath || !Array.isArray(body.ids) || body.ids.length < 2)
      return c.json({ error: "Select 2 to 4 video clips (the camera angles)" }, 400);
    const absTarget = resolveWithinProject(project.dir, body.targetPath);
    if (!absTarget || !existsSync(absTarget)) return c.json({ error: "target not found" }, 404);
    const before = readFileSync(absTarget, "utf-8");
    const { document } = parseHTML(before);
    const root = document.querySelector("[data-composition-id]");
    const clips = body.ids.slice(0, 9)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el && el.tagName.toLowerCase() === "video" && el.getAttribute("src")));
    if (clips.length < 2) return c.json({ error: "Multicam needs at least 2 video clips" }, 400);
    const srcs = clips.map((el) => el.getAttribute("src")!.split(/[?#]/)[0]!);
    const absSrcs = srcs.map((s) => resolveWithinProject(project.dir, decodeURIComponent(s)));
    if (absSrcs.some((a) => !a || !existsSync(a))) return c.json({ error: "angle media not found" }, 404);

    let sync: { offsets: number[]; confidence: number[]; durations: number[] };
    try {
      const { stdout } = await run(join(ML, ".venv", "bin", "python"), ["-I", join(ML, "cut_sync.py"), ...(absSrcs as string[])],
        { maxBuffer: 1 << 20, env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH ?? ""}` } });
      sync = JSON.parse(stdout);
    } catch (e) {
      return c.json({ error: `Sync failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
    }
    const first = Math.min(...sync.offsets);
    const angles: Angle[] = srcs.map((src, i) => ({
      src,
      start: sync.offsets[i]! - first,
      duration: sync.durations[i]!,
      label: `Angle ${i + 1} · ${src.split("/").pop()}`,
    }));
    const duration = Math.max(...angles.map((a) => a.start + a.duration));
    let n = 1;
    while (existsSync(join(project.dir, "compositions", `multicam-${n}.html`))) n++;
    const name = `multicam-${n}`;
    const compPath = `compositions/${name}.html`;
    const audioAngle = Math.min(angles.length, Math.max(1, body.audioAngle ?? 1));
    const cuts: Cut[] = [[0, 1]];
    const w = root?.getAttribute("data-width") ?? "1920";
    const h = root?.getAttribute("data-height") ?? "1080";
    const compHtml = multicamHtml(name, w, h, duration, angles, cuts, audioAngle);

    const host = document.createElement("div");
    const attrs: Array<[string, string]> = [
      ["id", name],
      ["data-label", `Multicam Clip ${n}`],
      ["data-composition-id", name],
      ["data-composition-src", compPath],
      ["data-start", String(r4(Math.min(...clips.map((el) => num(el.getAttribute("data-start"))))))],
      ["data-duration", String(r4(duration))],
      ["data-track-index", String(Math.min(...clips.map((el) => num(el.getAttribute("data-track-index")))))],
      ["data-width", w],
      ["data-height", h],
      ["data-multicam-cuts", JSON.stringify(cuts)],
      ["data-multicam-angles", String(angles.length)],
    ];
    for (const [k, v] of [...attrs].reverse()) host.setAttribute(k, v);
    clips[0]!.parentNode!.insertBefore(host, clips[0]!);
    for (const el of clips) el.remove();
    const after = serialize(document, before);
    snapshotBeforeWrite(project.dir, absTarget);
    mkdirSync(dirname(join(project.dir, compPath)), { recursive: true });
    writeFileSync(join(project.dir, compPath), compHtml);
    writeFileSync(absTarget, after);
    return c.json({ ok: true, hostId: name, compositionPath: compPath, before, after, compHtml, confidence: sync.confidence, offsets: sync.offsets });
  });

  const edit = async (
    c: Context,
    change: (cuts: Cut[], m: NonNullable<ReturnType<typeof readMulticam>>, body: Record<string, number>) => { cuts: Cut[]; audioAngle: number },
  ) => {
    const project = await adapter.resolveProject(c.req.param("id") ?? "");
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { targetPath?: string; hostId?: string } & Record<string, number> | null;
    if (!body?.targetPath || !body.hostId) return c.json({ error: "targetPath and hostId required" }, 400);
    const absTarget = resolveWithinProject(project.dir, body.targetPath);
    if (!absTarget || !existsSync(absTarget)) return c.json({ error: "target not found" }, 404);
    const before = readFileSync(absTarget, "utf-8");
    const { document } = parseHTML(before);
    const host = document.getElementById(body.hostId);
    const src = host?.getAttribute("data-composition-src");
    const m = src ? readMulticam(project.dir, src) : null;
    if (!host || !m || !m.angles.length) return c.json({ error: "not a multicam clip" }, 400);
    let cuts: Cut[] = [];
    try { cuts = JSON.parse(host.getAttribute("data-multicam-cuts") ?? "[[0,1]]"); } catch { cuts = [[0, 1]]; }
    const next = change(cuts, m, body);
    host.setAttribute("data-multicam-cuts", JSON.stringify(next.cuts));
    const after = serialize(document, before);
    const compHtml = multicamHtml(m.name, m.w, m.h, m.duration, m.angles, next.cuts, next.audioAngle);
    snapshotBeforeWrite(project.dir, absTarget);
    writeFileSync(m.abs, compHtml);
    writeFileSync(absTarget, after);
    return c.json({ ok: true, before, after, compPath: src, compBefore: m.text, compHtml, cuts: next.cuts });
  };

  api.post("/projects/:id/cut/multicam/switch", (c) =>
    edit(c, (cuts, m, body) => {
      const angle = Math.round(body.angle ?? 1);
      const t = r4(Math.max(0, Math.min(m.duration, body.time ?? 0)));
      if (angle < 1 || angle > m.angles.length) return { cuts, audioAngle: m.audioAngle };
      // Cut & switch: everything from t up to the next existing cut becomes this angle.
      const kept = cuts.filter(([ct]) => Math.abs(ct - t) > 1 / 60);
      kept.push([t, angle]);
      kept.sort((a, b) => a[0] - b[0]);
      const merged = kept.filter((c2, i) => i === 0 || c2[1] !== kept[i - 1]![1]);
      return { cuts: merged, audioAngle: m.audioAngle };
    }));

  api.post("/projects/:id/cut/multicam/audio", (c) =>
    edit(c, (cuts, m, body) => ({ cuts, audioAngle: Math.min(m.angles.length, Math.max(1, Math.round(body.angle ?? 1))) })));
}
