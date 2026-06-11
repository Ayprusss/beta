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


class MediaPipePoseEstimator:
    """Default v1 estimator. Lazy-imports mediapipe so the package imports cheaply."""

    def __init__(self, model_complexity: int = 1, min_detection_confidence: float = 0.5) -> None:
        import mediapipe as mp  # lazy import

        self._mp = mp
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=model_complexity,
            min_detection_confidence=min_detection_confidence,
        )

    def estimate(self, frame_bgr: np.ndarray, frame_index: int, timestamp_s: float) -> FramePose | None:
        import cv2

        result = self._pose.process(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        if not result.pose_landmarks:
            return None
        kps = [Keypoint(lm.x, lm.y, lm.z, lm.visibility) for lm in result.pose_landmarks.landmark]
        return FramePose(frame_index=frame_index, timestamp_s=timestamp_s, keypoints=kps)

    def close(self) -> None:
        self._pose.close()
