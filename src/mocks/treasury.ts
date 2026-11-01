/**
 * Treasury engine (area "op-treasury") — the operator's pooled fund stock, buy/redeem orders, the platform rial
 * account, the activity log and the planning maths. It is the single source of truth for fund AUM, fund
 * reservations, organization AUM and the overview totals, so every screen shows the same numbers.
 *
 * Model (per fund, units):
 *   held       = units Namadno owns; changes ONLY when a buy/redeem order settles
 *   allocated  = baseline (unmodelled population) + Σ holdings of modelled people (app users + operator-seeded users)
 *   reserved   = baseline + Σ reservations of modelled people
 *   committed  = baseline + pending recipients of sent packages × split
 *   available  = held − allocated − committed − pending redeem   (negative = shortfall)
 * Cash: balance = opening + Σ done entries; available = balance − tied in buy orders − user wallets − committed rial.
 *
 * Imports only db.ts and lib. Core handlers call the small flow hooks at the bottom (onPackageSent …).
 */
import type { AllocationSplit, Fund, Holding, InboxPackage, LockType, MilestoneStep, OrgPackage } from '@/types/domain';
import type {
  ActionItem, ActivityEvent, ActivityFilter, ActivityPage, ActorKind, CashEntry, CashSummary, ForecastBucket, ForecastEvent,
  FundForecast, Horizon, OrderQuote, OrderSide, OrgTreasuryDetail, OrgTreasuryRow, Recommendation, Severity, StockMovement,
  StockState, StockSuggestion, TargetProgress, TargetsPatch, TreasuryAssumptions, TreasuryOrder, TreasuryPlan, TreasuryPosition,
  TreasuryPositionDetail, TreasurySummary, TreasuryTargets, TreasuryTotals,
} from '@/api/op-treasury-extra';
import type { OrgContractExt } from '@/api/op-core-extra';
import type { FundMeta } from '@/api/op-system-extra';
import { db, newId, type MockDB, type UserData } from './db';
import { daysFromNow, jalaliToIso, now } from '@/lib/clock';
import { faDigits, money, units } from '@/lib/format';
import { FEATURES } from '@/lib/features';
import { isOrgRequest } from '@/lib/org';
import { routes } from '@/lib/routes';

// ───────────────────────── Store ─────────────────────────

export const LOCK_TYPES: LockType[] = ['collateral', 'vesting', 'installment', 'milestone', 'legal'];
export const HISTORY_DAYS = 90;
export const MIN_ORDER = 10_000_000;
export const SYSTEM_ACTOR = 'سامانه';
const DAY = 86_400_000;

export type StoredOrder = Omit<TreasuryOrder, 'dueNow'>;
export interface BaseOrg {
  value: number;
  fundValue: number;
  reserved: number;
  reservedByType: Partial<Record<LockType, number>>;
  /** Deposits received this year before the ledger window. */
  depositsPrior: number;
}

export interface TreasuryStore {
  /** The population the mock does not model person by person (sized so the seed numbers match the design). */
  base: {
    allocatedUnits: Record<string, number>;
    reservedUnits: Record<string, Record<LockType, number>>;
    /** Toman per fund id, plus 'rial'. */
    commitToman: Record<string, number>;
    userRial: number;
    orgs: Record<string, BaseOrg>;
    activeUsers: number;
    users: number;
    pace: { orgsPerMonth: number; usersPerMonth: number };
    schedule: ForecastEvent[];
  };
  held: Record<string, { units: number; cost: number }>;
  orders: StoredOrder[];
  cash: { opening: number; entries: CashEntry[] };
  movements: StockMovement[];
  activity: ActivityEvent[];
  targets: TreasuryTargets;
  assumptions: TreasuryAssumptions;
  /** 90 daily points, oldest first; the last point is replaced by the live value when served. */
  history: {
    available: Record<string, number[]>;
    held: Record<string, number[]>;
    balance: number[];
    cashAvailable: number[];
    flow: { allocated: number[]; returned: number[]; bought: number[]; redeemed: number[] };
  };
  /** Managed assets per month this year; the last one is served live. */
  aumMonthly: { month: string; aum: number }[];
}

export const treasuryOf = (d: MockDB = db()) => d.extra.opTreasury as TreasuryStore | undefined;
function T(d: MockDB): TreasuryStore {
  const t = treasuryOf(d);
  if (!t) throw new Error('[treasury] store not seeded');
  return t;
}

// ───────────────────────── Small helpers ─────────────────────────

const nowIso = () => now().toISOString();
const r0 = Math.round;
const ru = (n: number) => Math.round(n * 10_000) / 10_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const zeroLocks = (): Record<LockType, number> => ({ collateral: 0, vesting: 0, installment: 0, milestone: 0, legal: 0 });
const navOf = (d: MockDB, id: string) => d.funds.find((f) => f.id === id)?.nav ?? 0;
const toUnits = (toman: number, nav: number) => (nav > 0 ? toman / nav : 0);
/** Rounds a suggested order to a clean amount (0.1B steps above 1B, 10M below). */
export const roundUp = (x: number) => { const s = x >= 1e9 ? 1e8 : 1e7; return Math.ceil(x / s) * s; };
export const roundDown = (x: number) => { const s = x >= 1e9 ? 1e8 : 1e7; return Math.floor(x / s) * s; };
/** Tehran calendar day number of an ISO date. */
const dayKey = (iso: string) => Math.floor((Date.parse(iso) + 3.5 * 3_600_000) / DAY);
/** Index (0 … HISTORY_DAYS-1) of a date in the 90-day history; −1 when outside. */
export function historyIndex(iso: string) {
  const i = HISTORY_DAYS - 1 - (dayKey(nowIso()) - dayKey(iso));
  return i >= 0 && i < HISTORY_DAYS ? i : -1;
}
export const historyDay = (i: number) => daysFromNow(-(HISTORY_DAYS - 1 - i), '12:00');
const live = (arr: number[] | undefined, value: number) => (arr && arr.length ? [...arr.slice(0, -1), value] : [value]);
const fundName = (d: MockDB, id: string) => d.funds.find((f) => f.id === id)?.shortName ?? id;
const orgName = (d: MockDB, id?: string) => (id ? d.organizations.find((o) => o.id === id)?.name : undefined);
const bn = (n: number) => money(Math.round(n));

const OPERATORS: Record<string, string> = { 'op-301': 'علی نادری', 'op-302': 'مهسا بهرامی', 'op-303': 'کامران وفایی' };
/** Display name of an operator id (team edits in settings win). */
export function operatorName(id?: string) {
  const team = (db().extra.opSettings as { team?: { id: string; name: string }[] } | undefined)?.team;
  return team?.find((m) => m.id === id)?.name ?? (id && OPERATORS[id]) ?? 'علی نادری';
}

// ───────────────────────── Modelled population ─────────────────────────

interface Member { id: string; name: string; orgId?: string; holdings: Holding[] }

/** Everyone whose holdings the mock keeps person by person: app users + users seeded by the operator area. */
export function members(d: MockDB): Member[] {
  const out: Member[] = Object.values(d.users).map((ud) => ({ id: ud.profile.id, name: ud.profile.fullName, orgId: ud.profile.orgId || undefined, holdings: ud.holdings }));
  const core = d.extra.opCore as { users?: Record<string, { holdings?: Holding[] }> } | undefined;
  for (const [id, m] of Object.entries(core?.users ?? {})) {
    if (d.users[id] || !m.holdings) continue;
    const pu = d.platformUsers.find((x) => x.id === id);
    out.push({ id, name: pu?.fullName ?? id, orgId: pu?.orgId || undefined, holdings: m.holdings });
  }
  return out;
}

interface OrgAgg { value: number; fundValue: number; reserved: number; reservedByType: Record<LockType, number>; people: number }
export interface Agg {
  units: Record<string, number>;
  reserved: Record<string, Record<LockType, number>>;
  rial: number;
  org: Record<string, OrgAgg>;
}
const emptyOrgAgg = (): OrgAgg => ({ value: 0, fundValue: 0, reserved: 0, reservedByType: zeroLocks(), people: 0 });

export function modelledAgg(d: MockDB): Agg {
  const agg: Agg = { units: {}, reserved: {}, rial: 0, org: {} };
  for (const m of members(d)) {
    const o = m.orgId ? (agg.org[m.orgId] ??= emptyOrgAgg()) : undefined;
    if (o) o.people += 1;
    for (const h of m.holdings) {
      const lockSum = sum(h.locks.map((l) => l.amount));
      if (h.kind === 'rial') {
        agg.rial += h.value;
        if (o) { o.value += h.value; o.reserved += lockSum; for (const l of h.locks) o.reservedByType[l.type] += l.amount; }
        continue;
      }
      const fid = h.fundId ?? h.kind;
      const nav = navOf(d, fid);
      const units = h.units ?? toUnits(h.value, nav);
      agg.units[fid] = (agg.units[fid] ?? 0) + units;
      const rs = (agg.reserved[fid] ??= zeroLocks());
      for (const l of h.locks) rs[l.type] += toUnits(l.amount, nav);
      if (o) {
        o.value += units * nav;
        o.fundValue += units * nav;
        o.reserved += lockSum;
        for (const l of h.locks) o.reservedByType[l.type] += l.amount;
      }
    }
  }
  return agg;
}

// ───────────────────────── Commitments ─────────────────────────

/** Percent split of a package over gold / fixed / rial (free allocation → the assumed default split). */
export function splitOf(pkg: { allocationMode: string; fixedSplit?: AllocationSplit; cashAllowed: boolean }, A: TreasuryAssumptions) {
  if (pkg.allocationMode === 'fixed' && pkg.fixedSplit) return { gold: pkg.fixedSplit.gold ?? 0, fixed: pkg.fixedSplit.fixed ?? 0, rial: pkg.fixedSplit.rial ?? 0 };
  const s = A.defaultSplit;
  const rial = pkg.cashAllowed ? s.rial ?? 0 : 0;
  const k = (100 - rial) / ((s.gold + s.fixed) || 1);
  return { gold: s.gold * k, fixed: s.fixed * k, rial };
}
const reclaimedPct = (pkg: OrgPackage) => sum((pkg.milestoneProgress ?? []).filter((s) => s.status === 'reclaimed').map((s) => s.sharePct));

