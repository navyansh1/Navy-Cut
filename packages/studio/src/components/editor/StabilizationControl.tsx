import { useState } from "react";
import type { DomEditSelection } from "./domEditingTypes";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import { cutStudioBridge } from "../../utils/cutCompoundClips";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { studioWriteHeaders } from "../../utils/studioFileVersion";

/**
 * FCP's Stabilization, for any footage: Apple Vision measures the camera shake, Core Image (Metal)
 * steadies each frame and VideoToolbox encodes it (media/cut/…stab-N.mp4). The pre-stabilization file
 * is kept in data-prestab-src, so "Off" swaps straight back.
 */
export function StabilizationControl({
  element,
  onSetAttributeQuiet,
  onSetHtmlAttribute,
}: {
  element: DomEditSelection;
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>;
  onSetHtmlAttribute?: (attr: string, value: string | null) => void | Promise<void>;
}) {
  const current = element.element.getAttribute("src") ?? "";
  const original = element.dataAttributes?.["prestab-src"] ?? null;
  const applied = /\.stab-(\d+)\.mp4$/.exec(current);
  const [amount, setAmount] = useState(applied ? Number(applied[1]) : 60);
  const [job, setJob] = useState<{ progress: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setSrc = (v: string) => (onSetHtmlAttribute ?? onSetAttributeQuiet)("src", v);

  const run = async () => {
    const projectId = cutStudioBridge.projectId;
    if (!projectId) return;
    setError(null);
    setJob({ progress: 0, stage: "Starting" });
    try {
      const start = await studioApiFetch(buildProjectApiPath(projectId, "/cut/stabilize"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
        body: JSON.stringify({ src: original ?? current, amount }),
      });
      const { jobId, error: e } = (await start.json()) as { jobId?: string; error?: string };
      if (!jobId) throw new Error(e ?? "Could not start");
      for (;;) {
        await new Promise((r) => setTimeout(r, 700));
        const res = await studioApiFetch(buildProjectApiPath(projectId, `/cut/jobs/${jobId}`));
        const j = (await res.json()) as { status: string; progress: number; stage: string; output?: string; error?: string };
        if (j.status === "failed") throw new Error(j.error ?? "Failed");
        setJob({ progress: j.progress, stage: j.stage });
        if (j.status === "complete" && j.output) {
          if (!original) await onSetAttributeQuiet("data-prestab-src", current);
          await setSrc(j.output);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJob(null);
    }
  };

  return (
    <div className="space-y-1.5 px-3 pb-3 pt-2">
      <div className="mb-1 text-[11px] font-semibold text-panel-text-1">Stabilization</div>
      <FlatSlider label="Amount" value={amount} min={0} max={100}
        tier={amount !== 60 ? "explicitCustom" : "default"} displayValue={`${amount}%`}
        onCommit={(v) => setAmount(Math.round(v))} onReset={() => setAmount(60)} />
      {job ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded bg-panel-input">
            <div className="h-full bg-[#f5c33b]" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
          <div className="text-[10px] text-panel-text-4">{job.stage}… (Apple Vision + Metal)</div>
        </div>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={() => void run()}
            className="flex-1 rounded-md bg-panel-input px-2 py-1.5 text-[11px] text-panel-text-1 hover:bg-panel-bg-soft">
            {applied ? "Re-apply" : "Stabilize"}
          </button>
          {original && (
            <button type="button"
              onClick={() => void (async () => { await setSrc(original); await onSetAttributeQuiet("data-prestab-src", null); })()}
              className="rounded-md bg-panel-input px-3 py-1.5 text-[11px] text-panel-text-3 hover:text-panel-text-1">
              Off
            </button>
          )}
        </div>
      )}
      {applied && !job && <div className="text-[10px] text-panel-text-4">On: {applied[1]}%</div>}
      {error && <div className="text-[10px] text-danger-ink">{error}</div>}
    </div>
  );
}
