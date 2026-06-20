"use client";

/**
 * Canvas replay of stored keypoints.
 *
 * Two view modes:
 *   "wire"    — stylised wall background + skeleton (works for demo climbs too)
 *   "overlay" — real video behind a transparent canvas with skeleton on top
 *               (only available when videoUrl is provided)
 *
 * In overlay mode the <video> element is the time source; timeRef follows
 * video.currentTime so the skeleton stays locked to the footage.
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
  /** if provided, enables the overlay mode toggle */
  videoUrl?: string;
}

const css = (name: string) =>
  typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    : "";

const OverlayPlayer = forwardRef<PlayerHandle, Props>(function OverlayPlayer(
  { climb, results, autoPlay = false, compact = false, videoUrl },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(autoPlay);
  const rafRef = useRef(0);
  const modeRef = useRef<"wire" | "overlay">("wire");

  const [playing, setPlaying] = useState(autoPlay);
  const [displayTime, setDisplayTime] = useState(0);
  const [activeFb, setActiveFb] = useState<FeedbackItem | null>(null);
  const [mode, setMode] = useState<"wire" | "overlay">("wire");

  const holds = useMemo(() => generateHolds(climb), [climb]);
  const duration = results.frames.length
    ? results.frames[results.frames.length - 1].t
    : 0;

  useImperativeHandle(ref, () => ({
    seekTo: (t: number, andPlay = true) => {
      const newT = Math.max(0, Math.min(duration, t));
      timeRef.current = newT;
      playingRef.current = andPlay;
      setPlaying(andPlay);
      const v = videoRef.current;
      if (v) {
        v.currentTime = newT;
        if (andPlay) v.play().catch(() => {});
        else v.pause();
      }
    },
  }));

  const frameAt = useCallback(
    (t: number): PoseFrame => {
      const { frames } = results;
      if (!frames.length) return { t, pts: [] };

      // clamp to the detection range — if the climber wasn't in frame yet (start)
      // or has left (end / grabbed the phone), hold at the nearest known pose
      if (t <= frames[0].t) return frames[0];
      if (t >= frames[frames.length - 1].t) return frames[frames.length - 1];

      // binary search on actual frame timestamps — correct even when frames are
      // dropped (no detection) at the start, end, or mid-clip
      let lo = 0, hi = frames.length - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (frames[mid].t <= t) lo = mid;
        else hi = mid - 1;
      }

      const a = frames[lo];
      const b = frames[lo + 1];
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 0;

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
      chalk: css("--ink") || "#1c1914",
      dim: css("--ink-faint") || "#9a917d",
      ember: css("--red") || "#c0301c",
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

      const isOverlay = modeRef.current === "overlay";

      if (isOverlay && videoRef.current) {
        // video is the time source in overlay mode
        timeRef.current = videoRef.current.currentTime;
        if (playingRef.current && timeRef.current >= duration) {
          timeRef.current = compact ? 0 : duration;
          playingRef.current = false;
          setPlaying(false);
          videoRef.current.pause();
          if (compact) videoRef.current.currentTime = 0;
        }
      } else {
        if (playingRef.current) {
          timeRef.current += dt;
          if (timeRef.current >= duration) {
            timeRef.current = compact ? 0 : duration;
            if (!compact) {
              playingRef.current = false;
              setPlaying(false);
            }
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

      // in overlay mode, map [0,1] onto the letterboxed video rectangle so
      // keypoints align with the actual pixels shown by object-contain
      let px: (n: number) => number;
      let py: (n: number) => number;
      if (isOverlay && videoRef.current) {
        const { x0, y0, rw, rh } = containRect(
          videoRef.current.videoWidth,
          videoRef.current.videoHeight,
          w, h
        );
        px = (n) => x0 + n * rw;
        py = (n) => y0 + n * rh;
      } else {
        px = (n) => n * w;
        py = (n) => n * h;
      }

      const s = Math.min(w, h);

      if (isOverlay) {
        // transparent canvas — real video shows through
        ctx.clearRect(0, 0, w, h);
      } else {
        // ── wall ──
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, colors.bg1);
        grad.addColorStop(1, colors.bg0);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

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
      }

      // ── COM trail ──
      const frame = frameAt(t);
      const trailColor = isOverlay ? "rgba(255,80,60,0.7)" : colors.ember;
      ctx.strokeStyle = trailColor;
      ctx.globalAlpha = isOverlay ? 0.75 : 0.5;
      ctx.setLineDash([s * 0.012, s * 0.009]);
      ctx.lineWidth = Math.max(1.5, s * (isOverlay ? 0.005 : 0.003));
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
      const boneColor = isOverlay ? "rgba(255,255,255,0.9)" : colors.chalk;
      const jointFill = isOverlay ? "rgba(255,255,255,0.85)" : colors.chalk;
      const endFill = isOverlay ? "rgba(255,100,80,0.95)" : colors.emberHot;

      ctx.lineWidth = Math.max(1.5, s * (isOverlay ? 0.007 : 0.006));
      ctx.lineCap = "round";

      // bones — skip or fade based on endpoint confidence (c field = visibility score)
      for (const [a, b] of BONES) {
        const conf = Math.min(frame.pts[a].c, frame.pts[b].c);
        if (conf < 0.15) continue; // both endpoints lost — skip entirely
        ctx.globalAlpha = Math.max(0.25, conf);
        ctx.strokeStyle = boneColor;
        ctx.beginPath();
        ctx.moveTo(px(frame.pts[a].x), py(frame.pts[a].y));
        ctx.lineTo(px(frame.pts[b].x), py(frame.pts[b].y));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // head — fade with head landmark confidence
      const headConf = frame.pts[J.head].c;
      if (headConf >= 0.15) {
        ctx.globalAlpha = Math.max(0.25, headConf);
        ctx.strokeStyle = boneColor;
        ctx.beginPath();
        ctx.arc(px(frame.pts[J.head].x), py(frame.pts[J.head].y - 0.012), s * 0.016, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // joints — fade each independently
      for (let i = 0; i < frame.pts.length; i++) {
        const p = frame.pts[i];
        if (p.c < 0.15) continue;
        const isEnd = [J.l_wrist, J.r_wrist, J.l_ankle, J.r_ankle].includes(i);
        ctx.globalAlpha = Math.max(0.25, p.c);
        ctx.fillStyle = isEnd ? endFill : jointFill;
        const r = isEnd ? s * 0.008 : s * 0.005;
        ctx.fillRect(px(p.x) - r, py(p.y) - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;

      // COM marker
      const com = comOf(frame);
      ctx.fillStyle = isOverlay ? "rgba(255,80,60,0.9)" : colors.ember;
      ctx.beginPath();
      ctx.arc(px(com.x), py(com.y), s * (isOverlay ? 0.011 : 0.009), 0, Math.PI * 2);
      ctx.fill();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [climb, results, holds, duration, frameAt, compact]);

  const toggle = () => {
    const v = videoRef.current;
    if (!playingRef.current && timeRef.current >= duration) timeRef.current = 0;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
    if (v) {
      if (playingRef.current) {
        v.currentTime = timeRef.current;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  };

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = k * duration;
    timeRef.current = t;
    setDisplayTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const switchMode = (m: "wire" | "overlay") => {
    const v = videoRef.current;
    modeRef.current = m;
    setMode(m);
    if (!v) return;
    if (m === "overlay") {
      v.currentTime = timeRef.current;
      if (playingRef.current) v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={wrapRef} className={`relative min-h-0 flex-1 overflow-hidden${mode === "overlay" ? " bg-black" : ""}`}>
        {/* video layer — sits behind the canvas in overlay mode */}
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            className={`absolute inset-0 h-full w-full object-contain${mode !== "overlay" ? " hidden" : ""}`}
            muted
            playsInline
            preload="metadata"
          />
        )}
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {/* live coaching annotation */}
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
        <div className="flex items-center gap-3 border-t hairline bg-card px-4 py-3">
          {/* view mode toggle — only shown for real climbs with a video */}
          {videoUrl && (
            <div className="flex shrink-0 overflow-hidden border hairline">
              <button
                onClick={() => switchMode("wire")}
                className={`tag px-2 py-1 text-xs transition-colors ${
                  mode === "wire" ? "bg-ink text-paper" : "text-ink-dim hover:text-ink"
                }`}
              >
                wire
              </button>
              <button
                onClick={() => switchMode("overlay")}
                className={`tag border-l hairline px-2 py-1 text-xs transition-colors ${
                  mode === "overlay" ? "bg-ink text-paper" : "text-ink-dim hover:text-ink"
                }`}
              >
                overlay
              </button>
            </div>
          )}

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
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-line" />
            <div
              className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-red"
              style={{ width: `${(displayTime / (duration || 1)) * 100}%` }}
            />
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

function containRect(vw: number, vh: number, cw: number, ch: number) {
  if (vw === 0 || vh === 0) return { x0: 0, y0: 0, rw: cw, rh: ch };
  const scale = Math.min(cw / vw, ch / vh);
  const rw = vw * scale;
  const rh = vh * scale;
  return { x0: (cw - rw) / 2, y0: (ch - rh) / 2, rw, rh };
}

function comOf(frame: PoseFrame) {
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
