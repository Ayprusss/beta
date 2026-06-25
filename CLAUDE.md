# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**Beta** — an ML-powered indoor bouldering coach. Upload a climbing video → get feedback on body
positioning, weight distribution, and technique. Built in phases (see `PLAN.md` for full design):
v1 technique feedback (current) → v2 hold/route detection → v3 beta generation.

Read `PLAN.md` for architecture rationale and `README.md` for the working summary before substantial work.

<!-- MENTOR MODE — temporarily disabled at owner's request (2026-06-12).
     Remove this comment wrapper to re-enable the mentor/handoff contract.

## Mentor mode (how to operate in this repo) — IMPORTANT

The owner is using this project to **level up as a software engineer, systems designer, and ML
practitioner.** You are a **mentor, not an autopilot.** Optimize for their learning, not for finishing
the code yourself. Default to the least intervention that unblocks them.

Behaviours:
- **Teach the "why" before the "how."** When a decision comes up (a data structure, an architecture
  choice, a model), explain the tradeoffs and let them choose. Name the concept so they can go read more.
- **Think in systems.** Connect local changes to the bigger picture (the two-stage perception/feedback
  split, the queue, the data-as-moat strategy). Point out when a quick fix violates a design principle.
- **Be honest about hard limits.** e.g. force/weight cannot be measured from a single video — only
  estimated. Don't let the project drift into overselling.
- **Review like a senior engineer:** when they write code, critique it (correctness, naming, edge cases,
  performance) rather than rewriting it wholesale.

## The 🟢 / 🔵 rule (what you may write vs. what is theirs)

Every component is tagged in `PLAN.md` and `README.md`:

- 🟢 **Off-the-shelf glue — you MAY implement fully.** Pose estimation wiring, video decode, FastAPI/queue
  plumbing, infra, Next.js scaffolding. These teach little; just don't reinvent the underlying models.
- 🔵 **Learning core — DO NOT implement for them.** `ml/features/` (smoothing, normalization,
  biomechanics), `ml/feedback/` (the rule engine), and later the technique classifier and v3 beta search.
  These files ship as guided stubs raising `NotImplementedError`. **This is the work that is theirs.**

### Handoff conditions — when to STOP and hand off

**First, always check `PLAN.md` to confirm which bucket the task falls in.** The 🟢/🔵 tags there are the
source of truth for what is built by hand (theirs) vs. built for them (yours). If a task spans both, the
🔵 part is handed off and you may scaffold only the 🟢 part around it.

**Current phase: v1 — Technique Feedback.** Apply handoff to *this phase's* learning core. Hand the work
back to the owner (do NOT write the implementation) when ANY of these is true:
1. The change is in a v1 🔵 area: **`ml/features/`** (One-Euro smoothing, normalization, biomechanics:
   COM, joint angles, base-of-support) or **`ml/feedback/`** (the heuristic rule engine).
2. The task involves designing a v1 algorithm, feature, or coaching heuristic (not just wiring).
3. It's a core biomechanics or coaching-logic decision.
4. They ask "how should I…" about a v1 🔵 area — that's a request to learn, not to be handed code.

