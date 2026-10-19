// Cut Studio: Final Cut compound clips. POST {targetPath, ids} moves those clips into a new
// sub-composition (compositions/compound-N.html) and leaves one host clip in their place.
// POST /break-apart {targetPath, hostId} reverses it. Both answer {before, after} per file for undo.
import type { Hono } from "hono";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseHTML } from "linkedom";
import type { StudioApiAdapter } from "../types.js";
import { resolveWithinProject } from "../helpers/safePath.js";
import { snapshotBeforeWrite } from "../helpers/backupJournal.js";

const num = (v: string | null, fallback = 0) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
};

function nextCompoundName(projectDir: string): string {
  for (let i = 1; ; i++) {
    const name = `compound-${i}`;
    if (!existsSync(join(projectDir, "compositions", `${name}.html`))) return name;
  }
}

function serialize(document: Document, original: string): string {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(original)?.[0] ?? "<!doctype html>";
  return `${doctype}\n${document.documentElement.outerHTML}\n`;
}

export function registerCutCompoundRoutes(api: Hono, adapter: StudioApiAdapter): void {
  api.post("/projects/:id/cut/compound", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as {
      targetPath?: string;
      ids?: string[];
      box?: { width: number; height: number };
    } | null;
    if (!body?.targetPath || !Array.isArray(body.ids) || body.ids.length === 0)
      return c.json({ error: "targetPath and ids required" }, 400);
    const absTarget = resolveWithinProject(project.dir, body.targetPath);
    if (!absTarget || !existsSync(absTarget)) return c.json({ error: "target not found" }, 404);

    const before = readFileSync(absTarget, "utf-8");
    const { document } = parseHTML(before);
    const root = document.querySelector("[data-composition-id]");
    if (!root) return c.json({ error: "no composition root" }, 400);
    const clips = body.ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el && el.hasAttribute("data-start")));
    if (clips.length === 0) return c.json({ error: "no timed clips selected" }, 400);

    const start = Math.min(...clips.map((el) => num(el.getAttribute("data-start"))));
    const end = Math.max(
      ...clips.map((el) => num(el.getAttribute("data-start")) + num(el.getAttribute("data-duration"))),
    );
    const track = Math.min(...clips.map((el) => num(el.getAttribute("data-track-index"), 0)));
    const boxed = body.box && body.box.width > 0 && body.box.height > 0;
    const width = boxed ? String(Math.round(body.box!.width)) : (root.getAttribute("data-width") ?? "1920");
    const height = boxed ? String(Math.round(body.box!.height)) : (root.getAttribute("data-height") ?? "1080");
    const name = nextCompoundName(project.dir);
    const compPath = `compositions/${name}.html`;

    // The compound keeps the parent's styles so the clips look the same inside it.
    const styles = [...document.querySelectorAll("head style, body style")]
      .map((s) => s.outerHTML)
      .join("\n");
    const inner = clips
      .map((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        const local = num(el.getAttribute("data-start")) - start;
        copy.setAttribute("data-start", String(Math.round(local * 10000) / 10000));
        return `        ${copy.outerHTML}`;
      })
      .join("\n");
    const duration = Math.round((end - start) * 10000) / 10000;
    const compHtml = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      ${styles}
      <style>
        #root { position: absolute; inset: 0; overflow: hidden; }
        #root > video, #root > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      </style>
      <div id="root" data-composition-id="${name}" data-width="${width}" data-height="${height}" data-duration="${duration}">
${inner}
      </div>
      <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["${name}"] = gsap.timeline({ paused: true });
      </script>
    </template>
  </body>
</html>
`;

    const host = document.createElement("div");
    host.setAttribute("data-height", height);
    host.setAttribute("data-width", width);
    host.setAttribute("data-track-index", String(track));
    host.setAttribute("data-duration", String(duration));
    host.setAttribute("data-start", String(Math.round(start * 10000) / 10000));
    host.setAttribute("data-composition-src", compPath);
    host.setAttribute("data-composition-id", name);
    host.setAttribute("data-label", `Compound Clip ${name.split("-")[1]}`);
    host.setAttribute("id", name);
    clips[0]!.parentNode!.insertBefore(host, clips[0]!);
    for (const el of clips) el.remove();
    const after = serialize(document, before);

    snapshotBeforeWrite(project.dir, absTarget);
    const absComp = join(project.dir, compPath);
    mkdirSync(dirname(absComp), { recursive: true });
    writeFileSync(absComp, compHtml);
    writeFileSync(absTarget, after);
    return c.json({ ok: true, hostId: name, compositionPath: compPath, before, after, compHtml });
  });

  // New Timeline: an empty timeline the size of the main one, as its own composition file.
  api.post("/projects/:id/cut/timeline", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { name?: string } | null;
    const label = (body?.name ?? "").trim().slice(0, 60) || "Untitled Timeline";
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timeline";
    let file = `compositions/timeline-${slug}.html`;
    for (let n = 2; existsSync(join(project.dir, file)); n++) file = `compositions/timeline-${slug}-${n}.html`;
    const id = file.replace(/^compositions\//, "").replace(/\.html$/, "");
    const mainPath = join(project.dir, "index.html");
    let width = "1920";
    let height = "1080";
    if (existsSync(mainPath)) {
      const main = parseHTML(readFileSync(mainPath, "utf-8")).document.querySelector("[data-composition-id]");
      width = main?.getAttribute("data-width") ?? width;
      height = main?.getAttribute("data-height") ?? height;
    }
    const safeLabel = label.replace(/[<>"&]/g, "");
    const html = `<!doctype html>
