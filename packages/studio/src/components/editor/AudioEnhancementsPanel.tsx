import { HF_AUDIO_FX_ATTR, HF_AUDIO_FX_DATA_KEY, parseAudioFxChain, serializeAudioFxChain, type HfAudioFxChain } from "@hyperframes/core/audio-fx";
import type { DomEditSelection } from "./domEditingTypes";
import { FlatSlider } from "./propertyPanelFlatPrimitives";
import { EQ_PRESETS, FLAT, readEnhancements, writeEnhancements, type AudioEnhancements } from "./cutAudioEnhancements";
import { NoiseRemovalControl } from "./NoiseRemovalControl";

const HEADING = "mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-panel-text-5";

/** Final Cut's Audio Enhancements block: Equalization (Bass/Treble), Noise Removal, Loudness, Hum Removal. */
export function AudioEnhancementsPanel({
  element,
  onSetAttributeQuiet,
  onSetHtmlAttribute,
}: {
  element: DomEditSelection;
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>;
  onSetHtmlAttribute?: (attr: string, value: string | null) => void | Promise<void>;
}) {
  const chain = ((): HfAudioFxChain => {
    const raw = element.dataAttributes?.[HF_AUDIO_FX_DATA_KEY];
    try {
      return raw ? parseAudioFxChain(raw) : { version: 1, nodes: [] };
    } catch {
      return { version: 1, nodes: [] };
    }
  })();
  const e = readEnhancements(chain);
  const commit = (next: Partial<AudioEnhancements>) => {
    const out = writeEnhancements(chain, { ...e, ...next });
    void onSetAttributeQuiet(HF_AUDIO_FX_ATTR, out.nodes.length ? serializeAudioFxChain(out) : null);
  };
  const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
  return (
    <div className="space-y-1.5 border-b border-panel-hairline px-3 pb-3 pt-2" data-cut-audio-enhancements="">
      <div className={HEADING}>Equalization</div>
      <select
        aria-label="Equalization preset"
        defaultValue=""
        onChange={(ev) => {
          const p = EQ_PRESETS.find((x) => x.id === ev.target.value);
          if (p) commit(p.set);
          ev.target.value = "";
        }}
        className="mb-1 w-full rounded-md bg-panel-input px-2 py-1.5 text-[11px] text-panel-text-1 outline-hidden"
      >
        <option value="" disabled>
          Preset…
        </option>
        {EQ_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <FlatSlider label="Bass" value={e.bass} min={-12} max={12} step={0.5} centerTick
        tier={e.bass ? "explicitCustom" : "default"} displayValue={db(e.bass)}
        onCommit={(v) => commit({ bass: v })} onReset={() => commit({ bass: 0 })} />
      <FlatSlider label="Treble" value={e.treble} min={-12} max={12} step={0.5} centerTick
        tier={e.treble ? "explicitCustom" : "default"} displayValue={db(e.treble)}
        onCommit={(v) => commit({ treble: v })} onReset={() => commit({ treble: 0 })} />
      <FlatSlider label="Voice clarity" value={e.presence} min={-6} max={9} step={0.5} centerTick
        tier={e.presence ? "explicitCustom" : "default"} displayValue={db(e.presence)}
        onCommit={(v) => commit({ presence: v })} onReset={() => commit({ presence: 0 })} />
      <label className="flex items-center gap-2 py-0.5 text-[11px] text-panel-text-2">
        <input type="checkbox" checked={e.lowCut} onChange={() => commit({ lowCut: !e.lowCut })} className="accent-[#f5c33b]" />
        Low cut (80 Hz rumble)
      </label>

      <div className={`${HEADING} pt-2`}>Noise Removal &amp; Voice Isolation</div>
      <NoiseRemovalControl element={element} onSetAttributeQuiet={onSetAttributeQuiet} onSetHtmlAttribute={onSetHtmlAttribute} />

      <div className={`${HEADING} pt-2`}>Loudness</div>
      <FlatSlider label="Amount" value={e.loudness} min={0} max={100}
        tier={e.loudness ? "explicitCustom" : "default"} displayValue={`${e.loudness}%`}
        onCommit={(v) => commit({ loudness: Math.round(v) })} onReset={() => commit({ loudness: 0 })} />

      <div className={`${HEADING} pt-2`}>Hum Removal</div>
      <div className="flex gap-1">
        {([0, 50, 60] as const).map((hz) => (
          <button key={hz} type="button" onClick={() => commit({ hum: hz })}
            className={`flex-1 rounded-md px-2 py-1 text-[11px] ${e.hum === hz ? "bg-[#f5c33b] text-black" : "bg-panel-input text-panel-text-2"}`}>
            {hz ? `${hz} Hz` : "Off"}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => commit(FLAT)} className="pt-1 text-[10px] text-panel-text-4 hover:text-panel-text-1">
        Reset enhancements
      </button>
    </div>
  );
}
