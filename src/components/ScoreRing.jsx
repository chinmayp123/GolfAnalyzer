import { getScoreColor, getScoreLabel } from "../lib/metrics.js";

// ─── Reusable SVG score ring ───
// Sizes used across the app: 82 (home), 96 (web results), 132–176 (results hero).
export default function ScoreRing({ score, size = 96, strokeWidth, showLabel = true }) {
  const sw = strokeWidth ?? Math.max(7, Math.round(size / 12));
  const r = (size - sw) / 2 - 1;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const color = getScoreColor(score);
  const numeralSize = Math.round(size * 0.34);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(247,244,234,0.08)"
          strokeWidth={sw}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-display text-cream-50 leading-none"
          style={{ fontSize: numeralSize }}
        >
          {score}
        </span>
        {showLabel && size >= 96 && (
          <span className="text-xs font-medium mt-1.5" style={{ color }}>
            {getScoreLabel(score)}
          </span>
        )}
      </div>
    </div>
  );
}