<html>
  <head><meta charset="UTF-8" /></head>
  <body>
    <template>
      <style>
        #root { position: absolute; inset: 0; overflow: hidden; background: #000; }
        #root > video, #root > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      </style>
      <div id="root" data-composition-id="${id}" data-cut-timeline="${safeLabel}" data-width="${width}" data-height="${height}" data-duration="10"></div>
      <script>
        window.__timelines = window.__timelines || {};
        window.__timelines["${id}"] = gsap.timeline({ paused: true });
      </script>
    </template>
  </body>
</html>
`;
    mkdirSync(join(project.dir, "compositions"), { recursive: true });
    writeFileSync(join(project.dir, file), html);
    return c.json({ ok: true, path: file, label, html });
  });

  // Recent projects, recorded by the Navy Cut app each time a project is opened.
  api.get("/cut/recent-projects", async (c) => {
    const file = join(homedir(), "Library", "Application Support", "Cut Studio", "recent-projects.json");
    let list: Array<{ id: string; title: string; dir: string; marker?: string; opened?: number }> = [];
    try {
      list = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      list = [];
    }
    const linked = new Set((await adapter.listProjects()).map((p) => p.id));
    return c.json(list.filter((p) => existsSync(p.dir) && linked.has(p.id)));
  });

  // Timelines in this project with their display names (data-cut-timeline on each root).
  api.get("/projects/:id/cut/timelines", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const label = (file: string, fallback: string) => {
      const abs = join(project.dir, file);
      if (!existsSync(abs)) return fallback;
      const m = /data-cut-timeline="([^"]*)"/.exec(readFileSync(abs, "utf-8"));
      return m?.[1] || fallback;
    };
    const dir = join(project.dir, "compositions");
    const extra = existsSync(dir)
      ? readdirSync(dir).filter((f) => /^timeline-.+\.html$/.test(f)).sort()
      : [];
    return c.json([
      { path: "index.html", label: label("index.html", "Timeline 1") },
      ...extra.map((f, i) => ({ path: `compositions/${f}`, label: label(`compositions/${f}`, `Timeline ${i + 2}`) })),
    ]);
  });

  // Rename a timeline: only its display name changes, so references and undo stay simple.
  api.post("/projects/:id/cut/timeline/rename", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { path?: string; name?: string } | null;
    const name = (body?.name ?? "").trim().slice(0, 60).replace(/[<>"&]/g, "");
    if (!body?.path || !name) return c.json({ error: "path and name required" }, 400);
    if (body.path !== "index.html" && !/^compositions\/timeline-[^/]+\.html$/.test(body.path))
      return c.json({ error: "not a timeline" }, 400);
    const abs = resolveWithinProject(project.dir, body.path);
    if (!abs || !existsSync(abs)) return c.json({ error: "not found" }, 404);
    const before = readFileSync(abs, "utf-8");
    const after = /data-cut-timeline="[^"]*"/.test(before)
      ? before.replace(/data-cut-timeline="[^"]*"/, `data-cut-timeline="${name}"`)
      : before.replace(/(<[^>]*data-composition-id="[^"]*")/, `$1 data-cut-timeline="${name}"`);
    snapshotBeforeWrite(project.dir, abs);
    writeFileSync(abs, after);
    return c.json({ ok: true, before, after });
  });

  api.post("/projects/:id/cut/break-apart", async (c) => {
    const project = await adapter.resolveProject(c.req.param("id"));
    if (!project) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { targetPath?: string; hostId?: string } | null;
    if (!body?.targetPath || !body.hostId) return c.json({ error: "targetPath and hostId required" }, 400);
    const absTarget = resolveWithinProject(project.dir, body.targetPath);
    if (!absTarget || !existsSync(absTarget)) return c.json({ error: "target not found" }, 404);
    const before = readFileSync(absTarget, "utf-8");
    const { document } = parseHTML(before);
    const host = document.getElementById(body.hostId);
    const src = host?.getAttribute("data-composition-src");
    const absComp = src ? resolveWithinProject(project.dir, src) : null;
    if (!host || !absComp || !existsSync(absComp)) return c.json({ error: "not a compound clip" }, 400);
    const offset = num(host.getAttribute("data-start"));
    const comp = parseHTML(readFileSync(absComp, "utf-8")).document;
    const template = comp.querySelector("template");
    const holder = template ? parseHTML(`<html><body>${template.innerHTML}</body></html>`).document : comp;
    const croot = holder.querySelector("[data-composition-id]");
    for (const child of [...(croot?.children ?? [])]) {
      const copy = document.importNode(child, true) as HTMLElement;
      if (copy.hasAttribute("data-start"))
        copy.setAttribute(
          "data-start",
          String(Math.round((num(copy.getAttribute("data-start")) + offset) * 10000) / 10000),
        );
      host.parentNode!.insertBefore(copy, host);
    }
    host.remove();
    const after = serialize(document, before);
    snapshotBeforeWrite(project.dir, absTarget);
    writeFileSync(absTarget, after);
    return c.json({ ok: true, before, after });
  });
}
