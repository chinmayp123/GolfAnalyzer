import { useRef, useEffect, useState, useCallback } from "react";
import {
  SWING_PHASES,
  PHASE_LABELS,
  KEYPOINT_NAMES,
  NAMED_SKELETON,
  SKELETON_CONNECTIONS,
} from "../utils/constants.js";
import { generateProPose } from "../utils/helpers.js";

// ─── Normalize raw keypoints to named 0-1 coords ───
function normalizeKeypointsToNamed(keypoints) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  keypoints.forEach((kp) => {
    if (kp.score > 0.3) {
      minX = Math.min(minX, kp.x);
      maxX = Math.max(maxX, kp.x);
      minY = Math.min(minY, kp.y);
      maxY = Math.max(maxY, kp.y);
    }
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const padding = 0.10;

  const named = {};
  keypoints.forEach((kp, i) => {
    if (i < KEYPOINT_NAMES.length && kp.score > 0.3) {
      named[KEYPOINT_NAMES[i]] = {
        x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) + padding,
        y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) + padding,
      };
    }
  });
  return named;
}

// ─── Normalize full swing frames once upfront ───
// Compute a single shared bounding box across ALL frames so the figure stays stable
function normalizeFullSwingFrames(frames) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  frames.forEach((frame) => {
    frame.keypoints.forEach((kp) => {
      if (kp.score > 0.3) {
        minX = Math.min(minX, kp.x);
        maxX = Math.max(maxX, kp.x);
        minY = Math.min(minY, kp.y);
        maxY = Math.max(maxY, kp.y);
      }
    });
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const padding = 0.10;

  return frames.map((frame) => {
    const named = {};
    frame.keypoints.forEach((kp, i) => {
      if (i < KEYPOINT_NAMES.length && kp.score > 0.3) {
        named[KEYPOINT_NAMES[i]] = {
          x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) + padding,
          y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) + padding,
        };
      }
    });
    return { time: frame.time, pose: named };
  });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPose(poseA, poseB, t) {
  const result = {};
  for (const key of Object.keys(poseA)) {
    if (poseB[key]) {
      result[key] = {
        x: lerp(poseA[key].x, poseB[key].x, t),
        y: lerp(poseA[key].y, poseB[key].y, t),
      };
    } else {
      result[key] = { ...poseA[key] };
    }
  }
  return result;
}

