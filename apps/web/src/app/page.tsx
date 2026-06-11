"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/mockApi";
import { Climb, ClimbResults } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import GoogleButton from "@/components/GoogleButton";
import OverlayPlayer from "@/components/OverlayPlayer";

export default function Landing() {
  const { user } = useAuth();
  const [demo, setDemo] = useState<{ climb: Climb; results: ClimbResults } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const climb = await api.getClimb("demo-cave");
      if (!climb) return;
      const results = await api.getResults(climb.id);
      if (alive && results) setDemo({ climb, results });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="overflow-x-clip">
      {/* ── hero / the cover ── */}
      <section className="contours relative">
        <div className="mx-auto grid max-w-6xl items-start gap-14 px-5 pb-24 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pt-20">
          <div>
            <p className="tag rise text-red" style={{ animationDelay: "0ms" }}>
              a climber&apos;s guidebook to their own movement
            </p>
            <h1
              className="display rise mt-6 text-6xl text-ink sm:text-7xl md:text-[5.4rem]"
              style={{ animationDelay: "90ms" }}
            >
              Every attempt,
              <br />
              <em className="font-light text-red">annotated.</em>
            </h1>
            <p
              className="rise mt-7 max-w-md text-lg leading-relaxed text-ink-dim"
              style={{ animationDelay: "180ms" }}
            >
              Film your boulder and upload it. Beta traces your body through
              every frame and hands back a marked-up topo of the climb —
              where your hips drifted, where your arms stayed bent, where you
              hesitated below the crux.
            </p>
            <div
              id="start"
              className="rise mt-9 flex flex-wrap items-center gap-6"
              style={{ animationDelay: "270ms" }}
            >
              {user ? (
                <Link
                  href="/climbs"
                  className="inline-flex items-center gap-3 bg-ink px-6 py-3.5 font-medium text-paper transition-colors hover:bg-red-deep"
                >
                  Your climbs <span className="font-mono text-xs">→</span>
                </Link>
              ) : (
                <GoogleButton />
              )}
              <Link
                href="/climbs/demo-cave"
                className="caption border-b border-ink-faint pb-0.5 text-base transition-colors hover:border-red hover:text-red"
              >
                or leaf through a sample plate →
              </Link>
            </div>

            {/* contents line, like a cover's front matter */}
            <div
              className="rise mt-16 max-w-md border-t border-ink/60 pt-4"
              style={{ animationDelay: "360ms" }}
            >
              <p className="tag text-ink-faint">in this volume</p>
              <p className="caption mt-2 text-base leading-relaxed">
                I. Technique feedback &nbsp;·&nbsp; II. Hold &amp; route
                detection&thinsp;* &nbsp;·&nbsp; III. Beta generation&thinsp;*
              </p>
              <p className="tag mt-2 text-ink-faint">* forthcoming</p>
            </div>
          </div>

          {/* plate I — live replay */}
          <figure className="rise md:mt-2" style={{ animationDelay: "300ms" }}>
            <div className="print-rule" />
            <div className="relative mt-3 aspect-[3/4] max-h-[540px] w-full border border-ink/70 bg-card p-2 shadow-[6px_6px_0_rgba(28,25,20,0.08)]">
              <div className="relative h-full w-full overflow-hidden border hairline">
                {demo ? (
                  <OverlayPlayer
                    climb={demo.climb}
                    results={demo.results}
                    autoPlay
                    compact
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-paper-deep">
                    <span className="tag text-ink-faint">inking the plate…</span>
                  </div>
                )}
              </div>
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between">
              <span className="caption text-sm">
                Plate I — skeleton replay from stored keypoints
              </span>
              <span className="tag text-ink-faint">fig. 1</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── legend — how to read the plates ── */}
      <div className="border-y border-ink/50 bg-paper-deep">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-10 gap-y-2 px-5 py-3">
          <span className="tag text-ink-dim">legend</span>
          {[
            ["—", "skeleton, traced in ink"],
            ["– –", "center of mass (route line)"],
            ["○", "holds on route"],
            ["▲", "margin note"],
          ].map(([sym, label]) => (
            <span key={label} className="flex items-baseline gap-2.5">
              <span className="font-mono text-sm text-red">{sym}</span>
              <span className="caption text-sm">{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── how to read this book ── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <p className="tag text-red">how to read this book</p>
        <h2 className="display mt-3 text-4xl text-ink md:text-5xl">
          Three moves, in order
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
          {[
            {
              n: "1",
              title: "Film it",
              body: "Static camera, full body in frame, side or ¾ angle. Thirty seconds of footage is plenty — the film guide shows the setup.",
            },
            {
              n: "2",
              title: "Upload it",
              body: "Your video goes straight to storage and lands in the processing queue. Pose estimation runs on every frame — about a minute.",
            },
            {
              n: "3",
              title: "Read the beta",
              body: "A replay of your climb traced in ink, plus timestamped margin notes: bent arms, hips off the wall, hesitation below the crux.",
            },
          ].map((s) => (
            <div key={s.n} className="md:px-8 md:first:pl-0 md:last:pr-0">
              <span className="display text-6xl font-light italic text-red">
                {s.n}
              </span>
              <h3 className="display mt-3 text-2xl text-ink">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-dim">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── the volumes ── */}
      <section className="border-t hairline bg-card/70">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <p className="tag text-red">the volumes</p>
          <h2 className="display mt-3 text-4xl text-ink md:text-5xl">
            Published in three parts
          </h2>
          <div className="mt-12 divide-y divide-line border-y hairline">
            {[
              {
                v: "Vol. I",
                title: "Technique feedback",
                status: "in print",
                live: true,
                body: "Pose → biomechanics → timestamped coaching. The volume you're holding.",
              },
              {
                v: "Vol. II",
                title: "Hold & route detection",
                status: "at the printers",
                live: false,
                body: "Photograph a wall, get every hold detected and tagged into routes.",
              },
              {
                v: "Vol. III",
                title: "Beta generation",
                status: "being written",
                live: false,
                body: "Given a route and your wingspan, predict the move sequence before you pull on.",
              },
            ].map((p) => (
              <div
                key={p.v}
                className="flex flex-col gap-2 py-6 md:flex-row md:items-baseline md:gap-8"
              >
                <span
                  className={`caption w-16 shrink-0 text-lg ${
                    p.live ? "text-red" : ""
                  }`}
                >
                  {p.v}
                </span>
                <h3 className="display w-72 text-2xl text-ink">{p.title}</h3>
                <p className="flex-1 text-sm text-ink-dim">{p.body}</p>
                <span className={`tag ${p.live ? "text-red" : "text-ink-faint"}`}>
                  {p.live && (
                    <span className="pulse-dot mr-2 inline-block text-[9px]">▲</span>
                  )}
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── honesty — the editor's note ── */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <div className="max-w-2xl border-l-2 border-red pl-8">
          <p className="tag text-red">editor&apos;s note</p>
          <p className="display mt-4 text-2xl leading-snug text-ink md:text-3xl">
            A single camera cannot measure force.
          </p>
          <p className="mt-4 leading-relaxed text-ink-dim">
            Beta estimates load geometrically, from your center of mass and
            points of contact with the wall. Wherever a figure is an estimate
            rather than a measurement, it is labeled as one.
          </p>
        </div>
      </section>

      {/* ── colophon ── */}
      <footer className="border-t border-ink/50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-4 px-5 py-8">
          <span className="display text-xl text-ink">
            Beta<span className="text-red">.</span>
          </span>
          <p className="caption text-sm">
            Set in Fraunces &amp; Karla · climb hard, film steady · v0.1, mock
            data edition
          </p>
        </div>
      </footer>
    </div>
  );
}
