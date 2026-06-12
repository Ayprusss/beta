"""🟢 OFF-THE-SHELF — load cached keypoints back into FramePose objects.

The other half of the two-stage design: `01_run_pose.py` writes the perception
cache; this reads it back so feature/feedback code can iterate WITHOUT touching
the video or re-running pose.
"""
from __future__ import annotations

import json
from typing import List

from ml.pose import FramePose, Keypoint


def load_keypoints(path: str) -> List[FramePose]:
    """Read an out/*.keypoints.json file into the List[FramePose] features consume."""
    with open(path) as f:
        data = json.load(f)
    return [
        FramePose(
            frame_index=fr["frame_index"],
            timestamp_s=fr["timestamp_s"],
            keypoints=[Keypoint(k["x"], k["y"], k["z"], k["v"]) for k in fr["keypoints"]],
        )
        for fr in data["frames"]
    ]
