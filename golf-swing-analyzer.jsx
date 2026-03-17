import { useState, useRef, useEffect, useCallback } from "react";

// ─── Pro Benchmark Data ───
const PRO_BENCHMARKS = {
  address: {
    spineAngle: { min: 25, max: 35, ideal: 30, label: "Spine Tilt at Address" },
    kneeFlexion: { min: 20, max: 30, ideal: 25, label: "Knee Flex" },
    hipAngle: { min: 140, max: 160, ideal: 150, label: "Hip Angle" },
  },
  backswing: {
    shoulderTurn: { min: 85, max: 100, ideal: 90, label: "Shoulder Turn" },
    hipTurn: { min: 40, max: 55, ideal: 45, label: "Hip Turn" },
    leftArmAngle: { min: 170, max: 185, ideal: 180, label: "Lead Arm Straightness" },
    wristHinge: { min: 80, max: 100, ideal: 90, label: "Wrist Hinge" },
  },
  downswing: {
    hipSlide: { min: 2, max: 6, ideal: 4, label: "Hip Lateral Shift (in)" },
    lagAngle: { min: 70, max: 100, ideal: 85, label: "Wrist Lag Angle" },
    shoulderTilt: { min: 30, max: 45, ideal: 36, label: "Shoulder Tilt" },
  },
  impact: {
    hipOpen: { min: 35, max: 50, ideal: 40, label: "Hip Open at Impact" },
    shaftLean: { min: 10, max: 20, ideal: 15, label: "Forward Shaft Lean" },
    headBehindBall: { min: 1, max: 4, ideal: 2, label: "Head Behind Ball (in)" },
  },
  followThrough: {
    extensionAngle: { min: 160, max: 180, ideal: 175, label: "Arm Extension" },
    chestFacing: { min: 80, max: 100, ideal: 90, label: "Chest to Target" },
  },
};

const SWING_PHASES = ["address", "backswing", "downswing", "impact", "followThrough"];
const PHASE_LABELS = {
  address: "Address",
  backswing: "Backswing (Top)",
  downswing: "Downswing",
  impact: "Impact",
  followThrough: "Follow Through",
};

const KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

const SKELETON_CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16],
];

// ─── Utility Functions ───
function calcAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (magBA === 0 || magBC === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

function getScoreColor(score) {
  if (score >= 85) return "#22c55e";
  if (score >= 65) return "#eab308";
  if (score >= 45) return "#f97316";
  return "#ef4444";
}

function getScoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Needs Work";
  return "Poor";
}

// ─── Shot Tracer Colors ───
// ─── Pro Reference Poses (normalized 0-1 coords, face-on view) ───
const PRO_REFERENCE_POSES = {
  address: {
    nose: { x: 0.48, y: 0.12 },
    left_shoulder: { x: 0.42, y: 0.25 },
    right_shoulder: { x: 0.56, y: 0.25 },
    left_elbow: { x: 0.35, y: 0.38 },
    right_elbow: { x: 0.63, y: 0.38 },
    left_wrist: { x: 0.42, y: 0.48 },
    right_wrist: { x: 0.56, y: 0.48 },
    left_hip: { x: 0.44, y: 0.50 },
    right_hip: { x: 0.54, y: 0.50 },
    left_knee: { x: 0.42, y: 0.68 },
    right_knee: { x: 0.56, y: 0.68 },
    left_ankle: { x: 0.40, y: 0.88 },
    right_ankle: { x: 0.58, y: 0.88 },
  },
  backswing: {
    nose: { x: 0.52, y: 0.12 },
    left_shoulder: { x: 0.50, y: 0.24 },
    right_shoulder: { x: 0.58, y: 0.26 },
    left_elbow: { x: 0.55, y: 0.16 },
    right_elbow: { x: 0.65, y: 0.32 },
    left_wrist: { x: 0.60, y: 0.08 },
    right_wrist: { x: 0.68, y: 0.22 },
    left_hip: { x: 0.47, y: 0.50 },
    right_hip: { x: 0.55, y: 0.50 },
    left_knee: { x: 0.44, y: 0.68 },
    right_knee: { x: 0.57, y: 0.67 },
    left_ankle: { x: 0.41, y: 0.88 },
    right_ankle: { x: 0.58, y: 0.88 },
  },
  downswing: {
    nose: { x: 0.48, y: 0.12 },
    left_shoulder: { x: 0.44, y: 0.24 },
    right_shoulder: { x: 0.56, y: 0.26 },
    left_elbow: { x: 0.40, y: 0.18 },
    right_elbow: { x: 0.62, y: 0.34 },
    left_wrist: { x: 0.50, y: 0.14 },
    right_wrist: { x: 0.58, y: 0.42 },
    left_hip: { x: 0.43, y: 0.50 },
    right_hip: { x: 0.53, y: 0.49 },
    left_knee: { x: 0.42, y: 0.68 },
    right_knee: { x: 0.56, y: 0.67 },
    left_ankle: { x: 0.40, y: 0.88 },
    right_ankle: { x: 0.58, y: 0.88 },
  },
  impact: {
    nose: { x: 0.46, y: 0.13 },
    left_shoulder: { x: 0.40, y: 0.25 },
    right_shoulder: { x: 0.55, y: 0.27 },
    left_elbow: { x: 0.34, y: 0.36 },
    right_elbow: { x: 0.58, y: 0.38 },
    left_wrist: { x: 0.38, y: 0.48 },
    right_wrist: { x: 0.50, y: 0.50 },
    left_hip: { x: 0.42, y: 0.49 },
    right_hip: { x: 0.52, y: 0.50 },
    left_knee: { x: 0.40, y: 0.68 },
    right_knee: { x: 0.55, y: 0.68 },
    left_ankle: { x: 0.39, y: 0.88 },
    right_ankle: { x: 0.58, y: 0.88 },
  },
  followThrough: {
    nose: { x: 0.44, y: 0.12 },
    left_shoulder: { x: 0.38, y: 0.24 },
    right_shoulder: { x: 0.52, y: 0.26 },
    left_elbow: { x: 0.30, y: 0.16 },
    right_elbow: { x: 0.45, y: 0.32 },
    left_wrist: { x: 0.28, y: 0.08 },
    right_wrist: { x: 0.38, y: 0.22 },
    left_hip: { x: 0.40, y: 0.49 },
    right_hip: { x: 0.52, y: 0.50 },
    left_knee: { x: 0.42, y: 0.67 },
    right_knee: { x: 0.54, y: 0.70 },
    left_ankle: { x: 0.40, y: 0.88 },
    right_ankle: { x: 0.56, y: 0.88 },
  },
};

