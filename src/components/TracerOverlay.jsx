import { useState, useRef, useEffect } from "react";
import { Pencil, Undo2, RotateCcw, Check, Trash2 } from "lucide-react";
import { TRACER_COLORS } from "../lib/constants.js";

// ─── Shot Tracer (3-Point Guided) ───
// User places: 1) Start (ball address), 2) Top Apex, 3) Landing Spot
// The tracer draws a smooth parabolic arc through all three points.

// Step colors are functional — they're drawn on the canvas dots/labels.
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

export function useShotTracer({ videoRef }) {
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
  const activeStep = STEPS[Math.min(currentStep, 2)];

  const toggle = () => {
    if (tracerMode) resetCurrent();
    setTracerMode(!tracerMode);
  };

  return {
    active: tracerMode,
    toggle,
    setActive: setTracerMode,

    canvas: (
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: tracerMode ? "crosshair" : "default" }}
      />
    ),

    badge: tracerMode ? (
      <div
        className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-pine-950/90 px-3.5 py-2 text-[13px] font-semibold"
        style={{ border: `1px solid ${allPlaced ? "#5cbc7f40" : `${activeStep.color}40`}` }}
      >
        <span
          className="pulse-dot h-2 w-2 rounded-full"
          style={{ background: allPlaced ? "#5cbc7f" : activeStep.color }}
        />
        <span style={{ color: allPlaced ? "#5cbc7f" : activeStep.color }}>
          {allPlaced
            ? "Arc drawn. Click Finish Path to save."
            : `Step ${currentStep + 1}/3: ${STEPS[currentStep].desc}`}
        </span>
      </div>
    ) : null,

    controls: (
      <div className="flex flex-col gap-3">
        <div className="card p-4">
          <h3 className="font-display mb-3.5 text-sm font-semibold text-cream-50">
            Shot Tracer
          </h3>

          <button
            onClick={() => {
              if (tracerMode) {
                resetCurrent();
              }
              setTracerMode(!tracerMode);
            }}
            className={`${tracerMode ? "btn-primary" : "btn-ghost"} mb-3.5 w-full text-sm`}
          >
            <Pencil size={14} />
            {tracerMode ? "Plotting Active" : "Start Shot Tracer"}
          </button>

          {/* Step indicators */}
          {tracerMode && (
            <div className="mb-3.5 flex flex-col gap-1.5">
              {STEPS.map((step, i) => {
                const placed = !!keyPoints[step.key];
                const active = currentStep === i && !allPlaced;
                return (
                  <div
                    key={step.key}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                    style={{
                      border: `1px solid ${
                        active ? step.color : placed ? `${step.color}50` : "rgba(247,244,234,0.06)"
                      }`,
                      background: active
                        ? `${step.color}15`
                        : placed
                        ? `${step.color}08`
                        : "rgba(0,0,0,0.2)",
                    }}
                  >
                    <div
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{
                        background: placed ? step.color : "rgba(247,244,234,0.08)",
                        color: placed ? "#0c110d" : "#6f7d72",
                      }}
                    >
                      {placed ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </div>
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: active ? step.color : placed ? "#efe9d9" : "#6f7d72" }}
                      >
                        {step.label}
                      </div>
                      {active && (
                        <div className="mt-0.5 text-[11px] text-ink-500">{step.desc}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons when plotting */}
          {tracerMode && (
            <div className="mb-3.5 flex flex-wrap gap-2">
              <button
                onClick={undoLastPoint}
                disabled={currentStep === 0 && !keyPoints.start}
                className="btn-ghost min-w-20 flex-1 !px-2 !py-2 text-xs"
              >
                <Undo2 size={13} />
                Undo Point
              </button>
              {allPlaced && (
                <button
                  onClick={animateArc}
                  disabled={animating}
                  className="btn-ghost min-w-20 flex-1 !px-2 !py-2 text-xs !text-gold-400 !border-gold-400/30"
                >
                  <RotateCcw size={13} />
                  {animating ? "Playing..." : "Replay"}
                </button>
              )}
              <button
                onClick={finishPath}
                disabled={!allPlaced}
                className={`${allPlaced ? "btn-primary" : "btn-ghost"} min-w-20 flex-1 !px-2 !py-2 text-xs`}
              >
                <Check size={13} />
                Finish Path
              </button>
            </div>
          )}

          {/* Color picker */}
          <div className="mb-3.5">
            <div className="mb-2 text-xs text-ink-400">Tracer Color</div>
            <div className="flex flex-wrap gap-1.5">
              {TRACER_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setTracerColor(c.value)}
                  title={c.name}
                  aria-label={c.name}
                  className="h-8 w-8 rounded-lg transition-transform"
                  style={{
                    background: c.value,
                    border:
                      tracerColor === c.value
                        ? "2px solid #f7f4ea"
                        : "2px solid rgba(247,244,234,0.1)",
                    transform: tracerColor === c.value ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Width slider */}
          <div className="mb-3.5">
            <div className="mb-1.5 text-xs text-ink-400">
              Line Width: <span className="font-mono text-cream-100">{tracerWidth}px</span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              value={tracerWidth}
              onChange={(e) => setTracerWidth(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Glow toggle */}
          <label className="mb-4 flex cursor-pointer items-center gap-2 text-[13px] text-cream-300">
            <input
              type="checkbox"
              checked={tracerGlow}
              onChange={(e) => setTracerGlow(e.target.checked)}
              className="accent-fairway-500"
            />
            Glow Effect
          </label>

          {/* Undo / Clear completed paths */}
          {tracerPaths.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setTracerPaths((prev) => prev.slice(0, -1))}
                className="btn-ghost flex-1 !px-2 !py-2 text-xs"
              >
                <Undo2 size={13} />
                Undo Path
              </button>
              <button
                onClick={() => setTracerPaths([])}
                className="btn-ghost flex-1 !px-2 !py-2 text-xs !border-red-500/30 !text-red-400"
              >
                <Trash2 size={13} />
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* How-to guide */}
        <div className="card p-4">
          <h4 className="mb-2 text-[13px] font-semibold text-ink-400">How It Works</h4>
          <ol className="m-0 list-decimal pl-4.5 text-xs leading-loose text-ink-500">
            <li>Click "Start Shot Tracer"</li>
            <li>
              <span className="font-semibold" style={{ color: STEPS[0].color }}>Click 1:</span>{" "}
              Ball starting position
            </li>
            <li>
              <span className="font-semibold" style={{ color: STEPS[1].color }}>Click 2:</span>{" "}
              Top of the ball flight (apex)
            </li>
            <li>
              <span className="font-semibold" style={{ color: STEPS[2].color }}>Click 3:</span>{" "}
              Landing spot
            </li>
            <li>Arc is drawn automatically</li>
            <li>Click "Finish Path" to save it</li>
          </ol>
        </div>
      </div>
    ),
  };
}

export default useShotTracer;
