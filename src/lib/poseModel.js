import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

// Singleton MoveNet detector — bundled via npm, no runtime CDN scripts.
let detectorPromise = null;

export function getPoseDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await tf.ready();
      return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: true,
      });
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

// Copy the video's current frame into a reusable offscreen canvas and return
// it. TFJS should never read the <video> element directly: uploading frames
// to WebGL straight from a video that is being seeked wedges Chrome's media
// decoder (stale frames on seek, renderer freezes). drawImage goes through
// the stable compositor path and hands TFJS plain, settled pixels.
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
      // `seeked` means the frame is decoded and readable — resolve directly.
      // (No setTimeout/rAF here: both get throttled to ~1/s in hidden tabs,
      // which turned a 20s scan into a 3-minute one.)
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
 * [{time, keypoints: [{x,y,score}, ...]}]
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
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  const finish = () => {
    if (!running) return;
    running = false;
    video.removeEventListener("ended", finish);
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
    if (t === lastCapturedTime || t < startTime) return;
    lastCapturedTime = t;
    busy = true;
    try {
      const frameCanvas = grabFrame(video);
      if (frameCanvas) {
        const poses = await detector.estimatePoses(frameCanvas);
        if (poses.length > 0) {
          const frame = {
            time: t,
            keypoints: poses[0].keypoints.map((kp) => ({ x: kp.x, y: kp.y, score: kp.score })),
          };
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
  // Safety net: never run longer than the clip plus a generous margin.
  setTimeout(finish, (duration + 5) * 1000 * 1.5);

  await done;
  onProgress?.(100);
  return frames;
}
