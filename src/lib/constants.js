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

export const KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

export const KEYPOINT_INDEX = Object.fromEntries(KEYPOINT_NAMES.map((n, i) => [n, i]));

export const SKELETON_CONNECTIONS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16],
];

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
