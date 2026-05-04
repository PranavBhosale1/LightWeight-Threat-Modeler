import strideQuestionnaire from "../strideQuestionnaire.json";

export const STRIDE = [
  { id: "S", name: "Spoofing", color: "#f59e0b", desc: "Impersonating an entity" },
  { id: "T", name: "Tampering", color: "#ef4444", desc: "Modifying data or code" },
  { id: "R", name: "Repudiation", color: "#8b5cf6", desc: "Denying an action" },
  { id: "I", name: "Info Disclosure", color: "#06b6d4", desc: "Exposing private data" },
  { id: "D", name: "Denial of Service", color: "#f97316", desc: "Degrading availability" },
  { id: "E", name: "Elevation of Privilege", color: "#ec4899", desc: "Gaining extra permissions" }
];

export const DREAD = [
  { id: "damage", label: "Damage Potential", desc: "How severe is the impact?" },
  { id: "reproducibility", label: "Reproducibility", desc: "How easy to reproduce?" },
  { id: "exploitability", label: "Exploitability", desc: "How easy to exploit?" },
  { id: "affectedUsers", label: "Affected Users", desc: "How many are impacted?" },
  { id: "discoverability", label: "Discoverability", desc: "How easy to discover?" }
];

export const QUESTIONNAIRE = strideQuestionnaire;

export const C = {
  root: { background: "radial-gradient(1200px 560px at 82% -8%, rgba(211,227,255,0.58) 0%, rgba(248,249,250,0) 62%), #f8f9fa", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Inter',sans-serif", color: "#2b3437" },
  hdr: { background: "rgba(255,255,255,0.8)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(171, 179, 183, 0.22)", padding: "12px 20px", position: "sticky", top: 0, zIndex: 20 },
  hdrIn: { maxWidth: 1220, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  main: { flex: 1, maxWidth: 1220, margin: "0 auto", width: "100%", padding: "30px 20px 110px" },
  foot: { position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(18px)", borderTop: "1px solid rgba(171, 179, 183, 0.22)", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 20 },
  card: { background: "#ffffff", border: "1px solid rgba(171, 179, 183, 0.15)", boxShadow: "0 12px 40px rgba(43,52,55,0.06)", borderRadius: 14, padding: 22, marginBottom: 16, transition: "transform .26s cubic-bezier(.22,1,.36,1), box-shadow .26s cubic-bezier(.22,1,.36,1), background-color .24s ease" },
  inp: { width: "100%", background: "#f1f4f6", border: "none", borderBottom: "2px solid rgba(171, 179, 183, 0.6)", borderRadius: "6px 6px 0 0", padding: "10px 12px", color: "#2b3437", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'Inter',sans-serif" },
  btn: { padding: "9px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s", fontFamily: "'Inter',sans-serif" },
  btnP: { background: "linear-gradient(135deg, #436086 0%, #375479 100%)", color: "#f6f7ff", boxShadow: "0 12px 24px rgba(67,96,134,0.18)" },
  btnS: { background: "transparent", border: "1px solid #abb3b7", color: "#586064" },
  btnDanger: { background: "transparent", border: "1px solid #ef4444", color: "#ef4444" },
  g2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  g3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 16px" },
  label: { display: "block", color: "#586064", fontSize: 12, marginBottom: 5, fontFamily: "'Manrope', sans-serif" },
  mono: { fontFamily: "'Manrope', sans-serif" }
};
