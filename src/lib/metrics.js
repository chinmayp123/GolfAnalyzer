import { KEYPOINT_INDEX, PHASE_METRICS, METRIC_LABELS } from "./constants.js";

// Angle at point B formed by A-B-C, in degrees
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

// Extract swing measurements from MoveNet keypoints
export function analyzeKeypoints(kps) {
  const get = (name) => {
    const kp = kps[KEYPOINT_INDEX[name]];
    return kp && (kp.score === undefined || kp.score > 0.25) ? kp : null;
  };

  const ls = get("left_shoulder"), rs = get("right_shoulder");
  const le = get("left_elbow"), re = get("right_elbow");
  const lw = get("left_wrist"), rw = get("right_wrist");
  const lh = get("left_hip"), rh = get("right_hip");
  const lk = get("left_knee");
  const rk = get("right_knee"), ra = get("right_ankle");
  const nose = get("nose");

  const m = {};

  if (ls && rs && lh && rh) {
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    m.spineAngle = Math.abs(
      (Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180) / Math.PI
    );
    const shoulderAngle = (Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180) / Math.PI;
    const hipAngle = (Math.atan2(lh.y - rh.y, lh.x - rh.x) * 180) / Math.PI;
    m.shoulderTurn = Math.abs(shoulderAngle - hipAngle);
  }

  if (rh && rk && ra) m.kneeFlexion = 180 - calcAngle(rh, rk, ra);
  if (ls && lh && lk) m.hipAngle = calcAngle(ls, lh, lk);

  if (lh && rh) {
    const dx = Math.abs(lh.x - rh.x);
    const dy = Math.abs(lh.y - rh.y);
    m.hipTurn = (Math.atan2(dy, dx) * 180) / Math.PI;
    m.hipOpen = Math.abs(Math.atan2(lh.y - rh.y, lh.x - rh.x)) * (180 / Math.PI);
    m.hipSlide = Math.abs(lh.x - rh.x) / 30;
  }

  if (ls && le && lw) {
    m.leftArmAngle = calcAngle(ls, le, lw);
    m.wristHinge = 180 - m.leftArmAngle;
  }

  // Approximation of lag from lead-arm fold (true lag needs club detection)
  if (m.wristHinge !== undefined) m.lagAngle = m.wristHinge;
  else if (re && rw) m.lagAngle = 85;

  if (ls && rs) {
    m.shoulderTilt = Math.abs((Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180) / Math.PI);
    m.chestFacing = Math.abs(Math.atan2(rs.y - ls.y, rs.x - ls.x)) * (180 / Math.PI);
  }

  if (rw && rh) {
    m.shaftLean = Math.min(
      Math.abs(Math.atan2(rw.x - rh.x, rh.y - rw.y)) * (180 / Math.PI),
      25
    );
  }

  if (nose && rw) m.headBehindBall = Math.max(0, (rw.x - nose.x) / 30);
  if (rs && re && rw) m.extensionAngle = calcAngle(rs, re, rw);

  return m;
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
