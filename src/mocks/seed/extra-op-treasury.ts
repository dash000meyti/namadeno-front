/**
 * Seed of the operator treasury (area "op-treasury"): stock per fund, orders, the platform cash ledger, stock
 * movements, activity, targets, forecast assumptions and 90-day history.
 *
 * Baseline rule: the mock models only a few people one by one (the app user + users seeded by op-core). Everyone
 * else is a baseline sized so the totals match the design: baseline = target − modelled-at-seed. `held` units start
 * at fund.aum / nav, so every number other screens showed before stays the same.
 * Runs after seed_opCore and seed_opSystem (needs the organizations' AUM and the funds' reservation meta).
 */
import type { MockDB } from '../db';
import type { Fund, LockType } from '@/types/domain';
import type {
  ActivityEvent, CashEntry, ForecastEvent, StockMovement, TreasuryAssumptions, TreasuryTargets,
} from '@/api/op-treasury-extra';
import type { OrgContractExt } from '@/api/op-core-extra';
import type { FundMeta } from '@/api/op-system-extra';
import { daysFromNow, jalaliToIso } from '@/lib/clock';
import { faDigits, money, units } from '@/lib/format';
import { routes } from '@/lib/routes';
import {
  HISTORY_DAYS, LOCK_TYPES, commitments, historyIndex, modelledAgg, netDemand, snapshot,
  type BaseOrg, type StoredOrder, type TreasuryStore,
} from '../treasury';

const B = 1e9;
const M = 1e6;

/** Allocated value per fund (Toman billions) — free stock = held − allocated − committed. */
const ALLOC_B: Record<string, number> = { gold: 239.5, fixed: 166, equity: 47, mixed: 35, silver: 11.2, saffron: 6.8, leverage: 8.4, project: 14.2 };
/** Unrealised gain of the held stock over its cost. */
const GAIN: Record<string, number> = { gold: 0.18, fixed: 0.09, equity: 0.06, mixed: 0.05, silver: 0.1, saffron: 0.04, leverage: -0.03, project: 0.07 };
const COMMIT_B = { gold: 6.1, fixed: 4.0, rial: 0.4 };
const USER_RIAL_B = 46;
const CASH_BALANCE_B = 71.6;

export const TREASURY_ASSUMPTIONS: TreasuryAssumptions = {
  acceptanceRate: 0.85,
  vestingSellBackPct: 0.25,
  reclaimRate: 0.05,
  demandPerDay: { gold: 1.3 * B, fixed: 0.85 * B, equity: 0.15 * B, mixed: 0.08 * B, silver: 0.04 * B, saffron: 0.015 * B, leverage: 0.03 * B, project: 0.04 * B },
  returnsPerDay: { gold: 0.46 * B, fixed: 0.44 * B, equity: 0.1 * B, mixed: 0.05 * B, silver: 0.02 * B, saffron: 0.01 * B, leverage: 0.04 * B, project: 0.02 * B },
  newPackagesPerMonth: 18 * B,
  defaultSplit: { gold: 50, fixed: 40, rial: 10 },
};

const TARGETS = (): TreasuryTargets => ({
  stock: [
    { fundId: 'gold', minFreeValue: 20 * B, targetDays: 21, maxFreeValue: 45 * B },
    { fundId: 'fixed', minFreeValue: 12 * B, targetDays: 21, maxFreeValue: 40 * B },
    { fundId: 'equity', minFreeValue: 3 * B, targetDays: 30, maxFreeValue: 8 * B },
  ],
  aum: { value: 750 * B, by: jalaliToIso(1405, 12, 29) },
  mix: { gold: 45, fixed: 35, other: 20 },
  orgs: { value: 14, by: jalaliToIso(1406, 3, 31) },
  users: { value: 15_000, by: jalaliToIso(1406, 3, 31) },
  updatedAt: daysFromNow(-30, '09:00'),
  updatedBy: 'علی نادری',
});

// [code, fund, side, amount (B), placed day, placed time, status, settle/cancel day, by, note]
type OrderRow = [string, string, 'buy' | 'redeem', number, number, string, StoredOrder['status'], number, string, string?];
const ORDERS: OrderRow[] = [
  ['TR-1042', 'gold', 'buy', 6.0, -1, '11:20', 'placed', 0, 'علی نادری', 'پیشنهاد خزانه برای نزدیک شدن پوشش طلا به هدف'],
  ['TR-1041', 'fixed', 'buy', 3.0, 0, '09:40', 'placed', 1, 'علی نادری'],
  ['TR-1040', 'equity', 'redeem', 4.0, -1, '15:10', 'placed', 1, 'مهسا بهرامی', 'موجودی آزاد سهام بیش از سقف هدف'],
  ['TR-1039', 'gold', 'buy', 8.0, -6, '10:05', 'settled', -5, 'علی نادری'],
  ['TR-1038', 'fixed', 'buy', 5.0, -9, '11:30', 'settled', -8, 'مهسا بهرامی'],
  ['TR-1037', 'gold', 'buy', 10.0, -15, '09:50', 'settled', -14, 'علی نادری'],
  ['TR-1036', 'silver', 'buy', 0.8, -12, '13:15', 'cancelled', -11, 'مهسا بهرامی', 'NAV روز بعد اعلام شد؛ با مبلغ تازه ثبت می‌شود'],
  ['TR-1035', 'mixed', 'buy', 2.0, -18, '10:40', 'settled', -16, 'علی نادری'],
  ['TR-1034', 'fixed', 'buy', 6.0, -24, '12:10', 'settled', -23, 'علی نادری'],
  ['TR-1033', 'gold', 'buy', 12.0, -31, '09:35', 'settled', -30, 'علی نادری'],
  ['TR-1032', 'project', 'buy', 1.5, -36, '11:00', 'settled', -35, 'مهسا بهرامی'],
  ['TR-1031', 'equity', 'redeem', 3.0, -40, '14:20', 'settled', -38, 'مهسا بهرامی'],
  ['TR-1030', 'fixed', 'buy', 7.0, -47, '10:15', 'settled', -46, 'علی نادری'],
  ['TR-1029', 'gold', 'buy', 9.0, -55, '09:45', 'settled', -54, 'علی نادری'],
  ['TR-1028', 'saffron', 'buy', 0.6, -58, '12:30', 'settled', -57, 'مهسا بهرامی'],
  ['TR-1027', 'gold', 'buy', 15.0, -70, '10:00', 'settled', -69, 'علی نادری'],
  ['TR-1026', 'fixed', 'buy', 12.0, -77, '11:10', 'settled', -76, 'علی نادری'],
  ['TR-1025', 'gold', 'buy', 14.0, -84, '09:30', 'settled', -83, 'علی نادری'],
];

