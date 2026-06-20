"""Beta API — the FastAPI service backing the web app's `BetaApi` contract.

Endpoints mirror apps/web/src/lib/types.ts:
    POST /climbs                multipart upload -> Climb (and enqueues the job)
    GET  /climbs                -> Climb[]
    GET  /climbs/{id}           -> Climb (the web app polls this for progress)
    GET  /climbs/{id}/results   -> ClimbResults (404 until the job is done)

Architecture invariant (PLAN.md): the API NEVER processes video inline. Upload
saves the file, enqueues an RQ job, and returns immediately; the web app polls.
The worker (services/worker) does all the heavy lifting.

Run from the repo root (so `ml` and `services` are importable):
    .venv\\Scripts\\python.exe -m uvicorn services.api.main:app --port 8000 --reload
"""
from __future__ import annotations

import mimetypes
import os
import shutil

from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from redis import Redis
from rq import Queue

from services import storage

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380/0")  # matches infra/docker-compose.yml
QUEUE_NAME = "climbs"
JOB_TIMEOUT_S = 1800  # pose on long phone videos is slow on CPU; be generous

ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}

app = FastAPI(title="Beta API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _queue() -> Queue:
    return Queue(QUEUE_NAME, connection=Redis.from_url(REDIS_URL))


@app.get("/health")
def health() -> dict:
    try:
        Redis.from_url(REDIS_URL).ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"ok": True, "redis": redis_ok}


@app.post("/climbs")
def upload_climb(file: UploadFile, title: str = Form(""), grade: str = Form("V?")) -> dict:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(415, f"Unsupported video type {ext!r}; expected one of {sorted(ALLOWED_VIDEO_EXTS)}")

    clean_title = title.strip() or os.path.splitext(os.path.basename(file.filename or "climb"))[0]
    meta = storage.new_climb(title=clean_title, grade=grade.strip() or "V?", video_filename=file.filename or "video.mp4")

    dest = storage.climb_dir(meta["id"]) / meta["videoFile"]
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)

    # job is referenced by dotted path so the API process never imports mediapipe
    _queue().enqueue(
        "services.worker.pipeline.process_climb",
        meta["id"],
        job_timeout=JOB_TIMEOUT_S,
        job_id=meta["id"],
    )
    return meta


@app.get("/climbs")
def list_climbs() -> list[dict]:
    return storage.list_climbs()


@app.get("/climbs/{climb_id}")
def get_climb(climb_id: str) -> dict:
    meta = storage.read_meta(climb_id)
    if meta is None:
        raise HTTPException(404, "climb not found")
    return meta


@app.get("/climbs/{climb_id}/video")
def get_video(climb_id: str) -> FileResponse:
    path = storage.video_path(climb_id)
    if path is None or not path.exists():
        raise HTTPException(404, "video not found")
    mt = mimetypes.guess_type(str(path))[0] or "video/mp4"
    return FileResponse(str(path), media_type=mt)


@app.get("/climbs/{climb_id}/results")
def get_results(climb_id: str) -> dict:
    meta = storage.read_meta(climb_id)
    if meta is None:
        raise HTTPException(404, "climb not found")
    results = storage.read_results(climb_id)
    if results is None:
        raise HTTPException(404, "results not ready")
    return results
