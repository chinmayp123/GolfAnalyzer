import { useRef, useState, useCallback } from "react";
import {
  Upload,
  Film,
  Video,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Lightbulb,
  Focus,
} from "lucide-react";

// ─── Capture step ───
// Record (device camera) / Upload (drag-drop or browse) segmented control,
// pose model status, compact pro selector, loaded-video confirmation, tips.
export default function UploadStep({
  session,
  onNext,
  proProfiles = [],
  selectedProId = null,
  onSelectPro,
  onGoPros,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [captureMode, setCaptureMode] = useState("upload");
  const [pickingPro, setPickingPro] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const selectedPro = proProfiles.find((p) => p.id === selectedProId) || null;

  const handleFile = useCallback(
    (file) => {
      if (file && file.type.startsWith("video/")) {
        session.loadFile(file);
      }
    },
    [session]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      handleFile(e.dataTransfer.files?.[0]);
    },
    [handleFile]
  );

  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const hasVideo = Boolean(session.videoSrc);

  return (
    <div className="fade-up flex flex-col items-center gap-4">
      {/* Segmented Record / Upload */}
      <div className="w-full max-w-2xl flex bg-pine-900 border border-cream-50/7 rounded-[11px] p-1 gap-1">
        {[
          { id: "record", label: "Record", icon: Video },
          { id: "upload", label: "Upload", icon: Upload },
        ].map((m) => {
          const Icon = m.icon;
          const active = captureMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setCaptureMode(m.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12.5px] cursor-pointer border-none transition-colors ${
                active
                  ? "bg-pine-700 text-cream-50 font-semibold"
                  : "bg-transparent text-ink-400 hover:text-cream-300"
              }`}
            >
              <Icon size={15} className={active ? "text-fairway-300" : undefined} />
              {m.label}
            </button>
          );
        })}
      </div>

      {captureMode === "upload" ? (
        /* ── Upload: drag/drop zone ── */
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`card w-full max-w-2xl cursor-pointer px-8 py-10 md:py-14 text-center transition-colors ${
            dragging ? "border-fairway-400 bg-pine-800" : "hover:bg-pine-800"
          }`}
          style={
            dragging
              ? { borderColor: "var(--color-fairway-400)", borderStyle: "dashed" }
              : { borderStyle: "dashed" }
          }
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-pine-700">
            {hasVideo ? (
              <Film className="h-7 w-7 text-fairway-300" />
            ) : (
              <Upload className="h-7 w-7 text-fairway-300" />
            )}
          </div>
          <h2 className="font-display mb-2 text-xl md:text-2xl text-cream-50">
            {hasVideo ? "Swap in a different swing" : "Upload your swing video"}
          </h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-400">
            Drag and drop a clip here, or click to browse. Face-on or
            down-the-line angles work best.
          </p>
          <span className="btn-primary pointer-events-none text-sm">
            <Film className="h-4 w-4" />
            Choose Video
          </span>
          <p className="mt-4 text-xs text-ink-500">MP4, MOV, or WebM</p>
        </div>
      ) : (
        /* ── Record: camera viewfinder ── */
        <div
          role="button"
          tabIndex={0}
          onClick={() => cameraInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") cameraInputRef.current?.click();
          }}
          className="relative w-full max-w-2xl cursor-pointer rounded-2xl border border-cream-50/6 px-8 py-14 text-center overflow-hidden"
          style={{
            background: "#05080a",
            backgroundImage:
              "repeating-linear-gradient(135deg,#0a0e0b,#0a0e0b 9px,#080b09 9px,#080b09 18px)",
          }}
        >
          {/* corner brackets */}
          <span className="absolute top-3.5 left-3.5 w-[22px] h-[22px] border-l-2 border-t-2 rounded-tl-md" style={{ borderColor: "rgba(143,214,168,0.5)" }} />
          <span className="absolute top-3.5 right-3.5 w-[22px] h-[22px] border-r-2 border-t-2 rounded-tr-md" style={{ borderColor: "rgba(143,214,168,0.5)" }} />
          <span className="absolute bottom-3.5 left-3.5 w-[22px] h-[22px] border-l-2 border-b-2 rounded-bl-md" style={{ borderColor: "rgba(143,214,168,0.5)" }} />
          <span className="absolute bottom-3.5 right-3.5 w-[22px] h-[22px] border-r-2 border-b-2 rounded-br-md" style={{ borderColor: "rgba(143,214,168,0.5)" }} />

          <Focus size={34} className="mx-auto mb-3 text-fairway-400" strokeWidth={1.6} />
          <h2 className="font-display mb-2 text-xl text-cream-50">Record your swing</h2>
          <p className="mx-auto mb-5 max-w-[220px] text-[11.5px] leading-relaxed text-ink-500">
            Frame yourself head-to-toe &middot; down-the-line or face-on
          </p>
          <span className="mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full border-[3px] border-cream-50/25">
            <span className="h-[46px] w-[46px] rounded-full" style={{ background: "#e0604c" }} />
          </span>
          <p className="mt-4 text-xs text-ink-500">Opens your camera on phones &middot; picks a file on desktop</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Pro selector */}
      <div className="card w-full max-w-2xl px-3.5 py-3">
        {selectedPro ? (
          <button
            type="button"
            onClick={() => setPickingPro((v) => !v)}
            className="flex w-full items-center gap-3 bg-transparent border-none cursor-pointer text-left"
          >
            <span
              className="h-[9px] w-[9px] shrink-0 rounded-full"
              style={{ background: selectedPro.color || "#d8b25c" }}
            />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] text-ink-500">Comparing against</span>
              <span className="block truncate text-[13px] font-medium text-cream-100">
                {selectedPro.name}
              </span>
            </span>
            <span className="text-[11.5px] font-medium text-fairway-300">
              {pickingPro ? "Done" : "Change"}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-ink-600" />
            <p className="flex-1 text-[13px] text-ink-400">
              No pro profile yet — create one to compare against.
            </p>
            <button
              type="button"
              onClick={onGoPros}
              className="bg-transparent border-none cursor-pointer text-[11.5px] font-medium text-fairway-300"
            >
              Pro Library
            </button>
          </div>
        )}
        {pickingPro && proProfiles.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-cream-50/6 pt-3 fade-up">
            {proProfiles.map((profile) => {
              const selected = profile.id === selectedProId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    onSelectPro?.(profile.id);
                    setPickingPro(false);
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                    selected
                      ? "bg-pine-700 text-cream-50"
                      : "border-transparent bg-pine-800 text-cream-300 hover:bg-pine-700"
                  }`}
                  style={selected ? { borderColor: profile.color } : undefined}
                >
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ background: profile.color }}
                  />
                  <span className="truncate">{profile.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Model status */}
      {session.modelStatus === "loading" && (
        <div className="flex items-center gap-2 text-sm text-fairway-300">
          <span className="spinner" />
          Loading pose model…
        </div>
      )}
      {session.modelStatus === "error" && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(224, 96, 76, 0.1)", color: "#e0604c" }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Pose model failed to load.
          <button
            type="button"
            onClick={() => session.loadModel()}
            className="btn-ghost px-3 py-1 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loaded confirmation */}
      {hasVideo && (
        <div className="fade-up flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-fairway-300">
            <CheckCircle2 className="h-4 w-4" />
            Video loaded and ready to analyze
          </div>
          <button
            type="button"
            onClick={onNext}
            className="btn-primary px-8 py-3 text-base"
          >
            Continue to Analysis
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Tips */}
      <div className="card w-full max-w-2xl p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-gold-400" />
          <h3 className="font-display text-base text-cream-50">
            Tips for best results
          </h3>
        </div>
        <ul className="grid gap-2 text-sm text-ink-400 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-fairway-400" />
            Film from down-the-line or face-on
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-fairway-400" />
            Keep the full body visible from address to finish
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-fairway-400" />
            Good, even lighting helps pose detection
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-fairway-400" />
            Slow-motion clips work great
          </li>
        </ul>
      </div>
    </div>
  );
}
