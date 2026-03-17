import { useState, useRef, useEffect } from "react";
import { TRACER_COLORS } from "../utils/constants.js";

// ─── Shot Tracer (3-Point Guided) ───
// User places: 1) Start (ball address), 2) Top Apex, 3) Landing Spot
// The tracer draws a smooth parabolic arc through all three points.

const STEPS = [
  { key: "start", label: "Start Position", desc: "Click where the ball is at address", color: "#22c55e" },
  { key: "apex", label: "Top of Arc", desc: "Click the highest point of the ball flight", color: "#facc15" },
  { key: "landing", label: "Landing Spot", desc: "Click where the ball lands", color: "#ef4444" },
];

// Generate smooth bezier arc through 3 points
function generateArcPoints(start, apex, landing, numPoints = 60) {
  // Use quadratic bezier: the control point is derived from the apex.
  // For a quadratic bezier B(t) = (1-t)^2*P0 + 2*(1-t)*t*P1 + t^2*P2
  // At t=0.5, B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2 = apex
  // So P1 (control) = 2*apex - 0.5*P0 - 0.5*P2
  const control = {
    x: 2 * apex.x - 0.5 * start.x - 0.5 * landing.x,
    y: 2 * apex.y - 0.5 * start.y - 0.5 * landing.y,
  };

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const mt = 1 - t;
    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * landing.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * landing.y,
    });
  }
  return points;
}