export interface Commit { fund: Record<string, number>; rial: number; org: Record<string, { toman: number; recipients: number }> }
/** Pending recipients of sent (not expired) packages — the stock promised but not yet taken. Toman. */
export function commitments(d: MockDB, A: TreasuryAssumptions): Commit {
  const c: Commit = { fund: {}, rial: 0, org: {} };
  const at = nowIso();
  for (const [orgId, list] of Object.entries(d.orgPackages)) {
    for (const pkg of list) {
      if (pkg.status !== 'sent' || (pkg.expiresAt && pkg.expiresAt < at)) continue;
      const sp = splitOf(pkg, A);
      const left = 1 - reclaimedPct(pkg) / 100;
      for (const r of pkg.recipients) {
        if (r.status !== 'pending') continue;
        const amt = r.amount * left;
        c.fund.gold = (c.fund.gold ?? 0) + (amt * sp.gold) / 100;
        c.fund.fixed = (c.fund.fixed ?? 0) + (amt * sp.fixed) / 100;
        c.rial += (amt * sp.rial) / 100;
        const o = (c.org[orgId] ??= { toman: 0, recipients: 0 });
        o.toman += amt;
        o.recipients += 1;
      }
    }
  }
  return c;
}

// ───────────────────────── Positions ─────────────────────────

/** Expected new packages per day for a fund (Toman) from the monthly assumption. */
const pkgShare = (fid: string, A: TreasuryAssumptions) => {
  const sp = splitOf({ allocationMode: 'free', cashAllowed: true }, A) as Record<string, number>;
  return fid in sp && fid !== 'rial' ? (A.newPackagesPerMonth * sp[fid]) / 100 / 30 : 0;
};
/** Net daily drain of free stock (Toman). */
export const netDemand = (fid: string, A: TreasuryAssumptions) => (A.demandPerDay[fid] ?? 0) + pkgShare(fid, A) - (A.returnsPerDay[fid] ?? 0);

export const settlementDays = (f: Fund) => (f.settlement === 'T+0' ? 0 : f.settlement === 'T+2' ? 2 : 1);
export const settleAtFor = (f: Fund) => (settlementDays(f) === 0 ? daysFromNow(0, '15:00') : daysFromNow(settlementDays(f), '09:00'));
const sellFeePct = (f: Fund) => (f as Fund & { meta?: FundMeta }).meta?.sellFeePct ?? f.feePct;

const minTargetOf = (net: number, target?: { minFreeValue: number; targetDays: number }) =>
  target ? Math.max(target.minFreeValue, Math.max(0, net) * target.targetDays) : 0;

function stateOf(active: boolean, availableValue: number, minTarget: number, max?: number): StockState {
  if (!active) return 'inactive';
  if (availableValue < -1) return 'shortfall';
  if (minTarget > 0 && availableValue < minTarget) return 'below';
  if (max && availableValue > max) return 'surplus';
  return 'ok';
}

function suggestionOf(state: StockState, freeValue: number, minTarget: number, max: number | undefined, coverage: number | null, targetDays: number | undefined, horizon?: number): StockSuggestion | undefined {
  if (state === 'shortfall' || state === 'below') {
    const amount = roundUp(Math.max(minTarget, 0) - freeValue);
    if (amount < MIN_ORDER) return undefined;
    const when = horizon ? `تا ${faDigits(horizon)} روز آینده` : 'اکنون';
    const reason = state === 'shortfall'
      ? `تخصیص‌ها و تعهدات ${when} از موجودی بیشتر است؛ این مبلغ موجودی را به حداقل هدف برمی‌گرداند.`
      : coverage !== null && targetDays
        ? `موجودی آزاد ${when} حدود ${faDigits(Math.floor(coverage))} روز نیاز را پوشش می‌دهد؛ هدف ${faDigits(targetDays)} روز است.`
        : `موجودی آزاد ${when} از حداقل هدف (${bn(minTarget)} تومان) کمتر است.`;
    return { side: 'buy', amount, reason };
  }
  if (state === 'surplus' && max) {
    const amount = roundDown(Math.min(freeValue - max, freeValue - minTarget));
    if (amount < MIN_ORDER) return undefined;
    return { side: 'redeem', amount, reason: `موجودی آزاد از سقف هدف (${bn(max)} تومان) بیشتر است؛ ابطال این مبلغ نقدینگی را آزاد می‌کند.` };
  }
  return undefined;
}

function position(d: MockDB, t: TreasuryStore, f: Fund, agg: Agg, com: Commit): TreasuryPosition {
  const A = t.assumptions;
  const nav = f.nav > 0 ? f.nav : 0;
  const v = (u: number) => r0(u * nav);
  const held = t.held[f.id]?.units ?? 0;
  const cost = t.held[f.id]?.cost ?? 0;
  const allocated = (t.base.allocatedUnits[f.id] ?? 0) + (agg.units[f.id] ?? 0);
  const reservedByType = zeroLocks();
  for (const k of LOCK_TYPES) reservedByType[k] = ru((t.base.reservedUnits[f.id]?.[k] ?? 0) + (agg.reserved[f.id]?.[k] ?? 0));
  const reserved = sum(Object.values(reservedByType));
  const committed = toUnits((t.base.commitToman[f.id] ?? 0) + (com.fund[f.id] ?? 0), nav);
  const open = t.orders.filter((o) => o.fundId === f.id && o.status === 'placed');
  const pendingBuy = sum(open.filter((o) => o.side === 'buy').map((o) => toUnits(o.amount - o.fee, nav)));
  const pendingRedeem = sum(open.filter((o) => o.side === 'redeem').map((o) => o.units));
  const available = held - allocated - committed - pendingRedeem;
  const active = f.status === 'active' && nav > 0;
  const net = active ? netDemand(f.id, A) : 0;
  const availableValue = v(available);
  const pendingBuyValue = v(pendingBuy);
  const coverageDays = active && net > 0 ? r1(Math.max(0, (availableValue + pendingBuyValue) / net)) : null;
  const target = t.targets.stock.find((s) => s.fundId === f.id);
  const minTarget = minTargetOf(net, target);
  const state = stateOf(active, availableValue, minTarget, target?.maxFreeValue);
  const suggestion = suggestionOf(state, availableValue + pendingBuyValue, minTarget, target?.maxFreeValue, coverageDays, target?.targetDays);
  return {
    fundId: f.id, name: f.name, shortName: f.shortName, symbol: f.symbol, nav, status: f.status, settlement: f.settlement,
    heldUnits: ru(held), allocatedUnits: ru(allocated), reservedUnits: ru(reserved), reservedByType, committedUnits: ru(committed),
    pendingBuyUnits: ru(pendingBuy), pendingRedeemUnits: ru(pendingRedeem), availableUnits: ru(available),
    heldValue: v(held), allocatedValue: v(allocated), reservedValue: v(reserved), committedValue: v(committed), availableValue,
    pendingBuyValue, pendingRedeemValue: v(pendingRedeem),
    avgCost: held > 0 ? r0(cost / held) : 0, unrealizedPnl: r0(held * nav - cost),
    demandPerDay: r0(net), coverageDays, target, minTargetValue: target ? r0(minTarget) : undefined, state, suggestion,
  };
}

// ───────────────────────── Snapshot ─────────────────────────

export interface Snapshot { d: MockDB; t: TreasuryStore; agg: Agg; com: Commit; positions: TreasuryPosition[]; cash: CashSummary }

export function snapshot(d: MockDB = db()): Snapshot {
  const t = T(d);
  const agg = modelledAgg(d);
  const com = commitments(d, t.assumptions);
  const positions = d.funds.map((f) => position(d, t, f, agg, com));
  return { d, t, agg, com, positions, cash: cashSummary(d, t, agg, com, 30) };
}

export function totalsOf(positions: TreasuryPosition[], t: TreasuryStore): TreasuryTotals {
  const s = (k: keyof TreasuryPosition) => sum(positions.map((p) => Number(p[k]) || 0));
  const open = t.orders.filter((o) => o.status === 'placed');
  return {
    heldValue: s('heldValue'), allocatedValue: s('allocatedValue'), reservedValue: s('reservedValue'), committedValue: s('committedValue'),
    availableValue: s('availableValue'), pendingBuyValue: s('pendingBuyValue'), pendingRedeemValue: s('pendingRedeemValue'), unrealizedPnl: s('unrealizedPnl'),
    openOrders: open.length, dueOrders: open.filter((o) => o.settleAt <= nowIso()).length,
  };
}

/** Whole-stock coverage (active funds). */
function coverageAll(positions: TreasuryPosition[]) {
  const act = positions.filter((p) => p.state !== 'inactive');
  const net = sum(act.map((p) => p.demandPerDay));
  return net > 0 ? r1(Math.max(0, sum(act.map((p) => p.availableValue + p.pendingBuyValue)) / net)) : null;
}

// ───────────────────────── Cash ─────────────────────────

const isOverdue = (e: CashEntry) => e.status === 'expected' && (e.dueAt ?? e.at) < nowIso();

export function cashSummary(d: MockDB, t: TreasuryStore, agg: Agg, com: Commit, range: number): CashSummary {
  const done = t.cash.entries.filter((e) => e.status === 'done');
  const balance = r0(t.cash.opening + sum(done.map((e) => e.amount)));
  const tiedInOrders = sum(t.orders.filter((o) => o.status === 'placed' && o.side === 'buy').map((o) => o.amount));
  const userWallets = r0(t.base.userRial + agg.rial);
  const committedRial = r0((t.base.commitToman.rial ?? 0) + com.rial);
  const available = balance - tiedInOrders - userWallets - committedRial;
  const exp = t.cash.entries.filter((e) => e.status === 'expected' && e.kind === 'org_deposit');
  const overdue = exp.filter(isOverdue);
  const n = Math.max(1, Math.min(HISTORY_DAYS, range));
  const bal = live(t.history.balance, balance).slice(-n);
  const av = live(t.history.cashAvailable, available).slice(-n);
  return {
    balance, tiedInOrders, userWallets, committedRial, available,
    expectedDeposits: sum(exp.map((e) => e.amount)), expectedCount: exp.length,
    overdueCount: overdue.length, overdueAmount: sum(overdue.map((e) => e.amount)),
    history: bal.map((b, i) => ({ t: historyDay(HISTORY_DAYS - n + i), balance: b, available: av[i] ?? 0 })),
  };
}

