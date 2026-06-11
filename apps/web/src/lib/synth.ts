/**
 * Deterministic synthetic data: a plausible-looking climb (pose frames),
 * the wall it happens on (holds), and the coaching feedback the rule
 * engine would emit.
 *
 * Everything is seeded so a climb's "results" are stable across reloads
 * without persisting megabytes of keypoints. When the real worker exists,
 * this entire file is replaced by `results.json` from the API.
 */

import {
  Climb,
  ClimbResults,
  FeedbackItem,
  Hold,
  J,
  Keypoint,
  PoseFrame,
} from "./types";

/** mulberry32 — tiny seeded PRNG, good enough for fixtures */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface RestPoint {
  x: number;
  y: number;
  tArrive: number; // when the COM settles here
  tLeave: number; // when the next transition starts
}

interface MotionPlan {
  rests: RestPoint[];
  duration: number;
  hesitationIdx: number; // index of the deliberately long pause
}

function planMotion(seed: number, durationSec: number): MotionPlan {
  const r = rng(seed);
  const nMoves = Math.max(6, Math.round(durationSec / 3.2));
  const rests: RestPoint[] = [];
  const hesitationIdx = 2 + Math.floor(r() * (nMoves - 4));

  let t = 0.8 + r() * 0.6; // settle-in at the start hold
  for (let i = 0; i <= nMoves; i++) {
    const prog = i / nMoves;
    const x = 0.5 + Math.sin(i * 1.7 + seed) * 0.11 + (r() - 0.5) * 0.05;
    const y = lerp(0.78, 0.2, prog) + (r() - 0.5) * 0.02;
    const pause = i === hesitationIdx ? 3.6 + r() * 1.2 : 0.5 + r() * 1.1;
    const tArrive = t;
    const tLeave = t + pause;
    rests.push({ x, y, tArrive, tLeave });
    t = tLeave + 0.8 + r() * 0.5; // transition time to next rest
  }
  return { rests, duration: t, hesitationIdx };
}

/** COM position at time t (piecewise smoothstep through rest points) */
function comAt(plan: MotionPlan, t: number): { x: number; y: number; moving: number } {
  const { rests } = plan;
  if (t <= rests[0].tArrive) {
    return { x: rests[0].x, y: rests[0].y, moving: 0 };
  }
  for (let i = 0; i < rests.length; i++) {
    const cur = rests[i];
    if (t <= cur.tLeave) return { x: cur.x, y: cur.y, moving: 0 };
    const next = rests[i + 1];
    if (!next) break;
    if (t < next.tArrive) {
      const k = smooth((t - cur.tLeave) / (next.tArrive - cur.tLeave));
      return { x: lerp(cur.x, next.x, k), y: lerp(cur.y, next.y, k), moving: k * (1 - k) * 4 };
    }
  }
  const last = rests[rests.length - 1];
  return { x: last.x, y: last.y, moving: 0 };
}

/** Where a hand reaches for during move i (used for both pose + route holds) */
function handTarget(plan: MotionPlan, i: number, side: -1 | 1, seed: number) {
  const r = rng(seed * 31 + i * 7 + (side === -1 ? 0 : 1000));
  const rest = plan.rests[Math.min(i, plan.rests.length - 1)];
  return {
    x: rest.x + side * (0.07 + r() * 0.06),
    y: rest.y - 0.2 - r() * 0.04,
  };
}

function footTarget(plan: MotionPlan, i: number, side: -1 | 1, seed: number) {
  const r = rng(seed * 47 + i * 11 + (side === -1 ? 0 : 2000));
  const rest = plan.rests[Math.max(0, Math.min(i, plan.rests.length - 1))];
  return {
    x: rest.x + side * (0.05 + r() * 0.05),
    y: rest.y + 0.17 + r() * 0.04,
  };
}

/**
 * Position of a limb endpoint that latches to targets and moves between
 * them in its assigned move windows. Hands lead (move during transition i
 * if i matches parity), feet follow one move later.
 */
