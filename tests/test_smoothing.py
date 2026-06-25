"""Unit tests for One-Euro smoothing + visibility gating. Fast, no video required."""
import math
import random

import pytest

from ml.pose import FramePose, Keypoint
from ml.features import smooth_sequence, is_trusted, VISIBILITY_MIN, MAX_JUMP


FPS = 15.0


def _frames_from_xy(xs, ys, vis=None):
    """Build single-relevant-landmark frames; landmark 0 carries the signal."""
    n = len(xs)
    vis = vis if vis is not None else [1.0] * n
    frames = []
    for i in range(n):
        kps = [Keypoint(x=xs[i], y=ys[i], z=0.1, visibility=vis[i])] + [
            Keypoint(x=0.5, y=0.5, z=0.0, visibility=1.0) for _ in range(32)
        ]
        frames.append(FramePose(frame_index=i, timestamp_s=i / FPS, keypoints=kps))
    return frames


def _jitter(values):
    """Mean absolute frame-to-frame delta."""
    return sum(abs(b - a) for a, b in zip(values, values[1:])) / (len(values) - 1)


def test_constant_signal_unchanged():
    frames = _frames_from_xy([0.4] * 30, [0.6] * 30)
    out = smooth_sequence(frames)
    assert all(f.keypoints[0].x == pytest.approx(0.4) for f in out)
    assert all(f.keypoints[0].y == pytest.approx(0.6) for f in out)


def test_jitter_is_reduced_on_static_signal():
    rng = random.Random(42)
    xs = [0.5 + rng.uniform(-0.01, 0.01) for _ in range(60)]
    frames = _frames_from_xy(xs, [0.5] * 60)
    out = smooth_sequence(frames, min_cutoff=1.0, beta=0.0)
    smoothed = [f.keypoints[0].x for f in out]
    assert _jitter(smoothed) < 0.5 * _jitter(xs)


def test_high_beta_follows_fast_motion():
    # a fast ramp: low beta lags it, high beta tracks it
    xs = [0.1 + 0.8 * i / 29 for i in range(30)]
    frames = _frames_from_xy(xs, [0.5] * 30)
    lag_low = abs(smooth_sequence(frames, min_cutoff=0.1, beta=0.0)[-1].keypoints[0].x - xs[-1])
    lag_high = abs(smooth_sequence(frames, min_cutoff=0.1, beta=5.0)[-1].keypoints[0].x - xs[-1])
    assert lag_high < lag_low


def test_untrusted_holds_last_good_and_resets_filter():
    # trusted at 0.2, then a hallucinated excursion to 0.9 with low visibility,
    # then trusted again at 0.6.
    # New policy: untrusted frames freeze at the last trusted position (0.2),
    # NOT at the raw MediaPipe value (0.9) — avoids skeleton snapping to garbage.
    # Filter state still resets so the excursion doesn't bleed into post-gap frames.
    xs = [0.2] * 10 + [0.9] * 5 + [0.6] * 10
    vis = [1.0] * 10 + [0.1] * 5 + [1.0] * 10
    frames = _frames_from_xy(xs, [0.5] * 25, vis)
    out = smooth_sequence(frames)
    # untrusted frames hold the last trusted position (x≈0.2), not the raw 0.9
    assert all(out[i].keypoints[0].x == pytest.approx(0.2, abs=0.01) for i in range(10, 15))
    # untrusted frames carry the current (low) visibility score for renderer fading
    assert all(out[i].keypoints[0].visibility == pytest.approx(0.1) for i in range(10, 15))
    # filter restarted at the first trusted point after the gap: exactly the raw value
    # (excursion to 0.9 does not drag the post-gap values)
    assert out[15].keypoints[0].x == pytest.approx(0.6)


def test_offscreen_points_hold_last_good_despite_high_visibility():
    # Off-screen coordinates (x=1.3) are untrusted even at full visibility.
    # New policy: freeze at last trusted position (x≈0.5), not the off-screen value.
    xs = [0.5] * 5 + [1.3] * 3 + [0.5] * 5
    frames = _frames_from_xy(xs, [0.5] * 13)
    out = smooth_sequence(frames)
    # off-screen frames must NOT pass the raw 1.3 through
    assert all(out[i].keypoints[0].x == pytest.approx(0.5, abs=0.01) for i in range(5, 8))
    assert not is_trusted(frames[5].keypoints[0])


def test_trusted_but_jumping_landmark_is_gated_to_last_good():
    # During a fast dyno MediaPipe can report HIGH visibility on coordinates that
    # are flat wrong — the joint teleports across the frame while looking trusted,
    # which the One-Euro filter (beta tuned to pass fast motion) does nothing to
    # stop. The position-delta gate must catch this physically-impossible jump and
    # hold the joint at its last good position rather than let the skeleton snap.
    jump = MAX_JUMP + 0.1  # comfortably past the gate, well above any real motion
    xs = [0.4] * 6 + [0.4 + jump] + [0.42] * 6  # single-frame teleport, then settle
    frames = _frames_from_xy(xs, [0.5] * 13)    # every frame fully visible (v=1.0)
    out = smooth_sequence(frames)
    # the teleport frame is held at the last good x (0.4), NOT the raw 0.4+jump
    assert out[6].keypoints[0].x == pytest.approx(0.4)
    assert out[6].keypoints[0].x != pytest.approx(0.4 + jump, abs=0.05)
    # ...and faded (visibility halved) despite the raw frame being fully visible,
    # so the renderer signals the (otherwise silent) low confidence
    assert out[6].keypoints[0].visibility == pytest.approx(0.5)
    # the gate costs one extra held frame: the frame after a teleport is still
    # compared against the bad coord, so it too holds last good before resuming
    assert out[7].keypoints[0].x == pytest.approx(0.4)
    assert out[7].keypoints[0].visibility == pytest.approx(0.5)
    # once two consecutive coords agree again, live tracking resumes at full trust
    assert out[8].keypoints[0].x == pytest.approx(0.42)
    assert out[8].keypoints[0].visibility == pytest.approx(1.0)


def test_fast_but_plausible_motion_passes_the_jump_gate():
    # A genuine dyno reach advances in small per-frame steps. Each step stays under
    # MAX_JUMP, so the gate must let the whole move through untouched — the anchor
    # advances every frame, so cumulative travel across the move is never penalized
    # even though it sums to far more than MAX_JUMP.
    step = MAX_JUMP * 0.75  # fast (above typical motion) but each step is plausible
    xs = [0.1 + step * i for i in range(10)]  # a long, continuous fast ramp
    frames = _frames_from_xy(xs, [0.5] * 10)
    out = smooth_sequence(frames, min_cutoff=1.0, beta=1.0)  # production smoothing
    # nothing is gated: a gated frame would halve visibility, so full vis == passed
    assert all(f.keypoints[0].visibility == pytest.approx(1.0) for f in out)
    # and the skeleton genuinely tracks the motion across its full range
    assert out[-1].keypoints[0].x > out[0].keypoints[0].x + 0.3


def test_input_not_mutated_and_z_vis_preserved():
    rng = random.Random(7)
    xs = [0.5 + rng.uniform(-0.01, 0.01) for _ in range(20)]
    frames = _frames_from_xy(xs, xs)
    out = smooth_sequence(frames, min_cutoff=0.5)
    assert [f.keypoints[0].x for f in frames] == xs  # input untouched
    assert out is not frames
    assert all(f.keypoints[0].z == pytest.approx(0.1) for f in out)
    assert all(f.keypoints[0].visibility == pytest.approx(1.0) for f in out)


def test_empty_sequence():
    assert smooth_sequence([]) == []