🟢 v1 work you MAY fully implement: `ml/pose/` wiring, `ml/io/`, FastAPI/RQ plumbing, infra, Next.js
scaffolding. *(When the project advances to v2/v3, update this "Current phase" block and its 🔵 list to
match that phase's learning core per `PLAN.md` — e.g. v2 hold-graph construction, v3 beta search.)*

### How to hand off — hints and SOME help only
When handing off, you give **direction, not solutions:**
- ✅ Explain the concept and *why* it matters; sketch the approach in prose or pseudocode.
- ✅ Give the function signature, the inputs/outputs, and 1–2 references or a worked *analogous* example.
- ✅ Drop targeted hints ("you'll want to track per-axis state across frames"; "watch the lag/jitter
  tradeoff") and point to the exact line to start at.
- ✅ After they attempt it, review and nudge — Socratic questions over corrections.
- ❌ Do NOT write the full implementation, even if asked directly the first time. Offer a hint instead and
  ask them to try. Only provide more if they're genuinely stuck after an honest attempt, and even then,
  give the smallest piece that unblocks — never the whole function.

If unsure whether something is a handoff, ask the owner which mode they want for this task.
-->


## The "break" protocol

When the owner says **"break"** (or "break protocol"), wrap up the session into a single `BREAK.md` file
at the repo root. Purpose: compact the conversation so a fresh session can resume cold with full context
and the session/token budget is preserved. Overwrite `BREAK.md` each time (it's a rolling handoff, not a log).

`BREAK.md` must contain:
- **Session goal** — what we set out to do this session.
- **Done** — what was actually completed and verified (be honest; note what's unverified).
- **Attempts & dead ends** — approaches tried that failed or were abandoned, and *why* — so they aren't repeated.
- **In progress** — what's half-built right now, and exactly where it stands (files, functions, current state).
- **Next steps** — the concrete ordered to-do list to resume, including any 🔵 work that is the owner's to write.
- **Open questions / decisions pending** — anything awaiting the owner's call.
- **Key context** — paths, commands, or gotchas a cold session would need.

After writing `BREAK.md`, give a one-line confirmation and stop — do not start new work unless asked.

## Ticket/issue worktrees — isolate before you touch code

When a session is assigned a specific ticket or issue (e.g. **#3**), **create a git worktree before
editing anything**, so parallel sessions working other tickets never collide on the working tree, the
index, or the branch.

- **Create it first.** Use the `EnterWorktree` tool with a name derived from the ticket — `issue-<number>`
  (e.g. `issue-3`). This branches a fresh worktree from the default branch under `.claude/worktrees/` and
  switches the session into it. Do this at the very start, before the first edit — not after work begins.
- **One ticket = one worktree = one branch.** Never share a worktree across tickets, and never work a
  ticket directly on `master`.
- **Stay inside it** for the whole task: edits, commits, tests, and the PR all happen from the worktree.
- **When the work lands** (PR opened/merged), leave with `ExitWorktree` — remove it if the branch is
  merged, keep it if work continues. At session end you'll be prompted to keep or remove either way.
- **Skip it for no-code work.** Answering questions, reading, or pure investigation don't need a worktree;
  this protocol is only for sessions that will modify files under a ticket.

## Parallel instances — running multiple Claudes at once

The worktree rule above isolates the **filesystem and git** (working tree, index, branch). It does NOT
isolate the **runtime** — ports, the single Redis, the one RQ queue, and the venv are all shared across
instances. These rules cover the rest so parallel sessions don't trip over each other.

- **Claim the issue first — assignment is the lock.** Before creating the worktree, check the GitHub issue
  is unassigned (`gh issue view <n>`) and assign yourself (`gh issue edit <n> --add-assignee @me`). If it's
  already assigned to someone/another in-progress session, stop and pick a different ticket. This is what
  prevents two instances grabbing the same work.
- **Reuse the repo-root venv — never build one per worktree.** Worktrees under `.claude/worktrees/` have no
  `.venv`, and mediapipe is too heavy to reinstall per worktree. From inside a worktree, call Python via the
  absolute root path: `D:\coding_files\beta\.venv\Scripts\python.exe ...` (and `pytest` likewise). The `out/`
  keypoint cache is a *relative* path, so each worktree keeps its own Stage-A cache — that's intended.
- **Runtime isolation policy (simple): only ONE instance runs the live stack at a time.** The full stack
  (API `:8000`, web `:3000`, Redis `:6380`, queue `beta`) has hardcoded ports and a shared queue, so a
  second live stack will either fail to bind or steal the first's jobs. Parallel instances must restrict
  themselves to the **ML sandbox + `pytest`**, which need no ports or Redis. If a ticket genuinely needs the
  live stack, confirm with the owner that no other instance is running it before you start.
- **Avoid shared-file edits in a feature worktree.** `CLAUDE.md`, `PLAN.md`, `README.md`, and
  `requirements.txt` are merge-conflict magnets across parallel branches. Don't touch them unless the ticket
  is *about* them; if unavoidable, keep the edit surgical and flag it in the PR.
- **Definition of done before opening a PR.** Rebase on the latest `master` first, get `pytest` green, write
  the PR body with `Closes #<n>`, and never commit to `master` directly.

## Orchestrated parallel execution (Model 2)

To run many tickets at once, prefer **one orchestrator session that dispatches subagents** over many
hand-driven terminals. The orchestrator coordinates and writes **no feature code itself**.

**Roles:**
- **Orchestrator** (the session you talk to) — claims tickets, dispatches workers, runs the review gate,
  and opens PRs after the owner's OK.
- **`ticket-worker`** (`.claude/agents/ticket-worker.md`) — implements one ticket in its own worktree, with
  tests, committed to the ticket branch. Never opens PRs.
- **`code-reviewer`** (`.claude/agents/code-reviewer.md`, **Sonnet**) — independent, read-only audit of the
  worker's branch *before* any PR. Returns `APPROVE` / `REQUEST CHANGES`. Cannot edit code.

**Per-ticket loop:**
1. **Claim** — confirm the issue is unassigned and assign yourself (see the parallel-instances rules above).
2. **Dispatch** — spawn a `ticket-worker` with `isolation: "worktree"`; choose its model by difficulty
   (Opus for hard, Sonnet/Haiku for light). **Tell it the branch name to use** (`issue-<n>-<short-slug>`):
   `isolation: "worktree"` auto-names the branch `worktree-agent-<id>`, so the worker renames it to the
   `issue-<n>` convention before its first commit. **Cap 2 workers in flight** (rate-limit + review bandwidth).
3. **Review gate** — when the worker reports done, spawn a `code-reviewer` (leave it on Sonnet — don't
   override the model) pointed at the worker's branch.
4. **Iterate** — on `REQUEST CHANGES`, relay the findings to the *same* worker via `SendMessage` (preserves
   its context); let it fix, re-test, and re-commit, then re-review. Tell the reviewer whether the round was
   behaviour-changing or trivial (e.g. comment-only) so it can right-size the re-check. **Max 3 rounds** — if
   still failing, stop and escalate to the owner.
5. **Checkpoint** — on `APPROVE`, **pause and get the owner's OK before opening the PR.**
6. **PR** — after the owner OKs, push the worker's `issue-<n>` branch and open it with `gh pr create` and
   `Closes #<n>`. (Fallback if a branch kept its auto name: `git push origin <auto>:issue-<n>-<slug>`.)

**Two review gates by design:** the local `code-reviewer` is the **pre-PR** gate (keeps bad code from ever
becoming a PR); `.github/workflows/claude-code-review.yml` is the **post-PR** backstop. Keep both — they
catch different things at different stages. A worker never reviews its own ticket.

## Commands

ML sandbox (pose only, no web stack needed):
```bash
python -m venv .venv && .venv\Scripts\activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python notebooks/01_run_pose.py path/to/climb.mp4 # run pose, dump keypoints to out/<stem>.keypoints.json
pytest                                            # run unit tests
pytest tests/test_biomechanics.py::test_name      # run a single test
```

Full stack (3 terminals from repo root):
```bash
# 1 — Redis (requires Docker)
docker compose -f infra/docker-compose.yml up -d

# 2 — API  (port 8000)
.venv\Scripts\python.exe -m uvicorn services.api.main:app --port 8000 --reload

# 3 — Worker
.venv\Scripts\python.exe -m services.worker.run_worker

# 4 — Web app  (port 3000; NEXT_PUBLIC_API_URL must be set in apps/web/.env.local)
cd apps/web && npm run dev
```

Re-run Stage B (feedback only, no re-pose) after changing rules:
```bash
.venv\Scripts\python.exe -m services.worker.rerun <climb_id>
.venv\Scripts\python.exe -m services.worker.rerun --all
```

## Architecture (the big picture)

Two ideas drive everything:

1. **Async pipeline, never inline.** Video processing is too slow for a request cycle:
   `upload → API → Redis/RQ queue → Python worker → poll for results`. Built from day one even with one worker.
2. **Two-stage, cache the expensive stage.** *Stage A — perception* (frame decode + pose) is heavy and
   deterministic for a given video+model, so it runs **once** and its keypoints are **persisted**.
   *Stage B — feedback* (features + rules) is cheap and changes constantly, so it is always **re-runnable
   from cached keypoints.** Never recompute pose to tweak a rule. The `PoseEstimator` interface in
   `ml/pose/` exists so models (MediaPipe → RTMPose → 3D lift) swap without touching downstream code.

The feedback layer is deliberately **heuristic/rule-based** in v1 (no labeled "good technique" data exists
yet), and is designed to be replaced by a learned model once a labeled corpus accrues — that corpus is the
project's moat.
