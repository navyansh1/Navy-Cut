// Cut Studio: Final Cut-style playhead — a click anywhere in the track area moves the playhead there;
// a click on a clip also selects it (the clip's own handler still runs). Handles, fades, keyframes,
// headers and buttons keep their own behaviour.
export function timeAtClientX(root: HTMLElement, clientX: number): number | null {
  for (const clip of root.querySelectorAll<HTMLElement>("[data-clip-start][data-clip-end]")) {
    const r = clip.getBoundingClientRect();
    const start = Number(clip.dataset.clipStart), end = Number(clip.dataset.clipEnd);
    if (r.width > 4 && end > start) return start + ((clientX - r.left) / r.width) * (end - start);
  }
  return null;
}

export function shouldSeekOnPointerDown(e: PointerEvent | React.PointerEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  const t = e.target as HTMLElement | null;
  if (!t?.closest?.('[role="grid"], [data-timeline-zoom-scale]')) return false;
  if (t.closest('[role="rowheader"], button:not([data-clip]), input, select, [data-keyframe], [data-timeline-keyframe], .timeline-fade-handle, [data-volume-line] .cut-volume-line')) return false;
  for (let n: HTMLElement | null = t; n && !n.dataset?.clip; n = n.parentElement) {
    if (getComputedStyle(n).cursor === "col-resize") return false;   // trim handle
  }
  return true;
}