/** Ledger entries newest first, with the running balance on done entries. */
export function cashEntries(d: MockDB, f: { kind?: string; status?: string; orgId?: string } = {}): CashEntry[] {
  const t = T(d);
  const done = t.cash.entries.filter((e) => e.status === 'done').sort((a, b) => a.at.localeCompare(b.at));
  const after = new Map<string, number>();
  let run = t.cash.opening;
  for (const e of done) { run += e.amount; after.set(e.id, r0(run)); }
  return t.cash.entries
    .filter((e) => (!f.kind || e.kind === f.kind) && (!f.orgId || e.orgId === f.orgId)
      && (!f.status || (f.status === 'overdue' ? isOverdue(e) : e.status === f.status)))
    .map((e) => ({ ...e, balanceAfter: after.get(e.id), overdue: isOverdue(e) || undefined }))
    .sort((a, b) => (b.status === 'expected' ? b.dueAt ?? b.at : b.at).localeCompare(a.status === 'expected' ? a.dueAt ?? a.at : a.at));
}

// ───────────────────────── Organizations ─────────────────────────

const YEAR_START = () => jalaliToIso(1405, 1, 1);

export function orgRows(s: Snapshot): OrgTreasuryRow[] {
  const { d, t, agg, com } = s;
  return d.organizations.map((o) => {
    const b = t.base.orgs[o.id];
    const a = agg.org[o.id] ?? emptyOrgAgg();
    const deps = t.cash.entries.filter((e) => e.kind === 'org_deposit' && e.orgId === o.id);
    const exp = deps.filter((e) => e.status === 'expected');
    return {
      orgId: o.id, orgName: o.name, status: o.status,
      value: r0((b?.value ?? 0) + a.value), fundValue: r0((b?.fundValue ?? 0) + a.fundValue), reservedValue: r0((b?.reserved ?? 0) + a.reserved),
      commitments: r0(com.org[o.id]?.toman ?? 0), pendingRecipients: com.org[o.id]?.recipients ?? 0,
      depositsExpected: sum(exp.map((e) => e.amount)), depositsOverdue: sum(exp.filter(isOverdue).map((e) => e.amount)),
      depositsReceivedYear: r0((b?.depositsPrior ?? 0) + sum(deps.filter((e) => e.status === 'done' && e.at >= YEAR_START()).map((e) => e.amount))),
    };
  });
}

export function orgDetail(s: Snapshot, orgId: string): OrgTreasuryDetail | null {
  const row = orgRows(s).find((r) => r.orgId === orgId);
  if (!row) return null;
  return {
    row,
    deposits: cashEntries(s.d, { kind: 'org_deposit', orgId }),
    upcoming: forecastEvents(s, 90).filter((e) => e.orgId === orgId),
  };
}

// ───────────────────────── Sync + invariants ─────────────────────────

/**
 * Writes the computed numbers onto the resources other areas serve, so every screen agrees:
 * fund.aum = held value, fund.meta.lockByType = reserved value per type, organization AUM / reserved (+ last AUM point).
 * Runs before every request (pass-through handler).
 */
export function syncAggregates(d: MockDB = db()): Snapshot | null {
  if (!treasuryOf(d)) return null;
  const s = snapshot(d);
  for (const f of d.funds) {
    const p = s.positions.find((x) => x.fundId === f.id);
    if (!p) continue;
    f.aum = p.heldValue;
    const meta = (f as Fund & { meta?: FundMeta }).meta;
    if (meta) meta.lockByType = Object.fromEntries(LOCK_TYPES.map((k) => [k, r0(p.reservedByType[k] * p.nav)])) as Record<LockType, number>;
  }
  const core = d.extra.opCore as { orgs?: Record<string, OrgContractExt> } | undefined;
  for (const [id, ext] of Object.entries(core?.orgs ?? {})) {
    const b = s.t.base.orgs[id];
    const a = s.agg.org[id] ?? emptyOrgAgg();
    ext.aum = r0((b?.value ?? 0) + a.value);
    ext.locked = r0((b?.reserved ?? 0) + a.reserved);
    const lbt: Partial<Record<LockType, number>> = {};
    for (const k of LOCK_TYPES) {
      const v = r0((b?.reservedByType[k] ?? 0) + a.reservedByType[k]);
      if (v > 0) lbt[k] = v;
    }
    ext.lockByType = lbt;
    if (ext.aumHistory?.length) ext.aumHistory[ext.aumHistory.length - 1] = ext.aum;
  }
  return s;
}

const warned = new Set<string>();
/** Logs a console warning (once per message) when the treasury identities do not hold. */
export function checkInvariants(s: Snapshot | null = treasuryOf() ? snapshot() : null): string[] {
  if (!s) return [];
  const issues: string[] = [];
  for (const p of s.positions) if (p.reservedUnits > p.allocatedUnits + 1e-6) issues.push(`${p.fundId}: reserved > allocated`);
  const totals = totalsOf(s.positions, s.t);
  const orgFund = sum(orgRows(s).map((r) => r.fundValue));
  if (orgFund > totals.allocatedValue + 1) issues.push('Σ organization fund value > Σ allocated value');
  const fundAum = sum(s.d.funds.map((f) => f.aum));
  if (Math.abs(fundAum - totals.heldValue) > s.d.funds.length) issues.push('Σ fund AUM ≠ Σ held value');
  for (const m of issues) if (!warned.has(m)) { warned.add(m); console.warn('[treasury] invariant broken:', m); }
  return issues;
}

// ───────────────────────── Summary + detail ─────────────────────────

const FLOW_IN = new Set(['allocate', 'user_buy']);
const FLOW_BACK = new Set(['user_sell', 'reclaim']);

/** Managed assets per month (Toman) — the last month is the live Σ held value. Used by the overview as well. */
export function aumMonthlyLive(s: Snapshot) {
  const aum = totalsOf(s.positions, s.t).heldValue;
  const list = s.t.aumMonthly.map((m) => ({ ...m }));
  if (list.length) list[list.length - 1].aum = aum;
  return list;
}

export function summary(s: Snapshot, range: number): TreasurySummary {
  const { d, t, positions } = s;
  const totals = totalsOf(positions, t);
  const n = Math.max(1, Math.min(HISTORY_DAYS, range));
  const todayStart = daysFromNow(0, '00:00');
  const today = t.movements.filter((m) => m.at >= todayStart);
  const todayOf = (kinds: Set<string> | string) => sum(today.filter((m) => (typeof kinds === 'string' ? m.kind === kinds : kinds.has(m.kind))).map((m) => Math.abs(m.value)));
  const F = t.history.flow;
  const flow = {
    labels: Array.from({ length: n }, (_, i) => historyDay(HISTORY_DAYS - n + i)),
    allocated: live(F.allocated, todayOf(FLOW_IN)).slice(-n),
    returned: live(F.returned, todayOf(FLOW_BACK)).slice(-n),
    bought: live(F.bought, todayOf('buy_settle')).slice(-n),
    redeemed: live(F.redeemed, todayOf('redeem_settle')).slice(-n),
  };
  const rows = orgRows(s).sort((a, b) => b.value - a.value);
  const held = totals.heldValue || 1;
  const monthly = aumMonthlyLive(s);
  const a0 = monthly[0]?.aum ?? 0;
  const tgt = t.targets.aum.value;
  return {
    asOf: nowIso(),
    totals,
    coverageDays: coverageAll(positions),
    positions,
    cash: cashSummary(d, t, s.agg, s.com, n),
    mix: positions.filter((p) => p.heldValue > 0).map((p) => ({ fundId: p.fundId, value: p.heldValue, pct: r1((p.heldValue / held) * 100), targetPct: t.targets.mix[p.fundId] })),
    otherTargetPct: t.targets.mix.other,
    byOrg: rows,
    individualsValue: Math.max(0, totals.allocatedValue - sum(rows.map((r) => r.fundValue))),
    flow,
    aumMonthly: monthly.map((m, i) => ({ ...m, target: r0(a0 + ((tgt - a0) * i) / 11) })),
    aumTarget: { value: tgt, by: t.targets.aum.by, pct: r1((totals.heldValue / (tgt || 1)) * 100) },
    growth: {
      activeOrgs: d.organizations.filter((o) => o.status === 'active').length, orgs: d.organizations.length,
      activeUsers: t.base.activeUsers, users: t.base.users,
    },
  };
}

export function positionDetail(s: Snapshot, fundId: string): TreasuryPositionDetail | null {
  const p = s.positions.find((x) => x.fundId === fundId);
  if (!p) return null;
  const av = live(s.t.history.available[fundId], p.availableValue);
  const hd = live(s.t.history.held[fundId], p.heldValue);
  return {
    ...p,
    history: av.map((a, i) => ({ t: historyDay(HISTORY_DAYS - av.length + i), available: a, held: hd[i] ?? p.heldValue })),
    movements: listMovements(s.d, { fundId, limit: 30 }),
    orders: listOrders(s.d, { fundId }),
    forecast: fundForecasts(s, 30).find((x) => x.fundId === fundId),
  };
}

export function listMovements(d: MockDB, f: { fundId?: string; kind?: string; limit?: number } = {}): StockMovement[] {
  return T(d).movements
    .filter((m) => (!f.fundId || m.fundId === f.fundId) && (!f.kind || m.kind === f.kind))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, f.limit ?? 50);
}

const withDue = (o: StoredOrder): TreasuryOrder => ({ ...o, dueNow: o.status === 'placed' && o.settleAt <= nowIso() });

export function listOrders(d: MockDB, f: { status?: string; fundId?: string; side?: string } = {}): TreasuryOrder[] {
  return T(d).orders.map(withDue)
    .filter((o) => (!f.fundId || o.fundId === f.fundId) && (!f.side || o.side === f.side)
      && (!f.status || (f.status === 'due' ? o.dueNow : o.status === f.status)))
    .sort((a, b) => (a.status === 'placed' ? 0 : 1) - (b.status === 'placed' ? 0 : 1) || b.placedAt.localeCompare(a.placedAt));
}

