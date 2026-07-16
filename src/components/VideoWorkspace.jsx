import { useRef, useEffect, forwardRef } from "react";
import { SkipBack, Play, Pause, SkipForward } from "lucide-react";
import { PHASE_LABELS } from "../lib/constants.js";
import { drawSkeletonOverlay } from "../lib/poseDrawing.js";
import { formatTime } from "../lib/metrics.js";

// ─── VideoWorkspace ───
// Video element + skeleton overlay canvas + playback / trim / phase controls.
const VideoWorkspace = forwardRef(function VideoWorkspace(
  {
    videoSrc,
    currentPose,
    showSkeleton,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    onTimeUpdate,
    onLoadedMetadata,
    onPlay,
    onPause,
    onTogglePlay,
    onStepFrame,
    onSeek,
    onSetPlaybackRate,
    trimStart,
    trimEnd,
    onTrimStartChange,
    onTrimEndChange,
    phaseMarkers,
    busyLabel,
    isDetecting,
    children,
  },
  ref
) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Expose the raw <video> element to parents. A callback ref (not
  // useImperativeHandle) so the parent's ref always tracks the *mounted*
  // element even if the video node remounts.
  const attachVideo = (el) => {
    videoRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  // ─── Live skeleton overlay ───
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    drawSkeletonOverlay(canvas, video, showSkeleton ? currentPose?.keypoints : null, {
      color: "#5cbc7f",
    });
  }, [currentPose, showSkeleton]);

  const pauseWhileScrubbing = () => {
    if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
  };

  const start = trimStart || 0;
  const end = trimEnd || duration;
  const showTrim = duration > 0 && onTrimStartChange && onTrimEndChange;
  const isTrimmed = start > 0 || end < duration;

  return (
    <div>
      {/* Video + overlays — inner wrapper shrink-wraps the video so portrait
          clips stay a sane height and overlays keep matching its bounds */}
      <div className="flex justify-center overflow-hidden rounded-xl bg-black">
        <div className="relative">
        <video
          ref={attachVideo}
          src={videoSrc}
          className="block max-h-[68vh] w-auto max-w-full"
          onTimeUpdate={() => onTimeUpdate(videoRef.current?.currentTime || 0)}
          onLoadedMetadata={() => onLoadedMetadata(videoRef.current?.duration || 0)}
          onPlay={onPlay}
          onPause={onPause}
          playsInline
          crossOrigin="anonymous"
        />

        {/* Skeleton canvas */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />

        {/* Extra overlays (shot tracer canvas, etc.) */}
        {children}

        {/* Busy badge — top left */}
        {busyLabel && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-cream-50/10 bg-pine-950/85 px-3.5 py-2 text-[13px] text-fairway-300">
            <span className="spinner" />
            {busyLabel}
          </div>
        )}

        {/* Pose tracking pill — top right */}
        {isDetecting && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-fairway-500/30 bg-pine-950/80 px-2.5 py-1 text-[10px] font-semibold tracking-widest text-fairway-300">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-fairway-400" />
            POSE TRACKING
          </div>
        )}
        </div>
      </div>

      {/* Controls */}
      <div className="card mt-2.5 px-3.5 py-3">
        {/* Seek slider */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.001}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          onMouseDown={pauseWhileScrubbing}
          onTouchStart={pauseWhileScrubbing}
          className="block w-full"
        />

        {/* Transport row */}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => onStepFrame(-1)}
              className="btn-ghost !px-2.5 !py-1.5"
              title="Previous frame"
              aria-label="Previous frame"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={onTogglePlay}
              className="btn-primary !px-3 !py-1.5"
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={() => onStepFrame(1)}
              className="btn-ghost !px-2.5 !py-1.5"
              title="Next frame"
              aria-label="Next frame"
            >
              <SkipForward size={14} />
            </button>
          </div>

          <div className="font-mono text-xs text-ink-400">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          <div className="flex gap-1">
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                onClick={() => onSetPlaybackRate(r)}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                  playbackRate === r
                    ? "border-fairway-500/50 bg-fairway-500/15 text-fairway-300"
                    : "border-cream-50/10 bg-cream-50/[0.04] text-ink-400 hover:text-cream-100"
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>

        {/* Phase jump chips */}
        {phaseMarkers && Object.keys(phaseMarkers).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {Object.entries(phaseMarkers).map(([phase, data]) => {
              const isNear = Math.abs(currentTime - data.time) < 0.15;
              return (
                <button
                  key={phase}
                  onClick={() => onSeek(data.time)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    isNear
                      ? "border-fairway-500/50 bg-fairway-500/15 text-fairway-300"
                      : "border-cream-50/10 bg-cream-50/[0.04] text-ink-400 hover:text-cream-100"
                  }`}
                >
                  {PHASE_LABELS[phase] || phase}{" "}
                  <span className="font-mono opacity-60">{data.time.toFixed(1)}s</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Trim row */}
        {showTrim && (
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="shrink-0 text-ink-500">Trim</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={start}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v < end - 0.1) onTrimStartChange(v);
              }}
              className="h-1 flex-1"
            />
            <span className="min-w-9 text-center font-mono font-semibold text-fairway-300">
              {start.toFixed(1)}
            </span>
            <span className="text-ink-600">—</span>
            <span className="min-w-9 text-center font-mono font-semibold text-gold-400">
              {end.toFixed(1)}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={end}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > start + 0.1) onTrimEndChange(v);
              }}
              className="h-1 flex-1"
            />
            {isTrimmed && (
              <button
                onClick={() => {
                  onTrimStartChange(0);
                  onTrimEndChange(duration);
                }}
                className="rounded border border-cream-50/10 px-1.5 py-0.5 text-[9px] text-ink-400 transition-colors hover:text-cream-100"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default VideoWorkspace;
