import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuClasses } from "./ui/menuStyle";
import { fetchTimelines, listTimelines, newTimeline, renameTimeline, type TimelineEntry } from "../utils/cutTimelines";
import { cutStudioBridge } from "../utils/cutCompoundClips";

const toast = (detail: string) => window.dispatchEvent(new CustomEvent("cut-studio-toast", { detail }));

/** Timeline picker on the Timeline panel strip: every timeline in the project, New, and Rename (or double-click). */
export function TimelineSwitcher({ activeCompPath }: { activeCompPath: string | null }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [timelines, setTimelines] = useState<TimelineEntry[]>(() => listTimelines());
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const refresh = () => void fetchTimelines().then(setTimelines);
  useEffect(refresh, [activeCompPath, open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) =>
      !ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const current = timelines.find((t) => t.path === activeCompPath) ?? timelines[0];
  const commitRename = (value: string) => {
    setRenaming(false);
    const name = value.trim();
    if (!current || !name || name === current.label) return;
    void renameTimeline(current.path, name).then(refresh, (e: Error) => toast(e.message));
  };

  return (
    <div ref={ref} className="relative">
      {renaming ? (
        <input
          autoFocus
          defaultValue={current?.label}
          aria-label="Timeline name"
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitRename(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
            e.stopPropagation();
          }}
          className="h-6 w-44 rounded-md border border-[#f5c33b] bg-neutral-900 px-2 text-[11px] text-text-1 outline-hidden"
        />
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onDoubleClick={() => {
            setOpen(false);
            setRenaming(true);
          }}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-text-1 hover:bg-neutral-800"
          title="Switch timeline · double-click to rename · ⌘N for a new one"
        >
          <span className="text-[#f5c33b]">▤</span>
          {current?.label ?? "Main Timeline"}
          <span className="text-neutral-500">▾</span>
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`${menuClasses.panel} fixed z-[300] w-60`}
            style={(() => {
              const r = ref.current?.getBoundingClientRect();
              return r ? { left: r.left, top: r.bottom + 4 } : undefined;
            })()}
          >
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
                void newTimeline().then((m) => (m ? (toast(m), refresh()) : undefined), (e: Error) => toast(e.message));
              }}
              className={`${menuClasses.row} ${menuClasses.rowEnabled} flex items-center justify-between`}
            >
              <span>New Timeline…</span>
              <span className="text-[10px] text-neutral-500">⌘N</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setRenaming(true);
              }}
              className={`${menuClasses.row} ${menuClasses.rowEnabled}`}
            >
              Rename “{current?.label}”…
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
