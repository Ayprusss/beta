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

## Quick start (the ML sandbox, no web stack needed yet)
```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
python notebooks/01_run_pose.py path/to/your_climb.mp4
```
This runs pose on a real video and dumps keypoints — your first end-to-end signal.

## Quick start (the web app, mock data)
```bash
cd apps/web
npm install
npm run dev          # http://localhost:3000
```
The full v1 flow is demoable today against a mock data layer: sign-in (stubbed),
upload, simulated pipeline, and a canvas keypoint-replay report. Swap points for
the real backend are marked in `src/lib/mockApi.ts` (API) and `src/lib/auth.tsx`
(Google OAuth via Supabase).

## Repo layout
```
apps/web/         🟢 Next.js frontend (upload, results, overlay) — BUILT, runs on mock data
services/api/     FastAPI: jobs, presigned URLs, auth                [later]
services/worker/  RQ worker entrypoint                               [later]
ml/pose/          🟢 PoseEstimator interface + MediaPipe impl
ml/io/            🟢 frame extraction, results serialization
ml/features/      🔵 smoothing (One-Euro), normalization, biomechanics
ml/feedback/      🔵 the coaching rule engine
notebooks/        🔵 your ML learning sandbox — prototype here first
tests/            unit tests on synthetic keypoint sequences
infra/            docker-compose (redis, worker, api), supabase config
```

## Your learning path
1. Pose basics (run `01_run_pose.py`, understand the landmark format)
2. Temporal filtering — implement the One-Euro filter in `ml/features/smoothing.py`
3. Biomechanics — derive COM, joint angles, base-of-support in `ml/features/biomechanics.py`
4. Rule engine — encode heuristics in `ml/feedback/rules.py`, test on a *deliberately bad* climb
5. (stretch) 3D pose lifting; (v2) hold detection; (v3) beta generation
