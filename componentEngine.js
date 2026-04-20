import componentLibrary from "./componentLibrary.json";

/**
 * The component library is the single source of truth for typed components.
 * Each entry contains detection hints (used by the classifier), default DFD
 * fields, a STRIDE threat list, and a security-requirements list.
 */
export const COMPONENT_LIBRARY = componentLibrary;

const COMPONENTS_BY_ID = new Map(componentLibrary.components.map((c) => [c.id, c]));

/** Look up a library entry by id. Returns null for "unknown" or unmapped ids. */
export function getComponent(id) {
  if (!id) return null;
  return COMPONENTS_BY_ID.get(id) || null;
}

/** All library ids (sorted by category, then label) for select menus. */
export function listComponentOptions() {
  return [...componentLibrary.components]
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.label.localeCompare(b.label))
    .map((c) => ({ id: c.id, label: c.label, category: c.category }));
}

/** Group components by category — useful for the stencil palette sidebar. */
export function componentsByCategory() {
  const groups = new Map();
  componentLibrary.components.forEach((c) => {
    const list = groups.get(c.category) || [];
    list.push(c);
    groups.set(c.category, list);
  });
  return [...groups.entries()].map(([category, items]) => ({
    category,
    items: items.sort((a, b) => a.label.localeCompare(b.label))
  }));
}

function instanceRequirementsFor(component, moduleId) {
  return (component.securityRequirements || []).map((req, i) => ({
    requirementId: req.id,
    instanceId: `${moduleId}::${req.id}::${i}`,
    title: req.title,
    description: req.description,
    controlFamily: req.controlFamily || "",
    status: req.defaultStatus || "open",
    jiraKey: ""
  }));
}

/**
 * Apply a library entry to a module: fill blank inputs/outputs/stores/entities
 * with the component defaults and (re-)attach its security requirements.
 *
 * Existing user-edited values are preserved. Existing security-requirement
 * entries that came from the same component are merged so user-set status /
 * jira keys survive a re-classify.
 */
export function injectFromLibrary(module) {
  const component = getComponent(module.componentType);
  if (!component) {
    return {
      ...module,
      securityRequirements: module.securityRequirements || []
    };
  }

  const next = { ...module };
  if (!next.inputs?.trim()) next.inputs = component.defaultInputs || "";
  if (!next.outputs?.trim()) next.outputs = component.defaultOutputs || "";
  if (!next.dataStores?.trim()) next.dataStores = component.defaultDataStores || "";
  if (!next.externalEntities?.trim()) next.externalEntities = component.defaultExternalEntities || "";

  const fresh = instanceRequirementsFor(component, module.id);
  const previous = module.securityRequirements || [];
  const previousByRequirementId = new Map(previous.map((r) => [r.requirementId, r]));
  next.securityRequirements = fresh.map((r) => {
    const prior = previousByRequirementId.get(r.requirementId);
    if (!prior) return r;
    return {
      ...r,
      status: prior.status || r.status,
      jiraKey: prior.jiraKey || r.jiraKey
    };
  });

  return next;
}

/**
 * Produce STRIDE threats for one module from its component library entry.
 * Threats are shaped to match the existing `threats[]` schema in
 * ThreatModeler.jsx so Step 5 (DREAD) and Step 6 (report) work unchanged.
 *
 * `idFactory` should be the same one used by manual / Gemini threats so IDs
 * remain unique and monotonic.
 *
 * `strideMeta` is passed in so we don't need to duplicate the STRIDE table.
 *
 * `dreadDefaults` is the default DREAD scores object.
 */
export function expandThreatsForModule({ module, idFactory, strideMeta, dreadDefaults }) {
  const component = getComponent(module.componentType);
  if (!component) return [];

  return (component.threats || []).map((t) => {
    const stride = strideMeta(t.stride);
    return {
      id: idFactory(),
      moduleId: module.id,
      moduleName: module.name || component.label,
      strideCategory: t.stride,
      strideName: stride.name,
      title: `${t.title} (${component.label})`,
      description: t.attackVector || "",
      attackVector: t.attackVector || "",
      status: "review",
      source: "library",
      sourceKey: `library::${module.id}::${t.id}`,
      libraryComponentId: component.id,
      libraryThreatId: t.id,
      defaultSeverity: t.defaultSeverity || "Medium",
      dreadScores: { ...dreadDefaults }
    };
  });
}

/**
 * Replace any prior library-derived threats for the given modules with a fresh
 * expansion. Manual / questionnaire / gemini threats are preserved.
 */
export function reseedLibraryThreats({ existingThreats, modules, idFactory, strideMeta, dreadDefaults }) {
  const preserved = existingThreats.filter((t) => t.source !== "library");
  const fresh = modules.flatMap((m) => expandThreatsForModule({ module: m, idFactory, strideMeta, dreadDefaults }));
  return [...preserved, ...fresh];
}
