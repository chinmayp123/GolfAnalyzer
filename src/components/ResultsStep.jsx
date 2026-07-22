import { useMemo, useRef, useState } from "react";
import { BarChart3, Target, ChevronLeft, Sparkles } from "lucide-react";
import { SWING_PHASES, PHASE_LABELS } from "../lib/constants.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import ScoreRing from "./ScoreRing.jsx";
import SkeletonCompare from "./SkeletonCompare.jsx";
import CoachingCard from "./CoachingCard.jsx";
import LaunchMonitorCard from "./LaunchMonitorCard.jsx";

// ─── Form-first results: skeleton stage hero, phase scrubber, joint-angle
// deltas per phase, then tips / launch monitor / coaching ───

const PHASE_SHORT = {
  address: "Address",
  backswing: "Top",
  downswing: "Down",
  impact: "Impact",
  followThrough: "Finish",
};

function PhaseScrubber({ phases, active, onSelect, className = "" }) {
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {phases.map((p) => {
        const isActive = p === active;
        return (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`flex-1 text-center text-[10px] py-1.5 rounded-md cursor-pointer border-none transition-colors ${
              isActive
                ? "bg-fairway-400 text-pine-950 font-semibold"
                : "bg-pine-800 text-ink-400 hover:text-cream-300"
            }`}
          >
            {PHASE_SHORT[p] || PHASE_LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}

function DeltaChip({ metric }) {
  const color = getScoreColor(metric.score);
  const delta = metric.value - metric.benchmark.ideal;
  const onTarget = metric.score >= 85;
  const text = onTarget
    ? "on"
    : `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))}°`;
  return (
    <span
      className="font-mono text-[11px] px-2 py-[3px] rounded-md shrink-0"
      style={{ color, background: `${color}1f` }}
    >
      {text}
    </span>
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
  const coachingRef = useRef(null);

  const analyzedPhases = useMemo(
    () => (results ? SWING_PHASES.filter((p) => results.phaseResults[p]) : []),
    [results]
  );

  // Default the scrubber to the lowest-scoring phase — that's the story.
  const lowestPhase = useMemo(() => {
    if (!results || analyzedPhases.length === 0) return null;
    return analyzedPhases.reduce((worst, p) =>
      results.phaseResults[p].overallScore < results.phaseResults[worst].overallScore
        ? p
        : worst
    );
  }, [results, analyzedPhases]);

  const [selectedPhase, setSelectedPhase] = useState(null);
  const activePhase =
    selectedPhase && results?.phaseResults[selectedPhase] ? selectedPhase : lowestPhase;

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
  const overallColor = getScoreColor(overallScore);
  const topFault = tips?.[0] || null;
  const activeRes = activePhase ? phaseResults[activePhase] : null;
  const hasStage = Boolean(proProfile && session.userSwingFrames?.length > 0);

  const scrollToCoaching = () =>
    coachingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
    <div className="fade-up space-y-6 pb-24 md:pb-0">
      {/* ── Header: back + title + overall score ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onGoToAnalyze}
            className="p-1.5 -ml-1.5 rounded-lg text-ink-400 hover:text-cream-100 hover:bg-cream-50/5 cursor-pointer bg-transparent border-none"
            aria-label="Back to analyze"
          >
            <ChevronLeft size={19} />
          </button>
          <h1 className="font-display text-xl text-cream-50">Form analysis</h1>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[22px]" style={{ color: overallColor }}>
            {overallScore}
          </span>
          <span className="text-[10px] text-ink-500">/100</span>
        </div>
      </div>

      {/* ── Hero: overall ring + per-phase bars (desktop) ── */}
      <div className="card p-6 hidden md:block">
        <div className="flex items-center gap-8">
          <ScoreRing score={overallScore} size={132} />
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

      {/* ── Skeleton stage + per-phase deltas ── */}
      <div
        className={`grid gap-4 ${hasStage ? "md:grid-cols-[minmax(0,1fr)_280px]" : ""}`}
      >
        {hasStage && (
          <div className="flex flex-col gap-3 min-w-0">
            {/* scrubber above the stage on mobile… */}
            <PhaseScrubber
              phases={analyzedPhases}
              active={activePhase}
              onSelect={setSelectedPhase}
              className="md:hidden"
            />
            <SkeletonCompare
              userFrames={session.userSwingFrames}
              userPhaseTimes={Object.fromEntries(
                Object.entries(session.phaseSnapshots || {}).map(([p, s]) => [p, s.time])
              )}
              proProfile={proProfile}
              selectedPhase={activePhase}
              onPhaseChange={setSelectedPhase}
              className="h-[340px] md:h-[460px]"
            />
            {/* …and below it on desktop */}
            <PhaseScrubber
              phases={analyzedPhases}
              active={activePhase}
              onSelect={setSelectedPhase}
              className="hidden md:flex"
            />
          </div>
        )}

        {/* Selected phase: title, score, joint-angle deltas, top fault */}
        {activeRes && (
          <div className="flex flex-col gap-2.5 min-w-0">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-base text-cream-50">
                {PHASE_LABELS[activePhase]}
              </h2>
              <span
                className="font-display text-xl"
                style={{ color: getScoreColor(activeRes.overallScore) }}
              >
                {activeRes.overallScore}
              </span>
            </div>
            {Object.entries(activeRes.metrics || {}).map(([key, m]) => (
              <div key={key} className="card px-3.5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-cream-100 truncate">{m.benchmark.label}</p>
                  <p className="font-mono text-[10px] text-ink-500 mt-0.5">
                    you {m.value}&deg; &middot; pro {m.benchmark.ideal}&deg;
                  </p>
                </div>
                <DeltaChip metric={m} />
              </div>
            ))}
            {topFault && (
              <p className="mt-auto pt-2 text-[11px] leading-relaxed text-ink-400 border-l-2 border-fairway-400 pl-2.5">
                <span className="text-cream-300 font-medium">
                  {topFault.phase} &middot; {topFault.metric}:
                </span>{" "}
                {topFault.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Phase breakdown (desktop — mobile drills in via the scrubber) ── */}
      <section className="hidden md:block">
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
                <div className="space-y-2.5">
                  {Object.entries(res.metrics || {}).map(([key, m]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-cream-300 truncate">{m.benchmark.label}</p>
                        <p className="font-mono text-[11px] text-ink-400">
                          you {m.value}&deg; &middot; pro {m.benchmark.ideal}&deg;
                        </p>
                      </div>
                      <DeltaChip metric={m} />
                    </div>
                  ))}
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

      {/* ── Launch monitor data (manual entry — Shot Scope LM1 etc.) ── */}
      <LaunchMonitorCard
        key={session.scannedFrames ? "lm-scan" : "lm-none"}
        savedShotData={savedShotData}
        onSave={onSaveShotData}
      />

      {/* ── AI coaching ── */}
      <div ref={coachingRef} style={{ scrollMarginTop: 16 }}>
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

    </div>

    {/* ── Sticky coaching CTA (mobile) — outside the fade-up wrapper: its
        retained animation transform would turn `fixed` into
        container-relative positioning ── */}
    <div
      className="fixed inset-x-0 z-30 px-5 pt-8 pb-3 md:hidden pointer-events-none"
      style={{
        bottom: "calc(60px + env(safe-area-inset-bottom))",
        background: "linear-gradient(to top, #0c110d 60%, transparent)",
      }}
    >
      <button
        className="btn-primary w-full py-3 text-[13.5px] pointer-events-auto"
        onClick={scrollToCoaching}
      >
        <Sparkles size={15} />
        {topFault
          ? `Coaching · fix the ${topFault.metric.toLowerCase()}`
          : "Coaching report"}
      </button>
    </div>
    </>
  );
}
