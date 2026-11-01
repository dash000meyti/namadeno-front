/**
 * Mock handlers of the "op-treasury" area — the operator treasury, orders, cash account, planning, action queue and
 * activity log. Types: src/api/op-treasury-extra.ts · engine: src/mocks/treasury.ts · contract: docs/API.md
 * («بهره‌بردار — خزانه، سفارش‌ها، نقدینگی، برنامه‌ریزی، فعالیت‌ها»).
 *
 *   GET   /op/treasury/summary?range=7|30|90          → TreasurySummary
 *   GET   /op/treasury/positions                       → TreasuryPosition[]
 *   GET   /op/treasury/positions/:fundId               → TreasuryPositionDetail            404 not_found
 *   GET   /op/treasury/movements?fundId&kind&limit     → StockMovement[]
 *   GET   /op/treasury/orders?status&fundId&side       → TreasuryOrder[]  (status: placed|due|settled|cancelled)
 *   POST  /op/treasury/orders/quote {fundId,side,amount}            → OrderQuote          422 bad_amount|fund_unavailable|bad_side
 *   POST  /op/treasury/orders {fundId,side,amount,note?,source?}    → 201 TreasuryOrder   422 … insufficient_cash|insufficient_stock|below_target
 *   POST  /op/treasury/orders/:id/settle                            → TreasuryOrder       404, 409 not_open
 *   POST  /op/treasury/orders/:id/cancel {reason?}                  → TreasuryOrder       404, 409 not_open
 *   GET   /op/treasury/cash?range=30|90                → CashSummary
 *   GET   /op/treasury/cash/entries?kind&status&orgId  → CashEntry[]     (status: expected|done|cancelled|overdue)
 *   POST  /op/treasury/deposits/:id/confirm {ref?}     → CashEntry       404, 409 already_received
 *   POST  /op/treasury/deposits {orgId,amount,ref?,note?} → 201 CashEntry 422 bad_amount|missing_org
 *   GET   /op/treasury/orgs/:id                        → OrgTreasuryDetail                   404
 *   GET   /op/treasury/targets  · PATCH (TargetsPatch) → TreasuryTargets  422 bad_mix|bad_target|bad_date
 *   GET   /op/treasury/plan?horizon=30|60|90           → TreasuryPlan
 *   GET   /op/actions                                   → ActionItem[]   (most severe first, then oldest)
 *   GET   /op/activity?actor&category&orgId&userId&q&limit&offset → ActivityPage
 */
import { http, type HttpHandler } from 'msw';
import type { ActivityFilter, Horizon, TargetsPatch } from '@/api/op-treasury-extra';
import { db } from '../db';
import { body, fail, latency, ok, p, qs, who } from '../http';
import { seed_opTreasury } from '../seed/extra-op-treasury';
import {
  activityPage, actions, cancelOrder, cashEntries, cashSummary, checkInvariants, confirmDeposit, evaluateOrder, listMovements,
  listOrders, operatorName, orgDetail, placeOrder, plan, positionDetail, recordDeposit, settleOrder, snapshot, summary,
  syncAggregates, treasuryOf, patchTargets, type TreasuryError,
} from '../treasury';

/** Seeds the store when an older saved database has none (normally the seed creates it). */
function ensure() {
  const d = db();
  if (!treasuryOf(d)) seed_opTreasury(d);
  return d;
}

const isErr = (x: unknown): x is TreasuryError => !!x && typeof x === 'object' && 'code' in x && 'status' in x && 'message' in x;
const by = (req: Request) => operatorName(who(req, 'operator').userId);
const pick = (n: string | null, allowed: number[], dflt: number) => (allowed.includes(Number(n)) ? Number(n) : dflt);
const opt = (v: string | null) => (v && v !== 'all' ? v : undefined);

/**
 * Pass-through, runs before every request (after the milestone tick): computes fund AUM, fund reservations and
 * organization AUM from the treasury and warns in the console when an identity breaks.
 */
export const treasuryTickHandlers: HttpHandler[] = [
  http.all(p('/*'), () => {
    ensure();
    checkInvariants(syncAggregates());
    return undefined;
  }),
];

