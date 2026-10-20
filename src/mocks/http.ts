/** Helpers shared by MSW handlers. */
import { HttpResponse, delay } from 'msw';
import { db, save, DEMO_USER_ID, DEMO_ORG_ID, DEMO_ORG_ADMIN_ID, DEMO_OPERATOR_ID } from './db';
import type { ApiError } from '@/types/domain';

export const API = (process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1').replace(/\/$/, '');
/** Builds a full mock path: p('/me') → '/api/v1/me' (MSW also matches absolute URLs by path). */
export const p = (path: string) => `*${API}${path}`;

export async function latency() {
  const ms = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY ?? 250);
  if (ms > 0) await delay(ms);
}

export function ok<T>(data: T, init?: ResponseInit) {
  save();
  return HttpResponse.json(data as never, init);
}

export function fail(status: number, code: string, message: string, details?: Record<string, unknown>) {
  const body: ApiError = { code, message, details };
  return HttpResponse.json(body as never, { status });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/**
 * Identity of the caller. Uses the bearer token from a mock login; when there is
 * no token (pages opened directly) it falls back to the demo identity of that surface
 * so every screen works stand-alone.
 */
export function who(req: Request, surface: 'employee' | 'org_admin' | 'operator' = 'employee') {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const s = token ? db().sessions[token] : undefined;
  if (s && s.role === surface) return s;
  if (surface === 'org_admin') return { role: surface, userId: DEMO_ORG_ADMIN_ID, orgId: DEMO_ORG_ID };
  if (surface === 'operator') return { role: surface, userId: DEMO_OPERATOR_ID };
  return { role: surface, userId: DEMO_USER_ID, orgId: DEMO_ORG_ID };
}

export const qs = (req: Request) => new URL(req.url).searchParams;
