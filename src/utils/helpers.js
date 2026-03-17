import { KEYPOINT_NAMES } from "./constants.js";

// ─── Angle Calculation ───
// Calculate angle at point B formed by points A-B-C
export function calcAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);
  if (magBA === 0 || magBC === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosA) * 180) / Math.PI;
}

// ─── Score Display Helpers ───
export function getScoreColor(score) {
  if (score >= 85) return "#22c55e";
  if (score >= 65) return "#eab308";
  if (score >= 45) return "#f97316";
  return "#ef4444";
}

export function getScoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Needs Work";
  return "Poor";
}

// ─── Time Formatting ───
export function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Score a single metric against a pro benchmark ───
export function scoreMetric(value, benchmark) {
  const { min, max, ideal } = benchmark;
  if (value >= min && value <= max) {
    const dist = Math.abs(value - ideal);
    const range = (max - min) / 2;
    return Math.round(100 - (dist / range) * 25);
  }
  const outside = value < min ? min - value : value - max;
  const range = max - min;
  return Math.max(0, Math.round(65 - (outside / range) * 60));
}

// ─── Extract swing measurements from MoveNet keypoints ───
export function analyzeKeypoints(kps) {
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

  // Spine angle
  if (ls && rs && lh && rh) {
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    measurements.spineAngle = Math.abs(
      Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180 / Math.PI
    );
  }

  // Knee flexion
  if (rh && rk && ra) {
    measurements.kneeFlexion = 180 - calcAngle(rh, rk, ra);
  }

  // Hip angle
  if (ls && lh && lk) {
    measurements.hipAngle = calcAngle(ls, lh, lk);
  }

  // Shoulder turn
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

  // Lead arm angle
  if (ls && le && lw) {
    measurements.leftArmAngle = calcAngle(ls, le, lw);
  }

  // Wrist hinge
  if (le && lw && ls) {
    measurements.wristHinge = 180 - calcAngle(ls, le, lw);
  }

  // Lag angle
  if (re && rw) {
    measurements.lagAngle = measurements.wristHinge || 85;
  }

  // Shoulder tilt
  if (ls && rs) {
    measurements.shoulderTilt = Math.abs(
      Math.atan2(ls.y - rs.y, ls.x - rs.x) * 180 / Math.PI
    );
  }

  // Hip open
  if (lh && rh) {
    measurements.hipOpen = Math.abs(
      Math.atan2(lh.y - rh.y, lh.x - rh.x)
    ) * 180 / Math.PI;
  }

  // Shaft lean
  if (rw && rh) {
    measurements.shaftLean = Math.min(
      Math.abs(Math.atan2(rw.x - rh.x, rh.y - rw.y)) * 180 / Math.PI,
      25
    );
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
    measurements.chestFacing = Math.abs(
      Math.atan2(rs.y - ls.y, rs.x - ls.x)
    ) * 180 / Math.PI;
  }

  // Hip slide
  if (lh && rh) {
    measurements.hipSlide = Math.abs(lh.x - rh.x) / 30;
  }

  return measurements;
}

