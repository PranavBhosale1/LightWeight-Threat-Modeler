import { Link } from "react-router-dom";
import { C, STRIDE, DREAD } from "../threatModeler/modelConstants.js";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Help() {
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
            <Link to="/settings" style={{ color: "#586064", fontSize: 13, textDecoration: "none" }}>Settings</Link>
          </nav>
        </div>
      </header>
      <main className="tm-stagger" style={{ ...C.main, maxWidth: 1040, paddingTop: 36 }}>
        <div style={{ position: "relative", paddingLeft: 18, marginBottom: 22 }}>
          <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 4, borderRadius: 4, background: "#436086" }} />
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "clamp(2rem, 4vw, 3rem)", lineHeight: 1.06, letterSpacing: "-0.02em", margin: 0 }}>Help & glossary</h1>
          <p style={{ margin: "8px 0 0", color: "#586064", fontSize: 14 }}>Definitions and guidance for STRIDE, DREAD, trust boundaries, and component-driven threat seeding.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
          <Card className="tm-card-hover gap-0 py-0" style={{ ...C.card, marginBottom: 0 }}>
          <CardContent className="p-0">
          <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>STRIDE</div>
          <p style={{ color: "#586064", fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>Microsoft STRIDE buckets threats by intent:</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#2b3437", fontSize: 14, lineHeight: 1.85 }}>
            {STRIDE.map((s) => (
              <li key={s.id}><Badge variant="outline" style={{ color: s.color, borderColor: `${s.color}60`, marginRight: 6 }}>{s.id}</Badge> {s.name}: {s.desc}</li>
            ))}
          </ul>
          </CardContent>
          </Card>

          <Card className="tm-card-hover gap-0 py-0" style={{ ...C.card, marginBottom: 0 }}>
          <CardContent className="p-0">
          <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>DREAD</div>
          <p style={{ color: "#586064", fontSize: 14, lineHeight: 1.65, marginBottom: 12 }}>Five 1–10 dimensions for prioritization:</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#2b3437", fontSize: 14, lineHeight: 1.85 }}>
            {DREAD.map((d) => (
              <li key={d.id}><strong>{d.label}</strong> — {d.desc}</li>
            ))}
          </ul>
          </CardContent>
          </Card>
        </div>

        <Card className="tm-card-hover gap-0 py-0" style={C.card}>
          <CardContent className="p-0">
          <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>COMPONENT TYPES & LIBRARY THREATS</div>
          <p style={{ color: "#586064", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
            In <strong style={{ color: "#2b3437" }}>Step 2</strong>, each module can map to a built-in component type (e.g. Login, Database). The library attaches STRIDE patterns and security requirements. In <strong style={{ color: "#2b3437" }}>Step 4</strong>, those become seeded threats you mark applicable or not.
          </p>
          </CardContent>
        </Card>

        <Card className="tm-card-hover gap-0 py-0" style={C.card}>
          <CardContent className="p-0">
          <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 12, marginBottom: 12 }}>FAQ</div>
          <dl style={{ margin: 0, color: "#586064", fontSize: 14, lineHeight: 1.7 }}>
            <dt style={{ color: "#2b3437", marginTop: 10 }}>Why upload a ZIP?</dt>
            <dd style={{ margin: "6px 0 0" }}>For legacy flows, the ZIP gives a deterministic file index and manifests so module names align with your repo. Parsing happens in your browser.</dd>
            <dt style={{ color: "#2b3437", marginTop: 10 }}>Do I need a Gemini API key?</dt>
            <dd style={{ margin: "6px 0 0" }}>No. You can complete the full workflow manually. A key is only needed for optional AI-generated suggestions (Settings or <code style={{ color: "#586064" }}>VITE_GEMINI_API_KEY</code>).</dd>
            <dt style={{ color: "#2b3437", marginTop: 10 }}>Where are projects saved?</dt>
            <dd style={{ margin: "6px 0 0" }}>{"In this browser's localStorage only. Export JSON from the hub for backup or tickets."}</dd>
          </dl>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
