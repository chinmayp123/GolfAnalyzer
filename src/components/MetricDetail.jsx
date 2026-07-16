import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { PHASE_LABELS } from "../lib/constants.js";
import { getScoreColor, getScoreLabel } from "../lib/metrics.js";
import { keypointsToNamed, drawFigure } from "../lib/poseDrawing.js";

// ─── Metric detail: click a scored metric to SEE it ───
// Side-by-side still poses at that phase (you vs pro) with the body parts
// the metric measures highlighted, plus a plain-language explanation.

// Which segments/joints each metric is measured from
const METRIC_HIGHLIGHTS = {
  spineAngle: {
    segments: [
      ["left_shoulder", "left_hip"],
      ["right_shoulder", "right_hip"],
    ],
    joints: ["left_shoulder", "right_shoulder", "left_hip", "right_hip"],
  },
  kneeFlexion: {
    segments: [
      ["right_hip", "right_knee"],
      ["right_knee", "right_ankle"],
    ],
    joints: ["right_knee"],
  },
  hipAngle: {
    segments: [
      ["left_shoulder", "left_hip"],
      ["left_hip", "left_knee"],
    ],
    joints: ["left_hip"],
  },
  shoulderTurn: {
    segments: [
      ["left_shoulder", "right_shoulder"],
      ["left_hip", "right_hip"],
    ],
    joints: ["left_shoulder", "right_shoulder"],
  },
  hipTurn: { segments: [["left_hip", "right_hip"]], joints: ["left_hip", "right_hip"] },
  hipOpen: { segments: [["left_hip", "right_hip"]], joints: ["left_hip", "right_hip"] },
  leftArmAngle: {
    segments: [
      ["left_shoulder", "left_elbow"],
      ["left_elbow", "left_wrist"],
    ],
    joints: ["left_elbow"],
  },
  wristHinge: {
    segments: [
      ["left_shoulder", "left_elbow"],
      ["left_elbow", "left_wrist"],
    ],
    joints: ["left_wrist"],
  },
  lagAngle: {
    segments: [
      ["left_shoulder", "left_elbow"],
      ["left_elbow", "left_wrist"],
    ],
    joints: ["left_wrist"],
  },
  shoulderTilt: {
    segments: [["left_shoulder", "right_shoulder"]],
    joints: ["left_shoulder", "right_shoulder"],
  },
  hipSlide: { segments: [["left_hip", "right_hip"]], joints: ["left_hip", "right_hip"] },
  shaftLean: { segments: [["right_wrist", "right_hip"]], joints: ["right_wrist"] },
  headBehindBall: { segments: [], joints: ["nose", "right_wrist"] },
  extensionAngle: {
    segments: [
      ["right_shoulder", "right_elbow"],
      ["right_elbow", "right_wrist"],
    ],
    joints: ["right_elbow"],
  },
  chestFacing: {
    segments: [["left_shoulder", "right_shoulder"]],
    joints: ["left_shoulder", "right_shoulder"],
  },
};

