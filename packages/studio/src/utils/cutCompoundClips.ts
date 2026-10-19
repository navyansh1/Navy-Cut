// Cut Studio: Final Cut compound clips — ⌥G makes one from the selected clips, ⇧⌘G breaks it apart.
// Double-clicking a compound clip opens it (Studio's sub-composition drill-down).
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { buildProjectApiPath } from "./projectRouting";
import { studioApiFetch } from "./studioApiFetch";
import { studioWriteHeaders } from "./studioFileVersion";
import type { RecordEditInput } from "./studioFileHistory";
import { usePreviewIframeStore } from "../player/store/previewIframeStore";
import { findTimelineElementInIframe } from "../hooks/timelineEditingHelpers";

/** Set by App so the shortcut can join the undo history. */
export const cutStudioBridge: {
  projectId: string | null;
  recordEdit: ((entry: RecordEditInput) => Promise<void>) | null;
  fileTree: string[];
  masterCompPath: string | null;
  selectComposition: ((path: string) => void) | null;
} = { projectId: null, recordEdit: null, fileTree: [], masterCompPath: null, selectComposition: null };

function selection(): TimelineElement[] {
  const { elements, selectedElementId, selectedElementIds } = usePlayerStore.getState();
  const ids = new Set(selectedElementIds);
  if (selectedElementId) ids.add(selectedElementId);
  return elements.filter((el) => ids.has(el.key ?? el.id));
}

const rawId = (el: TimelineElement) => el.domId ?? (el.key ?? el.id).split("#").pop() ?? "";
const fileOf = (el: TimelineElement) => el.sourceFile ?? (el.key ?? "").split("#")[0] ?? "index.html";

async function post(path: string, body: unknown) {
  const projectId = cutStudioBridge.projectId;
  if (!projectId) throw new Error("No project open");
  const res = await studioApiFetch(buildProjectApiPath(projectId, path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, string> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export async function makeCompoundClip(): Promise<string> {
  const clips = selection();
  if (clips.length === 0) return "Select clips first";
  const targetPath = fileOf(clips[0]!);
  // Clips inside a box (a PiP card) keep that box's size inside the compound.
  const node = findTimelineElementInIframe(usePreviewIframeStore.getState().iframe, clips[0]!);
  const parent = node?.parentElement as HTMLElement | null | undefined;
  const isRoot = !parent || parent.hasAttribute("data-composition-id");
  const box = isRoot ? undefined : { width: parent.offsetWidth, height: parent.offsetHeight };
  const r = await post("/cut/compound", { targetPath, ids: clips.map(rawId), box });
  await cutStudioBridge.recordEdit?.({
    label: "New Compound Clip",
    files: {
      [targetPath]: { before: r.before!, after: r.after! },
      [r.compositionPath!]: { before: "", after: r.compHtml! },
    },
    created: [r.compositionPath!],
  });
  return `Compound clip made from ${clips.length} clip${clips.length === 1 ? "" : "s"}`;
}

/** Returns null when the selection is not a compound clip, so ⇧⌘G can fall through to Ungroup. */
export async function breakApartCompoundClip(): Promise<string | null> {
  const [host] = selection();
  if (!host?.compositionSrc || !/(^|\/)compound-/.test(host.compositionSrc)) return null;
  const targetPath = fileOf(host);
  const r = await post("/cut/break-apart", { targetPath, hostId: rawId(host) });
  await cutStudioBridge.recordEdit?.({
    label: "Break Apart Clip Items",
    files: { [targetPath]: { before: r.before!, after: r.after! } },
  });
  return "Compound clip broken apart";
}