export const opTreasuryHandlers: HttpHandler[] = [
  // ═════════ stock ═════════
  http.get(p('/op/treasury/summary'), async ({ request }) => {
    await latency();
    return ok(summary(snapshot(ensure()), pick(qs(request).get('range'), [7, 30, 90], 30)));
  }),
  http.get(p('/op/treasury/positions'), async () => {
    await latency();
    return ok(snapshot(ensure()).positions);
  }),
  http.get(p('/op/treasury/positions/:fundId'), async ({ params }) => {
    await latency();
    const x = positionDetail(snapshot(ensure()), String(params.fundId));
    return x ? ok(x) : fail(404, 'not_found', 'صندوق پیدا نشد.');
  }),
  http.get(p('/op/treasury/movements'), async ({ request }) => {
    await latency();
    const q = qs(request);
    return ok(listMovements(ensure(), { fundId: opt(q.get('fundId')), kind: opt(q.get('kind')), limit: Number(q.get('limit')) || undefined }));
  }),

  // ═════════ orders ═════════
  http.get(p('/op/treasury/orders'), async ({ request }) => {
    await latency();
    const q = qs(request);
    return ok(listOrders(ensure(), { status: opt(q.get('status')), fundId: opt(q.get('fundId')), side: opt(q.get('side')) }));
  }),
  http.post(p('/op/treasury/orders/quote'), async ({ request }) => {
    const b = await body<{ fundId?: string; side?: string; amount?: number }>(request);
    const ev = evaluateOrder(snapshot(ensure()), b);
    return ev.invalid ? fail(ev.invalid.status, ev.invalid.code, ev.invalid.message, ev.invalid.details) : ok(ev.quote);
  }),
  http.post(p('/op/treasury/orders'), async ({ request }) => {
    await latency();
    const r = placeOrder(ensure(), await body(request), by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r, { status: 201 });
  }),
  http.post(p('/op/treasury/orders/:id/settle'), async ({ request, params }) => {
    await latency();
    const r = settleOrder(ensure(), String(params.id), by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r);
  }),
  http.post(p('/op/treasury/orders/:id/cancel'), async ({ request, params }) => {
    await latency();
    const b = await body<{ reason?: string }>(request);
    const r = cancelOrder(ensure(), String(params.id), b.reason, by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r);
  }),

  // ═════════ cash ═════════
  http.get(p('/op/treasury/cash'), async ({ request }) => {
    await latency();
    const s = snapshot(ensure());
    return ok(cashSummary(s.d, s.t, s.agg, s.com, pick(qs(request).get('range'), [30, 90], 30)));
  }),
  http.get(p('/op/treasury/cash/entries'), async ({ request }) => {
    await latency();
    const q = qs(request);
    return ok(cashEntries(ensure(), { kind: opt(q.get('kind')), status: opt(q.get('status')), orgId: opt(q.get('orgId')) }));
  }),
  http.post(p('/op/treasury/deposits/:id/confirm'), async ({ request, params }) => {
    await latency();
    const b = await body<{ ref?: string }>(request);
    const r = confirmDeposit(ensure(), String(params.id), b.ref, by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r);
  }),
  http.post(p('/op/treasury/deposits'), async ({ request }) => {
    await latency();
    const r = recordDeposit(ensure(), await body(request), by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r, { status: 201 });
  }),

  // ═════════ organizations ═════════
  http.get(p('/op/treasury/orgs/:id'), async ({ params }) => {
    await latency();
    const x = orgDetail(snapshot(ensure()), String(params.id));
    return x ? ok(x) : fail(404, 'not_found', 'سازمان پیدا نشد.');
  }),

  // ═════════ targets + planning ═════════
  http.get(p('/op/treasury/targets'), async () => {
    await latency();
    return ok(treasuryOf(ensure())!.targets);
  }),
  http.patch(p('/op/treasury/targets'), async ({ request }) => {
    await latency();
    const r = patchTargets(ensure(), await body<TargetsPatch>(request), by(request));
    return isErr(r) ? fail(r.status, r.code, r.message, r.details) : ok(r);
  }),
  http.get(p('/op/treasury/plan'), async ({ request }) => {
    await latency();
    return ok(plan(snapshot(ensure()), pick(qs(request).get('horizon'), [30, 60, 90], 30) as Horizon));
  }),

  // ═════════ action queue + activity ═════════
  http.get(p('/op/actions'), async () => {
    await latency();
    return ok(actions(snapshot(ensure())));
  }),
  http.get(p('/op/activity'), async ({ request }) => {
    await latency();
    const q = qs(request);
    const f: ActivityFilter = {
      actor: opt(q.get('actor')) as ActivityFilter['actor'], category: opt(q.get('category')) as ActivityFilter['category'],
      orgId: opt(q.get('orgId')), userId: opt(q.get('userId')), q: q.get('q') ?? undefined,
      limit: Number(q.get('limit')) || undefined, offset: Number(q.get('offset')) || undefined,
    };
    return ok(activityPage(ensure(), f));
  }),
];
