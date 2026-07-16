import { useRef, useState, useCallback } from "react";
import {
  Upload,
  Film,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";

// ─── Upload Step ───
// Drag-and-drop / click-to-browse upload zone, pose model status,
// loaded-video confirmation, and shooting tips.
export default function UploadStep({ session, onNext }) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

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
    <div className="fade-up flex flex-col items-center gap-6 py-8">
      {/* Drop zone */}
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
        className={`card w-full max-w-2xl cursor-pointer px-8 py-14 text-center transition-colors ${
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
        <h2 className="font-display mb-2 text-2xl text-cream-50">
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
      {session.modelStatus === "ready" && (
        <div className="flex items-center gap-2 rounded-full border border-fairway-600/40 bg-pine-800 px-3 py-1.5 text-xs text-fairway-300">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-fairway-400" />
          Pose model ready
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-ghost px-4 py-2 text-xs"
          >
            Choose a different video
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
