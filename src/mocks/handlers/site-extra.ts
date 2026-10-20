/**
 * Additional mock endpoints owned by the "site" area. Registered before the core handlers (can override).
 *
 * GET  /api/v1/public/stats
 *      → { organizations: number; employees: number; aum: number (Toman); funds: number }
 *      Public headline numbers for the landing page (active organizations, active employees,
 *      total AUM of the group's funds, number of active funds).
 *
 * GET  /api/v1/public/credit-products
 *      → { id, kind: 'loan'|'card_credit'|'installment', name, rateMin, rateMax, maxPctOfAssets, monthsOptions }[]
 *      Active credit products (public subset of the operator's product catalogue).
 *
 * POST /api/v1/public/contact            (overrides the core handler; same response shape)
 *      body  { name: string; phone: string; company?: string; email?: string; topic?: 'contact'|'demo'|'support'|'careers'; employees?: string; message?: string }
 *      → 200 { ok: true; ticket: string }   ticket = 'CT-xxxx' (contact) | 'DM-xxxx' (demo)
 *      → 422 { code: 'missing_fields' | 'invalid_phone' | 'invalid_email' | 'missing_company', message, details: { field } }
 */
import { http } from 'msw';
import type { HttpHandler } from 'msw';
import { enDigits } from '@/lib/format';
import { db } from '../db';
import { body, fail, latency, ok, p } from '../http';

interface ContactBody { name?: string; phone?: string; company?: string; email?: string; topic?: string; employees?: string; message?: string }

export const siteHandlers: HttpHandler[] = [
  http.get(p('/public/stats'), async () => {
    await latency();
    const d = db();
    const active = d.organizations.filter((o) => o.status === 'active');
    return ok({
      organizations: active.length,
      employees: active.reduce((s, o) => s + (o.activeEmployees || 0), 0),
      aum: d.funds.reduce((s, f) => s + (f.aum || 0), 0),
      funds: d.funds.filter((f) => f.status === 'active').length,
    });
  }),

  http.get(p('/public/credit-products'), async () => {
    await latency();
    return ok(
      db().products
        .filter((x) => x.status === 'active')
        .map(({ id, kind, name, rateMin, rateMax, maxPctOfAssets, monthsOptions }) => ({ id, kind, name, rateMin, rateMax, maxPctOfAssets, monthsOptions })),
    );
  }),

  http.post(p('/public/contact'), async ({ request }) => {
    await latency();
    const b = await body<ContactBody>(request);
    const name = (b.name ?? '').trim();
    const phone = enDigits(b.phone ?? '').replace(/[\s-]/g, '');
    const email = (b.email ?? '').trim();
    if (!name || !phone) return fail(422, 'missing_fields', 'نام و شماره تماس الزامی است.', { field: !name ? 'name' : 'phone' });
    if (!/^0\d{10}$/.test(phone)) return fail(422, 'invalid_phone', 'شماره تماس باید ۱۱ رقم و با ۰ شروع شود.', { field: 'phone' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(422, 'invalid_email', 'نشانی ایمیل معتبر نیست.', { field: 'email' });
    if (b.topic === 'demo' && !(b.company ?? '').trim()) return fail(422, 'missing_company', 'نام سازمان الزامی است.', { field: 'company' });
    const list = ((db().extra.contactRequests as unknown[]) ??= []);
    list.push({ ...b, name, phone, at: new Date().toISOString() });
    return ok({ ok: true, ticket: (b.topic === 'demo' ? 'DM-' : 'CT-') + (1000 + list.length) });
  }),
];
