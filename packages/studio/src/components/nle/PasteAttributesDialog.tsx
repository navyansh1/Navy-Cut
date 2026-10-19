import { useState } from "react";
import { createPortal } from "react-dom";
import { useTimelineEditContextOptional } from "../../contexts/TimelineEditContext";
import { Button } from "../ui/Button";
import {
  PASTE_ATTRIBUTE_GROUPS,
  pasteTargets,
  usePasteAttributesStore,
} from "./pasteAttributesStore";

/** Final Cut's Paste Attributes window: tick what to carry over from the copied clip. */
export function PasteAttributesDialog() {
  const { open, copied, setOpen } = usePasteAttributesStore();
  const { onSetElementsAttributeQuiet } = useTimelineEditContextOptional();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(["color"]));
  if (!open) return null;
  const targets = pasteTargets();
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const paste = async () => {
    if (!copied || !onSetElementsAttributeQuiet) return;
    for (const group of PASTE_ATTRIBUTE_GROUPS) {
      if (!picked.has(group.id)) continue;
      for (const attr of group.attrs) {
        const value = copied.values[attr] ?? null;
        await onSetElementsAttributeQuiet(
          targets.map((element) => ({ element, value })),
          attr,
          `Paste ${group.label}`,
        );
      }
    }
    setOpen(false);
  };
  const sections = ["Video", "Audio", "Time"] as const;
  return createPortal(
    <div
      className="fixed inset-0 z-300 flex items-center justify-center bg-black/50"
      onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
        if (e.key === "Enter") void paste();
      }}
    >
      <div
        role="dialog"
        aria-label="Paste Attributes"
        className="w-[340px] rounded-lg border border-border-strong bg-raised p-4 text-step-11 text-text-1 shadow-xl"
      >
        <div className="mb-1 text-step-10 font-semibold">Paste Attributes</div>
        <div className="mb-3 text-text-3">
          {copied
            ? `From “${copied.sourceLabel}” to ${targets.length} clip${targets.length === 1 ? "" : "s"}`
            : "Copy a clip first (⌘C)."}
        </div>
        {sections.map((section) => (
          <div key={section} className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-4">
              {section}
            </div>
            {PASTE_ATTRIBUTE_GROUPS.filter((g) => g.section === section).map((group) => (
              <label key={group.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={picked.has(group.id)}
                  onChange={() => toggle(group.id)}
                  className="accent-[#f5c33b]"
                />
                <span>{group.label}</span>
              </label>
            ))}
          </div>
        ))}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!copied || targets.length === 0 || picked.size === 0}
            onClick={() => void paste()}
          >
            Paste
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