function drawStickFigure(canvas, pose, color, glowColor, label) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 12);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(20, h * 0.92);
  ctx.lineTo(w - 20, h * 0.92);
  ctx.stroke();
  ctx.setLineDash([]);

  const getPoint = (name) => {
    const pt = pose[name];
    return pt ? { x: pt.x * w, y: pt.y * h } : null;
  };

  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  NAMED_SKELETON.forEach(([a, b]) => {
    const pa = getPoint(a);
    const pb = getPoint(b);
    if (pa && pb) {
      ctx.strokeStyle = color;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  });

  const jointNames = [
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle", "nose",
  ];
  jointNames.forEach((name) => {
    const pt = getPoint(name);
    if (pt) {
      ctx.fillStyle = name === "nose" ? "#fff" : color;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, name === "nose" ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  const nose = getPoint("nose");
  if (nose) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (label) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, w / 2, h - 10);
  }
}

// ─── Phase-based pose cache (fallback for profiles without full swing) ───
const PHASE_HOLD_MS = 800;
const PHASE_TRANSITION_MS = 400;
const PHASE_TOTAL_MS = PHASE_HOLD_MS + PHASE_TRANSITION_MS;

function buildPhasePoseCache(profiles) {
  const cache = {};
  for (const profile of profiles) {
    if (profile.fullSwingFrames && profile.fullSwingFrames.length > 0) continue;
    cache[profile.id] = {};
    const hasRealKeypoints = profile.phaseKeypoints && Object.keys(profile.phaseKeypoints).length > 0;
    for (const phase of SWING_PHASES) {
      if (hasRealKeypoints && profile.phaseKeypoints[phase]) {
        cache[profile.id][phase] = normalizeKeypointsToNamed(profile.phaseKeypoints[phase]);
      } else {
        cache[profile.id][phase] = generateProPose(profile.benchmarks, phase);
      }
    }
  }
  return cache;
}

// ─── Full swing frame cache ───
function buildFullSwingCache(profiles) {
  const cache = {};
  for (const profile of profiles) {
    if (profile.fullSwingFrames && profile.fullSwingFrames.length > 0) {
      cache[profile.id] = normalizeFullSwingFrames(profile.fullSwingFrames);
    }
  }
  return cache;
}

export default function ProSwings({ customProfiles = [], userSwingFrames = null }) {
  const canvasRefs = useRef({});
  const userCanvasRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [currentLabel, setCurrentLabel] = useState("");
  const phaseCacheRef = useRef(null);
  const fullSwingCacheRef = useRef(null);
  const userFramesCacheRef = useRef(null);
  const profileIdsRef = useRef("");
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const playingRef = useRef(true);
  const speedRef = useRef(1);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Rebuild caches when profiles change
  const currentIds = customProfiles.map((p) => p.id + "_" + (p.fullSwingFrames?.length || 0)).join(",") + "_user" + (userSwingFrames?.length || 0);
  if (currentIds !== profileIdsRef.current) {
    phaseCacheRef.current = buildPhasePoseCache(customProfiles);
    fullSwingCacheRef.current = buildFullSwingCache(customProfiles);
    userFramesCacheRef.current = userSwingFrames && userSwingFrames.length > 1
      ? normalizeFullSwingFrames(userSwingFrames) : null;
    profileIdsRef.current = currentIds;
  }
  const phaseCache = phaseCacheRef.current || {};
  const fullSwingCache = fullSwingCacheRef.current || {};
  const userFramesCache = userFramesCacheRef.current;

  const FULL_SWING_CYCLE_MS = 2000;

  const animate = useCallback((timestamp) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) * speedRef.current;

    let label = "";

    for (const profile of customProfiles) {
      const canvas = canvasRefs.current[profile.id];
      if (!canvas) continue;

      const frames = fullSwingCache[profile.id];
      if (frames && frames.length > 1) {
        // ─── Full swing frame playback ───
        const cycleDuration = FULL_SWING_CYCLE_MS;
        const t = (elapsed % cycleDuration) / cycleDuration; // 0-1 progress through swing
        const frameIndex = t * (frames.length - 1);
        const i = Math.floor(frameIndex);
        const frac = frameIndex - i;
        const frameA = frames[Math.min(i, frames.length - 1)];
        const frameB = frames[Math.min(i + 1, frames.length - 1)];

        const pose = frac > 0 && frameA && frameB
          ? lerpPose(frameA.pose, frameB.pose, frac)
          : frameA.pose;

        // Determine which phase we're in based on progress
        const phaseNames = ["Address", "Backswing", "Downswing", "Impact", "Follow Through"];
        const phaseIdx = Math.min(Math.floor(t * 5), 4);
        label = phaseNames[phaseIdx];

        drawStickFigure(canvas, pose, profile.color, profile.color, label);
      } else if (phaseCache[profile.id]) {
        // ─── Phase-based fallback ───
        const totalCycle = PHASE_TOTAL_MS * SWING_PHASES.length;
        const cycleTime = elapsed % totalCycle;
        const rawPhaseIndex = Math.floor(cycleTime / PHASE_TOTAL_MS);
        const phaseIndex = rawPhaseIndex % SWING_PHASES.length;
        const phaseElapsed = cycleTime - rawPhaseIndex * PHASE_TOTAL_MS;

        const currentPhase = SWING_PHASES[phaseIndex];
        const nextPhase = SWING_PHASES[(phaseIndex + 1) % SWING_PHASES.length];

        let interpT = 0;
        if (phaseElapsed > PHASE_HOLD_MS) {
          interpT = (phaseElapsed - PHASE_HOLD_MS) / PHASE_TRANSITION_MS;
          interpT = interpT * interpT * (3 - 2 * interpT);
        }

        const poseA = phaseCache[profile.id][currentPhase];
        const poseB = phaseCache[profile.id][nextPhase];
        if (poseA && poseB) {
          const interpolated = interpT > 0 ? lerpPose(poseA, poseB, interpT) : poseA;
          label = interpT > 0
            ? `${PHASE_LABELS[currentPhase]} → ${PHASE_LABELS[nextPhase]}`
            : PHASE_LABELS[currentPhase];
          drawStickFigure(canvas, interpolated, profile.color, profile.color, label);
        }
      }
    }

    // Draw user swing
    if (userFramesCache && userCanvasRef.current) {
      const frames = userFramesCache;
      const cycleDuration = FULL_SWING_CYCLE_MS;
      const t = (elapsed % cycleDuration) / cycleDuration;
      const frameIndex = t * (frames.length - 1);
      const i = Math.floor(frameIndex);
      const frac = frameIndex - i;
      const frameA = frames[Math.min(i, frames.length - 1)];
      const frameB = frames[Math.min(i + 1, frames.length - 1)];
      const pose = frac > 0 && frameA && frameB
        ? lerpPose(frameA.pose, frameB.pose, frac)
        : frameA.pose;
      const phaseNames = ["Address", "Backswing", "Downswing", "Impact", "Follow Through"];
      const phaseIdx = Math.min(Math.floor(t * 5), 4);
      drawStickFigure(userCanvasRef.current, pose, "#38bdf8", "#38bdf8", phaseNames[phaseIdx]);
    }

    setCurrentLabel(label);

    if (playingRef.current) {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [fullSwingCache, phaseCache, customProfiles, userFramesCache]);

  useEffect(() => {
    if (playing && customProfiles.length > 0) {
      startTimeRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, animate, customProfiles]);

  // Empty state
  if (customProfiles.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏌️</div>
        <h2 style={{ color: "#fff", margin: "0 0 8px" }}>No Pro Profiles Yet</h2>
        <p style={{ color: "#64748b", fontSize: 14 }}>
          Go to the <strong style={{ color: "#00ffaa" }}>Calibrate Pro</strong> tab
          to upload pro swing videos and create profiles. They'll appear here as
          animated swing comparisons.
        </p>
      </div>
    );
  }

  const cols = Math.min(customProfiles.length, 3);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <h2 style={{
          margin: 0, fontSize: 22, fontWeight: 700, color: "#fff",
          background: "linear-gradient(135deg, #00ffaa, #38bdf8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Pro Swing Comparison
        </h2>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
          Animated swing sequences from your calibrated pro profiles
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: userFramesCache ? "1fr 1fr" : `repeat(${cols}, minmax(0, 280px))`,
        gap: 16,
        marginBottom: 24,
        justifyContent: "center",
        maxWidth: 700,
        margin: "0 auto 24px",
      }}>
        {/* Pro profiles */}
        {customProfiles.map((profile) => {
          const hasFullSwing = fullSwingCache[profile.id] && fullSwingCache[profile.id].length > 1;
          const frameCount = hasFullSwing ? fullSwingCache[profile.id].length : 0;
          return (
            <div key={profile.id} style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${profile.color}22`,
              borderRadius: 14,
              padding: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: profile.color,
                  boxShadow: `0 0 6px ${profile.color}66`,
                }} />
                <span style={{ fontWeight: 700, fontSize: 14, color: profile.color }}>
                  {profile.name}
                </span>
                {hasFullSwing && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 3,
                    background: "rgba(0,255,170,0.15)", color: "#00ffaa",
                    fontWeight: 600, textTransform: "uppercase",
                  }}>
                    {frameCount}f
                  </span>
                )}
              </div>
              <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${profile.color}22` }}>
                <canvas
                  ref={(el) => { canvasRefs.current[profile.id] = el; }}
                  width={240}
                  height={300}
                  style={{ width: "100%", display: "block" }}
                />
              </div>
            </div>
          );
        })}

        {/* User swing */}
        {userFramesCache && (
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(56,189,248,0.22)",
            borderRadius: 14,
            padding: 12,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#38bdf8",
                boxShadow: "0 0 6px rgba(56,189,248,0.6)",
              }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#38bdf8" }}>
                Your Swing
              </span>
              <span style={{
                fontSize: 8, padding: "1px 5px", borderRadius: 3,
                background: "rgba(56,189,248,0.15)", color: "#38bdf8",
                fontWeight: 600, textTransform: "uppercase",
              }}>
                {userFramesCache.length}f
              </span>
            </div>
            <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(56,189,248,0.22)" }}>
              <canvas
                ref={userCanvasRef}
                width={240}
                height={300}
                style={{ width: "100%", display: "block" }}
              />
            </div>
          </div>
        )}

        {/* Placeholder if no user swing */}
        {!userFramesCache && customProfiles.length > 0 && (
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px dashed rgba(56,189,248,0.15)",
            borderRadius: 14,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 200,
          }}>
            <div style={{ fontSize: 13, color: "#475569", fontWeight: 600, marginBottom: 4 }}>Your Swing</div>
            <div style={{ fontSize: 11, color: "#334155", textAlign: "center", lineHeight: 1.5 }}>
              Go to Analyze tab and click<br />"Capture Full Swing Motion"<br />to see your swing here
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16, padding: "16px 24px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12, marginBottom: 24,
      }}>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: 600,
            background: playing ? "rgba(239,68,68,0.15)" : "rgba(0,255,170,0.15)",
            color: playing ? "#ef4444" : "#00ffaa",
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b", marginRight: 4 }}>Speed:</span>
          {[0.25, 0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: speed === s ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.05)",
                color: speed === s ? "#00ffaa" : "#94a3b8",
              }}
            >
              {s}x
            </button>
          ))}
        </div>

        {currentLabel && (
          <div style={{
            marginLeft: 16, padding: "6px 14px", borderRadius: 6,
            background: "rgba(56,189,248,0.1)", fontSize: 13, color: "#38bdf8", fontWeight: 600,
          }}>
            {currentLabel}
          </div>
        )}
      </div>
    </div>
  );
}
