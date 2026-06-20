"""Biomechanical features from keypoints — the vocabulary the feedback rules speak.

Each function takes a single (ideally smoothed) FramePose and returns
interpretable numbers; call them across frames to get per-frame time series.

All features are visibility-gated (see visibility.py): when the landmarks a
feature needs aren't trusted, it returns NaN/None rather than a confident number
computed from a hallucinated limb. Callers must handle the "no data" case —
that's the honest-limits principle, not an inconvenience.

The three implemented features need no depth (per PLAN.md). Hip-to-wall distance
is deferred — it needs a wall-plane assumption or 3D pose.
"""
from __future__ import annotations

import math

import numpy as np

from ml.pose import FramePose, Keypoint

from .visibility import VISIBILITY_MIN, is_trusted

# MediaPipe landmark indices (full map in the link in estimator.py).
NOSE = 0
L_EAR, R_EAR = 7, 8
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28
L_HEEL, R_HEEL = 29, 30
L_FOOT, R_FOOT = 31, 32  # foot_index (toe tip)


def _pt(kp: Keypoint) -> np.ndarray:
    return np.array([kp.x, kp.y], dtype=np.float64)


# Segment-mass model (Winter, "Biomechanics and Motor Control of Human Movement"):
# (mass fraction of whole body, proximal landmark, distal landmark, fraction of
# the way from proximal to distal where the segment's own COM sits).
# Head sits "at" the ear midpoint; trunk COM is modeled at the midpoint between
# the shoulder-center and hip-center. A segment contributes only if BOTH its
# landmarks are trusted this frame; weights are renormalized over what remains.
_SEGMENTS: list[tuple[float, int, int, float]] = [
    (0.081, L_EAR, R_EAR, 0.5),         # head + neck
    (0.028, L_SHOULDER, L_ELBOW, 0.436),  # upper arms
    (0.028, R_SHOULDER, R_ELBOW, 0.436),
    (0.022, L_ELBOW, L_WRIST, 0.530),   # forearm + hand (hand mass pulls COM distal)
    (0.022, R_ELBOW, R_WRIST, 0.530),
    (0.100, L_HIP, L_KNEE, 0.433),      # thighs
    (0.100, R_HIP, R_KNEE, 0.433),
    (0.0465, L_KNEE, L_ANKLE, 0.433),   # shanks
    (0.0465, R_KNEE, R_ANKLE, 0.433),
    (0.0145, L_HEEL, L_FOOT, 0.5),      # feet
    (0.0145, R_HEEL, R_FOOT, 0.5),
]
_TRUNK_MASS = 0.497
_TRUNK_LANDMARKS = (L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)


def center_of_mass(pose: FramePose, min_visibility: float = VISIBILITY_MIN) -> np.ndarray | None:
    """Estimate body COM as an (x, y) point in normalized image coords, or None.

    Anthropometric weighted sum of segment COMs. Returns None when the trunk
    landmarks aren't trusted — the trunk is ~half of body mass, so without it
    any estimate would be meaningless. Missing limb segments are simply dropped
    and the remaining weights renormalized (a hidden arm shifts a real climber's
    COM by ~3%, an acceptable error for v1).
    """
    kps = pose.keypoints
    if not all(is_trusted(kps[i], min_visibility) for i in _TRUNK_LANDMARKS):
        return None

    shoulder_mid = (_pt(kps[L_SHOULDER]) + _pt(kps[R_SHOULDER])) / 2.0
    hip_mid = (_pt(kps[L_HIP]) + _pt(kps[R_HIP])) / 2.0
    weighted = _TRUNK_MASS * (shoulder_mid + hip_mid) / 2.0
    total = _TRUNK_MASS

    for mass, prox, dist, frac in _SEGMENTS:
        if is_trusted(kps[prox], min_visibility) and is_trusted(kps[dist], min_visibility):
            p, d = _pt(kps[prox]), _pt(kps[dist])
            weighted += mass * (p + frac * (d - p))
            total += mass

    return weighted / total


def arm_straightness(pose: FramePose, side: str, min_visibility: float = VISIBILITY_MIN) -> float:
    """Interior elbow angle in degrees for 'left' or 'right' arm (~180 = straight).

    Returns NaN when shoulder/elbow/wrist aren't all trusted (or are degenerate) —
    never a confident angle for a limb the model didn't see. Rules that cite a
    specific arm should pass a stricter min_visibility (e.g. 0.7).
    """
    if side == "left":
        s, e, w = L_SHOULDER, L_ELBOW, L_WRIST
    elif side == "right":
        s, e, w = R_SHOULDER, R_ELBOW, R_WRIST
    else:
        raise ValueError(f"side must be 'left' or 'right', got {side!r}")

    kps = pose.keypoints
    if not all(is_trusted(kps[i], min_visibility) for i in (s, e, w)):
        return math.nan

    u = _pt(kps[s]) - _pt(kps[e])  # elbow -> shoulder
    v = _pt(kps[w]) - _pt(kps[e])  # elbow -> wrist
    nu, nv = np.linalg.norm(u), np.linalg.norm(v)
    if nu < 1e-6 or nv < 1e-6:
        return math.nan
    cos = float(np.clip(np.dot(u, v) / (nu * nv), -1.0, 1.0))
    return math.degrees(math.acos(cos))


def base_of_support(
    pose: FramePose, min_visibility: float = VISIBILITY_MIN
) -> tuple[np.ndarray | None, bool | None]:
    """Return (base_x_span, com_is_over_base).

    In 2D the 'base' is the horizontal span covered by the trusted foot-contact
    landmarks (heels, toes, ankles). `base_x_span` is np.array([x_min, x_max]),
    or None when no foot landmark is trusted. `com_is_over_base` is whether
    COM.x falls inside that span — COM drifting outside it is the geometric
    signature of a barn-door/swing — or None when either the base or the COM
    can't be computed. Callers must treat None as "no claim", not as False.

    Caveat (honest limit): with feet on holds, the loaded foot isn't knowable
    from pose alone — this treats every visible foot landmark as support, so
    it's a proxy, not ground truth. v2 hold detection tightens this.
    """
    kps = pose.keypoints
    foot_xs = [
        kps[i].x
        for i in (L_ANKLE, R_ANKLE, L_HEEL, R_HEEL, L_FOOT, R_FOOT)
        if is_trusted(kps[i], min_visibility)
    ]
    if not foot_xs:
        return None, None

    span = np.array([min(foot_xs), max(foot_xs)], dtype=np.float64)
    com = center_of_mass(pose, min_visibility)
    if com is None:
        return span, None
    return span, bool(span[0] <= com[0] <= span[1])
