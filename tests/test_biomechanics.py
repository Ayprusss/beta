"""Test pattern for the 🔵 feature code — fast, no video required.

This is HOW you validate biomechanics: hand-craft a FramePose with known geometry,
then assert the feature returns what physics says it should. These tests are
currently skipped because the functions are stubs — delete the skip as you
implement each one (red -> green is the point).

Run all:    pytest
Run one:    pytest tests/test_biomechanics.py::test_arm_straightness_straight_is_180
"""
import pytest

from ml.pose import FramePose, Keypoint
from ml.features import biomechanics as bio


def _kp(x: float, y: float, v: float = 1.0) -> Keypoint:
    return Keypoint(x=x, y=y, z=0.0, visibility=v)


def _pose_from(points: dict[int, Keypoint]) -> FramePose:
    """Build a 33-landmark FramePose, filling unspecified landmarks with zeros."""
    kps = [points.get(i, _kp(0.0, 0.0, 0.0)) for i in range(33)]
    return FramePose(frame_index=0, timestamp_s=0.0, keypoints=kps)


@pytest.mark.skip(reason="🔵 implement arm_straightness, then remove this skip")
def test_arm_straightness_straight_is_180():
    # shoulder, elbow, wrist collinear and vertical -> ~180 degrees
    pose = _pose_from({
        bio.R_SHOULDER: _kp(0.5, 0.2),
        bio.R_ELBOW: _kp(0.5, 0.4),
        bio.R_WRIST: _kp(0.5, 0.6),
    })
    angle = bio.arm_straightness(pose, side="right")
    assert angle == pytest.approx(180.0, abs=5.0)


@pytest.mark.skip(reason="🔵 implement arm_straightness, then remove this skip")
def test_arm_straightness_right_angle_is_90():
    # shoulder above elbow, wrist horizontal from elbow -> ~90 degrees
    pose = _pose_from({
        bio.R_SHOULDER: _kp(0.5, 0.2),
        bio.R_ELBOW: _kp(0.5, 0.4),
        bio.R_WRIST: _kp(0.7, 0.4),
    })
    angle = bio.arm_straightness(pose, side="right")
    assert angle == pytest.approx(90.0, abs=5.0)
