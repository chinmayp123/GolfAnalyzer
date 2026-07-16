import { useState, useRef, useEffect, useCallback } from "react";
import { getPoseDetector, grabFrame, detectPose } from "../lib/poseModel.js";
import { kpIndex } from "../lib/constants.js";
import { scoreSwing } from "../lib/scoreSwing.js";
import { saveSwing, deleteSwing } from "../lib/storage.js";

// ─── Practice mode: live camera + automatic swing detection ───
//
// The camera runs continuously. Every ~90ms a pose is captured into a rolling
// buffer, and hand speed is monitored. A sustained burst of fast hand motion
// followed by quiet is treated as a swing: the surrounding frames are cut out
// of the buffer, phases are detected and scored, and the swing is added to
// the session (and saved to History).

const BUFFER_SECONDS = 16;
const TICK_MS = 90;
const HIGH_SPEED = 1.1; // torso-lengths/sec — burst begins
const QUIET_SPEED = 0.35; // below this counts as "settled"
const QUIET_HOLD_S = 0.8; // settled this long → swing over
const MIN_BURST_S = 0.5;
const MAX_BURST_S = 4;
const COOLDOWN_S = 1.5;
const PRE_ROLL_S = 2.2; // include address stillness before the burst
const POST_ROLL_S = 0.9; // include the held finish

export default function usePracticeSession({ proProfile }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const proRef = useRef(proProfile);
  proRef.current = proProfile;

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facing, setFacing] = useState("environment");
  const [modelStatus, setModelStatus] = useState("idle");
  const [currentPose, setCurrentPose] = useState(null);
  const [status, setStatus] = useState("off"); // off|watching|swinging|processing
  const [swings, setSwings] = useState([]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setStatus("off");
    setCurrentPose(null);
  }, []);

  const startCamera = useCallback(
    async (facingMode = facing) => {
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("No video element mounted");
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        setFacing(facingMode);
        setCameraOn(true);
        setStatus("watching");
        if (!detectorRef.current) {
          setModelStatus("loading");
          detectorRef.current = await getPoseDetector();
        }
        setModelStatus("ready");
      } catch (err) {
        console.error("Camera error:", err);
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera permission denied — allow camera access for this site and try again."
            : `Couldn't start the camera: ${err?.message || err}`
        );
        stopCamera();
      }
    },
    [facing, stopCamera]
  );

  const flipCamera = useCallback(() => {
    startCamera(facing === "environment" ? "user" : "environment");
  }, [facing, startCamera]);

  // ── Live detection + swing state machine ──
  useEffect(() => {
    if (!cameraOn || modelStatus !== "ready") return;

    let running = true;
    let busy = false;
    const buffer = [];
    let lastSample = null;
    let mode = "watch";
    let burstStart = 0;
    let lastActive = 0;
    let cooldownUntil = 0;

    const handSpeed = (prev, cur) => {
      const kps = cur.keypoints;
      const lw = kps[kpIndex("left_wrist", kps.length)];
      const rw = kps[kpIndex("right_wrist", kps.length)];
      const ls = kps[kpIndex("left_shoulder", kps.length)];
      const lh = kps[kpIndex("left_hip", kps.length)];
      if (!lw || !rw || !ls || !lh) return 0;
      const hands = { x: (lw.x + rw.x) / 2, y: (lw.y + rw.y) / 2 };
      const torso = Math.hypot(ls.x - lh.x, ls.y - lh.y) || 100;
      if (!prev?.hands) return 0;
      const dt = cur.time - prev.time || 1e-3;
      const v = Math.hypot(hands.x - prev.hands.x, hands.y - prev.hands.y) / torso / dt;
      cur.hands = hands;
      return v;
    };

    const cutSwing = async (endTime) => {
      mode = "watch";
      cooldownUntil = endTime + COOLDOWN_S;
      const frames = buffer.filter(
        (f) => f.time >= burstStart - PRE_ROLL_S && f.time <= endTime + POST_ROLL_S
      );
      if (frames.length < 10 || endTime - burstStart < MIN_BURST_S) {
        setStatus("watching");
        return;
      }
      setStatus("processing");
      // Give the model loop a beat, then score off-thread of the tick
      await new Promise((r) => setTimeout(r, 50));
      const pro = proRef.current;
      const result = scoreSwing(frames, pro);
      if (result) {
        const video = videoRef.current;
        let thumbnail = null;
        try {
          const c = grabFrame(video);
          if (c) {
            const small = document.createElement("canvas");
            const scale = 160 / c.width;
            small.width = 160;
            small.height = Math.round(c.height * scale);
            small.getContext("2d").drawImage(c, 0, 0, small.width, small.height);
            thumbnail = small.toDataURL("image/jpeg", 0.6);
          }
        } catch {
          /* no thumbnail */
        }
        const record = {
          id: Date.now(),
          date: new Date().toISOString(),
          proName: pro?.name || "—",
          proColor: pro?.color || "#5cbc7f",
          overallScore: result.overallScore,
          phaseScores: result.phaseScores,
          coaching: null,
          thumbnail,
          shotData: null,
          practice: true,
        };
        setSwings((prev) => [record, ...prev]);
        saveSwing(record).catch((err) => console.error("History save failed:", err));
      }
      if (running) setStatus("watching");
    };

    const tick = async () => {
      if (!running || busy) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      busy = true;
      try {
        const frameCanvas = grabFrame(video);
        if (frameCanvas) {
          const pose = detectPose(detector, frameCanvas, frameCanvas.width, frameCanvas.height);
          if (pose) {
            const now = performance.now() / 1000;
            const sample = { time: now, keypoints: pose.keypoints, world: pose.world };
            const speed = handSpeed(lastSample, sample);
            buffer.push(sample);
            while (buffer.length && now - buffer[0].time > BUFFER_SECONDS) buffer.shift();
            lastSample = sample;
            setCurrentPose(pose);

            if (now >= cooldownUntil) {
              if (mode === "watch" && speed > HIGH_SPEED) {
                mode = "burst";
                burstStart = now;
                lastActive = now;
                setStatus("swinging");
              } else if (mode === "burst") {
                if (speed > QUIET_SPEED) lastActive = now;
                if (now - lastActive > QUIET_HOLD_S || now - burstStart > MAX_BURST_S) {
                  await cutSwing(lastActive);
                }
              }
            }
          }
        }
      } catch {
        /* skip frame */
      } finally {
        busy = false;
      }
    };

    const id = setInterval(tick, TICK_MS);
    return () => {
      running = false;
      clearInterval(id);
    };
  }, [cameraOn, modelStatus]);

  // Stop the camera when the page unmounts
  useEffect(() => stopCamera, [stopCamera]);

  const attachShotData = useCallback((swingId, shotData) => {
    setSwings((prev) => {
      const next = prev.map((s) => (s.id === swingId ? { ...s, shotData } : s));
      const updated = next.find((s) => s.id === swingId);
      if (updated) {
        saveSwing(updated).catch((err) => console.error("History save failed:", err));
      }
      return next;
    });
  }, []);

  const discardSwing = useCallback((swingId) => {
    setSwings((prev) => prev.filter((s) => s.id !== swingId));
    deleteSwing(swingId).catch((err) => console.error("History delete failed:", err));
  }, []);

  return {
    videoRef,
    cameraOn,
    cameraError,
    facing,
    modelStatus,
    currentPose,
    status,
    swings,
    startCamera,
    stopCamera,
    flipCamera,
    attachShotData,
    discardSwing,
  };
}
