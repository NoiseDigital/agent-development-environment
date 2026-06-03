// Shared fetch wrapper for the platform's REST clients — typed JSON in/out
// with consistent error messages (FastAPI `detail` or our `error` field).
// Every call carries identity via `authHeaders()` (the auth seam) — empty today,
// a Bearer token once Firebase Auth is live.

import { authHeaders } from '../auth';

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || (data && typeof data === 'object' && data.error)) {
    const message = (data && (data.error || data.detail)) || `Request failed (${res.status})`;
    throw new Error(String(message));
  }
  return data as T;
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
