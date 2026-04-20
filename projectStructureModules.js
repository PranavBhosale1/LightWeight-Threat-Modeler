import JSZip from "jszip";

const MAX_ZIP_BYTES = 48 * 1024 * 1024;
const MAX_MODULES = 28;

const SKIP_DIR = new Set([
  "node_modules", ".git", ".svn", "dist", "build", "out", "target", "__pycache__",
  ".venv", "venv", "vendor", ".next", "coverage", ".turbo", ".nuxt", "Pods",
  "bin", "obj", ".gradle", "site-packages"
]);

const SRC_SKIP = new Set([
  "__tests__", "__mocks__", "test", "tests", "testing", "fixtures", "e2e",
  "styles", "assets", "fonts", "icons", "img", "images", "public", "static"
]);

export function shouldSkipPath(path) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((p) => SKIP_DIR.has(p.toLowerCase()));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** If the zip has a single top-level folder (e.g. GitHub export), strip it for resolution. */
export function stripZipRoot(paths) {
  const normalized = paths.map((p) => p.replace(/\\/g, "/"));
  const hasRootPkg = normalized.includes("package.json");
  if (hasRootPkg) return { prefix: "", paths: normalized };

  const first = normalized[0];
  if (!first) return { prefix: "", paths: normalized };
  const seg = first.split("/")[0];
  if (!seg) return { prefix: "", paths: normalized };
  const innerPkg = `${seg}/package.json`;
  if (normalized.includes(innerPkg) && normalized.every((p) => p === seg || p.startsWith(`${seg}/`))) {
    const prefix = `${seg}/`;
    return {
      prefix,
      paths: normalized.map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p))
    };
  }
  return { prefix: "", paths: normalized };
}

function globMatch(glob, dirPath) {
  const g = glob.replace(/\\/g, "/").replace(/\/$/, "");
  if (!g.includes("*")) {
    return dirPath === g || dirPath.startsWith(`${g}/`);
  }
  if (g.endsWith("/**")) {
    const base = g.slice(0, -3);
    return dirPath === base || dirPath.startsWith(`${base}/`);
  }
  if (g.endsWith("/*")) {
    const base = g.slice(0, -2);
    if (!dirPath.startsWith(`${base}/`)) return false;
    const rest = dirPath.slice(base.length + 1);
    return rest.length > 0 && !rest.includes("/");
  }
  const re = new RegExp(`^${g.split("*").map(escapeRegex).join("[^/]*")}$`);
  return re.test(dirPath);
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function unique(arr) {
  return [...new Set(arr)];
}

async function readUtf8(zip, relPath) {
  const f = zip.file(relPath);
  if (!f || f.dir) return null;
  try {
    return await f.async("string");
  } catch {
    return null;
  }
}

function packageJsonDirs(allPaths) {
  return allPaths
    .filter((p) => p.endsWith("/package.json") || p === "package.json")
    .map((p) => (p === "package.json" ? "" : p.replace(/\/package\.json$/, "")))
    .filter((d) => !shouldSkipPath(d + "/x"));
}

function collectWorkspaceGlobs(pkg) {
  if (!pkg || typeof pkg !== "object") return [];
  const ws = pkg.workspaces;
  if (!ws) return [];
  if (Array.isArray(ws)) return ws.map(String);
  if (typeof ws === "object" && Array.isArray(ws.packages)) return ws.packages.map(String);
  return [];
}

async function readPnpmWorkspaces(zip, prefix) {
  const text = await readUtf8(zip, `${prefix}pnpm-workspace.yaml`);
  if (!text) return [];
  const lines = text.split("\n");
  const out = [];
  let inPackages = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("packages:")) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (t && !t.startsWith("-") && !t.startsWith("#") && /^\w[\w-]*:/.test(t)) {
        break;
      }
      const m = t.match(/^-\s*['"]?([^'"]+)['"]?/);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}

async function readLernaPackages(zip, prefix) {
  const text = await readUtf8(zip, `${prefix}lerna.json`);
  if (!text) return [];
  const j = parseJsonSafe(text);
  if (!j || !Array.isArray(j.packages)) return [];
  return j.packages.map(String);
}

async function mavenModulesFromPom(zip, prefix) {
  const text = await readUtf8(zip, `${prefix}pom.xml`);
  if (!text) return [];
  const mods = [];
  const re = /<module>\s*([^<]+?)\s*<\/module>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    mods.push(m[1].trim().replace(/^\/+|\/+$/g, ""));
  }
  return mods;
}

