import { KEYPOINT_INDEX } from "./constants.js";

// ─── Automatic swing-phase detection from hand kinematics ───
//
// Given a sequence of pose frames captured across the swing, this finds the
// five key positions by analyzing how the hands (wrist midpoint) move:
//
//   impact   → fastest hand speed while the hands are low in the frame
//   top      → highest hand position before impact (velocity reversal)
//   address  → last still frame before the takeaway begins
//   downswing→ hands crossing shoulder height on the way down
//   finish   → hands high again and decelerated, after impact
//
// All distances are normalized by torso length so the result is independent
// of video resolution and how large the golfer appears in frame.

function getPoint(frame, name, minScore = 0.25) {
  const kp = frame.keypoints[KEYPOINT_INDEX[name]];
  return kp && kp.score > minScore ? kp : null;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function movingAverage(arr, radius) {
  return arr.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
      sum += arr[j];
      count++;
    }
    return sum / count;
  });
}

// Shared per-frame kinematics: hand position + smoothed speed in
// torso-lengths per second.
function computeKinematics(frames) {
  if (!frames || frames.length < 8) return null;
  const samples = [];
  frames.forEach((f, i) => {
    const lw = getPoint(f, "left_wrist");
    const rw = getPoint(f, "right_wrist");
    const hands = lw && rw ? midpoint(lw, rw) : lw || rw;
    if (!hands) return;
    const ls = getPoint(f, "left_shoulder");
    const rs = getPoint(f, "right_shoulder");
    const lh = getPoint(f, "left_hip");
    const rh = getPoint(f, "right_hip");
    const shoulderMid = ls && rs ? midpoint(ls, rs) : null;
    const hipMid = lh && rh ? midpoint(lh, rh) : null;
    samples.push({
      frameIndex: i,
      time: f.time,
      hands,
      shoulderY: shoulderMid?.y ?? null,
      hipY: hipMid?.y ?? null,
      torso: shoulderMid && hipMid
        ? Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y)
        : null,
    });
  });
  if (samples.length < 8) return null;

  const torso = median(samples.map((s) => s.torso).filter(Boolean)) || 100;
  const xs = movingAverage(samples.map((s) => s.hands.x), 1);
  const ys = movingAverage(samples.map((s) => s.hands.y), 1);

  const speed = samples.map((s, i) => {
    if (i === 0 || i === samples.length - 1) return 0;
    const dt = samples[i + 1].time - samples[i - 1].time || 1e-3;
    return Math.hypot(xs[i + 1] - xs[i - 1], ys[i + 1] - ys[i - 1]) / torso / dt;
  });
  const sSpeed = movingAverage(speed, 1);
  const maxSpeed = Math.max(...sSpeed);
  if (maxSpeed <= 0.01) return null;

  return { samples, xs, ys, sSpeed, torso, maxSpeed };
}

/**
 * Find distinct swings in a scanned clip: sustained bursts of hand motion
 * separated by quiet periods. Returns [{start, end, peakTime, peakSpeed}]
 * sorted by time (empty array if kinematics can't be computed).
 */
export function detectSwingWindows(frames) {
  const kin = computeKinematics(frames);
  if (!kin) return [];
  const { samples, sSpeed, maxSpeed } = kin;

  // Active whenever hands move at a meaningful fraction of the fastest motion
  const activeThreshold = Math.max(0.12 * maxSpeed, 0.25);
  const regions = [];
  let current = null;
  samples.forEach((s, i) => {
    if (sSpeed[i] >= activeThreshold) {
      if (!current) current = { start: s.time, end: s.time, peakSpeed: 0, peakTime: s.time };
      current.end = s.time;
      if (sSpeed[i] > current.peakSpeed) {
        current.peakSpeed = sSpeed[i];
        current.peakTime = s.time;
      }
    } else if (current && s.time - current.end > 0.7) {
      regions.push(current);
      current = null;
    }
  });
  if (current) regions.push(current);

  // A real swing has a fast strike; drop fidgets and slow practice motion
  const swings = regions.filter(
    (r) => r.peakSpeed >= 0.45 * maxSpeed && r.end - r.start >= 0.3
  );

  const t0 = samples[0].time;
  const tEnd = samples[samples.length - 1].time;
  return swings.map((r) => ({
    start: Math.max(t0, r.start - 1.2),
    end: Math.min(tEnd, r.end + 1.2),
    peakTime: r.peakTime,
    peakSpeed: r.peakSpeed,
  }));
}

