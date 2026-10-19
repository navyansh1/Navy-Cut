import type { ReactNode } from "react";
import type { DomEditSelection } from "./domEditingTypes";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import { KeyframeGutter, type GeometryRowsProps } from "./propertyPanelFlatLayoutSection";
import { cutStudioBridge } from "../../utils/cutCompoundClips";

/**
 * Final Cut's Video inspector: Compositing (Blend Mode, Opacity), Transform (Position, Rotation, Scale)
 * and Crop (Left, Right, Top, Bottom), each parameter with a keyframe button. Colour lives in its own panel.
 * Crop is four CSS variables (--crop-l/r/t/b, in %) feeding the clip's clip-path, so each side keyframes alone.
 */
export const CROP_CLIP_PATH =
  "inset(calc(var(--crop-t, 0) * 1%) calc(var(--crop-r, 0) * 1%) calc(var(--crop-b, 0) * 1%) calc(var(--crop-l, 0) * 1%))";

const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];

type Gutter = Pick<GeometryRowsProps, "element" | "gsapAnimId" | "navKeyframes" | "currentPct" | "seekFromKfPct"
  | "animIdForProp" | "onCommitAnimatedProperty" | "onRemoveKeyframe" | "onConvertToKeyframes">;

export interface FlatVideoInspectorProps extends Gutter {
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  displayX: number;
  displayY: number;
  displayR: number;
  commitManualOffset: (axis: "x" | "y", value: string) => void;
  commitManualRotation: (value: string) => void;
  children?: ReactNode;
}

function live(el: HTMLElement) {
  const win = el.ownerDocument.defaultView as (Window & { gsap?: { getProperty: (t: Element, p: string) => unknown } }) | null;
  const cs = win?.getComputedStyle(el);
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    scale: num(win?.gsap?.getProperty(el, "scale"), 1),
    opacity: num(cs?.opacity, 1),
    crop: (side: string) => num(cs?.getPropertyValue(`--crop-${side}`).trim(), 0),
    blend: cs?.mixBlendMode || "normal",
  };
}

function Section({ title, onReset, children }: { title: string; onReset?: () => void; children: ReactNode }) {
  return (
    <div className="border-b border-panel-hairline px-3 pb-2.5 pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-panel-text-1">{title}</span>
        {onReset && (
          <button type="button" onClick={onReset} title={`Reset ${title}`}
            className="rounded px-1.5 text-[11px] text-panel-text-4 hover:bg-panel-bg-soft hover:text-panel-text-1">↺</button>
        )}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function FlatVideoInspector(props: FlatVideoInspectorProps) {
  const { element, onSetStyle, onCommitAnimatedProperty, displayX, displayY, displayR, commitManualOffset, commitManualRotation } = props;
  const v = live(element.element);
  const gutterProps: Gutter = {
    element, gsapAnimId: props.gsapAnimId, navKeyframes: props.navKeyframes, currentPct: props.currentPct,
    seekFromKfPct: props.seekFromKfPct, animIdForProp: props.animIdForProp, onCommitAnimatedProperty,
    onRemoveKeyframe: props.onRemoveKeyframe, onConvertToKeyframes: props.onConvertToKeyframes,
  };
  // ◇: on an animated clip, the per-parameter keyframe control; on a static clip, start keyframing it.
  const kf = (property: string, value: number) =>
    props.gsapAnimId ? (
      <KeyframeGutter property={property} displayValue={value} {...gutterProps} />
    ) : (
      <button type="button" title="Add keyframe (starts animating this clip)"
        onClick={() => void cutStudioBridge.enableKeyframes?.()}
        className="ml-1 text-[12px] text-panel-text-4 hover:text-[#f5c33b]">◇</button>
    );
  const anim = (prop: string, value: number) => void onCommitAnimatedProperty?.(element, prop, value);
  const ensureCrop = () => {
    if (!(element.inlineStyles?.["clip-path"] ?? "").includes("--crop-")) void onSetStyle("clip-path", CROP_CLIP_PATH);
  };
  const crop = (side: "l" | "r" | "t" | "b", value: number) => {
    ensureCrop();
    anim(`--crop-${side}`, Math.max(0, Math.min(95, value)));
  };
  const row = (label: string, value: number, min: number, max: number, step: number, unit: string,
    def: number, commit: (n: number) => void, keyProp: string, keyValue: number) => (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">
        <FlatSlider label={label} value={value} min={min} max={max} step={step}
          tier={Math.abs(value - def) > 1e-6 ? "explicitCustom" : "default"}
          displayValue={`${Number(value.toFixed(step < 1 ? 1 : 0))}${unit}`}
          onCommit={commit} onReset={() => commit(def)} />
      </div>
      {kf(keyProp, keyValue)}
    </div>
  );

  return (
    <div data-cut-video-inspector="">
      <Section title="Compositing" onReset={() => { void onSetStyle("mix-blend-mode", "normal"); anim("opacity", 1); }}>
        <label className="flex items-center justify-between py-1 text-[11px] text-panel-text-3">
          <span>Blend Mode</span>
          <select value={v.blend} onChange={(e) => void onSetStyle("mix-blend-mode", e.target.value)}
            className="rounded-md bg-panel-input px-2 py-1 text-[11px] text-panel-text-1 outline-hidden">
            {BLEND_MODES.map((m) => <option key={m} value={m}>{m[0]!.toUpperCase() + m.slice(1)}</option>)}
          </select>
        </label>
        {row("Opacity", v.opacity * 100, 0, 100, 1, "%", 100, (n) => anim("opacity", n / 100), "opacity", v.opacity)}
      </Section>

      <Section title="Transform" onReset={() => { commitManualOffset("x", "0"); commitManualOffset("y", "0"); commitManualRotation("0"); anim("scale", 1); }}>
        {row("Position X", displayX, -2000, 2000, 1, " px", 0, (n) => commitManualOffset("x", String(Math.round(n))), "x", displayX)}
        {row("Position Y", displayY, -2000, 2000, 1, " px", 0, (n) => commitManualOffset("y", String(Math.round(n))), "y", displayY)}
        {row("Rotation", displayR, -180, 180, 0.5, "°", 0, (n) => commitManualRotation(String(n)), "rotation", displayR)}
        {row("Scale", v.scale * 100, 10, 400, 1, "%", 100, (n) => anim("scale", n / 100), "scale", v.scale)}
      </Section>

      <Section title="Crop" onReset={() => { for (const s of ["l", "r", "t", "b"] as const) anim(`--crop-${s}`, 0); }}>
        {row("Left", v.crop("l"), 0, 95, 0.5, "%", 0, (n) => crop("l", n), "--crop-l", v.crop("l"))}
        {row("Right", v.crop("r"), 0, 95, 0.5, "%", 0, (n) => crop("r", n), "--crop-r", v.crop("r"))}
        {row("Top", v.crop("t"), 0, 95, 0.5, "%", 0, (n) => crop("t", n), "--crop-t", v.crop("t"))}
        {row("Bottom", v.crop("b"), 0, 95, 0.5, "%", 0, (n) => crop("b", n), "--crop-b", v.crop("b"))}
      </Section>

      {props.children}
    </div>
  );
}
