// Cut Studio: Final Cut's Copy + Paste Attributes (⌘C, then ⇧⌘V). Copy snapshots the
// selected clip's edit attributes; the dialog pastes the chosen ones onto the selection.
import { create } from "zustand";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import { findTimelineElementInIframe } from "../../hooks/timelineEditingHelpers";

export interface PasteAttributeGroup {
  id: string;
  label: string;
  section: "Video" | "Audio" | "Time";
  attrs: readonly string[];
}

export const PASTE_ATTRIBUTE_GROUPS: readonly PasteAttributeGroup[] = [
  { id: "color", label: "Color", section: "Video", attrs: ["data-color-grading"] },
  { id: "opacity", label: "Opacity & blend", section: "Video", attrs: ["data-opacity", "data-blend"] },
  { id: "volume", label: "Volume", section: "Audio", attrs: ["data-volume", "muted"] },
  { id: "audio-fx", label: "Audio effects (EQ, noise removal)", section: "Audio", attrs: ["data-fx-chain"] },
  { id: "fades", label: "Fades", section: "Audio", attrs: ["data-fade-in", "data-fade-out"] },
  { id: "speed", label: "Speed", section: "Time", attrs: ["data-playback-rate"] },
];

interface CopiedAttributes {
  sourceLabel: string;
  values: Record<string, string | null>;
}

interface PasteAttributesState {
  copied: CopiedAttributes | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePasteAttributesStore = create<PasteAttributesState>((set) => ({
  copied: null,
  open: false,
  setOpen: (open) => set({ open }),
}));

function selectedElements(): TimelineElement[] {
  const { elements, selectedElementId, selectedElementIds } = usePlayerStore.getState();
  const ids = new Set(selectedElementIds);
  if (selectedElementId) ids.add(selectedElementId);
  return elements.filter((el) => ids.has(el.key ?? el.id));
}

/** Called on ⌘C: remember the edit attributes of the (first) selected clip. */
export function snapshotCopiedAttributes(): void {
  const [source] = selectedElements();
  if (!source) return;
  const node = findTimelineElementInIframe(usePreviewIframeStore.getState().iframe, source);
  if (!node) return;
  const values: Record<string, string | null> = {};
  for (const group of PASTE_ATTRIBUTE_GROUPS)
    for (const attr of group.attrs) values[attr] = node.getAttribute(attr);
  usePasteAttributesStore.setState({
    copied: { sourceLabel: source.label || source.id, values },
  });
}

export function pasteTargets(): TimelineElement[] {
  return selectedElements();
}