// Skeleton connections using named keypoints for the comparison view
const NAMED_SKELETON = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

const TRACER_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#ef4444" },
  { name: "Yellow", value: "#facc15" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Lime", value: "#84cc16" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
];

// ─── Main App ───
export default function GolfSwingAnalyzer() {
  const [activeTab, setActiveTab] = useState("upload");
  const [videoSrc, setVideoSrc] = useState(null);
  const [videoFileName, setVideoFileName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

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

  // Shot tracer (click-to-plot mode)
  const [tracerMode, setTracerMode] = useState(false);
  const [tracerColor, setTracerColor] = useState("#ffffff");
  const [tracerWidth, setTracerWidth] = useState(3);
  const [tracerPoints, setTracerPoints] = useState([]); // {x, y, time} clicked points
  const [tracerPaths, setTracerPaths] = useState([]); // completed paths
  const [tracerGlow, setTracerGlow] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const tracerCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  // ─── Load TensorFlow + MoveNet ───
  const loadModel = useCallback(async () => {
    if (poseModel) return;
    setModelLoading(true);
    setModelError(null);
    try {
      // Dynamically load TF.js and pose-detection
      if (!window.tf) {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js");
      }
      if (!window.poseDetection) {
        await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js");
      }
      await window.tf.ready();
      const detector = await window.poseDetection.createDetector(
        window.poseDetection.SupportedModels.MoveNet,
        {
          modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
          enableSmoothing: true,
        }
      );
      setPoseModel(detector);
    } catch (err) {
      console.error("Model load error:", err);
      setModelError("Failed to load pose detection model. Check your internet connection and try again.");
    } finally {
      setModelLoading(false);
    }
  }, [poseModel]);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ─── Video Upload ───
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setVideoFileName(file.name);
    setActiveTab("analyze");
    setPhaseSnapshots({});
    setAnalysisResults(null);
    setTracerPaths([]);
    setTracerPoints([]);
    loadModel();
  };

  // ─── Video Controls ───
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
    setIsPlaying(!isPlaying);
  };

  const stepFrame = (dir) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + dir / 30));
  };

  const seekTo = (t) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  // ─── Pose Detection Loop ───
  const detectPose = useCallback(async () => {
    if (!poseModel || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) return;

    try {
      const poses = await poseModel.estimatePoses(video);
      if (poses.length > 0) {
        setCurrentPose(poses[0]);
      }
    } catch (e) {
      // silently ignore frame detection errors
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

  // ─── Draw Skeleton Overlay ───
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

    // Draw connections
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    SKELETON_CONNECTIONS.forEach(([i, j]) => {
      const a = kps[i], b = kps[j];
      if (a.score > 0.3 && b.score > 0.3) {
        ctx.strokeStyle = "rgba(0, 255, 170, 0.8)";
        ctx.beginPath();
        ctx.moveTo(a.x * scaleX, a.y * scaleY);
        ctx.lineTo(b.x * scaleX, b.y * scaleY);
        ctx.stroke();
      }
    });

    // Draw keypoints
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

  // ─── Draw Shot Tracer ───
  useEffect(() => {
    if (!tracerCanvasRef.current || !videoRef.current) return;
    const canvas = tracerCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const video = videoRef.current;

    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawPath = (points, color, width, glow) => {
      if (points.length < 2) return;
      ctx.save();
      ctx.lineWidth = width || 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;

      if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      if (points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
      } else {
        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
      }
      ctx.stroke();

      // Arrowhead at end
      const last = points[points.length - 1];
      const prev = points[Math.max(0, points.length - 2)];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      const arrowLen = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(last.x - arrowLen * Math.cos(angle - 0.4), last.y - arrowLen * Math.sin(angle - 0.4));
      ctx.lineTo(last.x - arrowLen * Math.cos(angle + 0.4), last.y - arrowLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    // Draw completed paths
    tracerPaths.forEach((path) => {
      drawPath(path.points, path.color, path.width, path.glow);
    });

    // Draw in-progress points
    if (tracerPoints.length >= 1) {
      // Draw the curve so far
      if (tracerPoints.length >= 2) {
        drawPath(tracerPoints, tracerColor, tracerWidth, tracerGlow);
      }
      // Draw clickable dots at each plotted point
      tracerPoints.forEach((pt, i) => {
        ctx.save();
        ctx.fillStyle = i === 0 ? "#22c55e" : tracerColor;
        ctx.shadowColor = tracerColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fill();
        // Point number label
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#000";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i + 1, pt.x, pt.y);
        ctx.restore();
      });
    }
  }, [tracerPaths, tracerPoints, tracerColor, tracerWidth, tracerGlow]);

  // ─── Tracer Click-to-Plot Handlers ───
  const getCanvasCoords = (e) => {
    const canvas = tracerCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleTracerClick = (e) => {
    if (!tracerMode) return;
    const pt = getCanvasCoords(e);
    pt.time = currentTime;
    setTracerPoints((prev) => [...prev, pt]);
  };

  const finishTracerPath = () => {
    if (tracerPoints.length >= 2) {
      setTracerPaths((prev) => [...prev, {
        points: tracerPoints,
        color: tracerColor,
        width: tracerWidth,
        glow: tracerGlow,
      }]);
    }
    setTracerPoints([]);
  };

  const undoLastPoint = () => {
    setTracerPoints((prev) => prev.slice(0, -1));
  };

  // ─── Swing Analysis ───
  const analyzeKeypoints = (kps) => {
    const get = (name) => {
      const idx = KEYPOINT_NAMES.indexOf(name);
      return idx >= 0 ? kps[idx] : null;
    };

    const ls = get("left_shoulder"), rs = get("right_shoulder");
    const le = get("left_elbow"), re = get("right_elbow");
    const lw = get("left_wrist"), rw = get("right_wrist");
    const lh = get("left_hip"), rh = get("right_hip");
    const lk = get("left_knee"), rk = get("right_knee");
    const la = get("left_ankle"), ra = get("right_ankle");
    const nose = get("nose");

    const measurements = {};

    // Spine angle (shoulder midpoint to hip midpoint vs vertical)
    if (ls && rs && lh && rh) {
      const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
      const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
      const spineAngle = Math.abs(Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180 / Math.PI);
      measurements.spineAngle = spineAngle;
    }

    // Knee flexion (hip-knee-ankle angle)
    if (rh && rk && ra) {
      measurements.kneeFlexion = 180 - calcAngle(rh, rk, ra);
    }
    // Hip angle
    if (ls && lh && lk) {
      measurements.hipAngle = calcAngle(ls, lh, lk);
    }
    // Shoulder turn (angle between shoulder line and hip line)
    if (ls && rs && lh && rh) {
      const shoulderAngle = Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI;
      const hipAngle = Math.atan2(lh.y - rh.y, lh.x - rh.x) * 180 / Math.PI;
      measurements.shoulderTurn = Math.abs(shoulderAngle - hipAngle);
    }
    // Hip turn
    if (lh && rh) {
      const dx = Math.abs(lh.x - rh.x);
      const dy = Math.abs(lh.y - rh.y);
      measurements.hipTurn = Math.atan2(dy, dx) * 180 / Math.PI;
    }
    // Lead arm angle (left shoulder - elbow - wrist)
    if (ls && le && lw) {
      measurements.leftArmAngle = calcAngle(ls, le, lw);
    }
    // Wrist hinge (elbow - wrist angle relative)
    if (le && lw && ls) {
      measurements.wristHinge = 180 - calcAngle(ls, le, lw);
    }
    // Lag angle
    if (re && rw) {
      measurements.lagAngle = measurements.wristHinge || 85;
    }
    // Shoulder tilt
    if (ls && rs) {
      measurements.shoulderTilt = Math.abs(Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI);
    }
    // Hip open
    if (lh && rh) {
      measurements.hipOpen = Math.abs(Math.atan2(lh.y - rh.y, lh.x - rh.x)) * 180 / Math.PI;
    }
    // Shaft lean
    if (rw && rh) {
      measurements.shaftLean = Math.abs(Math.atan2(rw.x - rh.x, rh.y - rw.y)) * 180 / Math.PI;
      measurements.shaftLean = Math.min(measurements.shaftLean, 25);
    }
    // Head behind ball
    if (nose && rw) {
      measurements.headBehindBall = Math.max(0, (rw.x - nose.x) / 30);
    }
    // Extension
    if (rs && re && rw) {
      measurements.extensionAngle = calcAngle(rs, re, rw);
    }
    // Chest facing
    if (ls && rs) {
      measurements.chestFacing = Math.abs(Math.atan2(rs.y - ls.y, rs.x - ls.x)) * 180 / Math.PI;
    }
    // Hip slide
    if (lh && rh) {
      measurements.hipSlide = Math.abs(lh.x - rh.x) / 30;
    }

    return measurements;
  };

  const scoreMetric = (value, benchmark) => {
    const { min, max, ideal } = benchmark;
    if (value >= min && value <= max) {
      const dist = Math.abs(value - ideal);
      const range = (max - min) / 2;
      return Math.round(100 - (dist / range) * 25);
    }
    const outside = value < min ? min - value : value - max;
    const range = max - min;
    return Math.max(0, Math.round(65 - (outside / range) * 60));
  };

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
      const benchmarks = PRO_BENCHMARKS[phase];
      const metrics = {};
      let totalScore = 0;
      let count = 0;

      Object.entries(benchmarks).forEach(([key, bm]) => {
        const val = measurements[key];
        if (val !== undefined) {
          const score = scoreMetric(val, bm);
          metrics[key] = { value: Math.round(val * 10) / 10, score, benchmark: bm };
          totalScore += score;
          count++;
        }
      });

      const overallScore = count > 0 ? Math.round(totalScore / count) : 0;

      setPhaseSnapshots((prev) => ({
        ...prev,
        [phase]: {
          time: videoRef.current.currentTime,
          keypoints: kps,
          measurements,
          metrics,
          overallScore,
        },
      }));
    }
    setAnalyzingPhase(null);
  };

  const runFullAnalysis = async () => {
    if (!videoRef.current || !poseModel || !duration) return;
    setFullAnalysisRunning(true);

    const phasePositions = {
      address: 0.05,
      backswing: 0.35,
      downswing: 0.55,
      impact: 0.7,
      followThrough: 0.9,
    };

    for (const phase of SWING_PHASES) {
      const targetTime = duration * phasePositions[phase];
      videoRef.current.currentTime = targetTime;
      await new Promise((r) => setTimeout(r, 400));
      await capturePhaseSnapshot(phase);
      await new Promise((r) => setTimeout(r, 200));
    }

    setFullAnalysisRunning(false);
    setActiveTab("results");
  };

  // ─── Compute final results ───
  useEffect(() => {
    const completedPhases = Object.keys(phaseSnapshots);
    if (completedPhases.length === 0) { setAnalysisResults(null); return; }

    const phaseResults = {};
    let grandTotal = 0;
    let phaseCount = 0;

    completedPhases.forEach((phase) => {
      const snap = phaseSnapshots[phase];
      phaseResults[phase] = {
        overallScore: snap.overallScore,
        metrics: snap.metrics,
        time: snap.time,
      };
      grandTotal += snap.overallScore;
      phaseCount++;
    });

    const tips = [];
    completedPhases.forEach((phase) => {
      const snap = phaseSnapshots[phase];
      Object.entries(snap.metrics).forEach(([key, m]) => {
        if (m.score < 65) {
          const diff = m.value - m.benchmark.ideal;
          const dir = diff > 0 ? "too much" : "not enough";
          tips.push({
            phase: PHASE_LABELS[phase],
            metric: m.benchmark.label,
            message: `Your ${m.benchmark.label.toLowerCase()} is ${Math.abs(Math.round(diff))}° ${dir} (yours: ${Math.round(m.value)}°, pro: ${m.benchmark.ideal}°).`,
            score: m.score,
          });
        }
      });
    });

    tips.sort((a, b) => a.score - b.score);

    setAnalysisResults({
      overallScore: phaseCount > 0 ? Math.round(grandTotal / phaseCount) : 0,
      phaseResults,
      tips: tips.slice(0, 8),
    });
  }, [phaseSnapshots]);

  // ─── RENDER ───
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0f1e 0%, #0d1a2d 50%, #0a1628 100%)", color: "#e2e8f0", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(0,255,170,0.15)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", backdropFilter: "blur(10px)", background: "rgba(10,15,30,0.8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #00ffaa, #00cc88)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⛳</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>SwingAI Pro</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>AI-Powered Golf Swing Analyzer</p>
          </div>
        </div>
        {poseModel && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,255,170,0.1)", padding: "6px 12px", borderRadius: 20, fontSize: 12, color: "#00ffaa" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00ffaa", animation: "pulse 2s infinite" }} />
            AI Model Ready
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 2, padding: "12px 24px", background: "rgba(0,0,0,0.2)" }}>
        {[
          { id: "upload", label: "Upload", icon: "📁" },
          { id: "analyze", label: "Analyze", icon: "🔍" },
          { id: "tracer", label: "Shot Tracer", icon: "✏️" },
          { id: "results", label: "Results", icon: "📊" },
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
              background: activeTab === tab.id ? "rgba(0,255,170,0.15)" : "transparent",
              color: activeTab === tab.id ? "#00ffaa" : "#64748b",
              borderBottom: activeTab === tab.id ? "2px solid #00ffaa" : "2px solid transparent",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {/* ─── UPLOAD TAB ─── */}
        {activeTab === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 500 }}>
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
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,170,0.6)"; e.currentTarget.style.background = "rgba(0,255,170,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,170,0.3)"; e.currentTarget.style.background = "rgba(0,255,170,0.03)"; }}
            >
              <div style={{ fontSize: 64, marginBottom: 16 }}>🏌️</div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#fff" }}>Upload Your Swing Video</h2>
              <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 15 }}>
                Drop a video or click to browse. Face-on or down-the-line angles work best.
              </p>
              <div style={{ display: "inline-block", padding: "12px 32px", borderRadius: 10, background: "linear-gradient(135deg, #00ffaa, #00cc88)", color: "#000", fontWeight: 700, fontSize: 15 }}>
                Choose Video
              </div>
              <p style={{ marginTop: 16, color: "#475569", fontSize: 12 }}>MP4, MOV, or WebM — up to 200MB</p>
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} style={{ display: "none" }} />

            {modelLoading && (
              <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 8, color: "#00ffaa", fontSize: 14 }}>
                <div className="spinner" /> Loading AI pose detection model...
              </div>
            )}
            {modelError && (
              <div style={{ marginTop: 24, color: "#ef4444", fontSize: 14, padding: "12px 20px", background: "rgba(239,68,68,0.1)", borderRadius: 10 }}>
                {modelError}
                <button onClick={loadModel} style={{ marginLeft: 12, color: "#00ffaa", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
              </div>
            )}

            <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, maxWidth: 700, width: "100%" }}>
              {[
                { icon: "🤖", title: "AI Pose Detection", desc: "MoveNet analyzes 17 body keypoints in real-time" },
                { icon: "📐", title: "Pro Comparison", desc: "Compares your angles against tour pro benchmarks" },
                { icon: "✏️", title: "Shot Tracer", desc: "Draw ball flight paths on your video" },
              ].map((f, i) => (
                <div key={i} style={{ padding: 20, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{f.icon}</div>
                  <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#fff" }}>{f.title}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── ANALYZE TAB ─── */}
        {activeTab === "analyze" && videoSrc && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
            {/* Video Panel */}
            <div>
              <div ref={containerRef} style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                  onLoadedMetadata={() => { setDuration(videoRef.current?.duration || 0); }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  playsInline
                  crossOrigin="anonymous"
                />
                <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

                {analyzingPhase && (
                  <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.8)", padding: "8px 16px", borderRadius: 8, fontSize: 13, color: "#00ffaa", display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="spinner" /> Analyzing {PHASE_LABELS[analyzingPhase]}...
                  </div>
                )}

                {isDetecting && (
                  <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,255,170,0.15)", padding: "4px 10px", borderRadius: 20, fontSize: 11, color: "#00ffaa" }}>
                    POSE TRACKING
                  </div>
                )}
              </div>

              {/* Video Controls */}
              <div style={{ marginTop: 12, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Timeline */}
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.001}
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#00ffaa", cursor: "pointer", marginBottom: 12 }}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => stepFrame(-1)}>⏮</Btn>
                    <Btn onClick={togglePlay} accent>{isPlaying ? "⏸" : "▶"}</Btn>
                    <Btn onClick={() => stepFrame(1)}>⏭</Btn>
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0.25, 0.5, 1].map((r) => (
                      <Btn key={r} onClick={() => { setPlaybackRate(r); if (videoRef.current) videoRef.current.playbackRate = r; }} small active={playbackRate === r}>
                        {r}x
                      </Btn>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#fff" }}>Swing Phase Capture</h3>
                <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b" }}>Navigate to each phase and capture, or run auto-analysis.</p>

                <button
                  onClick={runFullAnalysis}
                  disabled={!poseModel || fullAnalysisRunning}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: poseModel && !fullAnalysisRunning ? "pointer" : "not-allowed",
                    background: poseModel && !fullAnalysisRunning ? "linear-gradient(135deg, #00ffaa, #00cc88)" : "#1e293b",
                    color: poseModel && !fullAnalysisRunning ? "#000" : "#475569",
                    fontWeight: 700, fontSize: 14, marginBottom: 14, transition: "all 0.2s",
                  }}
                >
                  {fullAnalysisRunning ? "⏳ Analyzing..." : !poseModel ? "Loading Model..." : "🚀 Auto-Analyze Full Swing"}
                </button>

                <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginBottom: 14 }}>— or capture each phase manually —</div>

                {SWING_PHASES.map((phase) => (
                  <div key={phase} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div>
                      <div style={{ fontSize: 13, color: phaseSnapshots[phase] ? "#00ffaa" : "#e2e8f0", fontWeight: 600 }}>
                        {phaseSnapshots[phase] ? "✅" : "⬜"} {PHASE_LABELS[phase]}
                      </div>
                      {phaseSnapshots[phase] && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                          Score: <span style={{ color: getScoreColor(phaseSnapshots[phase].overallScore), fontWeight: 700 }}>{phaseSnapshots[phase].overallScore}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => capturePhaseSnapshot(phase)}
                      disabled={!poseModel || analyzingPhase === phase}
                      style={{
                        padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(0,255,170,0.3)",
                        background: "rgba(0,255,170,0.1)", color: "#00ffaa", fontSize: 12,
                        cursor: poseModel ? "pointer" : "not-allowed", fontWeight: 600,
                      }}
                    >
                      {analyzingPhase === phase ? "..." : "Capture"}
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} style={{ accentColor: "#00ffaa" }} />
                  Show Skeleton Overlay
                </label>
              </div>

              {/* Live angle readout */}
              {currentPose && (
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "#94a3b8" }}>Live Measurements</h4>
                  {(() => {
                    const m = analyzeKeypoints(currentPose.keypoints);
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {[
                          ["Spine Tilt", m.spineAngle],
                          ["Knee Flex", m.kneeFlexion],
                          ["Hip Angle", m.hipAngle],
                          ["Shoulder Turn", m.shoulderTurn],
                        ].map(([label, val]) => val !== undefined && (
                          <div key={label} style={{ padding: "6px 8px", background: "rgba(0,0,0,0.2)", borderRadius: 6, fontSize: 11 }}>
                            <div style={{ color: "#64748b" }}>{label}</div>
                            <div style={{ color: "#00ffaa", fontWeight: 700, fontFamily: "monospace" }}>{Math.round(val)}°</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── SHOT TRACER TAB ─── */}
        {activeTab === "tracer" && videoSrc && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24 }}>
            <div>
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                  playsInline
                  crossOrigin="anonymous"
                />
                <canvas
                  ref={tracerCanvasRef}
                  onClick={handleTracerClick}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    cursor: tracerMode ? "crosshair" : "default",
                  }}
                />
                {tracerMode && (
                  <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.8)", padding: "6px 14px", borderRadius: 8, fontSize: 12, color: tracerColor, fontWeight: 700 }}>
                    TRACER MODE — Click and drag to draw
                  </div>
                )}
              </div>

              {/* Video Controls */}
              <div style={{ marginTop: 12, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <input type="range" min={0} max={duration || 1} step={0.001} value={currentTime} onChange={(e) => seekTo(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#00ffaa", cursor: "pointer", marginBottom: 12 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn onClick={() => stepFrame(-1)}>⏮</Btn>
                    <Btn onClick={togglePlay}>{isPlaying ? "⏸" : "▶"}</Btn>
                    <Btn onClick={() => stepFrame(1)}>⏭</Btn>
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>
              </div>
            </div>

            {/* Tracer Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#fff" }}>Shot Tracer</h3>

                <button
                  onClick={() => { setTracerMode(!tracerMode); if (tracerMode) finishTracerPath(); }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "none", cursor: "pointer",
                    background: tracerMode ? "linear-gradient(135deg, #00ffaa, #00cc88)" : "rgba(255,255,255,0.08)",
                    color: tracerMode ? "#000" : "#fff", fontWeight: 700, fontSize: 14, marginBottom: 12,
                  }}
                >
                  {tracerMode ? "Plotting Active — Click ball position" : "Start Plotting Ball Path"}
                </button>

                {tracerMode && tracerPoints.length > 0 && (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: "rgba(0,255,170,0.08)", border: "1px solid rgba(0,255,170,0.15)", fontSize: 12, color: "#00ffaa" }}>
                    {tracerPoints.length} point{tracerPoints.length !== 1 ? "s" : ""} plotted — step forward and click the ball again
                  </div>
                )}

                {tracerMode && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <button
                      onClick={undoLastPoint}
                      disabled={tracerPoints.length === 0}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", cursor: tracerPoints.length > 0 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600 }}
                    >
                      Undo Point
                    </button>
                    <button
                      onClick={finishTracerPath}
                      disabled={tracerPoints.length < 2}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(0,255,170,0.3)", background: "rgba(0,255,170,0.1)", color: "#00ffaa", cursor: tracerPoints.length >= 2 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}
                    >
                      Finish Path
                    </button>
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Tracer Color</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {TRACER_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setTracerColor(c.value)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: tracerColor === c.value ? "2px solid #fff" : "2px solid rgba(255,255,255,0.1)",
                          background: c.value, cursor: "pointer", transition: "all 0.2s",
                          transform: tracerColor === c.value ? "scale(1.15)" : "scale(1)",
                        }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>Line Width: {tracerWidth}px</div>
                  <input type="range" min={1} max={8} value={tracerWidth} onChange={(e) => setTracerWidth(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#00ffaa" }} />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginBottom: 16 }}>
                  <input type="checkbox" checked={tracerGlow} onChange={(e) => setTracerGlow(e.target.checked)} style={{ accentColor: "#00ffaa" }} />
                  Glow Effect
                </label>

                {tracerPaths.length > 0 && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setTracerPaths((prev) => prev.slice(0, -1))}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Undo Path
                    </button>
                    <button
                      onClick={() => setTracerPaths([])}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>

              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.06)" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#94a3b8" }}>How to Plot</h4>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#64748b", lineHeight: 2 }}>
                  <li>Click "Start Plotting Ball Path"</li>
                  <li>Pause the video where the ball is visible</li>
                  <li>Click on the ball to place a point</li>
                  <li>Step forward a few frames, click again</li>
                  <li>Repeat until the ball lands</li>
                  <li>Click "Finish Path" to complete</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ─── RESULTS TAB ─── */}
        {activeTab === "results" && (
          <div>
            {!analysisResults ? (
              <div style={{ textAlign: "center", padding: 80 }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
                <h2 style={{ color: "#fff", margin: "0 0 8px" }}>No Analysis Yet</h2>
                <p style={{ color: "#64748b" }}>Go to the Analyze tab and capture your swing phases first.</p>
                <button onClick={() => setActiveTab("analyze")} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #00ffaa, #00cc88)", color: "#000", fontWeight: 700, cursor: "pointer" }}>
                  Go to Analysis
                </button>
              </div>
            ) : (
              <div>
                {/* Overall Score */}
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                  <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "32px 48px", borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 2 }}>Overall Swing Score</div>
                    <div style={{ fontSize: 72, fontWeight: 800, color: getScoreColor(analysisResults.overallScore), lineHeight: 1 }}>
                      {analysisResults.overallScore}
                    </div>
                    <div style={{ fontSize: 16, color: getScoreColor(analysisResults.overallScore), fontWeight: 600, marginTop: 4 }}>
                      {getScoreLabel(analysisResults.overallScore)}
                    </div>
                  </div>
                </div>

                {/* Phase Breakdown */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
                  {SWING_PHASES.map((phase) => {
                    const res = analysisResults.phaseResults[phase];
                    if (!res) return (
                      <div key={phase} style={{ padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.08)", textAlign: "center" }}>
                        <div style={{ fontSize: 14, color: "#475569", fontWeight: 600 }}>{PHASE_LABELS[phase]}</div>
                        <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Not captured</div>
                      </div>
                    );
                    return (
                      <div key={phase} style={{ padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${getScoreColor(res.overallScore)}22` }}>
                        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>{PHASE_LABELS[phase]}</div>
                        <div style={{ fontSize: 36, fontWeight: 800, color: getScoreColor(res.overallScore), marginBottom: 10 }}>{res.overallScore}</div>
                        {Object.entries(res.metrics).map(([key, m]) => (
                          <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
                            <span style={{ color: "#94a3b8" }}>{m.benchmark.label}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{Math.round(m.value)}°</span>
                              <div style={{ width: 40, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${m.score}%`, borderRadius: 3, background: getScoreColor(m.score) }} />
                              </div>
                            </div>
                          </div>
                        ))}
                        <PoseComparisonPanel phase={phase} userKeypoints={phaseSnapshots[phase]?.keypoints} />
                      </div>
                    );
                  })}
                </div>

                {/* Improvement Tips */}
                {analysisResults.tips.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
                    <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#fff" }}>🎯 Areas for Improvement</h3>
                    <div style={{ display: "grid", gap: 10 }}>
                      {analysisResults.tips.map((tip, i) => (
                        <div key={i} style={{ display: "flex", gap: 14, padding: 14, borderRadius: 10, background: "rgba(0,0,0,0.2)", border: `1px solid ${getScoreColor(tip.score)}22` }}>
                          <div style={{ minWidth: 36, height: 36, borderRadius: 8, background: `${getScoreColor(tip.score)}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: getScoreColor(tip.score) }}>
                            {tip.score}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>{tip.phase} — {tip.metric}</div>
                            <div style={{ fontSize: 13, color: "#e2e8f0" }}>{tip.message}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No video state for analyze/tracer */}
        {(activeTab === "analyze" || activeTab === "tracer") && !videoSrc && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📹</div>
            <h2 style={{ color: "#fff", margin: "0 0 8px" }}>No Video Loaded</h2>
            <p style={{ color: "#64748b" }}>Upload a swing video first to start analyzing.</p>
            <button onClick={() => setActiveTab("upload")} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #00ffaa, #00cc88)", color: "#000", fontWeight: 700, cursor: "pointer" }}>
              Upload Video
            </button>
          </div>
        )}
      </div>

      {/* Global Styles */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .spinner {
          width: 14px; height: 14px; border: 2px solid rgba(0,255,170,0.3);
          border-top-color: #00ffaa; border-radius: 50%;
          animation: spin 0.6s linear infinite; display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type="range"] { height: 4px; }
        input[type="range"]::-webkit-slider-thumb { cursor: pointer; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        ::-webkit-scrollbar-thumb { background: rgba(0,255,170,0.3); border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───
function Btn({ children, onClick, accent, small, active, ...props }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "4px 10px" : "8px 14px",
        borderRadius: 8,
        border: active ? "1px solid #00ffaa" : "1px solid rgba(255,255,255,0.1)",
        background: accent ? "linear-gradient(135deg, #00ffaa, #00cc88)" : active ? "rgba(0,255,170,0.15)" : "rgba(255,255,255,0.05)",
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

// ─── Pose Comparison Component ───
function PoseComparisonPanel({ phase, userKeypoints }) {
  const userCanvasRef = useRef(null);
  const proCanvasRef = useRef(null);

  const drawStickFigure = (canvas, keypoints, color, glowColor, isNamed) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();

    // Ground line
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, h * 0.92);
    ctx.lineTo(w - 20, h * 0.92);
    ctx.stroke();
    ctx.setLineDash([]);

    const getPoint = (name) => {
      if (isNamed) {
        const pt = keypoints[name];
        return pt ? { x: pt.x * w, y: pt.y * h } : null;
      } else {
        const idx = KEYPOINT_NAMES.indexOf(name);
        if (idx < 0) return null;
        const kp = keypoints[idx];
        if (!kp || kp.score < 0.3) return null;
        // Normalize user keypoints to fit canvas
        return { x: kp.x, y: kp.y };
      }
    };

    // Draw connections
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    NAMED_SKELETON.forEach(([a, b]) => {
      const pa = getPoint(a);
      const pb = getPoint(b);
      if (pa && pb) {
        ctx.strokeStyle = color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    // Draw joints
    const jointNames = ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
      "left_wrist", "right_wrist", "left_hip", "right_hip",
      "left_knee", "right_knee", "left_ankle", "right_ankle", "nose"];
    jointNames.forEach((name) => {
      const pt = getPoint(name);
      if (pt) {
        ctx.fillStyle = name === "nose" ? "#fff" : color;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, name === "nose" ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Draw head circle around nose
    const nose = getPoint("nose");
    if (nose) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const proRef = PRO_REFERENCE_POSES[phase];
    if (!proRef) return;

    // Draw pro
    if (proCanvasRef.current) {
      drawStickFigure(proCanvasRef.current, proRef, "#00ffaa", "#00ffaa", true);
    }

    // Draw user (need to normalize to canvas space)
    if (userCanvasRef.current && userKeypoints) {
      const canvas = userCanvasRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Find bounds of user keypoints
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const validKps = userKeypoints.filter(kp => kp.score > 0.3);
      validKps.forEach(kp => {
        minX = Math.min(minX, kp.x);
        maxX = Math.max(maxX, kp.x);
        minY = Math.min(minY, kp.y);
        maxY = Math.max(maxY, kp.y);
      });

      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const padding = 0.12;

      // Normalize user keypoints to fit canvas with padding
      const normalized = userKeypoints.map(kp => ({
        ...kp,
        x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) * w + padding * w,
        y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) * h + padding * h,
      }));

      drawStickFigure(canvas, normalized, "#38bdf8", "#38bdf8", false);
    }
  }, [phase, userKeypoints]);

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
      {/* User pose */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#38bdf8", fontWeight: 700, marginBottom: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          Your Swing
        </div>
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.03)" }}>
          <canvas ref={userCanvasRef} width={240} height={320} style={{ width: "100%", display: "block" }} />
        </div>
      </div>
      {/* Pro pose */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#00ffaa", fontWeight: 700, marginBottom: 8, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
          Pro Reference
        </div>
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,255,170,0.2)", background: "rgba(0,255,170,0.03)" }}>
          <canvas ref={proCanvasRef} width={240} height={320} style={{ width: "100%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}