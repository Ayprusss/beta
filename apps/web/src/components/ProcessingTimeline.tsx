"use client";

import { Climb, JobStage } from "@/lib/types";

const STAGES: Array<{ stage: JobStage; label: string; sub: string }> = [
  { stage: "queued", label: "Queued", sub: "waiting for a worker" },
  { stage: "extracting", label: "Extracting frames", sub: "OpenCV · ~15 fps sample" },
  { stage: "pose", label: "Estimating pose", sub: "13 keypoints per frame" },
  { stage: "analysis", label: "Analyzing technique", sub: "biomechanics + rule engine" },
];

const ORDER: JobStage[] = ["queued", "extracting", "pose", "analysis", "done"];

export default function ProcessingTimeline({ climb }: { climb: Climb }) {
  const currentIdx = ORDER.indexOf(climb.stage);

  return (
    <div className="panel scanning relative overflow-hidden p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-3xl text-ink">In the press</h2>
        <span className="tag text-red">{Math.round(climb.progress * 100)}%</span>
      </div>
      <p className="caption mt-1 text-sm">your topo is being drawn up</p>

      {/* overall bar */}
      <div className="mt-4 h-[3px] w-full bg-line">
        <div
          className="h-full bg-red transition-[width] duration-300"
          style={{ width: `${climb.progress * 100}%` }}
        />
      </div>

      <ol className="mt-8 space-y-0">
        {STAGES.map((s, i) => {
          const state =
            i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
          return (
            <li
              key={s.stage}
              className={`flex items-center gap-4 border-l-2 py-3 pl-5 ${
                state === "active"
                  ? "border-red"
                  : state === "done"
                  ? "border-ink-faint"
                  : "border-line"
              }`}
            >
              <span
                className={`text-xs ${
                  state === "active"
                    ? "pulse-dot text-red"
                    : state === "done"
                    ? "text-ink-dim"
                    : "text-line"
                }`}
              >
                ▲
              </span>
              <div>
                <p
                  className={`display text-lg ${
                    state === "pending" ? "text-ink-faint" : "text-ink"
                  }`}
                >
                  {s.label}
                </p>
                <p className="tag mt-0.5 text-ink-faint">{s.sub}</p>
              </div>
              {state === "done" && (
                <span className="tag ml-auto text-ink-faint">ok</span>
              )}
              {state === "active" && (
                <span className="tag ml-auto text-red">running</span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="caption mt-8 text-sm">
        The pipeline is asynchronous by design — upload → queue → worker →
        poll. This page is the poll.
      </p>
    </div>
  );
}
