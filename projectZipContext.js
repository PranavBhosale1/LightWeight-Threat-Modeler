import JSZip from "jszip";

const SKIP_DIR = new Set([
  "node_modules", ".git", ".svn", "dist", "build", "out", "target", "__pycache__",
  ".venv", "venv", "vendor", ".next", "coverage", ".turbo", ".nuxt", "Pods",
  "bin", "obj", ".gradle", "site-packages"
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".tar", ".gz",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".wasm", ".exe", ".dll",
  ".so", ".dylib", ".class", ".jar", ".pyc", ".o", ".a", ".bin", ".dat", ".sqlite",
  ".db", ".node"
]);

const INTEREST_NAMES = new Set([
  "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock",
  "requirements.txt", "pyproject.toml", "poetry.lock", "pipfile", "pipfile.lock",
  "go.mod", "go.sum", "cargo.toml", "cargo.lock",
  "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle",
  "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml",
  "makefile", "gemfile", "composer.json",
  "tsconfig.json", "jsconfig.json", "vite.config.ts", "vite.config.js",
  "next.config.js", "next.config.mjs", "angular.json", "nuxt.config.ts",
  "appsettings.json", "web.config", "serverless.yml", "terraform.tf",
  "chart.yaml", "values.yaml", ".env.example"
]);

const MAX_ZIP_BYTES = 48 * 1024 * 1024;
const MAX_TREE_PATHS = 900;
const MAX_SNIPPET_FILES = 28;
const MAX_PER_FILE = 14_000;
const MAX_TOTAL_OUTPUT = 110_000;

function shouldSkipPath(path) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.some((p) => SKIP_DIR.has(p.toLowerCase()));
}

function baseName(path) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

function extOf(path) {
  const b = baseName(path);
  const i = b.lastIndexOf(".");
  return i >= 0 ? b.slice(i).toLowerCase() : "";
}

function isReadme(path) {
  const b = baseName(path).toLowerCase();
  return b === "readme" || (b.startsWith("readme.") && (b.endsWith(".md") || b.endsWith(".txt") || b.endsWith(".rst")));
}

function isInterestFile(path) {
  const b = baseName(path).toLowerCase();
  if (INTEREST_NAMES.has(b)) return true;
  if (isReadme(path)) return true;
  return false;
}

function interestRank(path) {
  const b = baseName(path).toLowerCase();
  if (b === "package.json" || b === "pyproject.toml" || b === "go.mod" || b === "pom.xml") return 0;
  if (b.startsWith("readme")) return 1;
  if (INTEREST_NAMES.has(b)) return 2;
  return 3;
}

function isProbablyText(str) {
  if (!str.length) return true;
  let bad = 0;
  const n = Math.min(str.length, 2000);
  for (let i = 0; i < n; i++) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 65533) bad++;
  }
  return bad / n < 0.02;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ text: string, meta: { pathCount: number, snippetCount: number, bytesInZip: number, truncated: boolean } }>}
 */
export async function extractProjectZipContext(arrayBuffer) {
  if (arrayBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`ZIP is too large (max ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))} MB).`);
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries = [];

  zip.forEach((relPath, file) => {
    if (file.dir) return;
    const normalized = relPath.replace(/\\/g, "/");
    if (shouldSkipPath(normalized)) return;
    entries.push({ path: normalized, file });
  });

  entries.sort((a, b) => a.path.localeCompare(b.path));

  const pathCount = entries.length;
  const treeList = entries.slice(0, MAX_TREE_PATHS).map((e) => e.path);
  let treeSection = `=== FILE INDEX (${treeList.length} of ${pathCount} paths) ===\n${treeList.join("\n")}`;
  if (pathCount > MAX_TREE_PATHS) {
    treeSection += `\n... ${pathCount - MAX_TREE_PATHS} more paths omitted`;
  }

  const manifestCandidates = entries
    .filter((e) => isInterestFile(e.path) && !BINARY_EXT.has(extOf(e.path)))
    .sort((a, b) => {
      const d = interestRank(a.path) - interestRank(b.path);
      return d !== 0 ? d : a.path.localeCompare(b.path);
    })
    .slice(0, MAX_SNIPPET_FILES);

  const snippets = [];
  let totalLen = treeSection.length;
  let truncated = false;

  for (const { path, file } of manifestCandidates) {
    try {
      const raw = await file.async("uint8array");
      if (raw.length > 500_000) continue;

      const text = new TextDecoder("utf-8", { fatal: false }).decode(raw);
      if (!isProbablyText(text)) continue;

      let body = text.length > MAX_PER_FILE ? `${text.slice(0, MAX_PER_FILE)}\n[... truncated ...]` : text;
      const block = `=== FILE: ${path} ===\n${body}`;

      if (totalLen + block.length + 80 > MAX_TOTAL_OUTPUT) {
        const room = MAX_TOTAL_OUTPUT - totalLen - 120;
        if (room < 400) {
          truncated = true;
          break;
        }
        body = body.slice(0, room) + "\n[... truncated to fit context budget ...]";
      }

      snippets.push(`=== FILE: ${path} ===\n${body}`);
      totalLen += `=== FILE: ${path} ===\n${body}`.length + 2;
    } catch {
      /* skip */
    }
  }

  let combined = `${treeSection}\n\n=== MANIFEST / README EXTRACTS (${snippets.length} files) ===\n\n${snippets.join("\n\n")}`;
  if (combined.length > MAX_TOTAL_OUTPUT) {
    combined = combined.slice(0, MAX_TOTAL_OUTPUT) + `\n\n[... overall context truncated at ${MAX_TOTAL_OUTPUT} characters ...]`;
    truncated = true;
  }

  return {
    text: combined,
    meta: {
      pathCount,
      snippetCount: snippets.length,
      bytesInZip: arrayBuffer.byteLength,
      truncated
    }
  };
}