// ───────────────────────── Orders ─────────────────────────

export interface TreasuryError { status: number; code: string; message: string; details?: Record<string, unknown> }
const err = (status: number, code: string, message: string, details?: Record<string, unknown>): TreasuryError => ({ status, code, message, details });

/** Validates an order and computes its impact. `invalid` = the request itself is wrong; `blocking` = it cannot be placed now. */
export function evaluateOrder(s: Snapshot, b: { fundId?: string; side?: string; amount?: number }): { invalid?: TreasuryError; quote?: OrderQuote; blocking: TreasuryError[] } {
  const f = s.d.funds.find((x) => x.id === b.fundId);
  if (!f || f.status !== 'active' || !(f.nav > 0)) return { invalid: err(422, 'fund_unavailable', 'این صندوق در حال حاضر قابل سفارش نیست.'), blocking: [] };
  if (b.side !== 'buy' && b.side !== 'redeem') return { invalid: err(422, 'bad_side', 'نوع سفارش باید صدور یا ابطال باشد.'), blocking: [] };
  const amount = r0(Number(b.amount));
  if (!(amount >= MIN_ORDER)) return { invalid: err(422, 'bad_amount', `حداقل مبلغ سفارش ${bn(MIN_ORDER)} تومان است.`), blocking: [] };
  const side: OrderSide = b.side;
  const p = s.positions.find((x) => x.fundId === f.id)!;
  const nav = f.nav;
  const fee = r0((amount * (side === 'buy' ? f.feePct : sellFeePct(f))) / 100);
  const units = side === 'buy' ? (amount - fee) / nav : amount / nav;
  const availableUnitsAfter = p.availableUnits + (side === 'buy' ? units : -units);
  const availableValueAfter = r0(availableUnitsAfter * nav);
  const cashAvailableAfter = s.cash.available + (side === 'buy' ? -amount : amount - fee);
  const net = p.demandPerDay;
  const coverageDaysAfter = net > 0 ? r1(Math.max(0, (availableValueAfter + p.pendingBuyValue) / net)) : null;
  const minTarget = minTargetOf(net, p.target);
  const blocking: TreasuryError[] = [];
  const warnings: string[] = [];
  if (side === 'buy' && amount > s.cash.available) {
    blocking.push(err(422, 'insufficient_cash', `نقدینگی آزاد کافی نیست؛ حداکثر ${bn(Math.max(0, s.cash.available))} تومان.`, { available: s.cash.available }));
  }
  if (side === 'redeem' && units > p.availableUnits + 1e-9) {
    blocking.push(err(422, 'insufficient_stock', `موجودی آزاد این صندوق ${bn(Math.max(0, p.availableValue))} تومان است.`, { availableUnits: p.availableUnits, availableValue: p.availableValue }));
  } else if (side === 'redeem' && p.target && availableValueAfter < minTarget) {
    blocking.push(err(422, 'below_target', `پس از ابطال، موجودی آزاد از حداقل هدف (${bn(minTarget)} تومان) کمتر می‌شود.`, { minFree: minTarget, availableValue: p.availableValue }));
  }
  for (const e of blocking) warnings.push(e.message);
  if (side === 'buy' && p.target && coverageDaysAfter !== null && coverageDaysAfter < p.target.targetDays) {
    warnings.push(`پس از تسویه، پوشش موجودی ${faDigits(Math.floor(coverageDaysAfter))} روز است؛ هدف ${faDigits(p.target.targetDays)} روز است.`);
  }
  if (side === 'buy' && p.target?.maxFreeValue && availableValueAfter > p.target.maxFreeValue) {
    warnings.push(`پس از تسویه، موجودی آزاد از سقف هدف (${bn(p.target.maxFreeValue)} تومان) بیشتر می‌شود.`);
  }
  if (side === 'redeem' && p.state === 'below') warnings.push('موجودی این صندوق همین حالا زیر هدف است.');
  return {
    blocking,
    quote: {
      fundId: f.id, side, amount, units: ru(units), fee, nav, settleAt: settleAtFor(f),
      cashAvailableAfter, availableUnitsAfter: ru(availableUnitsAfter), availableValueAfter, coverageDaysAfter, warnings,
    },
  };
}

const nextCode = (t: TreasuryStore) => `TR-${t.orders.reduce((m, o) => Math.max(m, Number(/^TR-(\d+)$/.exec(o.code)?.[1] ?? 0)), 1000) + 1}`;

export function placeOrder(d: MockDB, b: { fundId?: string; side?: string; amount?: number; note?: string; source?: string }, by: string): TreasuryOrder | TreasuryError {
  const s = snapshot(d);
  const ev = evaluateOrder(s, b);
  if (ev.invalid) return ev.invalid;
  if (ev.blocking.length) return ev.blocking[0];
  const q = ev.quote!;
  const f = d.funds.find((x) => x.id === q.fundId)!;
  const code = nextCode(s.t);
  const o: StoredOrder = {
    id: code, code, fundId: f.id, side: q.side, amount: q.amount, units: q.units, navAtOrder: f.nav, fee: q.fee, status: 'placed',
    placedAt: nowIso(), settleAt: q.settleAt, source: b.source === 'suggestion' ? 'suggestion' : 'manual', note: b.note?.trim() || undefined, by,
  };
  s.t.orders.unshift(o);
  logActivity({
    actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'order_placed',
    title: `${q.side === 'buy' ? 'صدور' : 'ابطال'} ${f.shortName} · ${code}`,
    sub: `${bn(q.amount)} تومان · تسویه ${f.settlement}`, amount: q.amount, fundId: f.id, units: q.units, tone: 'primary',
    href: `${routes.op.orders}?id=${code}`, refs: [{ type: 'order', id: code }],
  });
  return withDue(o);
}

export function settleOrder(d: MockDB, id: string, by: string): TreasuryOrder | TreasuryError {
  const t = T(d);
  const o = t.orders.find((x) => x.id === id || x.code === id);
  if (!o) return err(404, 'not_found', 'سفارش پیدا نشد.');
  if (o.status !== 'placed') return err(409, 'not_open', 'این سفارش باز نیست.');
  const f = d.funds.find((x) => x.id === o.fundId);
  if (!f || !(f.nav > 0)) return err(409, 'fund_unavailable', 'NAV این صندوق در دسترس نیست.');
  const h = (t.held[f.id] ??= { units: 0, cost: 0 });
  const at = nowIso();
  o.navAtSettle = f.nav;
  if (o.side === 'buy') {
    o.units = ru((o.amount - o.fee) / f.nav);
    h.units += o.units;
    h.cost += o.amount - o.fee;
    pushCash(t, { kind: 'order_buy', amount: -o.amount, status: 'done', title: `تسویه‌ی صدور ${f.shortName} · ${o.code}`, orderId: o.id, by });
    pushMovement(t, { fundId: f.id, kind: 'buy_settle', units: o.units, value: o.amount - o.fee, title: `تسویه‌ی صدور ${o.code}`, orderId: o.id });
  } else {
    if (h.units + 1e-9 < o.units) return err(409, 'insufficient_stock', 'واحد کافی برای ابطال در خزانه نیست.');
    const avg = h.units > 0 ? h.cost / h.units : 0;
    const proceeds = r0(o.units * f.nav - o.fee);
    h.units -= o.units;
    h.cost = Math.max(0, h.cost - avg * o.units);
    pushCash(t, { kind: 'order_redeem', amount: proceeds, status: 'done', title: `تسویه‌ی ابطال ${f.shortName} · ${o.code}`, orderId: o.id, by });
    pushMovement(t, { fundId: f.id, kind: 'redeem_settle', units: -o.units, value: r0(o.units * f.nav), title: `تسویه‌ی ابطال ${o.code}`, orderId: o.id });
  }
  o.status = 'settled';
  o.settledAt = at;
  logActivity({
    actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'order_settled',
    title: `تسویه‌ی ${o.side === 'buy' ? 'صدور' : 'ابطال'} ${f.shortName} · ${o.code}`,
    sub: `${units(o.units)} واحد · NAV ${bn(f.nav)}`, amount: o.amount, fundId: f.id, units: o.units, tone: 'success',
    href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }],
  });
  return withDue(o);
}

export function cancelOrder(d: MockDB, id: string, reason: string | undefined, by: string): TreasuryOrder | TreasuryError {
  const t = T(d);
  const o = t.orders.find((x) => x.id === id || x.code === id);
  if (!o) return err(404, 'not_found', 'سفارش پیدا نشد.');
  if (o.status !== 'placed') return err(409, 'not_open', 'این سفارش باز نیست.');
  o.status = 'cancelled';
  o.cancelledAt = nowIso();
  o.cancelReason = reason?.trim() || undefined;
  logActivity({
    actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'order_cancelled',
    title: `لغو ${o.side === 'buy' ? 'صدور' : 'ابطال'} ${fundName(d, o.fundId)} · ${o.code}`, sub: o.cancelReason, amount: o.amount, fundId: o.fundId,
    tone: 'neutral', href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }],
  });
  return withDue(o);
}

// ───────────────────────── Deposits ─────────────────────────

export function confirmDeposit(d: MockDB, id: string, ref: string | undefined, by: string): CashEntry | TreasuryError {
  const t = T(d);
  const e = t.cash.entries.find((x) => x.id === id);
  if (!e || e.kind !== 'org_deposit') return err(404, 'not_found', 'واریز پیدا نشد.');
  if (e.status !== 'expected') return err(409, 'already_received', 'این واریز قبلاً ثبت شده است.');
  e.status = 'done';
  e.at = nowIso();
  e.receivedAt = e.at;
  e.ref = ref?.trim() || e.ref;
  e.by = by;
  logActivity({
    actor: { kind: 'operator', name: by }, orgId: e.orgId, orgName: e.orgName, category: 'cash', kind: 'deposit_confirmed',
    title: `دریافت واریز ${e.orgName ?? ''}`.trim(), sub: e.title + (e.ref ? ` · مرجع ${e.ref}` : ''), amount: e.amount, tone: 'success',
    href: `${routes.op.cash}?id=${e.id}`, refs: [{ type: 'cash', id: e.id }, ...(e.packageId ? [{ type: 'package', id: e.packageId }] : [])],
  });
  return e;
}

