import { useState, useRef, useEffect, useCallback } from "react";
import {
  SWING_PHASES,
  PHASE_LABELS,
  KEYPOINT_NAMES,
  SKELETON_CONNECTIONS,
} from "../utils/constants.js";
import { analyzeKeypoints, loadScript } from "../utils/helpers.js";

const PHASE_POSITIONS_HINT = {
  address: "Golfer is set up, club behind ball",
  backswing: "Top of the backswing, club at highest point",
  downswing: "Club dropping, halfway down",
  impact: "Club making contact with the ball",
  followThrough: "Full finish, chest facing target",
};

export default function ProCalibration({ onSaveProfile, onDeleteProfile, existingProfiles = [] }) {
  // Expanded profile viewer
  const [expandedProfile, setExpandedProfile] = useState(null);

  // Video state
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoFileName, setVideoFileName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Model state
  const [poseModel, setPoseModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [currentPose, setCurrentPose] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Calibration state
  const [proName, setProName] = useState("");
  const [proColor, setProColor] = useState("#00ffaa");
  const [phaseMarkers, setPhaseMarkers] = useState({});
  const [activePhase, setActivePhase] = useState("address");
  const [extracting, setExtracting] = useState(false);
  const [extractedBenchmarks, setExtractedBenchmarks] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [autoAnalyzePhase, setAutoAnalyzePhase] = useState(null);
  const [fullSwingFrames, setFullSwingFrames] = useState(null);
  const [capturingSwing, setCapturingSwing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);

  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [draggingTrim, setDraggingTrim] = useState(null); // "start" | "end" | null

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  // ─── Load MoveNet ───
  const loadModel = useCallback(async () => {
    if (poseModel) return;
    setModelLoading(true);
    try {
      if (!window.tf) {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js"
        );
      }
      if (!window.poseDetection) {
        await loadScript(
          "https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js"
        );
      }
      await window.tf.ready();
      const detector = await window.poseDetection.createDetector(
        window.poseDetection.SupportedModels.MoveNet,
        {
          modelType:
            window.poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          enableSmoothing: true,
        }
      );
      setPoseModel(detector);
    } catch (err) {
      console.error("Model load error:", err);
    } finally {
      setModelLoading(false);
    }
  }, [poseModel]);

  // ─── Video upload ───
  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoSrc(URL.createObjectURL(file));
    setVideoFileName(file.name);
    setPhaseMarkers({});
    setExtractedBenchmarks(null);
    setSaveSuccess(false);
    setFullSwingFrames(null);
    setTrimStart(0);
    setTrimEnd(0);
    loadModel();
  };

  // ─── Pose detection loop ───
  const detectPose = useCallback(async () => {
    if (!poseModel || !videoRef.current) return;
    if (videoRef.current.readyState < 2) return;
    try {
      const poses = await poseModel.estimatePoses(videoRef.current);
      if (poses.length > 0) setCurrentPose(poses[0]);
    } catch (_) {}
  }, [poseModel]);

  useEffect(() => {
    if (!poseModel || !videoSrc) return;
    let running = true;
    const loop = async () => {
      if (!running) return;
      await detectPose();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [poseModel, videoSrc, detectPose]);

  // ─── Draw skeleton overlay ───
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    // Match canvas to the displayed video size exactly
    const displayW = video.clientWidth;
    const displayH = video.clientHeight;
    canvas.width = displayW;
    canvas.height = displayH;
    ctx.clearRect(0, 0, displayW, displayH);

    if (!showSkeleton || !currentPose?.keypoints) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const kps = currentPose.keypoints;
    // Scale from video pixel coords to display coords
    const scaleX = displayW / video.videoWidth;
    const scaleY = displayH / video.videoHeight;

    // Draw connections
    ctx.strokeStyle = "rgba(0, 255, 170, 0.8)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    SKELETON_CONNECTIONS.forEach(([i, j]) => {
      const a = kps[i], b = kps[j];
      if (a && b && a.score > 0.3 && b.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(a.x * scaleX, a.y * scaleY);
        ctx.lineTo(b.x * scaleX, b.y * scaleY);
        ctx.stroke();
      }
    });

    // Draw joints
    kps.forEach((kp) => {
      if (kp.score > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x * scaleX, kp.y * scaleY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = "#00ffaa";
        ctx.shadowColor = "#00ffaa";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });
  }, [currentPose, showSkeleton]);

  // ─── Mark current frame as a phase ───
  const markPhase = async (phase) => {
    if (!videoRef.current || !poseModel) return;
    videoRef.current.pause();
    setIsPlaying(false);

    await new Promise((r) => setTimeout(r, 200));
    const poses = await poseModel.estimatePoses(videoRef.current);
    if (poses.length > 0) {
      const kps = poses[0].keypoints;
      const measurements = analyzeKeypoints(kps);
      setPhaseMarkers((prev) => ({
        ...prev,
        [phase]: {
          time: videoRef.current.currentTime,
          keypoints: kps,
          measurements,
        },
      }));

      // Auto-advance to next unmarked phase
      const idx = SWING_PHASES.indexOf(phase);
      if (idx < SWING_PHASES.length - 1) {
        setActivePhase(SWING_PHASES[idx + 1]);
      }
    }
  };

  // ─── Auto-analyze: seek to estimated phase positions and mark all ───
  const runAutoAnalyze = async () => {
    if (!videoRef.current || !poseModel || !duration) return;
    setAutoAnalyzing(true);

    // Use trim range for phase estimation
    const tStart = trimStart || 0;
    const tEnd = trimEnd || duration;
    const trimDuration = tEnd - tStart;

    const positions = {
      address: 0.05,
      backswing: 0.35,
      downswing: 0.55,
      impact: 0.7,
      followThrough: 0.9,
    };

    for (const phase of SWING_PHASES) {
      setAutoAnalyzePhase(phase);
      setActivePhase(phase);
      videoRef.current.currentTime = tStart + trimDuration * positions[phase];
      await new Promise((r) => setTimeout(r, 400));
      await markPhase(phase);
      await new Promise((r) => setTimeout(r, 200));
    }

    setAutoAnalyzing(false);
    setAutoAnalyzePhase(null);

    // Auto-extract benchmarks after all phases are marked
    // Use a short delay to let state settle
    setTimeout(() => extractBenchmarksFromMarkers(), 300);
  };

  // ─── Core extraction logic (accepts markers param for use after auto-analyze) ───
  const phaseMetrics = {
    address: ["spineAngle", "kneeFlexion", "hipAngle"],
    backswing: ["shoulderTurn", "hipTurn", "leftArmAngle", "wristHinge"],
    downswing: ["hipSlide", "lagAngle", "shoulderTilt"],
    impact: ["hipOpen", "shaftLean", "headBehindBall"],
    followThrough: ["extensionAngle", "chestFacing"],
  };

  const metricLabels = {
    spineAngle: "Spine Tilt at Address",
    kneeFlexion: "Knee Flex",
    hipAngle: "Hip Angle",
    shoulderTurn: "Shoulder Turn",
    hipTurn: "Hip Turn",
    leftArmAngle: "Lead Arm Straightness",
    wristHinge: "Wrist Hinge",
    hipSlide: "Hip Lateral Shift (in)",
    lagAngle: "Wrist Lag Angle",
    shoulderTilt: "Shoulder Tilt",
    hipOpen: "Hip Open at Impact",
    shaftLean: "Forward Shaft Lean",
    headBehindBall: "Head Behind Ball (in)",
    extensionAngle: "Arm Extension",
    chestFacing: "Chest to Target",
  };

  const extractBenchmarksFromMarkers = (markers) => {
    const src = markers || phaseMarkers;
    const markedPhases = Object.keys(src);
    if (markedPhases.length === 0) return;

    setExtracting(true);
    const benchmarks = {};

    markedPhases.forEach((phase) => {
      const m = src[phase].measurements;
      const metrics = phaseMetrics[phase];
      if (!metrics) return;

      benchmarks[phase] = {};
      metrics.forEach((key) => {
        const val = m[key];
        if (val !== undefined) {
          // Create a range: ideal = measured value, min/max = ±15% or ±5 degrees
          const spread = Math.max(val * 0.15, 5);
          benchmarks[phase][key] = {
            min: Math.round((val - spread) * 10) / 10,
            max: Math.round((val + spread) * 10) / 10,
            ideal: Math.round(val * 10) / 10,
            label: metricLabels[key] || key,
          };
        }
      });
    });

    setExtractedBenchmarks(benchmarks);
    setExtracting(false);
  };

  // ─── Capture full swing skeleton frame by frame ───
  const captureFullSwing = async () => {
    if (!videoRef.current || !poseModel || !duration) return;

    // Use trim range, fall back to phase markers, fall back to full video
    const markerTimes = Object.values(phaseMarkers).map((d) => d.time);
    const startTime = (trimStart > 0 || trimEnd < duration)
      ? trimStart
      : markerTimes.length > 0 ? Math.max(0, Math.min(...markerTimes) - 0.2) : 0;
    const endTime = (trimStart > 0 || trimEnd < duration)
      ? trimEnd
      : markerTimes.length > 0 ? Math.min(duration, Math.max(...markerTimes) + 0.2) : duration;
    const swingDuration = endTime - startTime;

    // Capture at ~15fps for smooth playback without too much data
    const fps = 15;
    const totalFrames = Math.max(10, Math.ceil(swingDuration * fps));
    const step = swingDuration / totalFrames;

    setCapturingSwing(true);
    setCaptureProgress(0);
    videoRef.current.pause();
    setIsPlaying(false);

    const frames = [];

    for (let i = 0; i <= totalFrames; i++) {
      const t = startTime + i * step;
      videoRef.current.currentTime = t;
      // Wait for the video to seek to the frame
      await new Promise((r) => {
        const onSeeked = () => {
          videoRef.current.removeEventListener("seeked", onSeeked);
          r();
        };
        videoRef.current.addEventListener("seeked", onSeeked);
      });
      // Small delay for the frame to render
      await new Promise((r) => setTimeout(r, 80));

      try {
        const poses = await poseModel.estimatePoses(videoRef.current);
        if (poses.length > 0) {
          // Store compact keypoint data (x, y, score) for each frame
          frames.push({
            time: t,
            keypoints: poses[0].keypoints.map((kp) => ({
              x: kp.x,
              y: kp.y,
              score: kp.score,
            })),
          });
        }
      } catch (_) {}

      setCaptureProgress(Math.round(((i + 1) / (totalFrames + 1)) * 100));
    }

    setFullSwingFrames(frames);
    setCapturingSwing(false);
    setCaptureProgress(100);
  };

  // ─── Save as custom pro profile ───
  const saveProfile = () => {
    if (!proName.trim() || !extractedBenchmarks) return;

    // Build per-phase keypoints and full measurements from the marked phases
    const phaseKeypoints = {};
    const phaseMeasurements = {};
    Object.entries(phaseMarkers).forEach(([phase, data]) => {
      phaseKeypoints[phase] = data.keypoints;
      phaseMeasurements[phase] = data.measurements;
    });

    const profile = {
      id: proName.toLowerCase().replace(/\s+/g, "_"),
      name: proName.trim(),
      color: proColor,
      benchmarks: extractedBenchmarks,
      phaseKeypoints,
      phaseMeasurements,
      fullSwingFrames: fullSwingFrames || null,
      videoFileName,
      createdAt: new Date().toISOString(),
    };
    onSaveProfile(profile);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const allPhasesMarked = SWING_PHASES.every((p) => phaseMarkers[p]);
  const markedCount = Object.keys(phaseMarkers).length;

  // ─── Styles ───
  const card = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 20,
  };

  const btn = (active) => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid " + (active ? "#00ffaa" : "rgba(255,255,255,0.1)"),
    background: active ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.03)",
    color: active ? "#00ffaa" : "#94a3b8",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.2s",
  });

  const primaryBtn = (disabled) => ({
    padding: "10px 24px",
    borderRadius: 10,
    border: "none",
    background: disabled
      ? "rgba(255,255,255,0.05)"
      : "linear-gradient(135deg, #00ffaa, #00cc88)",
    color: disabled ? "#475569" : "#000",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    fontSize: 14,
    opacity: disabled ? 0.5 : 1,
  });

  // ─── No video uploaded yet ───
  if (!videoSrc) {
    return (
      <div>
        <h2 style={{ color: "#fff", margin: "0 0 8px" }}>
          Pro Calibration
        </h2>
        <p style={{ color: "#64748b", margin: "0 0 24px", fontSize: 14 }}>
          Upload a video of a pro golfer's swing to extract real benchmark angles via AI pose detection.
        </p>

        {/* Existing profiles */}
        {existingProfiles.length > 0 && (
          <div style={{ ...card, marginBottom: 24 }}>
            <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 15 }}>
              Saved Pro Profiles ({existingProfiles.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {existingProfiles.map((p) => {
                const isExpanded = expandedProfile === p.id;
                return (
                  <div key={p.id}>
                    <div
                      onClick={() => setExpandedProfile(isExpanded ? null : p.id)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                        background: isExpanded ? `${p.color}15` : "rgba(255,255,255,0.05)",
                        border: `1px solid ${isExpanded ? p.color + "60" : p.color + "40"}`,
                        borderBottom: isExpanded ? "none" : undefined,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: p.color,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{p.name}</div>
                        <div style={{ color: "#475569", fontSize: 11 }}>
                          {p.videoFileName}
                          {p.createdAt && (
                            <> &middot; {new Date(p.createdAt).toLocaleDateString()}</>
                          )}
                          {" "}&middot; {Object.keys(p.benchmarks || {}).length} phases
                        </div>
                      </div>
                      <span style={{ color: isExpanded ? p.color : "#475569", fontSize: 14, flexShrink: 0 }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteProfile(p.id); }}
                        title={`Delete ${p.name}`}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid rgba(239,68,68,0.3)",
                          background: "rgba(239,68,68,0.08)",
                          color: "#ef4444",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Expanded profile details */}
                    {isExpanded && (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: "0 0 10px 10px",
                          background: `${p.color}08`,
                          border: `1px solid ${p.color}60`,
                          borderTop: "none",
                        }}
                      >
                        {Object.entries(p.benchmarks || {}).map(([phase, metrics]) => (
                          <div key={phase} style={{ marginBottom: 12 }}>
                            <div style={{ color: p.color, fontWeight: 700, fontSize: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
                              {PHASE_LABELS[phase]}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                              {Object.entries(metrics).map(([key, bm]) => {
                                // Show actual measured value if available
                                const actualVal = p.phaseMeasurements?.[phase]?.[key];
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "3px 8px",
                                      background: "rgba(0,0,0,0.25)",
                                      borderRadius: 5,
                                      borderLeft: `2px solid ${p.color}50`,
                                    }}
                                  >
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{bm.label}</span>
                                    <span style={{ fontSize: 12, color: p.color, fontWeight: 700, fontFamily: "monospace" }}>
                                      {actualVal !== undefined ? Math.round(actualVal * 10) / 10 : bm.ideal}°
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {Object.keys(p.benchmarks || {}).length === 0 && (
                          <div style={{ fontSize: 12, color: "#475569" }}>No benchmark data saved.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          style={{
            ...card,
            textAlign: "center",
            padding: 60,
            borderStyle: "dashed",
            borderColor: "rgba(0,255,170,0.2)",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎥</div>
          <h3 style={{ color: "#fff", margin: "0 0 8px" }}>
            Upload Pro Swing Video
          </h3>
          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
            Record or download a video of any pro golfer you want to compare against.
            The AI will detect their body positions and extract exact swing angles.
          </p>
          <label
            style={{
              ...primaryBtn(false),
              display: "inline-block",
              cursor: "pointer",
            }}
          >
            Choose Video
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <div
          style={{
            ...card,
            marginTop: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 20 }}>💡</div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
            <strong style={{ color: "#e2e8f0" }}>Tips for best results:</strong>
            <br />
            • Use a down-the-line (behind) camera angle for consistency
            <br />
            • Full swing should be visible from address to finish
            <br />
            • Good lighting and minimal background clutter helps AI detection
            <br />
            • Slow-motion video works great for precise phase marking
          </div>
        </div>
      </div>
    );
  }

  // ─── Main calibration UI ───
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h2 style={{ color: "#fff", margin: "0 0 4px" }}>Pro Calibration</h2>
          <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>
            Mark each swing phase, then extract real benchmark angles
          </p>
        </div>
        <button
          onClick={() => {
            setVideoSrc(null);
            setPhaseMarkers({});
            setExtractedBenchmarks(null);
          }}
          style={btn(false)}
        >
          Upload Different Video
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 600px) 340px",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Left: Video player */}
        <div style={card}>
          <div
            style={{
              position: "relative",
              borderRadius: 10,
              overflow: "hidden",
              background: "#000",
              marginBottom: 16,
            }}
          >
            <video
              ref={videoRef}
              src={videoSrc}
              style={{ width: "100%", display: "block" }}
              onTimeUpdate={() =>
                setCurrentTime(videoRef.current?.currentTime || 0)
              }
              onLoadedMetadata={() => {
                const d = videoRef.current?.duration || 0;
                setDuration(d);
                if (trimEnd === 0) setTrimEnd(d);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              playsInline
            />
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
            {modelLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  background: "rgba(0,0,0,0.7)",
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#00ffaa",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span className="spinner" /> Loading AI Model...
              </div>
            )}
          </div>

          {/* Video controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => {
                if (!videoRef.current) return;
                if (isPlaying) videoRef.current.pause();
                else videoRef.current.play();
                setIsPlaying(!isPlaying);
              }}
              style={btn(false)}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              onClick={() => {
                if (!videoRef.current) return;
                videoRef.current.pause();
                setIsPlaying(false);
                videoRef.current.currentTime = Math.max(
                  0,
                  videoRef.current.currentTime - 1 / 30
                );
              }}
              style={btn(false)}
            >
              ◀ Frame
            </button>
            <button
              onClick={() => {
                if (!videoRef.current) return;
                videoRef.current.pause();
                setIsPlaying(false);
                videoRef.current.currentTime = Math.min(
                  duration,
                  videoRef.current.currentTime + 1 / 30
                );
              }}
              style={btn(false)}
            >
              Frame ▶
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#94a3b8",
                marginLeft: "auto",
              }}
            >
              <input
                type="checkbox"
                checked={showSkeleton}
                onChange={(e) => setShowSkeleton(e.target.checked)}
              />
              Skeleton
            </label>
          </div>

          {/* Timeline */}
          <div style={{ marginTop: 10 }}>
            <input
              type="range" min={0} max={duration || 1} step={0.001} value={currentTime}
              onChange={(e) => { const t = parseFloat(e.target.value); if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t); }}
              onMouseDown={() => { if (videoRef.current && !videoRef.current.paused) { videoRef.current.pause(); setIsPlaying(false); } }}
              onTouchStart={() => { if (videoRef.current && !videoRef.current.paused) { videoRef.current.pause(); setIsPlaying(false); } }}
              style={{ width: "100%", accentColor: "#00ffaa", cursor: "pointer", display: "block" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginTop: 2 }}>
              <span>{currentTime.toFixed(2)}s</span>
              <span>{duration.toFixed(2)}s</span>
            </div>
          </div>

          {/* Phase jump chips */}
          {Object.keys(phaseMarkers).length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {Object.entries(phaseMarkers).map(([phase, data]) => {
                const labels = { address: "Address", backswing: "Backswing", downswing: "Downswing", impact: "Impact", followThrough: "Finish" };
                const isNear = Math.abs(currentTime - data.time) < 0.15;
                return (
                  <button key={phase} onClick={() => { if (videoRef.current) videoRef.current.currentTime = data.time; setCurrentTime(data.time); setActivePhase(phase); }}
                    style={{
                      padding: "3px 8px", borderRadius: 5,
                      border: isNear ? "1px solid #00ffaa" : "1px solid rgba(255,255,255,0.08)",
                      background: isNear ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.04)",
                      color: isNear ? "#00ffaa" : "#94a3b8", fontSize: 10, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {labels[phase] || phase} <span style={{ opacity: 0.6 }}>{data.time.toFixed(1)}s</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Trim — compact inline */}
          {duration > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11 }}>
              <span style={{ color: "#475569", flexShrink: 0 }}>Trim:</span>
              <input type="range" min={0} max={duration} step={0.01} value={trimStart}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v < trimEnd - 0.1) setTrimStart(v); }}
                style={{ flex: 1, accentColor: "#38bdf8", cursor: "pointer", height: 3 }}
              />
              <span style={{ color: "#38bdf8", fontFamily: "monospace", fontWeight: 600, minWidth: 35, textAlign: "center" }}>{trimStart.toFixed(1)}</span>
              <span style={{ color: "#475569" }}>—</span>
              <span style={{ color: "#f97316", fontFamily: "monospace", fontWeight: 600, minWidth: 35, textAlign: "center" }}>{trimEnd.toFixed(1)}</span>
              <input type="range" min={0} max={duration} step={0.01} value={trimEnd}
                onChange={(e) => { const v = parseFloat(e.target.value); if (v > trimStart + 0.1) setTrimEnd(v); }}
                style={{ flex: 1, accentColor: "#f97316", cursor: "pointer", height: 3 }}
              />
              {(trimStart > 0 || trimEnd < duration) && (
                <button onClick={() => { setTrimStart(0); setTrimEnd(duration); }}
                  style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#94a3b8", fontSize: 9, cursor: "pointer" }}
                >Reset</button>
              )}
            </div>
          )}

          {/* Live measurements inside video column */}
          {currentPose && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ffaa", animation: "pulse 2s infinite" }} />
                Live Measurements
              </h4>
              {(() => {
                const m = analyzeKeypoints(currentPose.keypoints);
                const all = [
                  ["Spine Tilt", m.spineAngle], ["Knee Flex", m.kneeFlexion],
                  ["Hip Angle", m.hipAngle], ["Shoulder Turn", m.shoulderTurn],
                  ["Hip Turn", m.hipTurn], ["Lead Arm", m.leftArmAngle],
                  ["Wrist Hinge", m.wristHinge], ["Shoulder Tilt", m.shoulderTilt],
                  ["Lag Angle", m.lagAngle], ["Hip Open", m.hipOpen],
                  ["Shaft Lean", m.shaftLean], ["Extension", m.extensionAngle],
                ];
                return (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
                    {all.map(([label, val]) =>
                      val !== undefined ? (
                        <div key={label} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "4px 8px", background: "rgba(0,0,0,0.25)", borderRadius: 6,
                          borderLeft: "2px solid rgba(0,255,170,0.3)",
                        }}>
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}</span>
                          <span style={{ fontSize: 12, color: "#00ffaa", fontWeight: 700, fontFamily: "monospace" }}>
                            {Math.round(val * 10) / 10}°
                          </span>
                        </div>
                      ) : null
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Right: Phase marking panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Profile info */}
          <div style={card}>
            <h3 style={{ color: "#fff", margin: "0 0 12px", fontSize: 14 }}>
              Profile Name
            </h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={proName}
                onChange={(e) => setProName(e.target.value)}
                placeholder="e.g. Scottie Scheffler"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(0,0,0,0.3)",
                  color: "#e2e8f0",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <input
                type="color"
                value={proColor}
                onChange={(e) => setProColor(e.target.value)}
                title="Pick profile color"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "none",
                  cursor: "pointer",
                  padding: 2,
                }}
              />
            </div>
          </div>

          {/* Phase marking */}
          <div style={card}>
            <h3 style={{ color: "#fff", margin: "0 0 4px", fontSize: 14 }}>
              Mark Swing Phases ({markedCount}/5)
            </h3>
            <p style={{ color: "#64748b", margin: "0 0 12px", fontSize: 12 }}>
              Auto-analyze or scrub to each phase manually.
            </p>

            <button
              onClick={runAutoAnalyze}
              disabled={!poseModel || !duration || autoAnalyzing}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 10,
                border: "none",
                cursor:
                  poseModel && !autoAnalyzing ? "pointer" : "not-allowed",
                background:
                  poseModel && !autoAnalyzing
                    ? "linear-gradient(135deg, #00ffaa, #00cc88)"
                    : "#1e293b",
                color:
                  poseModel && !autoAnalyzing ? "#000" : "#475569",
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 10,
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {autoAnalyzing ? (
                <>
                  <span className="spinner" />
                  Analyzing {autoAnalyzePhase ? PHASE_LABELS[autoAnalyzePhase] : ""}...
                </>
              ) : !poseModel ? (
                "Loading Model..."
              ) : (
                "Auto-Analyze All Phases"
              )}
            </button>

            <div
              style={{
                fontSize: 11,
                color: "#475569",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              — or mark each phase manually —
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SWING_PHASES.map((phase) => {
                const isMarked = !!phaseMarkers[phase];
                const isActive = activePhase === phase;
                return (
                  <div
                    key={phase}
                    onClick={() => setActivePhase(phase)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1px solid ${
                        isActive
                          ? "#00ffaa"
                          : isMarked
                          ? "rgba(0,255,170,0.3)"
                          : "rgba(255,255,255,0.06)"
                      }`,
                      background: isActive
                        ? "rgba(0,255,170,0.08)"
                        : "rgba(0,0,0,0.2)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isMarked ? "#00ffaa" : "#e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {isMarked ? "✓" : "○"} {PHASE_LABELS[phase]}
                      </div>
                      {isActive && !isMarked && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#64748b",
                            marginTop: 4,
                          }}
                        >
                          {PHASE_POSITIONS_HINT[phase]}
                        </div>
                      )}
                      {isMarked && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#475569",
                            marginTop: 2,
                          }}
                        >
                          Marked @ {phaseMarkers[phase].time.toFixed(2)}s
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markPhase(phase);
                        }}
                        disabled={!poseModel}
                        style={{
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "none",
                          background: isMarked
                            ? "rgba(0,255,170,0.2)"
                            : "linear-gradient(135deg, #00ffaa, #00cc88)",
                          color: isMarked ? "#00ffaa" : "#000",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: poseModel ? "pointer" : "default",
                          opacity: poseModel ? 1 : 0.4,
                        }}
                      >
                        {isMarked ? "Re-mark" : "Mark"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Extract + Save */}
          <div style={card}>
            <button
              onClick={() => extractBenchmarksFromMarkers()}
              disabled={markedCount === 0}
              style={{
                ...primaryBtn(markedCount === 0),
                width: "100%",
                marginBottom: 10,
              }}
            >
              {extracting
                ? "Extracting..."
                : `Extract Benchmarks (${markedCount}/5 phases)`}
            </button>

            {extractedBenchmarks && (
              <>
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 8,
                    background: "rgba(0,0,0,0.3)",
                    fontSize: 12,
                  }}
                >
                  {Object.entries(extractedBenchmarks).map(
                    ([phase, metrics]) => (
                      <div key={phase} style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            color: "#00ffaa",
                            fontWeight: 600,
                            marginBottom: 4,
                          }}
                        >
                          {PHASE_LABELS[phase]}
                        </div>
                        {Object.entries(metrics).map(([key, bm]) => (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              color: "#94a3b8",
                              padding: "2px 0",
                            }}
                          >
                            <span>{bm.label}</span>
                            <span style={{ color: "#e2e8f0" }}>
                              {bm.ideal}° ({bm.min}–{bm.max})
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>

                {/* Capture full swing motion */}
                <button
                  onClick={captureFullSwing}
                  disabled={markedCount === 0 || !poseModel || capturingSwing}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: capturingSwing ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(56,189,248,0.2)",
                    background: capturingSwing ? "rgba(56,189,248,0.15)" : fullSwingFrames ? "rgba(0,255,170,0.08)" : "rgba(56,189,248,0.08)",
                    color: fullSwingFrames ? "#00ffaa" : "#38bdf8",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: markedCount > 0 && !capturingSwing ? "pointer" : "not-allowed",
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.2s",
                  }}
                >
                  {capturingSwing ? (
                    <>
                      <span className="spinner" />
                      Capturing Swing... {captureProgress}%
                    </>
                  ) : fullSwingFrames ? (
                    `✓ ${fullSwingFrames.length} Frames Captured — Re-capture`
                  ) : (
                    "Capture Full Swing Motion"
                  )}
                </button>
                {!fullSwingFrames && !capturingSwing && (
                  <div style={{ fontSize: 10, color: "#475569", textAlign: "center", marginBottom: 10 }}>
                    Records skeleton at every frame for smooth Pro Swings animation
                  </div>
                )}

                <button
                  onClick={saveProfile}
                  disabled={!proName.trim()}
                  style={{
                    ...primaryBtn(!proName.trim()),
                    width: "100%",
                  }}
                >
                  {saveSuccess
                    ? "✓ Profile Saved!"
                    : `Save "${proName || "..."}" Profile`}
                </button>
              </>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
