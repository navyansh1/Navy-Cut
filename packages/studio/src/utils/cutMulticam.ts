// Cut Studio: Final Cut multicam. ⇧⌘M (or right-click) makes a multicam clip from 2–4 selected video
// clips, synced by their sound. 1–4 cut & switch the picture at the playhead; ⇧1–4 picks whose sound
// plays under the whole clip, so the audio never cuts.
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { buildProjectApiPath } from "./projectRouting";
import { studioApiFetch } from "./studioApiFetch";
import { studioWriteHeaders } from "./studioFileVersion";
import { cutStudioBridge } from "./cutCompoundClips";

export const isMulticam = (el: Pick<TimelineElement, "compositionSrc">) =>
  Boolean(el.compositionSrc && /(^|\/)multicam-\d+\.html/.test(el.compositionSrc));

const rawId = (el: TimelineElement) => el.domId ?? (el.key ?? el.id).split("#").pop() ?? "";
const fileOf = (el: TimelineElement) => el.sourceFile ?? (el.key ?? "").split("#")[0] ?? "index.html";

function selection(): TimelineElement[] {
  const { elements, selectedElementId, selectedElementIds } = usePlayerStore.getState();
  const ids = new Set(selectedElementIds);
  if (selectedElementId) ids.add(selectedElementId);
  return elements.filter((el) => ids.has(el.key ?? el.id));
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  if (!cutStudioBridge.projectId) throw new Error("No project open");
  const res = await studioApiFetch(buildProjectApiPath(cutStudioBridge.projectId, path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown> & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export async function makeMulticamClip(): Promise<string> {
  const angles = selection().filter((el) => el.tag === "video");
  if (angles.length < 2) return "Select 2–4 video clips (one per camera angle)";
  const targetPath = fileOf(angles[0]!);
  const r = await post("/cut/multicam", { targetPath, ids: angles.slice(0, 4).map(rawId) });
  await cutStudioBridge.recordEdit?.({
    label: "New Multicam Clip",
    files: {
      [targetPath]: { before: r.before as string, after: r.after as string },
      [r.compositionPath as string]: { before: "", after: r.compHtml as string },
    },
    created: [r.compositionPath as string],
  });
  const conf = (r.confidence as number[]).slice(1);
  const weak = conf.some((c) => c < 6);
  return weak
    ? "Multicam made — sync looked weak for one angle; check it lines up"
    : `Multicam made: ${angles.length} angles synced by audio. Press 1–${Math.min(4, angles.length)} to switch`;
}

/** The multicam clip to act on: the selected one, else the one under the playhead. */
function targetHost(): TimelineElement | null {
  const { elements, currentTime } = usePlayerStore.getState();
  const sel = selection().find(isMulticam);
  if (sel) return sel;
  return (
    elements.find((el) => isMulticam(el) && currentTime >= el.start && currentTime < el.start + el.duration) ?? null
  );
}

export async function switchMulticamAngle(angle: number, audioOnly = false): Promise<string | null> {
  const host = targetHost();
  if (!host) return null;
  const targetPath = fileOf(host);
  const local = usePlayerStore.getState().currentTime - host.start;
  const r = await post(audioOnly ? "/cut/multicam/audio" : "/cut/multicam/switch", {
    targetPath,
    hostId: rawId(host),
    time: local,
    angle,
  });
  await cutStudioBridge.recordEdit?.({
    label: audioOnly ? `Audio from Angle ${angle}` : `Switch to Angle ${angle}`,
    files: {
      [targetPath]: { before: r.before as string, after: r.after as string },
      [r.compPath as string]: { before: r.compBefore as string, after: r.compHtml as string },
    },
  });
  return audioOnly ? `Audio now from Angle ${angle} for the whole clip` : `Angle ${angle} from ${usePlayerStore.getState().currentTime.toFixed(2)}s`;
}