export function recordDeposit(d: MockDB, b: { orgId?: string; amount?: number; ref?: string; note?: string }, by: string): CashEntry | TreasuryError {
  const t = T(d);
  const o = d.organizations.find((x) => x.id === b.orgId);
  if (!o) return err(422, 'missing_org', 'سازمان را انتخاب کنید.');
  const amount = r0(Number(b.amount));
  if (!(amount > 0)) return err(422, 'bad_amount', 'مبلغ معتبر نیست.');
  const e = pushCash(t, { kind: 'org_deposit', amount, status: 'done', title: b.note?.trim() || `واریز ${o.name}`, orgId: o.id, orgName: o.name, ref: b.ref?.trim() || undefined, note: b.note?.trim() || undefined, receivedAt: nowIso(), by });
  logActivity({
    actor: { kind: 'operator', name: by }, orgId: o.id, orgName: o.name, category: 'cash', kind: 'deposit_recorded',
    title: `ثبت واریز ${o.name}`, sub: e.ref ? `مرجع ${e.ref}` : undefined, amount, tone: 'success', href: `${routes.op.cash}?id=${e.id}`, refs: [{ type: 'cash', id: e.id }],
  });
  return e;
}

// ───────────────────────── Targets ─────────────────────────

export function patchTargets(d: MockDB, b: TargetsPatch, by: string): TreasuryTargets | TreasuryError {
  const t = T(d);
  const at = nowIso();
  if (b.mix) {
    const vals = Object.values(b.mix);
    if (vals.some((v) => !(v >= 0)) || Math.round(sum(vals)) !== 100) return err(422, 'bad_mix', 'جمع ترکیب دارایی باید ۱۰۰٪ باشد.');
  }
  if (b.stock) {
    for (const s of b.stock) {
      if (!d.funds.some((f) => f.id === s.fundId)) return err(422, 'bad_target', 'صندوق هدف معتبر نیست.', { fundId: s.fundId });
      if (!(s.minFreeValue >= 0) || !(s.targetDays >= 1 && s.targetDays <= 365)) return err(422, 'bad_target', 'حداقل موجودی و روزهای پوشش معتبر نیست.', { fundId: s.fundId });
      if (s.maxFreeValue !== undefined && s.maxFreeValue !== null && !(s.maxFreeValue > s.minFreeValue)) return err(422, 'bad_target', 'سقف موجودی باید از حداقل بیشتر باشد.', { fundId: s.fundId });
    }
  }
  for (const k of ['aum', 'orgs', 'users'] as const) {
    const g = b[k];
    if (!g) continue;
    if (!(g.value > 0)) return err(422, 'bad_target', 'مقدار هدف معتبر نیست.', { key: k });
    if (!g.by || g.by <= at) return err(422, 'bad_date', 'تاریخ هدف باید در آینده باشد.', { key: k });
  }
  if (b.stock) {
    const next = [...t.targets.stock];
    for (const s of b.stock) {
      const clean = { fundId: s.fundId, minFreeValue: r0(s.minFreeValue), targetDays: r0(s.targetDays), maxFreeValue: s.maxFreeValue ? r0(s.maxFreeValue) : undefined };
      const i = next.findIndex((x) => x.fundId === s.fundId);
      if (i >= 0) next[i] = clean; else next.push(clean);
    }
    t.targets.stock = next;
  }
  if (b.mix) t.targets.mix = { ...b.mix };
  if (b.aum) t.targets.aum = { value: r0(b.aum.value), by: b.aum.by };
  if (b.orgs) t.targets.orgs = { value: r0(b.orgs.value), by: b.orgs.by };
  if (b.users) t.targets.users = { value: r0(b.users.value), by: b.users.by };
  t.targets.updatedAt = at;
  t.targets.updatedBy = by;
  logActivity({ actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'targets_updated', title: 'به‌روزرسانی اهداف خزانه', sub: Object.keys(b).map((k) => TARGET_LABEL[k] ?? k).join('، '), tone: 'info', href: routes.op.planning });
  return t.targets;
}
const TARGET_LABEL: Record<string, string> = { stock: 'موجودی صندوق‌ها', mix: 'ترکیب دارایی', aum: 'دارایی تحت مدیریت', orgs: 'سازمان‌ها', users: 'کاربران' };

// ───────────────────────── Planning ─────────────────────────

/** Default share of a fund in planned packages without a fixed split (stock part only). */
function eventShare(e: ForecastEvent, fid: string, A: TreasuryAssumptions) {
  if (e.fundId) return e.fundId === fid ? 1 : 0;
  const sp = splitOf({ allocationMode: 'free', cashAllowed: true }, A) as Record<string, number>;
  return fid === 'gold' || fid === 'fixed' ? sp[fid] / 100 : 0;
}

