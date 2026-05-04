const GEMINI_KEY = "tm_gemini_api_key_v1";

export function getStoredGeminiApiKey() {
  try {
    return localStorage.getItem(GEMINI_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredGeminiApiKey(value) {
  try {
    if (value == null || value === "") localStorage.removeItem(GEMINI_KEY);
    else localStorage.setItem(GEMINI_KEY, value);
  } catch {
    /* ignore quota */
  }
}
