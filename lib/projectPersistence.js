/**
 * Browser-local persistence for threat models (no backend).
 * @typedef {import('../threatModeler/modelHelpers.js').createModule} createModuleHint
 */

export const SCHEMA_VERSION = 1;
const INDEX_KEY = "tm_project_index_v1";
const DATA_PREFIX = "tm_project_snapshot_v1:";

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function readIndex() {
  const raw = localStorage.getItem(INDEX_KEY);
  const arr = safeParse(raw || "[]", []);
  return Array.isArray(arr) ? arr : [];
}

function writeIndex(entries) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
}

/** @returns {{ id: string, name: string, appStatus: string, step: number, updatedAt: number }[]} */
export function listProjectSummaries() {
  return readIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function completionPercent(step) {
  const s = Math.min(6, Math.max(1, Number(step) || 1));
  return Math.round((s / 6) * 100);
}

/**
 * Full serializable wizard state (ZIP binary is not stored; text context is).
 */
export function buildSnapshot({
  profile,
  modules,
  dfd,
  canvasModel,
  trustBoundaries,
  threats,
  questionnaireAnswers,
  mitigations,
  dfdMode,
  step
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { ...profile },
    modules: modules.map((m) => ({ ...m, securityRequirements: (m.securityRequirements || []).map((r) => ({ ...r })) })),
    dfd: dfd ? { ...dfd } : null,
    canvasModel: canvasModel ? {
      appName: canvasModel.appName || "",
      appDesc: canvasModel.appDesc || "",
      appStack: canvasModel.appStack || "",
      nodes: (canvasModel.nodes || []).map((n) => ({ ...n })),
      edges: (canvasModel.edges || []).map((e) => ({ ...e }))
    } : null,
    trustBoundaries: trustBoundaries.map((b) => ({ ...b, moduleIds: [...(b.moduleIds || [])] })),
    threats: threats.map((t) => ({ ...t, dreadScores: { ...t.dreadScores } })),
    questionnaireAnswers: { ...questionnaireAnswers },
    mitigations: { ...mitigations },
    dfdMode: dfdMode || "auto",
    step: Math.min(6, Math.max(1, step || 1)),
    savedAt: Date.now()
  };
}

export function hydrateFromSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const v = raw.schemaVersion === SCHEMA_VERSION ? raw : migrateSnapshot(raw);
  if (!v) return null;
  return {
    profile: v.profile,
    modules: v.modules,
    dfd: v.dfd,
    canvasModel: v.canvasModel || null,
    trustBoundaries: v.trustBoundaries,
    threats: v.threats,
    questionnaireAnswers: v.questionnaireAnswers,
    mitigations: v.mitigations,
    dfdMode: v.dfdMode || "auto",
    step: v.step || 1
  };
}

function migrateSnapshot(raw) {
  if (!raw.profile) return null;
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    dfdMode: raw.dfdMode || "auto",
    step: raw.step || 1,
    questionnaireAnswers: raw.questionnaireAnswers || {},
    mitigations: raw.mitigations && typeof raw.mitigations === "object" ? raw.mitigations : {},
    canvasModel: raw.canvasModel || null
  };
}

export function loadProjectSnapshot(projectId) {
  const data = localStorage.getItem(DATA_PREFIX + projectId);
  if (!data) return null;
  return hydrateFromSnapshot(safeParse(data, null));
}

export function saveProjectSnapshot(projectId, snapshot) {
  const name = snapshot.profile?.name?.trim() || "Untitled";
  const entry = {
    id: projectId,
    name,
    appStatus: snapshot.profile?.appStatus || "legacy",
    step: snapshot.step || 1,
    updatedAt: Date.now()
  };
  const index = readIndex().filter((e) => e.id !== projectId);
  index.push(entry);
  writeIndex(index);
  localStorage.setItem(DATA_PREFIX + projectId, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
}

export function deleteProject(projectId) {
  const index = readIndex().filter((e) => e.id !== projectId);
  writeIndex(index);
  localStorage.removeItem(DATA_PREFIX + projectId);
}

export function duplicateProject(projectId) {
  const snap = loadProjectSnapshot(projectId);
  if (!snap) return null;
  const newId = makeProjectId();
  const copy = buildSnapshot({
    ...snap,
    profile: { ...snap.profile, name: `${snap.profile.name || "Copy"} (copy)` },
    step: 1
  });
  saveProjectSnapshot(newId, copy);
  return newId;
}

export function makeProjectId() {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Default profile shape (matches wizard initial state). */
export function defaultProfileForProject() {
  return {
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
  };
}

export function createInitialSnapshot(createModuleFn) {
  return buildSnapshot({
    profile: defaultProfileForProject(),
    modules: [createModuleFn("m-1")],
    dfd: null,
    canvasModel: null,
    trustBoundaries: [],
    threats: [],
    questionnaireAnswers: {},
    mitigations: {},
    dfdMode: "auto",
    step: 1
  });
}

export function createBlankProject(createModuleFn) {
  const id = makeProjectId();
  saveProjectSnapshot(id, createInitialSnapshot(createModuleFn));
  return id;
}

export function exportProjectDownload(projectId) {
  const snap = localStorage.getItem(DATA_PREFIX + projectId);
  if (!snap) return;
  const blob = new Blob([snap], { type: "application/json;charset=utf-8" });
  const name = (safeParse(snap, {}).profile?.name || "threat-model").replace(/[^\w\-]+/g, "-");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${projectId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function clearAllProjects() {
  readIndex().forEach((e) => localStorage.removeItem(DATA_PREFIX + e.id));
  writeIndex([]);
}
