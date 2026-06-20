"""Disk-backed climb store, shared by the API and the worker.

Layout (all under data/, which is gitignored):
    data/climbs/<id>/meta.json       -- the Climb object the web app polls (camelCase
                                        keys: it is returned verbatim by the API)
    data/climbs/<id>/video.<ext>     -- the uploaded source video
    data/climbs/<id>/keypoints.json  -- Stage A output: all 33 landmarks per frame,
                                        same schema as notebooks/01_run_pose.py
    data/climbs/<id>/results.json    -- Stage B output: the ClimbResults shape the
                                        web app renders

This is deliberately the simplest thing that honors the two-stage design:
keypoints are cached once, results are always re-derivable from them (see
services/worker/rerun.py). Swapping this module for Supabase (Postgres rows +
Storage objects) later only touches this file and its callers' imports.

Writes are atomic (tmp file + os.replace) because the API reads meta.json while
the worker is updating it.
"""
from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
CLIMBS_DIR = REPO_ROOT / "data" / "climbs"


def climb_dir(climb_id: str) -> Path:
    return CLIMBS_DIR / climb_id


def meta_path(climb_id: str) -> Path:
    return climb_dir(climb_id) / "meta.json"


def keypoints_path(climb_id: str) -> Path:
    return climb_dir(climb_id) / "keypoints.json"


def results_path(climb_id: str) -> Path:
    return climb_dir(climb_id) / "results.json"


def video_path(climb_id: str) -> Path | None:
    meta = read_meta(climb_id)
    if meta is None or "videoFile" not in meta:
        return None
    return climb_dir(climb_id) / meta["videoFile"]


def _write_json_atomic(path: Path, data: Any) -> None:
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def new_climb(title: str, grade: str, video_filename: str) -> dict:
    """Create the climb directory + initial meta. Returns the meta dict."""
    climb_id = f"climb-{int(time.time()):x}-{secrets.token_hex(3)}"
    ext = os.path.splitext(video_filename)[1].lower() or ".mp4"
    meta = {
        "id": climb_id,
        "title": title,
        "grade": grade,
        "createdAt": int(time.time() * 1000),
        "status": "processing",
        "stage": "queued",
        "progress": 0.0,
        "durationSec": 0,  # filled in by the worker after probing the video
        "seed": secrets.randbelow(1 << 20),  # drives the web app's wall art
        "videoFile": f"video{ext}",
    }
    climb_dir(climb_id).mkdir(parents=True, exist_ok=True)
    _write_json_atomic(meta_path(climb_id), meta)
    return meta


def read_meta(climb_id: str) -> dict | None:
    try:
        with open(meta_path(climb_id), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def update_meta(climb_id: str, **patch: Any) -> dict | None:
    meta = read_meta(climb_id)
    if meta is None:
        return None
    meta.update(patch)
    _write_json_atomic(meta_path(climb_id), meta)
    return meta


def list_climbs() -> list[dict]:
    metas = []
    if CLIMBS_DIR.exists():
        for d in CLIMBS_DIR.iterdir():
            meta = read_meta(d.name)
            if meta is not None:
                metas.append(meta)
    return sorted(metas, key=lambda m: m["createdAt"], reverse=True)


def write_keypoints(climb_id: str, data: dict) -> None:
    _write_json_atomic(keypoints_path(climb_id), data)


def write_results(climb_id: str, data: dict) -> None:
    _write_json_atomic(results_path(climb_id), data)


def read_results(climb_id: str) -> dict | None:
    try:
        with open(results_path(climb_id), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
