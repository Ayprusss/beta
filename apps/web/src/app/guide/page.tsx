"use client";

import Link from "next/link";

/**
 * The film guide — PLAN.md calls filming guidance "a big quality win for
 * one piece of UX": feedback quality is bounded by footage quality.
 */
export default function GuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="tag text-red">appendix a — field notes</p>
      <h1 className="display mt-2 text-5xl text-ink md:text-6xl">
        How to film a climb
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink-dim">
        Pose estimation is only as good as the footage. Five minutes of setup
        buys you dramatically better coaching.
      </p>

      <div className="print-rule mt-6" />

      {/* camera placement diagram */}
      <figure className="panel relative mt-12 overflow-hidden p-8 shadow-[6px_6px_0_rgba(28,25,20,0.08)] md:p-12">
        <svg viewBox="0 0 640 300" className="w-full max-w-2xl">
          {/* wall */}
          <line x1="40" y1="40" x2="600" y2="40" stroke="var(--ink)" strokeWidth="5" />
          <text x="44" y="28" fill="var(--ink-faint)" fontSize="13" fontFamily="monospace">
            WALL
          </text>
          {/* climber */}
          <circle cx="320" cy="62" r="12" fill="var(--ink)" />
          <text x="340" y="68" fill="var(--ink-dim)" fontSize="13" fontFamily="monospace">
            you
          </text>
          {/* good camera: side / 3-4 */}
          <g>
            <rect x="490" y="200" width="26" height="18" fill="var(--moss)" />
            <line x1="503" y1="200" x2="330" y2="74" stroke="var(--moss)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x="524" y="214" fill="var(--moss)" fontSize="13" fontFamily="monospace">
              ¾ angle ✓
            </text>
          </g>
          <g>
            <rect x="96" y="180" width="26" height="18" fill="var(--moss)" />
            <line x1="109" y1="180" x2="310" y2="74" stroke="var(--moss)" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x="40" y="216" fill="var(--moss)" fontSize="13" fontFamily="monospace">
              side ✓
            </text>
          </g>
          {/* bad camera: straight on */}
          <g opacity="0.85">
            <rect x="307" y="248" width="26" height="18" fill="var(--red)" />
            <line x1="320" y1="248" x2="320" y2="80" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="3 5" />
            <text x="342" y="262" fill="var(--red)" fontSize="13" fontFamily="monospace">
              straight-on ✗ (hides hip distance)
            </text>
          </g>
        </svg>
        <figcaption className="caption mt-4 text-sm">
          fig. 3 — camera placement, seen from above
        </figcaption>
      </figure>

      {/* do / don't */}
      <div className="mt-12 grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
        <div className="md:pr-10">
          <h2 className="display text-3xl text-moss">Do</h2>
          <ul className="mt-5 space-y-4 text-ink-dim">
            {[
              ["Lock the camera down", "Tripod, water bottle, chalk bucket — anything static. Stabilization in software still shifts pixels."],
              ["Frame head to toe", "Leave margin above the finish hold and below the start. Cropped ankles = lost foot data."],
              ["Shoot landscape, 30–60 fps", "More horizontal context for the wall, smooth motion for tracking."],
              ["Get the whole attempt", "Start filming before you pull on. The sit-start matters."],
              ["Decent light", "Gym lighting is fine. Avoid filming into a window."],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-3">
                <span className="mt-0.5 text-xs text-moss">▲</span>
                <span>
                  <strong className="font-medium text-ink">{k}.</strong> {v}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:pl-10">
          <h2 className="display text-3xl text-red">Don&apos;t</h2>
          <ul className="mt-5 space-y-4 text-ink-dim">
            {[
              ["Pan or follow the climber", "Every camera move corrupts the wall-frame reference the analysis depends on."],
              ["Film straight-on", "The most common mistake. Depth collapses — hip-to-wall distance becomes invisible."],
              ["Let people walk through frame", "Pose estimation will happily track the wrong human."],
              ["Use timelapse / slow-mo modes", "Non-uniform timestamps break velocity and hesitation analysis."],
              ["Stand too close", "If limbs leave frame mid-move, those frames are dead weight."],
            ].map(([k, v]) => (
              <li key={k} className="flex gap-3">
                <span className="mt-0.5 text-xs text-red">▲</span>
                <span>
                  <strong className="font-medium text-ink">{k}.</strong> {v}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-6">
        <Link
          href="/upload"
          className="inline-flex items-center gap-3 bg-ink px-6 py-3.5 font-medium text-paper transition-colors hover:bg-red-deep"
        >
          Footage ready — upload it <span className="font-mono text-xs">→</span>
        </Link>
        <span className="caption text-sm">
          feedback quality is bounded by footage quality
        </span>
      </div>
    </div>
  );
}
