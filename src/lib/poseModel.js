import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

// ─── MediaPipe Pose (BlazePose) — 33 landmarks with 3D world coordinates ───
//
// Output per detection:
//   keypoints: [{x, y, score}]  — image PIXEL coordinates (33 points)
//   world:     [{x, y, z}]      — meters, hip-centered; y up is NEGATIVE
//                                  (MediaPipe uses image-style y-down axes)
//
// The world landmarks are what make real rotation metrics possible: shoulder
// and hip turn are invisible to a 2D tracker whenever the rotation happens
// toward or away from the camera.

const MEDIAPIPE_VERSION = "0.10.35"; // keep in sync with package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

let landmarkerPromise = null;

export function getPoseDetector() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      return PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

// detectForVideo requires strictly increasing timestamps per landmarker.
let lastTimestamp = 0;
function nextTimestamp() {
  lastTimestamp = Math.max(performance.now(), lastTimestamp + 1);
  return lastTimestamp;
}

/**
 * Run pose detection on a frame source (canvas). Returns
 * {keypoints, world} or null when no person is found.
 */
export function detectPose(landmarker, source, width, height) {
  const result = landmarker.detectForVideo(source, nextTimestamp());
  const lm = result.landmarks?.[0];
  if (!lm || lm.length === 0) return null;
  const wl = result.worldLandmarks?.[0] || null;
  return {
    keypoints: lm.map((p) => ({
      x: p.x * width,
      y: p.y * height,
      score: p.visibility ?? 1,
    })),
    world: wl
      ? wl.map((p) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          score: p.visibility ?? 1,
        }))
      : null,
  };
}

// Copy the video's current frame into a reusable offscreen canvas and return
// it. The model should never read the <video> element directly: uploading
// frames to the GPU straight from a video that is being seeked wedges
// Chrome's media decoder (stale frames on seek, renderer freezes). drawImage
// goes through the stable compositor path and hands the model settled pixels.
let captureCanvas = null;

export function grabFrame(video) {
  if (!video.videoWidth || !video.videoHeight) return null;
  if (!captureCanvas) captureCanvas = document.createElement("canvas");
  if (captureCanvas.width !== video.videoWidth) captureCanvas.width = video.videoWidth;
  if (captureCanvas.height !== video.videoHeight) captureCanvas.height = video.videoHeight;
  const ctx = captureCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);
  return captureCanvas;
}

function seekTo(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    const onSeeked = finish;
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
    setTimeout(finish, 600); // safety net if `seeked` never fires
  });
}

/**
 * Scan a video over [startTime, endTime] by PLAYING it through once and
 * capturing poses as frames are presented. Returns compact frames:
 * [{time, keypoints, world}]
 *
 * Why play-through instead of seek-stepping: issuing hundreds of rapid
 * programmatic seeks reliably wedges Chrome's media decoder — afterwards the
 * element never finishes another seek (stale frames, `seeking` stuck true).
 * Playing through uses exactly one seek and captures as fast as the model
 * can keep up (~12-18 samples/sec), which is plenty for phase detection.
 */
export async function scanSwingVideo({ video, detector, startTime, endTime, onProgress, onFrame }) {
  const duration = Math.max(0.2, endTime - startTime);
  const wasMuted = video.muted;
  const wasRate = video.playbackRate;

  await seekTo(video, startTime);
  video.muted = true;
  video.playbackRate = 1;

  const frames = [];
  let running = true;
  let busy = false;
  let lastCapturedTime = -1;
  let stallSince = null;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  // If the tab is hidden mid-scan, Chrome throttles our capture timer to
  // ~1/sec while the video keeps playing — leaving second-wide holes in the
  // captured swing. Pause playback while hidden so no content is missed;
  // the scan simply takes longer in wall-clock time.
  const onVisibility = () => {
    if (!running) return;
    if (document.hidden) video.pause();
    else video.play().catch(() => {});
  };
  document.addEventListener("visibilitychange", onVisibility);

  const finish = () => {
    if (!running) return;
    running = false;
    video.removeEventListener("ended", finish);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(pumpId);
    video.pause();
    video.muted = wasMuted;
    video.playbackRate = wasRate;
    resolveDone();
  };

  const capture = async () => {
    if (!running || busy) return;
    const t = video.currentTime;
    if (t >= endTime - 0.01 || video.ended) {
      finish();
      return;
    }
    if (t === lastCapturedTime || t < startTime) {
      // Some clips stop advancing a few frames short of `duration` without
      // ever firing `ended`, which would hang the scan at ~97%. Treat a
      // playhead that stays stuck while the tab is visible as the end.
      if (document.hidden) {
        stallSince = null;
      } else if (t === lastCapturedTime) {
        if (stallSince == null) stallSince = performance.now();
        const stalled = performance.now() - stallSince;
        if (stalled > 1500 && video.paused) video.play().catch(() => {});
        if (stalled > 4000) finish();
      }
      return;
    }
    stallSince = null;
    lastCapturedTime = t;
    busy = true;
    try {
      const frameCanvas = grabFrame(video);
      if (frameCanvas) {
        const pose = detectPose(detector, frameCanvas, frameCanvas.width, frameCanvas.height);
        if (pose) {
          const frame = { time: t, keypoints: pose.keypoints, world: pose.world };
          frames.push(frame);
          onFrame?.(frame);
        }
      }
    } catch {
      // skip unreadable frames
    } finally {
      busy = false;
    }
    onProgress?.(Math.min(99, Math.max(0, Math.round(((t - startTime) / duration) * 100))));
  };

  video.addEventListener("ended", finish);
  const pumpId = setInterval(capture, 30);
  try {
    await video.play();
  } catch {
    finish();
  }
  // Safety net: never run longer than the clip plus a generous margin
  // (generous because the scan pauses while the tab is hidden).
  setTimeout(finish, (duration + 30) * 1000 * 2);

  await done;
  onProgress?.(100);
  return frames;
}
