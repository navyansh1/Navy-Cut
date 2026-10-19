// Cut Studio: Final Cut compound clips. POST {targetPath, ids} moves those clips into a new
// sub-composition (compositions/compound-N.html) and leaves one host clip in their place.
// POST /break-apart {targetPath, hostId} reverses it. Both answer {before, after} per file for undo.
import type { Hono } from "hono";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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
