import { COMPONENT_LIBRARY, getComponent } from "./componentEngine.js";

/**
 * Lightweight, deterministic classifier that maps a module to a library
 * componentType using detection hints (dependency names, file regex,
 * env-key prefixes, module-name keywords).
 *
 * Inputs we have to work with for a typical module produced by
 * extractStructuralModulesFromZip / extractModulesFromCodeImports:
 *   - name (folder/package name)
 *   - inputs (CSV of external npm package names — code-import path only)
 *   - outputs (CSV of internal cross-cluster edges — informational)
 *   - externalEntities (CSV — usually mirrors inputs for code-import path)
 * And optionally the broader ZIP-derived context text (file index + manifests)
 * which lets us detect file-regex / env-key hints.
 */

function tokensOf(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s,;/_\-\.]+/)
    .filter(Boolean);
}

function depsOf(module) {
  const fromInputs = String(module.inputs || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const fromExternal = String(module.externalEntities || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...fromInputs, ...fromExternal]);
}

function makeRegexes(patterns) {
  const out = [];
  (patterns || []).forEach((p) => {
    try {
      out.push(new RegExp(p, "i"));
    } catch {
      /* ignore bad pattern */
    }
  });
  return out;
}

function scoreComponentForModule(component, module, ctx) {
  const hints = component.detectionHints || {};
  let score = 0;
  const reasons = [];

  const nameTokens = new Set(tokensOf(module.name));
  (hints.nameKeywords || []).forEach((kw) => {
    if (nameTokens.has(String(kw).toLowerCase())) {
      score += 3;
      reasons.push(`name token "${kw}"`);
    }
  });

  const deps = depsOf(module);
  (hints.depNames || []).forEach((dep) => {
    const d = String(dep).toLowerCase();
    if (deps.has(d)) {
      score += 4;
      reasons.push(`dep "${dep}"`);
    } else {
      for (const cand of deps) {
        if (cand && (cand === d || cand.startsWith(`${d}/`) || cand.endsWith(`/${d}`))) {
          score += 3;
          reasons.push(`dep ~ "${dep}"`);
          break;
        }
      }
    }
  });

  if (ctx.text) {
    const fileRegexes = makeRegexes(hints.fileRegex);
    fileRegexes.forEach((re) => {
      if (re.test(ctx.text)) {
        score += 2;
        reasons.push(`file matches ${re}`);
      }
    });

    (hints.envKeys || []).forEach((env) => {
      const re = new RegExp(`\\b${env.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i");
      if (re.test(ctx.text)) {
        score += 2;
        reasons.push(`env "${env}"`);
      }
    });
  }

  return { score, reasons };
}

/**
 * Classify a single module deterministically.
 * Returns { componentType, confidence, reasons } where componentType is "" if
 * no rule matched with sufficient confidence.
 */
export function classifyModuleByRules(module, ctx = {}) {
  let best = { componentType: "", confidence: 0, reasons: [] };

  COMPONENT_LIBRARY.components.forEach((component) => {
    const { score, reasons } = scoreComponentForModule(component, module, ctx);
    if (score > best.confidence) {
      best = { componentType: component.id, confidence: score, reasons };
    }
  });

  if (best.confidence < 3) return { componentType: "", confidence: 0, reasons: [] };
  return best;
}

/**
 * Classify a list of modules. Returns the same list with `componentType` and
 * `componentTypeSource` filled in for any module the rules confidently match.
 * Modules with an existing componentType are left alone (so user overrides win).
 */
export function classifyModulesByRules(modules, ctx = {}) {
  return modules.map((module) => {
    if (module.componentType) return module;
    const result = classifyModuleByRules(module, ctx);
    if (!result.componentType) return module;
    return {
      ...module,
      componentType: result.componentType,
      componentTypeSource: "classifier-rule"
    };
  });
}

/**
 * Modules that the rules couldn't classify — useful for batching the AI
 * fallback (see classifyModulesWithAi).
 */
export function unresolvedModules(modules) {
  return modules.filter((m) => !m.componentType);
}

/**
 * Build a one-shot Gemini prompt that classifies a batch of unresolved
 * modules into library ids. The caller passes a `gemini` async function so
 * we don't need to reach into the host file's HTTP layer.
 *
 * Returns a Map<moduleId, componentType> with only the entries the model
 * confidently matched. Entries it returns as "unknown" or that don't match a
 * known library id are dropped.
 */
export async function classifyModulesWithAi({ gemini, apiKey, modules, libraryIds }) {
  if (!apiKey) throw new Error("Add a Gemini API key to use AI classification.");
  if (!modules.length) return new Map();

  const ids = libraryIds && libraryIds.length ? libraryIds : COMPONENT_LIBRARY.components.map((c) => c.id);
  const summary = modules.map((m) => ({
    id: m.id,
    name: m.name,
    inputs: m.inputs,
    outputs: m.outputs,
    externalEntities: m.externalEntities
  }));

  const text = await gemini(apiKey, `You are a security architect classifying application modules into a fixed taxonomy.

The taxonomy ids (use exactly these strings, do not invent new ones):
${ids.join(", ")}

For each module below decide which taxonomy id best describes it, or use "unknown" if none clearly fit.

Return ONLY valid JSON (no markdown), shaped as:
{"<moduleId>": "<taxonomyId or unknown>", ...}

Modules:
${JSON.stringify(summary, null, 2)}`);

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch {
    return new Map();
  }

  const out = new Map();
  Object.entries(parsed || {}).forEach(([moduleId, componentType]) => {
    if (!componentType || componentType === "unknown") return;
    if (!getComponent(componentType)) return;
    out.set(moduleId, componentType);
  });
  return out;
}