// received organization deposits: [org, title, amount (B, or a package id), day]
const ORG_DEPOSITS: [string, string, number | string, number][] = [
  ['org-novin', 'بسته‌ی پاداش آبان', 3.9, -3],
  ['org-kaveh', 'پاداش آبان', 6.8, -5],
  ['org-aseman', 'بسته‌ی رفاهی آبان', 2.7, -9],
  ['org-alborz', 'پاداش فصل', 2.2, -14],
  ['org-rad', 'بسته‌ی رفاهی', 5.6, -18],
  ['org-ava', 'بسته‌ی پاداش', 2.9, -21],
  ['org-sepehr', 'عیدی میان‌سال', 3.4, -26],
  ['org-kaveh', 'بسته‌ی رفاهی مهر', 7.2, -28],
  ['org-arman', 'پاداش مهر ۱۴۰۵', 'pkg-mehr', -30],
  ['org-novin', 'بسته‌ی پاداش مهر', 4.6, -30],
  ['org-pars', 'بسته‌ی پاداش مهر', 9.8, -32],
  ['org-arman', 'مزایای رفاهی', 'pkg-welfare-aban', -34],
  ['org-arman', 'قرارداد طراحی هویت بصری', 'pkg-ms-brand', -55],
  ['org-novin', 'بسته‌ی رفاهی شهریور', 3.1, -58],
  ['org-kaveh', 'پاداش شهریور', 6.4, -60],
  ['org-arman', 'پاداش شهریور ۱۴۰۵', 'pkg-shahrivar', -61],
  ['org-pars', 'پاداش شهریور', 8.9, -62],
  ['org-arman', 'قرارداد پروژه پرتال منابع انسانی', 'pkg-ms-portal', -75],
  ['org-rad', 'پاداش مرداد', 4.8, -80],
  ['org-pars', 'بسته‌ی رفاهی مرداد', 5.2, -86],
];
// expected deposits (packages sent, money not received yet): [org, title, amount B, sent day, due day]
const EXPECTED: [string, string, number, number, number, number][] = [
  ['org-pars', 'بسته‌ی رفاهی آبان', 4.2, -6, -3, 560],
  ['org-sepehr', 'پاداش آبان', 2.6, -4, -1, 270],
  ['org-kaveh', 'بسته‌ی پاداش عملکرد', 3.8, -1, 2, 470],
  ['org-novin', 'هدیه‌ی تولد همکاران', 1.9, 0, 4, 180],
];

const SCHEDULE = (orgName: (id: string) => string | undefined): ForecastEvent[] => [
  { id: 'sch-1', at: jalaliToIso(1405, 8, 28), kind: 'milestone_due', title: 'سررسید مرحله‌ی ۳ «قرارداد پشتیبانی سامانه»', value: 1.2 * B, count: 14, orgId: 'org-novin', fundId: 'fixed' },
  { id: 'sch-2', at: jalaliToIso(1405, 9, 1), kind: 'planned_package', title: 'بسته‌ی پاداش آذر (برنامه‌ریزی‌شده)', value: 7.5 * B, count: 560, orgId: 'org-pars' },
  { id: 'sch-3', at: jalaliToIso(1405, 9, 5), kind: 'vesting_release', title: 'آزاد شدن پس‌انداز سازمانی', value: 3.2 * B, count: 140, orgId: 'org-kaveh', fundId: 'gold' },
  { id: 'sch-4', at: jalaliToIso(1405, 9, 12), kind: 'planned_package', title: 'بسته‌ی رفاهی آذر (برنامه‌ریزی‌شده)', value: 3.1 * B, count: 290, orgId: 'org-rad' },
  { id: 'sch-5', at: jalaliToIso(1405, 9, 30), kind: 'planned_package', title: 'بسته‌های یلدا · ۶ سازمان (برنامه‌ریزی‌شده)', value: 14 * B, count: 2100 },
  { id: 'sch-6', at: jalaliToIso(1405, 10, 1), kind: 'planned_package', title: 'بسته‌ی پاداش دی (برنامه‌ریزی‌شده)', value: 6.8 * B, count: 470, orgId: 'org-kaveh' },
  { id: 'sch-7', at: jalaliToIso(1405, 10, 15), kind: 'vesting_release', title: 'آزاد شدن پس‌انداز «پاداش مهر» و «پاداش تیر» · ۶ سازمان', value: 12.6 * B, count: 1260, fundId: 'fixed' },
  { id: 'sch-8', at: jalaliToIso(1405, 10, 15), kind: 'vesting_release', title: 'آزاد شدن پس‌انداز «پاداش مهر» · طلا', value: 5.8 * B, count: 640, fundId: 'gold' },
  { id: 'sch-9', at: jalaliToIso(1405, 10, 20), kind: 'milestone_due', title: 'سررسید مرحله‌ی ۳ «قرارداد توسعه‌ی واحد فرآورش»', value: 2.4 * B, count: 6, orgId: 'org-kaveh', fundId: 'gold' },
  { id: 'sch-10', at: jalaliToIso(1405, 11, 1), kind: 'planned_package', title: 'بسته‌ی پاداش بهمن (برنامه‌ریزی‌شده)', value: 8.2 * B, count: 560, orgId: 'org-pars' },
  { id: 'sch-11', at: jalaliToIso(1405, 11, 10), kind: 'vesting_release', title: 'آزاد شدن پس‌انداز سازمانی', value: 4.6 * B, count: 190, orgId: 'org-novin', fundId: 'gold' },
].map((e) => ({ ...e, kind: e.kind as ForecastEvent['kind'], orgName: e.orgId ? orgName(e.orgId) : undefined, href: e.orgId ? routes.op.organization(e.orgId) : undefined }));

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'];
const MONTHLY_AUM = [301, 308, 316, 339, 347, 366, 395, 412.6];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zero = (): Record<LockType, number> => ({ collateral: 0, vesting: 0, installment: 0, milestone: 0, legal: 0 });

