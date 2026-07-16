import { useMemo, useRef, useState, useCallback } from "react";
import {
  Upload,
  Film,
  Trash2,
  Check,
  Circle,
  ChevronDown,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import useSwingSession from "../hooks/useSwingSession.js";
import VideoWorkspace from "./VideoWorkspace.jsx";
import { SWING_PHASES, PHASE_LABELS, PHASE_HINTS } from "../lib/constants.js";
import { extractBenchmarks } from "../lib/metrics.js";

// ─── Pro Library ───
// Upload a pro's swing once, auto-detect their swing phases, and save
// the measured positions as a reusable benchmark profile.

function SavedProfileRow({ profile, onDeleteProfile }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef(null);

  const phasesCount = Object.keys(profile.benchmarks || {}).length;

  const handleDelete = (e) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    clearTimeout(confirmTimer.current);
    onDeleteProfile(profile.id);
  };

  return (
    <div
      className="card overflow-hidden"
      style={expanded ? { borderColor: `${profile.color}55` } : undefined}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
        }}
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-pine-800"
      >
        <span
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{ background: profile.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-cream-50">
            {profile.name}
          </div>
          <div className="truncate text-xs text-ink-500">
            {profile.videoFileName}
            {profile.createdAt && (
              <> &middot; {new Date(profile.createdAt).toLocaleDateString()}</>
            )}{" "}
            &middot; {phasesCount} phase{phasesCount === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          title={confirmDelete ? "Click again to confirm" : `Delete ${profile.name}`}
          className={`btn-ghost flex-shrink-0 px-3 py-1.5 text-xs ${
            confirmDelete ? "text-cream-50" : ""
          }`}
          style={
            confirmDelete
              ? {
                  borderColor: "rgba(224, 96, 76, 0.5)",
                  background: "rgba(224, 96, 76, 0.15)",
                  color: "#e0604c",
                }
              : undefined
          }
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmDelete ? "Sure?" : "Delete"}
        </button>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-ink-500 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {expanded && (
        <div
          className="fade-up border-t px-4 py-4"
          style={{ borderColor: "rgba(247, 244, 234, 0.07)" }}
        >
          {phasesCount === 0 && (
            <p className="text-xs text-ink-500">No benchmark data saved.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {SWING_PHASES.filter((p) => profile.benchmarks?.[p]).map((phase) => (
              <div key={phase}>
                <div
                  className="mb-2 text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: profile.color }}
                >
                  {PHASE_LABELS[phase]}
                </div>
                <div className="flex flex-col gap-1">
                  {Object.entries(profile.benchmarks[phase]).map(([key, bm]) => {
                    const measured = profile.phaseMeasurements?.[phase]?.[key];
                    const value =
                      measured !== undefined
                        ? Math.round(measured * 10) / 10
                        : bm.ideal;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-md bg-pine-900 px-2.5 py-1.5"
                        style={{ borderLeft: `2px solid ${profile.color}55` }}
                      >
                        <span className="text-xs text-ink-400">{bm.label}</span>
                        <span
                          className="font-mono text-xs font-semibold"
                          style={{ color: profile.color }}
                        >
                          {value}&deg;
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProLibrary({ profiles, onSaveProfile, onDeleteProfile }) {
  const session = useSwingSession({ proProfile: null });

  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const [videoFileName, setVideoFileName] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#d8b25c");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const snapshots = session.phaseSnapshots || {};
  const detectedCount = Object.keys(snapshots).length;

  const phaseMarkers = useMemo(() => {
    const markers = {};
    Object.entries(snapshots).forEach(([phase, snap]) => {
      markers[phase] = { time: snap.time };
    });
    return markers;
  }, [snapshots]);

  const previewBenchmarks = useMemo(() => {
    if (detectedCount === 0) return null;
    const phaseMeasurements = {};
    Object.entries(snapshots).forEach(([phase, snap]) => {
      phaseMeasurements[phase] = snap.measurements;
    });
    return extractBenchmarks(phaseMeasurements);
  }, [snapshots, detectedCount]);

  const busyLabel = session.analyzing
    ? session.analyzeStage === "scanning"
      ? `Scanning pro swing… ${session.analyzeProgress}%`
      : "Detecting phases…"
    : undefined;

  // ── Upload handlers ──
  const handleFile = useCallback(
    (file) => {
      if (file && file.type.startsWith("video/")) {
        session.loadFile(file);
        setVideoFileName(file.name);
        setError("");
        setSaved(false);
      }
    },
    [session]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile]
  );

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  // ── Actions ──
  const handleDetect = async () => {
    setError("");
    const res = await session.runAnalysis();
    if (!res.ok) setError(res.error);
  };

  const canSave = name.trim().length > 0 && detectedCount >= 3;

  const handleSave = () => {
    if (!canSave) return;
    const phaseKeypoints = {};
    const phaseMeasurements = {};
    const phaseTimes = {};
    Object.entries(snapshots).forEach(([phase, snap]) => {
      phaseKeypoints[phase] = snap.keypoints;
      phaseMeasurements[phase] = snap.measurements;
      phaseTimes[phase] = snap.time;
    });
    const profile = {
      id: name.toLowerCase().replace(/\s+/g, "_"),
      name: name.trim(),
      color,
      benchmarks: extractBenchmarks(phaseMeasurements),
      phaseKeypoints,
      phaseMeasurements,
      phaseTimes,
      fullSwingFrames: session.userSwingFrames || null,
      videoFileName,
      createdAt: new Date().toISOString(),
    };
    onSaveProfile(profile);
    setSaved(true);
  };

  const handleCalibrateAnother = () => {
    session.reset();
    setVideoFileName("");
    setName("");
    setColor("#d8b25c");
    setError("");
    setSaved(false);
  };

  return (
    <div className="fade-up flex flex-col gap-8">
      {/* Header */}
      <header>
        <h1 className="font-display mb-2 text-3xl text-cream-50">Pro Library</h1>
        <p className="max-w-2xl text-sm text-ink-400">
          Upload any pro&rsquo;s swing once &mdash; SwingAI measures their
          positions automatically and uses them as your benchmark.
        </p>
      </header>

      {/* Saved profiles */}
      {profiles.length > 0 && (
        <section>
          <h2 className="font-display mb-3 text-lg text-cream-100">
            Saved Profiles{" "}
            <span className="font-mono text-sm text-ink-500">
              ({profiles.length})
            </span>
          </h2>
          <div className="flex flex-col gap-2">
            {profiles.map((p) => (
              <SavedProfileRow
                key={p.id}
                profile={p}
                onDeleteProfile={onDeleteProfile}
              />
            ))}
          </div>
        </section>
      )}

      {/* Calibration workflow */}
      <section>
        <h2 className="font-display mb-3 text-lg text-cream-100">
          {profiles.length > 0 ? "Calibrate a New Pro" : "Calibrate Your First Pro"}
        </h2>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {!session.videoSrc ? (
          /* ── Upload dropzone ── */
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`card w-full cursor-pointer px-8 py-14 text-center transition-colors ${
              dragging ? "bg-pine-800" : "hover:bg-pine-800"
            }`}
            style={
              dragging
                ? { borderColor: "var(--color-fairway-400)", borderStyle: "dashed" }
                : { borderStyle: "dashed" }
            }
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-pine-700">
              <Upload className="h-7 w-7 text-gold-300" />
            </div>
            <h3 className="font-display mb-2 text-2xl text-cream-50">
              Upload a pro swing video
            </h3>
            <p className="mx-auto mb-6 max-w-md text-sm text-ink-400">
              Drag and drop a clip here, or click to browse. SwingAI will
              detect the swing phases and extract benchmark angles
              automatically.
            </p>
            <span className="btn-primary pointer-events-none text-sm">
              <Film className="h-4 w-4" />
              Choose Video
            </span>
            <p className="mt-4 text-xs text-ink-500">MP4, MOV, or WebM</p>
          </div>
        ) : (
          /* ── Calibration grid ── */
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* LEFT: video workspace */}
            <div className="min-w-0">
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
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="truncate text-xs text-ink-500">
                  {videoFileName}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-ghost flex-shrink-0 px-3 py-1.5 text-xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Different video
                </button>
              </div>
            </div>

            {/* RIGHT: calibration panel */}
            <div className="flex flex-col gap-4">
              {/* a) Profile */}
              <div className="card p-4">
                <h3 className="font-display mb-3 text-base text-cream-50">
                  Profile
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Scottie Scheffler"
                    className="min-w-0 flex-1 rounded-lg border bg-pine-900 px-3 py-2 text-sm text-cream-50 outline-none placeholder:text-ink-600 focus:border-fairway-500"
                    style={{ borderColor: "rgba(247, 244, 234, 0.1)" }}
                  />
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    title="Profile color"
                    className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
                    style={{ borderColor: "rgba(247, 244, 234, 0.1)" }}
                  />
                </div>
              </div>

              {/* b) Auto-calibrate */}
              <div className="card p-4">
                <h3 className="font-display mb-3 text-base text-cream-50">
                  Auto-Calibrate
                </h3>
                <button
                  type="button"
                  onClick={handleDetect}
                  disabled={
                    session.modelStatus !== "ready" ||
                    !session.duration ||
                    session.analyzing
                  }
                  className="btn-primary w-full text-sm"
                >
                  {session.analyzing ? (
                    <>
                      <span className="spinner" />
                      {session.analyzeStage === "scanning"
                        ? `Scanning… ${session.analyzeProgress}%`
                        : "Detecting phases…"}
                    </>
                  ) : session.modelStatus === "loading" ? (
                    <>
                      <span className="spinner" />
                      Loading pose model…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Auto-Detect Swing Phases
                    </>
                  )}
                </button>
                {session.modelStatus === "error" && (
                  <div
                    className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                    style={{
                      background: "rgba(224, 96, 76, 0.1)",
                      color: "#e0604c",
                    }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Pose model failed to load.
                    <button
                      type="button"
                      onClick={() => session.loadModel()}
                      className="btn-ghost ml-auto px-2 py-1 text-xs"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {error && (
                  <div
                    className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed"
                    style={{
                      background: "rgba(224, 96, 76, 0.1)",
                      color: "#e0604c",
                    }}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <p className="mt-3 text-xs text-ink-500">
                  Tip: trim to a single swing for best detection.
                </p>
              </div>

              {/* c) Detected phases */}
              {detectedCount > 0 && (
                <div className="card fade-up p-4">
                  <h3 className="font-display mb-3 text-base text-cream-50">
                    Detected Phases{" "}
                    <span className="font-mono text-xs text-ink-500">
                      {detectedCount}/{SWING_PHASES.length}
                    </span>
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {SWING_PHASES.map((phase) => {
                      const snap = snapshots[phase];
                      return (
                        <div
                          key={phase}
                          role={snap ? "button" : undefined}
                          tabIndex={snap ? 0 : undefined}
                          onClick={
                            snap
                              ? () => session.videoHandlers.onSeek(snap.time)
                              : undefined
                          }
                          onKeyDown={
                            snap
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ")
                                    session.videoHandlers.onSeek(snap.time);
                                }
                              : undefined
                          }
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                            snap
                              ? "cursor-pointer bg-pine-800 transition-colors hover:bg-pine-700"
                              : "opacity-50"
                          }`}
                        >
                          {snap ? (
                            <Check className="h-4 w-4 flex-shrink-0 text-fairway-400" />
                          ) : (
                            <Circle className="h-4 w-4 flex-shrink-0 text-ink-600" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-cream-100">
                            {PHASE_LABELS[phase]}
                          </span>
                          {snap ? (
                            <>
                              <span className="font-mono text-xs text-ink-400">
                                @ {snap.time.toFixed(2)}s
                              </span>
                              <button
                                type="button"
                                title="Scrub to the correct frame first"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  session.recapturePhase(phase);
                                }}
                                className="btn-ghost flex-shrink-0 px-2 py-1 text-xs"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Re-mark
                              </button>
                            </>
                          ) : (
                            <span className="truncate text-xs text-ink-600">
                              {PHASE_HINTS[phase]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Extracted benchmark preview */}
                  {previewBenchmarks && (
                    <div
                      className="mt-4 max-h-56 overflow-y-auto rounded-lg bg-pine-900 p-3"
                      style={{ border: "1px solid rgba(247, 244, 234, 0.05)" }}
                    >
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-500">
                        Extracted Benchmarks
                      </div>
                      {SWING_PHASES.filter((p) => previewBenchmarks[p]).map(
                        (phase) => (
                          <div key={phase} className="mb-3 last:mb-0">
                            <div className="mb-1 text-xs font-semibold text-fairway-300">
                              {PHASE_LABELS[phase]}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              {Object.entries(previewBenchmarks[phase]).map(
                                ([key, bm]) => (
                                  <div
                                    key={key}
                                    className="flex items-center justify-between py-0.5"
                                  >
                                    <span className="text-xs text-ink-400">
                                      {bm.label}
                                    </span>
                                    <span className="font-mono text-xs text-cream-100">
                                      {bm.ideal}&deg;
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* d) Save */}
              <div className="card p-4">
                {saved ? (
                  <div className="fade-up flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-sm text-fairway-300">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                      Profile saved
                    </div>
                    <button
                      type="button"
                      onClick={handleCalibrateAnother}
                      className="btn-ghost w-full text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Calibrate another
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canSave}
                      className="btn-primary w-full text-sm"
                    >
                      <Check className="h-4 w-4" />
                      Save Profile
                    </button>
                    {!canSave && (
                      <p className="mt-2 text-xs text-ink-500">
                        {!name.trim() && detectedCount < 3
                          ? "Name the profile and detect at least 3 phases to save."
                          : !name.trim()
                            ? "Name the profile to save."
                            : "Detect at least 3 phases to save."}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