async function goWorkModules(zip, prefix) {
  const text = await readUtf8(zip, `${prefix}go.work`);
  if (!text) return [];
  const useBlock = text.match(/use\s*\(([\s\S]*?)\)/);
  if (!useBlock) return [];
  return useBlock[1]
    .split("\n")
    .map((l) => l.trim().replace(/\/$/, ""))
    .filter((l) => l && !l.startsWith("//"))
    .map((l) => l.replace(/^\.\//, ""));
}

function pySrcPackages(allPaths) {
  const roots = new Set();
  for (const p of allPaths) {
    const m = p.match(/^src\/([^/]+)\//);
    if (m && !SRC_SKIP.has(m[1].toLowerCase())) roots.add(m[1]);
  }
  if (roots.size) return [...roots].sort();
  return [];
}

function topLevelDirs(allPaths, prefix) {
  const dirs = new Set();
  const pre = prefix || "";
  for (const p of allPaths) {
    const rel = pre && p.startsWith(pre) ? p.slice(pre.length) : p;
    const seg = rel.split("/")[0];
    if (seg && !seg.startsWith(".") && !SKIP_DIR.has(seg.toLowerCase())) dirs.add(seg);
  }
  return [...dirs].sort();
}

function dirsUnder(allPaths, base) {
  const b = base.replace(/\/$/, "");
  const out = new Set();
  const prefix = b ? `${b}/` : "";
  for (const p of allPaths) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const first = rest.split("/")[0];
    if (first && !first.startsWith(".")) out.add(first);
  }
  return [...out].sort();
}

function srcSubmodules(allPaths) {
  const base = "src";
  if (!allPaths.some((p) => p === base || p.startsWith(`${base}/`))) return [];
  const kids = dirsUnder(allPaths, base);
  return kids.filter((k) => !SRC_SKIP.has(k.toLowerCase())).slice(0, 20);
}

function appsOrServicesDirs(allPaths, folder) {
  if (!allPaths.some((p) => p.startsWith(`${folder}/`))) return [];
  return dirsUnder(allPaths, folder).slice(0, 24);
}

/**
 * Deterministic modules from archive layout + manifests (not LLM).
 * @returns {Promise<{ modules: Array<{id:string,parentId:string,name:string,inputs:string,outputs:string,dataStores:string,externalEntities:string}>, meta: { source: string, detail: string, prefix: string } }>}
 */
export async function extractStructuralModulesFromZip(arrayBuffer) {
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

  const names = [];
  const seen = new Set();

  const pushName = (name, source) => {
    const n = String(name || "").trim();
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    names.push({ name: n, source });
  };

  const maven = await mavenModulesFromPom(zip, prefix);
  if (maven.length) {
    maven.forEach((m) => pushName(m.replace(/[/\\]/g, " · "), "Maven <modules>"));
  }

  if (!names.length) {
    const gomods = await goWorkModules(zip, prefix);
    if (gomods.length) {
      gomods.forEach((m) => pushName(m.split("/").pop() || m, "go.work"));
    }
  }

  const pkgDirs = packageJsonDirs(paths);
  const rootPkgText = await readUtf8(zip, `${prefix}package.json`);
  const rootPkg = rootPkgText ? parseJsonSafe(rootPkgText) : null;

  const pnpmGlobs = await readPnpmWorkspaces(zip, prefix);
  const lernaGlobs = await readLernaPackages(zip, prefix);
  const wsGlobs = unique([...collectWorkspaceGlobs(rootPkg), ...pnpmGlobs, ...lernaGlobs]);

  if (!names.length && wsGlobs.length && pkgDirs.length) {
    for (const dir of pkgDirs) {
      if (!dir) continue;
      const matched = wsGlobs.some((g) => globMatch(g, dir));
      if (matched) {
        const pj = await readUtf8(zip, `${prefix}${dir}/package.json`);
        const p = pj ? parseJsonSafe(pj) : null;
        const nm = (p && p.name && String(p.name).trim()) || dir.split("/").pop();
        pushName(nm, "npm/pnpm workspace");
      }
    }
  }

  if (!names.length && pkgDirs.length > 1) {
    const nested = pkgDirs.filter((d) => d);
    if (nested.length) {
      const underPkgs = nested.filter((d) => d.startsWith("packages/") || d.startsWith("apps/") || d.startsWith("services/"));
      const pick = underPkgs.length ? underPkgs : nested;
      for (const dir of pick.slice(0, MAX_MODULES)) {
        const pj = await readUtf8(zip, `${prefix}${dir}/package.json`);
        const p = pj ? parseJsonSafe(pj) : null;
        const nm = (p && p.name && String(p.name).trim()) || dir.split("/").pop();
        pushName(nm, "package.json tree");
      }
    }
  }

  if (!names.length) {
    const hasPy = paths.some((p) => p === "pyproject.toml" || p.endsWith("/pyproject.toml"));
    if (hasPy) {
      const pkgs = pySrcPackages(paths);
      if (pkgs.length) pkgs.forEach((p) => pushName(p, "Python src layout"));
    }
  }

  if (!names.length) {
    for (const folder of ["apps", "services", "packages"]) {
      const d = appsOrServicesDirs(paths, folder);
      if (d.length) {
        d.forEach((x) => pushName(x, `${folder}/`));
        break;
      }
    }
  }

  if (!names.length) {
    const sub = srcSubmodules(paths);
    if (sub.length > 1) sub.forEach((s) => pushName(s, "src/"));
    else if (sub.length === 1) pushName(sub[0], "src/");
  }

  if (!names.length) {
    const singleRoot = pkgDirs.includes("");
    if (singleRoot) {
      const sub = srcSubmodules(paths);
      if (sub.length) sub.forEach((s) => pushName(s, "single package · src/"));
      else pushName(rootPkg?.name?.replace(/^@.+\//, "") || "Application", "root package.json");
    }
  }

  if (!names.length) {
    const tls = topLevelDirs(paths).filter((d) => !["src", "test", "tests", "docs", "scripts", ".github"].includes(d.toLowerCase()));
    if (tls.length > 1 && tls.length <= 12) tls.forEach((t) => pushName(t, "top-level folders"));
  }

  if (!names.length) {
    pushName("Application", "fallback");
  }

  const sliced = names.slice(0, MAX_MODULES);
  const base = Date.now();
  const modules = sliced.map((item, i) => ({
    id: `m-${base}-${i}`,
    parentId: "",
    name: item.name,
    inputs: "",
    outputs: "",
    dataStores: "",
    externalEntities: ""
  }));

  const sourceSummary = sliced.map((s) => s.source).reduce((a, s) => {
    a[s] = (a[s] || 0) + 1;
    return a;
  }, {});
  const detail = Object.entries(sourceSummary)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

  return {
    modules,
    meta: {
      source: "structure",
      detail,
      prefix: prefix || "(archive root)",
      count: modules.length
    }
  };
}