export default function ShotTracer({ videoRef }) {
  const [tracerMode, setTracerMode] = useState(false);
  const [tracerColor, setTracerColor] = useState("#ffffff");
  const [tracerWidth, setTracerWidth] = useState(3);
  const [tracerGlow, setTracerGlow] = useState(true);
  const [tracerPaths, setTracerPaths] = useState([]); // completed arcs
  const [currentStep, setCurrentStep] = useState(0); // 0=start, 1=apex, 2=landing
  const [keyPoints, setKeyPoints] = useState({}); // { start, apex, landing }
  const [animProgress, setAnimProgress] = useState(1); // 0-1 for arc animation
  const [animating, setAnimating] = useState(false);

  const canvasRef = useRef(null);
  const animRef = useRef(null);

  // ─── Draw everything ───
  useEffect(() => {
    const video = videoRef?.current;
    if (!canvasRef.current || !video) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw completed paths
    tracerPaths.forEach((path) => {
      drawArc(ctx, path.points, path.color, path.width, path.glow, 1);
      drawKeyPointDots(ctx, path.keyPoints);
    });

    // Draw in-progress key points
    const placedPoints = [];
    if (keyPoints.start) placedPoints.push({ ...keyPoints.start, step: 0 });
    if (keyPoints.apex) placedPoints.push({ ...keyPoints.apex, step: 1 });
    if (keyPoints.landing) placedPoints.push({ ...keyPoints.landing, step: 2 });

    // Draw placed dots
    placedPoints.forEach((pt) => {
      const step = STEPS[pt.step];
      ctx.save();
      ctx.fillStyle = step.color;
      ctx.shadowColor = step.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = "#000";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pt.step + 1, pt.x, pt.y);

      // Name label above
      ctx.fillStyle = step.color;
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(step.label, pt.x, pt.y - 16);
      ctx.restore();
    });

    // Draw preview arc if all 3 points placed
    if (keyPoints.start && keyPoints.apex && keyPoints.landing) {
      const arcPts = generateArcPoints(keyPoints.start, keyPoints.apex, keyPoints.landing);
      drawArc(ctx, arcPts, tracerColor, tracerWidth, tracerGlow, animProgress);
    }
    // Draw line connecting placed points as preview
    else if (placedPoints.length >= 2) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(placedPoints[0].x, placedPoints[0].y);
      for (let i = 1; i < placedPoints.length; i++) {
        ctx.lineTo(placedPoints[i].x, placedPoints[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [tracerPaths, keyPoints, tracerColor, tracerWidth, tracerGlow, animProgress, videoRef]);

  function drawArc(ctx, points, color, width, glow, progress) {
    if (points.length < 2) return;
    const endIdx = Math.floor((points.length - 1) * Math.min(progress, 1));
    if (endIdx < 1) return;

    const ballRadius = width + 3;
    const isAnimating = progress < 1;

    // --- Trail line (fades from transparent to solid behind the ball) ---
    if (isAnimating) {
      // Draw fading trail segments
      const trailLength = Math.min(endIdx, 20); // trail covers last 20 segments
      const trailStart = Math.max(0, endIdx - trailLength);
      for (let i = trailStart; i < endIdx; i++) {
        const fade = (i - trailStart) / trailLength; // 0 = faint, 1 = solid
        ctx.save();
        ctx.lineWidth = width * (0.3 + fade * 0.7);
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        ctx.globalAlpha = fade * 0.8;
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = fade * 14;
        }
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[i + 1].x, points[i + 1].y);
        ctx.stroke();
        ctx.restore();
      }

      // --- Ball shadow on the "ground" (projected below) ---
      const ballPt = points[endIdx];
      const groundY = Math.max(points[0].y, points[points.length - 1].y);
      const heightAboveGround = Math.max(0, groundY - ballPt.y);
      const shadowScale = Math.max(0.3, 1 - heightAboveGround / 300);
      ctx.save();
      ctx.globalAlpha = 0.15 * shadowScale;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(ballPt.x, groundY + 5, ballRadius * 2 * shadowScale, ballRadius * 0.6 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- Motion blur (3 ghost balls behind the current position) ---
      for (let g = 3; g >= 1; g--) {
        const ghostIdx = Math.max(0, endIdx - g * 2);
        const ghostPt = points[ghostIdx];
        ctx.save();
        ctx.globalAlpha = 0.12 * (4 - g) / 3;
        ctx.fillStyle = color;
        if (glow) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6;
        }
        ctx.beginPath();
        ctx.arc(ghostPt.x, ghostPt.y, ballRadius * (0.6 + 0.1 * g), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // --- Main ball ---
      const bPt = points[endIdx];
      ctx.save();
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
      }
      // Outer glow ring
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bPt.x, bPt.y, ballRadius + 4, 0, Math.PI * 2);
      ctx.fill();
      // Solid ball
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(bPt.x, bPt.y, ballRadius, 0, Math.PI * 2);
      ctx.fill();
      // Colored outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bPt.x, bPt.y, ballRadius, 0, Math.PI * 2);
      ctx.stroke();
      // Highlight
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(bPt.x - ballRadius * 0.25, bPt.y - ballRadius * 0.25, ballRadius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    } else {
      // --- Fully drawn: solid line with arrowhead ---
      ctx.save();
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i <= endIdx; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();

      // Arrowhead
      const last = points[endIdx];
      const prev = points[Math.max(0, endIdx - 1)];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      const arrowLen = 12;
      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x - arrowLen * Math.cos(angle - 0.4), last.y - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(last.x - arrowLen * Math.cos(angle + 0.4), last.y - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawKeyPointDots(ctx, kp) {
    if (!kp) return;
    [kp.start, kp.apex, kp.landing].forEach((pt, i) => {
      if (!pt) return;
      ctx.save();
      ctx.fillStyle = STEPS[i].color;
      ctx.shadowColor = STEPS[i].color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ─── Click handler ───
  const getCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleClick = (e) => {
    if (!tracerMode) return;
    const pt = getCoords(e);
    const stepKey = STEPS[currentStep].key;

    const updated = { ...keyPoints, [stepKey]: pt };
    setKeyPoints(updated);

    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    } else {
      // All 3 placed — trigger animation
      animateArc();
    }
  };

  // ─── Animate the arc drawing ───
  const animateArc = () => {
    setAnimating(true);
    setAnimProgress(0);
    const startTime = performance.now();
    const duration = 1800; // ms — slow enough to see the ball travel

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      setAnimProgress(1 - Math.pow(1 - progress, 3));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setAnimating(false);
      }
    };
    animRef.current = requestAnimationFrame(tick);
  };

  // ─── Finish: save arc to completed paths ───
  const finishPath = () => {
    if (!keyPoints.start || !keyPoints.apex || !keyPoints.landing) return;
    const arcPts = generateArcPoints(keyPoints.start, keyPoints.apex, keyPoints.landing);
    setTracerPaths((prev) => [
      ...prev,
      {
        points: arcPts,
        keyPoints: { ...keyPoints },
        color: tracerColor,
        width: tracerWidth,
        glow: tracerGlow,
      },
    ]);
    resetCurrent();
  };

  const resetCurrent = () => {
    setKeyPoints({});
    setCurrentStep(0);
    setAnimProgress(1);
    if (animRef.current) cancelAnimationFrame(animRef.current);
  };

  const undoLastPoint = () => {
    if (currentStep === 0 && !keyPoints.start) return;
    const newStep = keyPoints[STEPS[currentStep]?.key] ? currentStep : Math.max(0, currentStep - 1);
    const stepKey = STEPS[newStep].key;
    const updated = { ...keyPoints };
    delete updated[stepKey];
    setKeyPoints(updated);
    setCurrentStep(newStep);
    setAnimProgress(1);
  };

  const allPlaced = keyPoints.start && keyPoints.apex && keyPoints.landing;

  return {
    canvas: (
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          cursor: tracerMode ? "crosshair" : "default",
        }}
      />
    ),

    badge: tracerMode ? (
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(0,0,0,0.85)",
          padding: "8px 16px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: `1px solid ${STEPS[Math.min(currentStep, 2)].color}40`,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: allPlaced ? "#00ffaa" : STEPS[Math.min(currentStep, 2)].color,
            animation: "pulse 1.5s infinite",
          }}
        />
        <span style={{ color: allPlaced ? "#00ffaa" : STEPS[Math.min(currentStep, 2)].color }}>
          {allPlaced
            ? "Arc drawn! Click Finish Path to save."
            : `Step ${currentStep + 1}/3: ${STEPS[currentStep].desc}`}
        </span>
      </div>
    ) : null,

    controls: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#fff" }}>
            Shot Tracer
          </h3>

          <button
            onClick={() => {
              if (tracerMode) {
                resetCurrent();
              }
              setTracerMode(!tracerMode);
            }}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              background: tracerMode
                ? "linear-gradient(135deg, #00ffaa, #00cc88)"
                : "rgba(255,255,255,0.08)",
              color: tracerMode ? "#000" : "#fff",
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 14,
            }}
          >
            {tracerMode ? "Plotting Active" : "Start Shot Tracer"}
          </button>

          {/* Step indicators */}
          {tracerMode && (
            <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {STEPS.map((step, i) => {
                const placed = !!keyPoints[step.key];
                const active = currentStep === i && !allPlaced;
                return (
                  <div
                    key={step.key}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${
                        active ? step.color : placed ? `${step.color}50` : "rgba(255,255,255,0.06)"
                      }`,
                      background: active
                        ? `${step.color}15`
                        : placed
                        ? `${step.color}08`
                        : "rgba(0,0,0,0.2)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: placed ? step.color : "rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: placed ? "#000" : "#64748b",
                        flexShrink: 0,
                      }}
                    >
                      {placed ? "✓" : i + 1}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: active ? step.color : placed ? "#e2e8f0" : "#64748b",
                        }}
                      >
                        {step.label}
                      </div>
                      {active && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          {step.desc}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons when plotting */}
          {tracerMode && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <button
                onClick={undoLastPoint}
                disabled={currentStep === 0 && !keyPoints.start}
                style={{
                  flex: 1,
                  minWidth: 80,
                  padding: "8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#94a3b8",
                  cursor: currentStep > 0 || keyPoints.start ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Undo Point
              </button>
              {allPlaced && (
                <button
                  onClick={animateArc}
                  disabled={animating}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    padding: "8px",
                    borderRadius: 8,
                    border: "1px solid rgba(250,204,21,0.4)",
                    background: "rgba(250,204,21,0.1)",
                    color: animating ? "#64748b" : "#facc15",
                    cursor: animating ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {animating ? "Playing..." : "Replay"}
                </button>
              )}
              <button
                onClick={finishPath}
                disabled={!allPlaced}
                style={{
                  flex: 1,
                  minWidth: 80,
                  padding: "8px",
                  borderRadius: 8,
                  border: `1px solid ${allPlaced ? "rgba(0,255,170,0.5)" : "rgba(255,255,255,0.06)"}`,
                  background: allPlaced ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.03)",
                  color: allPlaced ? "#00ffaa" : "#475569",
                  cursor: allPlaced ? "pointer" : "not-allowed",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Finish Path
              </button>
            </div>
          )}

          {/* Color picker */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              Tracer Color
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TRACER_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setTracerColor(c.value)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border:
                      tracerColor === c.value
                        ? "2px solid #fff"
                        : "2px solid rgba(255,255,255,0.1)",
                    background: c.value,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    transform: tracerColor === c.value ? "scale(1.15)" : "scale(1)",
                  }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Width slider */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
              Line Width: {tracerWidth}px
            </div>
            <input
              type="range"
              min={1}
              max={8}
              value={tracerWidth}
              onChange={(e) => setTracerWidth(parseInt(e.target.value))}
              style={{ width: "100%", accentColor: "#00ffaa" }}
            />
          </div>

          {/* Glow toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <input
              type="checkbox"
              checked={tracerGlow}
              onChange={(e) => setTracerGlow(e.target.checked)}
              style={{ accentColor: "#00ffaa" }}
            />
            Glow Effect
          </label>

          {/* Undo / Clear completed paths */}
          {tracerPaths.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setTracerPaths((prev) => prev.slice(0, -1))}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Undo Path
              </button>
              <button
                onClick={() => setTracerPaths([])}
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: 8,
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "rgba(239,68,68,0.1)",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* How-to guide */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#94a3b8" }}>
            How It Works
          </h4>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12,
              color: "#64748b",
              lineHeight: 2,
            }}
          >
            <li>Click "Start Shot Tracer"</li>
            <li>
              <span style={{ color: "#22c55e", fontWeight: 600 }}>Click 1:</span>{" "}
              Ball starting position
            </li>
            <li>
              <span style={{ color: "#facc15", fontWeight: 600 }}>Click 2:</span>{" "}
              Top of the ball flight (apex)
            </li>
            <li>
              <span style={{ color: "#ef4444", fontWeight: 600 }}>Click 3:</span>{" "}
              Landing spot
            </li>
            <li>Arc is drawn automatically!</li>
            <li>Click "Finish Path" to save it</li>
          </ol>
        </div>
      </div>
    ),
  };
}
