import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { SKELETON_CONNECTIONS } from "../utils/constants.js";
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
    children, // extra overlay canvases (e.g. tracer)
  },
  ref
) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Expose the raw video element to parent components
  useImperativeHandle(ref, () => videoRef.current);

  // ─── Draw skeleton overlay ───
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentPose || !showSkeleton) return;

    const kps = currentPose.keypoints;
    const scaleX = canvas.width / (video.videoWidth || video.clientWidth);
    const scaleY = canvas.height / (video.videoHeight || video.clientHeight);

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
          marginTop: 12,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.001}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          style={{
            width: "100%",
            accentColor: "#00ffaa",
            cursor: "pointer",
            marginBottom: 12,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={() => onStepFrame(-1)}>⏮</Btn>
            <Btn onClick={onTogglePlay} accent>
              {isPlaying ? "⏸" : "▶"}
            </Btn>
            <Btn onClick={() => onStepFrame(1)}>⏭</Btn>
          </div>
          <div
            style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}
          >
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[0.25, 0.5, 1].map((r) => (
              <Btn
                key={r}
                onClick={() => onSetPlaybackRate(r)}
                small
                active={playbackRate === r}
              >
                {r}x
              </Btn>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;