"""🔵 YOUR CODE — the coaching rule engine.

Learning milestone #4, and the product. Stubs only — hints, not code.

v1 is deliberately HEURISTIC, not learned: you have no labeled "good technique"
dataset yet, so there's nothing for a model to learn from. Hand-written rules over
the biomechanics features are interpretable, debuggable, and teach you the sport.
Later, a learned classifier replaces this — and the labeled data you collect to
train it is the project's moat (see PLAN.md "Data strategy").

A rule reads the per-frame feature time series and emits FeedbackItems with
timestamps. The skill is in the WINDOWING and THRESHOLDS: one bent-arm frame is
noise; bent arms sustained across a reach is a real fault.

THE REAL TEST (PLAN.md verification #3): a deliberately-bad climb must trip the
right rule with correct timestamps; a clean climb must NOT false-positive.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from ml.pose import FramePose


@dataclass
class FeedbackItem:
    start_s: float
    end_s: float
    code: str          # e.g. "BENT_ARMS", "HESITATION", "BARN_DOOR"
    message: str       # the human-facing coaching tip
    severity: str      # "info" | "suggestion" | "warning"
    confidence: float  # 0..1 — be honest; geometric estimates are not certainties


def analyze(frames: List[FramePose]) -> List[FeedbackItem]:
    """Run the rule set over a smoothed pose sequence and return feedback.

    SUGGESTED FIRST 3 RULES (no depth required):
      - BENT_ARMS:  elbow angle below a threshold sustained over a time window.
      - HESITATION: COM velocity ~zero for longer than N seconds (over-gripping).
      - BARN_DOOR:  COM.x outside the base-of-support span.

    HINTS (not the answer)
      - Compute each feature as a time series first, THEN scan for windows that
        breach a threshold for a minimum duration. Don't emit per-frame items.
      - Make thresholds named constants so they're easy to tune against real clips.
      - Map frame indices back to timestamps via FramePose.timestamp_s.
    """
    raise NotImplementedError(
        "🔵 Your turn: implement the rule engine. Start with ONE rule (BENT_ARMS), "
        "test it on a deliberately-bad clip, then add the next. Ask for hints."
    )
