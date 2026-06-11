"use client";

/**
 * Canvas replay of stored keypoints — PLAN.md's "canvas overlay, not a
 * re-encoded video". Today it draws a stylized wall (mock data has no
 * real footage); when the real API lands, the same draw loop renders on
 * top of a <video> element and the wall painter is dropped.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import { BONES, Climb, ClimbResults, FeedbackItem, Hold, J, PoseFrame } from "@/lib/types";
import { formatTime, generateHolds, rng } from "@/lib/synth";

export interface PlayerHandle {
  seekTo: (t: number, andPlay?: boolean) => void;
}

interface Props {
  climb: Climb;
  results: ClimbResults;
  autoPlay?: boolean;
  /** hides controls + shrinks chrome (landing hero) */
  compact?: boolean;
}

const css = (name: string) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    : "";

const OverlayPlayer = forwardRef<PlayerHandle, Props>(function OverlayPlayer(
  { climb, results, autoPlay = false, compact = false },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(autoPlay);
  const rafRef = useRef(0);

  const [playing, setPlaying] = useState(autoPlay);
  const [displayTime, setDisplayTime] = useState(0);
  const [activeFb, setActiveFb] = useState<FeedbackItem | null>(null);

  const holds = useMemo(() => generateHolds(climb), [climb]);
  const duration = results.frames.length
    ? results.frames[results.frames.length - 1].t
    : 0;

  useImperativeHandle(ref, () => ({
    seekTo: (t: number, andPlay = true) => {
      timeRef.current = Math.max(0, Math.min(duration, t));
      playingRef.current = andPlay;
      setPlaying(andPlay);
    },
  }));

  const frameAt = useCallback(
    (t: number): PoseFrame => {
      const { frames, fps } = results;
      const idx = Math.min(frames.length - 1, Math.max(0, Math.floor(t * fps)));
      const a = frames[idx];
      const b = frames[Math.min(frames.length - 1, idx + 1)];
      const k = Math.min(1, Math.max(0, (t - a.t) * fps));
      return {
        t,
        pts: a.pts.map((p, i) => ({
          x: p.x + (b.pts[i].x - p.x) * k,
          y: p.y + (b.pts[i].y - p.y) * k,
          c: p.c,
        })),
      };
    },
    [results]
  );

  // main RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = {
      bg0: css("--paper-deep") || "#ebe3cf",
      bg1: css("--card") || "#faf7ee",
      line: css("--line") || "#d9d0b8",
      chalk: css("--ink") || "#1c1914", // skeleton ink
      dim: css("--ink-faint") || "#9a917d",
      ember: css("--red") || "#c0301c", // route + COM markings
      emberHot: css("--red-deep") || "#8f2212",
    };

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
    });
    ro.observe(wrap);

    let last = performance.now();
    let uiTick = 0;

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const dt = (now - last) / 1000;
      last = now;

      if (playingRef.current) {
        timeRef.current += dt;
        if (timeRef.current >= duration) {
          timeRef.current = compact ? 0 : duration; // hero loops, results page stops
          if (!compact) {
            playingRef.current = false;
            setPlaying(false);
          }
        }
      }
      const t = timeRef.current;

      // throttle React state updates to ~8/s
      if (now - uiTick > 120) {
        uiTick = now;
        setDisplayTime(t);
        setActiveFb(
          results.feedback.find((f) => t >= f.startSec && t <= f.endSec) ?? null
        );
      }

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;
      const px = (n: number) => n * w;
      const py = (n: number) => n * h;
      const s = Math.min(w, h); // scale unit for strokes

      // ── wall ──
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, colors.bg1);
      grad.addColorStop(1, colors.bg0);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // plywood panel seams
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = Math.max(1, s * 0.002);
      const seamR = rng(climb.seed * 3 + 1);
      for (let i = 0; i < 3; i++) {
        const x = px(0.18 + seamR() * 0.64);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      // t-nut grid
      ctx.fillStyle = colors.line;
      for (let gx = 0.05; gx < 1; gx += 0.075) {
        for (let gy = 0.04; gy < 1; gy += 0.075) {
          ctx.beginPath();
          ctx.arc(px(gx), py(gy), s * 0.0035, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── holds ──
      for (const hold of holds) {
        drawHold(ctx, hold, px, py, s, hold.onRoute ? colors.ember : colors.dim, hold.onRoute);
      }

      // ── COM trail — drawn like the dashed route line on a printed topo ──
      const frame = frameAt(t);
      ctx.strokeStyle = colors.ember;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([s * 0.012, s * 0.009]);
      ctx.lineWidth = Math.max(1, s * 0.003);
      ctx.beginPath();
      const step = Math.max(1, Math.floor(results.fps / 5));
      let started = false;
      for (let i = 0; i < results.frames.length; i += step) {
        const fr = results.frames[i];
        if (fr.t > t) break;
        const c = comOf(fr);
        if (!started) {
          ctx.moveTo(px(c.x), py(c.y));
          started = true;
        } else {
          ctx.lineTo(px(c.x), py(c.y));
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // ── skeleton ──
      ctx.lineWidth = Math.max(1.5, s * 0.006);
      ctx.lineCap = "round";
      ctx.strokeStyle = colors.chalk;
      for (const [a, b] of BONES) {
        ctx.beginPath();
        ctx.moveTo(px(frame.pts[a].x), py(frame.pts[a].y));
        ctx.lineTo(px(frame.pts[b].x), py(frame.pts[b].y));
        ctx.stroke();
      }
      // head
      ctx.beginPath();
      ctx.arc(px(frame.pts[J.head].x), py(frame.pts[J.head].y - 0.012), s * 0.016, 0, Math.PI * 2);
      ctx.stroke();

      // joints
      for (let i = 0; i < frame.pts.length; i++) {
        const p = frame.pts[i];
        const isEnd = [J.l_wrist, J.r_wrist, J.l_ankle, J.r_ankle].includes(i);
        ctx.fillStyle = isEnd ? colors.emberHot : colors.chalk;
        const r = isEnd ? s * 0.008 : s * 0.005;
        ctx.fillRect(px(p.x) - r, py(p.y) - r, r * 2, r * 2);
      }

      // COM marker
      const com = comOf(frame);
      ctx.fillStyle = colors.ember;
      ctx.beginPath();
      ctx.arc(px(com.x), py(com.y), s * 0.009, 0, Math.PI * 2);
      ctx.fill();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [climb, results, holds, duration, frameAt, compact]);

  const toggle = () => {
    if (!playingRef.current && timeRef.current >= duration) timeRef.current = 0;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    timeRef.current = k * duration;
    setDisplayTime(timeRef.current);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* live coaching annotation — a margin note stamped on the plate */}
        {activeFb && (
          <div className="absolute left-3 top-3 max-w-[80%] border border-red/60 bg-card/90 px-3 py-2 backdrop-blur-sm">
            <p className="tag text-red">▲ {activeFb.rule.replace(/_/g, " ")}</p>
            {!compact && (
              <p className="caption mt-1 text-xs leading-snug">{activeFb.title}</p>
            )}
          </div>
        )}
        {compact && (
          <div className="tag absolute bottom-3 right-3 text-ink-faint">
            keypoint replay · {formatTime(displayTime)}
          </div>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-4 border-t hairline bg-card px-4 py-3">
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-red"
          >
            {playing ? (
              <span className="flex gap-[3px]">
                <span className="block h-3 w-[3px] bg-current" />
                <span className="block h-3 w-[3px] bg-current" />
              </span>
            ) : (
              <span className="ml-0.5 block border-y-[6px] border-l-[9px] border-y-transparent border-l-current" />
            )}
          </button>

          <div
            className="group relative h-8 flex-1 cursor-pointer"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && scrub(e)}
          >
            {/* track */}
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-line" />
            {/* progress */}
            <div
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-red"
              style={{ width: `${(displayTime / (duration || 1)) * 100}%` }}
            />
            {/* feedback markers */}
            {results.feedback.map((f) => (
              <div
                key={f.id}
                title={f.title}
                className={`absolute top-1/2 h-3 w-[3px] -translate-y-1/2 ${
                  f.severity === "major" ? "bg-red-deep" : f.severity === "warn" ? "bg-ochre" : "bg-ink-faint"
                }`}
                style={{ left: `${(f.startSec / (duration || 1)) * 100}%` }}
              />
            ))}
            {/* playhead */}
            <div
              className="absolute top-1/2 h-4 w-[2px] -translate-y-1/2 bg-ink"
              style={{ left: `${(displayTime / (duration || 1)) * 100}%` }}
            />
          </div>

          <span className="tag w-28 shrink-0 text-right text-ink-dim">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
});

function comOf(frame: PoseFrame) {
  // hips weighted heavier than shoulders — crude segment-mass weighting
  const x =
    (frame.pts[J.l_hip].x + frame.pts[J.r_hip].x) * 0.3 +
    (frame.pts[J.l_shoulder].x + frame.pts[J.r_shoulder].x) * 0.2;
  const y =
    (frame.pts[J.l_hip].y + frame.pts[J.r_hip].y) * 0.3 +
    (frame.pts[J.l_shoulder].y + frame.pts[J.r_shoulder].y) * 0.2;
  return { x, y };
}

function drawHold(
  ctx: CanvasRenderingContext2D,
  hold: Hold,
  px: (n: number) => number,
  py: (n: number) => number,
  s: number,
  color: string,
  onRoute: boolean
) {
  ctx.save();
  ctx.translate(px(hold.x), py(hold.y));
  ctx.rotate(hold.rot);
  ctx.globalAlpha = onRoute ? 0.9 : 0.28;
  const r = hold.r * s * 1.6;

  if (onRoute) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, s * 0.0025);
    ctx.fillStyle = "transparent";
  } else {
    ctx.fillStyle = color;
  }

  ctx.beginPath();
  if (hold.kind === 0) {
    ctx.ellipse(0, 0, r, r * 0.72, 0, 0, Math.PI * 2);
  } else if (hold.kind === 1) {
    ctx.rect(-r, -r * 0.3, r * 2, r * 0.6);
  } else {
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.closePath();
  }
  if (onRoute) ctx.stroke();
  else ctx.fill();
  ctx.restore();
}

export default OverlayPlayer;
