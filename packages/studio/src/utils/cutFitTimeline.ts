// Cut Studio: Fit timeline to width (⇧Z, as in Final Cut). Always refits, even when fit mode is already on
// (a no-op state change used to leave a scrolled or stale view as it was), and scrolls back to the start.
import { usePlayerStore } from "../player/store/playerStore";

export function fitTimelineNow(): void {
  const { setZoomMode } = usePlayerStore.getState();
  setZoomMode("manual");
  requestAnimationFrame(() => {
    setZoomMode("fit");
    for (const el of document.querySelectorAll<HTMLElement>("[data-studio-timeline] *")) {
      if (el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflowX !== "visible") el.scrollLeft = 0;
    }
  });
}
