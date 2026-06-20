"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Climb } from "@/lib/types";
import Protected from "@/components/Protected";
import ClimbCard from "@/components/ClimbCard";

export default function ClimbsPage() {
  const [climbs, setClimbs] = useState<Climb[] | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      api.listClimbs().then((c) => alive && setClimbs(c));
    };
    refresh();
    const unsub = api.subscribe(refresh);
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  return (
    <Protected>
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="tag text-red">the logbook</p>
            <h1 className="display mt-2 text-5xl text-ink">Your climbs</h1>
            <p className="caption mt-2">every attempt, filed in order</p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-3 bg-ink px-5 py-3 font-medium text-paper transition-colors hover:bg-red-deep"
          >
            Upload a climb <span className="font-mono text-xs">+</span>
          </Link>
        </div>

        <div className="print-rule mt-6" />

        {climbs === null ? (
          <p className="tag mt-16 text-ink-faint">loadingâ€¦</p>
        ) : climbs.length === 0 ? (
          <div className="panel mt-12 p-12 text-center">
            <p className="display text-3xl text-ink">Blank pages</p>
            <p className="mt-2 text-ink-dim">
              Upload your first climb and its plate shows up here.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {climbs.map((c, i) => (
              <ClimbCard key={c.id} climb={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </Protected>
  );
}
