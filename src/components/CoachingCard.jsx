import { useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { streamCoaching, coachingErrorMessage } from "../lib/claude.js";
import Markdown from "./Markdown.jsx";

// ─── AI coaching report card: streams a Claude coaching report ───

export default function CoachingCard({ analysis, apiKey, onOpenSettings, initialText, onComplete }) {
  const [status, setStatus] = useState("idle"); // idle | streaming | done | error
  const [text, setText] = useState("");
  const [error, setError] = useState(null);

  const generate = async () => {
    setStatus("streaming");
    setError(null);
    setText("");
    let full = "";
    try {
      full = await streamCoaching({
        apiKey,
        analysis,
        onText: (t) => setText((prev) => prev + t),
      });
      setText(full);
      setStatus("done");
      onComplete?.(full);
    } catch (err) {
      setError(coachingErrorMessage(err));
      setStatus("error");
    }
  };

  const streaming = status === "streaming";
  const showSaved = status === "idle" && !!initialText;
  const displayText = showSaved ? initialText : text;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-fairway-600/20 border border-fairway-600/30 flex items-center justify-center shrink-0">
          <Sparkles size={17} className="text-fairway-300" />
        </div>
        <div>
          <h3 className="font-display text-cream-50 text-lg leading-tight">AI Coaching</h3>
          <p className="text-xs text-ink-400">Powered by Claude</p>
        </div>
      </div>

      {!apiKey ? (
        <div>
          <p className="text-sm text-cream-300 leading-relaxed mb-4">
            Add your Anthropic API key to get a personalized coaching report — root cause,
            priority fix, and a drill.
          </p>
          <button className="btn-primary text-sm" onClick={onOpenSettings}>
            Add API key
          </button>
        </div>
      ) : (
        <div>
          {displayText && <Markdown text={displayText} />}

          {status === "error" && (
            <p className="text-sm mt-3" style={{ color: "#e0604c" }}>
              {error}
            </p>
          )}

          <div className="flex items-center gap-3 mt-4">
            {showSaved ? (
              <button className="btn-ghost text-sm" onClick={generate}>
                <RotateCcw size={14} />
                Regenerate
              </button>
            ) : streaming ? (
              <button className="btn-primary text-sm" disabled>
                <span className="spinner" />
                Coaching in progress…
              </button>
            ) : status === "error" ? (
              <button className="btn-primary text-sm" onClick={generate}>
                Retry
              </button>
            ) : status === "done" ? (
              <button className="btn-ghost text-sm" onClick={generate}>
                <RotateCcw size={14} />
                Regenerate
              </button>
            ) : (
              <button className="btn-primary text-sm" onClick={generate}>
                <Sparkles size={14} />
                Generate coaching report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
