# Cut Studio noise removal / voice isolation with DeepFilterNet3 on Apple's MLX (GPU).
# usage: cut_denoise.py <input media> <output media> <amount 0..1> <mode: noise|voice>
# Video inputs keep their picture untouched (-c:v copy); only the audio is replaced.
import json, os, subprocess, sys, tempfile
import numpy as np, soundfile as sf

src, dst, amount, mode = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
def progress(p, stage): print(json.dumps({"progress": round(p, 3), "stage": stage}), flush=True)

probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", src]))
has_video = any(s["codec_type"] == "video" for s in probe["streams"])
if not any(s["codec_type"] == "audio" for s in probe["streams"]): sys.exit("This clip has no audio")
tmp = tempfile.mkdtemp(prefix="cut-denoise-")
raw = os.path.join(tmp, "in.wav")
progress(0.02, "Reading audio")
subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-ar", "48000", "-c:a", "pcm_f32le", raw])
x, sr = sf.read(raw, dtype="float32", always_2d=True)

progress(0.05, "Loading DeepFilterNet3 (MLX)")
from mlx_audio.sts.models.deepfilternet import DeepFilterNetModel
model = DeepFilterNetModel.from_pretrained("mlx-community/DeepFilterNet-mlx")

CH, OV = sr * 30, sr // 2                     # 30 s chunks, 0.5 s crossfade
fade = np.linspace(0, 1, OV, dtype=np.float32)
out = np.zeros_like(x)
total = x.shape[1] * max(1, int(np.ceil(len(x) / CH)))
done = 0
for c in range(x.shape[1]):
    y = np.zeros(len(x), np.float32)
    for start in range(0, len(x), CH):
        a, b = max(0, start - OV), min(len(x), start + CH)
        seg = np.asarray(model.enhance_array(x[a:b, c])).reshape(-1)[: b - a]
        if a > 0:
            seg[:OV] *= fade
            y[a:a + OV] *= 1 - fade
            y[a:a + OV] += seg[:OV]
            y[a + OV:b] = seg[OV:]
        else:
            y[a:b] = seg
        done += 1
        progress(0.08 + 0.82 * done / total, "Removing noise" if mode == "noise" else "Isolating voice")
    out[:, c] = y

mix = amount * out + (1 - amount) * x          # FCP-style Amount for both modes
clean = os.path.join(tmp, "clean.wav")
sf.write(clean, mix, sr, subtype="FLOAT")
progress(0.93, "Writing file")
os.makedirs(os.path.dirname(dst), exist_ok=True)
af = ["-af", "highpass=f=70"] if mode == "voice" else []
if has_video:
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", clean, "-map", "0:v:0", "-map", "1:a:0",
                           "-c:v", "copy", *af, "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", dst])
else:
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", clean, *af, "-c:a", "pcm_s24le", dst])
progress(1.0, "Done")
