import { useState, useRef } from "react";
import { COMPONENT_LIBRARY, getComponent, injectFromLibrary, listComponentOptions } from "../../componentEngine.js";
import { classifyModulesByRules, classifyModulesWithAi, unresolvedModules } from "../../componentClassifier.js";
import { extractStructuralModulesFromZip } from "../../projectStructureModules.js";
import { extractModulesFromCodeImports } from "../../codeImportModules.js";
import { extractProjectZipContext } from "../../projectZipContext.js";
import { parseGeminiJson } from "../../geminiJson.js";
import { C } from "../modelConstants.js";
import { SHdr, Fld, Inp, Sel, Txt, Err, AiBtn, Btn, Tag } from "../modelPrimitives.jsx";
import {
  createModule,
  gemini,
  moduleHierarchyName,
  modulesFromAiJson,
  normalizeModules,
  profileContextForLlm
} from "../modelHelpers.js";
export default function Step2({ modules, setModules, apiKey, profile, setProfile, zipBufferRef }) {
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
      setAiClassifyErr("Add a Gemini API key in Settings to use AI classification, or classify modules manually.");
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
          throw new Error("No module signals found. Upload a project ZIP or add context, then try again. A Gemini key is only needed for AI suggestions.");
        }
        setModules(applyRulesClassifier(normalizeModules(fallback)));
        setGenMeta(`No API key detected. Used local deterministic signals only (${structCount} structural · ${importCount} import-cluster).`);
        return;
      }

      const llmBundle = profileContextForLlm(profile).trim();
      const signalsBlock = buf ? buildSignalsBlock(signals) : "(no project ZIP — running on metadata + author notes only)";

      if (!buf && !profile.description?.trim() && !profile.techStack?.trim() && !llmBundle) {
        throw new Error("Upload a project ZIP or fill context notes / description / stack so there is something to analyze.");
      }

      const prompt = `You are a software architect doing threat-modeling prep. Produce a clean module decomposition for the application below.

GROUND-TRUTH SIGNALS (deterministic — extracted from the actual archive, NOT inferred):
${signalsBlock}

How to use the signals:
- Treat module NAMES from the structural section as the source of truth for what physically exists in the build system. Prefer those names verbatim.
- The import-clustered section shows what each folder actually depends on; use externals to populate "externalEntities" and use the cluster relationships to populate "outputs" (cross-module flows).
- You MAY merge two signal entries that are obviously the same logical bounded context (e.g. "shared/utils" pulled into one consumer), and you MAY split an overly broad signal into smaller logical modules — but justify each invented name by tying it to a path / package shown in the ZIP context below. Do NOT invent modules that have no basis in the signals or the file index.
- If the signals are sparse or empty, fall back to inferring from the metadata + ZIP file index.

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
        const parsed = parseGeminiJson(text);
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
      <SHdr n={2} title="Module Decomposition" sub="Generate modules from your ZIP and context notes. The app first reads local project signals (manifests, workspaces, import graph), then optionally uses Gemini to refine them. You can always edit modules manually." />

      <div style={C.card}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>ANALYZE PROJECT</div>
        <p style={{ color: "#586064", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
          This first reads local signals from your project (<strong style={{ color: "#2b3437" }}>package.json</strong> workspaces, <strong style={{ color: "#2b3437" }}>pnpm-workspace.yaml</strong>, <strong style={{ color: "#2b3437" }}>lerna.json</strong>, <strong style={{ color: "#2b3437" }}>pom.xml</strong>, <strong style={{ color: "#2b3437" }}>go.work</strong>, folder layout, and JS/TS imports). If a Gemini key is available, AI refines these into logical modules. If not, or if AI fails, the local results are still used. Re-upload the ZIP here if you skipped Step 1.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <AiBtn onClick={onAnalyzeClick} loading={genLoading} label="Analyze project and generate modules" />
          <input
            ref={analyzeZipInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={onAnalyzeZipPicked}
            disabled={genLoading}
            style={{ fontSize: 12, color: "#586064", maxWidth: "100%" }}
          />
        </div>
        {genMeta && (
          <div style={{ color: "#30d158", fontSize: 12, marginBottom: 8, fontFamily: "monospace" }}>{genMeta}</div>
        )}
        <Err msg={genErr} />
      </div>

      <div style={C.card}>
        <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 11, marginBottom: 8 }}>COMPONENT TYPE CLASSIFICATION</div>
        <p style={{ color: "#586064", fontSize: 13, marginBottom: 12, lineHeight: 1.55 }}>
          Each module maps to a component type from the built-in library ({COMPONENT_LIBRARY.components.length} types). This adds relevant STRIDE threats and security requirements automatically. Rules run during generation. For anything still <strong style={{ color: "#2b3437" }}>Unclassified</strong>, use AI classification or set the type manually.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Btn
            type="button"
            onClick={runAiClassifier}
            disabled={aiClassifyLoading}
            variant="default"
            style={{ background: "linear-gradient(135deg, #436086 0%, #375479 100%)", opacity: aiClassifyLoading ? 0.5 : 1 }}
          >
            {aiClassifyLoading ? "Asking Gemini…" : "Classify unresolved with Gemini"}
          </Btn>
          <span style={{ color: "#586064", fontSize: 12, fontFamily: "monospace" }}>
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
        const accentColor = component?.color || "#737c7f";

        return (
          <div key={module.id} style={{ ...C.card, borderLeft: `3px solid ${accentColor}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ color: "#436086", fontFamily: "monospace", fontSize: 12 }}>MODULE {String(index + 1).padStart(2, "0")}</div>
                {(module.name || module.parentId) && <div style={{ color: "#586064", fontSize: 11, marginTop: 4 }}>{module.name ? moduleHierarchyName(module, modules) : "Top-level module"}</div>}
                {!!children.length && <div style={{ color: "#737c7f", fontSize: 11, marginTop: 2 }}>Children: {children.map((child) => child.name).join(", ")}</div>}
                {component && (
                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Tag label={`${component.category} · ${component.label}`} color={component.color} />
                    {sourceLabel && <span style={{ color: "#737c7f", fontSize: 10, fontFamily: "monospace" }}>via {sourceLabel}</span>}
                    <span style={{ color: "#737c7f", fontSize: 10, fontFamily: "monospace" }}>· {component.threats?.length || 0} threats · {component.securityRequirements?.length || 0} requirements</span>
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

      <Btn onClick={addModule} className="mt-1 w-full">+ Add Module</Btn>
    </>
  );
}
