"""The coaching rule engine — heuristic rules over biomechanics time series.

v1 is deliberately HEURISTIC, not learned: there is no labeled "good technique"
dataset yet, so hand-written rules over interpretable features are the honest
choice. A learned classifier replaces this later — the labeled corpus collected
in the meantime is the project's moat (PLAN.md "Data strategy").

Design principles:
- WINDOWED, not per-frame: one bent-arm frame is noise; bent arms sustained
  across seconds is a fault. Each rule builds a per-frame boolean mask, then
  scans for contiguous breaches lasting a minimum duration (gaps shorter than
  _MERGE_GAP_S are bridged so flickering data doesn't split one event into ten).
- VISIBILITY-HONEST: rules that cite a specific limb demand stricter landmark
  visibility (0.7) than aggregate rules; untrusted frames simply can't trip a
  rule (NaN -> False), and each item's confidence is scaled by how much of its
  window had valid data.
- BARN_DOOR keys on MOTION, not position. Empirically (test-1/test-2,
  2026-06-12) climbers hang with COM outside the horizontal foot span in ~75%
  of frames — that's normal on a wall, not a fault. The fault is the *swing*:
  COM crossing outside the base fast. A static hang outside the base never fires.

Known v1 caveats: HESITATION cannot distinguish over-gripping from deliberate
route-reading or resting (it says so in its message); thresholds below were
eyeballed against two videos and want tuning as clips accrue.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np

from ml.pose import FramePose
from ml.features import arm_straightness, base_of_support, center_of_mass

# --- tunable thresholds (calibrated on test-1/test-2; revisit with new footage) ---
BENT_ARM_MAX_DEG = 100.0     # elbow angle below this = deeply bent
BENT_ARM_MIN_S = 1.0         # ...sustained this long = hanging on bent arms
BENT_ARM_VISIBILITY = 0.7    # stricter gate: this rule cites a specific arm
HESITATION_SPEED = 0.02      # COM speed (normalized units/s) below this = static
HESITATION_MIN_S = 2.0       # ...for this long = hesitation/over-gripping
BARN_DOOR_MARGIN = 0.05      # COM.x must be this far outside the base span
BARN_DOOR_SPEED = 0.15       # ...moving laterally at least this fast (units/s)
BARN_DOOR_MIN_S = 0.25       # swings are brief; don't demand a long window
_MERGE_GAP_S = 0.5           # bridge short mask gaps so one event stays one item


@dataclass
class FeedbackItem:
    start_s: float
    end_s: float
    code: str          # e.g. "BENT_ARMS", "HESITATION", "BARN_DOOR"
    message: str       # the human-facing coaching tip
    severity: str      # "info" | "suggestion" | "warning"
    confidence: float  # 0..1 — be honest; geometric estimates are not certainties


def _windows(mask: np.ndarray, t: np.ndarray, min_duration_s: float) -> list[tuple[int, int]]:
    """Indices (i0, i1) of contiguous True runs lasting >= min_duration_s.

    Runs separated by gaps shorter than _MERGE_GAP_S are merged first.
    """
    runs: list[list[int]] = []
    start = None
    for i, m in enumerate(mask):
        if m and start is None:
            start = i
        elif not m and start is not None:
            runs.append([start, i - 1])
            start = None
    if start is not None:
        runs.append([start, len(mask) - 1])

    merged: list[list[int]] = []
    for run in runs:
        if merged and t[run[0]] - t[merged[-1][1]] < _MERGE_GAP_S:
            merged[-1][1] = run[1]
        else:
            merged.append(run)

    return [(i0, i1) for i0, i1 in merged if t[i1] - t[i0] >= min_duration_s]


def _coverage(valid: np.ndarray, i0: int, i1: int) -> float:
    return float(np.mean(valid[i0 : i1 + 1]))


def _bent_arms(frames: List[FramePose], t: np.ndarray) -> List[FeedbackItem]:
    items: List[FeedbackItem] = []
    for side in ("left", "right"):
        angles = np.array([arm_straightness(f, side, BENT_ARM_VISIBILITY) for f in frames])
        valid = ~np.isnan(angles)
        mask = valid & (angles < BENT_ARM_MAX_DEG)
        for i0, i1 in _windows(mask, t, BENT_ARM_MIN_S):
            items.append(
                FeedbackItem(
                    start_s=float(t[i0]),
                    end_s=float(t[i1]),
                    code="BENT_ARMS",
                    message=(
                        f"Your {side} arm stays deeply bent for {t[i1] - t[i0]:.1f}s here. "
                        "Hanging on a bent arm burns forearm strength fast — try sinking "
                        "onto a straight arm and letting your skeleton take the load."
                    ),
                    severity="suggestion",
                    confidence=0.75 * _coverage(valid, i0, i1),
                )
            )
    return items


def _com_series(frames: List[FramePose]) -> tuple[np.ndarray, np.ndarray]:
    coms = [center_of_mass(f) for f in frames]
    cx = np.array([c[0] if c is not None else np.nan for c in coms])
    cy = np.array([c[1] if c is not None else np.nan for c in coms])
    return cx, cy


def _hesitation(frames: List[FramePose], t: np.ndarray, cx: np.ndarray, cy: np.ndarray) -> List[FeedbackItem]:
    vx, vy = np.gradient(cx, t), np.gradient(cy, t)
    speed = np.hypot(vx, vy)
    valid = ~np.isnan(speed)
    mask = valid & (speed < HESITATION_SPEED)
    items: List[FeedbackItem] = []
    for i0, i1 in _windows(mask, t, HESITATION_MIN_S):
        items.append(
            FeedbackItem(
                start_s=float(t[i0]),
                end_s=float(t[i1]),
                code="HESITATION",
                message=(
                    f"You're stationary for {t[i1] - t[i0]:.1f}s here. If this was a rest, "
                    "great — if you were searching for the next hold, that's time spent "
                    "over-gripping. Try scoping the sequence from the ground."
                ),
                severity="info",
                confidence=0.6 * _coverage(valid, i0, i1),
            )
        )
    return items


def _barn_door(frames: List[FramePose], t: np.ndarray, cx: np.ndarray) -> List[FeedbackItem]:
    spans = [base_of_support(f)[0] for f in frames]
    lo = np.array([s[0] if s is not None else np.nan for s in spans])
    hi = np.array([s[1] if s is not None else np.nan for s in spans])
    vx = np.abs(np.gradient(cx, t))
    valid = ~(np.isnan(cx) | np.isnan(lo) | np.isnan(vx))
    outside = (cx < lo - BARN_DOOR_MARGIN) | (cx > hi + BARN_DOOR_MARGIN)
    mask = valid & outside & (vx > BARN_DOOR_SPEED)
    items: List[FeedbackItem] = []
    for i0, i1 in _windows(mask, t, BARN_DOOR_MIN_S):
        items.append(
            FeedbackItem(
                start_s=float(t[i0]),
                end_s=float(t[i1]),
                code="BARN_DOOR",
                message=(
                    "Your body swings out sideways past your feet here — the classic "
                    "barn-door. Before the move, look for a flag or an inside edge to "
                    "put your weight over a foot and kill the swing."
                ),
                severity="warning",
                confidence=0.6 * _coverage(valid, i0, i1),
            )
        )
    return items


def analyze(frames: List[FramePose]) -> List[FeedbackItem]:
    """Run the rule set over a smoothed pose sequence and return feedback.

    Expects SMOOTHED frames (smoothing.smooth_sequence) in time order — raw
    jitter inflates every velocity-based rule. Returns items sorted by start time.
    """
    if len(frames) < 2:
        return []
    t = np.array([f.timestamp_s for f in frames])
    cx, cy = _com_series(frames)
    items = _bent_arms(frames, t) + _hesitation(frames, t, cx, cy) + _barn_door(frames, t, cx)
    return sorted(items, key=lambda i: i.start_s)
