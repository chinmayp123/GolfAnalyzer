import { SWING_PHASES } from "./constants.js";
import { analyzeKeypoints, scorePhase, orientationReference, hipYawOf } from "./metrics.js";
import { detectSwingPhases } from "./phaseDetection.js";

/**
 * Detect phases in a captured frame sequence and score them against a pro
 * profile. Shared by the file-analysis flow and live Practice mode.
 *
 * @returns null when no swing is found, else
 *   { detection, snapshots, phaseScores, overallScore }
 */
export function scoreSwing(frames, proProfile) {
  const detection = detectSwingPhases(frames);
  if (!detection) return null;

  let ref = null;
  const snapshots = {};
  // SWING_PHASES order matters: address establishes the orientation
  // reference that the rotation metrics measure against.
  SWING_PHASES.forEach((phase) => {
    const hit = detection[phase];
    if (!hit) return;
    const frame = frames[hit.frameIndex] || frames.find((f) => f.time === hit.time);
    if (!frame) return;
    if (phase === "address") ref = orientationReference(frame.world);
    if (phase === "backswing") {
      const topHipYaw = hipYawOf(frame.world);
      if (topHipYaw != null) ref = { ...(ref || {}), topHipYaw };
    }
    const measurements = analyzeKeypoints(frame.keypoints, frame.world || null, ref);
    const benchmarks = proProfile?.benchmarks?.[phase] || {};
    const { metrics, overallScore } = scorePhase(measurements, benchmarks);
    snapshots[phase] = {
      time: frame.time,
      keypoints: frame.keypoints,
      world: frame.world || null,
      measurements,
      metrics,
      overallScore,
    };
  });

  const phases = Object.keys(snapshots);
  if (phases.length === 0) return null;

  const phaseScores = {};
  let total = 0;
  phases.forEach((p) => {
    phaseScores[p] = snapshots[p].overallScore;
    total += snapshots[p].overallScore;
  });

  return {
    detection,
    snapshots,
    phaseScores,
    overallScore: Math.round(total / phases.length),
  };
}