export function seed_opTreasury(d: MockDB) {
  const rnd = rng(140508);
  const A = JSON.parse(JSON.stringify(TREASURY_ASSUMPTIONS)) as TreasuryAssumptions;
  const fundOf = (id: string) => d.funds.find((f) => f.id === id)!;
  const orgName = (id: string) => d.organizations.find((o) => o.id === id)?.name;
  const navAt = (f: Fund, iso: string) => f.history?.find((h) => h.t.slice(0, 10) === iso.slice(0, 10))?.v ?? f.nav;
  const agg = modelledAgg(d);
  const com = commitments(d, A);

  // ── stock + baseline
  const held: TreasuryStore['held'] = {};
  const allocatedUnits: Record<string, number> = {};
  const reservedUnits: Record<string, Record<LockType, number>> = {};
  for (const f of d.funds) {
    const nav = f.nav;
    reservedUnits[f.id] = zero();
    if (!(nav > 0)) { held[f.id] = { units: 0, cost: 0 }; allocatedUnits[f.id] = 0; continue; }
    const units = f.aum / nav;
    held[f.id] = { units, cost: Math.round(f.aum * (1 - (GAIN[f.id] ?? 0.05))) };
    allocatedUnits[f.id] = Math.max(0, ((ALLOC_B[f.id] ?? (f.aum / B) * 0.92) * B) / nav - (agg.units[f.id] ?? 0));
    const lbt = (f as Fund & { meta?: FundMeta }).meta?.lockByType;
    for (const k of LOCK_TYPES) reservedUnits[f.id][k] = Math.max(0, (lbt?.[k] ?? 0) / nav - (agg.reserved[f.id]?.[k] ?? 0));
  }
  const commitToman = {
    gold: Math.max(0, COMMIT_B.gold * B - (com.fund.gold ?? 0)),
    fixed: Math.max(0, COMMIT_B.fixed * B - (com.fund.fixed ?? 0)),
    rial: Math.max(0, COMMIT_B.rial * B - com.rial),
  };
  const orgs: Record<string, BaseOrg> = {};
  const core = d.extra.opCore as { orgs?: Record<string, OrgContractExt> } | undefined;
  for (const [id, ext] of Object.entries(core?.orgs ?? {})) {
    const a = agg.org[id];
    const value = Math.max(0, ext.aum - (a?.value ?? 0));
    const reservedByType: Partial<Record<LockType, number>> = {};
    for (const k of LOCK_TYPES) {
      const v = (ext.lockByType?.[k] ?? 0) - (a?.reservedByType[k] ?? 0);
      if (v > 0) reservedByType[k] = Math.round(v);
    }
    orgs[id] = {
      value: Math.round(value), fundValue: Math.round(value * (1 - (ext.aumMix?.rial ?? 10) / 100)),
      reserved: Math.round(Math.max(0, ext.locked - (a?.reserved ?? 0))), reservedByType, depositsPrior: 0,
    };
  }

  // ── orders
  const orders: StoredOrder[] = ORDERS.map(([code, fid, side, amtB, pDay, pAt, status, sDay, by, note]) => {
    const f = fundOf(fid);
    const amount = Math.round(amtB * B);
    const placedAt = daysFromNow(pDay, pAt);
    const navAtOrder = navAt(f, placedAt);
    const fee = Math.round((amount * (side === 'buy' ? f.feePct : (f as Fund & { meta?: FundMeta }).meta?.sellFeePct ?? f.feePct)) / 100);
    const settleIso = daysFromNow(sDay, status === 'placed' ? '09:00' : '10:30');
    const navAtSettle = status === 'settled' ? navAt(f, settleIso) : undefined;
    const units = side === 'buy' ? (amount - fee) / (navAtSettle ?? navAtOrder) : amount / navAtOrder;
    return {
      id: code, code, fundId: fid, side, amount, units: Math.round(units * 10_000) / 10_000, navAtOrder, navAtSettle, fee, status,
      placedAt, settleAt: status === 'placed' ? settleIso : daysFromNow(sDay, '09:00'),
      settledAt: status === 'settled' ? settleIso : undefined,
      cancelledAt: status === 'cancelled' ? settleIso : undefined,
      cancelReason: status === 'cancelled' ? note : undefined,
      source: code === 'TR-1042' ? 'suggestion' : 'manual', note: status === 'cancelled' ? undefined : note, by,
    };
  });

  // ── cash ledger
  const entries: CashEntry[] = [];
  let ce = 0;
  const cid = () => `ce-s${(++ce).toString().padStart(3, '0')}`;
  const pkgById = (id: string) => Object.values(d.orgPackages).flat().find((p) => p.id === id);
  for (const [orgId, title, amt, day] of ORG_DEPOSITS) {
    const pkg = typeof amt === 'string' ? pkgById(amt) : undefined;
    const at = daysFromNow(day, '11:' + String(10 + ((ce * 7) % 45)).padStart(2, '0'));
    entries.push({
      id: cid(), at, kind: 'org_deposit', amount: pkg ? pkg.total : Math.round((amt as number) * B), status: 'done', title: `واریز «${title}»`,
      orgId, orgName: orgName(orgId), packageId: pkg?.id, dueAt: daysFromNow(day + 1, '12:00'), receivedAt: at, ref: `FT${(482_310 + ce * 1_379).toString()}`, by: ce % 3 ? 'علی نادری' : 'مهسا بهرامی',
    });
  }
  for (const [orgId, title, amtB, sent, due] of EXPECTED) {
    entries.push({ id: cid(), at: daysFromNow(sent, sent === 0 ? '09:15' : '10:45'), kind: 'org_deposit', amount: Math.round(amtB * B), status: 'expected', title: `واریز «${title}»`, orgId, orgName: orgName(orgId), dueAt: daysFromNow(due, '12:00') });
  }
  for (let day = -88; day <= 0; day += 4) {
    entries.push({ id: cid(), at: daysFromNow(day, day === 0 ? '09:00' : '20:00'), kind: 'user_deposit', amount: Math.round((0.9 + rnd() * 1.5) * B * (day === 0 ? 0.35 : 1)), status: 'done', title: 'واریز کاربران · تجمیع روزانه' });
  }
  for (let day = -86; day <= -2; day += 7) {
    entries.push({ id: cid(), at: daysFromNow(day, '20:05'), kind: 'user_withdrawal', amount: -Math.round((0.6 + rnd() * 1.0) * B), status: 'done', title: 'برداشت کاربران · تجمیع روزانه' });
  }
  for (const o of orders) {
    if (o.status !== 'settled') continue;
    const f = fundOf(o.fundId);
    entries.push(o.side === 'buy'
      ? { id: cid(), at: o.settledAt!, kind: 'order_buy', amount: -o.amount, status: 'done', title: `تسویه‌ی صدور ${f.shortName} · ${o.code}`, orderId: o.id, by: o.by }
      : { id: cid(), at: o.settledAt!, kind: 'order_redeem', amount: Math.round(o.units * (o.navAtSettle ?? o.navAtOrder) - o.fee), status: 'done', title: `تسویه‌ی ابطال ${f.shortName} · ${o.code}`, orderId: o.id, by: o.by });
  }
  for (const [day, amt] of [[-75, 12 * M], [-45, 14 * M], [-15, 11 * M]] as const) {
    entries.push({ id: cid(), at: daysFromNow(day, '08:00'), kind: 'fee', amount: -amt, status: 'done', title: 'کارمزد خدمات بانکی ماهانه' });
  }
  entries.push({ id: cid(), at: daysFromNow(-50, '16:30'), kind: 'adjustment', amount: 45 * M, status: 'done', title: 'اصلاح مغایرت بانکی', note: 'برگشت کارمزد اضافه‌ی شهریور', by: 'مهسا بهرامی' });
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const doneSum = entries.filter((e) => e.status === 'done').reduce((s, e) => s + e.amount, 0);

  // deposits this year before the ledger window = budget used − deposits in the ledger
  for (const o of d.organizations) {
    const inLedger = entries.filter((e) => e.kind === 'org_deposit' && e.status === 'done' && e.orgId === o.id).reduce((s, e) => s + e.amount, 0);
    const b = (orgs[o.id] ??= { value: 0, fundValue: 0, reserved: 0, reservedByType: {}, depositsPrior: 0 });
    b.depositsPrior = Math.max(0, o.budgetUsed - inLedger);
  }

  const t: TreasuryStore = {
    base: {
      allocatedUnits, reservedUnits, commitToman, userRial: Math.max(0, USER_RIAL_B * B - agg.rial), orgs,
      activeUsers: 9_310, users: 12_840, pace: { orgsPerMonth: 0.8, usersPerMonth: 310 }, schedule: SCHEDULE(orgName),
    },
    held, orders, cash: { opening: Math.round(CASH_BALANCE_B * B - doneSum), entries }, movements: [], activity: [],
    targets: TARGETS(), assumptions: A,
    history: { available: {}, held: {}, balance: [], cashAvailable: [], flow: { allocated: [], returned: [], bought: [], redeemed: [] } },
    aumMonthly: [],
  };
  d.extra.opTreasury = t;

  // ── history (built backwards from today's computed numbers)
  const s = snapshot(d);
  const N = HISTORY_DAYS;
  const F = { allocated: Array(N).fill(0), returned: Array(N).fill(0), bought: Array(N).fill(0), redeemed: Array(N).fill(0) };
  const todayMoves: { fid: string; alloc: number; ret: number }[] = [];
  const recentMoves: { fid: string; i: number; alloc: number; ret: number }[] = [];
  const settledOn = (fid: string, i: number, side: 'buy' | 'redeem') => orders
    .filter((o) => o.fundId === fid && o.side === side && o.status === 'settled' && historyIndex(o.settledAt!) === i)
    .reduce((acc, o) => acc + (side === 'buy' ? o.amount - o.fee : o.units * fundOf(fid).nav), 0);
  const redeemPlacedOn = (fid: string, i: number) => orders
    .filter((o) => o.fundId === fid && o.side === 'redeem' && o.status !== 'cancelled' && historyIndex(o.placedAt) === i)
    .reduce((acc, o) => acc + o.amount, 0);
  const wave = (i: number) => (i >= N - 32 && i <= N - 28 ? 1.5 : i >= N - 63 && i <= N - 59 ? 1.2 : 0);
  for (const p of s.positions) {
    if (p.state === 'inactive') continue;
    const fid = p.fundId;
    const gross = netDemand(fid, A) + (A.returnsPerDay[fid] ?? 0);
    const avail = Array(N).fill(0);
    const hold = Array(N).fill(0);
    avail[N - 1] = p.availableValue;
    hold[N - 1] = p.heldValue;
    const floor = p.heldValue * 0.02;
    for (let i = N - 1; i >= 0; i--) {
      const growth = 0.75 + (0.25 * i) / (N - 1);
      const partial = i === N - 1 ? 10.5 / 24 : 1;
      const alloc = gross * growth * (0.55 + rnd() * 0.9 + (fid === 'gold' || fid === 'fixed' ? wave(i) : 0)) * partial;
      const ret = (A.returnsPerDay[fid] ?? 0) * (0.6 + rnd() * 0.8) * partial;
      const bought = settledOn(fid, i, 'buy');
      const redeemed = settledOn(fid, i, 'redeem');
      F.allocated[i] += alloc; F.returned[i] += ret; F.bought[i] += bought; F.redeemed[i] += redeemed;
      if ((fid === 'gold' || fid === 'fixed') && i === N - 1) todayMoves.push({ fid, alloc, ret });
      else if ((fid === 'gold' || fid === 'fixed') && i >= N - 6) recentMoves.push({ fid, i, alloc, ret });
      if (i > 0) {
        avail[i - 1] = Math.max(floor, avail[i] + alloc - ret - bought + redeemPlacedOn(fid, i));
        hold[i - 1] = Math.max(0, hold[i] - bought + redeemed);
      }
    }
    t.history.available[fid] = avail.map(Math.round);
    t.history.held[fid] = hold.map(Math.round);
  }
  t.history.flow = { allocated: F.allocated.map(Math.round), returned: F.returned.map(Math.round), bought: F.bought.map(Math.round), redeemed: F.redeemed.map(Math.round) };
  t.history.flow.allocated[N - 1] = 0; // today is computed from movements
  t.history.flow.returned[N - 1] = 0;
  t.history.flow.bought[N - 1] = 0;
  t.history.flow.redeemed[N - 1] = 0;

  const bal = Array(N).fill(0);
  bal[N - 1] = s.cash.balance;
  const doneOn = (i: number) => entries.filter((e) => e.status === 'done' && historyIndex(e.at) === i).reduce((acc, e) => acc + e.amount, 0);
  for (let i = N - 1; i > 0; i--) bal[i - 1] = bal[i] - doneOn(i);
  const tiedOn = (i: number) => orders.filter((o) => o.side === 'buy' && o.status !== 'cancelled' && historyIndex(o.placedAt) <= i && historyIndex(o.placedAt) >= 0
    && (o.status === 'placed' || historyIndex(o.settledAt!) > i)).reduce((acc, o) => acc + o.amount, 0);
  t.history.balance = bal.map(Math.round);
  t.history.cashAvailable = bal.map((b, i) => Math.round(b - tiedOn(i) - s.cash.userWallets * (0.86 + (0.14 * i) / (N - 1)) * (0.99 + rnd() * 0.02) - s.cash.committedRial));

  const scale = s.positions.reduce((acc, p) => acc + p.heldValue, 0) / (MONTHLY_AUM[MONTHLY_AUM.length - 1] * B);
  t.aumMonthly = MONTHS.map((month, i) => ({ month, aum: Math.round(MONTHLY_AUM[i] * B * scale) }));

  // ── stock movements
  let mv = 0;
  const mid = () => `mv-s${(++mv).toString().padStart(3, '0')}`;
  const moves: StockMovement[] = [];
  const unitsOf = (fid: string, v: number) => Math.round((v / fundOf(fid).nav) * 10_000) / 10_000;
  const label = (fid: string) => fundOf(fid).shortName;
  for (const m of todayMoves) {
    moves.push({ id: mid(), at: daysFromNow(0, '10:00'), fundId: m.fid, kind: 'allocate', units: -unitsOf(m.fid, m.alloc * 0.6), value: Math.round(m.alloc * 0.6), title: `تخصیص بسته‌های سازمانی · ${label(m.fid)} · تجمیع امروز` });
    moves.push({ id: mid(), at: daysFromNow(0, '10:05'), fundId: m.fid, kind: 'user_buy', units: -unitsOf(m.fid, m.alloc * 0.4), value: Math.round(m.alloc * 0.4), title: `خرید کاربران · ${label(m.fid)} · تجمیع امروز` });
    moves.push({ id: mid(), at: daysFromNow(0, '10:10'), fundId: m.fid, kind: 'user_sell', units: unitsOf(m.fid, m.ret), value: Math.round(m.ret), title: `فروش کاربران · ${label(m.fid)} · تجمیع امروز` });
  }
  for (const m of recentMoves) {
    const day = m.i - (N - 1);
    moves.push({ id: mid(), at: daysFromNow(day, '23:30'), fundId: m.fid, kind: 'allocate', units: -unitsOf(m.fid, m.alloc * 0.6), value: Math.round(m.alloc * 0.6), title: `تخصیص بسته‌های سازمانی · ${label(m.fid)} · تجمیع روزانه` });
    moves.push({ id: mid(), at: daysFromNow(day, '23:35'), fundId: m.fid, kind: 'user_buy', units: -unitsOf(m.fid, m.alloc * 0.4), value: Math.round(m.alloc * 0.4), title: `خرید کاربران · ${label(m.fid)} · تجمیع روزانه` });
    moves.push({ id: mid(), at: daysFromNow(day, '23:40'), fundId: m.fid, kind: 'user_sell', units: unitsOf(m.fid, m.ret), value: Math.round(m.ret), title: `فروش کاربران · ${label(m.fid)} · تجمیع روزانه` });
  }
  for (const o of orders.filter((x) => x.status === 'settled')) {
    const nav = o.navAtSettle ?? o.navAtOrder;
    moves.push(o.side === 'buy'
      ? { id: mid(), at: o.settledAt!, fundId: o.fundId, kind: 'buy_settle', units: o.units, value: o.amount - o.fee, title: `تسویه‌ی صدور ${o.code}`, orderId: o.id }
      : { id: mid(), at: o.settledAt!, fundId: o.fundId, kind: 'redeem_settle', units: -o.units, value: Math.round(o.units * nav), title: `تسویه‌ی ابطال ${o.code}`, orderId: o.id });
  }
  moves.push({ id: mid(), at: daysFromNow(-6, '10:40'), fundId: 'fixed', kind: 'reclaim', units: unitsOf('fixed', 0.12 * B), value: 0.12 * B, title: 'بازپس‌گیری مرحله‌ی ۲ «قرارداد پشتیبانی سامانه»', orgId: 'org-novin' });
  const portal = pkgById('pkg-ms-portal');
  const brand = pkgById('pkg-ms-brand');
  if (portal) moves.push({ id: mid(), at: daysFromNow(-20, '10:30'), fundId: 'gold', kind: 'allocate', units: -unitsOf('gold', portal.total), value: portal.total, title: `تخصیص «${portal.title}» به سارا محمدی`, orgId: 'org-arman', userId: 'u-1001', userName: 'سارا محمدی', packageId: portal.id });
  if (brand) moves.push({ id: mid(), at: jalaliToIso(1405, 6, 22), fundId: 'gold', kind: 'allocate', units: -unitsOf('gold', brand.total), value: brand.total, title: `تخصیص «${brand.title}» به امیر جعفری`, orgId: 'org-arman', userId: 'u-1006', userName: 'امیر جعفری', packageId: brand.id });
  t.movements = moves.sort((a, b) => b.at.localeCompare(a.at));

  // ── activity
  let ev = 0;
  const act: ActivityEvent[] = [];
  const add = (day: number, hhmm: string, e: Omit<ActivityEvent, 'id' | 'at'>) => act.push({ ...e, id: `ev-s${(++ev).toString().padStart(3, '0')}`, at: daysFromNow(day, hhmm) });
  const adminOf = (orgId: string) => (orgId === 'org-arman' ? 'نیما رضایی' : d.organizations.find((o) => o.id === orgId)?.admins[0]?.name ?? d.organizations.find((o) => o.id === orgId)?.name ?? 'سازمان');
  const user = (id: string, name: string) => ({ kind: 'user' as const, id, name });
  const opr = (name: string) => ({ kind: 'operator' as const, name });
  const sys = { kind: 'system' as const, name: 'سامانه' };
  const org = (id: string, name = adminOf(id)) => ({ kind: 'org' as const, id, name });

  for (const o of orders) {
    const f = fundOf(o.fundId);
    const verb = o.side === 'buy' ? 'صدور' : 'ابطال';
    const day = Math.round((Date.parse(o.placedAt) - Date.parse(daysFromNow(0))) / 86_400_000);
    if (day >= -45) {
      act.push({ id: `ev-o${o.code}`, at: o.placedAt, actor: opr(o.by), category: 'treasury', kind: 'order_placed', title: `${verb} ${f.shortName} · ${o.code}`, sub: `${money(o.amount)} تومان · تسویه ${f.settlement}${o.source === 'suggestion' ? ' · پیشنهاد خزانه' : ''}`, amount: o.amount, fundId: f.id, units: o.units, tone: 'primary', href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }] });
    }
    if (o.status === 'settled' && o.settledAt) {
      act.push({ id: `ev-s${o.code}`, at: o.settledAt, actor: opr(o.by), category: 'treasury', kind: 'order_settled', title: `تسویه‌ی ${verb} ${f.shortName} · ${o.code}`, sub: `${units(o.units)} واحد · NAV ${money(o.navAtSettle ?? o.navAtOrder)}`, amount: o.amount, fundId: f.id, units: o.units, tone: 'success', href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }] });
    }
    if (o.status === 'cancelled' && o.cancelledAt) {
      act.push({ id: `ev-c${o.code}`, at: o.cancelledAt, actor: opr(o.by), category: 'treasury', kind: 'order_cancelled', title: `لغو ${verb} ${f.shortName} · ${o.code}`, sub: o.cancelReason, amount: o.amount, fundId: f.id, tone: 'neutral', href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }] });
    }
  }
  for (const e of entries.filter((x) => x.kind === 'org_deposit' && x.orgId)) {
    const sentAt = e.status === 'expected' ? e.at : new Date(Date.parse(e.at) - 1.6 * 86_400_000).toISOString();
    if (sentAt < daysFromNow(-45)) continue;
    act.push({ id: `ev-p${e.id}`, at: sentAt, actor: org(e.orgId!), orgId: e.orgId, orgName: e.orgName, category: 'package', kind: 'package_sent', title: `ارسال «${e.title.replace(/^واریز «|»$/g, '')}»`, sub: e.status === 'expected' ? 'واریز سازمان در راه است' : 'واریز سازمان دریافت شد', amount: e.amount, tone: 'primary', href: routes.op.organization(e.orgId!), refs: e.packageId ? [{ type: 'package', id: e.packageId }] : undefined });
    if (e.status === 'done') act.push({ id: `ev-d${e.id}`, at: e.at, actor: opr(e.by ?? 'علی نادری'), orgId: e.orgId, orgName: e.orgName, category: 'cash', kind: 'deposit_confirmed', title: `دریافت واریز ${e.orgName}`, sub: `${e.title} · مرجع ${e.ref}`, amount: e.amount, tone: 'success', href: `${routes.op.cash}?id=${e.id}`, refs: [{ type: 'cash', id: e.id }] });
  }
  for (let day = -1; day >= -6; day--) add(day, '14:00', { actor: sys, category: 'treasury', kind: 'nav_updated', title: 'به‌روزرسانی NAV صندوق‌ها', sub: `${faDigits(8)} صندوق فعال · از هسته‌ی معاملات`, tone: 'neutral', href: routes.op.funds });

  const ORG_ARMAN = { orgId: 'org-arman', orgName: orgName('org-arman') };
  const N_ = (id: string) => ({ orgId: id, orgName: orgName(id) });
  add(0, '10:05', { actor: user('u-1001', 'سارا محمدی'), ...ORG_ARMAN, category: 'trade', kind: 'user_buy', title: 'خرید صندوق طلا', sub: 'از موجودی آزاد خزانه', amount: 5 * M, fundId: 'gold', tone: 'info', href: routes.op.user('u-1001'), refs: [{ type: 'user', id: 'u-1001' }] });
  add(0, '08:41', { actor: sys, ...N_('org-novin'), category: 'account', kind: 'risk_alert', title: 'هشدار ریسک · برداشت غیرعادی', sub: `الهام رستمی · امتیاز ${faDigits(82)}`, tone: 'error', href: `${routes.op.risk}?id=AL-3318`, refs: [{ type: 'alert', id: 'AL-3318' }, { type: 'user', id: 'u-2138' }] });
  add(0, '08:40', { actor: user('u-2138', 'الهام رستمی'), ...N_('org-novin'), category: 'cash', kind: 'user_withdrawal', title: 'برداشت به حساب بانکی', sub: 'در انتظار بررسی ریسک', amount: 85 * M, tone: 'warning', href: routes.op.user('u-2138'), refs: [{ type: 'user', id: 'u-2138' }, { type: 'alert', id: 'AL-3318' }] });
  add(0, '07:30', { actor: sys, ...N_('org-pars'), category: 'cash', kind: 'deposit_overdue', title: 'یادآوری واریز معوق', sub: `صنایع پارس · ${faDigits(3)} روز از سررسید گذشته`, amount: 4.2 * B, tone: 'warning', href: `${routes.op.cash}?status=overdue` });
  add(-1, '17:20', { actor: user('u-1009', 'محمد صادقی'), ...ORG_ARMAN, category: 'request', kind: 'request_created', title: 'درخواست تغییر شماره موبایل', sub: 'RQ-2036', tone: 'info', href: `${routes.op.requests}?id=RQ-2036`, refs: [{ type: 'request', id: 'RQ-2036' }, { type: 'user', id: 'u-1009' }] });
  add(-1, '16:20', { actor: user('u-4006', 'بهراد کیانی'), ...N_('org-sepehr'), category: 'trade', kind: 'user_buy', title: 'خرید صندوق طلا', sub: 'از موجودی آزاد خزانه', amount: 118 * M, fundId: 'gold', tone: 'info', href: routes.op.user('u-4006'), refs: [{ type: 'user', id: 'u-4006' }, { type: 'alert', id: 'AL-3317' }] });
  add(-1, '16:05', { actor: user('u-4006', 'بهراد کیانی'), ...N_('org-sepehr'), category: 'trade', kind: 'user_sell', title: 'فروش صندوق طلا', sub: 'به موجودی آزاد خزانه برگشت', amount: 120 * M, fundId: 'gold', tone: 'neutral', href: routes.op.user('u-4006'), refs: [{ type: 'user', id: 'u-4006' }] });
  add(-1, '09:30', { actor: user('u-1002', 'علی کریمی'), ...ORG_ARMAN, category: 'trade', kind: 'user_buy', title: 'خرید صندوق درآمد ثابت', sub: 'از موجودی آزاد خزانه', amount: 12 * M, fundId: 'fixed', tone: 'info', href: routes.op.user('u-1002'), refs: [{ type: 'user', id: 'u-1002' }] });
  add(-1, '08:00', { actor: sys, ...N_('org-pars'), category: 'reserve', kind: 'vesting_released', title: 'آزاد شدن پس‌انداز سازمانی', sub: `${faDigits(28)} همکار · صنایع پارس`, amount: 0.42 * B, fundId: 'fixed', tone: 'success', href: routes.op.organization('org-pars') });
  add(-2, '14:05', { actor: opr('کامران وفایی'), ...N_('org-kaveh'), category: 'account', kind: 'password_reset', title: 'بازنشانی رمز کاربر', sub: 'پویا شریفی', tone: 'neutral', href: routes.op.user('u-5044'), refs: [{ type: 'user', id: 'u-5044' }] });
  add(-2, '12:30', { actor: user('u-5044', 'پویا شریفی'), ...N_('org-kaveh'), category: 'account', kind: 'device_new', title: 'ورود از دستگاه جدید و تغییر شبا', sub: 'هشدار AL-3311', tone: 'warning', href: routes.op.user('u-5044'), refs: [{ type: 'user', id: 'u-5044' }, { type: 'alert', id: 'AL-3311' }] });
  add(-2, '11:00', { actor: org('org-arman', 'لیلا کاظمی'), ...ORG_ARMAN, category: 'account', kind: 'employees_added', title: `افزودن ${faDigits(12)} همکار`, sub: 'از فایل اکسل · واحد فروش', tone: 'info', href: routes.op.organization('org-arman') });
  add(-3, '12:00', { actor: sys, ...ORG_ARMAN, category: 'reserve', kind: 'milestone_due', title: 'سررسید مرحله‌ی ۳ «قرارداد طراحی هویت بصری»', sub: 'در انتظار تأیید سازمان', tone: 'info', href: routes.op.organization('org-arman'), refs: [{ type: 'package', id: 'pkg-ms-brand' }] });
  add(-3, '10:15', { actor: opr('مهسا بهرامی'), ...N_('org-novin'), category: 'account', kind: 'legal_hold', title: 'ثبت مسدودی قانونی', sub: 'الهام رستمی · دستور مرجع قضایی', tone: 'warning', href: routes.op.user('u-2138'), refs: [{ type: 'user', id: 'u-2138' }, { type: 'alert', id: 'AL-3302' }] });
  add(-4, '15:30', { actor: opr('علی نادری'), ...N_('org-ava'), category: 'contract', kind: 'contract_updated', title: 'به‌روزرسانی قرارداد آوا پرداخت', sub: 'سقف هر نفر و مدت پس‌انداز', tone: 'info', href: routes.op.organization('org-ava') });
  add(-5, '13:10', { actor: user('u-3019', 'نرگس طاهری'), ...N_('org-pars'), category: 'trade', kind: 'user_buy', title: 'خرید صندوق طلا', sub: 'از موجودی آزاد خزانه', amount: 25 * M, fundId: 'gold', tone: 'info', href: routes.op.user('u-3019'), refs: [{ type: 'user', id: 'u-3019' }] });
  add(-6, '10:40', { actor: org('org-novin'), ...N_('org-novin'), category: 'reserve', kind: 'milestone_reclaimed', title: 'بازپس‌گیری مرحله‌ی ۲ «قرارداد پشتیبانی سامانه»', sub: '«تحویل ماژول گزارش» · به موجودی آزاد خزانه برگشت', amount: 0.12 * B, fundId: 'fixed', tone: 'warning', href: routes.op.organization('org-novin') });
  add(-7, '09:00', { actor: user('u-2201', 'حامد یزدانی'), ...N_('org-novin'), category: 'trade', kind: 'user_sell', title: 'فروش صندوق درآمد ثابت', sub: 'به موجودی آزاد خزانه برگشت', amount: 30 * M, fundId: 'fixed', tone: 'neutral', href: routes.op.user('u-2201'), refs: [{ type: 'user', id: 'u-2201' }] });
  add(-8, '10:00', { actor: opr('علی نادری'), ...N_('org-mehr'), category: 'contract', kind: 'org_onboarding', title: 'شروع راه‌اندازی گروه آموزشی مهر', sub: 'قرارداد امضا شد · در انتظار نخستین بسته', tone: 'info', href: routes.op.organization('org-mehr') });
  add(-9, '18:10', { actor: user('u-1004', 'رضا حسینی'), ...ORG_ARMAN, category: 'cash', kind: 'user_deposit', title: 'واریز به کیف پول ریالی', amount: 50 * M, tone: 'success', href: routes.op.user('u-1004'), refs: [{ type: 'user', id: 'u-1004' }] });
  add(-10, '12:00', { actor: sys, ...ORG_ARMAN, category: 'reserve', kind: 'milestone_released', title: 'آزادسازی مرحله‌ی ۲ «قرارداد طراحی هویت بصری»', sub: '«طراحی نشان و لوگوتایپ» در سررسید آزاد شد', amount: 3 * M, fundId: 'gold', tone: 'success', href: routes.op.organization('org-arman'), refs: [{ type: 'package', id: 'pkg-ms-brand' }] });
  add(-12, '11:30', { actor: org('org-arman', 'رضا حسینی'), ...ORG_ARMAN, category: 'package', kind: 'package_approved', title: 'تأیید نهایی «پاداش مهر ۱۴۰۵»', sub: 'تأییدکننده‌ی سازمان', tone: 'info', href: routes.op.organization('org-arman'), refs: [{ type: 'package', id: 'pkg-mehr' }] });
  add(-20, '10:30', { actor: user('u-1001', 'سارا محمدی'), ...ORG_ARMAN, category: 'package', kind: 'package_accepted', title: 'تأیید دریافت «قرارداد پروژه پرتال منابع انسانی»', sub: 'طلا ۱۰۰٪', amount: portal?.total ?? 20 * M, fundId: 'gold', tone: 'success', href: routes.op.user('u-1001'), refs: [{ type: 'package', id: 'pkg-ms-portal' }, { type: 'user', id: 'u-1001' }] });
  add(-30, '09:00', { actor: opr('علی نادری'), category: 'treasury', kind: 'targets_updated', title: 'به‌روزرسانی اهداف خزانه', sub: 'موجودی صندوق‌ها، ترکیب دارایی', tone: 'info', href: routes.op.planning });
  t.activity = act.sort((a, b) => b.at.localeCompare(a.at));

}
