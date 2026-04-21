import { jsonrepair } from "jsonrepair";

function stripMarkdownFences(text) {
  return String(text || "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

/**
 * If the model adds prose before/after JSON, take the first top-level `{...}` or `[...]`
 * using bracket depth (respects strings and escapes).
 */
export function extractFirstJsonValue(text) {
  const s = stripMarkdownFences(text);
  const startObj = s.indexOf("{");
  const startArr = s.indexOf("[");
  let start = -1;
  if (startArr === -1 && startObj === -1) return s;
  if (startArr === -1) start = startObj;
  else if (startObj === -1) start = startArr;
  else start = Math.min(startObj, startArr);

  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s;
}

/**
 * Parse JSON from Gemini output: strip fences, try direct parse, bounded extract, then jsonrepair.
 */
export function parseGeminiJson(text) {
  const stripped = stripMarkdownFences(text);
  const extracted = extractFirstJsonValue(text);

  const attempts = [stripped, extracted].filter((s, i, a) => s && a.indexOf(s) === i);

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      /* try next */
    }
  }

  throw new Error("Could not parse JSON from model output");
}
