"""🔵 YOUR CODE — biomechanical features from keypoints.

Learning milestone #3, and the heart of v1. Stubs only — ask for hints, not code.

These features are the vocabulary your feedback rules will speak in. Get the
features right and good coaching falls out; get them wrong and no rule can save you.

Each function takes a single smoothed FramePose (one frame) and returns interpretable
numbers. You'll call them across all frames to get per-frame time series.

START WITH THE THREE THAT NEED NO DEPTH (per PLAN.md): arm straightness,
base-of-support / COM-over-base, and (in feedback) hesitation from COM velocity.
Save hip-to-wall for later — it needs a wall-plane assumption or 3D pose.
"""
from __future__ import annotations

import numpy as np

from ml.pose import FramePose

# MediaPipe landmark indices you'll need (full map in the link in estimator.py).
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28


def center_of_mass(pose: FramePose) -> np.ndarray:
    """Estimate the body COM as an (x, y) point in normalized image coords.

    HINT: a real COM uses anthropometric segment-mass fractions (trunk ~0.5 of body
    mass, each thigh ~0.1, etc.) applied to each segment's midpoint. A crude v0 can
    average the hip and shoulder midpoints — start crude, refine later.
    """
    raise NotImplementedError("🔵 Your turn — see docstring. Ask for a hint if stuck.")


def arm_straightness(pose: FramePose, side: str) -> float:
    """Interior elbow angle in degrees for 'left' or 'right' arm (~180 = straight).

    HINT: angle at the elbow = angle between vectors (shoulder->elbow) and
    (wrist->elbow). np.arctan2 or a dot-product/arccos both work. Decide how you'll
    handle low-visibility landmarks before you trust the number.
    """
    raise NotImplementedError("🔵 Your turn — see docstring. Ask for a hint if stuck.")


def base_of_support(pose: FramePose) -> tuple[np.ndarray, bool]:
    """Return (support_polygon_or_segment, com_is_over_base).

    HINT: in 2D, the 'base' is roughly the horizontal span between the loaded feet.
    'COM over base' ≈ is COM.x within that span? When COM drifts outside it, that's
    the geometric signature of a barn-door / swing — gold for feedback.
    """
    raise NotImplementedError("🔵 Your turn — see docstring. Ask for a hint if stuck.")
