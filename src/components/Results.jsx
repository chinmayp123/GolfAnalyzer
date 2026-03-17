import { useRef, useEffect } from "react";
import {
  SWING_PHASES,
  PHASE_LABELS,
  KEYPOINT_NAMES,
  NAMED_SKELETON,
} from "../utils/constants.js";
import { getScoreColor, getScoreLabel, generateProPose } from "../utils/helpers.js";

// ─── Stick Figure Comparison Panel ───
function PoseComparisonPanel({ phase, userKeypoints, selectedPro, customProfiles }) {
  const userCanvasRef = useRef(null);
  const proCanvasRef = useRef(null);
  const proInfo = customProfiles.find((p) => p.id === selectedPro);

  useEffect(() => {
    if (!proInfo) return;
    const allBenchmarks = proInfo.benchmarks;
    if (!allBenchmarks) return;
    const proRef = generateProPose(allBenchmarks, phase);
    if (!proRef) return;

    if (proCanvasRef.current) {
      drawStickFigure(proCanvasRef.current, proRef, proInfo.color, proInfo.color, true);
    }

    if (userCanvasRef.current && userKeypoints) {
      const canvas = userCanvasRef.current;
      const w = canvas.width;
      const h = canvas.height;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      userKeypoints.forEach((kp) => {
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

      const normalized = userKeypoints.map((kp) => ({
        ...kp,
        x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) * w + padding * w,
        y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) * h + padding * h,
      }));

      drawStickFigure(canvas, normalized, "#38bdf8", "#38bdf8", false);
    }
  }, [phase, userKeypoints, proInfo]);

  if (!proInfo) return null;

  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700, marginBottom: 6, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          Your Swing
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.03)" }}>
          <canvas ref={userCanvasRef} width={200} height={280} style={{ width: "100%", display: "block" }} />
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: proInfo.color, fontWeight: 700, marginBottom: 6, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          {proInfo.name}
        </div>
        <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${proInfo.color}33`, background: `${proInfo.color}08` }}>
          <canvas ref={proCanvasRef} width={200} height={280} style={{ width: "100%", display: "block" }} />
        </div>
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

              {Object.entries(res.metrics).map(([key, m]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "5px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>{m.benchmark.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
                      {Math.round(m.value)}°
                    </span>
                    <div
                      style={{
                        width: 40,
                        height: 6,
                        borderRadius: 3,
                        background: "rgba(255,255,255,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${m.score}%`,
                          borderRadius: 3,
                          background: getScoreColor(m.score),
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}

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
                <div>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>
                    {tip.phase} — {tip.metric}
                  </div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                    {tip.message}
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
