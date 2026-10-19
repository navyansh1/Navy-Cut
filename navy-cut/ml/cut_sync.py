# Cut Studio multicam sync: lines angles up by their sound (like FCP's "Use audio for synchronization").
# usage: cut_sync.py <ref media> <other media>...   → JSON {"offsets":[0, o1, ...], "confidence":[...], "durations":[...]}
# offset k = time on the reference clock at which angle k's first frame happens.
import json, subprocess, sys
import numpy as np

RATE = 8000          # analysis sample rate
ENV = 100            # envelope rate (Hz) for the coarse pass
MAX_S = 900          # analyse at most 15 min per angle

def dur(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip() or 0)

def audio(path):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-t", str(MAX_S), "-i", path, "-vn", "-ac", "1",
                                   "-ar", str(RATE), "-f", "f32le", "-"])
    return np.frombuffer(raw, np.float32)

def envelope(x):
    hop = RATE // ENV
    n = len(x) // hop
    e = np.abs(x[: n * hop]).reshape(n, hop).mean(1)
    e = np.log1p(e * 50)                       # loudness-ish, robust to gain differences
    e = e - np.convolve(e, np.ones(ENV) / ENV, "same")   # remove slow level drift
    return (e - e.mean()) / (e.std() + 1e-9)

def xcorr(a, b):
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    c = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    return np.concatenate([c[-(len(b) - 1):], c[: len(a)]])   # lags from -(len(b)-1) .. len(a)-1

paths = sys.argv[1:]
sig = [audio(p) for p in paths]
env = [envelope(s) for s in sig]
offsets, conf = [0.0], [1.0]
for k in range(1, len(paths)):
    c = xcorr(env[0], env[k])
    i = int(np.argmax(c)); lag = i - (len(env[k]) - 1)
    peak = c[i]; rest = np.delete(c, slice(max(0, i - 50), i + 50))
    confidence = float((peak - rest.mean()) / (rest.std() + 1e-9))
    # fine pass on raw audio around the coarse lag (±20 ms)
    coarse = lag / ENV
    a0 = max(0, int((coarse + 5) * RATE)); seg = 20 * RATE
    a = sig[0][a0: a0 + seg]; b0 = a0 - int(coarse * RATE)
    best = coarse
    if 0 <= b0 and b0 + seg <= len(sig[k]) and len(a) == seg:
        w = int(0.02 * RATE)
        b = sig[k][max(0, b0 - w): b0 + seg + w]
        cc = np.correlate(b, a, "valid")
        best = coarse - (int(np.argmax(cc)) - min(w, b0)) / RATE
    offsets.append(round(best, 4)); conf.append(round(confidence, 1))
print(json.dumps({"offsets": offsets, "confidence": conf, "durations": [round(dur(p), 4) for p in paths]}))