/** Events that move the free stock or the cash account within the next `h` days (overdue ones included, at their date). */
export function forecastEvents(s: Snapshot, h: number): ForecastEvent[] {
  const { d, t } = s;
  const from = nowIso();
  const to = daysFromNow(h, '23:59');
  const out: ForecastEvent[] = t.base.schedule.filter((e) => e.at >= from && e.at <= to).map((e) => ({ ...e }));
  for (const [orgId, list] of Object.entries(d.orgPackages)) {
    const oName = orgName(d, orgId);
    for (const pkg of list) {
      const sp = splitOf(pkg, t.assumptions);
      const single = sp.gold === 100 ? 'gold' : sp.fixed === 100 ? 'fixed' : undefined;
      if (pkg.status === 'draft' && pkg.recipients.length) {
        out.push({ id: `ev-draft-${pkg.id}`, at: daysFromNow(3, '12:00'), kind: 'planned_package', title: `پیش‌نویس «${pkg.title}»`, value: pkg.total, count: pkg.recipients.length, orgId, orgName: oName, fundId: single, href: routes.op.organization(orgId) });
      }
      if (pkg.status !== 'sent') continue;
      const pending = pkg.recipients.filter((r) => r.status === 'pending');
      if (pkg.expiresAt && pkg.expiresAt >= from && pkg.expiresAt <= to && pending.length) {
        out.push({ id: `ev-exp-${pkg.id}`, at: pkg.expiresAt, kind: 'package_expiry', title: `پایان مهلت «${pkg.title}»`, value: r0(sum(pending.map((r) => r.amount)) * (1 - reclaimedPct(pkg) / 100)), count: pending.length, orgId, orgName: oName, fundId: single, href: routes.op.organization(orgId) });
      }
      (pkg.milestoneProgress ?? []).forEach((st: MilestoneStep, i) => {
        if ((st.status !== 'pending_approval' && st.status !== 'future') || !st.dueDate || st.dueDate > to) return;
        const value = r0((sum(pkg.recipients.filter((r) => r.status !== 'expired').map((r) => r.amount)) * st.sharePct) / 100);
        out.push({ id: `ev-ms-${pkg.id}-${st.id}`, at: st.dueDate, kind: 'milestone_due', title: `سررسید مرحله‌ی ${faDigits(i + 1)} «${pkg.title}»`, value, count: pkg.recipients.length, orgId, orgName: oName, fundId: single, href: routes.op.organization(orgId) });
      });
    }
  }
  // savings releases of modelled people, per fund and day
  const vest = new Map<string, ForecastEvent>();
  for (const m of members(d)) {
    for (const hd of m.holdings) {
      if (hd.kind === 'rial') continue;
      for (const l of hd.locks) {
        if (l.type !== 'vesting' || !l.releaseAt || l.releaseAt < from || l.releaseAt > to) continue;
        const fid = hd.fundId ?? hd.kind;
        const key = fid + l.releaseAt.slice(0, 10);
        const e = vest.get(key) ?? { id: `ev-vest-${key}`, at: l.releaseAt, kind: 'vesting_release' as const, title: `آزاد شدن پس‌انداز ${fundName(d, fid)}`, value: 0, count: 0, fundId: fid };
        e.value += l.amount;
        e.count = (e.count ?? 0) + 1;
        vest.set(key, e);
      }
    }
  }
  out.push(...vest.values());
  for (const o of t.orders.filter((x) => x.status === 'placed' && x.settleAt <= to)) {
    out.push({ id: `ev-ord-${o.id}`, at: o.settleAt, kind: 'order_settle', title: `تسویه‌ی ${o.side === 'buy' ? 'صدور' : 'ابطال'} ${fundName(d, o.fundId)} · ${o.code}`, value: o.amount, fundId: o.fundId, href: `${routes.op.orders}?id=${o.code}` });
  }
  for (const e of t.cash.entries.filter((x) => x.status === 'expected' && (x.dueAt ?? x.at) <= to)) {
    out.push({ id: `ev-dep-${e.id}`, at: e.dueAt ?? e.at, kind: 'deposit_due', title: `واریز ${e.orgName ?? ''} · ${e.title}`.trim(), value: e.amount, orgId: e.orgId, orgName: e.orgName, href: `${routes.op.cash}?id=${e.id}` });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function fundForecasts(s: Snapshot, h: number, events = forecastEvents(s, h)): FundForecast[] {
  const A = s.t.assumptions;
  const sp = splitOf({ allocationMode: 'free', cashAllowed: true }, A) as Record<string, number>;
  return s.positions.filter((p) => p.state !== 'inactive').map((p) => {
    const fid = p.fundId;
    const ev = (kind: ForecastEvent['kind']) => sum(events.filter((e) => e.kind === kind).map((e) => e.value * eventShare(e, fid, A)));
    const committedSpare = (fid === 'gold' || fid === 'fixed') ? p.committedValue * (1 - A.acceptanceRate) : 0;
    const demand = r0((A.demandPerDay[fid] ?? 0) * h + (fid in sp && fid !== 'rial' ? (A.newPackagesPerMonth * sp[fid]) / 100 / 30 : 0) * h + ev('planned_package'));
    const returns = r0((A.returnsPerDay[fid] ?? 0) * h + ev('vesting_release') * A.vestingSellBackPct + ev('milestone_due') * A.reclaimRate + committedSpare);
    const projectedEnd = p.availableValue + p.pendingBuyValue - demand + returns;
    const minTarget = minTargetOf(p.demandPerDay, p.target);
    const state = stateOf(true, projectedEnd, minTarget, p.target?.maxFreeValue);
    return {
      fundId: fid, availableNow: p.availableValue, pendingBuy: p.pendingBuyValue, demand, returns, net: returns - demand, projectedEnd: r0(projectedEnd),
      minTarget: r0(minTarget), coverageDays: p.coverageDays, state,
      suggestion: suggestionOf(state, projectedEnd, minTarget, p.target?.maxFreeValue, p.coverageDays !== null ? r1(Math.max(0, projectedEnd) / Math.max(1, p.demandPerDay)) : null, p.target?.targetDays, h),
    };
  });
}

function buckets(s: Snapshot, h: number, events: ForecastEvent[]): ForecastBucket[] {
  const A = s.t.assumptions;
  const act = s.positions.filter((p) => p.state !== 'inactive');
  const funds = act.map((p) => p.fundId);
  const perDay = (rec: Record<string, number>) => sum(funds.map((f) => rec[f] ?? 0));
  const pkgPerDay = sum(funds.map((f) => pkgShare(f, A)));
  const committed = sum(act.map((p) => p.committedValue));
  const share = (e: ForecastEvent) => sum(funds.map((f) => eventShare(e, f, A)));
  const out: ForecastBucket[] = [];
  const start = now().getTime();
  for (let k = 0; k * 7 < h; k++) {
    const from = new Date(start + k * 7 * DAY).toISOString();
    const days = Math.min(7, h - k * 7);
    const to = new Date(start + (k * 7 + days) * DAY).toISOString();
    const inB = (e: ForecastEvent) => (k === 0 ? e.at < to : e.at >= from && e.at < to);
    const evSum = (kind: ForecastEvent['kind']) => sum(events.filter((e) => e.kind === kind && inB(e)).map((e) => e.value * share(e)));
    out.push({
      label: `هفته‌ی ${faDigits(k + 1)}`, from, to,
      commitments: k === 0 ? r0(committed * A.acceptanceRate) : 0,
      newPackages: r0(pkgPerDay * days + evSum('planned_package')),
      userBuys: r0(perDay(A.demandPerDay) * days),
      userSells: r0(perDay(A.returnsPerDay) * days),
      vestingSellBack: r0(evSum('vesting_release') * A.vestingSellBackPct),
      reclaims: r0(evSum('milestone_due') * A.reclaimRate + (k === 1 || (h <= 7 && k === 0) ? committed * (1 - A.acceptanceRate) : 0)),
    });
  }
  return out;
}

const monthsUntil = (iso: string) => Math.max(0.25, (Date.parse(iso) - now().getTime()) / (30 * DAY));

export function targetProgress(s: Snapshot): TargetProgress[] {
  const { d, t, positions } = s;
  const totals = totalsOf(positions, t);
  const monthly = aumMonthlyLive(s);
  const pace = monthly.length >= 4 ? (monthly[monthly.length - 1].aum - monthly[monthly.length - 4].aum) / 3 : 0;
  const pct = (c: number, g: number) => Math.min(100, r1((c / (g || 1)) * 100));
  const out: TargetProgress[] = [];
  const aumNeed = Math.max(0, t.targets.aum.value - totals.heldValue) / monthsUntil(t.targets.aum.by);
  out.push({ key: 'aum', label: 'دارایی تحت مدیریت', current: totals.heldValue, target: t.targets.aum.value, by: t.targets.aum.by, pct: pct(totals.heldValue, t.targets.aum.value), onTrack: pace >= aumNeed, neededPerMonth: r0(aumNeed), unit: 'toman' });
  const activeOrgs = d.organizations.filter((o) => o.status === 'active').length;
  const orgNeed = Math.max(0, t.targets.orgs.value - activeOrgs) / monthsUntil(t.targets.orgs.by);
  out.push({ key: 'orgs', label: 'سازمان‌های فعال', current: activeOrgs, target: t.targets.orgs.value, by: t.targets.orgs.by, pct: pct(activeOrgs, t.targets.orgs.value), onTrack: t.base.pace.orgsPerMonth >= orgNeed, neededPerMonth: r1(orgNeed), unit: 'count' });
  const userNeed = Math.max(0, t.targets.users.value - t.base.users) / monthsUntil(t.targets.users.by);
  out.push({ key: 'users', label: 'کاربران', current: t.base.users, target: t.targets.users.value, by: t.targets.users.by, pct: pct(t.base.users, t.targets.users.value), onTrack: t.base.pace.usersPerMonth >= userNeed, neededPerMonth: r0(userNeed), unit: 'count' });
  const dev = mixDeviation(s);
  out.push({ key: 'mix', label: 'ترکیب دارایی', current: r1(100 - dev.total / 2), target: 100, pct: r1(100 - dev.total / 2), onTrack: dev.max <= 5, unit: 'pct' });
  for (const tg of t.targets.stock) {
    const p = positions.find((x) => x.fundId === tg.fundId);
    if (!p || p.state === 'inactive') continue;
    const cov = p.coverageDays ?? tg.targetDays * 3;
    out.push({ key: `stock:${p.fundId}`, label: `پوشش موجودی ${p.shortName}`, current: r1(cov), target: tg.targetDays, pct: pct(cov, tg.targetDays), onTrack: p.state === 'ok' || p.state === 'surplus', unit: 'days' });
  }
  return out;
}

/** Percentage-point gap between the current mix and the target ('other' = funds without their own key). */
function mixDeviation(s: Snapshot) {
  const mix = s.t.targets.mix;
  const held = sum(s.positions.map((p) => p.heldValue)) || 1;
  const cur: Record<string, number> = {};
  for (const p of s.positions) {
    const k = p.fundId in mix ? p.fundId : 'other';
    cur[k] = (cur[k] ?? 0) + (p.heldValue / held) * 100;
  }
  const keys = new Set([...Object.keys(mix), ...Object.keys(cur)]);
  const gaps = [...keys].map((k) => ({ k, gap: (cur[k] ?? 0) - (mix[k] ?? 0) }));
  return { total: sum(gaps.map((g) => Math.abs(g.gap))), max: Math.max(0, ...gaps.map((g) => Math.abs(g.gap))), gaps };
}

export function plan(s: Snapshot, h: Horizon): TreasuryPlan {
  const events = forecastEvents(s, h);
  const perFund = fundForecasts(s, h, events);
  const recs: Recommendation[] = [];
  // The forecast's buy is the need over the whole horizon. The order suggested today is only what fits now:
  // up to the stock maximum and within the free cash still left (most urgent funds first).
  let cashLeft = Math.max(0, s.cash.available);
  const urgency: Record<StockState, number> = { shortfall: 0, below: 1, ok: 2, surplus: 3, inactive: 4 };
  for (const ff of [...perFund].sort((a, b) => urgency[a.state] - urgency[b.state])) {
    if (!ff.suggestion) continue;
    const p = s.positions.find((x) => x.fundId === ff.fundId)!;
    const buy = ff.suggestion.side === 'buy';
    const severity: Severity = ff.state === 'shortfall' ? 'critical' : ff.state === 'below' ? 'warning' : 'info';
    const id = `rec-${ff.suggestion.side}-${ff.fundId}-${h}`;
    if (!buy) {
      recs.push({
        id, kind: 'redeem', severity, title: `ابطال ${p.shortName}`, reason: ff.suggestion.reason, fundId: ff.fundId, amount: ff.suggestion.amount,
        action: { type: 'order', side: 'redeem', fundId: ff.fundId, amount: ff.suggestion.amount },
      });
      continue;
    }
    const need = ff.suggestion.amount;
    const room = p.target?.maxFreeValue ? p.target.maxFreeValue - (p.availableValue + p.pendingBuyValue) : Infinity;
    const nowAmt = roundDown(Math.max(0, Math.min(need, room, cashLeft)));
    const capped = nowAmt < need;
    const limit = room < need && room <= cashLeft ? 'سقف هدف موجودی' : 'نقدینگی آزاد';
    // when capped, one plain sentence replaces the forecast's reason (which explains the full amount)
    const why = !capped ? ff.suggestion.reason
      : nowAmt >= MIN_ORDER
        ? `تا ${faDigits(h)} روز آینده حدود ${bn(need)} تومان صدور لازم است تا موجودی آزاد بالای حداقل هدف بماند؛ اکنون ${bn(nowAmt)} تومان (به اندازه‌ی ${limit}) و باقی در نوبت‌های بعد.`
        : `تا ${faDigits(h)} روز آینده حدود ${bn(need)} تومان صدور لازم است، ولی نقدینگی آزاد کافی نیست؛ اول واریزهای سازمان‌ها را پیگیری کنید.`;
    if (nowAmt >= MIN_ORDER) {
      cashLeft -= nowAmt;
      recs.push({
        id, kind: 'buy', severity, title: `صدور ${p.shortName}`, reason: why, fundId: ff.fundId, amount: nowAmt, horizonAmount: need,
        action: { type: 'order', side: 'buy', fundId: ff.fundId, amount: nowAmt },
      });
    } else {
      recs.push({
        id, kind: 'buy', severity, title: `صدور ${p.shortName}`, reason: why, fundId: ff.fundId, amount: need, horizonAmount: need,
        action: { type: 'link', href: `${routes.op.cash}${s.cash.overdueCount > 0 ? '?status=overdue' : ''}` },
      });
    }
  }
  const buyTotal = sum(recs.filter((r) => r.kind === 'buy').map((r) => r.horizonAmount ?? r.amount ?? 0));
  if (buyTotal > s.cash.available && s.cash.overdueCount > 0) {
    recs.push({ id: `rec-collect-${h}`, kind: 'collect_deposit', severity: 'warning', title: `پیگیری ${faDigits(s.cash.overdueCount)} واریز معوق`, reason: `صدورهای پیشنهادی ${bn(buyTotal)} تومان است و نقدینگی آزاد ${bn(Math.max(0, s.cash.available))} تومان؛ ${bn(s.cash.overdueAmount)} تومان واریز سازمان‌ها معوق مانده است.`, amount: s.cash.overdueAmount, action: { type: 'link', href: `${routes.op.cash}?status=overdue` } });
  }
  for (const o of s.t.orders.filter((x) => x.status === 'placed' && x.settleAt <= nowIso())) {
    recs.push({ id: `rec-settle-${o.id}`, kind: 'settle', severity: 'warning', title: `ثبت تسویه‌ی ${o.code}`, reason: `سفارش ${o.side === 'buy' ? 'صدور' : 'ابطال'} ${fundName(s.d, o.fundId)} سررسید شده است.`, fundId: o.fundId, amount: o.amount, action: { type: 'link', href: `${routes.op.orders}?id=${o.code}` } });
  }
  const dev = mixDeviation(s);
  if (dev.max > 5) {
    const g = dev.gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
    recs.push({ id: `rec-mix-${h}`, kind: 'rebalance', severity: 'info', title: 'ترکیب دارایی از هدف فاصله دارد', reason: `سهم ${g.k === 'other' ? 'سایر صندوق‌ها' : fundName(s.d, g.k)} ${faDigits(Math.abs(Math.round(g.gap)))} واحد درصد ${g.gap > 0 ? 'بیشتر' : 'کمتر'} از هدف است.`, action: { type: 'link', href: routes.op.planning } });
  }
  const sev: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  recs.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return {
    horizon: h, from: nowIso(), to: daysFromNow(h, '23:59'),
    buckets: buckets(s, h, events), perFund, events, recommendations: recs, progress: targetProgress(s), assumptions: s.t.assumptions,
  };
}

// ───────────────────────── Action queue ─────────────────────────

export function actions(s: Snapshot): ActionItem[] {
  const { d, t, positions } = s;
  const at = nowIso();
  const out: ActionItem[] = [];
  for (const p of positions) {
    const href = routes.op.fund(p.fundId);
    const order = p.suggestion ? { type: 'order' as const, side: p.suggestion.side, fundId: p.fundId, amount: p.suggestion.amount } : undefined;
    if (p.state === 'shortfall') out.push({ id: `act-short-${p.fundId}`, kind: 'stock_shortfall', severity: 'critical', title: `کسری موجودی ${p.shortName}`, sub: `کمبود ${bn(-p.availableValue)} تومان نسبت به تخصیص‌ها و تعهدات`, amount: p.suggestion?.amount, fundId: p.fundId, href, cta: { label: 'ثبت صدور', action: order } });
    if (p.state === 'below') out.push({ id: `act-below-${p.fundId}`, kind: 'stock_below', severity: 'warning', title: `موجودی ${p.shortName} زیر هدف`, sub: p.coverageDays !== null && p.target ? `پوشش ${faDigits(Math.floor(p.coverageDays))} روز از هدف ${faDigits(p.target.targetDays)} روز` : `موجودی آزاد ${bn(p.availableValue)} تومان`, amount: p.suggestion?.amount, fundId: p.fundId, href, cta: { label: 'ثبت صدور', action: order } });
    if (p.state === 'surplus') out.push({ id: `act-surplus-${p.fundId}`, kind: 'stock_surplus', severity: 'info', title: `مازاد موجودی ${p.shortName}`, sub: `موجودی آزاد ${bn(p.availableValue)} تومان، بیش از سقف هدف`, amount: p.suggestion?.amount, fundId: p.fundId, href, cta: { label: 'ثبت ابطال', action: order } });
  }
  for (const o of t.orders.filter((x) => x.status === 'placed' && x.settleAt <= at)) {
    out.push({ id: `act-settle-${o.id}`, kind: 'order_settle', severity: 'warning', title: `تسویه‌ی سفارش ${o.code}`, sub: `${o.side === 'buy' ? 'صدور' : 'ابطال'} ${fundName(d, o.fundId)} · ${bn(o.amount)} تومان`, at: o.settleAt, amount: o.amount, fundId: o.fundId, href: `${routes.op.orders}?id=${o.code}`, cta: { label: 'ثبت تسویه', action: { type: 'settle_order', id: o.id } } });
  }
  const soon = daysFromNow(3, '23:59');
  for (const e of t.cash.entries.filter((x) => x.status === 'expected' && x.kind === 'org_deposit')) {
    const due = e.dueAt ?? e.at;
    const late = due < at;
    if (!late && due > soon) continue;
    const lateDays = Math.round((now().getTime() - Date.parse(due)) / DAY);
    out.push({
      id: `act-dep-${e.id}`, kind: late ? 'deposit_overdue' : 'deposit_expected', severity: late ? (lateDays >= 3 ? 'critical' : 'warning') : 'info',
      title: late ? `واریز معوق ${e.orgName ?? ''}`.trim() : `واریز در راه ${e.orgName ?? ''}`.trim(),
      sub: `${e.title} · ${late ? `${faDigits(Math.max(1, lateDays))} روز از سررسید گذشته` : 'سررسید تا ۳ روز آینده'}`,
      at: due, amount: e.amount, orgId: e.orgId, href: `${routes.op.cash}?id=${e.id}`, cta: { label: 'ثبت دریافت', action: { type: 'confirm_deposit', id: e.id } },
    });
  }
  const meta = (d.extra.opRequestMeta ?? {}) as Record<string, { slaDueAt?: string }>;
  const warnBy = new Date(now().getTime() + 4 * 3_600_000).toISOString();
  const CREDIT_KINDS = new Set(['loan', 'credit_increase', 'installment']);
  for (const r of d.requests) {
    // organization-approved kinds live in the organization panel; credit kinds wait for «تسهیلات و اعتبار»
    if (r.status !== 'pending' || isOrgRequest(r) || (!FEATURES.orgCredit && CREDIT_KINDS.has(r.kind))) continue;
    const sla = meta[r.id]?.slaDueAt ?? new Date(Date.parse(r.createdAt) + DAY).toISOString();
    if (sla > warnBy) continue;
    out.push({ id: `act-sla-${r.id}`, kind: 'request_sla', severity: sla < at ? 'critical' : 'warning', title: `${sla < at ? 'مهلت پاسخ گذشته' : 'نزدیک به پایان مهلت'} · ${r.id}`, sub: `${r.title} · ${r.requesterName}`, at: sla, orgId: r.orgId, href: `${routes.op.requests}?id=${r.id}`, cta: { label: 'بررسی درخواست' } });
  }
  for (const a of d.riskAlerts) {
    if ((a.status !== 'open' && a.status !== 'investigating') || (a.severity !== 'critical' && a.severity !== 'high')) continue;
    out.push({ id: `act-risk-${a.id}`, kind: 'risk_alert', severity: a.severity === 'critical' ? 'critical' : 'warning', title: `${a.title} · ${a.id}`, sub: `${a.userName} · ${a.orgName}`, at: a.createdAt, href: `${routes.op.risk}?id=${a.id}`, cta: { label: 'بررسی هشدار' } });
  }
  const msSoon = daysFromNow(3, '23:59');
  for (const [orgId, list] of Object.entries(d.orgPackages)) {
    for (const pkg of list) {
      if (pkg.status !== 'sent') continue;
      (pkg.milestoneProgress ?? []).forEach((st, i) => {
        if (st.status !== 'pending_approval' || !st.dueDate || st.dueDate > msSoon || st.requiresApproval === false) return;
        out.push({ id: `act-ms-${pkg.id}-${st.id}`, kind: 'milestone_due', severity: 'info', title: `مرحله‌ی ${faDigits(i + 1)} «${pkg.title}»`, sub: `${orgName(d, orgId) ?? ''} · در انتظار تأیید سازمان`, at: st.dueDate, orgId, href: routes.op.organization(orgId), cta: { label: 'مشاهده‌ی سازمان' } });
      });
    }
  }
  for (const o of d.organizations.filter((x) => x.status === 'onboarding')) {
    out.push({ id: `act-onb-${o.id}`, kind: 'org_onboarding', severity: 'info', title: `راه‌اندازی ${o.name}`, sub: 'قرارداد در حال راه‌اندازی؛ هنوز بسته‌ای ارسال نشده', at: o.contractStart, orgId: o.id, href: routes.op.organization(o.id), cta: { label: 'تکمیل راه‌اندازی' } });
  }
  const status = d.extra.opSystemStatus as { incidents?: { id: string; at: string; title: string; sub: string; severity: string; state: string }[] } | undefined;
  for (const inc of status?.incidents ?? []) {
    if (inc.state !== 'open') continue;
    out.push({ id: `act-inc-${inc.id}`, kind: 'service_incident', severity: inc.severity === 'high' ? 'critical' : 'warning', title: inc.title, sub: inc.sub, at: inc.at, href: routes.op.settings, cta: { label: 'وضعیت سرویس‌ها' } });
  }
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.at ?? '9').localeCompare(b.at ?? '9'));
}

