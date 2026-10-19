import { create } from "zustand";
import type { LayoutPreset } from "./dockLayout";
import {
  PANEL_DEFINITIONS,
  PANEL_IDS,
  panelsInZone,
  type PanelId,
  type PanelZone,
} from "./panelRegistry";

/** The narrow surface Dock.Root exposes; dockview types never leave the dock folder. */
export interface DockController {
  /** Adds the panel at its default place if it is closed; never moves focus. */
  open: (id: PanelId) => void;
  /** Focuses the panel, reopening it at its default place if it was closed. */
  activate: (id: PanelId) => void;
  setTitle: (id: PanelId, title: string) => void;
  close: (id: PanelId) => void;
  /** Hides or shows the panel's whole tab group without closing it. */
  setGroupVisible: (id: PanelId, visible: boolean) => void;
  reset: () => void;
  /** Cut Studio: rebuild the dock as one of the named layouts. */
  applyPreset: (preset: LayoutPreset) => void;
}

export interface DockSnapshot {
  openPanels: ReadonlySet<PanelId>;
  /** Open panels whose tab is showing and whose group is not hidden. */
  visiblePanels: ReadonlySet<PanelId>;
  activePanel: PanelId | null;
  /** The tab each group shows, so a restored layout still records what every side column last showed. */
  groupActivePanels?: readonly PanelId[];
}

type LastActive = Partial<Record<PanelZone, PanelId>>;

interface DockLayoutState extends DockSnapshot {
  controller: DockController | null;
  panels: readonly PanelId[];
  lastActive: LastActive;
  /** An activation requested before the dock mounted; Dock.Root applies it on ready. */
  pendingActivation: PanelId | null;
  attach: (controller: DockController, panels?: readonly PanelId[]) => void;
  detach: () => void;
  sync: (snapshot: DockSnapshot) => void;
  takePendingActivation: () => PanelId | null;
  activatePanel: (id: PanelId) => void;
  closePanel: (id: PanelId) => void;
  togglePanel: (id: PanelId) => void;
  setZoneVisible: (zone: PanelZone, visible: boolean) => void;
  resetLayout: () => void;
  layoutPreset: LayoutPreset;
  applyLayoutPreset: (preset: LayoutPreset) => void;
}

function readSavedPreset(): LayoutPreset {
  try {
    return localStorage.getItem("cut-layout-preset") === "vertical" ? "vertical" : "standard";
  } catch {
    return "standard";
  }
}

export const useDockLayoutStore = create<DockLayoutState>((set, get) => ({
  controller: null,
  panels: PANEL_IDS,
  openPanels: new Set(PANEL_IDS),
  visiblePanels: new Set(PANEL_IDS),
  activePanel: null,
  lastActive: {},
  pendingActivation: null,
  attach: (controller, panels = PANEL_IDS) => set({ controller, panels }),
  detach: () => set({ controller: null, lastActive: {} }),
  sync: (snapshot) =>
    set((state) => {
      const lastActive = { ...state.lastActive };
      for (const id of snapshot.groupActivePanels ?? []) {
        const zone = PANEL_DEFINITIONS[id].zone;
        if (zone !== "center") lastActive[zone] = id;
      }
      const { activePanel } = snapshot;
      if (activePanel) lastActive[PANEL_DEFINITIONS[activePanel].zone] = activePanel;
      return { ...snapshot, lastActive };
    }),
  takePendingActivation: () => {
    const { pendingActivation } = get();
    set({ pendingActivation: null });
    return pendingActivation;
  },
  activatePanel: (id) => {
    const { controller } = get();
    if (!controller) {
      set({ pendingActivation: id });
      return;
    }
    controller.setGroupVisible(id, true);
    controller.activate(id);
  },
  closePanel: (id) => get().controller?.close(id),
  togglePanel: (id) => {
    const { openPanels, activatePanel, closePanel } = get();
    if (openPanels.has(id)) closePanel(id);
    else activatePanel(id);
  },
  setZoneVisible: (zone, visible) => {
    const { controller, openPanels } = get();
    for (const id of panelsInZone(zone)) {
      if (openPanels.has(id)) controller?.setGroupVisible(id, visible);
    }
  },
  resetLayout: () => get().controller?.reset(),
  layoutPreset: readSavedPreset(),
  applyLayoutPreset: (preset) => {
    get().controller?.applyPreset(preset);
    set({ layoutPreset: preset });
    try {
      localStorage.setItem("cut-layout-preset", preset);
    } catch {
      /* private mode: the layout itself is still saved by the dock */
    }
    // The viewer fits its frame on resize; nudge it once the new grid has laid out.
    for (const ms of [30, 250, 800]) setTimeout(() => window.dispatchEvent(new Event("resize")), ms);
  },
}));

// The Mac app's View menu drives layouts through this hook.
if (typeof window !== "undefined") {
  (window as unknown as { __cutLayout?: (p: LayoutPreset) => void }).__cutLayout = (preset) =>
    useDockLayoutStore.getState().applyLayoutPreset(preset);
}

/** The panel of `zone` the user is looking at: the last one focused if still showing, else any showing. */
export function visiblePanelInZone(
  zone: PanelZone,
  lastActive: LastActive,
  visiblePanels: ReadonlySet<PanelId>,
): PanelId | null {
  const last = lastActive[zone];
  if (last && visiblePanels.has(last)) return last;
  return panelsInZone(zone).find((id) => visiblePanels.has(id)) ?? null;
}
