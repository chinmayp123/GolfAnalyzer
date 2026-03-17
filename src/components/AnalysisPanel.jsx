import {
  SWING_PHASES,
  PHASE_LABELS,
} from "../utils/constants.js";
import {
  getScoreColor,
  analyzeKeypoints,
} from "../utils/helpers.js";

// ─── Analysis Panel (sidebar) ───
export default function AnalysisPanel({
  poseModel,
  currentPose,
  showSkeleton,
  onToggleSkeleton,
  phaseSnapshots,
  analyzingPhase,
  fullAnalysisRunning,
  onCapturePhase,
  onRunFullAnalysis,
  onCaptureUserFullSwing,
  capturingUserSwing,
  userCaptureProgress,
  userSwingFrames,
  onSeekToPhase,
  selectedPro,
  onSelectPro,
  customProfiles = [],
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Pro profile selector */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3 style={{ margin: "0 0 10px", fontSize: 14, color: "#fff" }}>
          Compare Against
        </h3>
        {customProfiles.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
            No pro profiles yet. Go to the{" "}
            <strong style={{ color: "#00ffaa" }}>Calibrate Pro</strong> tab to
            upload a pro's swing video and create a profile.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {customProfiles.map((pro) => (
              <button
                key={pro.id}
                onClick={() => onSelectPro(pro.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: selectedPro === pro.id
                    ? `2px solid ${pro.color}`
                    : "2px solid rgba(255,255,255,0.06)",
                  background: selectedPro === pro.id
                    ? `${pro.color}15`
                    : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background:
                      selectedPro === pro.id
                        ? pro.color
                        : "rgba(255,255,255,0.15)",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selectedPro === pro.id ? pro.color : "#94a3b8",
                  }}
                >
                  {pro.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phase capture card */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#fff" }}>
          Swing Phase Capture
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b" }}>
          Navigate to each phase and capture, or run auto-analysis.
        </p>

        <button
          onClick={onRunFullAnalysis}
          disabled={!poseModel || fullAnalysisRunning || !selectedPro}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 10,
            border: "none",
            cursor:
              poseModel && !fullAnalysisRunning && selectedPro ? "pointer" : "not-allowed",
            background:
              poseModel && !fullAnalysisRunning && selectedPro
                ? "linear-gradient(135deg, #00ffaa, #00cc88)"
                : "#1e293b",
            color:
              poseModel && !fullAnalysisRunning && selectedPro ? "#000" : "#475569",
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 14,
            transition: "all 0.2s",
          }}
        >
          {fullAnalysisRunning
            ? "Analyzing..."
            : !poseModel
            ? "Loading Model..."
            : !selectedPro
            ? "Select a Pro Profile First"
            : "Auto-Analyze Full Swing"}
        </button>

        <div
          style={{
            fontSize: 11,
            color: "#475569",
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          — or capture each phase manually —
        </div>

        {SWING_PHASES.map((phase) => (
          <div
            key={phase}
            onClick={() => {
              if (phaseSnapshots[phase] && onSeekToPhase) {
                onSeekToPhase(phaseSnapshots[phase].time);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              cursor: phaseSnapshots[phase] ? "pointer" : "default",
              transition: "background 0.15s",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: phaseSnapshots[phase] ? "#00ffaa" : "#e2e8f0",
                  fontWeight: 600,
                }}
              >
                {phaseSnapshots[phase] ? "✅" : "⬜"} {PHASE_LABELS[phase]}
              </div>
              {phaseSnapshots[phase] && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  Score:{" "}
                  <span
                    style={{
                      color: getScoreColor(phaseSnapshots[phase].overallScore),
                      fontWeight: 700,
                    }}
                  >
                    {phaseSnapshots[phase].overallScore}
                  </span>
                  <span style={{ color: "#475569", marginLeft: 6 }}>
                    @ {phaseSnapshots[phase].time.toFixed(2)}s
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => onCapturePhase(phase)}
              disabled={!poseModel || analyzingPhase === phase || !selectedPro}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid rgba(0,255,170,0.3)",
                background: "rgba(0,255,170,0.1)",
                color: "#00ffaa",
                fontSize: 12,
                cursor: poseModel && selectedPro ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {analyzingPhase === phase ? "..." : "Capture"}
            </button>
          </div>
        ))}
      </div>

      {/* Skeleton toggle */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 12,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          <input
            type="checkbox"
            checked={showSkeleton}
            onChange={(e) => onToggleSkeleton(e.target.checked)}
            style={{ accentColor: "#00ffaa" }}
          />
          Show Skeleton Overlay
        </label>
      </div>

      {/* Capture full swing motion */}
      {onCaptureUserFullSwing && (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 12,
            padding: 16,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <button
            onClick={onCaptureUserFullSwing}
            disabled={!poseModel || capturingUserSwing || Object.keys(phaseSnapshots).length === 0}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 10,
              border: capturingUserSwing ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(56,189,248,0.2)",
              background: capturingUserSwing ? "rgba(56,189,248,0.15)" : userSwingFrames ? "rgba(0,255,170,0.08)" : "rgba(56,189,248,0.08)",
              color: userSwingFrames ? "#00ffaa" : "#38bdf8",
              fontWeight: 600,
              fontSize: 13,
              cursor: poseModel && !capturingUserSwing && Object.keys(phaseSnapshots).length > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.2s",
            }}
          >
            {capturingUserSwing ? (
              <>
                <span className="spinner" />
                Capturing... {userCaptureProgress}%
              </>
            ) : userSwingFrames ? (
              `✓ ${userSwingFrames.length} Frames — Re-capture`
            ) : (
              "Capture Full Swing Motion"
            )}
          </button>
          {!userSwingFrames && !capturingUserSwing && (
            <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginTop: 6 }}>
              Records your skeleton for Pro Swings comparison
            </div>
          )}
        </div>
      )}

    </div>
  );
}
