import { useState, useRef, useEffect, Fragment } from "react";
import strideQuestionnaire from "./strideQuestionnaire.json";
import ThreatModelerCanvas from "./ThreatModelerCanvas.jsx";
import { extractProjectZipContext } from "./projectZipContext.js";
import { extractStructuralModulesFromZip } from "./projectStructureModules.js";
import { extractModulesFromCodeImports } from "./codeImportModules.js";
import { DEFAULT_GEMINI_API_KEY } from "./geminiEnv.js";
import { COMPONENT_LIBRARY, getComponent, listComponentOptions, injectFromLibrary, reseedLibraryThreats } from "./componentEngine.js";
import { classifyModulesByRules, classifyModulesWithAi, unresolvedModules } from "./componentClassifier.js";
import StencilDesigner from "./stencilDesigner.jsx";

const STRIDE = [
  { id: "S", name: "Spoofing", color: "#f59e0b", desc: "Impersonating an entity" },
  { id: "T", name: "Tampering", color: "#ef4444", desc: "Modifying data or code" },
  { id: "R", name: "Repudiation", color: "#8b5cf6", desc: "Denying an action" },
  { id: "I", name: "Info Disclosure", color: "#06b6d4", desc: "Exposing private data" },
  { id: "D", name: "Denial of Service", color: "#f97316", desc: "Degrading availability" },
  { id: "E", name: "Elevation of Privilege", color: "#ec4899", desc: "Gaining extra permissions" }
];

const DREAD = [
  { id: "damage", label: "Damage Potential", desc: "How severe is the impact?" },
  { id: "reproducibility", label: "Reproducibility", desc: "How easy to reproduce?" },
  { id: "exploitability", label: "Exploitability", desc: "How easy to exploit?" },
  { id: "affectedUsers", label: "Affected Users", desc: "How many are impacted?" },
  { id: "discoverability", label: "Discoverability", desc: "How easy to discover?" }
];

const QUESTIONNAIRE = strideQuestionnaire;