function limbAt(
  plan: MotionPlan,
  t: number,
  side: -1 | 1,
  kind: "hand" | "foot",
  seed: number
): { x: number; y: number } {
  const target = kind === "hand" ? handTarget : footTarget;
  const parity = (kind === "hand" ? side === -1 : side === 1) ? 0 : 1;
  let cur = target(plan, 0, side, seed);
  for (let i = 0; i < plan.rests.length - 1; i++) {
    if (i % 2 !== parity) continue; // this limb doesn't move on this transition
    const from = plan.rests[i];
    const to = plan.rests[i + 1];
    // limb moves slightly after the COM starts shifting
    const t0 = from.tLeave + (kind === "hand" ? 0.05 : 0.3);
    const t1 = Math.min(to.tArrive + (kind === "foot" ? 0.25 : 0), plan.duration);
    const dest = target(plan, i + 1, side, seed);
    if (t >= t1) {
      cur = dest;
    } else if (t > t0) {
      const k = smooth((t - t0) / (t1 - t0));
      // small arc so the limb "reaches" rather than slides
      const arc = Math.sin(k * Math.PI) * 0.03;
      cur = { x: lerp(cur.x, dest.x, k), y: lerp(cur.y, dest.y, k) - arc };
      return cur;
    }
  }
  return cur;
}

/** Elbow/knee placed off the shoulder–wrist line; more bend when limb is compressed */
function midJoint(
  ax: number, ay: number, bx: number, by: number,
  maxLen: number, bendSign: number
): { x: number; y: number } {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const d = Math.hypot(bx - ax, by - ay);
  const slack = Math.max(0, maxLen - d);
  // perpendicular offset
  const nx = -(by - ay) / (d || 1);
  const ny = (bx - ax) / (d || 1);
  const off = Math.min(0.09, slack * 0.9) * bendSign;
  return { x: mx + nx * off, y: my + ny * off };
}

export function generateFrames(climb: Climb): { frames: PoseFrame[]; plan: MotionPlan } {
  const plan = planMotion(climb.seed, climb.durationSec);
  const fps = 15;
  const n = Math.floor(plan.duration * fps);
  const noise = rng(climb.seed * 13 + 5);
  const frames: PoseFrame[] = [];

  for (let f = 0; f < n; f++) {
    const t = f / fps;
    const com = comAt(plan, t);
    const lean = Math.sin(t * 0.9 + climb.seed) * 0.015;
    const sway = com.moving * 0.012;

    const hipY = com.y + 0.055;
    const shY = com.y - 0.11;
    const lHip = { x: com.x - 0.035 + lean, y: hipY };
    const rHip = { x: com.x + 0.035 + lean, y: hipY };
    const lSh = { x: com.x - 0.055 + lean * 2 + sway, y: shY };
    const rSh = { x: com.x + 0.055 + lean * 2 + sway, y: shY };
    const head = { x: com.x + lean * 2.5, y: shY - 0.07 };

    const lWr = limbAt(plan, t, -1, "hand", climb.seed);
    const rWr = limbAt(plan, t, 1, "hand", climb.seed);
    const lAn = limbAt(plan, t, -1, "foot", climb.seed);
    const rAn = limbAt(plan, t, 1, "foot", climb.seed);

    const lEl = midJoint(lSh.x, lSh.y, lWr.x, lWr.y, 0.24, -1);
    const rEl = midJoint(rSh.x, rSh.y, rWr.x, rWr.y, 0.24, 1);
    const lKn = midJoint(lHip.x, lHip.y, lAn.x, lAn.y, 0.26, -1);
    const rKn = midJoint(rHip.x, rHip.y, rAn.x, rAn.y, 0.26, 1);

    const raw = [head, lSh, rSh, lEl, rEl, lWr, rWr, lHip, rHip, lKn, rKn, lAn, rAn];
    const pts: Keypoint[] = raw.map((p) => ({
      x: p.x + (noise() - 0.5) * 0.006, // pose jitter — the One-Euro filter's reason to exist
      y: p.y + (noise() - 0.5) * 0.006,
      c: 0.82 + noise() * 0.17,
    }));
    frames.push({ t, pts });
  }
  return { frames, plan };
}

export function generateHolds(climb: Climb): Hold[] {
  const plan = planMotion(climb.seed, climb.durationSec);
  const r = rng(climb.seed * 101 + 9);
  const holds: Hold[] = [];

  // route holds: where the hands/feet actually go
  for (let i = 0; i < plan.rests.length; i++) {
    for (const side of [-1, 1] as const) {
      const h = handTarget(plan, i, side, climb.seed);
      holds.push({ x: h.x, y: h.y, r: 0.018 + r() * 0.014, rot: r() * Math.PI, kind: (i % 3) as 0 | 1 | 2, onRoute: true });
      if (i % 2 === 0) {
        const ft = footTarget(plan, i, side, climb.seed);
        holds.push({ x: ft.x, y: ft.y, r: 0.012 + r() * 0.008, rot: r() * Math.PI, kind: 1, onRoute: true });
      }
    }
  }
  // scatter: other routes' holds, faint
  for (let i = 0; i < 34; i++) {
    holds.push({
      x: 0.06 + r() * 0.88,
      y: 0.05 + r() * 0.9,
      r: 0.01 + r() * 0.02,
      rot: r() * Math.PI,
      kind: Math.floor(r() * 3) as 0 | 1 | 2,
      onRoute: false,
    });
  }
  return holds;
}

