import { useRef, useState } from "react";
import type { TimelineElement } from "../store/playerStore";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";

// Final Cut's volume line: a horizontal line across the waveform; drag it up or down to change the
// clip's level. Range −30 dB … +12 dB like FCP's visible range; 0 dB sits at 70 % of the strip height.
const MIN_DB = -30;
const MAX_DB = 12;
const toDb = (v: number) => (v <= 0.0316 ? MIN_DB : Math.max(MIN_DB, Math.min(MAX_DB, 20 * Math.log10(v))));
const toGain = (db: number) => (db <= MIN_DB ? 0 : 10 ** (db / 20));
const dbToFrac = (db: number) => (MAX_DB - db) / (MAX_DB - MIN_DB); // 0 = top
const fmt = (db: number) => (db <= MIN_DB ? "−∞ dB" : `${db > 0 ? "+" : db < 0 ? "−" : ""}${Math.abs(db).toFixed(1)} dB`);

export function ClipVolumeLine({ el, isAudioClip }: { el: TimelineElement; isAudioClip: boolean }) {
  const { onSetElementAttributeLive, onSetElementAttributeQuiet, onRevertElementAttributeLive } =
    useTimelineEditContextOptional();
  const stripRef = useRef<HTMLDivElement>(null);
  const [dragDb, setDragDb] = useState<number | null>(null);
  if (!onSetElementAttributeQuiet) return null;
  const db = dragDb ?? toDb(el.volume ?? 1);

  const dbAt = (clientY: number) => {
    const r = stripRef.current!.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const raw = MAX_DB - frac * (MAX_DB - MIN_DB);
    return Math.abs(raw) < 0.6 ? 0 : Math.round(raw * 2) / 2; // snap to 0 dB, 0.5 dB steps
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const next = dbAt(ev.clientY);
      setDragDb(next);
      onSetElementAttributeLive?.(el, "data-volume", toGain(next).toFixed(4));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const final = dbAt(ev.clientY);
      setDragDb(null);
      onRevertElementAttributeLive?.(el, "data-volume");
      void onSetElementAttributeQuiet(el, "data-volume", toGain(final).toFixed(4), "Volume");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={stripRef}
      data-volume-line=""
      className={`cut-volume-strip ${isAudioClip ? "is-audio" : "is-video"}`}
    >
      <div
        className={`cut-volume-line${dragDb != null ? " is-dragging" : ""}`}
        style={{ top: `${dbToFrac(db) * 100}%` }}
        onPointerDown={onPointerDown}
        title={`Volume ${fmt(db)} · drag up or down`}
      >
        {dragDb != null && <span className="cut-volume-readout">{fmt(db)}</span>}
      </div>
    </div>
  );
}
