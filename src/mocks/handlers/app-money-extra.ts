/**
 * Additional mock endpoints owned by the "app-money" area. Registered before the core handlers (can override).
 *
 * GET /api/v1/me/holdings/:kind/stats
 *   Request:  —
 *   Response: HoldingStats {
 *     kind: AssetKind; units: number; nav: Toman;
 *     avgCost: Toman;        // average purchase price per unit
 *     costBasis: Toman;      // total cost of the units held
 *     pnl: Toman;            // value − costBasis (signed)
 *     pnlPct: number;        // pnl / costBasis × 100
 *     dailyAccrual: Toman;   // estimated daily profit (fixed-income funds: value × yield / 365; others: today's change)
 *   }
 *   Errors: 404 not_found (no such holding), 422 not_a_fund (rial wallet)
 *
 * Cost basis is tracked per user/fund in db.extra.appMoney.basis and reconciled lazily:
 * units added since the last read are booked at the current NAV, units removed reduce the
 * basis proportionally (average cost stays the same).
 */
import { http, type HttpHandler } from 'msw';
import { db, userData } from '../db';
import { fail, latency, ok, p, who } from '../http';
import type { AppMoneyExtra } from '../seed/extra-app-money';

function extra(): AppMoneyExtra {
  const d = db();
  let x = d.extra.appMoney as AppMoneyExtra | undefined;
  if (!x || !x.basis) {
    x = { basis: {} };
    d.extra.appMoney = x;
  }
  return x;
}

export const appMoneyHandlers: HttpHandler[] = [
  http.get(p('/me/holdings/:kind/stats'), async ({ request, params }) => {
    await latency();
    const userId = who(request, 'employee').userId;
    const ud = userData(userId);
    const kind = String(params.kind);
    if (kind === 'rial') return fail(422, 'not_a_fund', 'کیف پول ریالی صندوق نیست.');
    const h = ud.holdings.find((x) => x.kind === kind);
    const f = db().funds.find((x) => x.id === kind);
    if (!h || !f) return fail(404, 'not_found', 'دارایی پیدا نشد.');
    const units = h.units ?? 0;
    const nav = f.nav;
    const store = extra();
    const perUser = (store.basis[userId] ??= {});
    let b = perUser[kind];
    if (!b) b = perUser[kind] = { units, cost: units * nav };
    const eps = 1e-6;
    if (units > b.units + eps) {
      b.cost += (units - b.units) * nav;
      b.units = units;
    } else if (units < b.units - eps) {
      b.cost = b.units > 0 ? b.cost * (units / b.units) : 0;
      b.units = units;
    }
    const value = Math.round(units * nav);
    const costBasis = Math.round(b.cost);
    const avgCost = units > eps ? Math.round(b.cost / units) : 0;
    const pnl = value - costBasis;
    const dailyAccrual = f.category === 'fixed_income'
      ? Math.round((value * (f.effectiveYield ?? f.return1y)) / 100 / 365)
      : h.change;
    return ok({ kind, units, nav, avgCost, costBasis, pnl, pnlPct: costBasis ? (pnl / costBasis) * 100 : 0, dailyAccrual });
  }),
];
