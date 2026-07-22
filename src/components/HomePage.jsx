import { useEffect, useState } from "react";
import { ScanLine, ChevronUp, ChevronDown, Flag, Play } from "lucide-react";
import { listSwings } from "../lib/storage.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import ScoreRing from "./ScoreRing.jsx";

// ─── Home dashboard: progress at a glance + start a new analysis ───

function formatHomeDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatSwingDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

// Inline area+line sparkline over the last N swings (chronological)
function Sparkline({ swings, height = 52 }) {
  const points = [...swings].sort((a, b) => a.id - b.id).slice(-8);
  const n = points.length;
  if (n < 2) return null;
  const W = 268;
  const H = height;
  const scores = points.map((p) => p.overallScore ?? 0);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = hi - lo || 1;
  const x = (i) => (i / (n - 1)) * (W - 8) + 4;
  const y = (v) => 6 + (1 - (v - lo) / span) * (H - 14);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.overallScore ?? 0).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
      <path d={area} fill="#5cbc7f" opacity="0.08" />
      <path
        d={line}
        fill="none"
        stroke="#5cbc7f"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x(n - 1)}
        cy={y(scores[n - 1])}
        r="3.5"
        fill="#5cbc7f"
        stroke="#141c15"
        strokeWidth="2"
      />
    </svg>
  );
}

function SwingThumb({ swing, size = "large" }) {
  const cls =
    size === "large"
      ? "w-[46px] h-[60px] rounded-[9px]"
      : "w-[26px] h-[34px] rounded-md";
  return swing.thumbnail ? (
    <img
      src={swing.thumbnail}
      alt=""
      className={`${cls} object-cover shrink-0 border border-cream-50/6`}
    />
  ) : (
    <div
      className={`${cls} shrink-0 border border-cream-50/6 flex items-center justify-center`}
      style={{
        background:
          "repeating-linear-gradient(135deg,#19241b,#19241b 6px,#141c15 6px,#141c15 12px)",
      }}
    >
      <Play size={size === "large" ? 16 : 11} className="text-ink-600" />
    </div>
  );
}

