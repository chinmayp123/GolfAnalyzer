import { useRef, useEffect } from "react";
import {
  SWING_PHASES,
  PHASE_LABELS,
  KEYPOINT_NAMES,
  NAMED_SKELETON,
  SKELETON_CONNECTIONS,
} from "../utils/constants.js";
import { getScoreColor, getScoreLabel, generateProPose } from "../utils/helpers.js";

// ─── Normalize raw keypoints to fit a canvas ───
function normalizeKeypoints(keypoints, canvasW, canvasH) {
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
  const padding = 0.12;
  return keypoints.map((kp) => ({
    ...kp,
    x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) * canvasW + padding * canvasW,
    y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) * canvasH + padding * canvasH,
  }));
}

// ─── Stick Figure Comparison Panel ───
function PoseComparisonPanel({ phase, userKeypoints, selectedPro, customProfiles, compact }) {
  const userCanvasRef = useRef(null);
  const proCanvasRef = useRef(null);
  const proInfo = customProfiles.find((p) => p.id === selectedPro);
  const canvasW = compact ? 120 : 200;
  const canvasH = compact ? 160 : 280;

  useEffect(() => {
    if (!proInfo) return;

    // Use actual captured keypoints from calibration if available, otherwise fall back to generated pose
    const realProKeypoints = proInfo.phaseKeypoints?.[phase];

    if (proCanvasRef.current) {
      if (realProKeypoints) {
        // Draw actual captured pro keypoints (same normalization as user)
        const canvas = proCanvasRef.current;
        const w = canvas.width;
        const h = canvas.height;
        const normalized = normalizeKeypoints(realProKeypoints, w, h);
        drawStickFigure(canvas, normalized, proInfo.color, proInfo.color, false);
      } else {
        // Fall back to synthetic pose from benchmarks
        const allBenchmarks = proInfo.benchmarks;
        if (allBenchmarks) {
          const proRef = generateProPose(allBenchmarks, phase);
          if (proRef) {
            drawStickFigure(proCanvasRef.current, proRef, proInfo.color, proInfo.color, true);
          }
        }
      }
    }

    if (userCanvasRef.current && userKeypoints) {
      const canvas = userCanvasRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const normalized = normalizeKeypoints(userKeypoints, w, h);
      drawStickFigure(canvas, normalized, "#38bdf8", "#38bdf8", false);
    }
  }, [phase, userKeypoints, proInfo]);

  if (!proInfo) return null;

  const labelSize = compact ? 9 : 11;
  const gap = compact ? 6 : 12;
  const radius = compact ? 8 : 12;

  return (
    <div style={{ display: "flex", gap, marginTop: compact ? 0 : 16 }}>
      <div style={{ flex: 1 }}>
        {!compact && (
          <div style={{ fontSize: labelSize, color: "#38bdf8", fontWeight: 700, marginBottom: 6, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
            You
          </div>
        )}
        <div style={{ borderRadius: radius, overflow: "hidden", border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.03)" }}>
          <canvas ref={userCanvasRef} width={canvasW} height={canvasH} style={{ width: "100%", display: "block" }} />
        </div>
        {compact && (
          <div style={{ fontSize: 8, color: "#38bdf8", fontWeight: 700, textAlign: "center", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>You</div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        {!compact && (
          <div style={{ fontSize: labelSize, color: proInfo.color, fontWeight: 700, marginBottom: 6, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
            {proInfo.name}
          </div>
        )}
        <div style={{ borderRadius: radius, overflow: "hidden", border: `1px solid ${proInfo.color}33`, background: `${proInfo.color}08` }}>
          <canvas ref={proCanvasRef} width={canvasW} height={canvasH} style={{ width: "100%", display: "block" }} />
        </div>
        {compact && (
          <div style={{ fontSize: 8, color: proInfo.color, fontWeight: 700, textAlign: "center", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Pro</div>
        )}
      </div>
    </div>
  );
}

function drawStickFigure(canvas, keypoints, color, glowColor, isNamed) {
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
    if (isNamed) {
      const pt = keypoints[name];
      return pt ? { x: pt.x * w, y: pt.y * h } : null;
    }
    const idx = KEYPOINT_NAMES.indexOf(name);
    if (idx < 0) return null;
    const kp = keypoints[idx];
    if (!kp || kp.score < 0.3) return null;
    return { x: kp.x, y: kp.y };
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
}

// ─── Results Dashboard ───
export default function Results({ analysisResults, phaseSnapshots, selectedPro, customProfiles = [], onGoToAnalysis }) {
  if (!analysisResults) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
        <h2 style={{ color: "#fff", margin: "0 0 8px" }}>No Analysis Yet</h2>
        <p style={{ color: "#64748b" }}>
          Go to the Analyze tab and capture your swing phases first.
        </p>
        <button
          onClick={onGoToAnalysis}
          style={{
            marginTop: 16,
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg, #00ffaa, #00cc88)",
            color: "#000",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Go to Analysis
        </button>
      </div>
    );
  }

  const proInfo = customProfiles.find((p) => p.id === selectedPro);

  return (
    <div>
      {/* Overall Score */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "32px 48px",
            borderRadius: 24,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#94a3b8",
              marginBottom: 8,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            Overall Swing Score{proInfo ? ` vs ${proInfo.name}` : ""}
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: getScoreColor(analysisResults.overallScore),
              lineHeight: 1,
            }}
          >
            {analysisResults.overallScore}
          </div>
          <div
            style={{
              fontSize: 16,
              color: getScoreColor(analysisResults.overallScore),
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {getScoreLabel(analysisResults.overallScore)}
          </div>
        </div>
      </div>

      {/* ─── Skeleton Filmstrip: 5 phases side by side ─── */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, color: "#fff", textAlign: "center" }}>
          Swing Positions — You vs {proInfo?.name || "Pro"}
        </h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}>
          {SWING_PHASES.map((phase) => {
            const snap = phaseSnapshots?.[phase];
            const res = analysisResults.phaseResults[phase];
            return (
              <div key={phase} style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: res ? getScoreColor(res.overallScore) : "#475569",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}>
                  {PHASE_LABELS[phase]}
                </div>
                {res && (
                  <div style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: getScoreColor(res.overallScore),
                    marginBottom: 6,
                  }}>
                    {res.overallScore}
                  </div>
                )}
                <PoseComparisonPanel
                  phase={phase}
                  userKeypoints={snap?.keypoints}
                  selectedPro={selectedPro}
                  customProfiles={customProfiles}
                  compact
                />
                {!snap && (
                  <div style={{
                    height: 120,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.2)",
                    border: "1px dashed rgba(255,255,255,0.08)",
                    fontSize: 11,
                    color: "#475569",
                  }}>
                    Not captured
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase Breakdown Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {SWING_PHASES.map((phase) => {
          const res = analysisResults.phaseResults[phase];
          if (!res)
            return (
              <div
                key={phase}
                style={{
                  padding: 20,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed rgba(255,255,255,0.08)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>
                  {PHASE_LABELS[phase]}
                </div>
                <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>
                  Not captured
                </div>
              </div>
            );

          return (
            <div
              key={phase}
              style={{
                padding: 20,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${getScoreColor(res.overallScore)}22`,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: "#94a3b8",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                {PHASE_LABELS[phase]}
              </div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: getScoreColor(res.overallScore),
                  marginBottom: 10,
                }}
              >
                {res.overallScore}
              </div>

              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 60px 50px",
                gap: 6,
                padding: "6px 0 4px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>Metric</span>
                <span style={{ fontSize: 10, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>You</span>
                <span style={{ fontSize: 10, color: proInfo?.color || "#00ffaa", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>
                  {proInfo ? "Pro" : "Target"}
                </span>
                <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Match</span>
              </div>

              {Object.entries(res.metrics).map(([key, m]) => {
                const proMeasured = proInfo?.phaseMeasurements?.[phase]?.[key];
                const proVal = proMeasured !== undefined ? Math.round(proMeasured * 10) / 10 : m.benchmark.ideal;
                const diff = Math.round(m.value - proVal);
                return (
                  <div
                    key={key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 60px 60px 50px",
                      gap: 6,
                      alignItems: "center",
                      padding: "5px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>{m.benchmark.label}</span>
                    <span style={{ fontFamily: "monospace", color: "#38bdf8", fontWeight: 700, textAlign: "right" }}>
                      {Math.round(m.value)}°
                    </span>
                    <span style={{ fontFamily: "monospace", color: proInfo?.color || "#00ffaa", fontWeight: 700, textAlign: "right" }}>
                      {proVal}°
                    </span>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <span style={{
                        fontSize: 10,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: m.score >= 85 ? "#22c55e" : m.score >= 65 ? "#eab308" : "#ef4444",
                      }}>
                        {diff === 0 ? "=" : (diff > 0 ? "+" : "") + diff + "°"}
                      </span>
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: getScoreColor(m.score),
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Stick figure comparison */}
              <PoseComparisonPanel
                phase={phase}
                userKeypoints={phaseSnapshots?.[phase]?.keypoints}
                selectedPro={selectedPro}
                customProfiles={customProfiles}
              />
            </div>
          );
        })}
      </div>

      {/* Improvement Tips */}
      {analysisResults.tips.length > 0 && (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 16,
            padding: 24,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#fff" }}>
            Areas for Improvement
          </h3>
          <div style={{ display: "grid", gap: 10 }}>
            {analysisResults.tips.map((tip, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: 14,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.2)",
                  border: `1px solid ${getScoreColor(tip.score)}22`,
                }}
              >
                <div
                  style={{
                    minWidth: 36,
                    height: 36,
                    borderRadius: 8,
                    background: `${getScoreColor(tip.score)}22`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 800,
                    color: getScoreColor(tip.score),
                  }}
                >
                  {tip.score}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>
                    {tip.phase} — {tip.metric}
                  </div>
                  <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 6 }}>
                    {tip.message}
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
                    <span>
                      <span style={{ color: "#475569" }}>You: </span>
                      <span style={{ color: "#38bdf8", fontFamily: "monospace", fontWeight: 700 }}>
                        {tip.userValue !== undefined ? `${Math.round(tip.userValue)}°` : "—"}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: "#475569" }}>Pro: </span>
                      <span style={{ color: proInfo?.color || "#00ffaa", fontFamily: "monospace", fontWeight: 700 }}>
                        {tip.proValue !== undefined ? `${Math.round(tip.proValue * 10) / 10}°` : `${tip.idealValue}°`}
                      </span>
                    </span>
                    <span>
                      <span style={{ color: "#475569" }}>Diff: </span>
                      <span style={{ color: getScoreColor(tip.score), fontFamily: "monospace", fontWeight: 700 }}>
                        {tip.userValue !== undefined ? `${tip.userValue - (tip.proValue ?? tip.idealValue) > 0 ? "+" : ""}${Math.round(tip.userValue - (tip.proValue ?? tip.idealValue))}°` : "—"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
