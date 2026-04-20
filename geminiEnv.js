/**
 * Default Gemini API key from Vite (`VITE_GEMINI_API_KEY` in `.env`).
 * Calls still run in the browser; this only avoids pasting the key each session.
 */
export const DEFAULT_GEMINI_API_KEY = String(import.meta.env.VITE_GEMINI_API_KEY ?? "").trim();
