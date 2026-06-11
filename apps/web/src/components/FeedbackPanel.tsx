"use client";

import { FeedbackItem, Severity } from "@/lib/types";
import { formatTime } from "@/lib/synth";

const SEV_STYLE: Record<Severity, { chip: string; label: string }> = {
  major: { chip: "bg-red text-paper", label: "fix this" },
  warn: { chip: "bg-ochre text-paper", label: "watch" },
  info: { chip: "border border-line text-ink-dim", label: "note" },
};

export default function FeedbackPanel({
  items,
  activeId,
  onJump,
}: {
  items: FeedbackItem[];
  activeId?: string | null;
  onJump: (item: FeedbackItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="panel p-6">
        <p className="text-ink-dim">
          Clean climb — no rules fired. Either you crushed it, or we need
          better rules.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((f, i) => {
        const sev = SEV_STYLE[f.severity];
        const active = f.id === activeId;
        return (
          <li key={f.id}>
            <button
              onClick={() => onJump(f)}
              className={`group block w-full border p-4 text-left transition-colors ${
                active
                  ? "border-red bg-card"
                  : "hairline bg-card hover:border-ink-faint"
              }`}
            >
              <div className="flex items-baseline gap-3">
                <span className="caption text-sm">
                  {String(i + 1).padStart(2, "0")}.
                </span>
                <span className={`tag shrink-0 px-1.5 py-0.5 ${sev.chip}`}>
                  {sev.label}
                </span>
                <span className="tag ml-auto shrink-0 text-red transition-colors group-hover:text-red-deep">
                  {formatTime(f.startSec)}–{formatTime(f.endSec)} ▸
                </span>
              </div>
              <h3 className="display mt-2 text-xl text-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">
                {f.detail}
              </p>
              {f.estimated && (
                <p className="caption mt-2 text-xs">
                  * geometric estimate — a single camera cannot measure force
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
