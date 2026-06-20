"""Keypoint trust policy: when do we believe a landmark, and when is it fiction?

MediaPipe always outputs all 33 landmarks, even for limbs it never saw — it
extrapolates and signals doubt only via `visibility`. Every feature must gate on
this or it will compute angles on hallucinated limbs.

VISIBILITY_MIN = 0.5 was calibrated on test-1/test-2 (2026-06-12): provably
occluded limbs (test-1 left arm, test-2 right arm) fall almost entirely below
0.5, while the 0.5–0.7 band is dominated by partially-visible legs that ARE
roughly tracked — raising the cutoff would mostly discard footwork. Recalibrate
if camera setups change (see out/_band_composition.py / _visibility_histogram.py).

Two checks, not one: a point can be confidently WRONG — coordinates outside the
image bounds mean MediaPipe is guessing where an off-screen limb went, whatever
its visibility says. Off-screen always overrides visibility.

Individual rules may demand a stricter cutoff for landmarks they make confident
claims about (pass `min_visibility=0.7`); aggregate features like COM use the
default.
"""
from __future__ import annotations

import numpy as np

from ml.pose import FramePose, Keypoint

VISIBILITY_MIN = 0.5


def is_onscreen(kp: Keypoint) -> bool:
    """False when MediaPipe placed the point outside the image — pure extrapolation."""
    return 0.0 <= kp.x <= 1.0 and 0.0 <= kp.y <= 1.0


def is_trusted(kp: Keypoint, min_visibility: float = VISIBILITY_MIN) -> bool:
    """A keypoint we may feed to features: confident enough AND actually in frame."""
    return kp.visibility >= min_visibility and is_onscreen(kp)


def trusted_mask(pose: FramePose, min_visibility: float = VISIBILITY_MIN) -> np.ndarray:
    """(33,) bool array — True where the landmark is usable this frame."""
    return np.array([is_trusted(k, min_visibility) for k in pose.keypoints], dtype=bool)
