# Beta — ML-Powered Indoor Bouldering Coach

Upload a video of an indoor boulder → get feedback on body positioning, weight
distribution, and technique. Built as a serious side project, in phases.

> Full design lives in the plan file. This README is the working summary.

## The three phases
1. **v1 — Technique feedback** ← *we are here.* Pose → biomechanics → coaching tips.
2. **v2 — Hold/route detection.** Detect & tag holds on a wall (build a hold graph).
3. **v3 — Beta generation.** Given a tagged route, predict the move sequence.

## Build philosophy (why some code is missing on purpose)
Files are tagged:
- 🟢 **off-the-shelf** — working code provided. Don't reinvent these (pose, video I/O, infra).
- 🔵 **you build this** — *intentionally left as guided stubs.* This is where the
  learning and the product value live: smoothing, biomechanics, the feedback engine.

If a function raises `NotImplementedError`, that's your cue — the docstring tells you
what to build and why.

## Architecture (v1)
```
Browser → upload → API (FastAPI) → queue (Redis/RQ) → Worker
  Worker: decode frames 🟢 → pose 🟢 → smooth 🔵 → features 🔵 → rules 🔵 → results.json
Browser polls → results page replays skeleton overlay + shows timestamped tips
```
**Key design rule:** perception (pose) is expensive and deterministic → run once, cache
keypoints. Feedback is cheap and changes constantly → always re-runnable from cached
keypoints. Never recompute pose to tweak a rule.

## Quick start (ML sandbox only — no web stack)
```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
python notebooks/01_run_pose.py path/to/your_climb.mp4
```
Dumps keypoints to `out/<stem>.keypoints.json`. First end-to-end signal.

## Quick start (full stack)
```bash
# Redis
docker compose -f infra/docker-compose.yml up -d

# API (port 8000)
.venv\Scripts\python.exe -m uvicorn services.api.main:app --port 8000 --reload

# Worker (separate terminal)
.venv\Scripts\python.exe -m services.worker.run_worker

# Web (port 3000) — set NEXT_PUBLIC_API_URL=http://localhost:8000 in apps/web/.env.local
cd apps/web && npm run dev
```
Upload a real video at `http://localhost:3000/upload`. Results appear in the logbook once the worker finishes.

## Repo layout
```
apps/web/         🟢 Next.js frontend — upload, logbook, skeleton replay, coaching notes
services/api/     🟢 FastAPI: upload endpoint, job queue, climb list/results
services/worker/  🟢 RQ worker: pose → smooth → features → rules → results.json
services/storage  🟢 disk-backed climb store (data/climbs/<id>/)
ml/pose/          🟢 PoseEstimator interface + MediaPipe Tasks API impl
ml/io/            🟢 frame extraction, keypoint loader
ml/features/      🔵 smoothing (One-Euro), biomechanics (COM, angles, base-of-support)
ml/feedback/      🔵 the coaching rule engine
notebooks/        ML prototyping sandbox
tests/            unit tests on synthetic keypoint sequences
infra/            docker-compose (Redis on port 6380)
data/climbs/      uploaded video + cached keypoints + results per climb (gitignored)
models/           downloaded MediaPipe .task bundles (gitignored)
```

## Your learning path
1. Pose basics (run `01_run_pose.py`, understand the landmark format)
2. Temporal filtering — implement the One-Euro filter in `ml/features/smoothing.py`
3. Biomechanics — derive COM, joint angles, base-of-support in `ml/features/biomechanics.py`
4. Rule engine — encode heuristics in `ml/feedback/rules.py`, test on a *deliberately bad* climb
5. (stretch) 3D pose lifting; (v2) hold detection; (v3) beta generation
