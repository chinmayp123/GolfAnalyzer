import { useState, useRef, useEffect, useCallback } from "react";
import {
  Flag, Settings, X, Eye, EyeOff, ChevronRight,
  Upload, ScanLine, BarChart3, Users, History as HistoryIcon,
} from "lucide-react";

import useSwingSession from "./hooks/useSwingSession.js";
import { loadProfiles, saveProfiles, getApiKey, setApiKey, saveSwing } from "./lib/storage.js";

import UploadStep from "./components/UploadStep.jsx";
import AnalyzeStep from "./components/AnalyzeStep.jsx";
import ResultsStep from "./components/ResultsStep.jsx";
import ProLibrary from "./components/ProLibrary.jsx";
import HistoryPage from "./components/HistoryPage.jsx";

const PAGES = [
  { id: "analyze", label: "Analyze", icon: ScanLine },
  { id: "pros", label: "Pro Library", icon: Users },
  { id: "history", label: "History", icon: HistoryIcon },
];

const STEPS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "analyze", label: "Analyze", icon: ScanLine },
  { id: "results", label: "Results", icon: BarChart3 },
];

export default function App() {
  const [page, setPage] = useState("analyze");
  const [step, setStep] = useState("upload");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKeyState] = useState(() => getApiKey());

  // Pro profiles (persisted in localStorage, backwards compatible)
  const [profiles, setProfiles] = useState(() => loadProfiles());
  const [selectedProId, setSelectedProId] = useState(null);
  const selectedProfile = profiles.find((p) => p.id === selectedProId) || null;

  useEffect(() => {
    if (!selectedProId && profiles.length > 0) setSelectedProId(profiles[0].id);
  }, [profiles, selectedProId]);

  const handleSaveProfile = useCallback((profile) => {
    setProfiles((prev) => {
      const updated = [...prev.filter((p) => p.id !== profile.id), profile];
      saveProfiles(updated);
      return updated;
    });
  }, []);

  const handleDeleteProfile = useCallback(
    (profileId) => {
      setProfiles((prev) => {
        const updated = prev.filter((p) => p.id !== profileId);
        saveProfiles(updated);
        return updated;
      });
      if (selectedProId === profileId) setSelectedProId(null);
    },
    [selectedProId]
  );

  // The analysis session (user's swing)
  const session = useSwingSession({ proProfile: selectedProfile });

  // ── Auto-save each completed analysis to history ──
  const savedForFramesRef = useRef(null);
  const [currentSwing, setCurrentSwing] = useState(null);

  useEffect(() => {
    if (!session.analysisResults || !session.scannedFrames) return;

    const phaseScores = {};
    Object.entries(session.analysisResults.phaseResults).forEach(([phase, r]) => {
      phaseScores[phase] = r.overallScore;
    });
    const overall = session.analysisResults.overallScore;

    // One history record per scan. Re-scoring the same scan (switching pro,
    // switching swing window, late-arriving thumbnail) updates it in place.
    if (savedForFramesRef.current === session.scannedFrames) {
      setCurrentSwing((prev) => {
        if (!prev) return prev;
        const thumbChanged = session.thumbnail && session.thumbnail !== prev.thumbnail;
        const scoreChanged =
          prev.overallScore !== overall ||
          JSON.stringify(prev.phaseScores) !== JSON.stringify(phaseScores);
        if (!thumbChanged && !scoreChanged) return prev;
        const updated = {
          ...prev,
          overallScore: overall,
          phaseScores,
          thumbnail: session.thumbnail || prev.thumbnail,
        };
        saveSwing(updated).catch((err) => console.error("History save failed:", err));
        return updated;
      });
      return;
    }
    savedForFramesRef.current = session.scannedFrames;

    const record = {
      id: Date.now(),
      date: new Date().toISOString(),
      proName: selectedProfile?.name || "—",
      proColor: selectedProfile?.color || "#5cbc7f",
      overallScore: overall,
      phaseScores,
      coaching: null,
      thumbnail: session.thumbnail || null,
    };
    setCurrentSwing(record);
    saveSwing(record).catch((err) => console.error("History save failed:", err));
  }, [session.analysisResults, session.scannedFrames, session.thumbnail, selectedProfile]);

  const handleCoachingComplete = useCallback(
    (text) => {
      if (!currentSwing) return;
      const updated = { ...currentSwing, coaching: text };
      setCurrentSwing(updated);
      saveSwing(updated).catch((err) => console.error("History save failed:", err));
    },
    [currentSwing]
  );

  const saveKey = (key) => {
    setApiKey(key);
    setApiKeyState(key);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-cream-50/8 bg-pine-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <button
            className="flex items-center gap-3 bg-transparent border-none cursor-pointer"
            onClick={() => setPage("analyze")}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fairway-500 to-fairway-700 flex items-center justify-center">
              <Flag size={18} className="text-cream-50" />
            </div>
            <div className="text-left">
              <div className="font-display text-lg leading-tight text-cream-50">SwingAI</div>
              <div className="text-[11px] text-ink-500 leading-tight">Golf swing analyzer</div>
            </div>
          </button>

          <nav className="flex items-center gap-1">
            {PAGES.map((p) => {
              const Icon = p.icon;
              const active = page === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPage(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border transition-colors ${
                    active
                      ? "bg-fairway-500/15 text-fairway-300 border-fairway-500/30"
                      : "bg-transparent text-ink-400 border-transparent hover:text-cream-100 hover:bg-cream-50/5"
                  }`}
                >
                  <Icon size={15} />
                  {p.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {session.modelStatus === "ready" && (
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-fairway-300 bg-fairway-500/10 border border-fairway-500/20 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-fairway-400 pulse-dot" />
                Pose model ready
              </div>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg text-ink-400 hover:text-cream-100 hover:bg-cream-50/5 cursor-pointer bg-transparent border-none"
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        {page === "analyze" && (
          <div>
            {/* Stepper */}
            <div className="flex items-center gap-2 mb-8">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const current = step === s.id;
                const done = i < stepIndex;
                return (
                  <div key={s.id} className="flex items-center gap-2">
                    {i > 0 && <ChevronRight size={14} className="text-ink-600" />}
                    <button
                      onClick={() => setStep(s.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm cursor-pointer border transition-colors ${
                        current
                          ? "bg-fairway-500/15 text-fairway-300 border-fairway-500/40 font-semibold"
                          : done
                            ? "bg-transparent text-cream-300 border-cream-50/10 hover:bg-cream-50/5"
                            : "bg-transparent text-ink-500 border-cream-50/8 hover:text-cream-300"
                      }`}
                    >
                      <Icon size={14} />
                      {s.label}
                    </button>
                  </div>
                );
              })}
            </div>

            {step === "upload" && (
              <UploadStep session={session} onNext={() => setStep("analyze")} />
            )}
            {step === "analyze" && (
              <AnalyzeStep
                session={session}
                proProfiles={profiles}
                selectedProId={selectedProId}
                onSelectPro={setSelectedProId}
                onAnalyzed={() => setStep("results")}
                onGoUpload={() => setStep("upload")}
              />
            )}
            {step === "results" && (
              <ResultsStep
                session={session}
                proProfile={selectedProfile}
                apiKey={apiKey}
                onOpenSettings={() => setSettingsOpen(true)}
                onGoToAnalyze={() => setStep("analyze")}
                onCoachingComplete={handleCoachingComplete}
                savedCoaching={currentSwing?.coaching || null}
              />
            )}
          </div>
        )}

        {page === "pros" && (
          <ProLibrary
            profiles={profiles}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        )}

        {page === "history" && <HistoryPage />}
      </main>

      <footer className="border-t border-cream-50/5 py-4">
        <div className="max-w-7xl mx-auto px-6 text-[11px] text-ink-600 flex items-center justify-between">
          <span>SwingAI — analysis runs entirely in your browser.</span>
          <span>Pose detection: MoveNet · Coaching: Claude</span>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onSave={saveKey}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Settings modal ───
