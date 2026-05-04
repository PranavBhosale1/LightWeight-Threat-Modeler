import { useState, useRef, useEffect } from "react";
import { Inp, Btn } from "./modelPrimitives.jsx";

export default function GeminiSettingsPopover({ apiKey, setApiKey, open, onOpenChange }) {
  const [reveal, setReveal] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <Btn
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Settings — Gemini API key"
        aria-label="Open settings"
        aria-expanded={open}
        variant="outline"
        className="h-9 px-3 text-xs"
        style={{ borderColor: open ? "#436086" : undefined, background: open ? "rgba(67,96,134,.08)" : undefined }}
      >
        Settings
      </Btn>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[300] w-[320px] max-w-[calc(100vw-32px)] rounded-xl border bg-card p-4 shadow-2xl">
          <div style={{ color: "#ff9f0a", fontFamily: "'Manrope', sans-serif", fontSize: 12, marginBottom: 10 }}>GEMINI API KEY</div>
          <p style={{ color: "#586064", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Optional — used for AI-assisted module generation, DFD analysis, STRIDE suggestions, and remediation. Configure here or via <code style={{ color: "#586064" }}>VITE_GEMINI_API_KEY</code> in <code style={{ color: "#586064" }}>.env</code>.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Inp type={reveal ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." style={{ flex: 1, fontFamily: "'Manrope', sans-serif", fontSize: 12 }} />
            <Btn type="button" variant="outline" className="px-3" onClick={() => setReveal((v) => !v)} aria-label={reveal ? "Hide API key" : "Show API key"}>
              {reveal ? "Hide" : "Show"}
            </Btn>
          </div>
          <p style={{ color: "#737c7f", fontSize: 12, margin: "0 0 12px" }}>
            Get a key at{" "}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#436086" }}>
              aistudio.google.com
            </a>
            .
          </p>
          <Btn type="button" onClick={() => onOpenChange(false)} variant="default" className="w-full" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>
            Done
          </Btn>
        </div>
      )}
    </div>
  );
}
