/**
 * Mock implementation of `BetaApi`.
 *
 * Simulates the real pipeline: upload → queued → extracting → pose →
 * analysis → done, with realistic stage timings. Climbs persist in
 * localStorage; results are regenerated deterministically from each
 * climb's seed (see synth.ts) so nothing heavy is stored.
 *
 * SWAP POINT: when services/api exists, implement `BetaApi` against it
 * and change the export at the bottom of this file.
 */

import { BetaApi, Climb, ClimbResults, JobStage } from "./types";
import { generateResults } from "./synth";

const STORE_KEY = "beta.climbs.v1";

/** stage → [duration ms, progress at completion] */
const STAGE_PLAN: Array<[JobStage, number, number]> = [
  ["queued", 1400, 0.08],
  ["extracting", 2200, 0.3],
  ["pose", 3400, 0.75],
  ["analysis", 1800, 1.0],
];

const DEMO_CLIMBS: Climb[] = [
  {
    id: "demo-cave",
    title: "Cave sit-start, orange tape",
    grade: "V4",
    createdAt: Date.parse("2026-06-07T18:42:00"),
    status: "done",
    stage: "done",
    progress: 1,
    durationSec: 31,
    seed: 1247,
    isDemo: true,
  },
  {
    id: "demo-slab",
    title: "Comp slab, left arete",
    grade: "V3",
    createdAt: Date.parse("2026-06-04T19:15:00"),
    status: "done",
    stage: "done",
    progress: 1,
    durationSec: 26,
    seed: 88431,
    isDemo: true,
  },
];

type Listener = () => void;

class MockBetaApi implements BetaApi {
  private climbs = new Map<string, Climb>();
  private resultsCache = new Map<string, ClimbResults>();
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private loaded = false;

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    for (const c of DEMO_CLIMBS) this.climbs.set(c.id, c);
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        for (const c of JSON.parse(raw) as Climb[]) {
          this.climbs.set(c.id, c);
          // a climb caught mid-processing by a reload resumes its pipeline
          if (c.status === "processing") this.runPipeline(c.id, c.stage);
        }
      }
    } catch {
      // corrupted store — start fresh with demos only
    }
  }

  private save() {
    if (typeof window === "undefined") return;
    const own = [...this.climbs.values()].filter((c) => !c.isDemo);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(own));
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async listClimbs(): Promise<Climb[]> {
    this.load();
    await tick(180);
    return [...this.climbs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async getClimb(id: string): Promise<Climb | null> {
    this.load();
    await tick(120);
    return this.climbs.get(id) ?? null;
  }

  async getResults(id: string): Promise<ClimbResults | null> {
    this.load();
    const climb = this.climbs.get(id);
    if (!climb || climb.status !== "done") return null;
    await tick(250);
    let res = this.resultsCache.get(id);
    if (!res) {
      res = generateResults(climb);
      this.resultsCache.set(id, res);
    }
    return res;
  }

  async uploadClimb(input: { file: File; title: string; grade: string }): Promise<Climb> {
    this.load();
    // simulate the presigned-URL upload taking a beat
    await tick(700 + Math.min(1300, input.file.size / 1e6));
    const id = `climb-${Date.now().toString(36)}`;
    const climb: Climb = {
      id,
      title: input.title || input.file.name.replace(/\.[^.]+$/, ""),
      grade: input.grade || "V?",
      createdAt: Date.now(),
      status: "processing",
      stage: "queued",
      progress: 0,
      durationSec: 22 + Math.floor(Math.random() * 16),
      seed: (Date.now() ^ input.file.size) >>> 8,
    };
    this.climbs.set(id, climb);
    this.save();
    this.emit();
    this.runPipeline(id, "queued");
    return climb;
  }

  /** Walk the climb through the stage plan with per-stage progress ticks. */
  private runPipeline(id: string, fromStage: JobStage) {
    if (this.timers.has(id)) return;
    let idx = STAGE_PLAN.findIndex(([s]) => s === fromStage);
    if (idx < 0) idx = 0;

    const advance = () => {
      const climb = this.climbs.get(id);
      if (!climb) return;
      if (idx >= STAGE_PLAN.length) {
        this.update(id, { status: "done", stage: "done", progress: 1 });
        this.timers.delete(id);
        return;
      }
      const [stage, durMs, endProgress] = STAGE_PLAN[idx];
      const startProgress = idx === 0 ? 0 : STAGE_PLAN[idx - 1][2];
      this.update(id, { stage, status: "processing" });

      const t0 = Date.now();
      const step = () => {
        const k = Math.min(1, (Date.now() - t0) / durMs);
        this.update(id, {
          progress: startProgress + (endProgress - startProgress) * k,
        });
        if (k < 1) {
          this.timers.set(id, setTimeout(step, 160));
        } else {
          idx += 1;
          advance();
        }
      };
      step();
    };
    advance();
  }

  private update(id: string, patch: Partial<Climb>) {
    const climb = this.climbs.get(id);
    if (!climb) return;
    this.climbs.set(id, { ...climb, ...patch });
    this.save();
    this.emit();
  }
}

function tick(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** The app-wide API client. Swap this for the FastAPI client later. */
export const api: BetaApi = new MockBetaApi();
