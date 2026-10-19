import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuClasses } from "./ui/menuStyle";
import { studioApiFetch } from "../utils/studioApiFetch";

interface RecentProject {
  id: string;
  title: string;
  dir: string;
  marker?: string;
}

type NativeBridge = { postMessage: (m: Record<string, string>) => void };
const native = (): NativeBridge | null =>
  (window as unknown as { webkit?: { messageHandlers?: { navycut?: NativeBridge } } }).webkit?.messageHandlers?.navycut ?? null;

/** Project picker beside the project name: recent projects, New Project (16:9 / 9:16), Open Project…. */
export function ProjectSwitcher({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void studioApiFetch("/api/cut/recent-projects")
      .then((r) => r.json() as Promise<RecentProject[]>)
      .then(setRecent, () => setRecent([]));
  }, [projectId, open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) =>
      !ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const title = recent.find((p) => p.id === projectId)?.title ?? projectId ?? "No project";
  const bridge = native();
  const act = (m: Record<string, string>) => {
    setOpen(false);
    if (bridge) bridge.postMessage(m);
    else if (m.action === "recent" && m.id) window.location.hash = `#project/${encodeURIComponent(m.id)}`;
  };
  const row = `${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-step-11 font-medium text-text-1 hover:bg-neutral-800"
        title="Switch project"
      >
        {title}
        <span className="text-neutral-500">▾</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`${menuClasses.panel} fixed z-[300] w-72`}
            style={(() => {
              const r = ref.current?.getBoundingClientRect();
              return r ? { left: r.left, top: r.bottom + 4 } : undefined;
            })()}
          >
            <div className="px-3 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
              Recent projects
            </div>
            {recent.length === 0 && <div className="px-3 py-1.5 text-[11px] text-neutral-500">None yet</div>}
            {recent.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={p.id === projectId}
                title={p.dir}
                onClick={() => act({ action: "recent", id: p.id, dir: p.dir, marker: p.marker ?? "" })}
                className={row}
              >
                <span className="w-3 text-accent-ink">{p.id === projectId ? "✓" : ""}</span>
                <span className="truncate">{p.title}</span>
              </button>
            ))}
            <div className={menuClasses.divider} />
            <button type="button" role="menuitem" disabled={!bridge} onClick={() => act({ action: "new", aspect: "16:9" })} className={row}>
              <span className="w-3" />New Project (16:9)…
            </button>
            <button type="button" role="menuitem" disabled={!bridge} onClick={() => act({ action: "new", aspect: "9:16" })} className={row}>
              <span className="w-3" />New Vertical Project (9:16)…
            </button>
            <button type="button" role="menuitem" disabled={!bridge} onClick={() => act({ action: "open" })} className={`${row} justify-between`}>
              <span className="flex gap-2"><span className="w-3" />Open Project…</span>
              <span className="text-[10px] text-neutral-500">⌘O</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
