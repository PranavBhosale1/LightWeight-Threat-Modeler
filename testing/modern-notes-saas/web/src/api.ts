const BASE = import.meta.env.VITE_API_BASE ?? "";

let accessToken: string | null = null;

export function setAccessToken(t: string) {
  accessToken = t;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(`api_error_${res.status}`);
  return (await res.json()) as T;
}

export async function login(email: string, password: string) {
  const r = await api<{ access: string; refresh: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  setAccessToken(r.access);
  localStorage.setItem("refresh", r.refresh);
  return r;
}

export async function listNotes() {
  return api<Array<{ id: string; title: string; updated_at: string }>>("/api/notes");
}

export async function createNote(title: string, body: string) {
  return api<{ id: string }>("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title, body })
  });
}
