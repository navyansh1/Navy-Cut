// Cut Studio: Final Cut's Audio Enhancements (Equalization with Bass/Treble, Loudness, Hum Removal)
// as managed nodes in the clip's audio FX chain. Every node this owns has an id starting "cut-",
// so the panel can read its own state back and rewrite it without touching hand-added effects.
import type { HfAudioFxChain, HfAudioFxNode } from "@hyperframes/core/audio-fx";

export interface AudioEnhancements {
  bass: number; // dB, low shelf at 120 Hz
  treble: number; // dB, high shelf at 8 kHz
  presence: number; // dB, peaking at 3 kHz (voice clarity)
  loudness: number; // 0–100, compression amount
  hum: 0 | 50 | 60; // mains hum notch
  lowCut: boolean; // 80 Hz rumble filter
}

export const FLAT: AudioEnhancements = { bass: 0, treble: 0, presence: 0, loudness: 0, hum: 0, lowCut: false };

/** FCP's Equalization menu, as starting points for the sliders. */
export const EQ_PRESETS: ReadonlyArray<{ id: string; label: string; set: Partial<AudioEnhancements> }> = [
  { id: "flat", label: "Flat", set: { bass: 0, treble: 0, presence: 0, lowCut: false } },
  { id: "voice", label: "Voice Enhance", set: { bass: -2, treble: 2, presence: 3, lowCut: true } },
  { id: "music", label: "Music Enhance", set: { bass: 3, treble: 2, presence: 0, lowCut: false } },
  { id: "bass-boost", label: "Bass Boost", set: { bass: 6 } },
  { id: "bass-reduce", label: "Bass Reduce", set: { bass: -6 } },
  { id: "treble-boost", label: "Treble Boost", set: { treble: 6 } },
  { id: "treble-reduce", label: "Treble Reduce", set: { treble: -6 } },
];

const isOurs = (n: HfAudioFxNode) => (n.id ?? "").startsWith("cut-");
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function readEnhancements(chain: HfAudioFxChain): AudioEnhancements {
  const by = new Map(chain.nodes.filter(isOurs).map((n) => [n.id!, n]));
  const hum = by.get("cut-hum-1");
  const comp = by.get("cut-loud");
  return {
    bass: num(by.get("cut-bass")?.params?.gain),
    treble: num(by.get("cut-treble")?.params?.gain),
    presence: num(by.get("cut-presence")?.params?.gain),
    loudness: comp ? Math.round(((-num(comp.params?.threshold, -6) - 6) / 24) * 100) : 0,
    hum: hum ? (num(hum.params?.frequency) > 55 ? 60 : 50) : 0,
    lowCut: by.has("cut-lowcut"),
  };
}

export function writeEnhancements(chain: HfAudioFxChain, e: AudioEnhancements): HfAudioFxChain {
  const ours: HfAudioFxNode[] = [];
  if (e.lowCut) ours.push({ type: "highpass", id: "cut-lowcut", label: "Low cut", params: { frequency: 80 } });
  if (e.hum) {
    for (let k = 1; k <= 3; k++)
      ours.push({
        type: "peaking",
        id: `cut-hum-${k}`,
        label: `Hum ${e.hum * k} Hz`,
        params: { frequency: e.hum * k, gain: -30, q: 30 },
      });
  }
  if (e.bass) ours.push({ type: "lowshelf", id: "cut-bass", label: "Bass", params: { frequency: 120, gain: e.bass } });
  if (e.presence)
    ours.push({ type: "peaking", id: "cut-presence", label: "Presence", params: { frequency: 3000, gain: e.presence, q: 0.9 } });
  if (e.treble) ours.push({ type: "highshelf", id: "cut-treble", label: "Treble", params: { frequency: 8000, gain: e.treble } });
  if (e.loudness > 0) {
    const a = e.loudness / 100;
    ours.push({
      type: "compressor",
      id: "cut-loud",
      label: "Loudness",
      params: { threshold: -6 - 24 * a, ratio: 1.5 + 4.5 * a, attack: 10, release: 150, knee: 6, makeup: 10 * a, mix: 1 },
    });
  }
  // Enhancements run first, then whatever the user added by hand.
  return { ...chain, nodes: [...ours, ...chain.nodes.filter((n) => !isOurs(n))] };
}
