import type { TimelineElement } from "../store/playerStore";
import { useLivePreviewIframe } from "../store/previewIframeStore";
import { findTimelineElementInIframe } from "../../hooks/timelineEditingHelpers";

/** Final Cut-style angle segments on a multicam clip: a divider at each cut, labelled with its angle. */
export function MulticamCutMarks({ el }: { el: TimelineElement }) {
  const iframe = useLivePreviewIframe();
  const node = findTimelineElementInIframe(iframe, el);
  let cuts: Array<[number, number]> = [];
  try {
    cuts = JSON.parse(node?.getAttribute("data-multicam-cuts") ?? "[[0,1]]");
  } catch {
    cuts = [[0, 1]];
  }
  if (!el.duration) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex: 3 }}>
      {cuts.map(([t, angle], i) => {
        const left = `${(Math.max(0, t) / el.duration) * 100}%`;
        return (
          <div key={`${t}-${angle}`} className="absolute bottom-0 top-0" style={{ left }}>
            {i > 0 && <div className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 bg-black/70" />}
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[9px] font-semibold text-white">
              {angle}
            </span>
          </div>
        );
      })}
    </div>
  );
}