interface RuleTemplate {
  rule: string;
  title: string;
  severity: FeedbackItem["severity"];
  estimated: boolean;
  detail: (t0: string, t1: string) => string;
}

const RULES: RuleTemplate[] = [
  {
    rule: "bent_arms",
    title: "Climbing on bent arms",
    severity: "major",
    estimated: false,
    detail: () =>
      "Sustained elbow flexion while static. Straighten your arms and hang off your skeleton — bent arms burn forearm strength you'll want for the crux.",
  },
  {
    rule: "hesitation",
    title: "Long hesitation before the move",
    severity: "warn",
    estimated: false,
    detail: () =>
      "You held position well past a normal reset. Pauses over ~3s usually mean over-gripping while you decide. Read the sequence from the ground, then commit.",
  },
  {
    rule: "hip_distance",
    title: "Hips drifting off the wall",
    severity: "major",
    estimated: true,
    detail: () =>
      "During the reach your hips appear to swing away from the wall. Turn a hip in or flag the free leg to keep weight over your feet.",
  },
  {
    rule: "com_base",
    title: "Center of mass outside base of support",
    severity: "warn",
    estimated: true,
    detail: () =>
      "Your estimated COM projects outside your foot polygon — barn-door risk. Re-position a foot or flag before reaching.",
  },
  {
    rule: "foot_cut",
    title: "Feet cut loose unnecessarily",
    severity: "info",
    estimated: false,
    detail: () =>
      "Both feet left the wall on a move that didn't require it. Controlled feet save energy — keep toes on until the next placement is chosen.",
  },
];

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function generateResults(climb: Climb): ClimbResults {
  const { frames, plan } = generateFrames(climb);
  const r = rng(climb.seed * 7 + 3);

  const feedback: FeedbackItem[] = [];
  const hes = plan.rests[plan.hesitationIdx];

  // hesitation always fires on the planted long pause — the demo of rules "working"
  feedback.push(mkItem(RULES[1], hes.tArrive, hes.tLeave, climb.id, 0));

  // 2–3 more rules at plausible windows
  const pool = [RULES[0], RULES[2], RULES[3], RULES[4]];
  const count = 2 + Math.floor(r() * 2);
  const usable = plan.rests.filter((_, i) => i !== plan.hesitationIdx && i > 0);
  for (let i = 0; i < count && i < usable.length; i++) {
    const tpl = pool[Math.floor(r() * pool.length)];
    pool.splice(pool.indexOf(tpl), 1);
    const rest = usable[Math.floor(r() * usable.length)];
    usable.splice(usable.indexOf(rest), 1);
    const t0 = Math.max(0, rest.tArrive - 0.5);
    const t1 = Math.min(plan.duration, rest.tLeave + 1.2);
    feedback.push(mkItem(tpl, t0, t1, climb.id, i + 1));
  }
  feedback.sort((a, b) => a.startSec - b.startSec);

  const pauseSec = plan.rests.reduce(
    (acc, p) => acc + Math.max(0, p.tLeave - p.tArrive - 1.2),
    0
  );
  const bentArmPct = Math.round(14 + r() * 30);
  const fluidity = Math.max(
    20,
    Math.round(92 - pauseSec * 4 - bentArmPct * 0.6 - feedback.length * 3)
  );

  return {
    climbId: climb.id,
    fps: 15,
    frames,
    feedback,
    stats: {
      moves: plan.rests.length - 1,
      pauseSec: Math.round(pauseSec * 10) / 10,
      bentArmPct,
      fluidity,
    },
    modelVersion: "mock-0.1.0",
  };
}

function mkItem(
  tpl: RuleTemplate,
  t0: number,
  t1: number,
  climbId: string,
  i: number
): FeedbackItem {
  return {
    id: `${climbId}-fb-${i}`,
    rule: tpl.rule,
    title: tpl.title,
    detail: tpl.detail(fmt(t0), fmt(t1)),
    severity: tpl.severity,
    startSec: Math.round(t0 * 10) / 10,
    endSec: Math.round(t1 * 10) / 10,
    estimated: tpl.estimated,
  };
}

export { fmt as formatTime };