// ───────────────────────── Activity ─────────────────────────

export function logActivity(e: Omit<ActivityEvent, 'id' | 'at'> & { at?: string }) {
  const t = treasuryOf();
  if (!t) return;
  t.activity.unshift({ ...e, id: newId('ev'), at: e.at ?? nowIso() });
  if (t.activity.length > 500) t.activity.length = 500;
}

export function activityPage(d: MockDB, f: ActivityFilter): ActivityPage {
  const t = T(d);
  const q = f.q?.trim();
  const base = t.activity.filter((e) =>
    (!f.category || f.category === 'all' || e.category === f.category)
    && (!f.orgId || e.orgId === f.orgId)
    && (!f.userId || e.actor.id === f.userId || !!e.refs?.some((r) => r.id === f.userId))
    && (!q || [e.title, e.sub, e.actor.name, e.orgName].some((x) => x?.includes(q))));
  const kinds: ActorKind[] = ['user', 'org', 'operator', 'system'];
  const counts = { all: base.length, ...Object.fromEntries(kinds.map((k) => [k, base.filter((e) => e.actor.kind === k).length])) } as ActivityPage['counts'];
  // `actor`: one kind or a comma list (the console's «سامانه» group = operator + system)
  const actors = f.actor && f.actor !== 'all' ? (Array.isArray(f.actor) ? f.actor : String(f.actor).split(',')) : null;
  const list = (actors ? base.filter((e) => actors.includes(e.actor.kind)) : base).sort((a, b) => b.at.localeCompare(a.at));
  const offset = Math.max(0, Number(f.offset) || 0);
  const limit = Math.max(1, Math.min(200, Number(f.limit) || 50));
  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = daysFromNow(-(13 - i), '12:00');
    const k = dayKey(date);
    const day = base.filter((e) => dayKey(e.at) === k);
    return { date, user: day.filter((e) => e.actor.kind === 'user').length, org: day.filter((e) => e.actor.kind === 'org').length, operator: day.filter((e) => e.actor.kind === 'operator').length, system: day.filter((e) => e.actor.kind === 'system').length };
  });
  return { items: list.slice(offset, offset + limit), total: list.length, counts, daily };
}

