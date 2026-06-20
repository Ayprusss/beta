"""Temporal smoothing of keypoints — One-Euro filter (Casiez et al., CHI 2012).

WHY: raw per-frame pose jitters. A plain moving average kills jitter but adds
LAG — the skeleton trails the climber. The One-Euro filter adapts: when a joint
moves slowly it smooths hard (jitter dies), when it moves fast it barely smooths
(no lag on real motion). The `beta` knob sets how aggressively cutoff rises with
speed; `min_cutoff` sets the smoothing floor at rest.

Visibility interaction (policy decided 2026-06-12, updated 2026-06-13):
- TRUSTED keypoints: smoothed normally; last good position recorded.
- UNTRUSTED keypoints (occluded / off-screen): filter state RESETS (prevents
  garbage accumulating), but the OUTPUT is the last trusted position rather than
  the raw MediaPipe hallucination. MediaPipe extrapolates off-screen landmarks to
  nonsensical coordinates; passing those raw caused visible skeleton snapping.
  The current frame's visibility score is preserved so the renderer can fade the
  joint to signal low confidence. If no trusted position exists yet, the raw
  value is used as a safe fallback.

Reference: https://gery.casiez.net/1euro/
"""
from __future__ import annotations

import math
from dataclasses import replace
from typing import List

from ml.pose import FramePose, Keypoint

from .visibility import VISIBILITY_MIN, is_trusted


def _alpha(cutoff_hz: float, dt: float) -> float:
    """Exponential-smoothing factor for a given cutoff frequency and timestep."""
    tau = 1.0 / (2.0 * math.pi * cutoff_hz)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    """Scalar One-Euro filter. One instance per smoothed signal (landmark axis)."""

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.0, d_cutoff: float = 1.0) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x_prev: float | None = None
        self._dx_prev = 0.0
        self._t_prev = 0.0

    def reset(self) -> None:
        self._x_prev = None

    def __call__(self, t: float, x: float) -> float:
        if self._x_prev is None:
            self._x_prev, self._dx_prev, self._t_prev = x, 0.0, t
            return x

        dt = t - self._t_prev
        if dt <= 0.0:  # duplicate/clock-skewed timestamp; don't divide by zero
            return self._x_prev
        self._t_prev = t

        # smoothed derivative -> speed-adaptive cutoff -> smoothed value
        dx = (x - self._x_prev) / dt
        a_d = _alpha(self.d_cutoff, dt)
        self._dx_prev = a_d * dx + (1.0 - a_d) * self._dx_prev

        cutoff = self.min_cutoff + self.beta * abs(self._dx_prev)
        a = _alpha(cutoff, dt)
        self._x_prev = a * x + (1.0 - a) * self._x_prev
        return self._x_prev


def smooth_sequence(
    frames: List[FramePose],
    min_cutoff: float = 1.0,
    beta: float = 0.0,
    min_visibility: float = VISIBILITY_MIN,
) -> List[FramePose]:
    """Return a new list of FramePose with x,y smoothed across time.

    Inputs are in time order. Does not mutate the input; z and visibility are
    passed through untouched. Untrusted keypoints (below `min_visibility` or
    off-screen) pass through raw and reset their landmark's filter state.
    """
    if not frames:
        return []

    n_landmarks = len(frames[0].keypoints)
    filters = [
        (OneEuroFilter(min_cutoff, beta), OneEuroFilter(min_cutoff, beta))
        for _ in range(n_landmarks)
    ]
    # last smoothed keypoint per landmark — used to hold position when a
    # landmark becomes untrusted so we output a stable frozen position
    # rather than MediaPipe's raw (often nonsensical) extrapolation
    last_good: list[Keypoint | None] = [None] * n_landmarks

    out: List[FramePose] = []
    for frame in frames:
        new_kps: List[Keypoint] = []
        t = frame.timestamp_s
        for i, kp in enumerate(frame.keypoints):
            fx, fy = filters[i]
            if not is_trusted(kp, min_visibility):
                fx.reset()
                fy.reset()
                if last_good[i] is not None:
                    # freeze at last good position; keep current visibility so
                    # the renderer can fade the joint to signal low confidence
                    new_kps.append(replace(last_good[i], visibility=kp.visibility))
                else:
                    new_kps.append(kp)  # no history yet, must use raw
                continue
            smoothed = replace(kp, x=fx(t, kp.x), y=fy(t, kp.y))
            last_good[i] = smoothed
            new_kps.append(smoothed)
        out.append(FramePose(frame_index=frame.frame_index, timestamp_s=t, keypoints=new_kps))
    return out
