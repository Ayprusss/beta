"""🟢 OFF-THE-SHELF — frame extraction.

Yields frames at a target sample rate and hands back the timestamp for each, so
everything downstream can map a frame index back to a moment in the video (needed
for timestamped feedback).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import numpy as np


@dataclass
class FrameRead:
    frame_index: int      # index in the SAMPLED stream (0,1,2,...), not the source frame number
    timestamp_s: float    # position in the source video, in seconds
    image_bgr: np.ndarray


def iter_frames(video_path: str, target_fps: float = 15.0) -> Iterator[FrameRead]:
    """Decode `video_path`, downsampling to ~target_fps. Yields FrameRead objects.

    Downsampling matters: pose at 30fps on a 30s clip is ~900 inferences; 15fps
    halves cost with no real loss for technique analysis.
    """
    import cv2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    stride = max(1, round(src_fps / target_fps))

    src_idx = 0
    out_idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if src_idx % stride == 0:
                yield FrameRead(
                    frame_index=out_idx,
                    timestamp_s=src_idx / src_fps,
                    image_bgr=frame,
                )
                out_idx += 1
            src_idx += 1
    finally:
        cap.release()
