import { STRIDE } from "./modelConstants.js";

export function parseCsv(value = "") {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function defaultDreadScores() {
  return {
    damage: 5,
    reproducibility: 5,
    exploitability: 5,
    affectedUsers: 5,
    discoverability: 5
  };
}

export function averageScore(scores = defaultDreadScores()) {
  const values = Object.values(scores || {});
  return values.reduce((total, value) => total + Number(value || 0), 0) / (values.length || 1);
}

export function risk(score) {
  if (score > 8) return { label: "Critical", color: "#ff2d55", bg: "rgba(255,45,85,0.15)" };
  if (score >= 6) return { label: "High", color: "#ff9f0a", bg: "rgba(255,159,10,0.15)" };
  if (score >= 4) return { label: "Medium", color: "#ffd60a", bg: "rgba(255,214,10,0.12)" };
  return { label: "Low", color: "#30d158", bg: "rgba(48,209,88,0.12)" };
}

export function strideMeta(strideCategory) {
  return STRIDE.find((item) => item.id === strideCategory) || STRIDE[0];
}

export function slugify(value = "threat-modeler") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "threat-modeler";
}

export function createModule(id) {
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

export function modulesFromAiJson(raw) {
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

export function normalizeModule(module) {
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

export function normalizeModules(list) {
  return (Array.isArray(list) ? list : []).map(normalizeModule);
}

export function createTrustBoundary(id) {
  return { id, name: "Trust Boundary", description: "", color: "#ff9f0a", moduleIds: [] };
}

export function moduleHierarchyName(module, modules) {
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

export function profileContextForLlm(profile, maxChars = 120_000) {
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

export function questionStateKey(elementId, questionId) {
  return `${elementId}::${questionId}`;
}

export function createThreatIdFactory(existingThreats) {
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

export function criticalityKey(criticality = "") {
  const normalized = criticality.toLowerCase();
  if (normalized.startsWith("high")) return "high";
  if (normalized.startsWith("medium")) return "medium";
  return "low";
}

export function threatProneness(applicableThreats) {
  if (!applicableThreats.length) return { key: "low", label: "Low", color: "#30d158", score: 0 };

  const scores = applicableThreats.map((threat) => averageScore(threat.dreadScores));
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const max = Math.max(...scores);
  const composite = Math.max(avg, max - 1);

  if (composite >= 6) return { key: "high", label: "High", color: "#ff2d55", score: composite };
  if (composite >= 4) return { key: "medium", label: "Medium", color: "#ff9f0a", score: composite };
  return { key: "low", label: "Low", color: "#30d158", score: composite };
}

export function recommendedTestingFrequency(criticality, proneness, criticalCount) {
  if (criticalCount > 0 || (criticality === "high" && proneness === "high")) return "Monthly";
  if (criticality === "low" && proneness === "low") return "Annually";
  return "Quarterly";
}

export function downloadBlob(filename, blob) {
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

export function downloadTextFile(filename, content, type = "text/plain;charset=utf-8") {
  downloadBlob(filename, new Blob([content], { type }));
}

export function downloadSvg(svgId, filename) {
  if (typeof window === "undefined") return;
  const node = document.getElementById(svgId);
  if (!node) return;

  const clone = node.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  downloadTextFile(filename, `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`, "image/svg+xml;charset=utf-8");
}

export function boundaryMembershipMap(trustBoundaries = []) {
  const membership = {};

  trustBoundaries.forEach((boundary) => {
    (boundary.moduleIds || []).forEach((moduleId) => {
      membership[moduleId] = [...(membership[moduleId] || []), boundary];
    });
  });

  return membership;
}

export function buildDfdElements(modules, trustBoundaries = []) {
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

export function buildQuestionnaireElements(modules, trustBoundaries) {
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

export function buildReportPayload({ profile, modules, trustBoundaries, threats, mitigations, dfd, canvasModel }) {
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
    canvasModel: canvasModel || null,
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

const GEMINI_MODEL_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

function isRetryableGeminiFailure(status, message) {
  if (status === 429 || status === 404 || status >= 500) return true;
  return /high demand|try again later|temporar|overload|unavailable|deadline|timeout/i.test(message || "");
}

export async function gemini(apiKey, prompt) {
  if (!apiKey.trim()) throw new Error("Add a Gemini API key to use AI-assisted analysis.");

  let lastError = null;

  for (const model of GEMINI_MODEL_FALLBACKS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.error) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text != null && text !== "") return text;
      const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason;
      const message = reason ? `No model text (${reason})` : "No model text in response";
      if (!isRetryableGeminiFailure(response.status, message)) throw new Error(message);
      lastError = new Error(`[${model}] ${message}`);
      continue;
    }

    const message = data?.error?.message || `HTTP ${response.status}`;
    if (!isRetryableGeminiFailure(response.status, message)) throw new Error(message);
    lastError = new Error(`[${model}] ${message}`);
  }

  throw new Error(
    `All Gemini model fallbacks failed (${GEMINI_MODEL_FALLBACKS.join(" -> ")}). ${lastError?.message || ""}`.trim()
  );
}

/** Whether the user may leave `stepNum` and advance to stepNum+1. */
export function canAdvanceFromStep(stepNum, { profile, modules, threats }) {
  if (stepNum === 1) return profile.name.trim().length > 0;
  if (stepNum === 2) return modules.some((module) => module.name.trim());
  if (stepNum === 4) return threats.length > 0;
  return true;
}

/** Navigate to `targetStep` (1–6): allowed if going back, or if all prior gates satisfied. */
export function canNavigateToStep(currentStep, targetStep, state) {
  if (targetStep < 1 || targetStep > 6) return false;
  if (targetStep <= currentStep) return true;
  for (let s = 1; s < targetStep; s += 1) {
    if (!canAdvanceFromStep(s, state)) return false;
  }
  return true;
}
