"""Tests for the biomechanics features — fast, no video required.

Pattern: hand-craft a FramePose with known geometry, assert the feature returns
what physics says it should. Unspecified landmarks default to v=0 (untrusted),
so each test controls exactly which limbs "exist".
"""
import math

import numpy as np
import pytest

from ml.pose import FramePose, Keypoint
from ml.features import biomechanics as bio


def _kp(x: float, y: float, v: float = 1.0) -> Keypoint:
    return Keypoint(x=x, y=y, z=0.0, visibility=v)


def _pose_from(points: dict[int, Keypoint]) -> FramePose:
    """Build a 33-landmark FramePose, filling unspecified landmarks with zeros."""
    kps = [points.get(i, _kp(0.0, 0.0, 0.0)) for i in range(33)]
    return FramePose(frame_index=0, timestamp_s=0.0, keypoints=kps)


def _trunk(shoulder_y=0.2, hip_y=0.5, x_l=0.4, x_r=0.6) -> dict[int, Keypoint]:
    return {
        bio.L_SHOULDER: _kp(x_l, shoulder_y),
        bio.R_SHOULDER: _kp(x_r, shoulder_y),
        bio.L_HIP: _kp(x_l, hip_y),
        bio.R_HIP: _kp(x_r, hip_y),
    }


# --- arm_straightness ---

def test_arm_straightness_straight_is_180():
    # shoulder, elbow, wrist collinear and vertical -> ~180 degrees
    pose = _pose_from({
        bio.R_SHOULDER: _kp(0.5, 0.2),
        bio.R_ELBOW: _kp(0.5, 0.4),
        bio.R_WRIST: _kp(0.5, 0.6),
    })
    angle = bio.arm_straightness(pose, side="right")
    assert angle == pytest.approx(180.0, abs=5.0)


def test_arm_straightness_right_angle_is_90():
    # shoulder above elbow, wrist horizontal from elbow -> ~90 degrees
    pose = _pose_from({
        bio.R_SHOULDER: _kp(0.5, 0.2),
        bio.R_ELBOW: _kp(0.5, 0.4),
        bio.R_WRIST: _kp(0.7, 0.4),
    })
    angle = bio.arm_straightness(pose, side="right")
    assert angle == pytest.approx(90.0, abs=5.0)


def test_arm_straightness_nan_when_landmark_untrusted():
    pose = _pose_from({
        bio.L_SHOULDER: _kp(0.5, 0.2),
        bio.L_ELBOW: _kp(0.5, 0.4),
        bio.L_WRIST: _kp(0.5, 0.6, v=0.2),  # occluded wrist
    })
    assert math.isnan(bio.arm_straightness(pose, side="left"))


def test_arm_straightness_nan_when_offscreen_even_if_confident():
    pose = _pose_from({
        bio.R_SHOULDER: _kp(0.5, 0.2),
        bio.R_ELBOW: _kp(0.5, 0.4),
        bio.R_WRIST: _kp(1.3, 0.4, v=0.99),  # extrapolated off-screen
    })
    assert math.isnan(bio.arm_straightness(pose, side="right"))


def test_arm_straightness_rejects_bad_side():
    with pytest.raises(ValueError):
        bio.arm_straightness(_pose_from({}), side="up")


# --- center_of_mass ---

def test_com_trunk_only_is_torso_midpoint():
    # only trunk trusted -> COM = midpoint of shoulder-center and hip-center
    pose = _pose_from(_trunk(shoulder_y=0.2, hip_y=0.5))
    com = bio.center_of_mass(pose)
    assert com == pytest.approx(np.array([0.5, 0.35]), abs=1e-9)


def test_com_none_without_trusted_trunk():
    points = _trunk()
    points[bio.L_HIP] = _kp(0.4, 0.5, v=0.2)  # one hip occluded
    assert bio.center_of_mass(_pose_from(points)) is None


def test_com_shifts_toward_extended_legs():
    # adding legs below the trunk must pull COM downward (larger y)
    trunk_only = bio.center_of_mass(_pose_from(_trunk()))
    points = _trunk()
    points.update({
        bio.L_KNEE: _kp(0.4, 0.7), bio.R_KNEE: _kp(0.6, 0.7),
        bio.L_ANKLE: _kp(0.4, 0.9), bio.R_ANKLE: _kp(0.6, 0.9),
    })
    with_legs = bio.center_of_mass(_pose_from(points))
    assert with_legs[1] > trunk_only[1]
    assert with_legs[0] == pytest.approx(0.5, abs=1e-9)  # symmetric -> x centered


# --- base_of_support ---

def _standing(com_x_shift=0.0) -> dict[int, Keypoint]:
    points = _trunk(x_l=0.4 + com_x_shift, x_r=0.6 + com_x_shift)
    points.update({
        bio.L_ANKLE: _kp(0.35, 0.9), bio.R_ANKLE: _kp(0.65, 0.9),
        bio.L_HEEL: _kp(0.33, 0.92), bio.R_HEEL: _kp(0.67, 0.92),
        bio.L_FOOT: _kp(0.38, 0.95), bio.R_FOOT: _kp(0.62, 0.95),
    })
    return points


def test_base_span_and_com_over_base():
    span, over = bio.base_of_support(_pose_from(_standing()))
    assert span == pytest.approx(np.array([0.33, 0.67]))
    assert over is True


def test_com_outside_base_is_barn_door():
    # whole trunk shifted way right of the feet -> COM.x outside the span
    span, over = bio.base_of_support(_pose_from(_standing(com_x_shift=0.4)))
    assert over is False


def test_base_none_when_no_feet_trusted():
    span, over = bio.base_of_support(_pose_from(_trunk()))
    assert span is None and over is None


def test_base_span_without_com_when_trunk_hidden():
    points = {
        bio.L_ANKLE: _kp(0.3, 0.9), bio.R_ANKLE: _kp(0.7, 0.9),
    }
    span, over = bio.base_of_support(_pose_from(points))
    assert span == pytest.approx(np.array([0.3, 0.7]))
    assert over is None  # base known, COM unknown -> no claim
