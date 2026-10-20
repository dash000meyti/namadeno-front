/** Public website endpoints (/public/*) and mock controls (/_mock/*). */
import { http } from 'msw';
import { db, resetDb } from '../db';
import { body, fail, latency, ok, p } from '../http';

export const publicHandlers = [
  http.get(p('/public/blog'), async () => {
    await latency();
    return ok(db().blog.map(({ body: _b, ...post }) => { void _b; return post; }));
  }),
  http.get(p('/public/blog/:slug'), async ({ params }) => {
    await latency();
    const post = db().blog.find((x) => x.slug === params.slug);
    return post ? ok(post) : fail(404, 'not_found', 'مطلب پیدا نشد.');
  }),
  http.get(p('/public/funds'), async () => {
    await latency();
    return ok(db().funds.map(({ history, ...f }) => ({ ...f, history: history?.filter((_, i) => i % 7 === 0) })));
  }),
  http.get(p('/public/faq'), async () => { await latency(); return ok(db().faq); }),
  http.post(p('/public/contact'), async ({ request }) => {
    await latency();
    const b = await body<{ name?: string; phone?: string; company?: string; message?: string }>(request);
    if (!b.name || !b.phone) return fail(422, 'missing_fields', 'نام و شماره تماس الزامی است.');
    const list = ((db().extra.contactRequests as unknown[]) ??= []);
    list.push({ ...b, at: new Date().toISOString() });
    return ok({ ok: true, ticket: 'CT-' + (1000 + list.length) });
  }),
];

export const mockHandlers = [
  http.post(p('/_mock/reset'), async () => {
    resetDb();
    return ok({ ok: true });
  }),
];
