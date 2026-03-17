import { useRef } from "react";

// ─── Upload Screen ───
// Landing page with drag-and-drop video upload and feature cards.
export default function UploadScreen({
  onFileUpload,
  modelLoading,
  modelError,
  onRetryModel,
  videoReady,
  onNext,
}) {
  const fileInputRef = useRef(null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 500,
      }}
    >
      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: "100%",
          maxWidth: 600,
          padding: 60,
          borderRadius: 20,
          border: "2px dashed rgba(0,255,170,0.3)",
          background: "rgba(0,255,170,0.03)",
          cursor: "pointer",
          textAlign: "center",
          transition: "all 0.3s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(0,255,170,0.6)";
          e.currentTarget.style.background = "rgba(0,255,170,0.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(0,255,170,0.3)";
          e.currentTarget.style.background = "rgba(0,255,170,0.03)";
        }}
      >
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏌️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#fff" }}>
          Upload Your Swing Video
        </h2>
        <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 15 }}>
          Drop a video or click to browse. Face-on or down-the-line angles work
          best.
        </p>
        <div
          style={{
            display: "inline-block",
            padding: "12px 32px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #00ffaa, #00cc88)",
            color: "#000",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Choose Video
        </div>
        <p style={{ marginTop: 16, color: "#475569", fontSize: 12 }}>
          MP4, MOV, or WebM — up to 200MB
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={onFileUpload}
        style={{ display: "none" }}
      />

      {/* Video ready → Next button */}
      {videoReady && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#00ffaa", fontWeight: 600 }}>
            ✓ Video loaded successfully
          </div>
          <button
            onClick={onNext}
            style={{
              padding: "12px 40px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #00ffaa, #00cc88)",
              color: "#000",
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            Next: Analyze →
          </button>
        </div>
      )}

      {/* Model loading indicator */}
      {modelLoading && (
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#00ffaa",
            fontSize: 14,
          }}
        >
          <div className="spinner" /> Loading AI pose detection model...
        </div>
      )}

      {/* Model error */}
      {modelError && (
        <div
          style={{
            marginTop: 24,
            color: "#ef4444",
            fontSize: 14,
            padding: "12px 20px",
            background: "rgba(239,68,68,0.1)",
            borderRadius: 10,
          }}
        >
          {modelError}
          <button
            onClick={onRetryModel}
            style={{
              marginLeft: 12,
              color: "#00ffaa",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Feature cards */}
      <div
        style={{
          marginTop: 48,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          maxWidth: 700,
          width: "100%",
        }}
      >
        {[
          {
            icon: "🤖",
            title: "AI Pose Detection",
            desc: "MoveNet analyzes 17 body keypoints in real-time",
          },
          {
            icon: "📐",
            title: "Pro Comparison",
            desc: "Compares your angles against tour pro benchmarks",
          },
          {
            icon: "✏️",
            title: "Shot Tracer",
            desc: "Draw ball flight paths on your video",
          },
        ].map((f, i) => (
          <div
            key={i}
            style={{
              padding: 20,
              borderRadius: 12,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#fff" }}>
              {f.title}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}