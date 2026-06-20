"""The RQ job: full Stage A + Stage B processing for one climb.

Stage A (perception — expensive, deterministic, run ONCE):
    decode frames -> pose -> persist keypoints.json (all 33 landmarks, same
    schema as notebooks/01_run_pose.py, so every inspection tool works on it).

Stage B (feedback — cheap, changes constantly, always re-runnable):
    smooth -> features -> rules -> results.json (the web ClimbResults shape).

Tweak a rule? Re-run Stage B only:  python -m services.worker.rerun <climb_id>
NEVER re-run pose to tune feedback — that is the core architecture invariant.

Progress/stage updates are written to meta.json; the API serves that file to
the polling web app.
"""
from __future__ import annotations

from services import storage
from services.worker.results import build_results

MODEL_VERSION = "mediapipe-pose-landmarker-full+rules-v1"
TARGET_FPS = 15.0
# One-Euro parameters validated on test-1/test-2 (jitter -16..41%, no visible lag)
SMOOTH_MIN_CUTOFF = 1.0
SMOOTH_BETA = 1.0

# progress checkpoints across the whole pipeline (matches the web timeline UX)
P_EXTRACTING = 0.1
P_POSE_START, P_POSE_END = 0.15, 0.78
P_ANALYSIS = 0.85


def process_climb(climb_id: str) -> None:
    meta = storage.read_meta(climb_id)
    if meta is None:
        raise ValueError(f"unknown climb {climb_id!r}")
    video = storage.climb_dir(climb_id) / meta["videoFile"]

    try:
        _run(climb_id, str(video))
    except Exception as exc:
        storage.update_meta(climb_id, status="failed", stage="failed", error=str(exc))
        raise


def _run(climb_id: str, video: str) -> None:
    import cv2

    from ml.io import iter_frames
    from ml.pose import MediaPipePoseEstimator

    # --- extracting: probe the video so we can report duration + pose progress ---
    storage.update_meta(climb_id, status="processing", stage="extracting", progress=P_EXTRACTING)
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise FileNotFoundError(f"could not open video {video}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    duration_s = frame_count / src_fps if src_fps else 0.0
    est_sampled = max(1, int(frame_count / max(1, round(src_fps / TARGET_FPS))))
    storage.update_meta(climb_id, durationSec=round(duration_s))

    # --- Stage A: pose, persisted once ---
    storage.update_meta(climb_id, stage="pose", progress=P_POSE_START)
    estimator = MediaPipePoseEstimator()
    frames = []
    done = 0
    try:
        for fr in iter_frames(video, target_fps=TARGET_FPS):
            pose = estimator.estimate(fr.image_bgr, fr.frame_index, fr.timestamp_s)
            done += 1
            if pose is not None:
                frames.append(pose)
            if done % 25 == 0:
                k = min(1.0, done / est_sampled)
                storage.update_meta(climb_id, progress=P_POSE_START + (P_POSE_END - P_POSE_START) * k)
    finally:
        estimator.close()

    if not frames:
        raise RuntimeError("no person detected in any frame — check framing and lighting")

    storage.write_keypoints(
        climb_id,
        {
            "video": video,
            "model": MODEL_VERSION,
            "frames": [
                {
                    "frame_index": p.frame_index,
                    "timestamp_s": round(p.timestamp_s, 3),
                    "keypoints": [
                        {"x": round(k.x, 5), "y": round(k.y, 5), "z": round(k.z, 5), "v": round(k.visibility, 4)}
                        for k in p.keypoints
                    ],
                }
                for p in frames
            ],
        },
    )

    # --- Stage B: feedback from the cached representation ---
    storage.update_meta(climb_id, stage="analysis", progress=P_ANALYSIS)
    rebuild_results(climb_id, frames)
    storage.update_meta(climb_id, status="done", stage="done", progress=1.0)


def rebuild_results(climb_id: str, frames=None) -> dict:
    """Stage B only: smooth -> features -> rules -> results.json.

    `frames` defaults to the cached keypoints.json — this is the re-run path
    used by services/worker/rerun.py after rule tweaks.
    """
    from ml.features import smooth_sequence
    from ml.io import load_keypoints

    if frames is None:
        frames = load_keypoints(str(storage.keypoints_path(climb_id)))
    smoothed = smooth_sequence(frames, min_cutoff=SMOOTH_MIN_CUTOFF, beta=SMOOTH_BETA)
    results = build_results(climb_id, smoothed, MODEL_VERSION)
    storage.write_results(climb_id, results)
    return results
