# Cut Studio scene detection: PySceneDetect's AdaptiveDetector (robust to camera pans) on a downscaled decode.
# usage: cut_scenes.py <media> [sensitivity 0..100]  → JSON {"cuts":[seconds…], "duration": s}
import json, sys
from scenedetect import open_video, SceneManager, AdaptiveDetector

path = sys.argv[1]
sens = float(sys.argv[2]) if len(sys.argv) > 2 else 50
video = open_video(path)
sm = SceneManager()
sm.auto_downscale = True
# higher sensitivity → lower threshold → more cuts (3.0 is the library default)
sm.add_detector(AdaptiveDetector(adaptive_threshold=5.0 - 4.0 * sens / 100, min_scene_len=int(video.frame_rate * 0.4)))
sm.detect_scenes(video)
scenes = sm.get_scene_list()
print(json.dumps({"cuts": [round(s[0].get_seconds(), 4) for s in scenes[1:]], "duration": round(video.duration.get_seconds(), 4)}))
