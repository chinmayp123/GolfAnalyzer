import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Film } from "lucide-react";
import { SWING_PHASES } from "../lib/constants.js";
import { detectSwingPhases } from "../lib/phaseDetection.js";
import { normalizeFullSwingFrames, lerpPose, drawFigure } from "../lib/poseDrawing.js";

// ─── Overlaid skeleton stage: you vs pro on one canvas ───
// Playback is PHASE-ALIGNED: one shared progress value 0..1 is split into
// equal segments between phase anchors (address → top → downswing → impact →
// finish), and each side interpolates within its OWN real timing for that
// segment. Both skeletons hit address, impact, and finish at the same moment
// even if one swing (or clip) is much longer than the other.

const USER_COLOR = "#5cbc7f";
const PRO_COLOR = "#d8b25c";
const BASE_CYCLE_MS = 2600;

const PHASE_CAPTIONS = {
  address: "ADDRESS",
  backswing: "TOP",
  downswing: "DOWNSWING",
  impact: "IMPACT",
  followThrough: "FINISH",
};

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

// Ordered, valid phase anchors for one side: {phases: [name], times: [s]}
function buildAnchors(phaseTimes) {
  if (!phaseTimes) return null;
  const phases = SWING_PHASES.filter(
    (p) => typeof phaseTimes[p] === "number" && !isNaN(phaseTimes[p])
  );
  if (phases.length < 3) return null;
  const times = phases.map((p) => phaseTimes[p]);
  for (let i = 1; i < times.length; i++) {
    if (times[i] <= times[i - 1]) return null; // must be strictly ordered
  }
  return { phases, times };
}

// Build one side's playback plan: frames clipped to the swing (so the
// normalization bounding box isn't polluted by idle footage) + anchors.
function buildPlan(frames, phaseTimes) {
  if (!frames || frames.length < 2) return null;
  const anchors = buildAnchors(phaseTimes);
  let clipped = frames;
  if (anchors) {
    const start = anchors.times[0] - 0.25;
    const end = anchors.times[anchors.times.length - 1] + 0.35;
    const inWindow = frames.filter((f) => f.time >= start && f.time <= end);
    if (inWindow.length >= 2) clipped = inWindow;
  }
  return { frames: normalizeFullSwingFrames(clipped), anchors };
}

// Map shared progress → this side's real clip time (or null without anchors)
function timeForPlan(plan, progress) {
  if (!plan?.anchors) return null;
  const { times } = plan.anchors;
  const nSeg = times.length - 1;
  const x = Math.min(progress, 0.9999) * nSeg;
  const seg = Math.min(Math.floor(x), nSeg - 1);
  return times[seg] + (x - seg) * (times[seg + 1] - times[seg]);
}

function poseForPlan(plan, progress) {
  if (!plan) return null;
  const t = timeForPlan(plan, progress);
  if (t === null) return poseAtProgress(plan.frames, progress);
  return poseAtTime(plan.frames, t);
}

function formatClock(t) {
  if (t == null || isNaN(t)) return "";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}

/**
 * The redesigned skeleton stage. Controlled phase selection: `selectedPhase`
 * seeks the stage to that phase's frame; during playback the stage reports
 * the phase it is passing through via `onPhaseChange`.
 */
