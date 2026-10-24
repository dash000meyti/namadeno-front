/**
 * Thin fetch wrapper for the Namadno REST API.
 * Base URL: NEXT_PUBLIC_API_BASE_URL (default /api/v1). During development the
 * requests are answered by MSW (src/mocks); in production they hit the backend.
 */
import type { ApiError, Role, Session } from '@/types/domain';

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const TOKEN_KEYS: Record<Role, string> = { employee: 'nm-session', org_admin: 'nm-session-org', operator: 'nm-session-op' };

function roleForPath(path: string): Role {
  if (path.startsWith('/org/')) return 'org_admin';
  if (path.startsWith('/op/')) return 'operator';
  return 'employee';
}

export function getSession(role: Role): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEYS[role]);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}

export function setSession(s: Session | null, role: Role = s?.role ?? 'employee') {
  try {
    if (s) localStorage.setItem(TOKEN_KEYS[role], JSON.stringify(s));
    else localStorage.removeItem(TOKEN_KEYS[role]);
  } catch { /* ignore */ }
}

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, err: ApiError) {
    super(err.message);
    this.status = status;
    this.code = err.code;
    this.details = err.details;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

declare global {
  interface Window {
    /**
     * Mock mode only (set by src/mocks/browser.ts; absent with the real backend). Re-registers this tab with
     * the mock Service Worker after the browser stopped an idle worker — otherwise requests fall through to
     * the dev server and come back as an HTML 404.
     */
    __nmMockHeal?: () => Promise<boolean>;
  }
}

export async function api<T>(path: string, opts: { method?: Method; body?: unknown; query?: Record<string, string | number | undefined | null> } = {}): Promise<T> {
  const url = new URL(API_BASE + path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  const session = getSession(roleForPath(path));
  const send = () => fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let res = await send();
  // mock mode: a non-JSON 404 means the request slipped past the mock worker → re-attach and retry once
  if (res.status === 404 && typeof window !== 'undefined' && window.__nmMockHeal && !(res.headers.get('content-type') ?? '').includes('json')) {
    if (await window.__nmMockHeal()) res = await send();
  }
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) throw new ApiRequestError(res.status, (data as ApiError) ?? { code: 'http_' + res.status, message: 'خطا در ارتباط با سرور' });
  return data as T;
}

export const get = <T,>(path: string, query?: Record<string, string | number | undefined | null>) => api<T>(path, { query });
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: body ?? {} });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
