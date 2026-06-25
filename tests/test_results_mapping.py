"""Tests for the worker's ClimbResults mapping — the contract with the web app.

Shape assertions mirror apps/web/src/lib/types.ts; if these break, the web
replay breaks.
"""
import pytest

from ml.pose import FramePose, Keypoint
from ml.feedback import FeedbackItem
from ml.features import biomechanics as bio
from services.worker.results import (
    JOINT_INDICES,
    RULE_TITLES,
    _map_feedback,
    build_results,
)

FPS = 15.0


def _kp(x, y, v=1.0):
    return Keypoint(x=x, y=y, z=0.0, visibility=v)


def _body(i, trunk_y=0.4, wrist_dx=0.0):
    points = {
        bio.L_SHOULDER: _kp(0.4, trunk_y - 0.15), bio.R_SHOULDER: _kp(0.6, trunk_y - 0.15),
        bio.L_HIP: _kp(0.4, trunk_y + 0.15), bio.R_HIP: _kp(0.6, trunk_y + 0.15),
        bio.R_ELBOW: _kp(0.6, trunk_y - 0.25),
        bio.R_WRIST: _kp(0.6 + wrist_dx, trunk_y - (0.35 if wrist_dx == 0 else 0.25)),
        bio.L_ANKLE: _kp(0.4, 0.9), bio.R_ANKLE: _kp(0.6, 0.9),
    }
    kps = [points.get(j, _kp(0.0, 0.0, 0.0)) for j in range(33)]
    return FramePose(frame_index=i, timestamp_s=i / FPS, keypoints=kps)


def test_shape_matches_web_contract():
    frames = [_body(i, trunk_y=0.7 - 0.004 * i) for i in range(60)]
    res = build_results("climb-x", frames, "model-v1")

    assert res["climbId"] == "climb-x"
    assert res["modelVersion"] == "model-v1"
    assert res["fps"] == pytest.approx(FPS, abs=0.5)
    assert len(res["frames"]) == 60
    f0 = res["frames"][0]
    assert set(f0) == {"t", "pts"}
    assert len(f0["pts"]) == len(JOINT_INDICES) == 13
    assert set(f0["pts"][0]) == {"x", "y", "c"}
    assert set(res["stats"]) == {"moves", "pauseSec", "bentArmPct", "fluidity"}
    # every feedback item carries `kind` — the required-field web contract
    assert all("kind" in item for item in res["feedback"])


def test_feedback_mapping_severity_and_estimated():
    # 5s static hold -> HESITATION (ml severity "info" stays web "info")
    frames = [_body(i) for i in range(75)]
    res = build_results("climb-x", frames, "m")
    assert len(res["feedback"]) >= 1
    item = res["feedback"][0]
    assert item["rule"] == "hesitation"
    assert item["severity"] == "info"
    assert item["estimated"] is True
    assert item["endSec"] > item["startSec"]
    assert item["title"] == "Long pause"


def test_map_feedback_forwards_kind_and_dyno_title():
    # A recognised move and a fault, mapped together. kind must survive the
    # API boundary so the web app can acknowledge moves instead of flagging them.
    items = [
        FeedbackItem(
            start_s=1.0, end_s=1.4, code="DYNO", message="nice dynamic move",
            severity="info", confidence=0.7, kind="move",
        ),
        FeedbackItem(
            start_s=2.0, end_s=3.5, code="BENT_ARMS", message="bent arm hang",
            severity="suggestion", confidence=0.5,  # kind defaults to "fault"
        ),
    ]
    dyno, bent = _map_feedback(items)

    assert dyno["kind"] == "move"
    assert dyno["title"] == "Dynamic move"  # nicer than the "Dyno" title() fallback
    assert RULE_TITLES["DYNO"] == "Dynamic move"
    assert bent["kind"] == "fault"  # the dataclass default forwards through unchanged


def test_stats_reflect_motion():
    still = build_results("a", [_body(i) for i in range(75)], "m")["stats"]
    moving = build_results("b", [_body(i, trunk_y=0.8 - 0.004 * i) for i in range(75)], "m")["stats"]
    assert still["pauseSec"] > moving["pauseSec"]
    assert still["fluidity"] < moving["fluidity"]
    assert 0 <= still["fluidity"] <= 100 and 0 <= moving["fluidity"] <= 100