const C = {
  root: { background: "#050810", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans',sans-serif", color: "#e2e8f0" },
  hdr: { background: "#08101e", borderBottom: "1px solid #1a2540", padding: "12px 20px" },
  hdrIn: { maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  main: { flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "20px 16px 100px" },
  foot: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#08101e", borderTop: "1px solid #1a2540", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 },
  card: { background: "#0d1421", border: "1px solid #1a2540", borderRadius: 10, padding: 16, marginBottom: 14 },
  inp: { width: "100%", background: "#080e1a", border: "1px solid #1a2540", borderRadius: 6, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans',sans-serif" },
  btn: { padding: "9px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s", fontFamily: "'DM Sans',sans-serif" },
  btnP: { background: "#00b4d8", color: "#000" },
  btnS: { background: "transparent", border: "1px solid #2a3a55", color: "#94a3b8" },
  btnDanger: { background: "transparent", border: "1px solid #ef4444", color: "#ef4444" },
  g2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  g3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 16px" },
  label: { display: "block", color: "#64748b", fontSize: 12, marginBottom: 5, fontFamily: "monospace" },
  mono: { fontFamily: "monospace" }
};

const Inp = (props) => <input {...props} style={{ ...C.inp, ...props.style }} />;
const Sel = ({ children, ...props }) => <select {...props} style={{ ...C.inp, ...props.style }}>{children}</select>;
const Txt = (props) => <textarea {...props} style={{ ...C.inp, resize: "vertical", ...props.style }} />;
const Fld = ({ label, children, span }) => <div style={{ marginBottom: 12, gridColumn: span ? "1/-1" : undefined }}><label style={C.label}>{label}</label>{children}</div>;
const Err = ({ msg }) => msg ? <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 6, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>Error: {msg}</div> : null;
const Pill = ({ label, value, color }) => <div style={{ background: `${color}15`, border: `1px solid ${color}40`, borderRadius: 6, padding: "6px 16px", textAlign: "center", minWidth: 88 }}><div style={{ color, fontSize: 20, fontFamily: "monospace", fontWeight: 700 }}>{value}</div><div style={{ color: "#64748b", fontSize: 11 }}>{label}</div></div>;
const Tag = ({ label, color, bg }) => <span style={{ background: bg || `${color}20`, color, padding: "2px 8px", borderRadius: 3, fontSize: 11, fontFamily: "monospace" }}>{label}</span>;
const AiBtn = ({ onClick, loading, label, style }) => (
  <button onClick={onClick} disabled={loading} style={{ ...C.btn, ...C.btnP, flex: 1, display: "flex", gap: 8, alignItems: "center", justifyContent: "center", opacity: loading ? 0.5 : 1, ...style }}>
    {loading ? "Processing with Gemini..." : label}
  </button>
);

function GeminiSettingsPopover({ apiKey, setApiKey, open, onOpenChange }) {
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

  const panel = {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    width: 320,
    maxWidth: "calc(100vw - 32px)",
    background: "#0d1421",
    border: "1px solid #1a2540",
    borderRadius: 10,
    padding: 16,
    zIndex: 300,
    boxShadow: "0 12px 40px rgba(0,0,0,.45)"
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title="Settings — Gemini API key"
        aria-label="Open settings"
        aria-expanded={open}
        style={{
          ...C.btn,
          ...C.btnS,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1,
          borderColor: open ? "#00b4d8" : "#2a3a55",
          background: open ? "rgba(0,180,216,.08)" : "transparent"
        }}
      >
        Settings
      </button>
      {open && (
        <div style={panel}>
          <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>GEMINI API KEY</div>
          <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Optional — used for AI-assisted module generation, DFD analysis, STRIDE suggestions, and remediation. Configure here or via <code style={{ color: "#94a3b8" }}>VITE_GEMINI_API_KEY</code> in <code style={{ color: "#94a3b8" }}>.env</code>.
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Inp type={reveal ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
            <button type="button" style={{ ...C.btn, ...C.btnS, padding: "9px 12px", flexShrink: 0 }} onClick={() => setReveal((v) => !v)} aria-label={reveal ? "Hide API key" : "Show API key"}>
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
          <p style={{ color: "#334155", fontSize: 12, margin: "0 0 12px" }}>
            Get a key at{" "}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#00b4d8" }}>
              aistudio.google.com
            </a>
            .
          </p>
          <button type="button" onClick={() => onOpenChange(false)} style={{ ...C.btn, ...C.btnP, width: "100%" }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

const SHdr = ({ n, title, sub }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ color: "#334155", fontSize: 11, fontFamily: "monospace", marginBottom: 2 }}>STEP {n} OF 6</div>
    <h2 style={{ margin: 0, color: "#e2e8f0", fontSize: 22, fontWeight: 700 }}>{title}</h2>
    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>{sub}</p>
  </div>
);

function parseCsv(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function defaultDreadScores() {
  return {
    damage: 5,
    reproducibility: 5,
    exploitability: 5,
    affectedUsers: 5,
    discoverability: 5
  };
}

function averageScore(scores = defaultDreadScores()) {
  const values = Object.values(scores || {});
  return values.reduce((total, value) => total + Number(value || 0), 0) / (values.length || 1);
}

function risk(score) {
  if (score > 8) return { label: "Critical", color: "#ff2d55", bg: "rgba(255,45,85,0.15)" };
  if (score >= 6) return { label: "High", color: "#ff9f0a", bg: "rgba(255,159,10,0.15)" };
  if (score >= 4) return { label: "Medium", color: "#ffd60a", bg: "rgba(255,214,10,0.12)" };
  return { label: "Low", color: "#30d158", bg: "rgba(48,209,88,0.12)" };
}

function strideMeta(strideCategory) {
  return STRIDE.find((item) => item.id === strideCategory) || STRIDE[0];
}

function slugify(value = "threat-modeler") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "threat-modeler";
}

function createModule(id) {
  return {
    id,
    parentId: "",
    name: "",
    inputs: "",
    outputs: "",
    dataStores: "",
    externalEntities: "",
    componentType: "",
    componentTypeSource: "",
    securityRequirements: []
  };
}

/** Map Gemini JSON rows to module objects (parentName resolved to parentId when possible). */
function modulesFromAiJson(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .map((row) => ({
      name: String(row?.name ?? "").trim(),
      parentName: String(row?.parentName ?? "").trim(),
      inputs: String(row?.inputs ?? "").trim(),
      outputs: String(row?.outputs ?? "").trim(),
      dataStores: String(row?.dataStores ?? "").trim(),
      externalEntities: String(row?.externalEntities ?? "").trim()
    }))
    .filter((row) => row.name);

  if (!cleaned.length) return [];

  const base = Date.now();
  const ids = cleaned.map((_, i) => `m-${base}-${i}`);
  const nameToId = {};
  cleaned.forEach((row, i) => {
    nameToId[row.name] = ids[i];
  });

  return cleaned.map((row, i) => normalizeModule({
    id: ids[i],
    parentId: row.parentName && nameToId[row.parentName] ? nameToId[row.parentName] : "",
    name: row.name,
    inputs: row.inputs,
    outputs: row.outputs,
    dataStores: row.dataStores,
    externalEntities: row.externalEntities
  }));
}

/** Make sure modules from any source carry the new typed-component fields. */
function normalizeModule(module) {
  return {
    id: module.id,
    parentId: module.parentId || "",
    name: module.name || "",
    inputs: module.inputs || "",
    outputs: module.outputs || "",
    dataStores: module.dataStores || "",
    externalEntities: module.externalEntities || "",
    componentType: module.componentType || "",
    componentTypeSource: module.componentTypeSource || "",
    securityRequirements: Array.isArray(module.securityRequirements) ? module.securityRequirements : []
  };
}

function normalizeModules(list) {
  return (Array.isArray(list) ? list : []).map(normalizeModule);
}

function createTrustBoundary(id) {
  return { id, name: "Trust Boundary", description: "", color: "#ff9f0a", moduleIds: [] };
}

function moduleHierarchyName(module, modules) {
  const names = [];
  let current = module;
  const seen = new Set();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name || "Untitled");
    current = modules.find((candidate) => candidate.id === current.parentId);
  }

  return names.join(" / ");
}

function parseJSON(text) {
  return JSON.parse((text || "").replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
}

/** Text bundle for Gemini: author notes + optional ZIP-derived tree/snippets (truncated). */
function profileContextForLlm(profile, maxChars = 120_000) {
  const parts = [];
  if (profile.modelContextNotes?.trim()) {
    parts.push(`What the author wants the model to focus on:\n${profile.modelContextNotes.trim()}`);
  }
  if (profile.zipDerivedContext?.trim()) {
    let z = profile.zipDerivedContext.trim();
    if (z.length > maxChars) {
      z = `${z.slice(0, maxChars)}\n[... truncated at ${maxChars} characters ...]`;
    }
    parts.push(`Project ZIP (parsed in the browser — file index + manifests / README):\n${z}`);
  }
  return parts.join("\n\n---\n\n");
}

function questionStateKey(elementId, questionId) {
  return `${elementId}::${questionId}`;
}

function createThreatIdFactory(existingThreats) {
  let max = 0;
  existingThreats.forEach((threat) => {
    const match = String(threat.id || "").match(/\d+/);
    if (match) max = Math.max(max, Number(match[0]));
  });

  return () => {
    max += 1;
    return `T${String(max).padStart(3, "0")}`;
  };
}

function criticalityKey(criticality = "") {
  const normalized = criticality.toLowerCase();
  if (normalized.startsWith("high")) return "high";
  if (normalized.startsWith("medium")) return "medium";
  return "low";
}

function threatProneness(applicableThreats) {
  if (!applicableThreats.length) return { key: "low", label: "Low", color: "#30d158", score: 0 };

  const scores = applicableThreats.map((threat) => averageScore(threat.dreadScores));
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const max = Math.max(...scores);
  const composite = Math.max(avg, max - 1);

  if (composite >= 6) return { key: "high", label: "High", color: "#ff2d55", score: composite };
  if (composite >= 4) return { key: "medium", label: "Medium", color: "#ff9f0a", score: composite };
  return { key: "low", label: "Low", color: "#30d158", score: composite };
}

function recommendedTestingFrequency(criticality, proneness, criticalCount) {
  if (criticalCount > 0 || (criticality === "high" && proneness === "high")) return "Monthly";
  if (criticality === "low" && proneness === "low") return "Annually";
  return "Quarterly";
}

function downloadBlob(filename, blob) {
  if (typeof window === "undefined") return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([content], { type }));
}

function downloadSvg(svgId, filename) {
  if (typeof window === "undefined") return;
  const node = document.getElementById(svgId);
  if (!node) return;

  const clone = node.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadTextFile(filename, `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`, "image/svg+xml;charset=utf-8");
}

function boundaryMembershipMap(trustBoundaries = []) {
  const membership = {};

  trustBoundaries.forEach((boundary) => {
    (boundary.moduleIds || []).forEach((moduleId) => {
      membership[moduleId] = [...(membership[moduleId] || []), boundary];
    });
  });

  return membership;
}

function buildDfdElements(modules, trustBoundaries = []) {
  const validModules = modules.filter((module) => module.name.trim());
  const entities = unique(validModules.flatMap((module) => parseCsv(module.externalEntities))).map((name, index) => ({ id: `entity-${index}`, name }));
  const stores = unique(validModules.flatMap((module) => parseCsv(module.dataStores))).map((name, index) => ({ id: `store-${index}`, name }));
  const membership = boundaryMembershipMap(trustBoundaries);
  const flows = [];

  validModules.forEach((module, moduleIndex) => {
    const inputs = parseCsv(module.inputs);
    const outputs = parseCsv(module.outputs);
    const moduleBoundaries = membership[module.id] || [];
    const boundaryNames = moduleBoundaries.map((boundary) => boundary.name).filter(Boolean);

    parseCsv(module.externalEntities).forEach((entity, entityIndex) => {
      flows.push({
        id: `flow-ext-${module.id}-${moduleIndex}-${entityIndex}`,
        kind: "dataFlow",
        label: inputs[entityIndex] || inputs[0] || "request",
        from: entity,
        to: module.name,
        moduleId: module.id,
        moduleName: module.name,
        crossesBoundary: boundaryNames.length > 0,
        boundaryNames
      });
    });

    parseCsv(module.dataStores).forEach((store, storeIndex) => {
      flows.push({
        id: `flow-store-${module.id}-${moduleIndex}-${storeIndex}`,
        kind: "dataFlow",
        label: outputs[storeIndex] || outputs[0] || "r/w",
        from: module.name,
        to: store,
        moduleId: module.id,
        moduleName: module.name,
        crossesBoundary: boundaryNames.length > 0,
        boundaryNames
      });
    });
  });

  return { validModules, entities, stores, flows, membership };
}

function buildQuestionnaireElements(modules, trustBoundaries) {
  const { validModules, entities, stores, flows, membership } = buildDfdElements(modules, trustBoundaries);

  const processElements = validModules.map((module) => ({
    id: `process-${module.id}`,
    kind: "process",
    label: module.name,
    moduleId: module.id,
    moduleName: module.name,
    boundaryNames: (membership[module.id] || []).map((boundary) => boundary.name).filter(Boolean)
  }));

  const entityElements = entities.map((entity) => ({
    id: entity.id,
    kind: "externalEntity",
    label: entity.name,
    moduleId: "",
    moduleName: entity.name,
    boundaryNames: []
  }));

  const storeElements = stores.map((store) => ({
    id: store.id,
    kind: "dataStore",
    label: store.name,
    moduleId: "",
    moduleName: store.name,
    boundaryNames: []
  }));

  const flowElements = flows.map((flow) => ({
    id: flow.id,
    kind: "dataFlow",
    label: `${flow.from} -> ${flow.to}`,
    moduleId: flow.moduleId,
    moduleName: flow.moduleName,
    boundaryNames: flow.boundaryNames,
    crossesBoundary: flow.crossesBoundary
  }));

  return [...processElements, ...entityElements, ...storeElements, ...flowElements];
}

function buildReportPayload({ profile, modules, trustBoundaries, threats, mitigations, dfd }) {
  const applicableThreats = threats.filter((threat) => threat.status === "applicable");
  const proneness = threatProneness(applicableThreats);

  const bySource = modules
    .filter((module) => module.name.trim())
    .map((module) => {
      const moduleThreats = threats.filter((t) => t.moduleId === module.id);
      const requirements = (module.securityRequirements || []).map((r) => ({
        title: r.title,
        controlFamily: r.controlFamily || "",
        status: r.status,
        jiraKey: r.jiraKey || ""
      }));
      const counts = requirements.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      return {
        moduleId: module.id,
        moduleName: module.name,
        componentType: module.componentType || "",
        threatCount: moduleThreats.length,
        applicableThreats: moduleThreats.filter((t) => t.status === "applicable").length,
        requirements,
        requirementStatusCounts: counts
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    profile,
    modules,
    trustBoundaries,
    dfd,
    threats,
    mitigations,
    bySource,
    prioritization: {
      businessCriticality: profile.criticality,
      threatProneness: proneness.label,
      recommendedTestingFrequency: recommendedTestingFrequency(criticalityKey(profile.criticality), proneness.key, applicableThreats.filter((threat) => averageScore(threat.dreadScores) > 8).length)
    }
  };
}

async function gemini(apiKey, prompt) {
  if (!apiKey.trim()) throw new Error("Add a Gemini API key to use AI-assisted analysis.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text;
}

function DFDNode({ node }) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const label = node.label.length > 22 ? `${node.label.slice(0, 19)}...` : node.label;

  if (node.type === "entity") {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={4} fill="#0b1628" stroke="#00b4d8" strokeWidth={1.5} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily="monospace">EXT ENTITY</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontFamily="monospace">{label}</text>
      </g>
    );
  }

  if (node.type === "process") {
    return (
      <g>
        <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={node.context ? 16 : 22} fill="#0b1628" stroke="#4ade80" strokeWidth={1.5} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily="monospace">{node.context ? "SYSTEM" : "PROCESS"}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontFamily="monospace">{label}</text>
      </g>
    );
  }

  return (
    <g>
      <rect x={node.x} y={node.y + 6} width={node.w} height={node.h - 12} fill="#0b1628" stroke="none" />
      <line x1={node.x} y1={node.y} x2={node.x + node.w} y2={node.y} stroke="#a78bfa" strokeWidth={2} />
      <line x1={node.x} y1={node.y + node.h} x2={node.x + node.w} y2={node.y + node.h} stroke="#a78bfa" strokeWidth={2} />
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#64748b" fontSize={8} fontFamily="monospace">DATA STORE</text>
      <text x={cx} y={cy + 6} textAnchor="middle" fill="#e2e8f0" fontSize={11} fontFamily="monospace">{label}</text>
    </g>
  );
}

function ContextDFDCanvas({ profile, modules, svgId }) {
  const { entities, stores } = buildDfdElements(modules, []);
  const W = 840;
  const H = Math.max(320, Math.max(entities.length, stores.length, 1) * 82 + 70);
  const processNode = { id: "app-context", label: profile.name || "Application", type: "process", x: W / 2 - 100, y: H / 2 - 30, w: 200, h: 60, context: true };
  const entityNodes = entities.map((entity, index) => ({ ...entity, label: entity.name, type: "entity", x: 20, y: 30 + index * 82, w: 140, h: 44 }));
  const storeNodes = stores.map((store, index) => ({ ...store, label: store.name, type: "store", x: W - 160, y: 30 + index * 82, w: 140, h: 44 }));

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#050810", borderRadius: 8, border: "1px solid #1e2d4a" }}>
      <defs>
        <marker id={`${svgId}-arr`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#334155" />
        </marker>
      </defs>
      <rect x={processNode.x - 18} y={processNode.y - 16} width={processNode.w + 36} height={processNode.h + 32} rx={8} fill="none" stroke="#ff9f0a" strokeWidth={1} strokeDasharray="8,4" opacity={0.45} />
      <text x={processNode.x - 14} y={processNode.y - 20} fill="#ff9f0a" fontSize={9} fontFamily="monospace">LEVEL-0 CONTEXT</text>

      {entityNodes.map((node) => {
        const x1 = node.x + node.w;
        const y1 = node.y + node.h / 2;
        const x2 = processNode.x;
        const y2 = processNode.y + processNode.h / 2;
        const mx = (x1 + x2) / 2;

        return (
          <g key={`${node.id}-edge`}>
            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#1e3a5f" strokeWidth={1.5} strokeDasharray="4,3" markerEnd={`url(#${svgId}-arr)`} />
          </g>
        );
      })}

      {storeNodes.map((node) => {
        const x1 = processNode.x + processNode.w;
        const y1 = processNode.y + processNode.h / 2;
        const x2 = node.x;
        const y2 = node.y + node.h / 2;
        const mx = (x1 + x2) / 2;

        return (
          <g key={`${node.id}-edge`}>
            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke="#1e3a5f" strokeWidth={1.5} strokeDasharray="4,3" markerEnd={`url(#${svgId}-arr)`} />
          </g>
        );
      })}

      {[...entityNodes, processNode, ...storeNodes].map((node) => <DFDNode key={node.id} node={node} />)}
    </svg>
  );
}

function Level1DFDCanvas({ modules, trustBoundaries, svgId }) {
  const { validModules, entities, stores, flows } = buildDfdElements(modules, trustBoundaries);
  const W = 900;
  const H = Math.max(420, Math.max(entities.length, stores.length, Math.ceil(validModules.length / 2), 1) * 110 + 90);
  const NW = 140;
  const NH = 44;
  const PW = 170;
  const PH = 48;

  const entityNodes = entities.map((entity, index) => ({ id: entity.id, label: entity.name, type: "entity", x: 16, y: 40 + index * 82, w: NW, h: NH }));
  const storeNodes = stores.map((store, index) => ({ id: store.id, label: store.name, type: "store", x: W - NW - 16, y: 40 + index * 82, w: NW, h: NH }));
  const processNodes = validModules.map((module, index) => ({
    id: module.id,
    label: module.name,
    type: "process",
    x: 205 + (index % 2) * 240,
    y: 30 + Math.floor(index / 2) * 100,
    w: PW,
    h: PH
  }));

  const boundaryRects = trustBoundaries.map((boundary) => {
    const nodes = processNodes.filter((node) => (boundary.moduleIds || []).includes(node.id));
    if (!nodes.length) return null;

    const minX = Math.min(...nodes.map((node) => node.x)) - 24;
    const maxX = Math.max(...nodes.map((node) => node.x + node.w)) + 24;
    const minY = Math.min(...nodes.map((node) => node.y)) - 18;
    const maxY = Math.max(...nodes.map((node) => node.y + node.h)) + 18;

    return {
      ...boundary,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }).filter(Boolean);

  const edges = [];
  validModules.forEach((module) => {
    const process = processNodes.find((node) => node.id === module.id);
    if (!process) return;

    parseCsv(module.externalEntities).forEach((entity, index) => {
      const source = entityNodes.find((node) => node.label === entity);
      if (!source) return;
      const flow = flows.find((item) => item.moduleId === module.id && item.from === entity && item.to === module.name && item.kind === "dataFlow" && item.label === (parseCsv(module.inputs)[index] || parseCsv(module.inputs)[0] || "request"))
        || flows.find((item) => item.moduleId === module.id && item.from === entity && item.to === module.name);
      edges.push({ id: `${source.id}-${process.id}-${index}`, from: source, to: process, label: flow?.label || "data", crossesBoundary: flow?.crossesBoundary, boundaryNames: flow?.boundaryNames || [] });
    });

    parseCsv(module.dataStores).forEach((store, index) => {
      const target = storeNodes.find((node) => node.label === store);
      if (!target) return;
      const flow = flows.find((item) => item.moduleId === module.id && item.from === module.name && item.to === store && item.kind === "dataFlow" && item.label === (parseCsv(module.outputs)[index] || parseCsv(module.outputs)[0] || "r/w"))
        || flows.find((item) => item.moduleId === module.id && item.from === module.name && item.to === store);
      edges.push({ id: `${process.id}-${target.id}-${index}`, from: process, to: target, label: flow?.label || "r/w", crossesBoundary: flow?.crossesBoundary, boundaryNames: flow?.boundaryNames || [] });
    });
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#050810", borderRadius: 8, border: "1px solid #1e2d4a" }}>
      <defs>
        <marker id={`${svgId}-arr`} markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#334155" />
        </marker>
      </defs>

      {boundaryRects.map((boundary) => (
        <g key={boundary.id}>
          <rect x={boundary.x} y={boundary.y} width={boundary.w} height={boundary.h} rx={6} fill="none" stroke={boundary.color || "#ff9f0a"} strokeWidth={1.2} strokeDasharray="8,4" opacity={0.6} />
          <text x={boundary.x + 6} y={boundary.y - 6} fill={boundary.color || "#ff9f0a"} fontSize={9} fontFamily="monospace">{boundary.name || "TRUST BOUNDARY"}</text>
        </g>
      ))}

      {edges.map((edge) => {
        const startOnRight = edge.from.type !== "process";
        const endOnLeft = edge.to.type === "process";
        const x1 = startOnRight ? edge.from.x + edge.from.w : edge.from.x + edge.from.w;
        const y1 = edge.from.y + edge.from.h / 2;
        const x2 = endOnLeft ? edge.to.x : edge.to.x;
        const y2 = edge.to.y + edge.to.h / 2;
        const mx = (x1 + x2) / 2;
        const stroke = edge.crossesBoundary ? "#ff9f0a" : "#1e3a5f";

        return (
          <g key={edge.id}>
            <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={edge.crossesBoundary ? 2 : 1.5} strokeDasharray={edge.crossesBoundary ? "0" : "4,3"} markerEnd={`url(#${svgId}-arr)`} />
            <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" fill={edge.crossesBoundary ? "#fbbf24" : "#334155"} fontSize={9} fontFamily="monospace">{edge.label.slice(0, 16)}</text>
          </g>
        );
      })}

      {[...entityNodes, ...processNodes, ...storeNodes].map((node) => <DFDNode key={node.id} node={node} />)}

      <g transform={`translate(16,${H - 24})`}>
        <rect x={0} y={0} width={10} height={10} rx={1} fill="none" stroke="#00b4d8" strokeWidth={1} />
        <text x={14} y={8} fill="#475569" fontSize={9}>External Entity</text>
        <rect x={112} y={0} width={10} height={10} rx={5} fill="none" stroke="#4ade80" strokeWidth={1} />
        <text x={126} y={8} fill="#475569" fontSize={9}>Process</text>
        <line x1={198} y1={0} x2={211} y2={0} stroke="#a78bfa" strokeWidth={2} />
        <line x1={198} y1={10} x2={211} y2={10} stroke="#a78bfa" strokeWidth={2} />
        <text x={215} y={8} fill="#475569" fontSize={9}>Data Store</text>
        <line x1={300} y1={5} x2={318} y2={5} stroke="#ff9f0a" strokeWidth={2} />
        <text x={324} y={8} fill="#475569" fontSize={9}>Crosses Trust Boundary</text>
      </g>
    </svg>
  );
}

function Step1({ profile, setProfile, zipBufferRef, onOpenDesigner }) {
  const [zipLoading, setZipLoading] = useState(false);
  const [zipErr, setZipErr] = useState(null);
  const [zipMeta, setZipMeta] = useState(null);
  const zipInputRef = useRef(null);
  const update = (key, value) => setProfile((current) => ({ ...current, [key]: value }));
  const isLegacy = profile.appStatus === "legacy" || profile.appStatus === "redesign";
  const isNew = profile.appStatus === "new";

  const clearZip = () => {
    setZipErr(null);
    setZipMeta(null);
    if (zipBufferRef) zipBufferRef.current = null;
    setProfile((current) => ({ ...current, zipDerivedContext: "", zipFileName: "" }));
    if (zipInputRef.current) zipInputRef.current.value = "";
  };

  const onZipSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setZipErr(null);
    setZipLoading(true);
    try {
      const buf = await file.arrayBuffer();
      if (zipBufferRef) zipBufferRef.current = buf;
      const { text, meta } = await extractProjectZipContext(buf);
      setProfile((current) => ({
        ...current,
        zipDerivedContext: text,
        zipFileName: file.name
      }));
      setZipMeta(meta);
    } catch (err) {
      setZipErr(err.message || String(err));
      clearZip();
    } finally {
      setZipLoading(false);
      event.target.value = "";
    }
  };

  const flowTile = (id, label, sub, accent) => {
    const active = profile.appStatus === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => update("appStatus", id)}
        style={{
          flex: 1,
          minWidth: 200,
          textAlign: "left",
          background: active ? `${accent}10` : "#080e1a",
          border: `1px solid ${active ? accent : "#1a2540"}`,
          borderRadius: 8,
          padding: "12px 14px",
          cursor: "pointer",
          color: "#e2e8f0",
          fontFamily: "'DM Sans',sans-serif"
        }}
      >
        <div style={{ color: accent, fontFamily: "monospace", fontSize: 11, letterSpacing: 1 }}>{active ? "ACTIVE" : "OPTION"}</div>
        <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700, marginTop: 4 }}>{label}</div>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
      </button>
    );
  };

  return (
    <>
      <SHdr n={1} title="Application Profile" sub="Pick a flow, fill in metadata, and (depending on the flow) point at a repo or open the stencil designer. Use Settings (top right) for the Gemini API key." />

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>FLOW</div>
        <p style={{ color: "#475569", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          Pick the flow that matches what you have. <strong style={{ color: "#cbd5e1" }}>Legacy</strong> reverse-engineers components from a repo / ZIP. <strong style={{ color: "#cbd5e1" }}>New</strong> opens a drag-and-drop stencil designer where you compose the architecture from typed components.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {flowTile("legacy", "Legacy / Production", "Reverse-engineer modules and components from an uploaded ZIP or pasted repo context.", "#ff9f0a")}
          {flowTile("new", "New / In Development", "Design the architecture from typed components in the stencil designer; threats and security requirements attach automatically.", "#00b4d8")}
          {flowTile("redesign", "Redesign / Major Update", "Hybrid — start from existing repo context but free-edit modules and DFD as you redesign.", "#a78bfa")}
        </div>
      </div>

      {isNew && (
        <div style={{ ...C.card, borderColor: "#00b4d8" }}>
          <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>STENCIL DESIGNER</div>
          <p style={{ color: "#475569", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Drag typed components onto the canvas (Login, Database, Payment Gateway, Queue …) and connect them. Each stencil instantly attaches its STRIDE threats and security requirements from the built-in library. Save returns to the wizard so you can continue with DFD, STRIDE, DREAD, and Report.
          </p>
          <button type="button" onClick={onOpenDesigner} style={{ ...C.btn, ...C.btnP }}>Open stencil designer</button>
        </div>
      )}

      {isLegacy && (
        <div style={C.card}>
          <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>SOURCE REPOSITORY</div>
          <p style={{ color: "#475569", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
            Point at a Git repo and optionally paste a folder tree, README excerpt, or <code style={{ color: "#94a3b8" }}>package.json</code> / stack hints. The app cannot clone private repos in the browser — Gemini uses what you provide here to suggest modules and DFDs in the next steps.
          </p>
          <div style={C.g2}>
            <Fld label="Repository URL"><Inp value={profile.repoUrl} onChange={(event) => update("repoUrl", event.target.value)} placeholder="https://github.com/org/service" /></Fld>
            <Fld label="Default branch (optional)"><Inp value={profile.repoBranch} onChange={(event) => update("repoBranch", event.target.value)} placeholder="main" /></Fld>
            <Fld label="Repository context (paste tree, README, dependencies…)" span><Txt value={profile.repoContext} onChange={(event) => update("repoContext", event.target.value)} placeholder={`e.g.\nsrc/\n  api/\n  auth/\n  workers/\n\nOr paste README "Architecture" section…`} style={{ height: 100 }} /></Fld>
          </div>
        </div>
      )}

      {isLegacy && (
      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 12, marginBottom: 10 }}>PROJECT ZIP + NOTES FOR THE MODEL</div>
        <p style={{ color: "#475569", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
          Upload a <strong style={{ color: "#cbd5e1" }}>.zip</strong> of your project (source only; large folders like <code style={{ color: "#94a3b8" }}>node_modules</code> are skipped). We extract a file tree plus key manifests (package.json, README, Docker, etc.) in the browser — nothing is uploaded to a server. Add notes so Gemini understands architecture, trust zones, and what to prioritize.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onZipSelected}
            disabled={zipLoading}
            style={{ fontSize: 12, color: "#94a3b8", maxWidth: "100%" }}
          />
          {zipLoading && <span style={{ color: "#00b4d8", fontSize: 12, fontFamily: "monospace" }}>Reading ZIP…</span>}
          {profile.zipFileName && (
            <button type="button" onClick={clearZip} style={{ ...C.btn, ...C.btnDanger, padding: "6px 12px", fontSize: 12 }} disabled={zipLoading}>
              Remove ZIP
            </button>
          )}
        </div>
        {profile.zipFileName && zipMeta && (
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10, fontFamily: "monospace" }}>
            {profile.zipFileName} · {zipMeta.pathCount} paths · {Math.round(zipMeta.bytesInZip / 1024)} KB archive · {zipMeta.snippetCount} text extracts
            {zipMeta.truncated ? " · output truncated" : ""}
          </div>
        )}
        <Err msg={zipErr} />
        <Fld label="Describe the project for the AI (architecture, sensitive data, deployment, assumptions)" span>
          <Txt
            value={profile.modelContextNotes}
            onChange={(event) => update("modelContextNotes", event.target.value)}
            placeholder="e.g. Monorepo: React SPA + Node API + worker consuming SQS. Users are B2B; PII in Postgres; JWT auth; no mobile clients yet…"
            style={{ height: 88 }}
          />
        </Fld>
      </div>
      )}

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 12, marginBottom: 14 }}>APPLICATION METADATA</div>
        <div style={C.g2}>
          <Fld label="Application Name *"><Inp value={profile.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. LoanPro Banking Portal" /></Fld>
          <Fld label="Application Type">
            <Sel value={profile.type} onChange={(event) => update("type", event.target.value)}>
              {["Web Application", "Mobile App", "API / Microservice", "Desktop Application", "IoT System", "Embedded System"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Deployment Environment">
            <Sel value={profile.deployEnv} onChange={(event) => update("deployEnv", event.target.value)}>
              {["Cloud (Public)", "Cloud (Private)", "On-Premises", "Hybrid", "Edge / CDN"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Application Status">
            <Sel value={profile.appStatus} onChange={(event) => update("appStatus", event.target.value)}>
              <option value="legacy">Legacy / Production (no prior TM)</option>
              <option value="new">New / In Development</option>
              <option value="redesign">Redesign / Major Update</option>
            </Sel>
          </Fld>
          <Fld label="Technology Stack" span><Inp value={profile.techStack} onChange={(event) => update("techStack", event.target.value)} placeholder="e.g. React, Node.js, PostgreSQL, Redis, AWS ECS" /></Fld>
          <Fld label="Business Criticality">
            <Sel value={profile.criticality} onChange={(event) => update("criticality", event.target.value)}>
              {["High — Mission critical / PII / Financial", "Medium — Internal tooling / moderate impact", "Low — Informational / low sensitivity"].map((item) => <option key={item}>{item}</option>)}
            </Sel>
          </Fld>
          <Fld label="Primary Compliance Scope"><Inp value={profile.compliance} onChange={(event) => update("compliance", event.target.value)} placeholder="e.g. PCI-DSS, RBI Guidelines, ISO 27001, GDPR" /></Fld>
          <Fld label="Functional Description" span><Txt value={profile.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe what the app does, who uses it, and what sensitive data it handles..." style={{ height: 90 }} /></Fld>
        </div>
      </div>
    </>
  );
}

function Step2({ modules, setModules, apiKey, profile, setProfile, zipBufferRef }) {
  const [genLoading, setGenLoading] = useState(false);
  const [genErr, setGenErr] = useState(null);
  const [genMeta, setGenMeta] = useState(null);
  const analyzeZipInputRef = useRef(null);
  const [aiClassifyLoading, setAiClassifyLoading] = useState(false);
  const [aiClassifyErr, setAiClassifyErr] = useState(null);
  const [aiClassifyMeta, setAiClassifyMeta] = useState(null);

  const componentOptions = listComponentOptions();

  const addModule = () => setModules((current) => [...current, createModule(`m-${Date.now()}`)]);
  const removeModule = (id) => setModules((current) => current.filter((module) => module.id !== id));
  const updateModule = (id, key, value) => setModules((current) => current.map((module) => {
    if (module.id !== id) return module;
    if (key === "componentType") {
      const next = injectFromLibrary({ ...module, componentType: value, componentTypeSource: "user" });
      return next;
    }
    return { ...module, [key]: value };
  }));

  const applyRulesClassifier = (incoming) => {
    const classified = classifyModulesByRules(incoming, { text: profile.zipDerivedContext || "" });
    return classified.map((m) => (m.componentType ? injectFromLibrary(m) : m));
  };

  const runAiClassifier = async () => {
    setAiClassifyErr(null);
    setAiClassifyMeta(null);
    if (!apiKey.trim()) {
      setAiClassifyErr("Add a Gemini API key (Settings) to use AI classification.");
      return;
    }
    const targets = unresolvedModules(modules.filter((m) => m.name.trim()));
    if (!targets.length) {
      setAiClassifyMeta("All modules are already classified.");
      return;
    }
    setAiClassifyLoading(true);
    try {
      const map = await classifyModulesWithAi({ gemini, apiKey, modules: targets });
      if (!map.size) {
        setAiClassifyMeta("AI returned no confident matches — review manually.");
        return;
      }
      setModules((current) => current.map((module) => {
        if (!map.has(module.id)) return module;
        return injectFromLibrary({ ...module, componentType: map.get(module.id), componentTypeSource: "classifier-ai" });
      }));
      setAiClassifyMeta(`AI classified ${map.size} of ${targets.length} unresolved modules.`);
    } catch (err) {
      setAiClassifyErr(err.message || String(err));
    } finally {
      setAiClassifyLoading(false);
    }
  };

  const runDeterministicSignals = async (buf) => {
    const [structRes, codeRes] = await Promise.allSettled([
      extractStructuralModulesFromZip(buf),
      extractModulesFromCodeImports(buf)
    ]);
    return {
      structural: structRes.status === "fulfilled" ? structRes.value : { modules: [], meta: null, error: structRes.reason?.message },
      imports: codeRes.status === "fulfilled" ? codeRes.value : { modules: [], meta: null, error: codeRes.reason?.message }
    };
  };

  const buildSignalsBlock = (signals) => {
    const lines = [];
    const struct = signals.structural?.modules || [];
    const imports = signals.imports?.modules || [];

    if (struct.length) {
      lines.push("Structural modules (from manifests / workspaces / folder layout — these names exist in the build system):");
      struct.forEach((m, i) => lines.push(`  ${i + 1}. ${m.name}`));
      if (signals.structural.meta?.detail) {
        lines.push(`  source: ${signals.structural.meta.detail}`);
      }
    } else {
      lines.push("Structural modules: (no workspace/manifest signals detected)");
    }

    lines.push("");

    if (imports.length) {
      lines.push("Import-clustered modules (from JS/TS import graph — these are folders that actually exchange code):");
      imports.forEach((m, i) => {
        const ext = (m.externalEntities || "").trim();
        const out = (m.outputs || "").trim();
        const extPart = ext ? ` · external deps: ${ext.slice(0, 240)}${ext.length > 240 ? "…" : ""}` : "";
        const outPart = out ? ` · ${out.slice(0, 200)}${out.length > 200 ? "…" : ""}` : "";
        lines.push(`  ${i + 1}. ${m.name}${extPart}${outPart}`);
      });
      if (signals.imports.meta?.detail) {
        lines.push(`  source: ${signals.imports.meta.detail}`);
      }
    } else {
      lines.push("Import-clustered modules: (no JS/TS source clusters detected)");
    }

    return lines.join("\n");
  };

  const fallbackModulesFromSignals = (signals) => {
    const struct = signals.structural?.modules || [];
    const imports = signals.imports?.modules || [];
    const byName = new Map();
    const push = (m) => {
      const key = (m.name || "").trim().toLowerCase();
      if (!key) return;
      if (!byName.has(key)) {
        byName.set(key, { ...m });
      } else {
        const cur = byName.get(key);
        cur.inputs = cur.inputs || m.inputs;
        cur.outputs = cur.outputs || m.outputs;
        cur.externalEntities = cur.externalEntities || m.externalEntities;
        cur.dataStores = cur.dataStores || m.dataStores;
      }
    };
    struct.forEach(push);
    imports.forEach(push);
    return [...byName.values()];
  };

  const ensureZipContext = async (buf) => {
    if (profile.zipDerivedContext?.trim()) return;
    try {
      const { text } = await extractProjectZipContext(buf);
      if (text) setProfile?.((current) => ({ ...current, zipDerivedContext: text }));
    } catch {
      /* non-fatal — Gemini still gets the signals + manual context */
    }
  };

  const analyzeProject = async (buf) => {
    setGenErr(null);
    setGenMeta(null);
    setGenLoading(true);
    try {
      const signals = buf ? await runDeterministicSignals(buf) : { structural: { modules: [] }, imports: { modules: [] } };
      if (buf) await ensureZipContext(buf);

      const structCount = signals.structural?.modules?.length || 0;
      const importCount = signals.imports?.modules?.length || 0;

      if (!apiKey.trim()) {
        const fallback = fallbackModulesFromSignals(signals);
        if (!fallback.length) {
          throw new Error("Add a Gemini API key (Settings) — no deterministic signals were detected to fall back to.");
        }
        setModules(applyRulesClassifier(normalizeModules(fallback)));
        setGenMeta(`No API key — used deterministic signals only (${structCount} structural · ${importCount} import-cluster).`);
        return;
      }

      const hint = [profile.repoUrl, profile.repoBranch && `branch: ${profile.repoBranch}`, profile.repoContext].filter(Boolean).join("\n");
      const llmBundle = profileContextForLlm(profile).trim();
      const signalsBlock = buf ? buildSignalsBlock(signals) : "(no project ZIP — running on metadata + pasted context only)";

      if (!buf && !hint.trim() && !profile.description?.trim() && !profile.techStack?.trim() && !llmBundle) {
        throw new Error("Upload a project ZIP, add a repository URL or pasted context, or fill description / stack so there is something to analyze.");
      }

      const prompt = `You are a software architect doing threat-modeling prep. Produce a clean module decomposition for the application below.

GROUND-TRUTH SIGNALS (deterministic — extracted from the actual archive, NOT inferred):
${signalsBlock}

How to use the signals:
- Treat module NAMES from the structural section as the source of truth for what physically exists in the build system. Prefer those names verbatim.
- The import-clustered section shows what each folder actually depends on; use externals to populate "externalEntities" and use the cluster relationships to populate "outputs" (cross-module flows).
- You MAY merge two signal entries that are obviously the same logical bounded context (e.g. "shared/utils" pulled into one consumer), and you MAY split an overly broad signal into smaller logical modules — but justify each invented name by tying it to a path / package shown in the ZIP context below. Do NOT invent modules that have no basis in the signals or the file index.
- If the signals are sparse or empty, fall back to inferring from the metadata + ZIP file index.

Repository URL: ${profile.repoUrl || "not specified"}
Branch: ${profile.repoBranch || "default"}
Pasted context (tree, README, manifests):
${profile.repoContext || "(none)"}

${llmBundle ? `ZIP + author notes for the model:\n${llmBundle}` : "ZIP + author notes: (none)"}

Application name: ${profile.name || "Unnamed"}
Type: ${profile.type}
Stack: ${profile.techStack || "unspecified"}
Description: ${profile.description || "none"}

Return ONLY valid JSON (no markdown): a single array of objects. Each object MUST use these keys:
- "name": string (concise module or service name — prefer names from the signals)
- "parentName": string (exact parent module name from this same array, or "" if top-level)
- "externalEntities": string (comma-separated actors / external systems / npm packages this module talks to)
- "inputs": string (comma-separated logical inputs)
- "outputs": string (comma-separated logical outputs, including cross-module flows)
- "dataStores": string (comma-separated stores this module reads/writes)

Produce 5–14 modules. Names must be unique. Parent names must refer to another module's name in the array.`;

      let next = [];
      let usedFallback = false;
      try {
        const text = await gemini(apiKey, prompt);
        const parsed = parseJSON(text);
        const rows = Array.isArray(parsed) ? parsed : parsed.modules || parsed.items;
        next = modulesFromAiJson(rows);
      } catch (llmErr) {
        const fallback = fallbackModulesFromSignals(signals);
        if (!fallback.length) throw llmErr;
        next = normalizeModules(fallback);
        usedFallback = true;
        setGenErr(`Gemini call failed (${llmErr.message || llmErr}). Falling back to deterministic signals.`);
      }

      if (!next.length) {
        const fallback = fallbackModulesFromSignals(signals);
        if (fallback.length) {
          next = normalizeModules(fallback);
          usedFallback = true;
        } else {
          throw new Error("Model returned no modules and no deterministic signals were available. Add more context or upload a ZIP.");
        }
      }

      setModules(applyRulesClassifier(next));
      const sourceLabel = usedFallback ? "deterministic fallback" : "Gemini · grounded";
      const signalSummary = `${structCount} structural · ${importCount} import-cluster`;
      setGenMeta(`${next.length} modules · ${sourceLabel} (signals: ${signalSummary})`);
    } catch (e) {
      setGenErr(e.message || String(e));
    } finally {
      setGenLoading(false);
    }
  };

  const onAnalyzeClick = () => {
    const buf = zipBufferRef?.current;
    analyzeProject(buf || null);
  };

  const onAnalyzeZipPicked = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    if (zipBufferRef) zipBufferRef.current = buf;
    setProfile?.((current) => ({ ...current, zipFileName: current.zipFileName || file.name }));
    await analyzeProject(buf);
    event.target.value = "";
  };

  return (
    <>
      <SHdr n={2} title="Module Decomposition" sub="One-click pipeline: deterministic signals (manifests, workspaces, import graph) are extracted from your ZIP and fed to Gemini as ground truth, so module names stay tied to what actually exists in the repo. Modules drive auto DFDs and the STRIDE questionnaire." />

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>ANALYZE PROJECT (AI · GROUNDED)</div>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
          Runs the deterministic extractors first (<strong style={{ color: "#cbd5e1" }}>package.json</strong> workspaces, <strong style={{ color: "#cbd5e1" }}>pnpm-workspace.yaml</strong>, <strong style={{ color: "#cbd5e1" }}>lerna.json</strong>, <strong style={{ color: "#cbd5e1" }}>pom.xml</strong>, <strong style={{ color: "#cbd5e1" }}>go.work</strong>, folder layout, plus JS/TS import graph) and then sends those names to Gemini as <strong style={{ color: "#cbd5e1" }}>ground-truth signals</strong> alongside the repo metadata. Gemini refines them into logical modules — merging, splitting, attaching inputs / outputs / data stores — without inventing names that don't exist. If the LLM call fails or returns nothing, the deterministic results are used as a safe fallback. Re-upload the ZIP below if you skipped Step 1.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <AiBtn onClick={onAnalyzeClick} loading={genLoading} label="Analyze project & generate modules" />
          <input
            ref={analyzeZipInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onAnalyzeZipPicked}
            disabled={genLoading}
            style={{ fontSize: 12, color: "#94a3b8", maxWidth: "100%" }}
          />
        </div>
        {genMeta && (
          <div style={{ color: "#30d158", fontSize: 12, marginBottom: 8, fontFamily: "monospace" }}>{genMeta}</div>
        )}
        <Err msg={genErr} />
      </div>

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>COMPONENT TYPE CLASSIFICATION</div>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
          Each module is mapped to a typed component from the built-in library ({COMPONENT_LIBRARY.components.length} types) so we can attach pre-canned STRIDE threats and security requirements automatically. Rules ran when modules were generated. Use the AI fallback for anything still <strong style={{ color: "#cbd5e1" }}>Unclassified</strong>, or pick the type manually below.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={runAiClassifier}
            disabled={aiClassifyLoading}
            style={{ ...C.btn, ...C.btnP, display: "flex", gap: 8, alignItems: "center", opacity: aiClassifyLoading ? 0.5 : 1 }}
          >
            {aiClassifyLoading ? "Asking Gemini…" : "Classify unresolved with Gemini"}
          </button>
          <span style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace" }}>
            {modules.filter((m) => m.name.trim() && !m.componentType).length} unclassified · {modules.filter((m) => m.componentType).length} typed
          </span>
        </div>
        {aiClassifyMeta && <div style={{ color: "#30d158", fontSize: 12, marginTop: 8, fontFamily: "monospace" }}>{aiClassifyMeta}</div>}
        <Err msg={aiClassifyErr} />
      </div>

      {modules.map((module, index) => {
        const parentOptions = modules.filter((candidate) => candidate.id !== module.id && candidate.name.trim());
        const children = modules.filter((candidate) => candidate.parentId === module.id && candidate.name.trim());
        const component = getComponent(module.componentType);
        const sourceLabel = ({
          "user": "manual",
          "classifier-rule": "rule",
          "classifier-ai": "AI",
          "stencil": "stencil"
        })[module.componentTypeSource] || "";
        const accentColor = component?.color || "#1e3a5f";

        return (
          <div key={module.id} style={{ ...C.card, borderLeft: `3px solid ${accentColor}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 12 }}>MODULE {String(index + 1).padStart(2, "0")}</div>
                {(module.name || module.parentId) && <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>{module.name ? moduleHierarchyName(module, modules) : "Top-level module"}</div>}
                {!!children.length && <div style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>Children: {children.map((child) => child.name).join(", ")}</div>}
                {component && (
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Tag label={`${component.category} · ${component.label}`} color={component.color} />
                    {sourceLabel && <span style={{ color: "#334155", fontSize: 10, fontFamily: "monospace" }}>via {sourceLabel}</span>}
                    <span style={{ color: "#334155", fontSize: 10, fontFamily: "monospace" }}>· {component.threats?.length || 0} threats · {component.securityRequirements?.length || 0} requirements</span>
                  </div>
                )}
              </div>
              {modules.length > 1 && <button onClick={() => removeModule(module.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 20, lineHeight: 1 }} type="button" aria-label="Remove module">x</button>}
            </div>

            <div style={C.g2}>
              <Fld label="Module Name *"><Inp value={module.name} onChange={(event) => updateModule(module.id, "name", event.target.value)} placeholder="e.g. User Authentication" /></Fld>
              <Fld label="Component Type">
                <Sel value={module.componentType || ""} onChange={(event) => updateModule(module.id, "componentType", event.target.value)}>
                  <option value="">Unclassified</option>
                  {componentOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.category} · {opt.label}</option>)}
                </Sel>
              </Fld>
              <Fld label="Sub-module Of">
                <Sel value={module.parentId} onChange={(event) => updateModule(module.id, "parentId", event.target.value)}>
                  <option value="">Top-level module</option>
                  {parentOptions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                </Sel>
              </Fld>
              <Fld label="External Entities (comma-separated)"><Inp value={module.externalEntities} onChange={(event) => updateModule(module.id, "externalEntities", event.target.value)} placeholder="e.g. End User, Admin, Payment Gateway" /></Fld>
              <Fld label="Inputs"><Inp value={module.inputs} onChange={(event) => updateModule(module.id, "inputs", event.target.value)} placeholder="e.g. Username, Password, OTP" /></Fld>
              <Fld label="Outputs"><Inp value={module.outputs} onChange={(event) => updateModule(module.id, "outputs", event.target.value)} placeholder="e.g. JWT Token, Session Cookie" /></Fld>
              <Fld label="Data Stores Accessed (comma-separated)" span><Inp value={module.dataStores} onChange={(event) => updateModule(module.id, "dataStores", event.target.value)} placeholder="e.g. Users DB, Session Cache, Audit Log" /></Fld>
            </div>
          </div>
        );
      })}

      <button onClick={addModule} style={{ ...C.btn, ...C.btnS, width: "100%", marginTop: 4 }}>+ Add Module</button>
    </>
  );
}

function Step3({ profile, modules, apiKey, dfd, setDfd, trustBoundaries, setTrustBoundaries, dfdMode, setDfdMode, onOpenCanvas }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const { validModules, flows } = buildDfdElements(modules, trustBoundaries);
  const crossBoundaryFlows = flows.filter((flow) => flow.crossesBoundary);

  const addBoundary = () => setTrustBoundaries((current) => [...current, createTrustBoundary(`tb-${Date.now()}`)]);
  const removeBoundary = (id) => setTrustBoundaries((current) => current.filter((boundary) => boundary.id !== id));
  const updateBoundary = (id, key, value) => setTrustBoundaries((current) => current.map((boundary) => boundary.id === id ? { ...boundary, [key]: value } : boundary));
  const toggleModule = (boundaryId, moduleId) => setTrustBoundaries((current) => current.map((boundary) => {
    if (boundary.id !== boundaryId) return boundary;
    const exists = (boundary.moduleIds || []).includes(moduleId);
    return { ...boundary, moduleIds: exists ? boundary.moduleIds.filter((id) => id !== moduleId) : [...boundary.moduleIds, moduleId] };
  }));

  const analyze = async () => {
    setLoading(true);
    setErr(null);

    try {
      const moduleSummary = validModules.map((module) => `Module: ${moduleHierarchyName(module, modules)}\n  Inputs: ${module.inputs}\n  Outputs: ${module.outputs}\n  Data Stores: ${module.dataStores}\n  External Entities: ${module.externalEntities}`).join("\n\n");
      const boundarySummary = trustBoundaries.filter((boundary) => boundary.name.trim()).map((boundary) => {
        const names = validModules.filter((module) => boundary.moduleIds.includes(module.id)).map((module) => module.name);
        return `Boundary: ${boundary.name}\n  Includes: ${names.join(", ") || "none"}\n  Notes: ${boundary.description || "none"}`;
      }).join("\n\n");
      const crossBoundarySummary = crossBoundaryFlows.map((flow) => `${flow.from} -> ${flow.to} (${flow.boundaryNames.join(", ") || "manual"})`).join("\n");
      const zipAndNotes = profileContextForLlm(profile, 80_000);

      const text = await gemini(apiKey, `You are a security architect. Analyze this application and return ONLY valid JSON (no markdown).

Application: ${profile.name || "Unnamed Application"} (${profile.type})
Repository: ${profile.repoUrl || "not specified"}
Stack: ${profile.techStack}
Description: ${profile.description}

${zipAndNotes ? `Additional context for analysis:\n${zipAndNotes}` : ""}

Modules:
${moduleSummary}

Manual Trust Boundaries:
${boundarySummary || "None defined"}

Flows crossing manual trust boundaries:
${crossBoundarySummary || "None"}

Return:
{
  "trustBoundaries": [{"name":"string","includes":["module names"],"description":"why this boundary matters"}],
  "highRiskFlows": [{"from":"string","to":"string","risk":"string","strideCategories":["S","T"]}],
  "securityNotes": ["note1","note2","note3"],
  "summary": "2-3 sentence security posture summary"
}`);

      setDfd(parseJSON(text));
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const modeBtn = (active, onClick, label, sub) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...C.btn,
        flex: "1 1 220px",
        textAlign: "left",
        padding: "12px 14px",
        background: active ? "rgba(0,180,216,.12)" : "transparent",
        border: `1px solid ${active ? "#00b4d8" : "#2a3a55"}`,
        color: active ? "#e2e8f0" : "#94a3b8"
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: sub ? 4 : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400, lineHeight: 1.4 }}>{sub}</div>}
    </button>
  );

  return (
    <>
      <SHdr n={3} title="Data Flow Diagram" sub="Pick auto-generated diagrams from your modules, or draw flows on the interactive canvas. Add trust boundaries, then run Gemini analysis before STRIDE." />

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>HOW SHOULD WE MODEL DATA FLOWS?</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: dfdMode === "canvas" ? 12 : 0 }}>
          {modeBtn(dfdMode === "auto", () => setDfdMode("auto"), "Auto diagrams", "Level-0 / Level-1 SVGs from modules (step 2). Best after generating modules from your repo.")}
          {modeBtn(dfdMode === "canvas", () => setDfdMode("canvas"), "Interactive canvas", "Place processes, stores, boundaries yourself. STRIDE + DREAD still use your module list for the questionnaire.")}
        </div>
        {dfdMode === "canvas" && (
          <div style={{ padding: 14, background: "rgba(0,180,216,.06)", border: "1px solid rgba(0,180,216,.25)", borderRadius: 8 }}>
            <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              Open the canvas to sketch entities, processes, data stores, and trust boundaries. Use <strong style={{ color: "#e2e8f0" }}>Analyze</strong> there for component-level STRIDE threats. The guided STRIDE step below still maps questionnaire items to the modules you defined in step 2 — keep those aligned with what you draw.
            </p>
            <button type="button" onClick={onOpenCanvas} style={{ ...C.btn, ...C.btnP }}>Open interactive canvas</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {dfdMode === "auto" && (
          <>
            <button type="button" onClick={() => downloadSvg("tm-context-dfd", `${slugify(profile.name || "application")}-context-dfd.svg`)} style={{ ...C.btn, ...C.btnS }}>Download Level-0 SVG</button>
            <button type="button" onClick={() => downloadSvg("tm-level1-dfd", `${slugify(profile.name || "application")}-level1-dfd.svg`)} style={{ ...C.btn, ...C.btnS }}>Download Level-1 SVG</button>
          </>
        )}
        <AiBtn onClick={analyze} loading={loading} label="Analyze trust boundaries (Gemini)" />
      </div>
      <Err msg={err} />

      {dfdMode === "auto" && (
        <>
          <div style={{ ...C.card, paddingBottom: 10 }}>
            <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>LEVEL-0 CONTEXT DFD</div>
            <ContextDFDCanvas profile={profile} modules={modules} svgId="tm-context-dfd" />
          </div>

          <div style={{ ...C.card, paddingBottom: 10 }}>
            <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>LEVEL-1 MODULE DFD</div>
            <Level1DFDCanvas modules={modules} trustBoundaries={trustBoundaries} svgId="tm-level1-dfd" />
          </div>
        </>
      )}

      <div style={C.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11 }}>MANUAL TRUST BOUNDARY ANNOTATIONS</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>Assign modules to one or more trust zones so cross-boundary flows are flagged before STRIDE review.</div>
          </div>
          <button onClick={addBoundary} style={{ ...C.btn, ...C.btnS }}>+ Add Boundary</button>
        </div>

        {!trustBoundaries.length && <div style={{ color: "#334155", fontSize: 13, padding: "8px 0" }}>No manual trust boundaries yet. Add one if the DFD crosses internal/external or sensitive trust zones.</div>}

        {trustBoundaries.map((boundary) => (
          <div key={boundary.id} style={{ border: "1px solid #1a2540", borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={C.g2}>
              <Fld label="Boundary Name"><Inp value={boundary.name} onChange={(event) => updateBoundary(boundary.id, "name", event.target.value)} placeholder="e.g. Public Internet Zone" /></Fld>
              <Fld label="Color"><Inp type="color" value={boundary.color || "#ff9f0a"} onChange={(event) => updateBoundary(boundary.id, "color", event.target.value)} style={{ padding: 4, height: 42 }} /></Fld>
              <Fld label="Notes" span><Txt value={boundary.description} onChange={(event) => updateBoundary(boundary.id, "description", event.target.value)} placeholder="Why this boundary exists or what makes it sensitive..." style={{ height: 74 }} /></Fld>
              <Fld label="Included Modules" span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {validModules.map((module) => {
                    const active = boundary.moduleIds.includes(module.id);
                    return (
                      <label key={`${boundary.id}-${module.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${active ? boundary.color || "#ff9f0a" : "#1a2540"}`, background: active ? `${boundary.color || "#ff9f0a"}18` : "transparent", cursor: "pointer", fontSize: 12 }}>
                        <input type="checkbox" checked={active} onChange={() => toggleModule(boundary.id, module.id)} />
                        <span>{module.name}</span>
                      </label>
                    );
                  })}
                </div>
              </Fld>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => removeBoundary(boundary.id)} style={{ ...C.btn, ...C.btnDanger }}>Remove Boundary</button>
            </div>
          </div>
        ))}
      </div>

      <div style={C.card}>
        <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>HIGH-PRIORITY CROSS-BOUNDARY FLOWS ({crossBoundaryFlows.length})</div>
        {crossBoundaryFlows.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>No flows are currently marked as crossing a manual trust boundary.</div>}
        {crossBoundaryFlows.map((flow) => (
          <div key={flow.id} style={{ padding: "10px 12px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, marginBottom: 8 }}>
            <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>{flow.from}{" -> "}{flow.to}</div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Boundary: {flow.boundaryNames.join(", ") || "Manual"}</div>
          </div>
        ))}
      </div>

      {dfd && (
        <>
          <div style={{ ...C.card, borderColor: "#00b4d8" }}>
            <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>GEMINI SECURITY ANALYSIS</div>
            <p style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{dfd.summary}</p>
          </div>

          {dfd.trustBoundaries?.length > 0 && <div style={C.card}>
            <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>AI-SUGGESTED TRUST BOUNDARIES ({dfd.trustBoundaries.length})</div>
            {dfd.trustBoundaries.map((boundary, index) => (
              <div key={index} style={{ padding: "10px 12px", background: "rgba(255,159,10,.06)", border: "1px solid rgba(255,159,10,.2)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ color: "#ff9f0a", fontSize: 13, fontWeight: 600 }}>{boundary.name}</div>
                <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{boundary.description}</div>
                {boundary.includes && <div style={{ color: "#475569", fontSize: 11, marginTop: 4 }}>Includes: {boundary.includes.join(", ")}</div>}
              </div>
            ))}
          </div>}

          {dfd.highRiskFlows?.length > 0 && <div style={C.card}>
            <div style={{ color: "#ef4444", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>AI HIGH-RISK FLOWS ({dfd.highRiskFlows.length})</div>
            {dfd.highRiskFlows.map((flow, index) => (
              <div key={index} style={{ padding: "10px 12px", background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, marginBottom: 8 }}>
                <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "monospace", marginBottom: 4 }}>{flow.from}{" -> "}{flow.to}</div>
                <div style={{ color: "#94a3b8", fontSize: 12 }}>{flow.risk}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {flow.strideCategories?.map((category) => <Tag key={category} label={category} color="#ef4444" />)}
                </div>
              </div>
            ))}
          </div>}

          {dfd.securityNotes?.length > 0 && <div style={C.card}>
            <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>SECURITY NOTES</div>
            {dfd.securityNotes.map((note, index) => (
              <div key={index} style={{ color: "#94a3b8", fontSize: 13, padding: "5px 0", borderBottom: index < dfd.securityNotes.length - 1 ? "1px solid #141e30" : "none" }}>- {note}</div>
            ))}
          </div>}
        </>
      )}
    </>
  );
}

function Step4({ threats, setThreats, modules, apiKey, profile, trustBoundaries, questionnaireAnswers, setQuestionnaireAnswers }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [librarySeedMeta, setLibrarySeedMeta] = useState(null);
  const questionnaireElements = buildQuestionnaireElements(modules, trustBoundaries);
  const selectedElement = questionnaireElements.find((element) => element.id === selectedElementId) || questionnaireElements[0] || null;
  const questions = selectedElement ? (QUESTIONNAIRE[selectedElement.kind] || []) : [];

  const typedModules = modules.filter((m) => m.componentType && m.name.trim());
  const hasLibraryThreats = threats.some((t) => t.source === "library");
  const expectedLibraryThreats = typedModules.reduce((total, m) => {
    const c = getComponent(m.componentType);
    return total + (c?.threats?.length || 0);
  }, 0);

  useEffect(() => {
    if (hasLibraryThreats) return;
    if (!typedModules.length) return;
    setThreats((current) => {
      if (current.some((t) => t.source === "library")) return current;
      const idFactory = createThreatIdFactory(current);
      return reseedLibraryThreats({
        existingThreats: current,
        modules: typedModules,
        idFactory,
        strideMeta,
        dreadDefaults: defaultDreadScores()
      });
    });
    setLibrarySeedMeta(`Seeded ${expectedLibraryThreats} threats from ${typedModules.length} typed components.`);
  }, [hasLibraryThreats, typedModules.length, expectedLibraryThreats, setThreats]);

  const reseedLibrary = () => {
    setThreats((current) => {
      const idFactory = createThreatIdFactory(current);
      const next = reseedLibraryThreats({
        existingThreats: current,
        modules: typedModules,
        idFactory,
        strideMeta,
        dreadDefaults: defaultDreadScores()
      });
      const added = next.filter((t) => t.source === "library").length;
      setLibrarySeedMeta(`Re-seeded ${added} library threats from ${typedModules.length} typed components. Manual / questionnaire / AI threats preserved.`);
      return next;
    });
  };

  const analyze = async () => {
    setLoading(true);
    setErr(null);

    try {
      const modulePayload = modules.filter((module) => module.name).map((module) => ({
        id: module.id,
        name: module.name,
        parentId: module.parentId,
        inputs: module.inputs,
        outputs: module.outputs,
        dataStores: module.dataStores,
        externalEntities: module.externalEntities
      }));

      const boundaryPayload = trustBoundaries.filter((boundary) => boundary.name.trim()).map((boundary) => ({
        name: boundary.name,
        description: boundary.description,
        modules: modules.filter((module) => boundary.moduleIds.includes(module.id)).map((module) => module.name)
      }));

      const zipAndNotes = profileContextForLlm(profile, 70_000);

      const text = await gemini(apiKey, `You are a threat modeling expert using STRIDE. Identify specific threats for this application.

Application: ${profile.name} (${profile.type})
Stack: ${profile.techStack}
Description: ${profile.description}
${zipAndNotes ? `Context (ZIP / author notes):\n${zipAndNotes}\n` : ""}
Modules: ${JSON.stringify(modulePayload)}
Manual Trust Boundaries: ${JSON.stringify(boundaryPayload)}

Return ONLY a valid JSON array (10-18 threats, all 6 STRIDE categories covered, specific to the tech stack):
[{
  "moduleId":"module-id",
  "moduleName":"exact module name",
  "strideCategory":"S",
  "title":"Short threat title",
  "description":"2-3 sentence specific description",
  "attackVector":"Concrete attack technique"
}]`);

      const data = parseJSON(text);

      setThreats((current) => {
        const preserved = current.filter((threat) => threat.source !== "gemini");
        const makeId = createThreatIdFactory(preserved);

        const nextThreats = data.map((item) => {
          const stride = strideMeta(item.strideCategory);
          const fallbackModule = modules.find((module) => module.name === item.moduleName) || modules.find((module) => module.id === item.moduleId) || modules[0];

          return {
            id: item.id || makeId(),
            moduleId: item.moduleId || fallbackModule?.id || "",
            moduleName: item.moduleName || fallbackModule?.name || "Application",
            strideCategory: item.strideCategory || "S",
            strideName: stride.name,
            title: item.title || "Suggested threat",
            description: item.description || "",
            attackVector: item.attackVector || "",
            status: "review",
            source: "gemini",
            dreadScores: defaultDreadScores()
          };
        });

        return [...preserved, ...nextThreats];
      });
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const addManualThreat = () => setThreats((current) => {
    const makeId = createThreatIdFactory(current);
    const defaultModule = modules.find((module) => module.name.trim()) || modules[0];
    return [...current, {
      id: makeId(),
      moduleId: defaultModule?.id || "",
      moduleName: defaultModule?.name || "",
      strideCategory: "S",
      strideName: "Spoofing",
      title: "New Threat",
      description: "",
      attackVector: "",
      status: "review",
      source: "manual",
      dreadScores: defaultDreadScores()
    }];
  });

  const setStatus = (id, status) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, status } : threat));
  const updateThreat = (id, patch) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, ...patch } : threat));
  const removeThreat = (id) => setThreats((current) => current.filter((threat) => threat.id !== id));

  const updateQuestion = (elementId, questionId, patch) => {
    const key = questionStateKey(elementId, questionId);
    setQuestionnaireAnswers((current) => ({ ...current, [key]: { ...(current[key] || { status: "review", notes: "" }), ...patch } }));
  };

  const createThreatDrafts = () => {
    setThreats((current) => {
      const makeId = createThreatIdFactory(current);
      const additions = [];

      questionnaireElements.forEach((element) => {
        const elementQuestions = QUESTIONNAIRE[element.kind] || [];

        elementQuestions.forEach((question) => {
          const key = questionStateKey(element.id, question.id);
          const answer = questionnaireAnswers[key];
          if (!answer || answer.status === "not-applicable") return;
          if (current.some((threat) => threat.sourceKey === key) || additions.some((threat) => threat.sourceKey === key)) return;

          const stride = strideMeta(question.strideCategory);

          additions.push({
            id: makeId(),
            moduleId: element.moduleId || "",
            moduleName: element.moduleName || element.label,
            strideCategory: question.strideCategory,
            strideName: stride.name,
            title: question.suggestedTitle.replace(/\{\{element\}\}/g, element.label),
            description: answer.notes?.trim() || question.prompt,
            attackVector: question.attackVectorHint,
            status: answer.status === "applicable" ? "applicable" : "review",
            source: "questionnaire",
            sourceKey: key,
            dreadScores: defaultDreadScores()
          });
        });
      });

      return [...current, ...additions];
    });
  };

  const draftableQuestions = questionnaireElements.reduce((count, element) => {
    const elementQuestions = QUESTIONNAIRE[element.kind] || [];
    return count + elementQuestions.filter((question) => {
      const answer = questionnaireAnswers[questionStateKey(element.id, question.id)];
      return answer && answer.status !== "not-applicable";
    }).length;
  }, 0);

  const counts = {
    applicable: threats.filter((threat) => threat.status === "applicable").length,
    review: threats.filter((threat) => threat.status === "review").length,
    na: threats.filter((threat) => threat.status === "not-applicable").length
  };

  const filteredThreats = threats.filter((threat) => {
    if (filter !== "all" && threat.strideCategory !== filter) return false;
    if (moduleFilter !== "all" && threat.moduleId !== moduleFilter) return false;
    if (severityFilter !== "all" && risk(averageScore(threat.dreadScores)).label.toLowerCase() !== severityFilter) return false;
    return true;
  });

  const sourceStyles = {
    gemini: { label: "AI", color: "#00b4d8" },
    manual: { label: "Manual", color: "#30d158" },
    questionnaire: { label: "Questionnaire", color: "#a78bfa" },
    library: { label: "Library", color: "#ec4899" }
  };

  return (
    <>
      <SHdr n={4} title="STRIDE Threat Analysis" sub="Library-seeded threats appear automatically per typed component. Add questionnaire-driven, AI, or manual threats on top, and confirm what is actually relevant." />

      <div style={C.card}>
        <div style={{ color: "#ec4899", fontFamily: "monospace", fontSize: 11, marginBottom: 10 }}>COMPONENT-LIBRARY SEEDED THREATS</div>
        {typedModules.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            None of your modules are typed yet. Go back to <strong style={{ color: "#cbd5e1" }}>Step 2</strong> and assign a Component Type so we can attach the relevant STRIDE threats and security requirements.
          </p>
        ) : (
          <>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
              {threats.filter((t) => t.source === "library").length} library threats currently attached, drawn from {typedModules.length} typed component{typedModules.length === 1 ? "" : "s"}. Re-seed if you changed component types in Step 2.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={reseedLibrary} style={{ ...C.btn, ...C.btnS, borderColor: "#ec4899", color: "#ec4899" }}>Re-seed library threats</button>
              {librarySeedMeta && <span style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace" }}>{librarySeedMeta}</span>}
            </div>
          </>
        )}
      </div>

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>GUIDED STRIDE QUESTIONNAIRE</div>
        <div style={C.g2}>
          <Fld label="DFD Element">
            <Sel value={selectedElement?.id || ""} onChange={(event) => setSelectedElementId(event.target.value)}>
              {questionnaireElements.map((element) => <option key={element.id} value={element.id}>{element.kind} · {element.label}</option>)}
            </Sel>
          </Fld>
          <Fld label="Boundary Context">
            <div style={{ minHeight: 40, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {selectedElement?.boundaryNames?.length ? selectedElement.boundaryNames.map((name) => <Tag key={name} label={name} color="#ff9f0a" />) : <span style={{ color: "#475569", fontSize: 12 }}>No manual trust boundary assigned.</span>}
            </div>
          </Fld>
        </div>

        {!selectedElement && <div style={{ color: "#334155", fontSize: 13 }}>Add modules and DFD elements first to start the questionnaire.</div>}

        {selectedElement && questions.map((question) => {
          const key = questionStateKey(selectedElement.id, question.id);
          const answer = questionnaireAnswers[key] || { status: "review", notes: "" };
          const stride = strideMeta(question.strideCategory);

          return (
            <div key={question.id} style={{ border: "1px solid #1a2540", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                    <Tag label={`${stride.id} · ${stride.name}`} color={stride.color} />
                    <span style={{ color: "#334155", fontSize: 11 }}>{selectedElement.kind}</span>
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: 13 }}>{question.prompt}</div>
                </div>
                <Sel value={answer.status} onChange={(event) => updateQuestion(selectedElement.id, question.id, { status: event.target.value })} style={{ width: 180, flexShrink: 0 }}>
                  <option value="applicable">Applicable</option>
                  <option value="review">Under Review</option>
                  <option value="not-applicable">Not Applicable</option>
                </Sel>
              </div>
              <Txt value={answer.notes} onChange={(event) => updateQuestion(selectedElement.id, question.id, { notes: event.target.value })} placeholder="Capture evidence, assumptions, or a concrete scenario for this STRIDE prompt..." style={{ height: 72 }} />
            </div>
          );
        })}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ color: "#475569", fontSize: 12 }}>{draftableQuestions} flagged questionnaire items ready to become threat drafts.</div>
          <button onClick={createThreatDrafts} style={{ ...C.btn, ...C.btnS }}>Create Threat Drafts</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <AiBtn onClick={analyze} loading={loading} label="Auto-Suggest Threats with Gemini" />
        <button onClick={addManualThreat} style={{ ...C.btn, ...C.btnS }}>+ Manual Threat</button>
      </div>
      <Err msg={err} />

      {threats.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Pill label="Total" value={threats.length} color="#00b4d8" />
            <Pill label="Applicable" value={counts.applicable} color="#30d158" />
            <Pill label="Review" value={counts.review} color="#ff9f0a" />
            <Pill label="N/A" value={counts.na} color="#475569" />
          </div>

          <div style={{ ...C.card, paddingBottom: 8 }}>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 10 }}>Filter by STRIDE, module, and current DREAD severity.</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {["all", ...STRIDE.map((item) => item.id)].map((category) => {
                const stride = STRIDE.find((item) => item.id === category);
                const color = stride?.color || "#00b4d8";

                return (
                  <button key={category} onClick={() => setFilter(category)} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", cursor: "pointer", background: filter === category ? (category === "all" ? "#00b4d8" : color) : "transparent", border: `1px solid ${category === "all" ? "#00b4d8" : color}`, color: filter === category ? "#000" : "#94a3b8" }}>
                    {category === "all" ? "All" : `${stride.id} · ${stride.name}`}
                  </button>
                );
              })}
            </div>
            <div style={C.g2}>
              <Fld label="Module Filter">
                <Sel value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
                  <option value="all">All modules</option>
                  {modules.filter((module) => module.name.trim()).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                </Sel>
              </Fld>
              <Fld label="Severity Filter">
                <Sel value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                  <option value="all">All severities</option>
                  {["critical", "high", "medium", "low"].map((severity) => <option key={severity} value={severity}>{severity[0].toUpperCase() + severity.slice(1)}</option>)}
                </Sel>
              </Fld>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredThreats.map((threat) => {
              const stride = strideMeta(threat.strideCategory);
              const severity = risk(averageScore(threat.dreadScores));
              const isExpanded = expanded === threat.id;
              const source = sourceStyles[threat.source] || sourceStyles.manual;

              return (
                <div key={threat.id} style={{ ...C.card, borderLeft: `3px solid ${stride.color}`, marginBottom: 0, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : threat.id)}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#334155" }}>{threat.id}</span>
                        <Tag label={`${stride.id} · ${stride.name}`} color={stride.color} />
                        <Tag label={source.label} color={source.color} />
                        <Tag label={severity.label} color={severity.color} bg={severity.bg} />
                        <span style={{ color: "#334155", fontSize: 11 }}>to {threat.moduleName || "Unassigned"}</span>
                      </div>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{threat.title}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {[["applicable", "Ok", "#30d158"], ["review", "?", "#ff9f0a"], ["not-applicable", "No", "#64748b"]].map(([status, label, color]) => (
                        <button key={status} onClick={() => setStatus(threat.id, status)} style={{ minWidth: 32, height: 28, padding: "0 6px", borderRadius: 4, border: `1px solid ${threat.status === status ? color : "#1e2d4a"}`, background: threat.status === status ? `${color}22` : "transparent", color: threat.status === status ? color : "#334155", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #141e30" }}>
                      <div style={C.g2}>
                        <Fld label="Threat Title"><Inp value={threat.title} onChange={(event) => updateThreat(threat.id, { title: event.target.value })} /></Fld>
                        <Fld label="Module">
                          <Sel value={threat.moduleId || ""} onChange={(event) => {
                            const module = modules.find((candidate) => candidate.id === event.target.value);
                            updateThreat(threat.id, { moduleId: event.target.value, moduleName: module?.name || "" });
                          }}>
                            <option value="">Unassigned</option>
                            {modules.filter((module) => module.name.trim()).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                          </Sel>
                        </Fld>
                        <Fld label="STRIDE Category">
                          <Sel value={threat.strideCategory} onChange={(event) => {
                            const strideInfo = strideMeta(event.target.value);
                            updateThreat(threat.id, { strideCategory: event.target.value, strideName: strideInfo.name });
                          }}>
                            {STRIDE.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
                          </Sel>
                        </Fld>
                        <Fld label="Status">
                          <Sel value={threat.status} onChange={(event) => updateThreat(threat.id, { status: event.target.value })}>
                            <option value="applicable">Applicable</option>
                            <option value="review">Under Review</option>
                            <option value="not-applicable">Not Applicable</option>
                          </Sel>
                        </Fld>
                        <Fld label="Description" span><Txt value={threat.description} onChange={(event) => updateThreat(threat.id, { description: event.target.value })} style={{ height: 92 }} /></Fld>
                        <Fld label="Attack Vector" span><Inp value={threat.attackVector} onChange={(event) => updateThreat(threat.id, { attackVector: event.target.value })} placeholder="Concrete technique or abuse path" /></Fld>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={() => removeThreat(threat.id)} style={{ ...C.btn, ...C.btnDanger }}>Delete Threat</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Step5({ threats, setThreats, modules }) {
  const [moduleFilter, setModuleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [strideFilter, setStrideFilter] = useState("all");
  const applicable = threats.filter((threat) => threat.status === "applicable");
  const setScore = (id, dimension, value) => setThreats((current) => current.map((threat) => threat.id === id ? { ...threat, dreadScores: { ...threat.dreadScores, [dimension]: value } } : threat));

  const filteredApplicable = applicable.filter((threat) => {
    if (moduleFilter !== "all" && threat.moduleId !== moduleFilter) return false;
    if (severityFilter !== "all" && risk(averageScore(threat.dreadScores)).label.toLowerCase() !== severityFilter) return false;
    if (strideFilter !== "all" && threat.strideCategory !== strideFilter) return false;
    return true;
  }).sort((a, b) => averageScore(b.dreadScores) - averageScore(a.dreadScores));

  if (!applicable.length) {
    return (
      <>
        <SHdr n={5} title="DREAD Risk Scoring" sub="Score threats across the five DREAD dimensions once they have been marked as applicable." />
        <div style={{ ...C.card, textAlign: "center", color: "#334155", padding: 40 }}>No applicable threats yet. Go back to Step 4 and mark threats as Applicable.</div>
      </>
    );
  }

  return (
    <>
      <SHdr n={5} title="DREAD Risk Scoring" sub="Score each applicable threat from 1-10 per dimension and use filters to focus on the riskiest slices of the application." />

      <div style={C.card}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 12 }}>RISK DASHBOARD · {filteredApplicable.length} THREATS IN VIEW</div>
        <div style={C.g3}>
          <Fld label="STRIDE Filter">
            <Sel value={strideFilter} onChange={(event) => setStrideFilter(event.target.value)}>
              <option value="all">All STRIDE categories</option>
              {STRIDE.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}
            </Sel>
          </Fld>
          <Fld label="Module Filter">
            <Sel value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              <option value="all">All modules</option>
              {modules.filter((module) => module.name.trim()).map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
            </Sel>
          </Fld>
          <Fld label="Severity Filter">
            <Sel value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="all">All severities</option>
              {["critical", "high", "medium", "low"].map((severity) => <option key={severity} value={severity}>{severity[0].toUpperCase() + severity.slice(1)}</option>)}
            </Sel>
          </Fld>
        </div>

        {!filteredApplicable.length && <div style={{ color: "#334155", fontSize: 13 }}>No threats match the current filters.</div>}

        {filteredApplicable.map((threat) => {
          const score = +averageScore(threat.dreadScores).toFixed(1);
          const severity = risk(score);
          return (
            <div key={threat.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#334155", width: 36 }}>{threat.id}</span>
              <span style={{ flex: 1, fontSize: 12, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{threat.title}</span>
              <div style={{ width: 100, height: 5, background: "#141e30", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                <div style={{ width: `${score * 10}%`, height: "100%", background: severity.color, borderRadius: 3 }} />
              </div>
              <Tag label={severity.label} color={severity.color} bg={severity.bg} />
              <span style={{ fontFamily: "monospace", fontSize: 12, color: severity.color, width: 28, textAlign: "right" }}>{score}</span>
            </div>
          );
        })}
      </div>

      {filteredApplicable.map((threat) => {
        const score = +averageScore(threat.dreadScores).toFixed(1);
        const severity = risk(score);

        return (
          <div key={threat.id} style={{ ...C.card, borderLeft: `3px solid ${severity.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
              <div>
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "#334155", marginRight: 8 }}>{threat.id}</span>
                <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{threat.title}</span>
                <span style={{ color: "#334155", fontSize: 11, marginLeft: 8 }}>to {threat.moduleName}</span>
              </div>
              <Tag label={`${severity.label} · ${score}`} color={severity.color} bg={severity.bg} />
            </div>

            {DREAD.map((dimension) => (
              <div key={dimension.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b", width: 150, flexShrink: 0 }}>{dimension.label}</span>
                <input type="range" min={1} max={10} step={1} value={threat.dreadScores[dimension.id]} onChange={(event) => setScore(threat.id, dimension.id, Number(event.target.value))} style={{ flex: 1, accentColor: severity.color }} />
                <span style={{ fontFamily: "monospace", fontSize: 13, color: severity.color, width: 18, textAlign: "center" }}>{threat.dreadScores[dimension.id]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

function Step6({ profile, modules, setModules, threats, apiKey, mitigations, setMitigations, trustBoundaries, dfd }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [strideFilter, setStrideFilter] = useState("all");
  const [expandedSource, setExpandedSource] = useState(null);
  const applicable = [...threats.filter((threat) => threat.status === "applicable")].sort((a, b) => averageScore(b.dreadScores) - averageScore(a.dreadScores));

  const updateRequirement = (moduleId, instanceId, patch) => {
    setModules((current) => current.map((m) => {
      if (m.id !== moduleId) return m;
      return {
        ...m,
        securityRequirements: (m.securityRequirements || []).map((r) => r.instanceId === instanceId ? { ...r, ...patch } : r)
      };
    }));
  };

  const bySource = modules
    .filter((m) => m.name.trim())
    .map((m) => {
      const moduleThreats = threats.filter((t) => t.moduleId === m.id);
      const filtered = strideFilter === "all" ? moduleThreats : moduleThreats.filter((t) => t.strideCategory === strideFilter);
      return {
        module: m,
        threats: moduleThreats,
        filteredThreats: filtered,
        component: getComponent(m.componentType)
      };
    });
  const criticalCount = applicable.filter((threat) => averageScore(threat.dreadScores) > 8).length;
  const highCount = applicable.filter((threat) => {
    const score = averageScore(threat.dreadScores);
    return score >= 6 && score <= 8;
  }).length;
  const proneness = threatProneness(applicable);
  const businessCriticality = criticalityKey(profile.criticality);
  const testingFrequency = recommendedTestingFrequency(businessCriticality, proneness.key, criticalCount);

  const generate = async () => {
    setLoading(true);
    setErr(null);

    try {
      const payload = applicable.map((threat) => ({
        id: threat.id,
        title: threat.title,
        category: threat.strideName,
        description: threat.description,
        score: +averageScore(threat.dreadScores).toFixed(1)
      }));

      const zipAndNotes = profileContextForLlm(profile, 12_000);

      const text = await gemini(apiKey, `You are a security engineer. Provide specific actionable remediation for these threats.

Application: ${profile.name}, Stack: ${profile.techStack}
${zipAndNotes ? `Context:\n${zipAndNotes}\n` : ""}
Threats: ${JSON.stringify(payload)}

Return ONLY valid JSON (no markdown):
{"T001":{"shortFix":"one-liner","recommendations":["step1","step2","step3"],"effort":"Low|Medium|High","securityControl":"OWASP/security control reference"}}`);

      setMitigations(parseJSON(text));
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    const payload = buildReportPayload({ profile, modules, trustBoundaries, threats, mitigations, dfd });
    downloadTextFile(`${slugify(profile.name || "threat-model")}-report.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };

  const matrixRows = ["high", "medium", "low"];
  const matrixCols = ["low", "medium", "high"];
  const matrixLabel = { low: "Low", medium: "Medium", high: "High" };

  return (
    <>
      <SHdr n={6} title="Threat Modeling Report" sub="Review the final report, export machine-readable data, and use the prioritization matrix to recommend testing frequency." />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <AiBtn onClick={generate} loading={loading} label="Generate Remediation Recommendations" />
        <button onClick={exportJson} style={{ ...C.btn, ...C.btnS }}>Export JSON</button>
        <button onClick={() => window.print()} style={{ ...C.btn, ...C.btnS }}>Print / Save PDF</button>
      </div>
      <Err msg={err} />

      <div style={{ ...C.card, borderColor: "#00b4d8" }}>
        <div style={{ color: "#00b4d8", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>EXECUTIVE SUMMARY</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <Pill label="Threats" value={applicable.length} color="#00b4d8" />
          <Pill label="Critical" value={criticalCount} color="#ff2d55" />
          <Pill label="High" value={highCount} color="#ff9f0a" />
          <Pill label="Modules" value={modules.filter((module) => module.name).length} color="#30d158" />
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          Threat modeling was performed on <strong style={{ color: "#e2e8f0" }}>{profile.name || "this application"}</strong> ({profile.type}) deployed on {profile.deployEnv} using <strong style={{ color: "#e2e8f0" }}>{profile.techStack || "an unspecified stack"}</strong>. The STRIDE methodology identified <strong style={{ color: "#e2e8f0" }}>{applicable.length} applicable threats</strong> across {modules.filter((module) => module.name).length} modules.
          {criticalCount > 0 && <> <strong style={{ color: "#ff2d55" }}>{criticalCount} Critical</strong> and <strong style={{ color: "#ff9f0a" }}>{highCount} High</strong> severity threats should be prioritized first.</>}
          {profile.compliance && <> Compliance scope: {profile.compliance}.</>}
        </p>
      </div>

      <div style={C.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: "#ec4899", fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>THREATS BY SOURCE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["all", ...STRIDE.map((s) => s.id)].map((cat) => {
              const stride = STRIDE.find((s) => s.id === cat);
              const color = stride?.color || "#ec4899";
              const active = strideFilter === cat;
              return (
                <button key={cat} onClick={() => setStrideFilter(cat)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", cursor: "pointer", background: active ? color : "transparent", border: `1px solid ${color}`, color: active ? "#000" : "#94a3b8" }}>
                  {cat === "all" ? "All" : cat}
                </button>
              );
            })}
          </div>
        </div>
        <p style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Threats grouped by the module / component that owns them. Click a row to expand.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1a2540" }}>
                {["Source", "Component Type", "Threats", "Applicable", "Severity Mix"].map((heading) => (
                  <th key={heading} style={{ padding: "8px 8px", textAlign: "left", color: "#475569", fontFamily: "monospace", fontWeight: 400 }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bySource.map(({ module, threats: ts, filteredThreats, component }) => {
                const isOpen = expandedSource === module.id;
                const sevMix = ["Critical", "High", "Medium", "Low"].map((label) => {
                  const c = ts.filter((t) => risk(averageScore(t.dreadScores)).label === label).length;
                  if (!c) return null;
                  const meta = risk(label === "Critical" ? 9 : label === "High" ? 7 : label === "Medium" ? 5 : 3);
                  return <Tag key={label} label={`${label[0]}·${c}`} color={meta.color} bg={meta.bg} />;
                }).filter(Boolean);

                return (
                  <Fragment key={module.id}>
                    <tr style={{ borderBottom: "1px solid #0e1728", cursor: "pointer" }} onClick={() => setExpandedSource(isOpen ? null : module.id)}>
                      <td style={{ padding: "10px 8px", color: "#cbd5e1", fontWeight: 500 }}>{isOpen ? "▾" : "▸"} {module.name}</td>
                      <td style={{ padding: "10px 8px", color: component ? component.color : "#475569", fontFamily: "monospace", fontSize: 11 }}>
                        {component ? `${component.category} · ${component.label}` : "Unclassified"}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#e2e8f0", fontFamily: "monospace" }}>{filteredThreats.length}{strideFilter !== "all" && ` / ${ts.length}`}</td>
                      <td style={{ padding: "10px 8px", color: "#30d158", fontFamily: "monospace" }}>{ts.filter((t) => t.status === "applicable").length}</td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{sevMix.length ? sevMix : <span style={{ color: "#334155", fontSize: 11 }}>—</span>}</div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, background: "#080e1a" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <tbody>
                              {filteredThreats.length === 0 && (
                                <tr><td style={{ padding: "10px 16px", color: "#475569", fontSize: 12 }}>No threats for current filter.</td></tr>
                              )}
                              {filteredThreats.map((t) => {
                                const stride = strideMeta(t.strideCategory);
                                const score = +averageScore(t.dreadScores).toFixed(1);
                                const sev = risk(score);
                                return (
                                  <tr key={t.id} style={{ borderBottom: "1px solid #0e1728" }}>
                                    <td style={{ padding: "8px 16px", width: 60, color: "#334155", fontFamily: "monospace", fontSize: 11 }}>{t.id}</td>
                                    <td style={{ padding: "8px 8px", width: 40 }}><Tag label={stride.id} color={stride.color} /></td>
                                    <td style={{ padding: "8px 8px", color: "#cbd5e1" }}>{t.title}</td>
                                    <td style={{ padding: "8px 8px", width: 90 }}><Tag label={`${sev.label} ${score}`} color={sev.color} bg={sev.bg} /></td>
                                    <td style={{ padding: "8px 16px", width: 90, color: t.status === "applicable" ? "#30d158" : t.status === "not-applicable" ? "#64748b" : "#ff9f0a", fontFamily: "monospace", fontSize: 11 }}>{t.status}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {bySource.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 12, color: "#475569", fontSize: 12, textAlign: "center" }}>No modules defined yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: 11, marginBottom: 10, letterSpacing: 2 }}>SECURITY REQUIREMENTS</div>
        <p style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>Component-library security controls grouped by source. Track status and link Jira tickets.</p>
        {bySource.filter(({ module }) => (module.securityRequirements || []).length).length === 0 && (
          <div style={{ color: "#475569", fontSize: 12, padding: "10px 0" }}>No security requirements yet — assign Component Types in Step 2 to attach the library's controls.</div>
        )}
        {bySource.map(({ module, component }) => {
          const reqs = module.securityRequirements || [];
          if (!reqs.length) return null;
          const counts = reqs.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
          return (
            <div key={module.id} style={{ borderBottom: "1px solid #141e30", marginBottom: 12, paddingBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <div>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{module.name}</span>
                  {component && <span style={{ marginLeft: 8 }}><Tag label={component.label} color={component.color} /></span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <Tag label={`Open ${counts.open || 0}`} color="#ff9f0a" />
                  <Tag label={`Partial ${counts.partial || 0}`} color="#ffd60a" />
                  <Tag label={`Closed ${counts.closed || 0}`} color="#30d158" />
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a2540" }}>
                      {["Security Requirement", "Source", "Status", "Issue"].map((h) => (
                        <th key={h} style={{ padding: "8px 8px", textAlign: "left", color: "#475569", fontFamily: "monospace", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r) => {
                      const statusColor = r.status === "closed" ? "#30d158" : r.status === "partial" ? "#ffd60a" : "#ff9f0a";
                      return (
                        <tr key={r.instanceId} style={{ borderBottom: "1px solid #0e1728" }}>
                          <td style={{ padding: "8px 8px" }}>
                            <div style={{ color: "#cbd5e1" }}>{r.title}</div>
                            <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{r.description}</div>
                            {r.controlFamily && <div style={{ color: "#334155", fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>{r.controlFamily}</div>}
                          </td>
                          <td style={{ padding: "8px 8px", color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>{module.name}</td>
                          <td style={{ padding: "8px 8px", width: 140 }}>
                            <Sel value={r.status} onChange={(event) => updateRequirement(module.id, r.instanceId, { status: event.target.value })} style={{ padding: "5px 8px", fontSize: 11, color: statusColor, borderColor: statusColor }}>
                              <option value="open">Open</option>
                              <option value="partial">Partially Mitigated</option>
                              <option value="closed">Closed</option>
                            </Sel>
                          </td>
                          <td style={{ padding: "8px 8px", width: 130 }}>
                            <Inp value={r.jiraKey || ""} onChange={(event) => updateRequirement(module.id, r.instanceId, { jiraKey: event.target.value })} placeholder="TJ-1234" style={{ padding: "5px 8px", fontSize: 11 }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div style={C.card}>
        <div style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>APPLICATION OVERVIEW</div>
        <div style={C.g2}>
          {[["Name", profile.name || "—"], ["Type", profile.type], ["Deployment", profile.deployEnv], ["Status", profile.appStatus], ["Tech Stack", profile.techStack || "—"], ["Compliance", profile.compliance || "—"]].map(([key, value]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{ color: "#475569", fontSize: 11, fontFamily: "monospace" }}>{key}</div>
              <div style={{ color: "#e2e8f0", fontSize: 13 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#ff9f0a", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>APPLICATION PRIORITIZATION MATRIX</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <Tag label={`Business Criticality: ${matrixLabel[businessCriticality]}`} color={businessCriticality === "high" ? "#ff2d55" : businessCriticality === "medium" ? "#ff9f0a" : "#30d158"} />
          <Tag label={`Threat Proneness: ${proneness.label}`} color={proneness.color} />
          <Tag label={`Recommended Testing: ${testingFrequency}`} color="#00b4d8" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "140px repeat(3, 1fr)", gap: 6 }}>
          <div />
          {matrixCols.map((column) => <div key={column} style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace", textAlign: "center" }}>BUSINESS {matrixLabel[column].toUpperCase()}</div>)}
          {matrixRows.map((row) => (
            <div key={row} style={{ display: "contents" }}>
              <div key={`${row}-label`} style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center" }}>THREAT {matrixLabel[row].toUpperCase()}</div>
              {matrixCols.map((column) => {
                const active = row === proneness.key && column === businessCriticality;
                const cellFrequency = recommendedTestingFrequency(column, row, criticalCount);
                return (
                  <div key={`${row}-${column}`} style={{ border: `1px solid ${active ? "#00b4d8" : "#1a2540"}`, background: active ? "rgba(0,180,216,.12)" : "rgba(255,255,255,.02)", borderRadius: 8, padding: 14, minHeight: 74 }}>
                    <div style={{ color: active ? "#00b4d8" : "#94a3b8", fontSize: 12, fontWeight: 600 }}>{cellFrequency}</div>
                    <div style={{ color: "#475569", fontSize: 11, marginTop: 6 }}>{active ? "Current application placement" : "Reference cadence"}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>DFD SNAPSHOT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <ContextDFDCanvas profile={profile} modules={modules} svgId="tm-report-context" />
          <Level1DFDCanvas modules={modules} trustBoundaries={trustBoundaries} svgId="tm-report-level1" />
        </div>
      </div>

      <div style={C.card}>
        <div style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: 11, marginBottom: 14, letterSpacing: 2 }}>THREAT REGISTER ({applicable.length})</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1a2540" }}>
                {["ID", "Module", "Category", "Threat Title", "D", "R", "E", "A", "Di", "Score", "Severity"].map((heading) => (
                  <th key={heading} style={{ padding: "8px 8px", textAlign: "left", color: "#475569", fontFamily: "monospace", fontWeight: 400, whiteSpace: "nowrap" }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applicable.map((threat, index) => {
                const score = +averageScore(threat.dreadScores).toFixed(1);
                const severity = risk(score);
                const stride = strideMeta(threat.strideCategory);

                return (
                  <tr key={threat.id} style={{ borderBottom: "1px solid #0e1728", background: index % 2 ? "rgba(255,255,255,.01)" : "transparent" }}>
                    <td style={{ padding: "8px 8px", color: "#334155", fontFamily: "monospace", whiteSpace: "nowrap" }}>{threat.id}</td>
                    <td style={{ padding: "8px 8px", color: "#94a3b8", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{threat.moduleName}</td>
                    <td style={{ padding: "8px 8px" }}><Tag label={threat.strideCategory} color={stride.color} /></td>
                    <td style={{ padding: "8px 8px", color: "#cbd5e1" }}>{threat.title}</td>
                    {["damage", "reproducibility", "exploitability", "affectedUsers", "discoverability"].map((dimension) => (
                      <td key={dimension} style={{ padding: "8px 8px", fontFamily: "monospace", color: "#475569", textAlign: "center" }}>{threat.dreadScores[dimension]}</td>
                    ))}
                    <td style={{ padding: "8px 8px", fontFamily: "monospace", color: severity.color, fontWeight: 700 }}>{score}</td>
                    <td style={{ padding: "8px 8px" }}><Tag label={severity.label} color={severity.color} bg={severity.bg} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {Object.keys(mitigations).length > 0 && <div style={C.card}>
        <div style={{ color: "#30d158", fontFamily: "monospace", fontSize: 11, marginBottom: 14, letterSpacing: 2 }}>REMEDIATION RECOMMENDATIONS</div>
        {applicable.map((threat) => {
          const mitigation = mitigations[threat.id];
          if (!mitigation) return null;

          const score = +averageScore(threat.dreadScores).toFixed(1);
          const severity = risk(score);
          const effortColor = { Low: "#30d158", Medium: "#ff9f0a", High: "#ff2d55" }[mitigation.effort] || "#64748b";

          return (
            <div key={threat.id} style={{ borderBottom: "1px solid #141e30", paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#334155", marginRight: 8 }}>{threat.id}</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500 }}>{threat.title}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Tag label={`Effort: ${mitigation.effort}`} color={effortColor} />
                  <Tag label={severity.label} color={severity.color} bg={severity.bg} />
                </div>
              </div>
              <div style={{ color: "#30d158", fontSize: 13, marginBottom: 8 }}>- {mitigation.shortFix}</div>
              {mitigation.recommendations?.map((recommendation, index) => <div key={index} style={{ color: "#94a3b8", fontSize: 12, padding: "3px 0", paddingLeft: 14 }}>{index + 1}. {recommendation}</div>)}
              {mitigation.securityControl && <div style={{ color: "#334155", fontSize: 11, marginTop: 8 }}>Control: <span style={{ color: "#475569" }}>{mitigation.securityControl}</span></div>}
            </div>
          );
        })}
      </div>}

      <div style={C.card}>
        <div style={{ color: "#e2e8f0", fontFamily: "monospace", fontSize: 11, marginBottom: 12, letterSpacing: 2 }}>STRIDE CATEGORY BREAKDOWN</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {STRIDE.map((item) => {
            const count = applicable.filter((threat) => threat.strideCategory === item.id).length;
            return (
              <div key={item.id} style={{ background: `${item.color}10`, border: `1px solid ${item.color}30`, borderRadius: 6, padding: "10px 16px", textAlign: "center", minWidth: 110 }}>
                <div style={{ color: item.color, fontSize: 22, fontFamily: "monospace", fontWeight: 700 }}>{count}</div>
                <div style={{ color: item.color, fontSize: 11, fontFamily: "monospace" }}>{item.id}</div>
                <div style={{ color: "#475569", fontSize: 11 }}>{item.name}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ textAlign: "center", color: "#1e2d4a", fontSize: 11, fontFamily: "monospace", marginTop: 16 }}>
        Generated by ThreatModeler v1.1 · {new Date().toLocaleDateString()}
      </div>
    </>
  );
}

export default function ThreatModeler() {
  const zipBufferRef = useRef(null);
  const [workspace, setWorkspace] = useState("wizard");
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState(DEFAULT_GEMINI_API_KEY);
  const [geminiSettingsOpen, setGeminiSettingsOpen] = useState(false);
  const [profile, setProfile] = useState({
    name: "",
    type: "Web Application",
    deployEnv: "Cloud (Public)",
    appStatus: "legacy",
    techStack: "",
    description: "",
    criticality: "High — Mission critical / PII / Financial",
    compliance: "",
    repoUrl: "",
    repoBranch: "",
    repoContext: "",
    zipFileName: "",
    zipDerivedContext: "",
    modelContextNotes: ""
  });
  const [modules, setModules] = useState([createModule("m-1")]);
  const [dfd, setDfd] = useState(null);
  const [trustBoundaries, setTrustBoundaries] = useState([]);
  const [threats, setThreats] = useState([]);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [mitigations, setMitigations] = useState({});
  const [dfdMode, setDfdMode] = useState("auto");

  const canNext = () => {
    if (step === 1) return profile.name.trim().length > 0;
    if (step === 2) return modules.some((module) => module.name.trim());
    if (step === 4) return threats.length > 0;
    return true;
  };

  const steps = ["Profile", "Modules", "DFD", "STRIDE", "DREAD", "Report"];

  if (workspace === "canvas") {
    return (
      <div style={{ ...C.root, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
        <div className="no-print" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid #1a2540", background: "#08101e" }}>
          <button type="button" onClick={() => setWorkspace("wizard")} style={{ ...C.btn, ...C.btnS }}>Back to wizard</button>
          <span style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace", textAlign: "center", flex: 1 }}>Interactive DFD canvas: draw components, connect flows, analyze threats, and remediation</span>
          <GeminiSettingsPopover apiKey={apiKey} setApiKey={setApiKey} open={geminiSettingsOpen} onOpenChange={setGeminiSettingsOpen} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <ThreatModelerCanvas
            embedded
            hideApiKeyInToolbar
            onRequestApiKeySettings={() => setGeminiSettingsOpen(true)}
            apiKey={apiKey}
            setApiKey={setApiKey}
            initialAppName={profile.name}
            initialAppDesc={[profile.modelContextNotes, profile.description].filter((s) => s?.trim()).join("\n\n") || profile.description}
            initialAppStack={profile.techStack}
          />
        </div>
      </div>
    );
  }

  if (workspace === "designer") {
    return (
      <div style={{ ...C.root, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
        <div className="no-print" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", borderBottom: "1px solid #1a2540", background: "#08101e" }}>
          <button type="button" onClick={() => setWorkspace("wizard")} style={{ ...C.btn, ...C.btnS }}>Back to wizard</button>
          <span style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace", textAlign: "center", flex: 1 }}>Stencil designer — drag typed components onto the canvas to build the architecture</span>
          <GeminiSettingsPopover apiKey={apiKey} setApiKey={setApiKey} open={geminiSettingsOpen} onOpenChange={setGeminiSettingsOpen} />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <StencilDesigner
            initialModules={modules.filter((m) => m.componentType)}
            onCancel={() => setWorkspace("wizard")}
            onCommit={({ modules: designerModules }) => {
              if (designerModules.length > 0) {
                setModules(designerModules.map((m) => normalizeModule(m)));
                setThreats((current) => {
                  const idFactory = createThreatIdFactory(current);
                  return reseedLibraryThreats({
                    existingThreats: current,
                    modules: designerModules,
                    idFactory,
                    strideMeta,
                    dreadDefaults: defaultDreadScores()
                  });
                });
              }
              setWorkspace("wizard");
              setStep((current) => current < 2 ? 2 : current);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={C.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input:focus,select:focus,textarea:focus{border-color:#00b4d8!important;box-shadow:0 0 0 2px rgba(0,180,216,.1)!important}
        input[type=range]{-webkit-appearance:none;height:4px;background:#1a2540;border-radius:2px;outline:none;border:none!important;padding:0!important}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--thumb-color,#00b4d8);cursor:pointer}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#080e1a}::-webkit-scrollbar-thumb{background:#1a2540;border-radius:2px}
        select option{background:#0d1421;color:#e2e8f0}
        @media print{.no-print{display:none!important}body{background:#fff!important;color:#000!important}}
        @media(max-width:720px){.grid2,.grid3{grid-template-columns:1fr!important}}
      `}</style>

      <header style={C.hdr} className="no-print">
        <div style={C.hdrIn}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "monospace", letterSpacing: 1, color: "#e2e8f0" }}>ThreatModeler</div>
              <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace" }}>Lightweight Threat Modeling Tool · v1.1</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {profile.name && <span style={{ color: "#334155", fontSize: 12, fontFamily: "monospace" }}>{profile.name}</span>}
            <button type="button" onClick={() => setWorkspace("canvas")} style={{ ...C.btn, ...C.btnS, fontSize: 11 }} title="Visual DFD editor with Gemini STRIDE analysis">
              Interactive canvas
            </button>
            <GeminiSettingsPopover apiKey={apiKey} setApiKey={setApiKey} open={geminiSettingsOpen} onOpenChange={setGeminiSettingsOpen} />
          </div>
        </div>
      </header>

      <div style={{ background: "#07101d", borderBottom: "1px solid #1a2540", padding: "10px 20px", display: "flex", justifyContent: "center", alignItems: "center", gap: 0 }} className="no-print">
        {steps.map((label, index) => {
          const n = index + 1;
          const active = n === step;
          const done = n < step;

          return (
            <div key={n} style={{ display: "flex", alignItems: "center", cursor: done ? "pointer" : "default" }} onClick={() => done && setStep(n)}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "monospace", flexShrink: 0, border: `1px solid ${active ? "#00b4d8" : done ? "#30d158" : "#1e2d4a"}`, background: active ? "rgba(0,180,216,.1)" : done ? "rgba(48,209,88,.1)" : "transparent", color: active ? "#00b4d8" : done ? "#30d158" : "#334155" }}>
                {done ? "+" : n}
              </div>
              <span style={{ fontSize: 11, margin: "0 6px", fontFamily: "monospace", color: active ? "#00b4d8" : done ? "#30d158" : "#334155" }}>{label}</span>
              {index < steps.length - 1 && <div style={{ width: 24, height: 1, background: done ? "#30d158" : "#1a2540", margin: "0 2px" }} />}
            </div>
          );
        })}
      </div>

      <main style={C.main} className="grid2 grid3">
        {step === 1 && <Step1 profile={profile} setProfile={setProfile} zipBufferRef={zipBufferRef} onOpenDesigner={() => setWorkspace("designer")} />}
        {step === 2 && <Step2 modules={modules} setModules={setModules} apiKey={apiKey} profile={profile} setProfile={setProfile} zipBufferRef={zipBufferRef} />}
        {step === 3 && (
          <Step3
            profile={profile}
            modules={modules}
            apiKey={apiKey}
            dfd={dfd}
            setDfd={setDfd}
            trustBoundaries={trustBoundaries}
            setTrustBoundaries={setTrustBoundaries}
            dfdMode={dfdMode}
            setDfdMode={setDfdMode}
            onOpenCanvas={() => setWorkspace("canvas")}
          />
        )}
        {step === 4 && <Step4 threats={threats} setThreats={setThreats} modules={modules} apiKey={apiKey} profile={profile} trustBoundaries={trustBoundaries} questionnaireAnswers={questionnaireAnswers} setQuestionnaireAnswers={setQuestionnaireAnswers} />}
        {step === 5 && <Step5 threats={threats} setThreats={setThreats} modules={modules} />}
        {step === 6 && <Step6 profile={profile} modules={modules} setModules={setModules} threats={threats} apiKey={apiKey} mitigations={mitigations} setMitigations={setMitigations} trustBoundaries={trustBoundaries} dfd={dfd} />}
      </main>

      <footer style={C.foot} className="no-print">
        <button style={{ ...C.btn, ...C.btnS }} onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>Back</button>
        <span style={{ color: "#1e2d4a", fontSize: 12, fontFamily: "monospace" }}>Step {step} / {steps.length}</span>
        {step < steps.length
          ? <button style={{ ...C.btn, ...C.btnP, opacity: canNext() ? 1 : 0.4 }} onClick={() => canNext() && setStep((current) => current + 1)} disabled={!canNext()}>Continue</button>
          : <button style={{ ...C.btn, ...C.btnP }} onClick={() => window.print()}>Print / Save PDF</button>}
      </footer>
    </div>
  );
}
