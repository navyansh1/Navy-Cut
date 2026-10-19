const RENDER_SETTINGS_KEY = "hf-studio-render-settings";

export interface PersistedRenderSettings {
  format: "mp4" | "webm" | "mov" | "audio-m4a" | "audio-wav";
  quality: "draft" | "standard" | "high";
  fps: number;
  gpu: boolean;
}

export function getPersistedRenderSettings(): PersistedRenderSettings {
  try {
    const raw = localStorage.getItem(RENDER_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        format: ["mp4", "webm", "mov", "audio-m4a", "audio-wav"].includes(parsed.format) ? parsed.format : "mp4",
        quality: ["draft", "standard", "high"].includes(parsed.quality)
          ? parsed.quality
          : "standard",
        fps: [24, 25, 30, 50, 60].includes(parsed.fps) ? parsed.fps : 30,
        // Cut Studio: Apple silicon hardware encoding (VideoToolbox) unless turned off.
        gpu: parsed.gpu !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return { format: "mp4", quality: "standard", fps: 30, gpu: true };
}

export function persistRenderSettings(
  format: PersistedRenderSettings["format"],
  quality: PersistedRenderSettings["quality"],
  fps: PersistedRenderSettings["fps"],
  gpu: boolean = getPersistedRenderSettings().gpu,
): void {
  try {
    localStorage.setItem(RENDER_SETTINGS_KEY, JSON.stringify({ format, quality, fps, gpu }));
  } catch {
    /* ignore */
  }
}