export default function SkeletonCompare({
  userFrames,
  userPhaseTimes,
  proProfile,
  selectedPhase = null,
  onPhaseChange = null,
  className = "",
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const lastTsRef = useRef(null);
  // Phase this component last derived/seeked to — lets us tell an external
  // scrubber click apart from the echo of our own onPhaseChange call.
  const currentPhaseRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

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

  // Phase ↔ progress mapping follows the USER's anchors
  const anchorPhases = userPlan?.anchors?.phases || null;

  const progressForPhase = (phase) => {
    if (!anchorPhases) return null;
    const i = anchorPhases.indexOf(phase);
    if (i < 0) return null;
    const nSeg = anchorPhases.length - 1;
    return nSeg > 0 ? Math.min(i / nSeg, 0.9999) : 0;
  };

  const phaseAtProgress = (p) => {
    if (!anchorPhases) return null;
    const nSeg = anchorPhases.length - 1;
    if (nSeg <= 0) return anchorPhases[0];
    // Snap caption to the nearest anchor so "IMPACT" shows around impact,
    // not only after crossing it.
    const idx = Math.min(Math.round(p * nSeg), nSeg);
    return anchorPhases[idx];
  };

  // External phase selection (scrubber) → seek + pause
  useEffect(() => {
    if (!selectedPhase || selectedPhase === currentPhaseRef.current) return;
    const target = progressForPhase(selectedPhase);
    currentPhaseRef.current = selectedPhase;
    if (target !== null) {
      setPlaying(false);
      setProgress(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhase, anchorPhases]);

  // During playback, report the phase we're passing through
  useEffect(() => {
    if (!playing) return;
    const phase = phaseAtProgress(progress);
    if (phase && phase !== currentPhaseRef.current) {
      currentPhaseRef.current = phase;
      onPhaseChange?.(phase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, playing]);

  // Draw both figures whenever progress changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (proPlan) {
      drawFigure(canvas, poseForPlan(proPlan, progress), {
        color: proProfile?.color || PRO_COLOR,
        alpha: 0.5,
      });
    }
    if (userPlan) {
      drawFigure(canvas, poseForPlan(userPlan, progress), {
        color: USER_COLOR,
        clear: !proPlan,
        ground: !proPlan,
        glow: "rgba(92,188,127,0.4)",
      });
    }
  }, [progress, userPlan, proPlan, proProfile?.color]);

  // Playback loop
  useEffect(() => {
    if (!playing || (!userPlan && !proPlan)) return;
    lastTsRef.current = null;
    const tick = (ts) => {
      if (lastTsRef.current !== null) {
        const delta = (ts - lastTsRef.current) / BASE_CYCLE_MS;
        setProgress((p) => (p + delta) % 1);
      }
      lastTsRef.current = ts;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, userPlan, proPlan]);

  if (!proPlan) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <Film size={18} className="text-ink-500 shrink-0" />
        <p className="text-sm text-ink-400">
          Re-calibrate this pro with full-swing capture to enable side-by-side playback.
        </p>
      </div>
    );
  }

  const stepPhase = (dir) => {
    if (!anchorPhases) return;
    const current = currentPhaseRef.current || phaseAtProgress(progress) || anchorPhases[0];
    const i = anchorPhases.indexOf(current);
    const next = anchorPhases[Math.max(0, Math.min(anchorPhases.length - 1, i + dir))];
    if (!next || next === current) return;
    currentPhaseRef.current = next;
    setPlaying(false);
    const target = progressForPhase(next);
    if (target !== null) setProgress(target);
    onPhaseChange?.(next);
  };

  const shownPhase = playing
    ? phaseAtProgress(progress)
    : selectedPhase || phaseAtProgress(progress);
  const userTime = timeForPlan(userPlan, progress);
  const proName = (proProfile?.name || "Pro").split(" ").pop();

  return (
    <div
      className={`relative rounded-[14px] overflow-hidden border border-cream-50/7 ${className}`}
      style={{
        background: "#07100b",
        backgroundImage:
          "repeating-linear-gradient(135deg,#0a140d,#0a140d 10px,#08110b 10px,#08110b 20px)",
      }}
    >
      <canvas
        ref={canvasRef}
        width={330}
        height={430}
        className="block h-full w-full object-contain py-2"
      />

      {/* phase + time caption */}
      <div className="absolute top-2.5 left-3 font-mono text-[10px] text-cream-300 tracking-wide">
        {shownPhase ? PHASE_CAPTIONS[shownPhase] : "SWING"}
        {userTime != null && <> &middot; {formatClock(userTime)}</>}
      </div>

      {/* legend */}
      <div className="absolute top-2.5 right-3 flex gap-2.5 font-mono text-[9px]">
        <span style={{ color: USER_COLOR }}>&mdash; YOU</span>
        <span style={{ color: proProfile?.color || PRO_COLOR }}>
          &mdash; {proName.toUpperCase()}
        </span>
      </div>

      {/* playback transport */}
      <div className="absolute bottom-2.5 inset-x-0 flex items-center justify-center gap-4">
        <button
          onClick={() => stepPhase(-1)}
          className="p-2 rounded-full text-cream-300 hover:text-cream-50 bg-transparent border-none cursor-pointer"
          aria-label="Previous phase"
        >
          <SkipBack size={15} />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="w-14 h-14 rounded-full border-none cursor-pointer flex items-center justify-center text-pine-950"
          style={{
            background: "#5cbc7f",
            boxShadow: "0 0 18px rgba(92,188,127,0.4)",
          }}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
        <button
          onClick={() => stepPhase(1)}
          className="p-2 rounded-full text-cream-300 hover:text-cream-50 bg-transparent border-none cursor-pointer"
          aria-label="Next phase"
        >
          <SkipForward size={15} />
        </button>
      </div>
    </div>
  );
}
