import type { IDockviewHeaderActionsProps } from "dockview-react";
import { TimelineSwitcher } from "../TimelineSwitcher";
import { useStudioShellContext } from "../../contexts/StudioContext";

/** Cut Studio: the timeline picker sits on the Timeline panel's own strip, like FCP's project name bar. */
export function DockTimelineActions({ panels }: IDockviewHeaderActionsProps) {
  const { activeCompPath } = useStudioShellContext();
  if (!panels.some((panel) => panel.id === "timeline")) return null;
  return (
    <div className="flex h-full items-center pl-1">
      <TimelineSwitcher activeCompPath={activeCompPath} />
    </div>
  );
}