function SettingsModal({ apiKey, onSave, onClose }) {
  const [draft, setDraft] = useState(apiKey);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-xl text-cream-50 m-0">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-400 hover:text-cream-100 hover:bg-cream-50/5 cursor-pointer bg-transparent border-none"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-ink-400 mt-0 mb-5">
          SwingAI uses Claude for AI coaching reports. Your key is stored only in
          this browser and sent directly to Anthropic.
        </p>

        <label className="block text-xs font-semibold text-cream-300 mb-2">
          Anthropic API key
        </label>
        <div className="flex gap-2 mb-1">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSaved(false);
              }}
              placeholder="sk-ant-…"
              className="w-full bg-pine-900 border border-cream-50/10 rounded-lg px-3 py-2.5 pr-10 text-sm text-cream-100 font-mono outline-none focus:border-fairway-500/50"
            />
            <button
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-500 hover:text-cream-300 cursor-pointer bg-transparent border-none"
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink-500 mb-5">
          Get a key at console.anthropic.com → API keys.
        </p>

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={() => {
              onSave(draft.trim());
              setSaved(true);
            }}
          >
            {saved ? "Saved" : "Save"}
          </button>
          {apiKey && (
            <button
              className="btn-ghost"
              onClick={() => {
                setDraft("");
                onSave("");
                setSaved(true);
              }}
            >
              Clear key
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
