/**
 * Core domain types for the Beta web app.
 *
 * These mirror the contract the future FastAPI backend will expose
 * (see PLAN.md — jobs, keypoints, results.json). The mock client and
 * the real client both implement `BetaApi` so the swap is one import.
 */

/** Pipeline stages a climb moves through (PLAN.md worker steps). */
export type JobStage =
  | "queued"
  | "extracting" // frame extraction
  | "pose"       // pose estimation
  | "analysis"   // features + rule engine
  | "done"
  | "failed";

export type ClimbStatus = "processing" | "done" | "failed";

export interface Climb {
  id: string;
  title: string;
  grade: string; // V-scale, e.g. "V4"
  createdAt: number; // epoch ms
  status: ClimbStatus;
  stage: JobStage;
  /** 0..1 across the whole pipeline */
  progress: number;
  durationSec: number;
  /** Drives deterministic synthetic results + wall art */
  seed: number;
  /** Seeded demo climbs are viewable without auth */
  isDemo?: boolean;
}

export type Severity = "major" | "warn" | "info";

export interface FeedbackItem {
  id: string;
  rule: string; // e.g. "bent_arms"
  title: string;
  detail: string;
  severity: Severity;
  startSec: number;
  endSec: number;
  /** True when the value is geometric estimation, not measurement (PLAN.md honesty rule) */
  estimated: boolean;
}

/** Normalized image coords: x,y in [0,1], c = confidence */
export interface Keypoint {
  x: number;
  y: number;
  c: number;
}

/** One pose frame; pts indexed by JOINTS order */
export interface PoseFrame {
  t: number; // seconds
  pts: Keypoint[];
}

export interface ClimbStats {
  moves: number;
  pauseSec: number;
  bentArmPct: number; // % of climb spent on bent arms
  fluidity: number; // 0..100 heuristic score
}

export interface ClimbResults {
  climbId: string;
  fps: number;
  frames: PoseFrame[];
  feedback: FeedbackItem[];
  stats: ClimbStats;
  modelVersion: string;
}

/** A decorative hold on the synthetic wall render */
export interface Hold {
  x: number;
  y: number;
  r: number;
  rot: number;
  kind: 0 | 1 | 2; // jug / crimp / sloper-ish shape
  onRoute: boolean;
}

/** 13-joint simplified skeleton (subset of MediaPipe's 33 landmarks). */
export const JOINTS = [
  "head",
  "l_shoulder", "r_shoulder",
  "l_elbow", "r_elbow",
  "l_wrist", "r_wrist",
  "l_hip", "r_hip",
  "l_knee", "r_knee",
  "l_ankle", "r_ankle",
] as const;

export type JointName = (typeof JOINTS)[number];

export const J: Record<JointName, number> = Object.fromEntries(
  JOINTS.map((name, i) => [name, i])
) as Record<JointName, number>;

/** Bone pairs for skeleton rendering */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [J.head, J.l_shoulder],
  [J.head, J.r_shoulder],
  [J.l_shoulder, J.r_shoulder],
  [J.l_shoulder, J.l_elbow],
  [J.l_elbow, J.l_wrist],
  [J.r_shoulder, J.r_elbow],
  [J.r_elbow, J.r_wrist],
  [J.l_shoulder, J.l_hip],
  [J.r_shoulder, J.r_hip],
  [J.l_hip, J.r_hip],
  [J.l_hip, J.l_knee],
  [J.l_knee, J.l_ankle],
  [J.r_hip, J.r_knee],
  [J.r_knee, J.r_ankle],
];

/**
 * The API surface the frontend depends on. `mockApi` implements this today;
 * the FastAPI-backed client will implement the same interface later.
 */
export interface BetaApi {
  listClimbs(): Promise<Climb[]>;
  getClimb(id: string): Promise<Climb | null>;
  getResults(id: string): Promise<ClimbResults | null>;
  uploadClimb(input: { file: File; title: string; grade: string }): Promise<Climb>;
  /** Fires whenever any climb changes (status/progress). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}
