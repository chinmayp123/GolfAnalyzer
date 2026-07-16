import { kpIndex, PHASE_METRICS, METRIC_LABELS } from "./constants.js";

// Angle at point B formed by A-B-C, in degrees (2D)
export function calcAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.hypot(ba.x, ba.y);
  const magBC = Math.hypot(bc.x, bc.y);
  if (magBA === 0 || magBC === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

// Angle at point B formed by A-B-C, in degrees (3D world coordinates)
export function calcAngle3D(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  const magBA = Math.hypot(ba.x, ba.y, ba.z);
  const magBC = Math.hypot(bc.x, bc.y, bc.z);
  if (magBA === 0 || magBC === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

// Yaw (rotation about the vertical axis) of the line from left→right point,
// in the horizontal ground plane. World coords: x right, y down, z depth.
function lineYaw(left, right) {
  return (Math.atan2(right.z - left.z, right.x - left.x) * 180) / Math.PI;
}

// Smallest signed difference between two yaw angles (-180..180)
function yawDelta(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function getScoreColor(score) {
  if (score >= 85) return "#5cbc7f";
  if (score >= 65) return "#d8b25c";
  if (score >= 45) return "#e08a4c";
  return "#e0604c";
}

export function getScoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Needs Work";
  return "Poor";
}

export function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Score a measured value against a {min, max, ideal} benchmark
export function scoreMetric(value, benchmark) {
  const { min, max, ideal } = benchmark;
  if (value >= min && value <= max) {
    const dist = Math.abs(value - ideal);
    const range = (max - min) / 2;
    return Math.round(100 - (dist / (range || 1)) * 25);
  }
  const outside = value < min ? min - value : value - max;
  const range = max - min || 1;
  return Math.max(0, Math.round(65 - (outside / range) * 60));
}

/**
 * Orientation reference captured at address — rotation metrics (hip turn,
 * hips open, chest to target) are measured relative to this, which makes
 * them camera-angle independent.
 */
export function orientationReference(world) {
  if (!world) return null;
  const lh = world[kpIndex("left_hip", world.length)];
  const rh = world[kpIndex("right_hip", world.length)];
  const ls = world[kpIndex("left_shoulder", world.length)];
  const rs = world[kpIndex("right_shoulder", world.length)];
  if (!lh || !rh || !ls || !rs) return null;
  return {
    hipYaw: lineYaw(lh, rh),
    shoulderYaw: lineYaw(ls, rs),
  };
}

/**
 * Extract swing measurements from pose keypoints.
 *
 * @param kps   image-space keypoints (33-pt MediaPipe or legacy 17-pt)
 * @param world optional 3D world landmarks (meters) — enables true rotation
 *              and tilt measurements
 * @param ref   optional address orientation reference (orientationReference)
 */
export function analyzeKeypoints(kps, world = null, ref = null) {
  const get = (name) => {
    const idx = kpIndex(name, kps.length);
    const kp = idx !== undefined ? kps[idx] : null;
    return kp && (kp.score === undefined || kp.score > 0.25) ? kp : null;
  };
  const getW = (name) => {
    if (!world) return null;
    const idx = kpIndex(name, world.length);
    const p = idx !== undefined ? world[idx] : null;
    return p && (p.score === undefined || p.score > 0.25) ? p : null;
  };

  const ls = get("left_shoulder"), rs = get("right_shoulder");
  const le = get("left_elbow"), lw = get("left_wrist");
  const rw = get("right_wrist");
  const lh = get("left_hip"), rh = get("right_hip");
  const lk = get("left_knee");
  const rk = get("right_knee"), ra = get("right_ankle");
  const nose = get("nose");

  const wLs = getW("left_shoulder"), wRs = getW("right_shoulder");
  const wLh = getW("left_hip"), wRh = getW("right_hip");
  const wLe = getW("left_elbow"), wLw = getW("left_wrist");
  const wRe = getW("right_elbow"), wRw = getW("right_wrist");
  const wLk = getW("left_knee");
  const wRk = getW("right_knee"), wRa = getW("right_ankle");

  const m = {};

  // ── Posture (3D when available; y is DOWN in world coords) ──
  if (wLs && wRs && wLh && wRh) {
    const shoulderMid = mid3(wLs, wRs);
    const hipMid = mid3(wLh, wRh);
    const dy = hipMid.y - shoulderMid.y; // spine "up" magnitude
    const horiz = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.z - hipMid.z);
    m.spineAngle = (Math.atan2(horiz, Math.max(dy, 1e-6)) * 180) / Math.PI;
  } else if (ls && rs && lh && rh) {
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    m.spineAngle = Math.abs(
      (Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180) / Math.PI
    );
  }

  if (wRh && wRk && wRa) m.kneeFlexion = 180 - calcAngle3D(wRh, wRk, wRa);
  else if (rh && rk && ra) m.kneeFlexion = 180 - calcAngle(rh, rk, ra);

  if (wLs && wLh && wLk) m.hipAngle = calcAngle3D(wLs, wLh, wLk);
  else if (ls && lh && lk) m.hipAngle = calcAngle(ls, lh, lk);

  // ── Rotations (the whole point of 3D) ──
  if (wLs && wRs && wLh && wRh) {
    const shoulderYaw = lineYaw(wLs, wRs);
    const hipYaw = lineYaw(wLh, wRh);
    // X-factor style separation — reference-free
    m.shoulderTurn = Math.abs(yawDelta(shoulderYaw, hipYaw));
    if (ref) {
      m.hipTurn = Math.abs(yawDelta(hipYaw, ref.hipYaw));
      m.hipOpen = Math.abs(yawDelta(hipYaw, ref.hipYaw));
      m.chestFacing = Math.abs(yawDelta(shoulderYaw, ref.shoulderYaw));
    }
    // Shoulder tilt: vertical drop across the shoulder line
    const shoulderWidth = Math.hypot(wRs.x - wLs.x, wRs.y - wLs.y, wRs.z - wLs.z);
    if (shoulderWidth > 0) {
      m.shoulderTilt = Math.abs(
        (Math.asin(Math.max(-1, Math.min(1, (wRs.y - wLs.y) / shoulderWidth))) * 180) / Math.PI
      );
    }
  }

  // 2D fallbacks for rotation-ish metrics (legacy data — camera-dependent)
  if (m.shoulderTurn === undefined && ls && rs && lh && rh) {
    const shoulderAngle = (Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180) / Math.PI;
    const hipAngle = (Math.atan2(lh.y - rh.y, lh.x - rh.x) * 180) / Math.PI;
    m.shoulderTurn = Math.abs(shoulderAngle - hipAngle);
  }
  if (m.hipTurn === undefined && lh && rh) {
    const dx = Math.abs(lh.x - rh.x);
    const dy = Math.abs(lh.y - rh.y);
    m.hipTurn = (Math.atan2(dy, dx) * 180) / Math.PI;
    m.hipOpen = Math.abs(Math.atan2(lh.y - rh.y, lh.x - rh.x)) * (180 / Math.PI);
  }
  if (m.shoulderTilt === undefined && ls && rs) {
    m.shoulderTilt = Math.abs((Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180) / Math.PI);
  }
  if (m.chestFacing === undefined && ls && rs) {
    m.chestFacing = Math.abs(Math.atan2(rs.y - ls.y, rs.x - ls.x)) * (180 / Math.PI);
  }

  // ── Arms / wrists ──
  if (wLs && wLe && wLw) {
    m.leftArmAngle = calcAngle3D(wLs, wLe, wLw);
    m.wristHinge = 180 - m.leftArmAngle;
  } else if (ls && le && lw) {
    m.leftArmAngle = calcAngle(ls, le, lw);
    m.wristHinge = 180 - m.leftArmAngle;
  }

  // Approximation of lag from lead-arm fold (true lag needs club detection)
  if (m.wristHinge !== undefined) m.lagAngle = m.wristHinge;

  if (wRs && wRe && wRw) m.extensionAngle = calcAngle3D(wRs, wRe, wRw);
  else if (rs && get("right_elbow") && rw) m.extensionAngle = calcAngle(rs, get("right_elbow"), rw);

  // ── Image-space measurements (positional, fine in 2D) ──
  if (lh && rh) m.hipSlide = Math.abs(lh.x - rh.x) / 30;

  if (rw && rh) {
    m.shaftLean = Math.min(
      Math.abs(Math.atan2(rw.x - rh.x, rh.y - rw.y)) * (180 / Math.PI),
      25
    );
  }

  if (nose && rw) m.headBehindBall = Math.max(0, (rw.x - nose.x) / 30);

  return m;
}

function mid3(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

// Build {min,max,ideal,label} benchmarks from a pro's measured phase values
export function extractBenchmarks(phaseMeasurements) {
  const benchmarks = {};
  Object.entries(phaseMeasurements).forEach(([phase, measurements]) => {
    const keys = PHASE_METRICS[phase];
    if (!keys) return;
    benchmarks[phase] = {};
    keys.forEach((key) => {
      const val = measurements[key];
      if (val === undefined) return;
      const spread = Math.max(Math.abs(val) * 0.15, 5);
      benchmarks[phase][key] = {
        min: Math.round((val - spread) * 10) / 10,
        max: Math.round((val + spread) * 10) / 10,
        ideal: Math.round(val * 10) / 10,
        label: METRIC_LABELS[key] || key,
      };
    });
  });
  return benchmarks;
}

// Score one phase's measurements against benchmarks → {metrics, overallScore}
export function scorePhase(measurements, benchmarks) {
  const metrics = {};
  let total = 0;
  let count = 0;
  Object.entries(benchmarks || {}).forEach(([key, bm]) => {
    const val = measurements[key];
    if (val === undefined) return;
    const score = scoreMetric(val, bm);
    metrics[key] = { value: Math.round(val * 10) / 10, score, benchmark: bm };
    total += score;
    count++;
  });
  return { metrics, overallScore: count > 0 ? Math.round(total / count) : 0 };
}
