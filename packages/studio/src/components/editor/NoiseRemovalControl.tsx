import { useState } from "react";
import type { DomEditSelection } from "./domEditingTypes";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import { cutStudioBridge } from "../../utils/cutCompoundClips";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { studioApiFetch } from "../../utils/studioApiFetch";
import { studioWriteHeaders } from "../../utils/studioFileVersion";

type Mode = "noise" | "voice";

/**
 * FCP's Noise Removal / Voice Isolation: renders a cleaned copy of the clip's media with
 * DeepFilterNet3 on Apple's MLX (media/cut/…), then points the clip at it. The original file is
 * kept and remembered in data-original-src, so "Off" swaps straight back.
 */
export function NoiseRemovalControl({
  element,
  onSetAttributeQuiet,
  onSetHtmlAttribute,
}: {
  element: DomEditSelection;
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>;
  /** Plain HTML attributes (src) go through Studio's html-attribute commit, not the data-* writer. */
  onSetHtmlAttribute?: (attr: string, value: string | null) => void | Promise<void>;
}) {
  const setSrc = (value: string) => (onSetHtmlAttribute ?? onSetAttributeQuiet)("src", value);
  const current = element.element.getAttribute("src") ?? "";
  const original = element.dataAttributes?.["original-src"] ?? null;
  const applied = /\/cut\/[^/]+\.(noise|voice)-(\d+)\./.exec(current);
  const [mode, setMode] = useState<Mode>((applied?.[1] as Mode) ?? "noise");
  const [amount, setAmount] = useState(applied ? Number(applied[2]) : 60);
  const [job, setJob] = useState<{ progress: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const projectId = cutStudioBridge.projectId;
    if (!projectId) return;
    setError(null);
    setJob({ progress: 0, stage: "Starting" });
    try {
      const start = await studioApiFetch(buildProjectApiPath(projectId, "/cut/denoise"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...studioWriteHeaders() },
        body: JSON.stringify({ src: original ?? current, amount: amount / 100, mode }),
      });
      const { jobId, error: startError } = (await start.json()) as { jobId?: string; error?: string };
      if (!jobId) throw new Error(startError ?? "Could not start");
      for (;;) {
        await new Promise((r) => setTimeout(r, 700));
        const res = await studioApiFetch(buildProjectApiPath(projectId, `/cut/jobs/${jobId}`));
        const j = (await res.json()) as { status: string; progress: number; stage: string; output?: string; error?: string };
        if (j.status === "failed") throw new Error(j.error ?? "Failed");
        setJob({ progress: j.progress, stage: j.stage });
        if (j.status === "complete" && j.output) {
          if (!original) await onSetAttributeQuiet("data-original-src", current);
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

  const off = async () => {
    if (!original) return;
    await setSrc(original);
    await onSetAttributeQuiet("data-original-src", null);
  };

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 rounded-md px-2 py-1 text-[11px] ${mode === m ? "bg-[#f5c33b] text-black" : "bg-panel-input text-panel-text-2"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {tab("noise", "Noise Removal")}
        {tab("voice", "Voice Isolation")}
      </div>
      {mode === "noise" && (
        <FlatSlider label="Amount" value={amount} min={0} max={100}
          tier={amount !== 60 ? "explicitCustom" : "default"} displayValue={`${amount}%`}
          onCommit={(v) => setAmount(Math.round(v))} onReset={() => setAmount(60)} />
      )}
      {job ? (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded bg-panel-input">
            <div className="h-full bg-[#f5c33b] transition-[width]" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
          <div className="text-[10px] text-panel-text-4">{job.stage}… (Apple GPU, MLX)</div>
        </div>
      ) : (
        <div className="flex gap-1">
          <button type="button" onClick={() => void run()}
            className="flex-1 rounded-md bg-panel-input px-2 py-1.5 text-[11px] text-panel-text-1 hover:bg-panel-bg-soft">
            {applied ? "Re-apply" : "Apply"}
          </button>
          {original && (
            <button type="button" onClick={() => void off()}
              className="rounded-md bg-panel-input px-3 py-1.5 text-[11px] text-panel-text-3 hover:text-panel-text-1">
              Off
            </button>
          )}
        </div>
      )}
      {applied && !job && (
        <div className="text-[10px] text-panel-text-4">
          On: {applied[1] === "voice" ? "voice isolation" : `noise removal ${applied[2]}%`}
        </div>
      )}
      {error && <div className="text-[10px] text-danger-ink">{error}</div>}
    </div>
  );
}
