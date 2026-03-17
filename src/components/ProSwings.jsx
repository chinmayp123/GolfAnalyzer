import { useRef, useEffect, useState, useCallback } from "react";
import {
  SWING_PHASES,
  PHASE_LABELS,
  NAMED_SKELETON,
} from "../utils/constants.js";
import { generateProPose } from "../utils/helpers.js";

const PHASE_HOLD_MS = 800;
const PHASE_TRANSITION_MS = 400;
const PHASE_TOTAL_MS = PHASE_HOLD_MS + PHASE_TRANSITION_MS;

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

function drawStickFigure(canvas, pose, color, glowColor, phaseLabel) {
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

  if (phaseLabel) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(phaseLabel, w / 2, h - 10);
  }
}

function buildPoseCache(profiles) {
  const cache = {};
  for (const profile of profiles) {
    cache[profile.id] = {};
    const benchmarks = profile.benchmarks;
    for (const phase of SWING_PHASES) {
      cache[profile.id][phase] = generateProPose(benchmarks, phase);
    }
  }
  return cache;
}

export default function ProSwings({ customProfiles = [] }) {
  const canvasRefs = useRef({});
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const poseCacheRef = useRef(null);
  const profileIdsRef = useRef("");
  const animRef = useRef(null);
  const startTimeRef = useRef(null);
  const playingRef = useRef(true);
  const speedRef = useRef(1);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Rebuild pose cache when profiles change
  const currentIds = customProfiles.map((p) => p.id).join(",");
  if (currentIds !== profileIdsRef.current) {
    poseCacheRef.current = buildPoseCache(customProfiles);
    profileIdsRef.current = currentIds;
  }
  const poseCache = poseCacheRef.current || {};

  const animate = useCallback((timestamp) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;

    const elapsed = (timestamp - startTimeRef.current) * speedRef.current;
    const totalCycle = PHASE_TOTAL_MS * SWING_PHASES.length;
    const cycleTime = elapsed % totalCycle;
    const rawPhaseIndex = Math.floor(cycleTime / PHASE_TOTAL_MS);
    const phaseIndex = rawPhaseIndex % SWING_PHASES.length;
    const phaseElapsed = cycleTime - rawPhaseIndex * PHASE_TOTAL_MS;

    setCurrentPhaseIndex(phaseIndex);

    const currentPhase = SWING_PHASES[phaseIndex];
    const nextPhase = SWING_PHASES[(phaseIndex + 1) % SWING_PHASES.length];

    let interpT = 0;
    if (phaseElapsed > PHASE_HOLD_MS) {
      interpT = (phaseElapsed - PHASE_HOLD_MS) / PHASE_TRANSITION_MS;
      interpT = interpT * interpT * (3 - 2 * interpT);
    }

    for (const profile of customProfiles) {
      const canvas = canvasRefs.current[profile.id];
      if (!canvas || !poseCache[profile.id]) continue;

      const poseA = poseCache[profile.id][currentPhase];
      const poseB = poseCache[profile.id][nextPhase];
      if (!poseA || !poseB) continue;
      const interpolated = interpT > 0 ? lerpPose(poseA, poseB, interpT) : poseA;

      const label = interpT > 0
        ? `${PHASE_LABELS[currentPhase]} → ${PHASE_LABELS[nextPhase]}`
        : PHASE_LABELS[currentPhase];

      drawStickFigure(canvas, interpolated, profile.color, profile.color, label);
    }

    if (playingRef.current) {
      animRef.current = requestAnimationFrame(animate);
    }
  }, [poseCache, customProfiles]);

  useEffect(() => {
    if (playing && customProfiles.length > 0) {
      startTimeRef.current = null;
      animRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, animate, customProfiles]);

  useEffect(() => {
    if (!playing) {
      const phase = SWING_PHASES[currentPhaseIndex];
      for (const profile of customProfiles) {
        const canvas = canvasRefs.current[profile.id];
        if (!canvas || !poseCache[profile.id]) continue;
        const pose = poseCache[profile.id][phase];
        if (pose) {
          drawStickFigure(canvas, pose, profile.color, profile.color, PHASE_LABELS[phase]);
        }
      }
    }
  }, [playing, currentPhaseIndex, poseCache, customProfiles]);

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
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 style={{
          margin: 0, fontSize: 28, fontWeight: 700, color: "#fff",
          background: "linear-gradient(135deg, #00ffaa, #38bdf8)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Pro Swing Comparison
        </h2>
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 14 }}>
          Animated swing sequences from your calibrated pro profiles
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 20,
        marginBottom: 24,
      }}>
        {customProfiles.map((profile) => (
          <div key={profile.id} style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%",
                background: profile.color,
                boxShadow: `0 0 8px ${profile.color}66`,
              }} />
              <span style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>
                {profile.name}
              </span>
            </div>

            <p style={{
              margin: "0 0 12px", fontSize: 12, color: "#94a3b8", lineHeight: 1.5,
            }}>
              Calibrated from: {profile.videoFileName || "uploaded footage"}
            </p>

            <div style={{
              borderRadius: 12, overflow: "hidden",
              border: `1px solid ${profile.color}22`,
            }}>
              <canvas
                ref={(el) => { canvasRefs.current[profile.id] = el; }}
                width={280}
                height={360}
                style={{ width: "100%", display: "block" }}
              />
            </div>
          </div>
        ))}
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
          {[0.5, 1, 2].map((s) => (
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

        <div style={{
          marginLeft: 16, padding: "6px 14px", borderRadius: 6,
          background: "rgba(56,189,248,0.1)", fontSize: 13, color: "#38bdf8", fontWeight: 600,
        }}>
          {PHASE_LABELS[SWING_PHASES[currentPhaseIndex]]}
        </div>
      </div>
    </div>
  );
}
