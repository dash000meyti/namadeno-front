import type { MockDB } from '../db';

/**
 * Cost basis per user and fund holding, used by GET /me/holdings/:kind/stats
 * (average purchase price and profit/loss). Stored under db.extra.appMoney.
 */
export interface MoneyBasis { units: number; cost: number }
export interface AppMoneyExtra { basis: Record<string, Record<string, MoneyBasis>> }

/** Seeded average purchase price (Toman per unit) of the demo user's fund holdings. */
const SEED_AVG: Record<string, number> = {
  gold: 2_840_000,
  fixed: 142_400,
  equity: 121_400,
  mixed: 136_000,
  silver: 231_500,
};

export function seed_appMoney(db: MockDB) {
  const basis: AppMoneyExtra['basis'] = {};
  for (const [userId, ud] of Object.entries(db.users)) {
    const perKind: Record<string, MoneyBasis> = {};
    for (const h of ud.holdings) {
      if (!h.fundId) continue;
      const f = db.funds.find((x) => x.id === h.fundId);
      const units = h.units ?? 0;
      const avg = SEED_AVG[h.kind] ?? f?.nav ?? 0;
      perKind[h.kind] = { units, cost: units * avg };
    }
    basis[userId] = perKind;
  }
  const extra: AppMoneyExtra = { basis };
  db.extra.appMoney = extra;
}
