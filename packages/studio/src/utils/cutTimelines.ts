// Cut Studio: several timelines in one project, like FCP projects in a library. The main timeline is
// index.html; every other one is compositions/timeline-*.html. ⌘N makes a new one.
import { buildProjectApiPath } from "./projectRouting";
import { studioApiFetch } from "./studioApiFetch";
import { studioWriteHeaders } from "./studioFileVersion";
import { cutStudioBridge } from "./cutCompoundClips";

export interface TimelineEntry {
  path: string;
  label: string;
}

export function listTimelines(): TimelineEntry[] {
  const main = cutStudioBridge.masterCompPath ?? "index.html";
  const extra = cutStudioBridge.fileTree
    .filter((f) => /^compositions\/timeline-[^/]+\.html$/.test(f))
    .sort()
    .map((path) => ({
      path,
      label: path
        .replace(/^compositions\/timeline-/, "")
        .replace(/\.html$/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  return [{ path: main, label: "Main Timeline" }, ...extra];
}

export async function newTimeline(name?: string): Promise<string | null> {
  const projectId = cutStudioBridge.projectId;
  if (!projectId) return null;
  const label = name ?? window.prompt("New timeline name", `Timeline ${listTimelines().length + 1}`);
  if (!label) return null;
  const res = await studioApiFetch(buildProjectApiPath(projectId, "/cut/timeline"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
    body: JSON.stringify({ name: label }),
  });
  const json = (await res.json()) as { path?: string; html?: string; error?: string };
  if (!res.ok || !json.path) throw new Error(json.error ?? "Could not create timeline");
  await cutStudioBridge.recordEdit?.({
    label: "New Timeline",
    files: { [json.path]: { before: "", after: json.html ?? "" } },
    created: [json.path],
  });
  // The file tree learns about the file a moment later; open it once it can be found.
  for (let i = 0; i < 20 && !cutStudioBridge.fileTree.includes(json.path); i++)
    await new Promise((r) => setTimeout(r, 150));
  cutStudioBridge.selectComposition?.(json.path);
  return `Opened new timeline “${label}”`;
}

if (typeof window !== "undefined") {
  (window as unknown as { __cutNewTimeline?: () => void }).__cutNewTimeline = () => void newTimeline();
}
