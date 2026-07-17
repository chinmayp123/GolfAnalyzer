import { kpIndex } from "./constants.js";

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
  const idx = kpIndex(name, frame.keypoints.length);
  const kp = idx !== undefined ? frame.keypoints[idx] : null;
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
 * Position-based phase detection (works at any playback speed, incl. slo-mo).
 *
 * Hand HEIGHT relative to the body tells the story of a golf swing:
 *   address — hands down at ball level, still, before they start rising
 *   top     — hands at their highest before the strike (end of the plateau:
 *             "where the player stops pulling the club back")
 *   downswing (delivery) — hands dropping back through hip height on the way
 *             to the ball; this is where launch is determined
 *   impact  — hands return to their address height: the bottom of the arc,
 *             ball contact
 *   finish  — hands back up at their highest after impact, held follow-through
 *
 * `rel[i]` normalizes hand height: 0 = shoulder line, 1 = hip line,
 * >1 = below the hips (address zone), negative = above the shoulders.
 *
 * @param {Array<{time: number, keypoints: Array<{x,y,score}>}>} frames
 * @returns {null | Record<phase, {time, frameIndex}> & {quality: string}}
 */
export function detectSwingPhases(frames) {
  const kin = computeKinematics(frames);
  if (!kin) return null;
  const { samples, ys, sSpeed, torso, maxSpeed } = kin;
  const n = samples.length;

  // Hand height relative to shoulder(0)→hip(1) span, robust to camera zoom
  const rel = samples.map((s, i) => {
    if (s.shoulderY != null && s.hipY != null && s.hipY !== s.shoulderY) {
      return (ys[i] - s.shoulderY) / (s.hipY - s.shoulderY);
    }
    return (ys[i] - (samples[0].shoulderY ?? ys[i])) / (torso || 1);
  });

  const ySpan = Math.max(...ys) - Math.min(...ys) || 1;

  // Address-zone hand height: median rel over the early below-hips frames
  const addrRels = [];
  for (let i = 0; i < n && addrRels.length < 40; i++) {
    if (rel[i] >= 1.0) addrRels.push(rel[i]);
  }
  addrRels.sort((a, b) => a - b);
  const addrRel = addrRels.length ? addrRels[Math.floor(addrRels.length / 2)] : 1.15;

  // ── Impact: the first return of the hands to address height AFTER they
  // have been up (the strike). Found first because the finish wrap can put
  // the hands even higher than the top of the backswing. ──
  let wentUp = -1;
  for (let i = 0; i < n; i++) {
    if (rel[i] < 0.15) {
      wentUp = i;
      break;
    }
  }
  if (wentUp < 0) return null; // hands never rose — not a swing

  let impact = -1;
  for (let i = wentUp + 1; i < n; i++) {
    if (rel[i] >= addrRel - 0.12) {
      impact = i;
      break;
    }
  }
  if (impact < 0) {
    // Hands never quite got back to address height — take their lowest
    // point after going up instead.
    impact = wentUp + 1 < n ? wentUp + 1 : n - 1;
    for (let i = wentUp + 1; i < n; i++) if (ys[i] > ys[impact]) impact = i;
  }

  // ── Top: the highest-hands plateau BEFORE impact; take its LAST frame
  // (the moment the club stops going back — the transition) ──
  let minYIdx = 0;
  for (let i = 1; i < impact; i++) if (ys[i] < ys[minYIdx]) minYIdx = i;
  let top = minYIdx;
  while (top + 1 < impact - 1 && ys[top + 1] <= ys[minYIdx] + ySpan * 0.04) top++;

  // ── Address: the last moment before the top when the hands were still
  // down at ball level (start of the takeaway) ──
  let address = 0;
  for (let i = top; i >= 0; i--) {
    if (rel[i] >= Math.max(1.05, addrRel - 0.1)) {
      address = i;
      break;
    }
  }
  if (address >= top) address = Math.max(0, top - 2);

  // ── Downswing (delivery): hands dropping back through hip height between
  // the top and impact — where the launch is set up ──
  let downswing = -1;
  for (let i = top + 1; i < impact; i++) {
    if (rel[i] >= 0.8) {
      downswing = i;
      break;
    }
  }
  if (downswing < 0) downswing = Math.round(top + (impact - top) * 0.75);
  downswing = Math.max(top + 1, Math.min(impact - 1, downswing));

  // ── Finish: hands back at their highest after impact (held follow-through) ──
  let finish = Math.min(impact + 1, n - 1);
  for (let i = impact + 1; i < n; i++) {
    if (ys[i] <= ys[finish]) finish = i; // <= prefers the LATEST highest point
  }

  // Sanity: phases must be strictly ordered in time
  const order = [address, top, downswing, impact, finish];
  const ordered = order.every((v, i) => i === 0 || v > order[i - 1]);
  // The hands should have travelled a meaningful arc and moved fast at some point
  const meaningful = ySpan > torso * 0.8 && maxSpeed > 0.4;

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
    quality: ordered && meaningful ? "good" : "low",
  };
}
