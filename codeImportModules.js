import JSZip from "jszip";
import { stripZipRoot, shouldSkipPath } from "./projectStructureModules.js";

const MAX_ZIP_BYTES = 48 * 1024 * 1024;
/** Exported for UI copy — keep in sync with scan limit. */
export const MAX_FILES_TO_SCAN = 180;
const MAX_FILE_BYTES = 120_000;
const MAX_MODULES = 28;

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
const TEST_PATH_RE = /(\.|\/)(test|spec|stories|__tests__|__mocks__)(\.|\/)/i;

/** Extract bare import specifiers from JS/TS-ish source (no full AST; covers common cases). */
export function extractImportSpecifiers(source) {
  const out = new Set();
  if (!source || typeof source !== "string") return out;

  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) {
      const s = m[1].trim();
      if (s) out.add(s);
    }
  }
  return out;
}

function isRelative(spec) {
  return spec.startsWith(".") || spec.startsWith("/");
}

/** npm package name for external specifiers (react, lodash, @scope/pkg). */
function npmPackageName(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  }
  return spec.split("/")[0] || spec;
}

function dirnameOf(path) {
  const p = path.replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i <= 0 ? "" : p.slice(0, i);
}

function normalizePath(baseDir, rel) {
  const parts = [];
  if (baseDir) parts.push(...baseDir.split("/").filter(Boolean));
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function resolveImportToPath(fromFile, spec) {
  if (!isRelative(spec)) return null;
  const dir = dirnameOf(fromFile);
  const cleaned = spec.replace(/^\.\//, "./").replace(/^\/+/, "");
  return normalizePath(dir, cleaned);
}

/** Cluster key: workspace package, apps/*, or src/* segment. */
export function clusterKeyForPath(relPath) {
  const p = relPath.replace(/\\/g, "/");
  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "packages" && parts[1]) return `packages/${parts[1]}`;
  if (parts[0] === "apps" && parts[1]) return `apps/${parts[1]}`;
  if (parts[0] === "services" && parts[1]) return `services/${parts[1]}`;
  if (parts[0] === "src" && parts[1]) return `src/${parts[1]}`;
  if (parts[0] === "app" && parts[1]) return `app/${parts[1]}`;
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  if (parts.length === 1) return parts[0];
  return "project";
}

function zipKey(prefix, relPath) {
  return prefix ? `${prefix}${relPath}` : relPath;
}

async function readPackageName(zip, prefix, clusterDir) {
  const pj = zipKey(prefix, `${clusterDir}/package.json`);
  const f = zip.file(pj);
  if (!f || f.dir) return null;
  try {
    const t = await f.async("string");
    const j = JSON.parse(t);
    return (j.name && String(j.name).trim()) || null;
  } catch {
    return null;
  }
}

/**
 * Build modules by parsing JS/TS import statements in the ZIP and clustering by folder/package.
 * @returns {Promise<{ modules: Array, meta: { filesScanned: number, clusters: number, detail: string } }>}
 */
export async function extractModulesFromCodeImports(arrayBuffer) {
  if (arrayBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`ZIP is too large (max ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))} MB).`);
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const rawPaths = [];
  zip.forEach((relPath, file) => {
    if (file.dir) return;
    const n = relPath.replace(/\\/g, "/");
    if (!shouldSkipPath(n)) rawPaths.push(n);
  });

  const { prefix, paths } = stripZipRoot(rawPaths);

  const codePaths = paths
    .filter((p) => CODE_EXT.test(p) && !TEST_PATH_RE.test(p))
    .sort();

  const toScan = codePaths.slice(0, MAX_FILES_TO_SCAN);

  /** @type {Map<string, { externals: Set<string>, internalEdges: Set<string>, fileCount: number }>} */
  const clusters = new Map();

  const getCluster = (key) => {
    let c = clusters.get(key);
    if (!c) {
      c = { externals: new Set(), internalEdges: new Set(), fileCount: 0 };
      clusters.set(key, c);
    }
    return c;
  };

  let scanned = 0;
  for (const relPath of toScan) {
    const f = zip.file(zipKey(prefix, relPath));
    if (!f || f.dir) continue;
    let text;
    try {
      const buf = await f.async("uint8array");
      if (buf.length > MAX_FILE_BYTES) continue;
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } catch {
      continue;
    }

    scanned += 1;
    const fromCluster = clusterKeyForPath(relPath);
    const c = getCluster(fromCluster);
    c.fileCount += 1;

    const specs = extractImportSpecifiers(text);
    for (let spec of specs) {
      const q = spec.indexOf("?");
      if (q >= 0) spec = spec.slice(0, q);
      spec = spec.trim();
      if (!spec) continue;
      if (spec.startsWith("node:")) continue;

      if (isRelative(spec)) {
        const target = resolveImportToPath(relPath, spec);
        if (!target) continue;
        const toCluster = clusterKeyForPath(target);
        if (toCluster !== fromCluster) c.internalEdges.add(toCluster);
        continue;
      }

      if (spec.startsWith("@/") || spec.startsWith("~/")) continue;

      c.externals.add(npmPackageName(spec));
    }
  }

  if (!clusters.size) {
    throw new Error("No JavaScript/TypeScript files found to analyze (looked for .ts, .tsx, .js, .jsx under the archive).");
  }

  const sortedKeys = [...clusters.keys()].sort((a, b) => {
    const ca = clusters.get(a);
    const cb = clusters.get(b);
    return cb.fileCount - ca.fileCount || a.localeCompare(b);
  });

  const base = Date.now();
  const modules = [];
  let idx = 0;

  for (const key of sortedKeys.slice(0, MAX_MODULES)) {
    const data = clusters.get(key);
    const pkgName = await readPackageName(zip, prefix, key);
    const label = pkgName || key.split("/").pop() || key;

    const ext = [...data.externals].sort().join(", ");
    const internal = [...data.internalEdges].sort().join(", ");

    modules.push({
      id: `m-${base}-${idx}`,
      parentId: "",
      name: label,
      inputs: ext || "(no external npm imports detected)",
      outputs: internal ? `internal: ${internal}` : "",
      dataStores: "",
      externalEntities: ext
    });
    idx += 1;
  }

  const meta = {
    filesScanned: scanned,
    clusters: clusters.size,
    detail: `${scanned} files · ${clusters.size} clusters (import parsing)`,
    prefix: prefix || "(archive root)"
  };

  return { modules, meta };
}
