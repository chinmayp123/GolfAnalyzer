import Anthropic from "@anthropic-ai/sdk";
import { PHASE_LABELS } from "./constants.js";

// ─── AI coaching via the Claude API ───
// The user's API key is stored locally (localStorage) and requests go
// directly from the browser to Anthropic.

const COACH_SYSTEM = `You are a world-class golf swing coach reviewing computer-vision measurements of a student's swing, compared phase-by-phase against a professional's swing that was measured with the same pose-detection pipeline.

The measurements come from 2D pose estimation (MoveNet), so treat individual numbers as approximate; focus on patterns across phases rather than single-degree differences. Angles are in degrees.

When launch monitor data is included (club speed, ball speed, smash factor, carry, shot shape), use it to connect mechanics to outcomes: a low smash factor points at strike quality, shot shape points at face/path, and speed points at sequencing. Ground the Root Cause and Priority Fix in what the ball actually did, not just the pose deltas.

Write your response in markdown with exactly these sections:

## The Big Picture
Two or three sentences summarizing the swing overall — lead with what the numbers say is most important.

## What's Working
2-3 bullet points on the strongest parts of the swing (highest-scoring metrics).

## Root Cause
Identify the ONE underlying issue that most likely explains the lowest-scoring metrics. Swing faults cascade (e.g., poor hip turn at the top forces compensations at impact), so connect the dots across phases rather than listing each bad number separately.

## Priority Fix
The single change to work on first, explained in plain language a weekend golfer understands.

## Drill
One specific, named practice drill for that fix: how to set up, what to feel, how many reps.

Keep the whole response under 400 words. Be direct and encouraging, not clinical.`;

function buildPrompt(analysis) {
  const { proName, overallScore, phaseResults, shotData } = analysis;
  const lines = [
    `Student swing vs pro "${proName}". Overall score: ${overallScore}/100.`,
    ``,
  ];
  if (shotData) {
    const parts = [];
    if (shotData.clubSpeed) parts.push(`club speed ${shotData.clubSpeed} mph`);
    if (shotData.ballSpeed) parts.push(`ball speed ${shotData.ballSpeed} mph`);
    if (shotData.smash) parts.push(`smash factor ${shotData.smash}`);
    if (shotData.carry) parts.push(`carry ${shotData.carry} yds`);
    if (shotData.direction) parts.push(`shot shape: ${shotData.direction}`);
    if (parts.length) {
      lines.push(`Launch monitor data for this swing: ${parts.join(", ")}.`, ``);
    }
  }
  lines.push(
    `Per-phase measurements (student value vs pro's measured value, with a 0-100 score):`
  );
  Object.entries(phaseResults).forEach(([phase, data]) => {
    lines.push(``, `${PHASE_LABELS[phase] || phase} — phase score ${data.overallScore}/100:`);
    Object.entries(data.metrics || {}).forEach(([key, m]) => {
      lines.push(
        `- ${m.benchmark.label}: student ${m.value}°, pro ${m.benchmark.ideal}° (score ${m.score})`
      );
    });
  });
  return lines.join("\n");
}

/**
 * Stream a coaching report. onText receives incremental text.
 * Returns the full report text.
 */
export async function streamCoaching({ apiKey, analysis, onText }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: COACH_SYSTEM,
    messages: [{ role: "user", content: buildPrompt(analysis) }],
  });
  if (onText) stream.on("text", onText);
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("Claude declined to answer this request.");
  }
  return final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export function coachingErrorMessage(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Invalid API key. Check it in Settings (gear icon, top right).";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Claude API — wait a moment and try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the Claude API. Check your internet connection.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Claude API error (${err.status}): ${err.message}`;
  }
  return err?.message || "Something went wrong generating coaching.";
}
