import { useEffect, useState } from "react";
import { History, ChevronDown, Trash2, ImageOff } from "lucide-react";
import { listSwings, deleteSwing } from "../lib/storage.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import { PHASE_LABELS } from "../lib/constants.js";
import { formatShotData } from "./LaunchMonitorCard.jsx";

// Compact phase names for chips (PHASE_LABELS are too long for pills)
const PHASE_SHORT = {
  address: "Address",
  backswing: "Backswing",
  downswing: "Downswing",
  impact: "Impact",
  followThrough: "Finish",
};

const LINE = "#5cbc7f"; // fairway-400
const SURFACE = "#141c15"; // pine-850, ring color under dots

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function formatShortDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Score trend line chart (inline SVG, single series) ───
function TrendChart({ swings }) {
  // chronological left → right (listSwings returns newest first)
  const points = [...swings].sort((a, b) => a.id - b.id);
  const n = points.length;

  const W = 640;
  const H = 220;
  const PL = 40; // room for y tick labels
  const PR = 16;
  const PT = 14;
  const PB = 28; // room for x date labels

  const scores = points.map((p) => p.overallScore ?? 0);
  let lo = Math.max(0, Math.floor((Math.min(...scores) - 6) / 10) * 10);
  let hi = Math.min(100, Math.ceil((Math.max(...scores) + 6) / 10) * 10);
  if (hi - lo < 20) {
    lo = Math.max(0, lo - 10);
    hi = Math.min(100, hi + 10);
  }
  const span = hi - lo;
  const step = span <= 25 ? 5 : span <= 50 ? 10 : 20;

  const ticks = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);

  const x = (i) => PL + (i / (n - 1)) * (W - PL - PR);
  const y = (v) => PT + (1 - (v - lo) / span) * (H - PT - PB);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.overallScore ?? 0).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`;

  // thin out x labels: at most ~6
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="card p-5">
      <h2 className="text-sm font-medium text-cream-100">Score trend</h2>
      <p className="text-xs text-ink-400 mt-0.5 mb-3">
        Overall score across your last {n} swings
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Line chart of overall swing score over time, from ${scores[0]} to ${scores[n - 1]}`}
        style={{ maxHeight: 260 }}
      >
        {/* horizontal gridlines — solid hairlines, recessive */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PL}
              x2={W - PR}
              y1={y(t)}
              y2={y(t)}
              stroke={t === lo ? "rgba(247,244,234,0.14)" : "rgba(247,244,234,0.06)"}
              strokeWidth="1"
            />
            <text
              x={PL - 8}
              y={y(t) + 3}
              textAnchor="end"
              fontSize="10"
              fill="#6f7d72"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
            >
              {t}
            </text>
          </g>
        ))}

        {/* x date labels, thinned; always label the last point, and drop a
            regular label that would crowd it */}
        {points.map((p, i) =>
          i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) ? (
            <text
              key={p.id}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#6f7d72"
              fontFamily="'JetBrains Mono', ui-monospace, monospace"
            >
              {formatShortDate(p.date)}
            </text>
          ) : null
        )}

        {/* area wash */}
        <path d={areaPath} fill={LINE} opacity="0.08" />

        {/* the line — 2px, round join/cap */}
        <path
          d={linePath}
          fill="none"
          stroke={LINE}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* dots with surface ring + generous hover target */}
        {points.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.overallScore ?? 0)} r="4" fill={LINE} stroke={SURFACE} strokeWidth="2" />
            <circle cx={x(i)} cy={y(p.overallScore ?? 0)} r="12" fill="transparent">
              <title>{`${formatDateTime(p.date)} — ${p.overallScore ?? 0}/100 vs ${p.proName || "Pro"}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── One saved swing row ───
function SwingRow({ swing, expanded, onToggle, confirming, onDelete }) {
  const score = swing.overallScore ?? 0;
  const color = getScoreColor(score);
  const phases = Object.keys(PHASE_LABELS).filter(
    (k) => swing.phaseScores && swing.phaseScores[k] !== undefined
  );

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-[rgba(247,244,234,0.03)] transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* thumbnail */}
        {swing.thumbnail ? (
          <img
            src={swing.thumbnail}
            alt="Swing thumbnail"
            className="h-16 w-12 object-cover rounded-lg shrink-0 border border-[rgba(247,244,234,0.08)]"
          />
        ) : (
          <div className="h-16 w-12 rounded-lg shrink-0 bg-pine-800 border border-[rgba(247,244,234,0.06)] flex items-center justify-center">
            <ImageOff size={16} className="text-ink-600" />
          </div>
        )}

        {/* meta */}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs text-ink-400">{formatDateTime(swing.date)}</div>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-cream-100">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ background: swing.proColor || "#5cbc7f" }}
            />
            <span className="truncate">vs {swing.proName || "Pro"}</span>
            {swing.shotData && formatShotData(swing.shotData) && (
              <span className="ml-2 hidden truncate font-mono text-[10px] text-gold-300 sm:inline">
                {formatShotData(swing.shotData)}
              </span>
            )}
          </div>
          {/* mini phase chips */}
          {phases.length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1.5 mt-2">
              {phases.map((k) => (
                <span
                  key={k}
                  className="px-2 py-0.5 rounded-full bg-pine-800 text-[10px] font-mono text-ink-400"
                >
                  {PHASE_SHORT[k] || PHASE_LABELS[k]}{" "}
                  <span style={{ color: getScoreColor(swing.phaseScores[k]) }}>
                    {swing.phaseScores[k]}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* overall score */}
        <div className="text-right shrink-0">
          <div className="font-mono text-3xl font-semibold leading-none" style={{ color }}>
            {score}
          </div>
          <div className="text-[10px] uppercase tracking-wider mt-1 text-ink-400">
            {getScoreLabel(score)}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="btn-ghost !p-2 !rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title={confirming ? "Click again to confirm" : "Delete swing"}
            aria-label={confirming ? "Confirm delete" : "Delete swing"}
          >
            {confirming ? (
              <span className="text-xs font-medium" style={{ color: "#e0604c" }}>
                Confirm?
              </span>
            ) : (
              <Trash2 size={15} />
            )}
          </button>
          <ChevronDown
            size={16}
            className={`text-ink-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div className="border-t border-[rgba(247,244,234,0.07)] p-4 fade-up">
          {phases.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
              {phases.map((k) => {
                const ps = swing.phaseScores[k];
                return (
                  <div key={k} className="bg-pine-900 rounded-lg p-3 border border-[rgba(247,244,234,0.05)]">
                    <div className="text-[10px] uppercase tracking-wider text-ink-500 truncate">
                      {PHASE_LABELS[k]}
                    </div>
                    <div
                      className="font-mono text-xl font-semibold mt-1"
                      style={{ color: getScoreColor(ps) }}
                    >
                      {ps}
                    </div>
                    <div className="text-[10px] text-ink-400">{getScoreLabel(ps)}</div>
                  </div>
                );
              })}
            </div>
          )}
          {swing.shotData && formatShotData(swing.shotData) && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-1.5">
                Launch monitor
              </div>
              <div className="font-mono text-sm text-gold-300">
                {formatShotData(swing.shotData)}
              </div>
            </div>
          )}
          {swing.coaching ? (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-2">
                Coaching notes
              </div>
              <p className="whitespace-pre-wrap text-sm text-cream-300 leading-relaxed">
                {swing.coaching}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-500">No coaching report was saved for this swing.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── History page ───
export default function HistoryPage() {
  const [swings, setSwings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listSwings()
      .then((all) => {
        if (!cancelled) setSwings(all);
      })
      .catch((err) => {
        console.error("Failed to load swing history:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    setConfirmingId(null);
    try {
      await deleteSwing(id);
      setSwings(await listSwings());
    } catch (err) {
      console.error("Failed to delete swing:", err);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 fade-up">
      <header className="mb-6">
        <h1 className="font-display text-3xl text-cream-50">History</h1>
        <p className="text-sm text-ink-400 mt-1">
          Every analyzed swing, saved locally on this device.
        </p>
      </header>

      {loading ? (
        <div className="card p-10 flex items-center justify-center gap-3 text-sm text-ink-400">
          <span className="spinner" />
          Loading swing history…
        </div>
      ) : swings.length === 0 ? (
        <div className="card p-10 flex flex-col items-center text-center">
          <History size={36} className="text-ink-500 mb-4" />
          <h2 className="font-display text-xl text-cream-100">No swings yet</h2>
          <p className="text-sm text-ink-400 mt-2 max-w-xs">
            Analyze your first swing and it will be saved here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {swings.length >= 2 && <TrendChart swings={swings} />}
          <div className="space-y-3">
            {swings.map((s) => (
              <SwingRow
                key={s.id}
                swing={s}
                expanded={expandedId === s.id}
                onToggle={() => {
                  setExpandedId(expandedId === s.id ? null : s.id);
                  setConfirmingId(null);
                }}
                confirming={confirmingId === s.id}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
