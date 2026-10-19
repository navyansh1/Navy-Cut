import { useEffect, useRef, useState } from "react";
import { menuClasses } from "./ui/menuStyle";
import { listTimelines, newTimeline } from "../utils/cutTimelines";
import { cutStudioBridge } from "../utils/cutCompoundClips";

/** Top-bar timeline picker, like Final Cut's project switcher: every timeline in the project, plus New. */
export function TimelineSwitcher({ activeCompPath }: { activeCompPath: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const timelines = listTimelines();
  const current =
    timelines.find((t) => t.path === activeCompPath) ??
    (activeCompPath && !activeCompPath.startsWith("compositions/timeline-") ? null : timelines[0]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-text-1 hover:bg-neutral-800"
        title="Switch timeline (⌘N for a new one)"
      >
        <span className="text-[#f5c33b]">▤</span>
        {current?.label ?? "Main Timeline"}
        <span className="text-neutral-500">▾</span>
      </button>
      {open && (
        <div role="menu" className={`${menuClasses.panel} absolute left-0 top-8 z-50 w-56`}>
          {timelines.map((t) => (
            <button
              key={t.path}
              type="button"
              role="menuitemradio"
              aria-checked={t.path === current?.path}
              onClick={() => {
                cutStudioBridge.selectComposition?.(t.path);
                setOpen(false);
              }}
              className={`${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2`}
            >
              <span className="w-3 text-accent-ink">{t.path === current?.path ? "✓" : ""}</span>
              {t.label}
            </button>
          ))}
          <div className={menuClasses.divider} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void newTimeline().then(
                (m) => m && window.dispatchEvent(new CustomEvent("cut-studio-toast", { detail: m })),
                (e: Error) => window.dispatchEvent(new CustomEvent("cut-studio-toast", { detail: e.message })),
              );
            }}
            className={`${menuClasses.row} ${menuClasses.rowEnabled} flex items-center justify-between`}
          >
            <span>New Timeline…</span>
            <span className="text-[10px] text-neutral-500">⌘N</span>
          </button>
        </div>
      )}
    </div>
  );
}
