import { useMemo, useState } from "react";
import {
  Sparkles,
  Film,
  Users,
  Eye,
  Crosshair,
  Flag,
  Activity,
} from "lucide-react";
import VideoWorkspace from "./VideoWorkspace.jsx";
import { useShotTracer } from "./TracerOverlay.jsx";
import { SWING_PHASES, PHASE_LABELS } from "../lib/constants.js";
import { analyzeKeypoints, getScoreColor } from "../lib/metrics.js";

// Short labels for the live-measurement grid, in display order.
const LIVE_METRICS = [
  ["spineAngle", "Spine Tilt"],
  ["kneeFlexion", "Knee Flex"],
  ["hipAngle", "Hip Angle"],
  ["shoulderTurn", "Shoulder Turn"],
  ["hipTurn", "Hip Turn"],
  ["leftArmAngle", "Lead Arm"],
  ["wristHinge", "Wrist Hinge"],
  ["shoulderTilt", "Shoulder Tilt"],
  ["lagAngle", "Lag"],
  ["hipOpen", "Hips Open"],
  ["shaftLean", "Shaft Lean"],
  ["extensionAngle", "Extension"],
];

// ─── Analyze Step ───
// Video workspace + pro selection, analysis trigger, detected phases,
// and view options. Purely presentational over useSwingSession.
export default function AnalyzeStep({
  session,
  proProfiles,
  selectedProId,
  onSelectPro,
  onAnalyzed,
  onGoUpload,
}) {
  const [error, setError] = useState(null);
  const tracer = useShotTracer({ videoRef: session.videoRef });

  const phaseMarkers = useMemo(() => {
    const markers = {};
    Object.entries(session.phaseSnapshots || {}).forEach(([phase, snap]) => {
      markers[phase] = { time: snap.time };
    });
    return markers;
  }, [session.phaseSnapshots]);

  const liveMeasurements = useMemo(() => {
    if (!session.currentPose || session.analyzing) return null;
    const m = analyzeKeypoints(session.currentPose.keypoints);
    return LIVE_METRICS.filter(([key]) => m[key] !== undefined)
      .slice(0, 12)
      .map(([key, label]) => ({ key, label, value: m[key] }));
  }, [session.currentPose, session.analyzing]);

  if (!session.videoSrc) {
    return (
      <div className="fade-up flex justify-center py-16">
        <div className="card flex max-w-md flex-col items-center gap-4 px-10 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pine-700">
            <Film className="h-6 w-6 text-ink-400" />
          </div>
          <h2 className="font-display text-xl text-cream-50">No video loaded</h2>
          <p className="text-sm text-ink-400">
            Upload a swing clip first, then come back here to analyze it.
          </p>
          <button type="button" onClick={onGoUpload} className="btn-primary">
            Go to Upload
          </button>
        </div>
      </div>
    );
  }

  const busyLabel = session.analyzing
    ? session.analyzeStage === "scanning"
      ? `Scanning swing… ${session.analyzeProgress}%`
      : "Detecting phases…"
    : undefined;

  const modelReady = session.modelStatus === "ready";
  const analyzeDisabled = session.analyzing || !modelReady || !selectedProId;
  const analyzeLabel = session.analyzing
    ? "Analyzing…"
    : !modelReady
    ? "Loading model…"
    : !selectedProId
    ? "Select a pro first"
    : "Analyze Swing";

  const handleAnalyze = async () => {
    setError(null);
    const res = await session.runAnalysis();
    if (res.ok) onAnalyzed();
    else setError(res.error);
  };

  const toggleTracer = () => {
    if (typeof tracer.toggle === "function") tracer.toggle();
    else if (typeof tracer.setActive === "function") tracer.setActive(!tracer.active);
  };

  const detectedPhases = SWING_PHASES.filter((p) => session.phaseSnapshots?.[p]);

  return (
    <div className="fade-up grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT: video workspace + live measurements */}
      <div className="flex min-w-0 flex-col gap-4">
        <VideoWorkspace
          ref={session.videoRef}
          videoSrc={session.videoSrc}
          currentPose={session.currentPose}
          showSkeleton={session.showSkeleton}
          isPlaying={session.isPlaying}
          currentTime={session.currentTime}
          duration={session.duration}
          playbackRate={session.playbackRate}
          {...session.videoHandlers}
          trimStart={session.trimStart}
          trimEnd={session.trimEnd}
          onTrimStartChange={session.setTrimStart}
          onTrimEndChange={session.setTrimEnd}
          phaseMarkers={phaseMarkers}
          busyLabel={busyLabel}
          isDetecting={session.analyzing}
        >
          {tracer.active && tracer.canvas}
          {tracer.active && tracer.badge}
        </VideoWorkspace>

        {liveMeasurements && liveMeasurements.length > 0 && (
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-fairway-300" />
              <h3 className="text-sm font-medium text-cream-100">
                Live measurements
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {liveMeasurements.map(({ key, label, value }) => (
                <div
                  key={key}
                  className="rounded-lg bg-pine-800 px-3 py-2 text-center"
                >
                  <div className="font-mono text-sm text-fairway-300">
                    {Math.round(value)}°
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-400">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: side panel */}
      <div className="flex flex-col gap-4">
        {/* Compare against */}
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-gold-400" />
            <h3 className="text-sm font-medium text-cream-100">
              Compare against
            </h3>
          </div>
          {proProfiles?.length > 0 ? (
            <div className="flex flex-col gap-2">
              {proProfiles.map((profile) => {
                const selected = profile.id === selectedProId;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onSelectPro(profile.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      selected
                        ? "bg-pine-700 text-cream-50"
                        : "border-transparent bg-pine-800 text-cream-300 hover:bg-pine-700"
                    }`}
                    style={selected ? { borderColor: profile.color } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ background: profile.color }}
                    />
                    <span className="truncate">{profile.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-400">
              Create a pro profile in the Pro Library first.
            </p>
          )}
        </div>

        {/* Analyze */}
        <div className="card p-4">
          <button
            type="button"
            className="btn-primary w-full py-3"
            disabled={analyzeDisabled}
            onClick={handleAnalyze}
          >
            <Sparkles className="h-4 w-4" />
            {analyzeLabel}
          </button>
          {error && (
            <p className="mt-3 text-sm" style={{ color: "#e0604c" }}>
              {error}
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-400">
            Scans every frame, finds your positions automatically, and scores
            them against the pro.
          </p>
        </div>

        {/* Multiple swings in one clip — pick which one to analyze */}
        {session.swingWindows?.length > 1 && (
          <div className="card p-4">
            <h3 className="text-sm font-medium text-cream-100">
              {session.swingWindows.length} swings found in this clip
            </h3>
            <p className="mt-1 mb-3 text-xs text-ink-400">
              Pick the one to analyze — no rescan needed.
            </p>
            <div className="flex flex-wrap gap-2">
              {session.swingWindows.map((w, i) => {
                const active = session.activeSwingIndex === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => session.selectSwing(i)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-fairway-500/50 bg-fairway-500/15 text-fairway-300"
                        : "border-cream-50/10 bg-cream-50/[0.04] text-ink-400 hover:text-cream-100"
                    }`}
                  >
                    Swing {i + 1}{" "}
                    <span className="font-mono text-[11px] opacity-70">
                      @ {w.peakTime.toFixed(1)}s
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Detected phases */}
        {detectedPhases.length > 0 && (
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Flag className="h-4 w-4 text-fairway-300" />
              <h3 className="text-sm font-medium text-cream-100">
                Detected phases
              </h3>
            </div>
            <div className="flex flex-col gap-1.5">
              {detectedPhases.map((phase) => {
                const snap = session.phaseSnapshots[phase];
                return (
                  <div
                    key={phase}
                    role="button"
                    tabIndex={0}
                    onClick={() => session.videoHandlers.onSeek(snap.time)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        session.videoHandlers.onSeek(snap.time);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg bg-pine-800 px-3 py-2 text-sm transition-colors hover:bg-pine-700"
                  >
                    <span className="flex-1 truncate text-cream-100">
                      {PHASE_LABELS[phase]}
                    </span>
                    <span className="font-mono text-xs text-ink-400">
                      @ {snap.time.toFixed(2)}s
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold"
                      style={{
                        color: getScoreColor(snap.overallScore),
                        background: `${getScoreColor(snap.overallScore)}1f`,
                      }}
                    >
                      {snap.overallScore}
                    </span>
                    <button
                      type="button"
                      title="Scrub to the correct frame, then click"
                      onClick={(e) => {
                        e.stopPropagation();
                        session.recapturePhase(phase);
                      }}
                      className="btn-ghost px-2 py-1 text-[11px]"
                    >
                      Re-mark
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* View options */}
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-ink-400" />
            <h3 className="text-sm font-medium text-cream-100">View options</h3>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm text-cream-300">
            <input
              type="checkbox"
              checked={session.showSkeleton}
              onChange={(e) => session.setShowSkeleton(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-fairway-400)]"
            />
            Skeleton overlay
          </label>
          <button
            type="button"
            onClick={toggleTracer}
            className={`mt-2 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
              tracer.active
                ? "border-fairway-600 bg-pine-700 text-fairway-300"
                : "border-transparent bg-pine-800 text-cream-300 hover:bg-pine-700"
            }`}
          >
            <Crosshair className="h-4 w-4" />
            Shot tracer
            <span className="ml-auto text-[11px] text-ink-400">
              {tracer.active ? "On" : "Off"}
            </span>
          </button>
          {tracer.active && <div className="mt-3">{tracer.controls}</div>}
        </div>
      </div>
    </div>
  );
}