/**
 * @param {Array<{time: number, keypoints: Array<{x,y,score}>}>} frames
 * @returns {null | Record<phase, {time, frameIndex}> & {quality: string}}
 */
export function detectSwingPhases(frames) {
  const kin = computeKinematics(frames);
  if (!kin) return null;
  const { samples, ys, sSpeed, torso, maxSpeed } = kin;

  // ── Impact: fastest hands while the hands are low in the frame ──
  // (y grows downward in image coordinates)
  let impact = -1;
  let bestSpeed = -1;
  samples.forEach((s, i) => {
    const lowThreshold =
      s.shoulderY != null && s.hipY != null
        ? (s.shoulderY + s.hipY) / 2
        : s.hipY != null
          ? s.hipY - torso * 0.3
          : null;
    const handsLow = lowThreshold == null || ys[i] > lowThreshold;
    if (handsLow && sSpeed[i] > bestSpeed) {
      bestSpeed = sSpeed[i];
      impact = i;
    }
  });
  if (impact < 0) impact = sSpeed.indexOf(maxSpeed);

  // ── Top of backswing: highest hand position before impact ──
  let top = 0;
  let minY = Infinity;
  for (let i = 0; i < impact; i++) {
    if (ys[i] < minY) {
      minY = ys[i];
      top = i;
    }
  }
  if (top >= impact) top = Math.max(0, impact - 2);

  // ── Address: last quiet frame (with hands down) before the takeaway ──
  let address = 0;
  const quietThreshold = Math.max(0.1 * maxSpeed, 0.05);
  for (let i = top; i >= 0; i--) {
    const s = samples[i];
    const handsDown =
      s.hipY != null
        ? ys[i] > s.hipY - torso * 0.4
        : ys[i] > minY + (ys[impact] - minY) * 0.6;
    if (sSpeed[i] < quietThreshold && handsDown) {
      address = i;
      break;
    }
  }
  if (address >= top) address = Math.max(0, top - 2);

  // ── Downswing: hands crossing shoulder height on the way down ──
  let downswing = -1;
  for (let i = top + 1; i < impact; i++) {
    const s = samples[i];
    if (s.shoulderY != null && ys[i] > s.shoulderY) {
      downswing = i;
      break;
    }
  }
  if (downswing < 0) downswing = Math.round((top + impact) / 2);
  downswing = Math.max(top + 1, Math.min(impact - 1, downswing));

  // ── Finish: hands back above shoulders and decelerated, after impact ──
  let finish = samples.length - 1;
  for (let i = Math.min(impact + 2, samples.length - 1); i < samples.length; i++) {
    const s = samples[i];
    const handsHigh =
      s.shoulderY != null ? ys[i] < s.shoulderY : ys[i] < minY + torso * 0.5;
    if (handsHigh && sSpeed[i] < 0.35 * maxSpeed) {
      finish = i;
      break;
    }
  }

  // Sanity: phases must be strictly ordered in time
  const order = [address, top, downswing, impact, finish];
  const ordered = order.every((v, i) => i === 0 || v > order[i - 1]);

  const toResult = (idx) => ({
    time: samples[idx].time,
    frameIndex: samples[idx].frameIndex,
  });

  return {
    address: toResult(address),
    backswing: toResult(top),
    downswing: toResult(downswing),
    impact: toResult(impact),
    followThrough: toResult(finish),
    quality: ordered && bestSpeed > 0.5 ? "good" : "low",
  };
}
