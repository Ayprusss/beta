"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/mockApi";
import { Climb, ClimbResults, FeedbackItem } from "@/lib/types";
import Protected from "@/components/Protected";
import ProcessingTimeline from "@/components/ProcessingTimeline";
import OverlayPlayer, { PlayerHandle } from "@/components/OverlayPlayer";
import FeedbackPanel from "@/components/FeedbackPanel";

export default function ClimbPage() {
  const { id } = useParams<{ id: string }>();
  const [climb, setClimb] = useState<Climb | null | undefined>(undefined);
  const [results, setResults] = useState<ClimbResults | null>(null);
  const [activeFb, setActiveFb] = useState<string | null>(null);
  const playerRef = useRef<PlayerHandle>(null);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const c = await api.getClimb(id);
      if (!alive) return;
      setClimb(c);
      if (c?.status === "done") {
        const r = await api.getResults(id);
        if (alive) setResults(r);
      }
    };
    refresh();
    const unsub = api.subscribe(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, [id]);

  const jump = (f: FeedbackItem) => {
    setActiveFb(f.id);
    playerRef.current?.seekTo(Math.max(0, f.startSec - 0.5));
  };

  if (climb === undefined) {
    return <p className="tag mx-auto max-w-6xl px-5 py-16 text-ink-faint">loading…</p>;
  }

  if (climb === null) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-24 text-center">
        <p className="display text-5xl text-ink">Off route</p>
        <p className="caption mt-3">no page in this book by that number</p>
        <Link href="/climbs" className="tag mt-6 inline-block text-red">
          ← back to the logbook
        </Link>
      </div>
    );
  }

  return (
    <Protected allow={!!climb.isDemo}>
      <div className="mx-auto max-w-6xl px-5 py-12">
        {/* header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/climbs"
              className="tag text-ink-faint transition-colors hover:text-ink"
            >
              ← the logbook
            </Link>
            <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
              {climb.title}
            </h1>
            <div className="mt-3 flex items-center gap-4">
              <span className="display border border-red px-2.5 py-0.5 text-xl text-red">
                {climb.grade}
              </span>
              <span className="tag text-ink-faint">
                {new Date(climb.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {climb.durationSec}s attempt
              </span>
              {climb.isDemo && <span className="caption text-sm">sample plate</span>}
            </div>
          </div>
          {results && (
            <span className="tag text-ink-faint">
              model {results.modelVersion} · {results.frames.length} frames @ {results.fps} fps
            </span>
          )}
        </div>

        <div className="print-rule mt-6" />

        {/* body */}
        {climb.status === "processing" ? (
          <div className="mx-auto mt-12 max-w-2xl">
            <ProcessingTimeline climb={climb} />
          </div>
        ) : climb.status === "failed" ? (
          <div className="panel mt-12 border-red/50 p-10 text-center">
            <p className="display text-3xl text-red">Processing failed</p>
            <p className="mt-2 text-ink-dim">
              Re-upload the clip — and check the film guide.
            </p>
          </div>
        ) : results ? (
          <>
            {/* stats — a printed data table */}
            <div className="mt-10 grid grid-cols-2 divide-x divide-line border hairline bg-card md:grid-cols-4">
              {[
                { k: "moves", v: results.stats.moves, est: false },
                { k: "time static", v: `${results.stats.pauseSec}s`, est: false },
                { k: "bent-arm time", v: `${results.stats.bentArmPct}%`, est: true },
                { k: "fluidity", v: `${results.stats.fluidity}/100`, est: true },
              ].map((s) => (
                <div key={s.k} className="px-5 py-4">
                  <p className="tag text-ink-faint">
                    {s.k}
                    {s.est && <span className="ml-1 text-ochre">est.</span>}
                  </p>
                  <p className="display mt-1 text-3xl text-ink">{s.v}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px]">
              {/* the plate */}
              <figure>
                <div className="flex h-[520px] flex-col border border-ink/70 bg-card p-2 shadow-[6px_6px_0_rgba(28,25,20,0.08)] lg:h-[640px]">
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden border hairline">
                    <OverlayPlayer ref={playerRef} climb={climb} results={results} />
                  </div>
                </div>
                <figcaption className="caption mt-2 flex justify-between text-sm">
                  <span>Plate — your line, traced in ink</span>
                  <span className="tag text-ink-faint">fig. 2</span>
                </figcaption>
              </figure>

              {/* margin notes */}
              <div>
                <div className="flex items-baseline justify-between">
                  <h2 className="display text-2xl text-ink">
                    Margin notes{" "}
                    <span className="text-red">({results.feedback.length})</span>
                  </h2>
                  <span className="tag text-ink-faint">click to replay</span>
                </div>
                <div className="mt-4">
                  <FeedbackPanel
                    items={results.feedback}
                    activeId={activeFb}
                    onJump={jump}
                  />
                </div>
                <p className="caption mt-6 text-sm leading-relaxed">
                  Notes are written from cached keypoints — the coaching
                  improves without reprocessing your video.
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="tag mt-16 text-ink-faint">loading results…</p>
        )}
      </div>
    </Protected>
  );
}
