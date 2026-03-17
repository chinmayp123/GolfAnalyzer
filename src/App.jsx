import { useState, useRef, useEffect, useCallback } from "react";

import {
  SWING_PHASES,
  PHASE_LABELS,
} from "./utils/constants.js";
import {
  analyzeKeypoints,
  scoreMetric,
  loadScript,
} from "./utils/helpers.js";

import UploadScreen from "./components/UploadScreen.jsx";
import VideoPlayer from "./components/VideoPlayer.jsx";
import AnalysisPanel from "./components/AnalysisPanel.jsx";
import ShotTracer from "./components/ShotTracer.jsx";
import Results from "./components/Results.jsx";
import ProSwings from "./components/ProSwings.jsx";
import ProCalibration from "./components/ProCalibration.jsx";

// ─── Main Application Shell ───
export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState("calibrate");

  // Video state
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  // Pose detection
  const [poseModel, setPoseModel] = useState(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState(null);
  const [currentPose, setCurrentPose] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);

  // Analysis
  const [phaseSnapshots, setPhaseSnapshots] = useState({});
  const [analysisResults, setAnalysisResults] = useState(null);
  const [analyzingPhase, setAnalyzingPhase] = useState(null);
  const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false);
  const [selectedPro, setSelectedPro] = useState(null);
  const [userSwingFrames, setUserSwingFrames] = useState(null);
  const [capturingUserSwing, setCapturingUserSwing] = useState(false);
  const [userCaptureProgress, setUserCaptureProgress] = useState(0);

  // Custom pro profiles (from Pro Calibration)
  const [customProfiles, setCustomProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem("swingai_custom_profiles");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleSaveProfile = (profile) => {
    setCustomProfiles((prev) => {
      const filtered = prev.filter((p) => p.id !== profile.id);
      const updated = [...filtered, profile];
      localStorage.setItem("swingai_custom_profiles", JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteProfile = (profileId) => {
    setCustomProfiles((prev) => {
      const updated = prev.filter((p) => p.id !== profileId);
      localStorage.setItem("swingai_custom_profiles", JSON.stringify(updated));
      return updated;
    });
    if (selectedPro === profileId) setSelectedPro(null);
  };

  const videoRef = useRef(null);
  const animFrameRef = useRef(null);

  // ─── Load TensorFlow.js + MoveNet ───
  const loadModel = useCallback(async () => {
    if (poseModel) return;
    setModelLoading(true);
    setModelError(null);
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
      setModelError(
        "Failed to load pose detection model. Check your internet connection and try again."
      );
    } finally {
      setModelLoading(false);
    }
  }, [poseModel]);

  // ─── Video upload handler ───
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoSrc(URL.createObjectURL(file));
    setPhaseSnapshots({});
    setAnalysisResults(null);
    setTrimStart(0);
    setTrimEnd(0);
    setUserSwingFrames(null);
    loadModel();
  };

  // ─── Playback controls ───
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const stepFrame = (dir) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    videoRef.current.currentTime = Math.max(
      0,
      Math.min(duration, videoRef.current.currentTime + dir / 30)
    );
  };

  const seekTo = (t) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const changePlaybackRate = (r) => {
    setPlaybackRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  // ─── Pose detection loop ───
  const detectPose = useCallback(async () => {
    if (!poseModel || !videoRef.current) return;
    if (videoRef.current.readyState < 2) return;
    try {
      const poses = await poseModel.estimatePoses(videoRef.current);
      if (poses.length > 0) setCurrentPose(poses[0]);
    } catch (_) {
      /* ignore per-frame errors */
    }
  }, [poseModel]);

  useEffect(() => {
    if (!poseModel || !videoSrc) return;
    setIsDetecting(true);
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
      setIsDetecting(false);
    };
  }, [poseModel, videoSrc, detectPose]);

  // ─── Phase snapshot capture ───
  const capturePhaseSnapshot = async (phase) => {
    if (!videoRef.current || !poseModel) return;
    setAnalyzingPhase(phase);
    videoRef.current.pause();
    setIsPlaying(false);

    await new Promise((r) => setTimeout(r, 200));
    const poses = await poseModel.estimatePoses(videoRef.current);
    if (poses.length > 0) {
      const kps = poses[0].keypoints;
      const measurements = analyzeKeypoints(kps);
      // Look up benchmarks from custom profiles
      const customProfile = customProfiles.find((p) => p.id === selectedPro);
      const benchmarks = customProfile?.benchmarks?.[phase] || {};
      const metrics = {};
      let totalScore = 0,
        count = 0;

      Object.entries(benchmarks).forEach(([key, bm]) => {
        const val = measurements[key];
        if (val !== undefined) {
          const score = scoreMetric(val, bm);
          metrics[key] = {
            value: Math.round(val * 10) / 10,
            score,
            benchmark: bm,
          };
          totalScore += score;
          count++;
        }
      });

      setPhaseSnapshots((prev) => ({
        ...prev,
        [phase]: {
          time: videoRef.current.currentTime,
          keypoints: kps,
          measurements,
          metrics,
          overallScore: count > 0 ? Math.round(totalScore / count) : 0,
        },
      }));
    }
    setAnalyzingPhase(null);
  };

  // ─── Auto-analyze all phases ───
  const runFullAnalysis = async () => {
    if (!videoRef.current || !poseModel || !duration) return;
    setFullAnalysisRunning(true);
    const positions = {
      address: 0.05,
      backswing: 0.35,
      downswing: 0.55,
      impact: 0.7,
      followThrough: 0.9,
    };
    const tStart = trimStart || 0;
    const tEnd = trimEnd || duration;
    const trimDuration = tEnd - tStart;
    for (const phase of SWING_PHASES) {
      videoRef.current.currentTime = tStart + trimDuration * positions[phase];
      await new Promise((r) => setTimeout(r, 400));
      await capturePhaseSnapshot(phase);
      await new Promise((r) => setTimeout(r, 200));
    }
    setFullAnalysisRunning(false);
    setActiveTab("results");
  };

  // ─── Capture user's full swing frame by frame ───
  const captureUserFullSwing = async () => {
    if (!videoRef.current || !poseModel || !duration) return;

    const tStart = trimStart || 0;
    const tEnd = trimEnd || duration;
    const swingDuration = tEnd - tStart;
    const fps = 15;
    const totalFrames = Math.max(10, Math.ceil(swingDuration * fps));
    const step = swingDuration / totalFrames;

    setCapturingUserSwing(true);
    setUserCaptureProgress(0);
    videoRef.current.pause();
    setIsPlaying(false);

    const frames = [];
    for (let i = 0; i <= totalFrames; i++) {
      const t = tStart + i * step;
      videoRef.current.currentTime = t;
      await new Promise((r) => {
        const onSeeked = () => { videoRef.current.removeEventListener("seeked", onSeeked); r(); };
        videoRef.current.addEventListener("seeked", onSeeked);
      });
      await new Promise((r) => setTimeout(r, 80));
      try {
        const poses = await poseModel.estimatePoses(videoRef.current);
        if (poses.length > 0) {
          frames.push({
            time: t,
            keypoints: poses[0].keypoints.map((kp) => ({ x: kp.x, y: kp.y, score: kp.score })),
          });
        }
      } catch (_) {}
      setUserCaptureProgress(Math.round(((i + 1) / (totalFrames + 1)) * 100));
    }

    setUserSwingFrames(frames);
    setCapturingUserSwing(false);
    setUserCaptureProgress(100);
  };

  // ─── Compute results whenever snapshots change ───
  useEffect(() => {
    const phases = Object.keys(phaseSnapshots);
    if (phases.length === 0) {
      setAnalysisResults(null);
      return;
    }
    const phaseResults = {};
    let grandTotal = 0;
    phases.forEach((phase) => {
      const s = phaseSnapshots[phase];
      phaseResults[phase] = {
        overallScore: s.overallScore,
        metrics: s.metrics,
        time: s.time,
      };
      grandTotal += s.overallScore;
    });

    const tips = [];
    const customProfile = customProfiles.find((p) => p.id === selectedPro);
    phases.forEach((phase) => {
      Object.entries(phaseSnapshots[phase].metrics).forEach(([key, m]) => {
        if (m.score < 65) {
          const proMeasured = customProfile?.phaseMeasurements?.[phase]?.[key];
          const proVal = proMeasured !== undefined ? proMeasured : m.benchmark.ideal;
          const diff = m.value - proVal;
          tips.push({
            phase: PHASE_LABELS[phase],
            metric: m.benchmark.label,
            message: `Your ${m.benchmark.label.toLowerCase()} is ${Math.abs(
              Math.round(diff)
            )}° ${diff > 0 ? "too much" : "not enough"} (yours: ${Math.round(
              m.value
            )}°, pro: ${Math.round(proVal * 10) / 10}°).`,
            score: m.score,
            userValue: m.value,
            proValue: proMeasured,
            idealValue: m.benchmark.ideal,
          });
        }
      });
    });
    tips.sort((a, b) => a.score - b.score);

    setAnalysisResults({
      overallScore: Math.round(grandTotal / phases.length),
      phaseResults,
      tips: tips.slice(0, 8),
    });
  }, [phaseSnapshots, customProfiles, selectedPro]);

  // ─── Shot tracer hook (returns canvas + controls) ───
  const tracer = ShotTracer({ videoRef });

  // ─── Shared video player props ───
  const videoPlayerProps = {
    videoSrc,
    currentPose,
    showSkeleton,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    onTimeUpdate: setCurrentTime,
    onLoadedMetadata: (d) => { setDuration(d); if (trimEnd === 0) setTrimEnd(d); },
    trimStart,
    trimEnd,
    onTrimStartChange: setTrimStart,
    onTrimEndChange: setTrimEnd,
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onTogglePlay: togglePlay,
    onStepFrame: stepFrame,
    onSeek: seekTo,
    onSetPlaybackRate: changePlaybackRate,
    isDetecting,
  };

  // ─── Render ───
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #0a0f1e 0%, #0d1a2d 50%, #0a1628 100%)",
        color: "#e2e8f0",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid rgba(0,255,170,0.15)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(10px)",
          background: "rgba(10,15,30,0.8)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "linear-gradient(135deg, #00ffaa, #00cc88)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            ⛳
          </div>
          <div>
            <h1
              style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}
            >
              SwingAI Pro
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              AI-Powered Golf Swing Analyzer
            </p>
          </div>
        </div>
        {poseModel && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,255,170,0.1)",
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
              color: "#00ffaa",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00ffaa",
                animation: "pulse 2s infinite",
              }}
            />
            AI Model Ready
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "12px 24px",
          background: "rgba(0,0,0,0.2)",
        }}
      >
        {[
          { id: "calibrate", label: "Calibrate Pro", icon: "🎯" },
          { id: "upload", label: "Upload", icon: "📁" },
          { id: "analyze", label: "Analyze", icon: "🔍" },
          { id: "results", label: "Results", icon: "📊" },
          { id: "proswings", label: "Pro Swings", icon: "🏌️" },
          { id: "tracer", label: "Shot Tracer", icon: "✏️" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.2s",
              background:
                activeTab === tab.id
                  ? "rgba(0,255,170,0.15)"
                  : "transparent",
              color: activeTab === tab.id ? "#00ffaa" : "#64748b",
              borderBottom:
                activeTab === tab.id
                  ? "2px solid #00ffaa"
                  : "2px solid transparent",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {/* Upload */}
        {activeTab === "upload" && (
          <UploadScreen
            onFileUpload={handleFileUpload}
            modelLoading={modelLoading}
            modelError={modelError}
            onRetryModel={loadModel}
            videoReady={!!videoSrc}
            onNext={() => setActiveTab("analyze")}
          />
        )}

        {/* Analyze */}
        {activeTab === "analyze" &&
          (videoSrc ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 600px) 340px",
                gap: 24,
                alignItems: "start",
              }}
            >
              {/* Left: Video + Live Measurements */}
              <div>
                <VideoPlayer
                  ref={videoRef}
                  {...videoPlayerProps}
                  analyzingPhase={analyzingPhase}
                  phaseLabel={
                    analyzingPhase ? PHASE_LABELS[analyzingPhase] : ""
                  }
                  phaseSnapshots={phaseSnapshots}
                />
                {/* Live Measurements below video */}
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

              {/* Right: Analysis Controls */}
              <AnalysisPanel
                poseModel={poseModel}
                videoRef={videoRef}
                currentPose={currentPose}
                showSkeleton={showSkeleton}
                onToggleSkeleton={setShowSkeleton}
                phaseSnapshots={phaseSnapshots}
                analyzingPhase={analyzingPhase}
                fullAnalysisRunning={fullAnalysisRunning}
                onCapturePhase={capturePhaseSnapshot}
                onRunFullAnalysis={runFullAnalysis}
                onCaptureUserFullSwing={captureUserFullSwing}
                capturingUserSwing={capturingUserSwing}
                userCaptureProgress={userCaptureProgress}
                userSwingFrames={userSwingFrames}
                onSeekToPhase={seekTo}
                selectedPro={selectedPro}
                onSelectPro={setSelectedPro}
                customProfiles={customProfiles}
              />
            </div>
          ) : (
            <NoVideo onGo={() => setActiveTab("upload")} />
          ))}

        {/* Shot Tracer */}
        {activeTab === "tracer" &&
          (videoSrc ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 280px",
                gap: 24,
              }}
            >
              <VideoPlayer ref={videoRef} {...videoPlayerProps}>
                {tracer.canvas}
                {tracer.badge}
              </VideoPlayer>
              {tracer.controls}
            </div>
          ) : (
            <NoVideo onGo={() => setActiveTab("upload")} />
          ))}

        {/* Results */}
        {activeTab === "results" && (
          <Results
            analysisResults={analysisResults}
            phaseSnapshots={phaseSnapshots}
            selectedPro={selectedPro}
            customProfiles={customProfiles}
            userSwingFrames={userSwingFrames}
            onGoToAnalysis={() => setActiveTab("analyze")}
          />
        )}

        {/* Pro Swings */}
        {activeTab === "proswings" && <ProSwings customProfiles={customProfiles} userSwingFrames={userSwingFrames} />}

        {/* Pro Calibration */}
        {activeTab === "calibrate" && (
          <ProCalibration
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
            existingProfiles={customProfiles}
          />
        )}
      </div>

      {/* Global styles */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .spinner{width:14px;height:14px;border:2px solid rgba(0,255,170,.3);border-top-color:#00ffaa;border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
        @keyframes spin{to{transform:rotate(360deg)}}
        input[type="range"]{height:4px}
        input[type="range"]::-webkit-slider-thumb{cursor:pointer}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:rgba(0,0,0,.2)}
        ::-webkit-scrollbar-thumb{background:rgba(0,255,170,.3);border-radius:3px}
      `}</style>
    </div>
  );
}

// ─── Empty state placeholder ───
function NoVideo({ onGo }) {
  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📹</div>
      <h2 style={{ color: "#fff", margin: "0 0 8px" }}>No Video Loaded</h2>
      <p style={{ color: "#64748b" }}>
        Upload a swing video first to start analyzing.
      </p>
      <button
        onClick={onGo}
        style={{
          marginTop: 16,
          padding: "10px 24px",
          borderRadius: 10,
          border: "none",
          background: "linear-gradient(135deg, #00ffaa, #00cc88)",
          color: "#000",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Upload Video
      </button>
    </div>
  );
}