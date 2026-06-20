"""Tests for the rule engine — synthetic 'climbs' with known faults.

This is PLAN.md verification #3 in unit-test form: a deliberately-bad sequence
must trip the right rule with correct timestamps; a clean one must not
false-positive.
"""
import pytest

from ml.pose import FramePose, Keypoint
from ml.features import biomechanics as bio
from ml.feedback import analyze

FPS = 15.0


def _kp(x, y, v=1.0):
    return Keypoint(x=x, y=y, z=0.0, visibility=v)


def _frame(i, points):
    kps = [points.get(j, _kp(0.0, 0.0, 0.0)) for j in range(33)]
    return FramePose(frame_index=i, timestamp_s=i / FPS, keypoints=kps)


def _body(i, trunk_x=0.5, trunk_y=0.4, wrist_dx=0.0, feet=(0.4, 0.6)):
    """A full-visibility body. wrist_dx=0.0 -> straight vertical right arm;
    wrist_dx>0 -> right elbow bends (wrist pulled sideways at elbow height)."""
    sx_l, sx_r = trunk_x - 0.1, trunk_x + 0.1
    sy, hy = trunk_y - 0.15, trunk_y + 0.15
    points = {
        bio.L_SHOULDER: _kp(sx_l, sy), bio.R_SHOULDER: _kp(sx_r, sy),
        bio.L_HIP: _kp(sx_l, hy), bio.R_HIP: _kp(sx_r, hy),
        bio.R_ELBOW: _kp(sx_r, sy - 0.1),
        bio.R_WRIST: _kp(sx_r + wrist_dx, sy - (0.2 if wrist_dx == 0 else 0.1)),
        bio.L_ANKLE: _kp(feet[0], 0.9), bio.R_ANKLE: _kp(feet[1], 0.9),
    }
    return _frame(i, points)


def _codes(items):
    return {it.code for it in items}


def test_too_short_sequence_is_empty():
    assert analyze([]) == []
    assert analyze([_body(0)]) == []


def test_clean_climb_no_false_positives():
    # steady upward movement, straight arm, COM between feet -> no feedback
    frames = [_body(i, trunk_y=0.7 - 0.005 * i) for i in range(90)]  # 6s climb
    assert analyze(frames) == []


def test_bent_arm_sustained_fires_with_timestamps():
    # straight arm 2s, deeply bent 3s, straight again — keep moving so no HESITATION
    frames = (
        [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(30)]
        + [_body(i, trunk_y=0.8 - 0.004 * i, wrist_dx=0.1) for i in range(30, 75)]
        + [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(75, 90)]
    )
    items = [it for it in analyze(frames) if it.code == "BENT_ARMS"]
    assert len(items) == 1
    assert items[0].start_s == pytest.approx(30 / FPS, abs=0.2)
    assert items[0].end_s == pytest.approx(74 / FPS, abs=0.3)
    assert 0.0 < items[0].confidence <= 1.0
    assert "right" in items[0].message


def test_brief_bend_does_not_fire():
    frames = (
        [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(30)]
        + [_body(i, trunk_y=0.8 - 0.004 * i, wrist_dx=0.1) for i in range(30, 40)]  # 0.7s
        + [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(40, 70)]
    )
    assert "BENT_ARMS" not in _codes(analyze(frames))


def test_bent_arm_silent_when_arm_untrusted():
    # same deep bend, but the wrist is occluded -> no confident claim allowed
    frames = [_body(i, trunk_y=0.8 - 0.004 * i, wrist_dx=0.1) for i in range(60)]
    for f in frames:
        kp = f.keypoints[bio.R_WRIST]
        f.keypoints[bio.R_WRIST] = _kp(kp.x, kp.y, v=0.3)
    assert "BENT_ARMS" not in _codes(analyze(frames))


def test_hesitation_fires_when_static():
    frames = [_body(i) for i in range(75)]  # 5s completely still
    items = [it for it in analyze(frames) if it.code == "HESITATION"]
    assert len(items) == 1
    assert items[0].start_s == pytest.approx(0.0, abs=0.3)


def test_no_hesitation_while_moving():
    frames = [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(75)]
    assert "HESITATION" not in _codes(analyze(frames))


def test_barn_door_fires_on_fast_swing_only():
    # 2s centered, then COM swings far right of the feet in ~0.7s, then hangs there
    def x_at(i):
        if i < 30:
            return 0.5
        if i < 40:
            return 0.5 + 0.35 * (i - 30) / 10  # fast lateral swing
        return 0.85                             # static hang outside the base
    frames = [_body(i, trunk_x=x_at(i)) for i in range(120)]
    items = [it for it in analyze(frames) if it.code == "BARN_DOOR"]
    assert len(items) == 1
    assert items[0].start_s == pytest.approx(30 / FPS, abs=0.4)
    assert items[0].end_s < 45 / FPS  # the static hang afterwards is NOT part of it


def test_static_hang_outside_base_never_fires():
    # codifies the milestone-3 finding: hanging outside the base is normal on a wall
    frames = [_body(i, trunk_x=0.85) for i in range(90)]
    assert "BARN_DOOR" not in _codes(analyze(frames))


def test_items_sorted_by_start():
    frames = (
        [_body(i) for i in range(75)]  # hesitation first
        + [_body(i, trunk_y=0.4 - 0.004 * (i - 75), wrist_dx=0.1) for i in range(75, 135)]  # then bent arm
    )
    items = analyze(frames)
    assert [it.start_s for it in items] == sorted(it.start_s for it in items)
    assert {"HESITATION", "BENT_ARMS"} <= _codes(items)
