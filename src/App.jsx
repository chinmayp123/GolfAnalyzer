import { useState, useRef, useEffect, useCallback } from "react";
import {
  Flag, Settings, X, Eye, EyeOff,
  ScanLine, Users, History as HistoryIcon, Home,
} from "lucide-react";

import useSwingSession from "./hooks/useSwingSession.js";
import { loadProfiles, saveProfiles, getApiKey, setApiKey, saveSwing } from "./lib/storage.js";

import HomePage from "./components/HomePage.jsx";
import UploadStep from "./components/UploadStep.jsx";
import AnalyzeStep from "./components/AnalyzeStep.jsx";
import ResultsStep from "./components/ResultsStep.jsx";
import ProLibrary from "./components/ProLibrary.jsx";
import HistoryPage from "./components/HistoryPage.jsx";

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "analyze", label: "Analyze", icon: ScanLine },
  { id: "pros", label: "Pros", railLabel: "Pro Library", icon: Users },
  { id: "history", label: "History", icon: HistoryIcon },
];

const STEPS = [
  { id: "upload", label: "Capture" },
  { id: "analyze", label: "Analyze" },
  { id: "results", label: "Results" },
];

export default function App() {
  const [page, setPage] = useState("home");
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

  const handleSaveShotData = useCallback(
    (shotData) => {
      if (!currentSwing) return;
      const updated = { ...currentSwing, shotData };
      setCurrentSwing(updated);
      saveSwing(updated).catch((err) => console.error("History save failed:", err));
    },
    [currentSwing]
  );

  const saveKey = (key) => {
    setApiKey(key);
    setApiKeyState(key);
  };

  const startNewAnalysis = useCallback(() => {
    setPage("analyze");
    setStep(session.videoSrc ? "analyze" : "upload");
  }, [session.videoSrc]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen md:pl-[212px]">
      {/* ── Desktop left rail ── */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[212px] flex-col gap-1.5 border-r border-cream-50/7 px-3.5 py-5"
        style={{ background: "#0a0e0b" }}
      >
        <button
          className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer px-2 pb-4 text-left"
          onClick={() => setPage("home")}
        >
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-fairway-500 to-fairway-700 flex items-center justify-center shrink-0">
            <Flag size={15} className="text-cream-50" />
          </div>
          <div>
            <div className="font-display text-base leading-none text-cream-50">SwingAI</div>
            <div className="text-[9.5px] text-ink-500 mt-0.5">swing analyzer</div>
          </div>
        </button>

        {NAV.map((p) => {
          const Icon = p.icon;
          const active = page === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={`flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-[13px] cursor-pointer border text-left transition-colors ${
                active
                  ? "text-fairway-300 font-semibold"
                  : "bg-transparent text-ink-400 border-transparent hover:text-cream-100 hover:bg-cream-50/5"
              }`}
              style={
                active
                  ? {
                      background: "rgba(63,164,106,0.14)",
                      borderColor: "rgba(63,164,106,0.28)",
                    }
                  : undefined
              }
            >
              <Icon size={17} />
              {p.railLabel || p.label}
            </button>
          );
        })}

        <div className="flex-1" />

        {session.modelStatus === "ready" && (
          <div className="flex items-center gap-2 px-3 pb-1 text-[10.5px] text-fairway-300">
            <span className="w-1.5 h-1.5 rounded-full bg-fairway-400 pulse-dot" />
            Pose model ready
          </div>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2.5 border-t border-cream-50/6 px-3 pt-3.5 pb-1 bg-transparent border-x-0 border-b-0 cursor-pointer text-left hover:opacity-90"
        >
          <div className="w-[30px] h-[30px] rounded-full bg-pine-700 text-fairway-300 flex items-center justify-center shrink-0">
            <Settings size={14} />
          </div>
          <div>
            <div className="text-xs text-cream-100">Settings</div>
            <div className="text-[10px] text-ink-500">API key &amp; more</div>
          </div>
        </button>
      </aside>

      {/* ── Mobile header: just logo + settings ── */}
      <header className="md:hidden border-b border-cream-50/8 bg-pine-950/80 backdrop-blur sticky top-0 z-40">
        <div className="px-5 h-14 flex items-center justify-between">
          <button
            className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer"
            onClick={() => setPage("home")}
          >
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-fairway-500 to-fairway-700 flex items-center justify-center">
              <Flag size={15} className="text-cream-50" />
            </div>
            <span className="font-display text-lg text-cream-50">SwingAI</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg text-ink-400 hover:text-cream-100 hover:bg-cream-50/5 cursor-pointer bg-transparent border-none"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="w-full max-w-7xl mx-auto px-5 md:px-8 py-5 md:py-8 pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-8">
        {page === "home" && (
          <HomePage
            onNewAnalysis={startNewAnalysis}
            onOpenHistory={() => setPage("history")}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        {page === "analyze" && (
          <div>
            {/* Title + model status */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="font-display text-[22px] text-cream-50">New analysis</h1>
              {session.modelStatus === "ready" && (
                <div
                  className="flex items-center gap-1.5 text-[10.5px] text-fairway-300 px-2.5 py-[5px] rounded-full border"
                  style={{
                    background: "rgba(63,164,106,0.1)",
                    borderColor: "rgba(63,164,106,0.2)",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-fairway-400 pulse-dot" />
                  Model ready
                </div>
              )}
            </div>

            {/* Numbered progress dots */}
            <div className="flex items-center gap-2 mb-6 max-w-md">
              {STEPS.map((s, i) => {
                const current = step === s.id;
                const done = i < stepIndex;
                return (
                  <div key={s.id} className={`flex items-center gap-2 ${i > 0 ? "flex-1" : ""}`}>
                    {i > 0 && <div className="flex-1 h-[1.5px] bg-pine-700" />}
                    <button
                      onClick={() => setStep(s.id)}
                      className="flex items-center gap-[7px] bg-transparent border-none cursor-pointer p-0"
                    >
                      <span
                        className={`w-[22px] h-[22px] rounded-full text-[11px] flex items-center justify-center shrink-0 ${
                          current
                            ? "bg-fairway-500 text-pine-950 font-bold"
                            : done
                              ? "bg-fairway-700 text-cream-50 font-semibold"
                              : "bg-pine-800 border border-cream-50/10 text-ink-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                      {current && (
                        <span className="text-xs font-semibold text-cream-50">{s.label}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {step === "upload" && (
              <UploadStep
                session={session}
                onNext={() => setStep("analyze")}
                proProfiles={profiles}
                selectedProId={selectedProId}
                onSelectPro={setSelectedProId}
                onGoPros={() => setPage("pros")}
              />
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
                savedShotData={currentSwing?.shotData || null}
                onSaveShotData={handleSaveShotData}
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

      <footer className="hidden md:block border-t border-cream-50/5 py-4">
        <div className="max-w-7xl mx-auto px-8 text-[11px] text-ink-600 flex items-center justify-between">
          <span>SwingAI — analysis runs entirely in your browser.</span>
          <span>Pose detection: MoveNet · Coaching: Claude</span>
        </div>
      </footer>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-cream-50/7"
        style={{
          background: "rgba(12,17,13,0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV.map((p) => {
          const Icon = p.icon;
          const active = page === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className="flex-1 h-[60px] flex flex-col items-center justify-center gap-1 bg-transparent border-none cursor-pointer"
              style={{ color: active ? "#8fd6a8" : "#6f7d72" }}
            >
              <Icon size={20} />
              <span className={`text-[9px] ${active ? "font-semibold" : ""}`}>{p.label}</span>
            </button>
          );
        })}
      </nav>

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
