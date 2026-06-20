"""Unit tests for One-Euro smoothing + visibility gating. Fast, no video required."""
import math
import random

import pytest

from ml.pose import FramePose, Keypoint
from ml.features import smooth_sequence, is_trusted, VISIBILITY_MIN


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
