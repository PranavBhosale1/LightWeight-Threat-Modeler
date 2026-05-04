import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { C } from "../threatModeler/modelConstants.js";
import { Inp, Btn } from "../threatModeler/modelPrimitives.jsx";
import { getStoredGeminiApiKey, setStoredGeminiApiKey } from "../lib/appPrefs.js";
import { DEFAULT_GEMINI_API_KEY } from "../geminiEnv.js";
import { clearAllProjects } from "../lib/projectPersistence.js";
import { Card, CardContent } from "@/components/ui/card";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    setApiKey(DEFAULT_GEMINI_API_KEY || getStoredGeminiApiKey());
  }, []);

  const saveKey = () => {
    setStoredGeminiApiKey(apiKey);
    window.alert("Gemini API key saved in this browser.");
  };

  return (
    <div className="tm-page-enter" style={{ ...C.root, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box}
      `}</style>
      <header style={C.hdr}>
        <div style={C.hdrIn}>
          <Link to="/" style={{ color: "#2b3437", textDecoration: "none", fontWeight: 800, fontFamily: "Manrope, sans-serif", fontSize: 20 }}>ThreatModeler</Link>
          <nav style={{ display: "flex", gap: 14 }}>
            <Link to="/hub" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Hub</Link>
            <Link to="/help" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Help</Link>
          </nav>
        </div>
      </header>
      <main className="tm-stagger" style={{ ...C.main, maxWidth: 940, paddingTop: 36 }}>
        <div style={{ position: "relative", paddingLeft: 18, marginBottom: 22 }}>
          <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 4, borderRadius: 4, background: "#436086" }} />
          <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.7rem)", color: "#2b3437", margin: 0, fontFamily: "Manrope, sans-serif", letterSpacing: "-0.02em" }}>Workspace settings</h1>
          <p style={{ margin: "8px 0 0", color: "#586064", fontSize: 14 }}>Manage optional AI access and local data behavior.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(260px, 320px)", gap: 12 }}>
          <Card className="tm-card-hover gap-0 py-0" style={C.card}>
            <CardContent className="p-0">
            <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>GEMINI API KEY</div>
            <p style={{ color: "#586064", fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
              Used only for optional AI suggestions. Stored only in this browser. You can also set <code style={{ color: "#586064" }}>VITE_GEMINI_API_KEY</code> at build time.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Inp type={reveal ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
              <Btn type="button" style={{ flexShrink: 0 }} onClick={() => setReveal((v) => !v)}>{reveal ? "Hide" : "Show"}</Btn>
            </div>
            <Btn type="button" onClick={saveKey} variant="default" style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)" }}>Save key</Btn>
            </CardContent>
          </Card>

          <Card className="tm-card-hover gap-0 py-0" style={{ ...C.card, marginBottom: 0, background: "#f1f4f6" }}>
            <CardContent className="p-0">
            <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>NOTES</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#586064", fontSize: 13, lineHeight: 1.75 }}>
              <li>Gemini is optional.</li>
              <li>ZIP and project-structure parsing happen locally in your browser.</li>
              <li>Without an API key, manual modeling still works end-to-end.</li>
              <li>Saved projects live in browser localStorage.</li>
            </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="tm-card-hover gap-0 py-0" style={{ ...C.card, borderColor: "rgba(239,68,68,0.35)", marginTop: 12 }}>
          <CardContent className="p-0">
          <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>DANGER ZONE</div>
          <p style={{ color: "#586064", fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
            Remove all saved threat models from localStorage on this device. This does not clear your Gemini key unless you remove it above.
          </p>
          <Btn
            type="button"
            variant="destructive"
            onClick={() => {
              if (window.confirm("Delete ALL saved projects from this browser?")) {
                clearAllProjects();
                window.alert("All projects removed.");
              }
            }}
          >
            Clear all projects
          </Btn>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