// ─── Generate pro stick figure from benchmark angles ───
// Builds a BEHIND / DOWN-THE-LINE (DTL) view skeleton from the ideal angle
// values. Camera is behind the golfer looking at their back toward the target.
//
// Coordinate system (normalized 0-1):
//   x: golfer's left = viewer's RIGHT (mirrored), center ≈ 0.50
//   y: vertical, 0 = top, 1 = bottom
//   From behind we see the full width of shoulders/hips.
//   Spine tilt = upper body leans forward (down in frame).
//   Rotation = one shoulder/hip moves across the body.
export function generateProPose(allBenchmarks, phase) {
  const rad = (deg) => (deg * Math.PI) / 180;

  // Body segment lengths (normalized 0-1 space)
  const TORSO = 0.24;
  const NECK = 0.06;
  const UPPER_ARM = 0.12;
  const FOREARM = 0.11;
  const UPPER_LEG = 0.18;
  const LOWER_LEG = 0.20;
  // Wider than side view — we see the full back
  const SHOULDER_HALF = 0.09;
  const HIP_HALF = 0.07;

  const ideal = (ph, metric, fallback) =>
    allBenchmarks[ph]?.[metric]?.ideal ?? fallback;

  const spineAngle = ideal("address", "spineAngle", 30);
  const kneeFlexion = ideal("address", "kneeFlexion", 25);
  const hipAngleDeg = ideal("address", "hipAngle", 150);

  // ── Anchor: hip midpoint ──
  const hipMid = { x: 0.50, y: 0.52 };

  // Phase-specific hip lateral shift (toward target = golfer's left = viewer's right)
  let hipShiftX = 0;
  if (phase === "downswing") {
    hipShiftX = ideal("downswing", "hipSlide", 4) * 0.005;
  } else if (phase === "impact") {
    hipShiftX = 0.02;
  } else if (phase === "followThrough") {
    hipShiftX = 0.03;
  }

  const adjHip = { x: hipMid.x + hipShiftX, y: hipMid.y };

  // ── Hip rotation (from behind, rotation makes one hip move forward/back) ──
  // hipTurn/hipOpen affect the apparent width and offset of the hips
  let hipRotation = 0; // fraction: 0 = square, 1 = fully open
  if (phase === "backswing") {
    hipRotation = -(ideal("backswing", "hipTurn", 45) / 90); // closed
  } else if (phase === "impact") {
    hipRotation = ideal("impact", "hipOpen", 40) / 90; // open
  } else if (phase === "followThrough") {
    hipRotation = 0.7;
  }

  // Rotation compresses apparent width and shifts one side forward
  const hipW = HIP_HALF * Math.max(0.5, 1 - Math.abs(hipRotation) * 0.4);
  const hipYOffset = hipRotation * 0.015; // one hip higher than other when rotated
  const left_hip = { x: adjHip.x - hipW, y: adjHip.y + hipYOffset };
  const right_hip = { x: adjHip.x + hipW, y: adjHip.y - hipYOffset };

  // ── Spine → Shoulders ──
  // From behind, spine tilt moves shoulders DOWN (bending forward away from camera)
  let spineTilt = spineAngle;
  if (phase === "impact") spineTilt += 4;
  if (phase === "followThrough") spineTilt += 2;

  const shoulderMid = {
    x: adjHip.x,
    y: adjHip.y - Math.cos(rad(spineTilt)) * TORSO,
  };

  // ── Shoulder rotation (visible from behind as one shoulder moving across) ──
  let shoulderRotation = 0;
  if (phase === "backswing") {
    // Shoulders rotate away from target: left shoulder goes right (toward center/across)
    shoulderRotation = -(ideal("backswing", "shoulderTurn", 90) / 90);
  } else if (phase === "downswing") {
    shoulderRotation = -0.3; // still partially closed
  } else if (phase === "impact") {
    shoulderRotation = 0.15; // slightly open
  } else if (phase === "followThrough") {
    shoulderRotation = 0.8; // fully rotated through
  }

  const shoulderW = SHOULDER_HALF * Math.max(0.4, 1 - Math.abs(shoulderRotation) * 0.35);
  const sRotShift = shoulderRotation * 0.04; // lateral shift from rotation
  const sTiltY = 0;
  let shoulderTiltOffset = 0;
  if (phase === "downswing") {
    shoulderTiltOffset = ideal("downswing", "shoulderTilt", 36) * 0.0008;
  } else if (phase === "impact") {
    shoulderTiltOffset = 0.015;
  }

  const left_shoulder = {
    x: shoulderMid.x - shoulderW + sRotShift,
    y: shoulderMid.y + shoulderTiltOffset,
  };
  const right_shoulder = {
    x: shoulderMid.x + shoulderW + sRotShift,
    y: shoulderMid.y - shoulderTiltOffset,
  };

  // ── Head ──
  const nose = {
    x: shoulderMid.x + sRotShift * 0.3,
    y: shoulderMid.y - NECK,
  };

  // ── Legs ──
  // From behind: legs go straight down with slight splay
  const kfRad = rad(kneeFlexion);

  const left_knee = {
    x: left_hip.x - 0.01,
    y: left_hip.y + UPPER_LEG,
  };
  const right_knee = {
    x: right_hip.x + 0.01,
    y: right_hip.y + UPPER_LEG,
  };

  // Knee flexion: lower leg angles slightly
  const left_ankle = {
    x: left_knee.x - 0.005,
    y: left_knee.y + Math.cos(kfRad * 0.08) * LOWER_LEG,
  };
  const right_ankle = {
    x: right_knee.x + 0.005,
    y: right_knee.y + Math.cos(kfRad * 0.08) * LOWER_LEG,
  };

  // ── Arms (phase-dependent, from behind perspective) ──
  let left_elbow, right_elbow, left_wrist, right_wrist;

  if (phase === "address") {
    // Both arms hang down in front (from behind, they converge toward center-bottom)
    left_elbow = {
      x: left_shoulder.x + 0.02,
      y: left_shoulder.y + UPPER_ARM,
    };
    right_elbow = {
      x: right_shoulder.x - 0.02,
      y: right_shoulder.y + UPPER_ARM,
    };
    // Hands meet near center at the ball
    left_wrist = {
      x: left_elbow.x + 0.02,
      y: left_elbow.y + FOREARM,
    };
    right_wrist = {
      x: right_elbow.x - 0.02,
      y: right_elbow.y + FOREARM,
    };
  } else if (phase === "backswing") {
    // From behind: arms go UP and to the RIGHT (golfer's right = viewer's right)
    // Left arm crosses body (moves right and up)
    const leadArmAngle = ideal("backswing", "leftArmAngle", 180);
    const wristHinge = ideal("backswing", "wristHinge", 90);
    const elbowBend = rad(180 - Math.min(leadArmAngle, 185));

    left_elbow = {
      x: left_shoulder.x + UPPER_ARM * 0.7,
      y: left_shoulder.y - UPPER_ARM * 0.7,
    };
    left_wrist = {
      x: left_elbow.x + Math.sin(rad(30) + elbowBend) * FOREARM * 0.6,
      y: left_elbow.y - Math.cos(rad(30) + elbowBend) * FOREARM * 0.8,
    };

    // Right arm folds up and back (stays on right side)
    right_elbow = {
      x: right_shoulder.x + UPPER_ARM * 0.3,
      y: right_shoulder.y - UPPER_ARM * 0.6,
    };
    // Wrist hinge cocks the club upward
    const hingeF = wristHinge / 90;
    right_wrist = {
      x: right_elbow.x + FOREARM * 0.1 * hingeF,
      y: right_elbow.y - FOREARM * 0.7 * hingeF,
    };
  } else if (phase === "downswing") {
    // Arms dropping from the top, still on right side but moving left
    const lagAngle = ideal("downswing", "lagAngle", 85);
    const lagF = lagAngle / 90;

    left_elbow = {
      x: left_shoulder.x + UPPER_ARM * 0.4,
      y: left_shoulder.y + UPPER_ARM * 0.2,
    };
    // Lag keeps wrists cocked
    left_wrist = {
      x: left_elbow.x + FOREARM * 0.3 * lagF,
      y: left_elbow.y - FOREARM * 0.4 * lagF,
    };

    right_elbow = {
      x: right_shoulder.x + UPPER_ARM * 0.1,
      y: right_shoulder.y + UPPER_ARM * 0.5,
    };
    right_wrist = {
      x: right_elbow.x - FOREARM * 0.1,
      y: right_elbow.y + FOREARM * 0.4,
    };
  } else if (phase === "impact") {
    // Arms extended down to ball — from behind they converge toward center-bottom
    const shaftLean = ideal("impact", "shaftLean", 15);
    const leanShift = shaftLean * 0.001;

    left_elbow = {
      x: left_shoulder.x + 0.03,
      y: left_shoulder.y + UPPER_ARM,
    };
    left_wrist = {
      x: left_elbow.x + 0.02 + leanShift,
      y: left_elbow.y + FOREARM,
    };

    right_elbow = {
      x: right_shoulder.x - 0.02,
      y: right_shoulder.y + UPPER_ARM * 0.95,
    };
    right_wrist = {
      x: right_elbow.x - 0.01,
      y: right_elbow.y + FOREARM,
    };
  } else if (phase === "followThrough") {
    // Arms sweep UP and to the LEFT (toward target = viewer's right from behind)
    const extAngle = ideal("followThrough", "extensionAngle", 175);
    const extF = extAngle / 180;

    // From behind in follow-through, body has rotated significantly
    // Arms go up and left (viewer's right)
    left_elbow = {
      x: left_shoulder.x + UPPER_ARM * 0.5,
      y: left_shoulder.y - UPPER_ARM * 0.6,
    };
    left_wrist = {
      x: left_elbow.x + FOREARM * 0.4 * extF,
      y: left_elbow.y - FOREARM * 0.7 * extF,
    };

    right_elbow = {
      x: right_shoulder.x + UPPER_ARM * 0.2,
      y: right_shoulder.y - UPPER_ARM * 0.5,
    };
    right_wrist = {
      x: right_elbow.x + FOREARM * 0.3,
      y: right_elbow.y - FOREARM * 0.5,
    };

    // Weight shift: left knee firms up, right knee kicks in
    left_knee.x += 0.01;
    right_knee.x -= 0.02;
    right_knee.y += 0.015;
  }

  return {
    nose, left_shoulder, right_shoulder,
    left_elbow, right_elbow, left_wrist, right_wrist,
    left_hip, right_hip, left_knee, right_knee,
    left_ankle, right_ankle,
  };
}

// ─── Load an external script dynamically ───
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}