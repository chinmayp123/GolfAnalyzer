import { useState, useRef, useEffect, useCallback } from "react";
import { getPoseDetector, scanSwingVideo, grabFrame, detectPose } from "../lib/poseModel.js";
import { detectSwingPhases, detectSwingWindows } from "../lib/phaseDetection.js";
import { analyzeKeypoints, scorePhase, orientationReference, hipYawOf } from "../lib/metrics.js";
import { SWING_PHASES, PHASE_LABELS } from "../lib/constants.js";

// ─── The analysis session ───
// Owns video playback state, the pose model, live detection, and the
// scan → detect phases → score pipeline. Components are presentational.

export default function useSwingSession({ proProfile }) {
  const videoRef = useRef(null);
  const detectorRef = useRef(null);

  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);

  const [modelStatus, setModelStatus] = useState("idle"); // idle|loading|ready|error
  const [currentPose, setCurrentPose] = useState(null);
  const [showSkeleton, setShowSkeleton] = useState(true);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState(""); // scanning|detecting
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [phaseDetection, setPhaseDetection] = useState(null);
  const [phaseSnapshots, setPhaseSnapshots] = useState({});
  const [scannedFrames, setScannedFrames] = useState(null); // full scan of the clip
  const [swingWindows, setSwingWindows] = useState([]); // distinct swings found
  const [activeSwingIndex, setActiveSwingIndex] = useState(0);
  const [userSwingFrames, setUserSwingFrames] = useState(null); // active swing only
  const [thumbnail, setThumbnail] = useState(null);

  // ── Model loading ──
  const loadModel = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current;
    setModelStatus("loading");
    try {
      const detector = await getPoseDetector();
      detectorRef.current = detector;
      setModelStatus("ready");
      return detector;
    } catch (err) {
      console.error("Model load error:", err);
      setModelStatus("error");
      return null;
    }
  }, []);

  // ── Video loading ──
  const loadFile = useCallback(
    (file) => {
      if (!file) return;
      // NOTE: create the URL outside the state updater — updaters run twice
      // under StrictMode and side effects there leak object URLs.
      const url = URL.createObjectURL(file);
      setVideoSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPhaseSnapshots({});
      setPhaseDetection(null);
      setScannedFrames(null);
      setSwingWindows([]);
      setActiveSwingIndex(0);
      setUserSwingFrames(null);
      setThumbnail(null);
      setTrimStart(0);
      setTrimEnd(0);
      setCurrentTime(0);
      loadModel();
    },
    [loadModel]
  );

  // ── Live pose detection loop ──
  // Polls at ~10fps and ONLY runs the model when the displayed frame actually
  // changed. Running estimatePoses on every animation frame (even while
  // paused) floods Chrome's video decoder with GPU uploads and eventually
  // wedges it — stale frames on seek, videos that stop loading entirely.
  useEffect(() => {
    if (modelStatus !== "ready" || !videoSrc) return;
    let running = true;
    let busy = false;
    let lastTime = -1;
    const id = setInterval(async () => {
      if (!running || busy || analyzing) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      // NEVER read frames from a video that is mid-seek — grabbing GPU frames
      // during a pending seek deadlocks Chrome's media pipeline (stale frames
      // on seek, long renderer freezes).
      if (video.seeking) return;
      // Static paused frame we've already analyzed — nothing to do.
      if (video.paused && video.currentTime === lastTime) return;
      lastTime = video.currentTime;
      busy = true;
      try {
        const frameCanvas = grabFrame(video);
        if (!frameCanvas) return;
        const pose = detectPose(detector, frameCanvas, frameCanvas.width, frameCanvas.height);
        if (running && pose) setCurrentPose(pose);
      } catch {
        /* ignore per-frame errors */
      } finally {
        busy = false;
      }
    }, 100);
    return () => {
      running = false;
      clearInterval(id);
    };
  }, [modelStatus, videoSrc, analyzing]);

  // ── Playback controls ──
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }, []);

  // Chrome's decoder occasionally wedges on a paused element: currentTime
  // updates but the displayed frame never changes and `seeking` stays true.
  // Watchdog: if a seek hasn't completed shortly after we asked for it,
  // reload the element (cheap for a local blob) and re-seek — self-healing.
  const seekWatchdogRef = useRef(null);
  const requestSeek = useCallback((video, t) => {
    video.currentTime = t;
    clearTimeout(seekWatchdogRef.current);
    seekWatchdogRef.current = setTimeout(() => {
      const v = videoRef.current;
      if (!v || !v.seeking) return; // seek completed normally
      const rate = v.playbackRate;
      const onMeta = () => {
        v.removeEventListener("loadedmetadata", onMeta);
        v.playbackRate = rate;
        v.currentTime = t;
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.load(); // rebuild the wedged media pipeline, then land on the frame
    }, 500);
  }, []);

  const stepFrame = useCallback(
    (dir) => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      requestSeek(video, Math.max(0, Math.min(duration, video.currentTime + dir / 30)));
    },
    [duration, requestSeek]
  );

  const seekTo = useCallback(
    (t) => {
      const video = videoRef.current;
      if (!video) return;
      requestSeek(video, t);
      setCurrentTime(t);
      // Seeks often come from panels far from the player (phase lists, chips).
      // If most of the video is off-screen, bring it into view so the user
      // actually sees the frame they jumped to.
      const rect = video.getBoundingClientRect();
      const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 72);
      if (visible < rect.height * 0.5) {
        video.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [requestSeek]
  );

  const changePlaybackRate = useCallback((r) => {
    setPlaybackRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }, []);

  const videoHandlers = {
    onTimeUpdate: setCurrentTime,
    onLoadedMetadata: (d) => {
      const safe = Number.isFinite(d) ? d : 0;
      setDuration(safe);
      setTrimEnd((prev) => (prev === 0 ? safe : prev));
    },
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onTogglePlay: togglePlay,
    onStepFrame: stepFrame,
    onSeek: seekTo,
    onSetPlaybackRate: changePlaybackRate,
  };

  // ── Snapshot helpers ──
  // Address-frame orientation reference: rotation metrics (hip turn, hips
  // open, chest to target) are measured relative to setup, which makes them
  // camera-angle independent. Set whenever an address snapshot is built.
  const orientationRefRef = useRef(null);

  const buildSnapshot = useCallback(
    (time, keypoints, world, phase) => {
      if (phase === "address") {
        const topHipYaw = orientationRefRef.current?.topHipYaw;
        orientationRefRef.current = orientationReference(world);
        if (orientationRefRef.current && topHipYaw != null) {
          orientationRefRef.current.topHipYaw = topHipYaw;
        }
      }
      if (phase === "backswing") {
        const topHipYaw = hipYawOf(world);
        if (topHipYaw != null) {
          orientationRefRef.current = { ...(orientationRefRef.current || {}), topHipYaw };
        }
      }
      const measurements = analyzeKeypoints(keypoints, world, orientationRefRef.current);
      const benchmarks = proProfile?.benchmarks?.[phase] || {};
      const { metrics, overallScore } = scorePhase(measurements, benchmarks);
      return { time, keypoints, world: world || null, measurements, metrics, overallScore };
    },
    [proProfile]
  );

  const captureThumbnail = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    const scale = 160 / video.videoWidth;
    canvas.width = 160;
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL("image/jpeg", 0.6);
    } catch {
      return null;
    }
  }, []);

  // ── Detect + score one swing window out of the scanned frames ──
  const analyzeWindow = useCallback(
    async (frames, window) => {
      const windowFrames = window
        ? frames.filter((f) => f.time >= window.start && f.time <= window.end)
        : frames;
      const usable = windowFrames.length >= 8 ? windowFrames : frames;

      const detection = detectSwingPhases(usable);
      if (!detection) return false;
      setPhaseDetection(detection);
      setUserSwingFrames(usable);

      const snapshots = {};
      // SWING_PHASES order matters: address runs first and establishes the
      // orientation reference the rotation metrics measure against.
      SWING_PHASES.forEach((phase) => {
        const hit = detection[phase];
        if (!hit) return;
        const frame = usable[hit.frameIndex] || usable.find((f) => f.time === hit.time);
        if (!frame) return;
        snapshots[phase] = buildSnapshot(frame.time, frame.keypoints, frame.world, phase);
      });
      setPhaseSnapshots(snapshots);

      // Thumbnail at impact for history
      const video = videoRef.current;
      if (detection.impact && video) {
        video.currentTime = detection.impact.time;
        await new Promise((r) => setTimeout(r, 300));
        setThumbnail(captureThumbnail());
      }
      return detection.quality;
    },
    [buildSnapshot, captureThumbnail]
  );

  // ── The full pipeline: scan → split into swings → detect phases → score ──
  const runAnalysis = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !duration) return { ok: false, error: "No video loaded." };
    const detector = await loadModel();
    if (!detector) return { ok: false, error: "Pose model failed to load." };

    setAnalyzing(true);
    setAnalyzeStage("scanning");
    setAnalyzeProgress(0);
    video.pause();

    try {
      const frames = await scanSwingVideo({
        video,
        detector,
        startTime: trimStart || 0,
        endTime: trimEnd || duration,
        onProgress: setAnalyzeProgress,
        // keep the skeleton overlay following the swing while we scan
        onFrame: (frame) => setCurrentPose({ keypoints: frame.keypoints, world: frame.world }),
      });
      setScannedFrames(frames);
      if (import.meta.env.DEV) window.__scanFrames = frames;

      setAnalyzeStage("detecting");

      // A clip can contain several swings — analyze the strongest by default
      // and let the user switch between them without rescanning.
      const windows = detectSwingWindows(frames);
      setSwingWindows(windows);
      let windowIndex = 0;
      if (windows.length > 1) {
        windowIndex = windows.reduce(
          (best, w, i) => (w.peakSpeed > windows[best].peakSpeed ? i : best),
          0
        );
      }
      setActiveSwingIndex(windowIndex);

      const quality = await analyzeWindow(frames, windows[windowIndex] || null);
      if (!quality) {
        return {
          ok: false,
          error:
            "Couldn't detect a swing in this clip. Make sure the full body is visible and try trimming closer to the swing.",
        };
      }

      return { ok: true, quality, swings: windows.length };
    } catch (err) {
      console.error("Analysis error:", err);
      return { ok: false, error: "Analysis failed unexpectedly. Try again." };
    } finally {
      setAnalyzing(false);
      setAnalyzeStage("");
    }
  }, [duration, trimStart, trimEnd, loadModel, analyzeWindow]);

  // ── Switch to another detected swing in the same clip (no rescan) ──
  const selectSwing = useCallback(
    async (index) => {
      if (!scannedFrames || !swingWindows[index] || analyzing) return;
      setActiveSwingIndex(index);
      setThumbnail(null);
      await analyzeWindow(scannedFrames, swingWindows[index]);
    },
    [scannedFrames, swingWindows, analyzing, analyzeWindow]
  );

  // ── Manual re-capture of a single phase at the current video frame ──
  const recapturePhase = useCallback(
    async (phase) => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector) return;
      video.pause();
      await new Promise((r) => setTimeout(r, 150));
      try {
        const frameCanvas = grabFrame(video);
        if (!frameCanvas) return;
        const pose = detectPose(detector, frameCanvas, frameCanvas.width, frameCanvas.height);
        if (pose) {
          setPhaseSnapshots((prev) => ({
            ...prev,
            [phase]: buildSnapshot(video.currentTime, pose.keypoints, pose.world, phase),
          }));
        }
      } catch {
        /* ignore */
      }
    },
    [buildSnapshot]
  );

  // ── Re-score existing snapshots when the selected pro changes ──
  useEffect(() => {
    setPhaseSnapshots((prev) => {
      const phases = Object.keys(prev);
      if (phases.length === 0) return prev;
      const next = {};
      phases.forEach((phase) => {
        const s = prev[phase];
        next[phase] = buildSnapshot(s.time, s.keypoints, s.world || null, phase);
      });
      return next;
    });
  }, [buildSnapshot]);

  // ── Derived results + tips ──
  const phases = Object.keys(phaseSnapshots);
  let analysisResults = null;
  if (phases.length > 0) {
    const phaseResults = {};
    let grandTotal = 0;
    phases.forEach((phase) => {
      const s = phaseSnapshots[phase];
      phaseResults[phase] = { overallScore: s.overallScore, metrics: s.metrics, time: s.time };
      grandTotal += s.overallScore;
    });

    const tips = [];
    phases.forEach((phase) => {
      Object.entries(phaseSnapshots[phase].metrics).forEach(([key, m]) => {
        if (m.score < 65) {
          const proMeasured = proProfile?.phaseMeasurements?.[phase]?.[key];
          const proVal = proMeasured !== undefined ? proMeasured : m.benchmark.ideal;
          const diff = m.value - proVal;
          tips.push({
            phase: PHASE_LABELS[phase],
            phaseKey: phase,
            metric: m.benchmark.label,
            message: `Your ${m.benchmark.label.toLowerCase()} is ${Math.abs(Math.round(diff))}° ${
              diff > 0 ? "more" : "less"
            } than the pro's (you: ${Math.round(m.value)}°, pro: ${Math.round(proVal * 10) / 10}°).`,
            score: m.score,
          });
        }
      });
    });
    tips.sort((a, b) => a.score - b.score);

    analysisResults = {
      overallScore: Math.round(grandTotal / phases.length),
      phaseResults,
      tips: tips.slice(0, 8),
    };
  }

  const reset = useCallback(() => {
    setVideoSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhaseSnapshots({});
    setPhaseDetection(null);
    setScannedFrames(null);
    setSwingWindows([]);
    setActiveSwingIndex(0);
    setUserSwingFrames(null);
    setThumbnail(null);
    setTrimStart(0);
    setTrimEnd(0);
    setCurrentTime(0);
    setDuration(0);
    setCurrentPose(null);
  }, []);

  return {
    videoRef,
    videoSrc,
    loadFile,
    reset,
    modelStatus,
    loadModel,
    currentPose,
    showSkeleton,
    setShowSkeleton,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    videoHandlers,
    trimStart,
    trimEnd,
    setTrimStart,
    setTrimEnd,
    analyzing,
    analyzeStage,
    analyzeProgress,
    runAnalysis,
    recapturePhase,
    phaseDetection,
    phaseSnapshots,
    scannedFrames,
    swingWindows,
    activeSwingIndex,
    selectSwing,
    userSwingFrames,
    thumbnail,
    analysisResults,
  };
}
