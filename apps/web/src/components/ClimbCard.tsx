"use client";

import Link from "next/link";
import { Climb } from "@/lib/types";
import WallThumb from "./WallThumb";

function relDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ClimbCard({ climb, index }: { climb: Climb; index: number }) {
  return (
    <Link
      href={`/climbs/${climb.id}`}
      className="rise group block border hairline bg-card shadow-[3px_3px_0_rgba(28,25,20,0.07)] transition-all hover:border-red/60 hover:shadow-[4px_4px_0_rgba(192,48,28,0.15)]"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b hairline">
        <WallThumb climb={climb} />
        <span className="display absolute left-3 top-2 text-3xl text-red">
          {climb.grade}
        </span>
        {climb.status === "processing" && (
          <span className="tag absolute bottom-2 right-3 flex items-center gap-2 text-red">
            <span className="pulse-dot block text-[9px]">▲</span>
            processing {Math.round(climb.progress * 100)}%
          </span>
        )}
        {climb.isDemo && (
          <span className="caption absolute bottom-1.5 right-3 text-sm">
            sample plate
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 px-4 py-3">
        <h3 className="display truncate text-lg text-ink group-hover:text-red-deep">
          {climb.title}
        </h3>
        <span className="tag shrink-0 text-ink-faint">{relDate(climb.createdAt)}</span>
      </div>
    </Link>
  );
}
