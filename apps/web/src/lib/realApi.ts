/**
 * Real implementation of `BetaApi` against the FastAPI backend (services/api).
 *
 * Endpoint mapping is 1:1 with the contract in types.ts — the backend returns
 * Climb / ClimbResults shapes verbatim. `subscribe` is implemented by polling
 * /climbs every couple of seconds while anyone is listening (the backend's
 * meta.json is updated by the worker as the job advances).
 *
 * Demo climbs stay client-side: the backend only knows about real uploads, but
 * the seeded demos (viewable without auth, used on the landing page) keep
 * rendering from synth.ts exactly as in the mock.
 */
import { BetaApi, Climb, ClimbResults } from "./types";
import { DEMO_CLIMBS } from "./mockApi";
import { generateResults } from "./synth";

const POLL_MS = 2000;

export class RealBetaApi implements BetaApi {
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshot = "";
  private demoResults = new Map<string, ClimbResults>();

  constructor(private baseUrl: string) {}

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async listClimbs(): Promise<Climb[]> {
    const own = (await this.fetchJson<Climb[]>("/climbs")) ?? [];
    return [...own, ...DEMO_CLIMBS].sort((a, b) => b.createdAt - a.createdAt);
  }

  async getClimb(id: string): Promise<Climb | null> {
    const demo = DEMO_CLIMBS.find((c) => c.id === id);
    if (demo) return demo;
    return this.fetchJson<Climb>(`/climbs/${encodeURIComponent(id)}`);
  }

  async getResults(id: string): Promise<ClimbResults | null> {
    const demo = DEMO_CLIMBS.find((c) => c.id === id);
    if (demo) {
      let res = this.demoResults.get(id);
      if (!res) {
        res = generateResults(demo);
        this.demoResults.set(id, res);
      }
      return res;
    }
    return this.fetchJson<ClimbResults>(`/climbs/${encodeURIComponent(id)}/results`);
  }

  async uploadClimb(input: { file: File; title: string; grade: string }): Promise<Climb> {
    const form = new FormData();
    form.append("file", input.file);
    form.append("title", input.title);
    form.append("grade", input.grade);
    const res = await fetch(`${this.baseUrl}/climbs`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`upload failed (${res.status}): ${detail}`);
    }
    const climb = (await res.json()) as Climb;
    this.emit(); // new climb appears immediately; polling tracks its progress
    return climb;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.timer) {
      this.timer = setInterval(() => void this.poll(), POLL_MS);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private async poll(): Promise<void> {
    try {
      const list = await this.fetchJson<Climb[]>("/climbs");
      const snapshot = JSON.stringify(list);
      if (snapshot !== this.lastSnapshot) {
        this.lastSnapshot = snapshot;
        this.emit();
      }
    } catch {
      // backend briefly unreachable (restart, network blip) — keep polling
    }
  }
}