// Plain-language: what it measures + what a miss usually means
const METRIC_EXPLAIN = {
  spineAngle:
    "How much your upper body tilts forward from your hips. Too upright and you'll stand up out of the shot; too bent and you'll crowd the ball.",
  kneeFlexion:
    "The bend in your trail knee. Athletic flex gives you balance and lets your hips rotate; locked or over-bent knees kill the ground-up sequence.",
  hipAngle:
    "The angle between your torso and lead thigh — your 'sit' into the setup. It sets how much room your arms have to swing.",
  shoulderTurn:
    "How far your shoulders have rotated relative to your hips (the X-factor). This separation is where stored power comes from.",
  hipTurn:
    "How far your hips have rotated from where they started at address. Too little restricts your backswing; too much wastes the coil.",
  hipOpen:
    "How open your hips are to the target at impact, versus where they were at setup. Pros clear their hips well before the club arrives.",
  leftArmAngle:
    "How straight your lead arm is. A bent lead arm at the top shrinks your swing arc and costs you speed and consistency.",
  wristHinge:
    "The set in your lead wrist/arm at the top. It's a big speed source, but overdone it makes the clubface hard to square.",
  lagAngle:
    "How long the angle between your lead arm and the club is retained on the way down. Releasing it early ('casting') dumps speed before the ball.",
  shoulderTilt:
    "How much your shoulders tilt (lead shoulder up/down) during the downswing. It keeps the club on plane and helps you strike down on irons.",
  hipSlide:
    "The small lateral bump of your hips toward the target starting the downswing. It sequences the lower body before the upper body fires.",
  shaftLean:
    "Hands ahead of the ball at impact. Forward lean compresses the ball; hands behind it adds loft and weak contact.",
  headBehindBall:
    "Keeping your head behind the ball through impact lets you hit up on the driver and stay balanced.",
  extensionAngle:
    "How fully your arms extend through and after impact. Full extension means you released all your speed at the ball.",
  chestFacing:
    "How far your chest has rotated through to the target in the finish. A full finish is proof the body — not just the arms — swung the club.",
};

function PoseCard({ label, color, keypoints, highlight }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !keypoints) return;
    const pose = keypointsToNamed(keypoints);
    drawFigure(canvas, pose, { color, highlight });
  }, [keypoints, color, highlight]);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-pine-700 bg-pine-900">
        {keypoints ? (
          <canvas ref={canvasRef} width={280} height={360} className="block w-full" />
        ) : (
          <div className="flex h-[240px] items-center justify-center px-4 text-center text-xs text-ink-500">
            No captured pose for this phase — re-calibrate the pro to enable this view.
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs font-medium" style={{ color }}>
        {label}
      </p>
    </div>
  );
}

export default function MetricDetail({ detail, proProfile, userSnapshot, onClose }) {
  if (!detail) return null;
  const { phase, metricKey, metric } = detail;
  const color = getScoreColor(metric.score);
  const highlightUser = {
    ...(METRIC_HIGHLIGHTS[metricKey] || { segments: [], joints: [] }),
    color: "#5cbc7f",
  };
  const highlightPro = {
    ...(METRIC_HIGHLIGHTS[metricKey] || { segments: [], joints: [] }),
    color: proProfile?.color || "#d8b25c",
  };
  const proKeypoints = proProfile?.phaseKeypoints?.[phase] || null;
  const diff = Math.round((metric.value - metric.benchmark.ideal) * 10) / 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card fade-up w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl text-cream-50">{metric.benchmark.label}</h2>
            <p className="text-xs text-ink-400">{PHASE_LABELS[phase] || phase}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-cream-50/5 hover:text-cream-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 mt-3 flex items-center gap-4">
          <span className="font-mono text-3xl font-semibold" style={{ color }}>
            {metric.score}
          </span>
          <div className="text-xs leading-relaxed text-ink-400">
            <span style={{ color }}>{getScoreLabel(metric.score)}</span> — you{" "}
            <span className="font-mono text-cream-100">{metric.value}°</span> vs pro{" "}
            <span className="font-mono text-cream-100">{metric.benchmark.ideal}°</span>
            {diff !== 0 && (
              <>
                {" "}
                ({diff > 0 ? "+" : ""}
                {diff}°)
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <PoseCard
            label="You"
            color="#5cbc7f"
            keypoints={userSnapshot?.keypoints || null}
            highlight={highlightUser}
          />
          <PoseCard
            label={proProfile?.name || "Pro"}
            color={proProfile?.color || "#d8b25c"}
            keypoints={proKeypoints}
            highlight={highlightPro}
          />
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-500">
          Highlighted lines are what this measurement is taken from.
        </p>

        {METRIC_EXPLAIN[metricKey] && (
          <p className="mt-4 rounded-lg bg-pine-900 p-3.5 text-sm leading-relaxed text-cream-300">
            {METRIC_EXPLAIN[metricKey]}
          </p>
        )}
      </div>
    </div>
  );
}
