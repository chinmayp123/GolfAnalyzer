import { KEYPOINT_NAMES, SKELETON_CONNECTIONS, NAMED_SKELETON } from "./constants.js";

// ─── Shared canvas drawing for skeletons and stick figures ───

/**
 * Draw a live skeleton over a <video>. Keypoints are in video pixel space;
 * the canvas is resized to the video's on-screen size and scaled to match.
 */
export function drawSkeletonOverlay(canvas, video, keypoints, { color = "#5cbc7f" } = {}) {
  const ctx = canvas.getContext("2d");
  const displayW = video.clientWidth;
  const displayH = video.clientHeight;
  canvas.width = displayW;
  canvas.height = displayH;
  ctx.clearRect(0, 0, displayW, displayH);

  if (!keypoints || !video.videoWidth || !video.videoHeight) return;

  const scaleX = displayW / video.videoWidth;
  const scaleY = displayH / video.videoHeight;

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  SKELETON_CONNECTIONS.forEach(([i, j]) => {
    const a = keypoints[i];
    const b = keypoints[j];
    if (a && b && a.score > 0.3 && b.score > 0.3) {
      ctx.beginPath();
      ctx.moveTo(a.x * scaleX, a.y * scaleY);
      ctx.lineTo(b.x * scaleX, b.y * scaleY);
      ctx.stroke();
    }
  });

  ctx.globalAlpha = 1;
  keypoints.forEach((kp) => {
    if (kp.score > 0.3) {
      ctx.beginPath();
      ctx.arc(kp.x * scaleX, kp.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });
}

/** Bounding-box-normalize raw keypoints to a named {x,y} map in 0-1 space. */
export function keypointsToNamed(keypoints, padding = 0.1) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  keypoints.forEach((kp) => {
    if (kp.score > 0.3) {
      minX = Math.min(minX, kp.x);
      maxX = Math.max(maxX, kp.x);
      minY = Math.min(minY, kp.y);
      maxY = Math.max(maxY, kp.y);
    }
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const named = {};
  keypoints.forEach((kp, i) => {
    if (i < KEYPOINT_NAMES.length && kp.score > 0.3) {
      named[KEYPOINT_NAMES[i]] = {
        x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) + padding,
        y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) + padding,
      };
    }
  });
  return named;
}

/**
 * Normalize a full frame sequence with ONE shared bounding box so the figure
 * doesn't jitter between frames. Returns [{time, pose}].
 */
export function normalizeFullSwingFrames(frames, padding = 0.1) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  frames.forEach((frame) => {
    frame.keypoints.forEach((kp) => {
      if (kp.score > 0.3) {
        minX = Math.min(minX, kp.x);
        maxX = Math.max(maxX, kp.x);
        minY = Math.min(minY, kp.y);
        maxY = Math.max(maxY, kp.y);
      }
    });
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  return frames.map((frame) => {
    const pose = {};
    frame.keypoints.forEach((kp, i) => {
      if (i < KEYPOINT_NAMES.length && kp.score > 0.3) {
        pose[KEYPOINT_NAMES[i]] = {
          x: ((kp.x - minX) / rangeX) * (1 - 2 * padding) + padding,
          y: ((kp.y - minY) / rangeY) * (1 - 2 * padding) + padding,
        };
      }
    });
    return { time: frame.time, pose };
  });
}

export function lerpPose(poseA, poseB, t) {
  const result = {};
  for (const key of Object.keys(poseA)) {
    if (poseB[key]) {
      result[key] = {
        x: poseA[key].x + (poseB[key].x - poseA[key].x) * t,
        y: poseA[key].y + (poseB[key].y - poseA[key].y) * t,
      };
    } else {
      result[key] = { ...poseA[key] };
    }
  }
  return result;
}

/**
 * Draw a stick figure from a named 0-1 pose onto a canvas.
 * Pass clear:false + alpha/glow to composite a second figure on the same
 * canvas (used by the you-vs-pro overlay stage).
 */
export function drawFigure(
  canvas,
  pose,
  { color = "#5cbc7f", ground = true, clear = true, alpha = 1, glow = null } = {}
) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  if (clear) ctx.clearRect(0, 0, w, h);
  if (!pose) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = Math.max(4, w * 0.02);
  }

  if (ground) {
    ctx.strokeStyle = "rgba(247,244,234,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.93);
    ctx.lineTo(w * 0.92, h * 0.93);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const getPoint = (name) => {
    const pt = pose[name];
    return pt ? { x: pt.x * w, y: pt.y * h } : null;
  };

  ctx.lineWidth = Math.max(2, w * 0.018);
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  NAMED_SKELETON.forEach(([a, b]) => {
    const pa = getPoint(a);
    const pb = getPoint(b);
    if (pa && pb) {
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  });

  const joints = [
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
  ];
  joints.forEach((name) => {
    const pt = getPoint(name);
    if (pt) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(2.5, w * 0.015), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });

  const nose = getPoint("nose");
  if (nose) {
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, Math.max(5, w * 0.035), 0, Math.PI * 2);
    ctx.fillStyle = "transparent";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, w * 0.014);
    ctx.stroke();
  }
  ctx.restore();
}
