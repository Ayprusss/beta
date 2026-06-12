"""🟢 OFF-THE-SHELF — pose estimation wiring.

This is glue around a pretrained model, not something to reinvent. The one thing
that matters architecturally: everything downstream depends ONLY on the
`PoseEstimator` interface and the `FramePose` data shape below — never on
MediaPipe directly. That keeps the model swappable (MediaPipe -> RTMPose -> 3D
lift) without touching your feature/feedback code.

MediaPipe landmark indices (the 33-point topology) are documented here:
https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Protocol

import numpy as np


@dataclass(frozen=True)
class Keypoint:
    """One landmark in normalized image coords (x, y in [0,1]); z is rough/relative."""
    x: float
    y: float
    z: float
    visibility: float


@dataclass
class FramePose:
    """All landmarks for a single frame, plus where it sits in time."""
    frame_index: int
    timestamp_s: float
    keypoints: List[Keypoint]  # length == model's landmark count (33 for MediaPipe)

    def as_array(self) -> np.ndarray:
        """(N, 4) float array of [x, y, z, visibility] — the form feature code consumes."""
        return np.array([[k.x, k.y, k.z, k.visibility] for k in self.keypoints], dtype=np.float32)


class PoseEstimator(Protocol):
    """The stable contract. Downstream code depends on THIS, not on any model."""

    def estimate(self, frame_bgr: np.ndarray, frame_index: int, timestamp_s: float) -> FramePose | None:
        """Return a FramePose for the frame, or None if no person was detected."""
        ...


# MediaPipe >=0.10.2x removed the legacy `mp.solutions` API; pose now lives in the
# Tasks API (PoseLandmarker), which loads its model from a downloadable .task bundle.
_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    "pose_landmarker_{name}/float16/latest/pose_landmarker_{name}.task"
)
_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")


def _ensure_model(name: str) -> str:
    """Download the .task bundle to models/ (gitignored) on first use; return its path."""
    path = os.path.join(_MODELS_DIR, f"pose_landmarker_{name}.task")
    if not os.path.exists(path):
        import urllib.request

        os.makedirs(_MODELS_DIR, exist_ok=True)
        url = _MODEL_URL.format(name=name)
        print(f"Downloading pose model '{name}' -> {path}")
        urllib.request.urlretrieve(url, path)
    return path


class MediaPipePoseEstimator:
    """Default v1 estimator. Lazy-imports mediapipe so the package imports cheaply.

    `model` is one of "lite" / "full" / "heavy" (accuracy vs. speed; "full" is the
    middle ground, roughly the old model_complexity=1).
    """

    def __init__(self, model: str = "full", min_detection_confidence: float = 0.5) -> None:
        import mediapipe as mp  # lazy import
        from mediapipe.tasks.python import BaseOptions
        from mediapipe.tasks.python.vision import PoseLandmarker, PoseLandmarkerOptions, RunningMode

        self._mp = mp
        self._landmarker = PoseLandmarker.create_from_options(
            PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=_ensure_model(model)),
                running_mode=RunningMode.VIDEO,
                min_pose_detection_confidence=min_detection_confidence,
            )
        )
        self._last_ts_ms = -1  # VIDEO mode requires strictly increasing timestamps

    def estimate(self, frame_bgr: np.ndarray, frame_index: int, timestamp_s: float) -> FramePose | None:
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        ts_ms = max(int(round(timestamp_s * 1000)), self._last_ts_ms + 1)
        self._last_ts_ms = ts_ms

        result = self._landmarker.detect_for_video(
            self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb), ts_ms
        )
        if not result.pose_landmarks:
            return None
        # one landmark list per detected person; we take the most prominent (index 0)
        kps = [Keypoint(lm.x, lm.y, lm.z, lm.visibility) for lm in result.pose_landmarks[0]]
        return FramePose(frame_index=frame_index, timestamp_s=timestamp_s, keypoints=kps)

    def close(self) -> None:
        self._landmarker.close()
