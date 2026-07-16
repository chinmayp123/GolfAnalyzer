import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, CameraOff, SwitchCamera, Zap, Users, Trash2,
  ChevronDown, Gauge,
} from "lucide-react";
import usePracticeSession from "../hooks/usePracticeSession.js";
import LaunchMonitorCard from "./LaunchMonitorCard.jsx";
import { drawSkeletonOverlay } from "../lib/poseDrawing.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import { PHASE_LABELS } from "../lib/constants.js";

const PHASE_SHORT = {
  address: "Addr",
  backswing: "Top",
  downswing: "Down",
  impact: "Imp",
  followThrough: "Fin",
};

const STATUS_META = {
  off: null,
  watching: { label: "Watching for swings", color: "#5cbc7f", pulse: true },
  swinging: { label: "Swing!", color: "#d8b25c", pulse: false },
  processing: { label: "Scoring…", color: "#d8b25c", pulse: true },
};

function SessionSwingRow({ swing, onDiscard, onShotData }) {
  const [open, setOpen] = useState(false);
  const color = getScoreColor(swing.overallScore);
  const time = new Date(swing.date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="card overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-pine-800"
      >
        {swing.thumbnail ? (
          <img src={swing.thumbnail} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-10 w-7 shrink-0 rounded bg-pine-800" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-ink-500">{time}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {Object.entries(swing.phaseScores || {}).map(([k, v]) => (
              <span key={k} className="rounded bg-pine-800 px-1.5 text-[9px] font-mono text-ink-400">
                {PHASE_SHORT[k] || k} <span style={{ color: getScoreColor(v) }}>{v}</span>
              </span>
            ))}
          </div>
          {swing.shotData && (
            <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-gold-300">
              <Gauge size={10} />
              {[
                swing.shotData.ballSpeed && `${swing.shotData.ballSpeed} mph`,
                swing.shotData.smash && `${swing.shotData.smash} smash`,
                swing.shotData.carry && `${swing.shotData.carry} yds`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-2xl font-semibold" style={{ color }}>
            {swing.overallScore}
          </span>
        </div>
        <button
          type="button"
          className="btn-ghost !p-1.5 shrink-0"
          title="Discard swing"
          onClick={(e) => {
            e.stopPropagation();
            onDiscard(swing.id);
          }}
        >
          <Trash2 size={13} />
        </button>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <div className="fade-up border-t border-cream-50/5 p-3">
          <LaunchMonitorCard
            key={swing.id}
            savedShotData={swing.shotData}
            onSave={(data) => onShotData(swing.id, data)}
          />
        </div>
      )}
    </div>
  );
}

export default function PracticePage({ profiles, selectedProId, onSelectPro }) {
  const proProfile = profiles.find((p) => p.id === selectedProId) || null;
  const practice = usePracticeSession({ proProfile });
  const canvasRef = useRef(null);

  // Skeleton overlay on the live camera
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = practice.videoRef.current;
    if (!canvas || !video) return;
    drawSkeletonOverlay(canvas, video, practice.currentPose?.keypoints || null, {
      color: "#5cbc7f",
    });
  }, [practice.currentPose, practice.videoRef]);

  const stats = useMemo(() => {
    const scores = practice.swings.map((s) => s.overallScore);
    if (!scores.length) return null;
    return {
      count: scores.length,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      best: Math.max(...scores),
    };
  }, [practice.swings]);

  const statusMeta = STATUS_META[practice.status];

  return (
    <div className="fade-up">
      <h1 className="font-display text-3xl text-cream-50">Practice</h1>
      <p className="mt-1 mb-6 max-w-xl text-sm text-ink-400">
        Put your phone or webcam behind you, start the camera, and just hit balls —
        every swing is detected, scored, and saved automatically. Add your launch
        monitor numbers between shots.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT: live camera */}
        <div>
          <div className="flex justify-center overflow-hidden rounded-xl bg-black">
            <div className="relative">
              <video
                ref={practice.videoRef}
                className="block max-h-[68vh] w-auto max-w-full"
                muted
                playsInline
              />
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              {!practice.cameraOn && (
                <div className="flex h-[380px] w-[560px] max-w-full flex-col items-center justify-center gap-4">
                  <Camera size={28} className="text-ink-500" />
                  <p className="max-w-xs text-center text-sm text-ink-400">
                    Camera is off. Film from behind (down-the-line) or face-on, with your
                    whole body in frame.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => practice.startCamera()}>
                    <Camera size={15} /> Start camera
                  </button>
                </div>
              )}
              {practice.cameraOn && statusMeta && (
                <div
                  className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cream-50/10 bg-pine-950/85 px-3.5 py-2 text-[13px] font-medium"
                  style={{ color: statusMeta.color }}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${statusMeta.pulse ? "pulse-dot" : ""}`}
                    style={{ background: statusMeta.color }}
                  />
                  {statusMeta.label}
                </div>
              )}
            </div>
          </div>

          {practice.cameraError && (
            <p className="mt-3 text-sm" style={{ color: "#e0604c" }}>
              {practice.cameraError}
            </p>
          )}

          {practice.cameraOn && (
            <div className="mt-3 flex items-center gap-2">
              <button type="button" className="btn-ghost" onClick={practice.stopCamera}>
                <CameraOff size={15} /> Stop
              </button>
              <button type="button" className="btn-ghost" onClick={practice.flipCamera}>
                <SwitchCamera size={15} /> Flip camera
              </button>
              {practice.modelStatus === "loading" && (
                <span className="flex items-center gap-2 text-xs text-ink-400">
                  <span className="spinner" /> Loading pose model…
                </span>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: session panel */}
        <div className="flex flex-col gap-4">
          {/* Pro selector */}
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-gold-400" />
              <h3 className="text-sm font-medium text-cream-100">Compare against</h3>
            </div>
            {profiles?.length > 0 ? (
              <div className="flex flex-col gap-2">
                {profiles.map((profile) => {
                  const selected = profile.id === selectedProId;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => onSelectPro(profile.id)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        selected
                          ? "bg-pine-700 text-cream-50"
                          : "border-transparent bg-pine-800 text-cream-300 hover:bg-pine-700"
                      }`}
                      style={selected ? { borderColor: profile.color } : undefined}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: profile.color }}
                      />
                      <span className="truncate">{profile.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                Create a pro profile in the Pro Library first — swings are scored
                against it.
              </p>
            )}
          </div>

          {/* Session stats */}
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-fairway-300" />
              <h3 className="text-sm font-medium text-cream-100">This session</h3>
            </div>
            {stats ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-pine-800 py-2.5">
                  <div className="font-mono text-xl text-cream-50">{stats.count}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">Swings</div>
                </div>
                <div className="rounded-lg bg-pine-800 py-2.5">
                  <div className="font-mono text-xl" style={{ color: getScoreColor(stats.avg) }}>
                    {stats.avg}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">Average</div>
                </div>
                <div className="rounded-lg bg-pine-800 py-2.5">
                  <div className="font-mono text-xl" style={{ color: getScoreColor(stats.best) }}>
                    {stats.best}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">Best</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-400">
                No swings yet — they&apos;ll appear here the moment you take one.
              </p>
            )}
          </div>

          {/* Swings list */}
          {practice.swings.length > 0 && (
            <div className="flex flex-col gap-2">
              {practice.swings.map((swing) => (
                <SessionSwingRow
                  key={swing.id}
                  swing={swing}
                  onDiscard={practice.discardSwing}
                  onShotData={practice.attachShotData}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
