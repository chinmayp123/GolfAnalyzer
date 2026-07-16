export const SWING_PHASES = ["address", "backswing", "downswing", "impact", "followThrough"];

export const PHASE_LABELS = {
  address: "Address",
  backswing: "Top of Backswing",
  downswing: "Downswing",
  impact: "Impact",
  followThrough: "Finish",
};

export const PHASE_HINTS = {
  address: "Set up, club behind the ball",
  backswing: "Club at its highest point",
  downswing: "Club dropping, halfway down",
  impact: "Club meeting the ball",
  followThrough: "Full finish, chest to target",
};

// ── MediaPipe Pose (BlazePose) — 33 landmarks ──
export const KEYPOINT_NAMES = [
  "nose", "left_eye_inner", "left_eye", "left_eye_outer",
  "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear", "mouth_left", "mouth_right",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_pinky", "right_pinky",
  "left_index", "right_index", "left_thumb", "right_thumb",
  "left_hip", "right_hip", "left_knee", "right_knee",
  "left_ankle", "right_ankle", "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
];

export const KEYPOINT_INDEX = Object.fromEntries(KEYPOINT_NAMES.map((n, i) => [n, i]));

// ── Legacy MoveNet format (17 points) — still present in profiles and
//    history saved before the 3D migration ──
export const LEGACY_KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

export const LEGACY_KEYPOINT_INDEX = Object.fromEntries(
  LEGACY_KEYPOINT_NAMES.map((n, i) => [n, i])
);

/** Index of a named keypoint in an array of either format (33 or 17 points). */
export function kpIndex(name, arrayLength) {
  return (arrayLength === LEGACY_KEYPOINT_NAMES.length ? LEGACY_KEYPOINT_INDEX : KEYPOINT_INDEX)[
    name
  ];
}

/** Keypoint names matching an array of either format. */
export function namesFor(arrayLength) {
  return arrayLength === LEGACY_KEYPOINT_NAMES.length ? LEGACY_KEYPOINT_NAMES : KEYPOINT_NAMES;
}

// Drawing connections, by index, per format
export const SKELETON_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28],
  [27, 29], [29, 31], [27, 31], [28, 30], [30, 32], [28, 32],
];

export const LEGACY_SKELETON_CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16],
];

export function connectionsFor(arrayLength) {
  return arrayLength === LEGACY_KEYPOINT_NAMES.length
    ? LEGACY_SKELETON_CONNECTIONS
    : SKELETON_CONNECTIONS;
}

// Named connections for stick-figure drawing (missing names are skipped, so
// legacy 17-point poses simply omit the foot segments)
export const NAMED_SKELETON = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["left_ankle", "left_heel"],
  ["left_heel", "left_foot_index"],
  ["left_ankle", "left_foot_index"],
  ["right_ankle", "right_heel"],
  ["right_heel", "right_foot_index"],
  ["right_ankle", "right_foot_index"],
];

export const TRACER_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Red", value: "#ef4444" },
  { name: "Gold", value: "#d8b25c" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Green", value: "#5cbc7f" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
];

// Which measurements are scored at each phase
export const PHASE_METRICS = {
  address: ["spineAngle", "kneeFlexion", "hipAngle"],
  backswing: ["shoulderTurn", "hipTurn", "leftArmAngle", "wristHinge"],
  downswing: ["hipSlide", "lagAngle", "shoulderTilt"],
  impact: ["hipOpen", "shaftLean", "headBehindBall"],
  followThrough: ["extensionAngle", "chestFacing"],
};

export const METRIC_LABELS = {
  spineAngle: "Spine Tilt",
  kneeFlexion: "Knee Flex",
  hipAngle: "Hip Angle",
  shoulderTurn: "Shoulder Turn",
  hipTurn: "Hip Turn",
  leftArmAngle: "Lead Arm Straightness",
  wristHinge: "Wrist Hinge",
  hipSlide: "Hip Lateral Shift",
  lagAngle: "Wrist Lag",
  shoulderTilt: "Shoulder Tilt",
  hipOpen: "Hips Open at Impact",
  shaftLean: "Forward Shaft Lean",
  headBehindBall: "Head Behind Ball",
  extensionAngle: "Arm Extension",
  chestFacing: "Chest to Target",
};

// Profiles calibrated with the 3D (MediaPipe 33-point) pipeline carry this
// format tag; older 2D profiles should be re-calibrated for rotation accuracy.
export const PROFILE_FORMAT_3D = "mp33";
