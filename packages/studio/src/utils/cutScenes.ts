// Cut Studio: Detect Scene Cuts — adds an edit at every scene change PySceneDetect finds in the clip.
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { buildProjectApiPath } from "./projectRouting";
import { studioApiFetch } from "./studioApiFetch";
import { studioWriteHeaders } from "./studioFileVersion";
import { cutStudioBridge } from "./cutCompoundClips";

function relativeSrc(el: TimelineElement): string | null {
  if (!el.src) return null;
  const m = /\/preview\/(.+)$/.exec(el.src.split(/[?#]/)[0]!);
  return m ? decodeURIComponent(m[1]!) : el.src;
}

export async function detectSceneCuts(
  element: TimelineElement,
  split: (el: TimelineElement, time: number) => unknown,
  sensitivity = 50,
): Promise<string> {
  const src = relativeSrc(element);
  if (!src || !cutStudioBridge.projectId) return "This clip has no media file";
  const res = await studioApiFetch(buildProjectApiPath(cutStudioBridge.projectId, "/cut/scenes"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
    body: JSON.stringify({ src, sensitivity }),
  });
  const json = (await res.json()) as { cuts?: number[]; error?: string };
  if (!res.ok || !json.cuts) throw new Error(json.error ?? "Scene detection failed");
  const rate = element.playbackRate && element.playbackRate > 0 ? element.playbackRate : 1;
  const mediaStart = element.playbackStart ?? 0;
  const key = element.key ?? element.id;
  const times = json.cuts
    .map((t) => element.start + (t - mediaStart) / rate)
    .filter((t) => t > element.start + 0.1 && t < element.start + element.duration - 0.1)
    .sort((a, b) => b - a); // right to left, so the original clip keeps its identity
  for (const t of times) {
    const current = usePlayerStore.getState().elements.find((e) => (e.key ?? e.id) === key) ?? element;
    await split(current, t);
    await new Promise((r) => setTimeout(r, 120));
  }
  return times.length ? `Added ${times.length} edit${times.length === 1 ? "" : "s"} at scene changes` : "No scene changes found";
}