export default function HomePage({ onNewAnalysis, onOpenHistory, onOpenSettings }) {
  const [swings, setSwings] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    listSwings()
      .then((all) => {
        if (!cancelled) setSwings(all);
      })
      .catch(() => {
        if (!cancelled) setSwings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = swings?.[0] || null;
  const previous = swings?.[1] || null;
  const delta =
    latest && previous ? (latest.overallScore ?? 0) - (previous.overallScore ?? 0) : null;

  const scoresAsc = swings ? [...swings].sort((a, b) => a.id - b.id) : [];
  const last8 = scoresAsc.slice(-8);
  const best = swings?.length
    ? Math.max(...swings.map((s) => s.overallScore ?? 0))
    : null;
  const weekAgo = Date.now() - 7 * 86400e3;
  const olderThanWeek = swings?.filter((s) => new Date(s.date).getTime() < weekAgo) || [];
  const sevenDay =
    latest && olderThanWeek.length > 0
      ? (latest.overallScore ?? 0) - (olderThanWeek[0].overallScore ?? 0)
      : null;

  return (
    <div className="fade-up">
      {/* ── Header row ── */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="text-xs text-ink-400">{formatHomeDate()}</div>
          <h1 className="font-display text-[23px] md:text-[26px] text-cream-50 leading-tight mt-0.5">
            {latest ? "Good swings ahead" : "Welcome to SwingAI"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNewAnalysis}
            className="btn-primary hidden md:inline-flex text-sm"
          >
            <ScanLine size={15} />
            New analysis
          </button>
          <button
            onClick={onOpenSettings}
            className="w-[38px] h-[38px] rounded-full bg-pine-700 border border-cream-50/10 flex items-center justify-center text-fairway-300 cursor-pointer md:hidden"
            title="Settings"
            aria-label="Settings"
          >
            <Flag size={16} />
          </button>
        </div>
      </div>

      {swings === null ? (
        <div className="card p-10 flex items-center justify-center gap-3 text-sm text-ink-400">
          <span className="spinner" />
          Loading your swings…
        </div>
      ) : !latest ? (
        /* ── Empty state ── */
        <div className="card p-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-pine-700 flex items-center justify-center mb-4">
            <ScanLine size={26} className="text-fairway-300" />
          </div>
          <h2 className="font-display text-xl text-cream-100">No swings yet</h2>
          <p className="text-sm text-ink-400 mt-2 max-w-xs">
            Upload or record a swing video and SwingAI will score your form
            against a pro — everything runs in your browser.
          </p>
          <button className="btn-primary mt-6" onClick={onNewAnalysis}>
            <ScanLine size={16} />
            Analyze your first swing
          </button>
        </div>
      ) : (
        <>
          {/* ── Desktop stat tiles ── */}
          <div className="hidden md:grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Latest", value: latest.overallScore, color: getScoreColor(latest.overallScore) },
              { label: "Best", value: best, color: "#8fd6a8" },
              { label: "Swings", value: swings.length, color: "#efe9d9" },
              {
                label: "7-day",
                value: sevenDay === null ? "—" : `${sevenDay >= 0 ? "+" : ""}${sevenDay}`,
                color: sevenDay === null ? "#6f7d72" : sevenDay >= 0 ? "#5cbc7f" : "#e0604c",
              },
            ].map((t) => (
              <div key={t.label} className="card px-4 py-3.5">
                <div className="text-[10.5px] text-ink-500 uppercase tracking-wider">{t.label}</div>
                <div className="font-display text-[28px] mt-1 leading-none" style={{ color: t.color }}>
                  {t.value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
            <div className="flex flex-col gap-4 min-w-0">
              {/* ── Latest score card (mobile hero) ── */}
              <div
                className="card p-[18px] flex items-center gap-4 md:hidden"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(63,164,106,0.14), rgba(20,28,21,0.6))",
                }}
              >
                <ScoreRing score={latest.overallScore ?? 0} size={82} showLabel={false} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-ink-400">Latest swing score</div>
                  <div
                    className="text-[15px] font-semibold mt-0.5 mb-1.5"
                    style={{ color: getScoreColor(latest.overallScore ?? 0) }}
                  >
                    {getScoreLabel(latest.overallScore ?? 0)}
                  </div>
                  {delta !== null && (
                    <div
                      className="flex items-center gap-1.5 text-[11.5px]"
                      style={{ color: delta >= 0 ? "#8fd6a8" : "#e0604c" }}
                    >
                      {delta >= 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {delta >= 0 ? "+" : ""}
                      {delta} vs last swing
                    </div>
                  )}
                </div>
              </div>

              {/* ── Trend card ── */}
              {last8.length >= 2 && (
                <div className="card px-4 py-[15px] md:p-5 md:flex-1 flex flex-col">
                  <div className="flex justify-between items-baseline mb-2.5">
                    <span className="text-xs md:text-[13px] text-cream-300 font-medium">
                      Last {last8.length} swings
                    </span>
                    <span className="font-mono text-[10px] text-ink-500">
                      {last8[0].overallScore} → {last8[last8.length - 1].overallScore}
                    </span>
                  </div>
                  <div className="h-[52px] md:hidden">
                    <Sparkline swings={last8} height={52} />
                  </div>
                  <div className="hidden md:block md:flex-1 md:min-h-[52px]">
                    <Sparkline swings={last8} height={170} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Recent swings ── */}
            <div className="min-w-0">
              <div className="text-[11px] text-ink-500 uppercase tracking-wider mb-2 md:hidden">
                Pick up where you left off
              </div>
              <span className="hidden md:block text-[13px] text-cream-100 font-medium mb-2">
                Recent swings
              </span>
              <div className="flex flex-col gap-2.5">
                {(swings || []).slice(0, 3).map((s, i) => (
                  <button
                    key={s.id}
                    onClick={onOpenHistory}
                    className={`card p-3 flex items-center gap-3 text-left cursor-pointer hover:bg-pine-800 transition-colors w-full ${
                      i > 0 ? "hidden md:flex" : "flex"
                    }`}
                  >
                    <SwingThumb swing={s} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[10.5px] text-ink-500">
                        {formatSwingDate(s.date)}
                      </div>
                      <div className="text-[13px] text-cream-100 mt-0.5 flex items-center gap-1.5">
                        <span
                          className="w-[7px] h-[7px] rounded-full shrink-0"
                          style={{ background: s.proColor || "#5cbc7f" }}
                        />
                        <span className="truncate">vs {s.proName || "Pro"}</span>
                      </div>
                    </div>
                    <div
                      className="font-mono text-2xl leading-none shrink-0"
                      style={{ color: getScoreColor(s.overallScore ?? 0) }}
                    >
                      {s.overallScore ?? 0}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Mobile primary CTA ── */}
          <button
            className="btn-primary w-full mt-5 py-3.5 text-[14.5px] md:hidden"
            onClick={onNewAnalysis}
          >
            <ScanLine size={17} />
            Analyze a new swing
          </button>
        </>
      )}
    </div>
  );
}
