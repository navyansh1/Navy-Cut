import type { TimelineElement } from "../store/timelineElement";

/**
 * Cut Studio: an animated wrapper whose children are timed clips (a PiP box, a zoom layer)
 * is a transform on those clips, not a clip — keep it off the timeline, as Final Cut does.
 */
export function dropMediaWrappers(
  elements: TimelineElement[],
  doc: Document | null,
): TimelineElement[] {
  if (!doc) return elements;
  return elements.filter((el) => {
    if (el.kind === "composition" || el.compositionSrc) return true;
    const rawId = el.domId ?? (el.key ?? el.id).split("#").pop() ?? "";
    const node = rawId ? doc.getElementById(rawId) : null;
    if (!node || /^(VIDEO|AUDIO|IMG)$/.test(node.tagName)) return true;
    return node.hasAttribute("data-start") || node.querySelector("[data-start]") === null;
  });
}
