"""🟢 Learning milestone #1 — run pose on a real video and see the data.

This is your first end-to-end signal: video in -> keypoints out. No web stack,
no features, no rules yet. Just prove the perception layer works and LOOK at the
shape of what pose gives you (that intuition drives every feature you'll build).

Usage:
    python notebooks/01_run_pose.py path/to/climb.mp4

It prints per-frame detection stats and dumps keypoints to out/keypoints.json so
later stages can consume them WITHOUT re-running pose (the two-stage design from
CLAUDE.md: perception is expensive -> cache it).
"""
from __future__ import annotations

import json
import os
import sys

# allow running as a plain script from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.io import iter_frames          # noqa: E402
from ml.pose import MediaPipePoseEstimator  # noqa: E402


def main(video_path: str) -> None:
    estimator = MediaPipePoseEstimator()
    frames_out = []
    detected = 0
    total = 0

    for fr in iter_frames(video_path, target_fps=15.0):
        total += 1
        pose = estimator.estimate(fr.image_bgr, fr.frame_index, fr.timestamp_s)
        if pose is None:
            continue
        detected += 1
        frames_out.append(
            {
                "frame_index": pose.frame_index,
                "timestamp_s": round(pose.timestamp_s, 3),
                "keypoints": [
                    {"x": k.x, "y": k.y, "z": k.z, "v": k.visibility} for k in pose.keypoints
                ],
            }
        )

    estimator.close()
    os.makedirs("out", exist_ok=True)
    with open("out/keypoints.json", "w") as f:
        json.dump({"video": video_path, "frames": frames_out}, f)

    rate = (detected / total * 100) if total else 0.0
    print(f"Sampled frames: {total} | pose detected: {detected} ({rate:.0f}%)")
    print(f"Landmarks per frame: {len(frames_out[0]['keypoints']) if frames_out else 0}")
    print("Wrote out/keypoints.json  <-- next stages read THIS, not the video.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python notebooks/01_run_pose.py path/to/climb.mp4")
        raise SystemExit(2)
    main(sys.argv[1])
