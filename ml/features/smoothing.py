"""🔵 YOUR CODE — temporal smoothing of keypoints.

This is learning milestone #2. It is intentionally a stub. Don't ask Claude to
fill it in — ask for hints. (See CLAUDE.md "handoff" rules.)

WHY THIS EXISTS
  Raw per-frame pose jitters frame-to-frame. If you naively average over a window
  to smooth it, you add LAG — the skeleton trails the climber. The One-Euro filter
  is the classic fix: it smooths hard when the joint is slow, and barely smooths
  when the joint is moving fast, so you kill jitter without lagging real motion.

WHAT TO BUILD
  A One-Euro filter that you apply per coordinate, per landmark, across the frame
  sequence. Each (landmark, axis) needs its OWN filter state carried across frames.

REFERENCE
  Casiez et al., "1€ Filter: A Simple Speed-based Low-pass Filter" (CHI 2012).
  https://gery.casiez.net/1euro/   (there's a ~30-line reference implementation)

HINTS (not the answer)
  - A single 1€ filter tracks: previous value, previous derivative, and dt.
  - Two tunables: `min_cutoff` (more = less smoothing baseline) and `beta`
    (more = follows fast motion more aggressively).
  - You need one filter instance per (landmark_index, axis) — 33 * 2 = 66 of them.
  - Start by smoothing only x,y; leave visibility/z alone.
"""
from __future__ import annotations

from typing import List

from ml.pose import FramePose


def smooth_sequence(frames: List[FramePose], min_cutoff: float = 1.0, beta: float = 0.0) -> List[FramePose]:
    """Return a new list of FramePose with x,y smoothed across time.

    Inputs are in time order. Don't mutate the input; return new FramePose objects.
    """
    raise NotImplementedError(
        "🔵 Your turn: implement the One-Euro filter. Read the docstring, then ask "
        "Claude for a hint if you're stuck — not for the implementation."
    )
