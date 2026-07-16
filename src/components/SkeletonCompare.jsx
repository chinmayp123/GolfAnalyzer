import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Film } from "lucide-react";
import { SWING_PHASES } from "../lib/constants.js";
import { detectSwingPhases } from "../lib/phaseDetection.js";
import { normalizeFullSwingFrames, lerpPose, drawFigure } from "../lib/poseDrawing.js";

// ─── Side-by-side animated skeleton playback: user vs pro ───
// Playback is PHASE-ALIGNED: one shared progress value 0..1 is split into
// equal segments between phase anchors (address → top → downswing → impact →
// finish), and each side interpolates within its OWN real timing for that
// segment. Both skeletons hit address, impact, and finish at the same moment
// even if one swing (or clip) is much longer than the other.

const USER_COLOR = "#5cbc7f";
const BASE_CYCLE_MS = 2600;
const SPEEDS = [0.25, 0.5, 1];

function poseAtProgress(frames, progress) {
  if (!frames || frames.length === 0) return null;
  if (frames.length === 1) return frames[0].pose;
  const frameIndex = progress * (frames.length - 1);
  const i = Math.floor(frameIndex);
  const frac = frameIndex - i;
  const a = frames[Math.min(i, frames.length - 1)];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  return frac > 0 ? lerpPose(a.pose, b.pose, frac) : a.pose;
}

function poseAtTime(frames, t) {
  if (!frames || frames.length === 0) return null;
  if (t <= frames[0].time) return frames[0].pose;
  if (t >= frames[frames.length - 1].time) return frames[frames.length - 1].pose;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].time <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const span = b.time - a.time || 1e-3;
  return lerpPose(a.pose, b.pose, (t - a.time) / span);
}

// Ordered, valid phase-anchor times for one side, or null if not enough info
function buildAnchors(phaseTimes) {
  if (!phaseTimes) return null;
  const anchors = SWING_PHASES.map((p) => phaseTimes[p]).filter(
    (t) => typeof t === "number" && !isNaN(t)
  );
  if (anchors.length < 3) return null;
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i] <= anchors[i - 1]) return null; // must be strictly ordered
  }
  return anchors;
}

// Build one side's playback plan: frames clipped to the swing (so the
// normalization bounding box isn't polluted by idle footage) + anchors.
function buildPlan(frames, phaseTimes) {
  if (!frames || frames.length < 2) return null;
  const anchors = buildAnchors(phaseTimes);
  let clipped = frames;
  if (anchors) {
    const start = anchors[0] - 0.25;
    const end = anchors[anchors.length - 1] + 0.35;
    const inWindow = frames.filter((f) => f.time >= start && f.time <= end);
    if (inWindow.length >= 2) clipped = inWindow;
  }
  return { frames: normalizeFullSwingFrames(clipped), anchors };
}

function poseForPlan(plan, progress) {
  if (!plan) return null;
  if (!plan.anchors) return poseAtProgress(plan.frames, progress);
  const anchors = plan.anchors;
  const nSeg = anchors.length - 1;
  const x = Math.min(progress, 0.9999) * nSeg;
  const seg = Math.min(Math.floor(x), nSeg - 1);
  const frac = x - seg;
  const t = anchors[seg] + frac * (anchors[seg + 1] - anchors[seg]);
  return poseAtTime(plan.frames, t);
}

export default function SkeletonCompare({ userFrames, userPhaseTimes, proProfile }) {
  const userCanvasRef = useRef(null);
  const proCanvasRef = useRef(null);
  const animRef = useRef(null);
  const lastTsRef = useRef(null);
  const speedRef = useRef(1);

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const proFrames = proProfile?.fullSwingFrames;

  const userPlan = useMemo(
    () => buildPlan(userFrames, userPhaseTimes),
    [userFrames, userPhaseTimes]
  );
  const proPlan = useMemo(() => {
    if (!proFrames || proFrames.length < 2) return null;
    // Newer profiles store phase times; for older ones, find them on the fly.
    let times = proProfile?.phaseTimes || null;
    if (!buildAnchors(times)) {
      const d = detectSwingPhases(proFrames);
      if (d) {
        times = {};
        SWING_PHASES.forEach((p) => {
          if (d[p]) times[p] = d[p].time;
        });
      }
    }
    return buildPlan(proFrames, times);
  }, [proFrames, proProfile?.phaseTimes]);

  const userNorm = userPlan?.frames || null;
  const proNorm = proPlan?.frames || null;

  // Draw both figures whenever progress changes
  useEffect(() => {
    if (userCanvasRef.current && userPlan) {
      drawFigure(userCanvasRef.current, poseForPlan(userPlan, progress), { color: USER_COLOR });
    }
    if (proCanvasRef.current && proPlan) {
      drawFigure(proCanvasRef.current, poseForPlan(proPlan, progress), {
        color: proProfile?.color || "#d8b25c",
      });
    }
  }, [progress, userPlan, proPlan, proProfile?.color]);

  // Playback loop
  useEffect(() => {
    if (!playing || (!userNorm && !proNorm)) return;
    lastTsRef.current = null;
    const tick = (ts) => {
      if (lastTsRef.current !== null) {
        const delta = ((ts - lastTsRef.current) * speedRef.current) / BASE_CYCLE_MS;
        setProgress((p) => (p + delta) % 1);
      }
      lastTsRef.current = ts;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, userNorm, proNorm]);

  if (!proNorm) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <Film size={18} className="text-ink-500 shrink-0" />
        <p className="text-sm text-ink-400">
          Re-calibrate this pro with full-swing capture to enable side-by-side playback.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="rounded-lg overflow-hidden bg-pine-900 border border-pine-700">
            <canvas ref={userCanvasRef} width={300} height={400} className="w-full block" />
          </div>
          <p className="text-center text-xs font-medium mt-2" style={{ color: USER_COLOR }}>
            You
          </p>
        </div>
        <div>
          <div className="rounded-lg overflow-hidden bg-pine-900 border border-pine-700">
            <canvas ref={proCanvasRef} width={300} height={400} className="w-full block" />
          </div>
          <p
            className="text-center text-xs font-medium mt-2"
            style={{ color: proProfile?.color || "#d8b25c" }}
          >
            {proProfile?.name || "Pro"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="btn-ghost !p-2.5 shrink-0"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => {
            setPlaying(false);
            setProgress(parseFloat(e.target.value));
          }}
          className="flex-1"
          aria-label="Swing progress"
        />
        <div className="flex gap-1 shrink-0">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                speed === s
                  ? "bg-fairway-600/30 text-fairway-300 border border-fairway-600/40"
                  : "text-ink-400 border border-transparent hover:text-cream-300"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
