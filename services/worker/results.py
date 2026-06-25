"""Build the web app's ClimbResults payload from a smoothed pose sequence.

Pure functions — no disk, no queue — so the mapping is unit-testable. The shape
mirrors apps/web/src/lib/types.ts exactly (camelCase, 13-joint skeleton, c for
confidence). Stats are HEURISTIC summaries and labeled as such in the UI; the
`estimated: true` flag on every feedback item is the PLAN.md honesty rule.
"""
from __future__ import annotations

from typing import List

import numpy as np

from ml.features import arm_straightness, center_of_mass
from ml.feedback import FeedbackItem, analyze
from ml.feedback.rules import (
    BENT_ARM_MAX_DEG,
    HESITATION_SPEED,
    _windows,  # shared run-detection; promote to public if a third user appears
)
from ml.pose import FramePose

# types.ts JOINTS order -> MediaPipe landmark indices
# head, l/r shoulder, l/r elbow, l/r wrist, l/r hip, l/r knee, l/r ankle
JOINT_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

SEVERITY_MAP = {"warning": "major", "suggestion": "warn", "info": "info"}
RULE_TITLES = {
    "BENT_ARMS": "Bent-arm hanging",
    "HESITATION": "Long pause",
    "BARN_DOOR": "Barn-door swing",
    "DYNO": "Dynamic move",
}

MOVE_SPEED = 0.06   # COM speed (units/s) above this = executing a move
                    # (calibrated on test-1/test-2: COM glides ~4x slower than wrists)
MOVE_MIN_S = 0.2    # ...sustained at least this long counts as one move


def _com_speed(frames: List[FramePose], t: np.ndarray) -> np.ndarray:
    coms = [center_of_mass(f) for f in frames]
    cx = np.array([c[0] if c is not None else np.nan for c in coms])
    cy = np.array([c[1] if c is not None else np.nan for c in coms])
    return np.hypot(np.gradient(cx, t), np.gradient(cy, t))


def _stats(frames: List[FramePose], t: np.ndarray) -> dict:
    speed = _com_speed(frames, t)
    valid_speed = ~np.isnan(speed)
    dt = np.gradient(t)

    moves = len(_windows(valid_speed & (speed > MOVE_SPEED), t, MOVE_MIN_S))
    pause_sec = float(np.sum(dt[valid_speed & (speed < HESITATION_SPEED)]))

    left = np.array([arm_straightness(f, "left") for f in frames])
    right = np.array([arm_straightness(f, "right") for f in frames])
    best = np.fmin(left, right)  # fmin ignores NaN unless both are NaN
    valid_arm = ~np.isnan(best)
    bent_pct = float(100 * np.mean(best[valid_arm] < BENT_ARM_MAX_DEG)) if valid_arm.any() else 0.0

    total = float(t[-1] - t[0]) if len(t) > 1 else 0.0
    fluidity = 100.0 * (1.0 - pause_sec / total) if total > 0 else 0.0

    return {
        "moves": int(moves),
        "pauseSec": round(pause_sec, 1),
        "bentArmPct": round(bent_pct, 1),
        "fluidity": round(float(np.clip(fluidity, 0.0, 100.0)), 1),
    }


def _map_feedback(items: List[FeedbackItem]) -> list[dict]:
    return [
        {
            "id": f"{it.code.lower()}-{i}",
            "rule": it.code.lower(),
            "title": RULE_TITLES.get(it.code, it.code.title()),
            "detail": it.message,
            "severity": SEVERITY_MAP.get(it.severity, "info"),
            "startSec": round(it.start_s, 2),
            "endSec": round(it.end_s, 2),
            "estimated": True,  # geometric estimation from one camera, never measurement
            "kind": it.kind,    # "move" | "fault" — lets the UI distinguish recognised moves
        }
        for i, it in enumerate(items)
    ]


def build_results(climb_id: str, smoothed: List[FramePose], model_version: str) -> dict:
    """Assemble the full ClimbResults dict from a SMOOTHED pose sequence."""
    t = np.array([f.timestamp_s for f in smoothed])
    frames_out = [
        {
            "t": round(f.timestamp_s, 3),
            "pts": [
                {
                    "x": round(f.keypoints[j].x, 4),
                    "y": round(f.keypoints[j].y, 4),
                    "c": round(float(np.clip(f.keypoints[j].visibility, 0.0, 1.0)), 3),
                }
                for j in JOINT_INDICES
            ],
        }
        for f in smoothed
    ]
    fps = (len(t) - 1) / (t[-1] - t[0]) if len(t) > 1 and t[-1] > t[0] else 0.0
    return {
        "climbId": climb_id,
        "fps": round(float(fps), 2),
        "frames": frames_out,
        "feedback": _map_feedback(analyze(smoothed)),
        "stats": _stats(smoothed, t) if len(t) > 1 else {"moves": 0, "pauseSec": 0, "bentArmPct": 0, "fluidity": 0},
        "modelVersion": model_version,
    }
