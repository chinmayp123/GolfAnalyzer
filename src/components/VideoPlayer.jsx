import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { SKELETON_CONNECTIONS, PHASE_LABELS } from "../utils/constants.js";
import { formatTime } from "../utils/helpers.js";

// ─── Reusable button ───
function Btn({ children, onClick, accent, small, active, ...props }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "4px 10px" : "8px 14px",
        borderRadius: 8,
        border: active ? "1px solid #00ffaa" : "1px solid rgba(255,255,255,0.1)",
        background: accent
          ? "linear-gradient(135deg, #00ffaa, #00cc88)"
          : active
          ? "rgba(0,255,170,0.15)"
          : "rgba(255,255,255,0.05)",
        color: accent ? "#000" : active ? "#00ffaa" : "#e2e8f0",
        cursor: "pointer",
        fontSize: small ? 11 : 14,
        fontWeight: 700,
        transition: "all 0.15s",
      }}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── VideoPlayer Component ───
// Renders the video element, a skeleton overlay canvas, and playback controls.
const VideoPlayer = forwardRef(function VideoPlayer(
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
    analyzingPhase,
    isDetecting,
    phaseLabel,
    phaseSnapshots, // for timeline markers
    trimStart,
    trimEnd,
    onTrimStartChange,
    onTrimEndChange,
    children, // extra overlay canvases (e.g. tracer)
  },
  ref
) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wasPausedRef = useRef(false);

  // Expose the raw video element to parent components
  useImperativeHandle(ref, () => videoRef.current);

  // ─── Draw skeleton overlay ───
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    // Use the displayed size for the canvas so it matches the video on screen exactly
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    canvas.width = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    if (!currentPose || !showSkeleton) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const kps = currentPose.keypoints;
    // MoveNet keypoints are in video pixel space — scale to display size
    const scaleX = displayW / video.videoWidth;
    const scaleY = displayH / video.videoHeight;

    // Connections
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    SKELETON_CONNECTIONS.forEach(([i, j]) => {
      const a = kps[i],
        b = kps[j];
      if (a.score > 0.3 && b.score > 0.3) {
        ctx.strokeStyle = "rgba(0, 255, 170, 0.8)";
        ctx.beginPath();
        ctx.moveTo(a.x * scaleX, a.y * scaleY);
        ctx.lineTo(b.x * scaleX, b.y * scaleY);
        ctx.stroke();
      }
    });

    // Keypoints
    kps.forEach((kp) => {
      if (kp.score > 0.3) {
        ctx.fillStyle = "#00ffaa";
        ctx.shadowColor = "#00ffaa";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(kp.x * scaleX, kp.y * scaleY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
  }, [currentPose, showSkeleton]);

  return (
    <div>
      {/* Video + overlay container */}
      <div
        style={{
          position: "relative",
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          style={{ width: "100%", display: "block" }}
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
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        />

        {/* Extra overlays (shot tracer canvas, etc.) */}
        {children}

        {/* Status badges */}
        {analyzingPhase && (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              background: "rgba(0,0,0,0.8)",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              color: "#00ffaa",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span className="spinner" /> Analyzing {phaseLabel}...
          </div>
        )}

        {isDetecting && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,255,170,0.15)",
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              color: "#00ffaa",
            }}
          >
            POSE TRACKING
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          marginTop: 10,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: "12px 14px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Slider — clean, no overlays */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.001}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          onMouseDown={() => { if (videoRef.current && !videoRef.current.paused) videoRef.current.pause(); }}
          onTouchStart={() => { if (videoRef.current && !videoRef.current.paused) videoRef.current.pause(); }}
          style={{ width: "100%", accentColor: "#00ffaa", cursor: "pointer", display: "block" }}
        />

        {/* Playback controls row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <Btn onClick={() => onStepFrame(-1)} small>⏮</Btn>
            <Btn onClick={onTogglePlay} accent small>{isPlaying ? "⏸" : "▶"}</Btn>
            <Btn onClick={() => onStepFrame(1)} small>⏭</Btn>
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {[0.25, 0.5, 1].map((r) => (
              <Btn key={r} onClick={() => onSetPlaybackRate(r)} small active={playbackRate === r}>{r}x</Btn>
            ))}
          </div>
        </div>

        {/* Phase jump chips — only shown when snapshots exist */}
        {phaseSnapshots && Object.keys(phaseSnapshots).length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {Object.entries(phaseSnapshots).map(([phase, data]) => {
              const labels = { address: "Address", backswing: "Backswing", downswing: "Downswing", impact: "Impact", followThrough: "Finish" };
              const isNear = Math.abs(currentTime - data.time) < 0.15;
              return (
                <button
                  key={phase}
                  onClick={() => onSeek(data.time)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: isNear ? "1px solid #00ffaa" : "1px solid rgba(255,255,255,0.08)",
                    background: isNear ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.04)",
                    color: isNear ? "#00ffaa" : "#94a3b8",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[phase] || phase} <span style={{ opacity: 0.6 }}>{data.time.toFixed(1)}s</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Trim — compact inline row */}
        {duration > 0 && onTrimStartChange && onTrimEndChange && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11 }}>
            <span style={{ color: "#475569", flexShrink: 0 }}>Trim:</span>
            <input
              type="range" min={0} max={duration} step={0.01} value={trimStart || 0}
              onChange={(e) => { const v = parseFloat(e.target.value); if (v < (trimEnd || duration) - 0.1) onTrimStartChange(v); }}
              style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer", height: 3 }}
            />
            <span style={{ color: "#38bdf8", fontFamily: "monospace", fontWeight: 600, minWidth: 35, textAlign: "center" }}>
              {(trimStart || 0).toFixed(1)}
            </span>
            <span style={{ color: "#475569" }}>—</span>
            <span style={{ color: "#f97316", fontFamily: "monospace", fontWeight: 600, minWidth: 35, textAlign: "center" }}>
              {(trimEnd || duration).toFixed(1)}
            </span>
            <input
              type="range" min={0} max={duration} step={0.01} value={trimEnd || duration}
              onChange={(e) => { const v = parseFloat(e.target.value); if (v > (trimStart || 0) + 0.1) onTrimEndChange(v); }}
              style={{ flex: 1, accentColor: "#f97316", cursor: "pointer", height: 3 }}
            />
            {((trimStart || 0) > 0 || (trimEnd || duration) < duration) && (
              <button
                onClick={() => { onTrimStartChange(0); onTrimEndChange(duration); }}
                style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", fontSize: 9, cursor: "pointer" }}
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

export default VideoPlayer;