// ───────────────────────── Ledger writers ─────────────────────────

function pushCash(t: TreasuryStore, e: Omit<CashEntry, 'id' | 'at'> & { at?: string }): CashEntry {
  const entry: CashEntry = { ...e, id: newId('ce'), at: e.at ?? nowIso() };
  t.cash.entries.unshift(entry);
  return entry;
}
function pushMovement(t: TreasuryStore, m: Omit<StockMovement, 'id' | 'at'> & { at?: string }) {
  t.movements.unshift({ ...m, id: newId('mv'), at: m.at ?? nowIso(), units: ru(m.units), value: r0(m.value) });
  if (t.movements.length > 600) t.movements.length = 600;
}

// ───────────────────────── Flow hooks (called by core handlers) ─────────────────────────

/** org.ts — a package was sent: the organization's deposit becomes expected (due in 3 days). */
export function onPackageSent(orgId: string, pkg: OrgPackage, actorName?: string) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  const oName = orgName(d, orgId);
  pushCash(t, { kind: 'org_deposit', amount: pkg.total, status: 'expected', title: `واریز «${pkg.title}»`, orgId, orgName: oName, packageId: pkg.id, dueAt: daysFromNow(3, '12:00') });
  logActivity({
    actor: { kind: 'org', id: orgId, name: actorName ?? oName ?? orgId }, orgId, orgName: oName, category: 'package', kind: 'package_sent',
    title: `ارسال «${pkg.title}»`, sub: `${faDigits(pkg.recipients.length)} گیرنده · واریز مورد انتظار تا ۳ روز`, amount: pkg.total, tone: 'primary',
    href: routes.op.organization(orgId), refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
}

/** org.ts — a package was cancelled: an expected deposit for it is cancelled too (commitments drop on their own). */
export function onPackageCancelled(pkg: OrgPackage) {
  const t = treasuryOf();
  if (!t) return;
  for (const e of t.cash.entries) if (e.packageId === pkg.id && e.status === 'expected') e.status = 'cancelled';
}

/** app.ts — an employee accepted a package: its fund parts leave the free stock. */
export function onPackageAccepted(ud: UserData, pkg: InboxPackage, split: AllocationSplit) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  for (const [fid, pct] of [['gold', split.gold], ['fixed', split.fixed]] as const) {
    if (!pct) continue;
    const amt = r0((pkg.amount * pct) / 100);
    pushMovement(t, { fundId: fid, kind: 'allocate', units: -toUnits(amt, navOf(d, fid)), value: amt, title: `تخصیص «${pkg.title}» به ${ud.profile.fullName}`, orgId: pkg.orgId, userId: ud.profile.id, userName: ud.profile.fullName, packageId: pkg.packageId });
  }
  const parts = [split.gold ? `طلا ${faDigits(split.gold)}٪` : '', split.fixed ? `درآمد ثابت ${faDigits(split.fixed)}٪` : '', split.rial ? `ریال ${faDigits(split.rial)}٪` : ''].filter(Boolean).join(' · ');
  logActivity({
    actor: { kind: 'user', id: ud.profile.id, name: ud.profile.fullName }, orgId: pkg.orgId, orgName: pkg.orgName, category: 'package', kind: 'package_accepted',
    title: `تأیید دریافت «${pkg.title}»`, sub: parts, amount: pkg.amount, tone: 'success', href: routes.op.user(ud.profile.id),
    refs: [{ type: 'package', id: pkg.packageId, label: pkg.title }, { type: 'user', id: ud.profile.id }],
  });
}

/** app.ts — a user bought from / sold back to the stock (rial ⇄ fund). */
export function onUserTrade(ud: UserData, f: Fund, direction: 'buy' | 'sell', amount: number, fee: number) {
  const t = treasuryOf();
  if (!t) return;
  const buy = direction === 'buy';
  const value = buy ? amount - fee : amount;
  pushMovement(t, { fundId: f.id, kind: buy ? 'user_buy' : 'user_sell', units: (buy ? -1 : 1) * toUnits(value, f.nav), value, title: `${buy ? 'خرید' : 'فروش'} ${f.shortName} · ${ud.profile.fullName}`, orgId: ud.profile.orgId || undefined, userId: ud.profile.id, userName: ud.profile.fullName });
  logActivity({
    actor: { kind: 'user', id: ud.profile.id, name: ud.profile.fullName }, orgId: ud.profile.orgId || undefined, orgName: ud.profile.orgName || undefined, category: 'trade',
    kind: buy ? 'user_buy' : 'user_sell', title: `${buy ? 'خرید' : 'فروش'} ${f.name}`, sub: buy ? 'از موجودی آزاد خزانه' : 'به موجودی آزاد خزانه برگشت',
    amount, fundId: f.id, units: ru(toUnits(value, f.nav)), tone: buy ? 'info' : 'neutral', href: routes.op.user(ud.profile.id), refs: [{ type: 'user', id: ud.profile.id }],
  });
}

/** app.ts — money into / out of a user's wallet through the platform account. `dest` = a fund when the deposit buys it. */
export function onUserCash(ud: UserData, kind: 'deposit' | 'withdrawal', amount: number, dest?: string) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  const dep = kind === 'deposit';
  pushCash(t, { kind: dep ? 'user_deposit' : 'user_withdrawal', amount: dep ? amount : -amount, status: 'done', title: `${dep ? 'واریز' : 'برداشت'} ${ud.profile.fullName}`, userId: ud.profile.id, orgId: ud.profile.orgId || undefined, orgName: ud.profile.orgName || undefined });
  const f = dest && dest !== 'rial' ? d.funds.find((x) => x.id === dest) : undefined;
  if (f) pushMovement(t, { fundId: f.id, kind: 'user_buy', units: -toUnits(amount, f.nav), value: amount, title: `واریز و خرید ${f.shortName} · ${ud.profile.fullName}`, userId: ud.profile.id, userName: ud.profile.fullName, orgId: ud.profile.orgId || undefined });
  logActivity({
    actor: { kind: 'user', id: ud.profile.id, name: ud.profile.fullName }, orgId: ud.profile.orgId || undefined, orgName: ud.profile.orgName || undefined, category: 'cash',
    kind: dep ? 'user_deposit' : 'user_withdrawal', title: dep ? (f ? `واریز و خرید ${f.name}` : 'واریز به کیف پول ریالی') : 'برداشت به حساب بانکی',
    amount, fundId: f?.id, tone: dep ? 'success' : 'neutral', href: routes.op.user(ud.profile.id), refs: [{ type: 'user', id: ud.profile.id }],
  });
}

/**
 * org.ts — a milestone step was released or reclaimed. People modelled one by one are already updated by the
 * caller; for everyone else the baseline drops (reserved on release, reserved + allocated on reclaim).
 * A reclaimed share goes back to the free stock.
 */
export function onStepSettled(kind: 'released' | 'reclaimed', pkg: OrgPackage, step: MilestoneStep, decidedBy: string, orgId?: string) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  orgId ??= Object.entries(d.orgPackages).find(([, list]) => list.includes(pkg))?.[0];
  const oName = orgName(d, orgId);
  const sp = splitOf(pkg, t.assumptions);
  const back: Record<string, number> = {};
  let total = 0;
  for (const r of pkg.recipients) {
    if (r.status !== 'accepted') continue;
    const amt = (r.amount * step.sharePct) / 100;
    total += amt;
    for (const fid of ['gold', 'fixed'] as const) {
      const share = (amt * sp[fid]) / 100;
      if (!share) continue;
      if (kind === 'reclaimed') back[fid] = (back[fid] ?? 0) + share;
      if (d.users[r.employeeId]) continue; // already updated through the app user's holdings
      const u = toUnits(share, navOf(d, fid));
      const rs = (t.base.reservedUnits[fid] ??= zeroLocks());
      rs.milestone = Math.max(0, rs.milestone - u);
      if (kind === 'reclaimed') t.base.allocatedUnits[fid] = Math.max(0, (t.base.allocatedUnits[fid] ?? 0) - u);
    }
  }
  const idx = (pkg.milestoneProgress ?? []).indexOf(step) + 1;
  for (const [fid, v] of Object.entries(back)) {
    pushMovement(t, { fundId: fid, kind: 'reclaim', units: toUnits(v, navOf(d, fid)), value: v, title: `بازپس‌گیری مرحله‌ی ${faDigits(idx)} «${pkg.title}»`, orgId, packageId: pkg.id });
  }
  const sys = decidedBy === SYSTEM_ACTOR;
  logActivity({
    actor: sys ? { kind: 'system', name: SYSTEM_ACTOR } : { kind: 'org', id: orgId, name: decidedBy }, orgId, orgName: oName, category: 'reserve',
    kind: kind === 'released' ? 'milestone_released' : 'milestone_reclaimed',
    title: `${kind === 'released' ? 'آزادسازی' : 'بازپس‌گیری'} مرحله‌ی ${faDigits(idx)} «${pkg.title}»`,
    sub: kind === 'released' ? (sys ? `«${step.title}» در سررسید آزاد شد` : `«${step.title}» تأیید شد`) : `«${step.title}» · به موجودی آزاد خزانه برگشت`,
    amount: r0(total), tone: kind === 'released' ? 'success' : 'warning', href: orgId ? routes.op.organization(orgId) : undefined,
    refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
}
