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

Position-delta gate (added 2026-06-25, fixes the dyno skeleton jump):
- Visibility alone is not enough. During a fast dyno MediaPipe can report
  visibility >= VISIBILITY_MIN on coordinates that are flat wrong (motion blur,
  model confusion). Those pass is_trusted(), and because the filter runs at
  beta=1.0 to let real fast motion through uncorrected, the One-Euro filter does
  nothing to stop a single-frame teleport — the skeleton snaps. So a trusted
  landmark whose x or y jumps more than MAX_JUMP from its last trusted (raw)
  position in one frame is treated like an untrusted one: held at last good,
  filter reset, visibility halved so the renderer fades it. The anchor is the raw
  observation, not the smoothed output, so the filter's lag on genuine fast
  motion is never mistaken for a teleport. See MAX_JUMP for calibration.

Reference: https://gery.casiez.net/1euro/
"""
from __future__ import annotations

import math
from dataclasses import replace
from typing import List

from ml.pose import FramePose, Keypoint

from .visibility import VISIBILITY_MIN, is_trusted

# Max plausible per-frame jump of a single landmark, normalized image units.
# Calibrated on test-1 (climb-6a2cc02e-4f4bd4, ~15fps) over wrists + hips from the
# RAW inter-frame deltas between consecutive trusted observations: real motion
# (incl. the dyno) stays under ~0.08/frame and has essentially died out by 0.12,
# while a sparse teleport tail runs 0.13–0.56 (the top ~0.8% of trusted
# transitions). 0.12 sits in that gap — it gates the teleports without clipping
# genuine fast-but-continuous motion, whose raw anchor advances every frame and so
# is never penalized for cumulative travel.
MAX_JUMP = 0.12


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

    Inputs are in time order. Does not mutate the input; z is passed through
    untouched. A landmark is held at its last good position (and its filter
    reset) on any frame where it is either untrusted (below `min_visibility` or
    off-screen) or jumps more than MAX_JUMP from its last trusted raw position;
    such held frames carry a reduced visibility so the renderer can fade the
    joint. See the module docstring for the full visibility/position-delta policy.
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
    # previous trusted RAW keypoint per landmark — the anchor for the
    # position-delta gate. Raw (not smoothed) so the filter's lag on genuine fast
    # motion isn't mistaken for a teleport, and advanced on EVERY trusted frame
    # (gated or not) so the gate measures a single-frame spike: sustained fast
    # motion takes small per-frame steps and never trips it, while a one-frame
    # excursion self-corrects on the next frame instead of freezing the anchor.
    # Reset to None across an untrusted gap (the landmark may have legitimately
    # moved while occluded), exactly like the filter state.
    last_raw: list[Keypoint | None] = [None] * n_landmarks

    out: List[FramePose] = []
    for frame in frames:
        new_kps: List[Keypoint] = []
        t = frame.timestamp_s
        for i, kp in enumerate(frame.keypoints):
            fx, fy = filters[i]
            if not is_trusted(kp, min_visibility):
                fx.reset()
                fy.reset()
                last_raw[i] = None  # reset the spike anchor across the gap
                if last_good[i] is not None:
                    # freeze at last good position; keep current visibility so
                    # the renderer can fade the joint to signal low confidence
                    new_kps.append(replace(last_good[i], visibility=kp.visibility))
                else:
                    new_kps.append(kp)  # no history yet, must use raw
                continue
            prev_raw = last_raw[i]
            last_raw[i] = kp  # advance the spike anchor every trusted frame
            if (
                prev_raw is not None
                and last_good[i] is not None
                and (abs(kp.x - prev_raw.x) > MAX_JUMP or abs(kp.y - prev_raw.y) > MAX_JUMP)
            ):
                # Trusted by visibility but teleported from the previous frame —
                # physically impossible in one frame (motion blur / model
                # confusion). Treat like an untrusted point: hold last good,
                # reset the filter, and halve visibility so the renderer fades
                # the joint to signal the (otherwise silent) low confidence.
                fx.reset()
                fy.reset()
                new_kps.append(replace(last_good[i], visibility=kp.visibility * 0.5))
                continue
            smoothed = replace(kp, x=fx(t, kp.x), y=fy(t, kp.y))
            last_good[i] = smoothed
            new_kps.append(smoothed)
        out.append(FramePose(frame_index=frame.frame_index, timestamp_s=t, keypoints=new_kps))
    return out
