"use client";

import { useEffect, useRef } from "react";
import { Climb } from "@/lib/types";
import { generateHolds } from "@/lib/synth";

/** Static mini render of a climb's wall — used as the card thumbnail. */
export default function WallThumb({ climb }: { climb: Climb }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = canvas.clientHeight * dpr);
    const s = Math.min(w, h);

    ctx.fillStyle = "#ebe3cf";
    ctx.fillRect(0, 0, w, h);

    for (const hold of generateHolds(climb)) {
      ctx.save();
      ctx.translate(hold.x * w, hold.y * h);
      ctx.rotate(hold.rot);
      const r = hold.r * s * 1.5;
      if (hold.onRoute) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "#c0301c";
        ctx.lineWidth = Math.max(1, s * 0.004);
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#9a917d";
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }, [climb]);

  return <canvas ref={ref} className="h-full w-full" />;
}
