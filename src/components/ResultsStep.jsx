import { useState } from "react";
import { BarChart3, Target } from "lucide-react";
import { SWING_PHASES, PHASE_LABELS } from "../lib/constants.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import SkeletonCompare from "./SkeletonCompare.jsx";
import CoachingCard from "./CoachingCard.jsx";
import LaunchMonitorCard from "./LaunchMonitorCard.jsx";
import MetricDetail from "./MetricDetail.jsx";

// ─── Results dashboard: hero score, playback comparison, breakdown, coaching ───

function ScoreRing({ score }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  const color = getScoreColor(score);
  return (
    <div className="relative w-44 h-44 shrink-0">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(247,244,234,0.08)" strokeWidth="10" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-5xl text-cream-50 leading-none">{score}</span>
        <span className="text-xs font-medium mt-1.5" style={{ color }}>
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

export default function ResultsStep({
  session,
  proProfile,
  apiKey,
  onOpenSettings,
  onGoToAnalyze,
  onCoachingComplete,
  savedCoaching,
  savedShotData,
  onSaveShotData,
}) {
  const results = session.analysisResults;

  if (!results) {
    return (
      <div className="card p-10 text-center max-w-md mx-auto">
        <BarChart3 size={28} className="text-ink-500 mx-auto mb-3" />
        <h2 className="font-display text-cream-50 text-xl mb-2">No analysis yet</h2>
        <p className="text-sm text-ink-400 mb-5">
          Upload a swing video and run the analysis to see your results here.
        </p>
        <button className="btn-primary text-sm" onClick={onGoToAnalyze}>
          Go to Analyze
        </button>
      </div>
    );
  }

  const { overallScore, phaseResults, tips } = results;
  const analyzedPhases = SWING_PHASES.filter((p) => phaseResults[p]);
  const [detail, setDetail] = useState(null); // {phase, metricKey, metric}

  return (
    <div className="fade-up grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
      {/* ── LEFT column: score, breakdown, tips ── */}
      <div className="space-y-6 min-w-0">
      {/* ── Hero: overall score + per-phase bars ── */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <ScoreRing score={overallScore} />
          <div className="flex-1 w-full min-w-0">
            <p className="text-sm text-ink-400 mb-4">
              Compared against{" "}
              <span className="text-cream-100 font-medium">{proProfile?.name || "your pro"}</span>
            </p>
            <div className="space-y-3">
              {analyzedPhases.map((phase) => {
                const score = phaseResults[phase].overallScore;
                const color = getScoreColor(score);
                return (
                  <div key={phase} className="flex items-center gap-3">
                    <span className="text-xs text-cream-300 w-32 shrink-0 truncate">
                      {PHASE_LABELS[phase]}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-pine-700 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${score}%`, background: color }}
                      />
                    </div>
                    <span className="font-mono text-xs w-8 text-right shrink-0" style={{ color }}>
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase breakdown ── */}
      <section>
        <h2 className="font-display text-cream-50 text-xl mb-3">Phase breakdown</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {analyzedPhases.map((phase) => {
            const res = phaseResults[phase];
            const phaseColor = getScoreColor(res.overallScore);
            return (
              <div key={phase} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-cream-50 text-base">{PHASE_LABELS[phase]}</h3>
                  <span
                    className="font-mono text-xs px-2 py-0.5 rounded-full border"
                    style={{
                      color: phaseColor,
                      borderColor: `${phaseColor}55`,
                      background: `${phaseColor}14`,
                    }}
                  >
                    {res.overallScore}
                  </span>
                </div>
                <div className="space-y-1">
                  {Object.entries(res.metrics || {}).map(([key, m]) => {
                    const mColor = getScoreColor(m.score);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDetail({ phase, metricKey: key, metric: m })}
                        title="Click to see this on your swing"
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 text-left transition-colors hover:bg-cream-50/5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-cream-300 truncate">{m.benchmark.label}</p>
                          <p className="font-mono text-[11px] text-ink-400">
                            you {m.value}&deg; &middot; pro {m.benchmark.ideal}&deg;
                          </p>
                        </div>
                        <span
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded-md shrink-0"
                          style={{ color: mColor, background: `${mColor}18` }}
                        >
                          {m.score}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tips ── */}
      <section>
        <div className="card p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <Target size={17} className="text-gold-400" />
            <h2 className="font-display text-cream-50 text-lg">What to work on</h2>
          </div>
          {tips?.length > 0 ? (
            <ol className="space-y-4">
              {tips.map((tip, i) => (
                <li key={i} className="flex gap-3.5">
                  <span className="w-7 h-7 rounded-lg bg-pine-700 text-cream-100 font-mono text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-cream-50 font-medium">
                      {tip.phase} &mdash; {tip.metric}
                    </p>
                    <p className="text-sm text-ink-400 leading-relaxed mt-0.5">{tip.message}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-cream-300">
              Nothing stands out — every measured position is close to the pro&apos;s. Keep
              grooving this swing.
            </p>
          )}
        </div>
      </section>
      </div>

      {/* ── RIGHT column: comparison, launch monitor, coaching ── */}
      <div className="space-y-6 min-w-0">
        {proProfile && session.userSwingFrames?.length > 0 && (
          <section>
            <h2 className="font-display text-cream-50 text-xl mb-3">Swing comparison</h2>
            <SkeletonCompare
              userFrames={session.userSwingFrames}
              userPhaseTimes={Object.fromEntries(
                Object.entries(session.phaseSnapshots || {}).map(([p, s]) => [p, s.time])
              )}
              proProfile={proProfile}
            />
          </section>
        )}

        {/* ── Launch monitor data (Shot Scope LM1 etc.) ── */}
        <LaunchMonitorCard
          key={session.scannedFrames ? "lm-scan" : "lm-none"}
          savedShotData={savedShotData}
          onSave={onSaveShotData}
        />

        {/* ── AI coaching ── */}
        <CoachingCard
          analysis={{
            proName: proProfile?.name || "Pro",
            overallScore,
            phaseResults,
            shotData: savedShotData || null,
          }}
          apiKey={apiKey}
          onOpenSettings={onOpenSettings}
          initialText={savedCoaching}
          onComplete={onCoachingComplete}
        />
      </div>

      {/* ── Click-through metric inspector ── */}
      {detail && (
        <MetricDetail
          detail={detail}
          proProfile={proProfile}
          userSnapshot={session.phaseSnapshots?.[detail.phase] || null}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
