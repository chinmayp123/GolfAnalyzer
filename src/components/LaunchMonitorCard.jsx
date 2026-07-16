import { useState } from "react";
import { Gauge, Check } from "lucide-react";

// ─── Launch monitor data entry (Shot Scope LM1 etc.) ───
// Ball-flight outcomes typed in from the launch monitor after the swing.
// Saved with the swing's history record and fed into AI coaching so it can
// correlate mechanics with results.

export const SHOT_DIRECTIONS = ["straight", "draw", "fade", "pull", "push", "hook", "slice"];

const FIELDS = [
  { key: "clubSpeed", label: "Club speed", unit: "mph", max: 160 },
  { key: "ballSpeed", label: "Ball speed", unit: "mph", max: 230 },
  { key: "carry", label: "Carry", unit: "yds", max: 400 },
];

export function formatShotData(d) {
  if (!d) return null;
  const parts = [];
  if (d.clubSpeed) parts.push(`${d.clubSpeed} mph club`);
  if (d.ballSpeed) parts.push(`${d.ballSpeed} mph ball`);
  if (d.smash) parts.push(`${d.smash} smash`);
  if (d.carry) parts.push(`${d.carry} yds`);
  if (d.direction) parts.push(d.direction);
  return parts.join(" · ") || null;
}

export default function LaunchMonitorCard({ savedShotData, onSave }) {
  const [draft, setDraft] = useState(() => ({
    clubSpeed: savedShotData?.clubSpeed ?? "",
    ballSpeed: savedShotData?.ballSpeed ?? "",
    carry: savedShotData?.carry ?? "",
    direction: savedShotData?.direction ?? "",
  }));
  const [saved, setSaved] = useState(!!savedShotData);

  const club = parseFloat(draft.clubSpeed);
  const ball = parseFloat(draft.ballSpeed);
  const smash = club > 0 && ball > 0 ? Math.round((ball / club) * 100) / 100 : null;
  const hasAnything =
    draft.clubSpeed !== "" || draft.ballSpeed !== "" || draft.carry !== "" || draft.direction !== "";

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    const carry = parseFloat(draft.carry);
    onSave({
      clubSpeed: club > 0 ? club : null,
      ballSpeed: ball > 0 ? ball : null,
      smash,
      carry: carry > 0 ? carry : null,
      direction: draft.direction || null,
    });
    setSaved(true);
  };

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Gauge size={16} className="text-gold-400" />
        <h3 className="text-sm font-medium text-cream-100">Launch monitor</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-ink-400">
        Got a launch monitor (Shot Scope LM1, etc.)? Enter this swing&apos;s numbers —
        they&apos;re saved with the swing and the AI coach uses them to connect your
        mechanics to the ball flight.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[11px] font-semibold text-cream-300">
              {f.label}{" "}
              <span className="font-normal text-ink-500">({f.unit})</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={f.max}
              value={draft[f.key]}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder="—"
              className="w-full rounded-lg border border-cream-50/10 bg-pine-900 px-2.5 py-2 font-mono text-sm text-cream-100 outline-none focus:border-fairway-500/50"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-cream-300">
            Shape <span className="font-normal text-ink-500">(optional)</span>
          </span>
          <select
            value={draft.direction}
            onChange={(e) => setField("direction", e.target.value)}
            className="w-full rounded-lg border border-cream-50/10 bg-pine-900 px-2 py-2 text-sm text-cream-100 outline-none focus:border-fairway-500/50"
          >
            <option value="">—</option>
            {SHOT_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-primary !py-2"
          disabled={!hasAnything || saved}
          onClick={handleSave}
        >
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            "Save shot data"
          )}
        </button>
        {smash !== null && (
          <span className="text-xs text-ink-400">
            Smash factor:{" "}
            <span className="font-mono font-semibold text-gold-300">{smash}</span>
          </span>
        )}
      </div>
    </div>
  );
}
