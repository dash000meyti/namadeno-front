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
 *   available  = held − allocated − committed − pending redeem   (never negative)
 * Nothing goes negative anywhere: what the fund stock or Namadno's free rial cannot cover waits in the queue («صف تأمین»):
 *   packages «در انتظار تأمین موجودی» (`awaiting_stock`), users' purchases and accepted fund parts waiting for stock, users'
 *   sales waiting for free rial. The queue is served oldest first as soon as it is covered (fillQueues, run on every request);
 *   new demand is served only from what is left after the queue. queued − available = «نیاز به خرید» (state need_buy).
 * Rial (everything users and organizations do is in rial; funds are back-office policy):
 *   bank       = opening + Σ done cash entries
 *   orders     cash first: «صدور / ابطال» is recorded only when done — settled at once (held units, cash, movement), then
 *              the queue is served; there are no open or due orders («سررسید تسویه»), so pending buy / redeem / tied are 0
 *   org rial   balance = approved deposits − paid to recipients + reclaimed shares; blocked = pending recipients of its
 *              sent packages (whole amounts, plus the unmodelled baseline) — always ≤ balance: a package is sent only when paid;
 *              setAside = the part of «آزاد» kept for its packages waiting for receipt approval; free = (balance − blocked − setAside)⁺
 *   «ریال رزرو» held = Σ blocked          «ریال» held = bank − «ریال رزرو» held
 *   Namadno free rial (cash available) = «ریال» held − user wallets − organizations' free and set-aside − tied in buy orders
 *   Organizations deposit by receipt («فیش واریز»): pending until the operator approves (→ balance) or rejects; never overdue.
 *   A package «آزاد» does not cover waits in a queue (`awaiting_payment`): nothing is delivered or blocked, only the part
 *   «آزاد» covered is set aside; when its receipt is approved it is delivered. Nothing is ever unfunded.
 *
 * Imports only db.ts and lib. Core handlers call the small flow hooks at the bottom (onPackageSent …).
 */
import type { AllocationSplit, Fund, Holding, InboxPackage, Lock, LockPolicy, LockType, MilestoneStep, OrgPackage, Organization } from '@/types/domain';
import type {
  ActionItem, ActivityEvent, ActivityFilter, ActivityPage, ActorKind, CashEntry, CashSummary, ForecastBucket, ForecastEvent,
  FundForecast, Horizon, OrderQuote, OrderSide, OrgRialAccount, OrgTreasuryDetail, OrgTreasuryRow, QueueItem, ReceiptFile, Recommendation,
  RialMove, RialTreasury, Severity, StockMovement,
  StockState, StockSuggestion, TargetProgress, TargetsPatch, TreasuryAssumptions, TreasuryOrder, TreasuryPlan, TreasuryPosition,
  TreasuryPositionDetail, TreasurySummary, TreasuryTargets, TreasuryTotals,
} from '@/api/op-treasury-extra';
import type { OrgContractExt } from '@/api/op-core-extra';
import type { FundMeta } from '@/api/op-system-extra';
import { db, newId, recalcHoldings, type MockDB, type UserData } from './db';
import { daysFromNow, jalaliToIso, now } from '@/lib/clock';
import { faDigits, jDate, jDateTime, money, units } from '@/lib/format';
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

/**
 * A user's purchase / accepted fund part waiting for stock, or a sale waiting for Namadno's free rial. The money of a
 * waiting purchase has already left the wallet (still the user's: counted in userWallets); a waiting sale's units are
 * already back in the stock and its rial is paid when free rial covers it. No `userId` = aggregated unmodelled users.
 */
export interface StockWait {
  id: string;
  kind: 'buy' | 'accept' | 'sell';
  fundId: string;
  /** buy / accept: value of the units to deliver · sell: rial to pay. */
  value: number;
  /** buy: the fee already taken (part of the money in transit). */
  fee?: number;
  /** sell: units given back. */
  units?: number;
  userId?: string;
  userName: string;
  orgId?: string;
  count?: number;
  title: string;
  at: string;
  eta: string;
  status: 'waiting' | 'filled';
  filledAt?: string;
  txId?: string;
  packageId?: string;
  /** accept: the reservation of the package to put on the units when they arrive. */
  lock?: { title: string; sourceId: string; policy: LockPolicy };
}
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
    /** Reserved part of `userRial` (e.g. card collateral of unmodelled users). */
    userRialReserved?: number;
    orgs: Record<string, BaseOrg>;
    activeUsers: number;
    users: number;
    pace: { orgsPerMonth: number; usersPerMonth: number };
    schedule: ForecastEvent[];
  };
  held: Record<string, { units: number; cost: number }>;
  orders: StoredOrder[];
  cash: { opening: number; entries: CashEntry[] };
  /**
   * Organizations' rial accounts: `balance` moves with deposits, payouts to recipients and reclaims;
   * `blockedBase` = blocked money of packages the mock does not model one by one (other organizations).
   */
  orgRial?: Record<string, { balance: number; blockedBase: number }>;
  movements: StockMovement[];
  activity: ActivityEvent[];
  /** Users' purchases / accepted fund parts waiting for stock and sales waiting for free rial (see StockWait). */
  waits?: StockWait[];
  targets: TreasuryTargets;
  assumptions: TreasuryAssumptions;
  /** 90 daily points, oldest first; the last point is replaced by the live value when served. */
  history: {
    available: Record<string, number[]>;
    held: Record<string, number[]>;
    balance: number[];
    cashAvailable: number[];
    /** «ریال رزرو» held per day. */
    reserve?: number[];
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
  /** Reserved part of the modelled rial wallets. */
  rialLocked: number;
  org: Record<string, OrgAgg>;
}
const emptyOrgAgg = (): OrgAgg => ({ value: 0, fundValue: 0, reserved: 0, reservedByType: zeroLocks(), people: 0 });

export function modelledAgg(d: MockDB): Agg {
  const agg: Agg = { units: {}, reserved: {}, rial: 0, rialLocked: 0, org: {} };
  for (const m of members(d)) {
    const o = m.orgId ? (agg.org[m.orgId] ??= emptyOrgAgg()) : undefined;
    if (o) o.people += 1;
    for (const h of m.holdings) {
      const lockSum = sum(h.locks.map((l) => l.amount));
      if (h.kind === 'rial') {
        agg.rial += h.value;
        agg.rialLocked += Math.min(h.value, lockSum);
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


// ───────────────────────── Queue («صف تأمین»): nothing goes negative ─────────────────────────

const waitsOf = (t: TreasuryStore) => (t.waits ??= []);

/** Fund parts (Toman) of a package by its split — what it takes from the stock (gold / fixed). */
export function packageParts(pkg: Pick<OrgPackage, 'total' | 'allocationMode' | 'fixedSplit' | 'cashAllowed'>, A: TreasuryAssumptions): Record<string, number> {
  const sp = splitOf(pkg, A);
  const out: Record<string, number> = {};
  if (sp.gold > 0) out.gold = (pkg.total * sp.gold) / 100;
  if (sp.fixed > 0) out.fixed = (pkg.total * sp.fixed) / 100;
  return out;
}

/** The latest promise for an item waiting on a fund: its settlement + one working day (72h for T+2). */
export function etaFor(f?: Fund): string {
  const days = (f ? settlementDays(f) : 2) + 1;
  return new Date(now().getTime() + days * DAY).toISOString();
}

interface Waiting { id: string; at: string; eta: string; parts: Record<string, number>; rial: number; pkg?: { orgId: string; p: OrgPackage }; wait?: StockWait }

/** Everything waiting for stock or free rial, oldest first. */
function waiting(d: MockDB, t: TreasuryStore): Waiting[] {
  const out: Waiting[] = [];
  for (const [orgId, list] of Object.entries(d.orgPackages)) {
    for (const p of list) {
      if (p.status !== 'awaiting_stock') continue;
      out.push({ id: p.id, at: p.stockQueuedAt ?? p.submittedAt ?? p.createdAt, eta: p.stockEta ?? etaFor(), parts: packageParts(p, t.assumptions), rial: 0, pkg: { orgId, p } });
    }
  }
  for (const w of waitsOf(t)) {
    if (w.status !== 'waiting') continue;
    out.push(w.kind === 'sell'
      ? { id: w.id, at: w.at, eta: w.eta, parts: {}, rial: w.value, wait: w }
      : { id: w.id, at: w.at, eta: w.eta, parts: { [w.fundId]: w.value }, rial: 0, wait: w });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export interface Queued { fund: Record<string, { value: number; count: number; needBy?: string }>; rial: { value: number; count: number; needBy?: string } }
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);
function queuedOf(d: MockDB, t: TreasuryStore): Queued {
  const q: Queued = { fund: {}, rial: { value: 0, count: 0 } };
  for (const w of waiting(d, t)) {
    for (const [f, v] of Object.entries(w.parts)) {
      const x = (q.fund[f] ??= { value: 0, count: 0 });
      x.value += v; x.count += w.wait?.count ?? 1; x.needBy = earlier(x.needBy, w.eta);
    }
    if (w.rial) { q.rial.value += w.rial; q.rial.count += w.wait?.count ?? 1; q.rial.needBy = earlier(q.rial.needBy, w.eta); }
  }
  return q;
}

/** The queue as list rows (one row per fund part of a package), oldest first; optionally one fund or 'rial'. */
export function queueItems(d: MockDB, fundId?: string): QueueItem[] {
  const t = T(d);
  const out: QueueItem[] = [];
  for (const w of waiting(d, t)) {
    if (w.pkg) {
      const { orgId, p } = w.pkg;
      for (const [f, v] of Object.entries(w.parts)) {
        out.push({ id: `${p.id}:${f}`, kind: 'package', fundId: f, value: r0(v), title: `«${p.title}» · ${faDigits(p.recipients.length)} همکار`, orgId, orgName: orgName(d, orgId), packageId: p.id, at: w.at, eta: w.eta });
      }
      continue;
    }
    const x = w.wait!;
    out.push({ id: x.id, kind: x.kind, fundId: x.kind === 'sell' ? 'rial' : x.fundId, value: r0(x.value), title: x.title, orgId: x.orgId, orgName: orgName(d, x.orgId), userId: x.userId, userName: x.userName, packageId: x.packageId, count: x.count, at: x.at, eta: x.eta });
  }
  return fundId ? out.filter((i) => i.fundId === fundId) : out;
}

/** Free stock a new demand may use now: what is left after the queue (Toman, ≥ 0). */
export function stockRoom(s: Snapshot, fundId: string) {
  const p = s.positions.find((x) => x.fundId === fundId);
  return p ? Math.max(0, p.availableValue - p.queuedValue) : 0;
}
/** Namadno's free rial a new payout may use now: what is left after the sales waiting for it. */
export const rialRoom = (s: Snapshot) => Math.max(0, s.cash.available - s.queued.rial.value);

/** Whether the stock (after the queue) covers a package's fund parts now; otherwise what is missing and the promise. */
export function stockCheck(d: MockDB, pkg: Pick<OrgPackage, 'total' | 'allocationMode' | 'fixedSplit' | 'cashAllowed'>): { ok: boolean; eta: string; missing: Record<string, number> } {
  const t = treasuryOf(d);
  if (!t) return { ok: true, eta: nowIso(), missing: {} };
  const s = snapshot(d);
  const missing: Record<string, number> = {};
  let eta = nowIso();
  for (const [f, v] of Object.entries(packageParts(pkg, t.assumptions))) {
    const room = stockRoom(s, f);
    if (v <= room + 1) continue;
    missing[f] = r0(v - room);
    const e = etaFor(d.funds.find((x) => x.id === f));
    if (e > eta) eta = e;
  }
  return { ok: !Object.keys(missing).length, eta, missing };
}

let deliverQueued: ((orgId: string, pkgId: string) => boolean) | null = null;
/** org.ts registers how a package leaves the stock queue (sent, inbox items, budget, activity). */
export function registerPackageDelivery(fn: (orgId: string, pkgId: string) => boolean) { deliverQueued = fn; }

let filling = false;
/**
 * Serves the queue oldest first while the stock / free rial covers it (strict order per fund: an item that does not fit
 * keeps its place and what arrives goes to it first). Run on every request; returns whether anything was fulfilled.
 */
export function fillQueues(d: MockDB = db()): boolean {
  const t = treasuryOf(d);
  if (!t || filling) return false;
  const items = waiting(d, t);
  if (!items.length) return false;
  filling = true;
  try {
    const s = snapshot(d);
    const room: Record<string, number> = Object.fromEntries(s.positions.map((p) => [p.fundId, p.availableValue]));
    let rial = s.cash.available;
    let changed = false;
    for (const it of items) {
      const fits = Object.entries(it.parts).every(([f, v]) => v <= (room[f] ?? 0) + 1) && it.rial <= rial + 1;
      for (const [f, v] of Object.entries(it.parts)) room[f] = (room[f] ?? 0) - v;
      rial -= it.rial;
      if (!fits) continue;
      if (it.pkg) { if (deliverQueued?.(it.pkg.orgId, it.pkg.p.id)) changed = true; continue; }
      if (it.wait) { fulfilWait(d, t, it.wait); changed = true; }
    }
    return changed;
  } finally {
    filling = false;
  }
}

function holdingFor(d: MockDB, ud: UserData, fundId: string): Holding {
  let h = ud.holdings.find((x) => x.kind === fundId);
  if (!h) {
    const f = d.funds.find((x) => x.id === fundId);
    h = { kind: fundId as Holding['kind'], fundId, name: f?.name ?? fundId, units: 0, value: 0, free: 0, locked: 0, change: 0, changePct: 0, locks: [] };
    ud.holdings.push(h);
  }
  return h;
}
function notifyUser(ud: UserData, title: string, body: string, href?: string) {
  ud.notifications.unshift({ id: newId('nt'), at: nowIso(), read: false, title: faDigits(title), body: faDigits(body), tone: 'success', icon: 'check', href });
}
/** The reservation of an accepted package, put on units that arrived later (same as on acceptance). */
function lockOf(fundId: string, value: number, l: NonNullable<StockWait['lock']>): Lock | null {
  const base = { id: newId('lk'), holdingKind: fundId as Lock['holdingKind'], amount: value, title: l.title, createdAt: nowIso(), sourceId: l.sourceId };
  if (l.policy.type === 'vesting') return { ...base, type: 'vesting', condition: 'آزاد در ' + jDate(l.policy.releaseAt), releaseAt: l.policy.releaseAt };
  if (l.policy.type === 'milestone') {
    return {
      ...base, type: 'milestone', condition: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود', contractTotal: value,
      steps: l.policy.steps.map((x, i) => ({ id: `ms-${i + 1}`, title: x.title, sharePct: x.sharePct, dueDate: x.dueDate, requiresApproval: x.requiresApproval !== false, status: i === 0 ? 'pending_approval' : 'future' })),
    };
  }
  return null;
}

/** A waiting purchase gets its units (or a waiting sale its rial): the user is notified, the transaction completes. */
function fulfilWait(d: MockDB, t: TreasuryStore, w: StockWait) {
  const at = nowIso();
  w.status = 'filled';
  w.filledAt = at;
  const f = d.funds.find((x) => x.id === w.fundId);
  const ud = w.userId ? d.users[w.userId] : undefined;
  const tx = ud && w.txId ? ud.transactions.find((x) => x.id === w.txId) : undefined;
  const done = (label: string) => {
    if (!tx) return;
    tx.status = 'success';
    // an accepted package: only this fund's «در انتظار تأمین …» line becomes «تحویل …»; a trade: its waiting lines go
    const waitLabel = `در انتظار تأمین ${f?.shortName ?? w.fundId}`;
    const keep = (x: { label: string }) => (w.kind === 'accept' ? x.label !== waitLabel : x.label !== 'تأمین تا' && x.label !== 'وضعیت' && x.label !== 'واریز تا');
    tx.details = [...(tx.details ?? []).filter(keep), { label: w.kind === 'accept' ? `تحویل ${f?.shortName ?? ''}`.trim() : label, value: faDigits(jDateTime(at)) }];
  };
  if (w.kind === 'sell') {
    if (ud) { const h = holdingFor(d, ud, 'rial'); h.value += w.value; recalcHoldings(ud); }
    else t.base.userRial += w.value;
    done('واریز');
    if (ud) notifyUser(ud, `واریز فروش ${f?.shortName ?? ''}`.trim(), `${money(w.value)} تومان به کیف پول ریالی شما واریز شد.`, w.txId ? routes.app.transaction(w.txId) : routes.app.history());
    logActivity({
      actor: { kind: 'system', name: SYSTEM_ACTOR }, orgId: w.orgId, orgName: orgName(d, w.orgId), category: 'trade', kind: 'queue_sale_paid',
      title: `پرداخت فروش در صف · ${w.userName}`, sub: `${f?.shortName ?? ''} · از ریال آزاد نمادنو`, amount: w.value, fundId: w.fundId, tone: 'success',
      href: w.userId ? routes.op.user(w.userId) : routes.op.cash, refs: w.userId ? [{ type: 'user', id: w.userId }] : undefined,
    });
    return;
  }
  const u = toUnits(w.value, f?.nav ?? 0);
  if (ud) {
    const h = holdingFor(d, ud, w.fundId);
    h.units = (h.units ?? 0) + u;
    const l = w.lock ? lockOf(w.fundId, w.value, w.lock) : null;
    if (l) h.locks.push(l);
    recalcHoldings(ud);
  } else {
    t.base.allocatedUnits[w.fundId] = (t.base.allocatedUnits[w.fundId] ?? 0) + u;
  }
  pushMovement(t, {
    fundId: w.fundId, kind: w.kind === 'accept' ? 'allocate' : 'user_buy', units: -u, value: w.value,
    title: `تحویل از صف · ${w.title}`, orgId: w.orgId, userId: w.userId, userName: w.userName, packageId: w.packageId,
  });
  done('تحویل');
  if (ud) notifyUser(ud, `${f?.name ?? 'صندوق'} تحویل شد`, `${money(w.value)} تومان ${f?.name ?? ''} به دارایی شما اضافه شد.`, routes.app.asset(w.fundId));
  logActivity({
    actor: { kind: 'system', name: SYSTEM_ACTOR }, orgId: w.orgId, orgName: orgName(d, w.orgId), category: 'trade', kind: 'queue_filled',
    title: `تحویل از صف تأمین · ${f?.shortName ?? w.fundId}`, sub: `${w.userName}${w.count ? ` · ${faDigits(w.count)} سفارش` : ''} · ${w.title}`,
    amount: w.value, fundId: w.fundId, units: ru(u), tone: 'success', href: routes.op.fund(w.fundId),
    refs: w.userId ? [{ type: 'user', id: w.userId }] : undefined,
  });
}

/** app.ts — a purchase the stock does not cover (after the queue): the money is already taken, the units come later. */
export function queueBuy(ud: UserData, f: Fund, value: number, fee: number, txId: string): StockWait {
  const t = T(db());
  const w: StockWait = {
    id: newId('qw'), kind: 'buy', fundId: f.id, value, fee, userId: ud.profile.id, userName: ud.profile.fullName, orgId: ud.profile.orgId || undefined,
    title: `خرید ${f.name}`, at: nowIso(), eta: etaFor(f), status: 'waiting', txId,
  };
  waitsOf(t).push(w);
  logActivity({
    actor: { kind: 'user', id: ud.profile.id, name: ud.profile.fullName }, orgId: w.orgId, orgName: ud.profile.orgName || undefined, category: 'trade', kind: 'queue_buy',
    title: `خرید ${f.name} · در صف تأمین`, sub: `موجودی آزاد کافی نبود · تحویل تا ${faDigits(jDateTime(w.eta))}`, amount: value, fundId: f.id, tone: 'warning',
    href: routes.op.fund(f.id), refs: [{ type: 'user', id: ud.profile.id }],
  });
  return w;
}

/** app.ts — the fund part of an accepted package the stock does not cover yet (its reservation goes on when it arrives). */
export function queueAccept(ud: UserData, pkg: InboxPackage, fundId: string, value: number): StockWait {
  const d = db();
  const t = T(d);
  const f = d.funds.find((x) => x.id === fundId);
  const lock = pkg.lockPolicy.type === 'vesting' || pkg.lockPolicy.type === 'milestone' ? { title: pkg.title, sourceId: pkg.packageId, policy: pkg.lockPolicy } : undefined;
  const w: StockWait = {
    id: newId('qw'), kind: 'accept', fundId, value, userId: ud.profile.id, userName: ud.profile.fullName, orgId: pkg.orgId,
    title: `سهم ${f?.shortName ?? fundId} «${pkg.title}»`, at: nowIso(), eta: etaFor(f), status: 'waiting', packageId: pkg.packageId, lock,
  };
  waitsOf(t).push(w);
  return w;
}

/** app.ts — a sale Namadno's free rial does not cover (after the queue): the units are back in the stock, the rial comes later. */
export function queueSell(ud: UserData, f: Fund, proceeds: number, unitsBack: number, txId: string): StockWait {
  const t = T(db());
  const w: StockWait = {
    id: newId('qw'), kind: 'sell', fundId: f.id, value: proceeds, units: unitsBack, userId: ud.profile.id, userName: ud.profile.fullName, orgId: ud.profile.orgId || undefined,
    title: `فروش ${f.name}`, at: nowIso(), eta: etaFor(f), status: 'waiting', txId,
  };
  waitsOf(t).push(w);
  logActivity({
    actor: { kind: 'user', id: ud.profile.id, name: ud.profile.fullName }, orgId: w.orgId, orgName: ud.profile.orgName || undefined, category: 'trade', kind: 'queue_sell',
    title: `فروش ${f.name} · در صف واریز`, sub: `ریال آزاد نمادنو کافی نبود · واریز تا ${faDigits(jDateTime(w.eta))}`, amount: proceeds, fundId: f.id, tone: 'warning',
    href: routes.op.cash, refs: [{ type: 'user', id: ud.profile.id }],
  });
  return w;
}

/** app.ts — room for one recipient's fund part on acceptance: free stock after the queue + this recipient's own commitment. */
export function acceptRoom(ud: UserData, pkg: InboxPackage, fundId: string): number {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return Infinity;
  const s = snapshot(d);
  const op = pkg.orgId ? (d.orgPackages[pkg.orgId] ?? []).find((x) => x.id === pkg.packageId) : undefined;
  let own = 0;
  if (op && op.status === 'sent') {
    const r = op.recipients.find((x) => x.employeeId === ud.profile.id && x.status === 'pending');
    const sp = splitOf(op, t.assumptions) as Record<string, number>;
    if (r) own = (r.amount * (1 - reclaimedPct(op) / 100) * (sp[fundId] ?? 0)) / 100;
  }
  return stockRoom(s, fundId) + own;
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

/** The lower edge of a fund's target band: its minimum free stock (cover days are not used any more). */
const minTargetOf = (_net: number, target?: { minFreeValue: number }) => { void _net; return target ? target.minFreeValue : 0; };

/** `freeValue` = free stock after the queue; below zero = items wait for this fund → «نیاز به خرید». */
function stateOf(active: boolean, freeValue: number, minTarget: number, max?: number): StockState {
  if (!active) return 'inactive';
  if (freeValue < -1) return 'need_buy';
  const availableValue = freeValue;
  if (minTarget > 0 && availableValue < minTarget) return 'below';
  if (max && availableValue > max) return 'surplus';
  return 'ok';
}

function suggestionOf(state: StockState, freeValue: number, minTarget: number, max: number | undefined, coverage: number | null, targetDays: number | undefined, horizon?: number, queue?: { count: number; needBy?: string }): StockSuggestion | undefined {
  if (state === 'need_buy' || state === 'shortfall' || state === 'below') {
    const amount = roundUp(Math.max(minTarget, 0) - freeValue);
    if (amount < MIN_ORDER) return undefined;
    const when = horizon ? `تا ${faDigits(horizon)} روز آینده` : 'اکنون';
    const reason = state === 'need_buy' || state === 'shortfall'
      ? (horizon
        ? `${when} تقاضا از موجودی آزاد بیشتر می‌شود؛ این مبلغ را از پیش بخرید تا چیزی در صف تأمین نماند و موجودی به حداقل هدف برسد.`
        : `${faDigits(queue?.count ?? 0)} مورد در صف تأمین این صندوق است${queue?.needBy ? ` (تحویل تا ${faDigits(jDateTime(queue.needBy))})` : ''}؛ این مبلغ صف را تأمین می‌کند و موجودی را به حداقل هدف برمی‌گرداند.`)
      : `موجودی آزاد ${when} از حداقل هدف (${bn(minTarget)} تومان) کمتر است؛ این مبلغ آن را به حداقل برمی‌گرداند.`;
    void coverage; void targetDays;
    return { side: 'buy', amount, reason };
  }
  if (state === 'surplus' && max) {
    const amount = roundDown(Math.min(freeValue - max, freeValue - minTarget));
    if (amount < MIN_ORDER) return undefined;
    return { side: 'redeem', amount, reason: `موجودی آزاد از سقف هدف (${bn(max)} تومان) بیشتر است؛ ابطال این مبلغ نقدینگی را آزاد می‌کند.` };
  }
  return undefined;
}

function position(d: MockDB, t: TreasuryStore, f: Fund, agg: Agg, com: Commit, q: Queued): TreasuryPosition {
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
  // the queue waits for this fund: new demand only gets what is left after it
  const qf = q.fund[f.id];
  const queuedValue = r0(qf?.value ?? 0);
  const afterQueue = availableValue - queuedValue;
  const coverageDays = active && net > 0 ? r1(Math.max(0, (afterQueue + pendingBuyValue) / net)) : null;
  const target = t.targets.stock.find((s) => s.fundId === f.id);
  const minTarget = minTargetOf(net, target);
  const state = stateOf(active, afterQueue, minTarget, target?.maxFreeValue);
  const suggestion = suggestionOf(state, afterQueue + pendingBuyValue, minTarget, target?.maxFreeValue, coverageDays, target?.targetDays, undefined, qf);
  return {
    fundId: f.id, name: f.name, shortName: f.shortName, symbol: f.symbol, nav, status: f.status, settlement: f.settlement,
    heldUnits: ru(held), allocatedUnits: ru(allocated), reservedUnits: ru(reserved), reservedByType, committedUnits: ru(committed),
    pendingBuyUnits: ru(pendingBuy), pendingRedeemUnits: ru(pendingRedeem), availableUnits: ru(available),
    heldValue: v(held), allocatedValue: v(allocated), reservedValue: v(reserved), committedValue: v(committed), availableValue,
    pendingBuyValue, pendingRedeemValue: v(pendingRedeem),
    queuedValue, queuedCount: qf?.count ?? 0, needBuyValue: Math.max(0, r0(-afterQueue)), needBy: qf?.needBy,
    avgCost: held > 0 ? r0(cost / held) : 0, unrealizedPnl: r0(held * nav - cost),
    demandPerDay: r0(net), coverageDays, target, minTargetValue: target ? r0(minTarget) : undefined, state, suggestion,
  };
}

// ───────────────────────── Snapshot ─────────────────────────

export interface Snapshot { d: MockDB; t: TreasuryStore; agg: Agg; com: Commit; queued: Queued; positions: TreasuryPosition[]; cash: CashSummary }

export function snapshot(d: MockDB = db()): Snapshot {
  const t = T(d);
  const agg = modelledAgg(d);
  const com = commitments(d, t.assumptions);
  const queued = queuedOf(d, t);
  const positions = d.funds.map((f) => position(d, t, f, agg, com, queued));
  return { d, t, agg, com, queued, positions, cash: cashSummary(d, t, agg, com, 30) };
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

/** Receipts are reviewed by the operator — a deposit is never overdue (kept for the deprecated `overdue` fields). */
const isOverdue = (_e: CashEntry) => { void _e; return false; };

// ───────────────────────── Organization rial accounts ─────────────────────────

/** The organization's stored account (created on first use). */
export const orgAcct = (t: TreasuryStore, orgId: string) => ((t.orgRial ??= {})[orgId] ??= { balance: 0, blockedBase: 0 });

/** Pending recipients of an organization's sent (not expired) packages, Toman. Packages in the queue block nothing. */
function blockedModelled(d: MockDB, orgId: string) {
  const at = nowIso();
  let total = 0;
  for (const pkg of d.orgPackages[orgId] ?? []) {
    if (pkg.status !== 'sent' || (pkg.expiresAt && pkg.expiresAt < at)) continue;
    const left = 1 - reclaimedPct(pkg) / 100;
    for (const r of pkg.recipients) if (r.status === 'pending') total += r.amount * left;
  }
  return total;
}

/** The organization's packages in a queue — waiting for receipt approval or for Namadno's stock — optionally without one. */
const queueOf = (d: MockDB, orgId: string, exceptPkg?: string) =>
  (d.orgPackages[orgId] ?? []).filter((p) => (p.status === 'awaiting_payment' || p.status === 'awaiting_stock') && p.id !== exceptPkg);
/** What «آزاد» covered of a queued package when it was submitted (kept for it until its receipt is approved). */
const setAsideOf = (p: OrgPackage) => Math.max(0, Math.min(p.total, p.funding?.fromFree ?? 0));

/** balance, blocked (sent packages), set aside (queue) and free of one organization; optionally without one queued package. */
function orgMoney(d: MockDB, t: TreasuryStore, orgId: string, exceptPkg?: string) {
  const acc = t.orgRial?.[orgId];
  const balance = r0(acc?.balance ?? 0);
  const blocked = r0((acc?.blockedBase ?? 0) + blockedModelled(d, orgId));
  const queue = queueOf(d, orgId, exceptPkg);
  const setAside = r0(Math.min(Math.max(0, balance - blocked), sum(queue.map(setAsideOf))));
  return { balance, blocked, setAside, free: Math.max(0, balance - blocked - setAside), queue };
}

function accountOf(d: MockDB, t: TreasuryStore, o: Organization): OrgRialAccount {
  const m = orgMoney(d, t, o.id);
  const exp = t.cash.entries.filter((e) => e.kind === 'org_deposit' && e.status === 'expected' && e.orgId === o.id);
  return {
    orgId: o.id, orgName: o.name, status: o.status, balance: m.balance, blocked: m.blocked, free: m.free, setAside: m.setAside,
    queuedTotal: sum(m.queue.map((p) => p.total)), queuedCount: m.queue.length, unfunded: 0,
    pending: sum(exp.map((e) => e.amount)), pendingCount: exp.length,
  };
}

/** Every organization's rial account with Namadno. */
export function orgAccounts(d: MockDB, t: TreasuryStore, com: Commit): OrgRialAccount[] {
  void com; // blocked money = the organization's sent packages (same packages as the stock commitments)
  return d.organizations.map((o) => accountOf(d, t, o));
}

/** The organization's free rial, without one queued package (to see whether «آزاد» covers it). */
export function orgFreeFor(d: MockDB, orgId: string, exceptPkg?: string) {
  const t = treasuryOf(d);
  return t ? orgMoney(d, t, orgId, exceptPkg).free : 0;
}

export function cashSummary(d: MockDB, t: TreasuryStore, agg: Agg, com: Commit, range: number): CashSummary {
  const done = t.cash.entries.filter((e) => e.status === 'done');
  const balance = r0(t.cash.opening + sum(done.map((e) => e.amount)));
  const tiedInOrders = sum(t.orders.filter((o) => o.status === 'placed' && o.side === 'buy').map((o) => o.amount));
  // purchases waiting for stock: the money left the wallets but is still the users' (in transit)
  const transit = sum((t.waits ?? []).filter((w) => w.status === 'waiting' && w.kind !== 'sell').map((w) => w.value + (w.fee ?? 0)));
  const userWallets = r0(t.base.userRial + agg.rial + transit);
  const committedRial = r0((t.base.commitToman.rial ?? 0) + com.rial);
  const accounts = orgAccounts(d, t, com);
  const orgFree = sum(accounts.map((a) => a.free));
  const orgSetAside = sum(accounts.map((a) => a.setAside));
  const reserve = sum(accounts.map((a) => Math.min(Math.max(0, a.balance), a.blocked)));
  // Namadno's own free rial: what is left of the bank after users', organizations' and tied money
  const available = balance - tiedInOrders - userWallets - orgFree - orgSetAside - reserve;
  const exp = t.cash.entries.filter((e) => e.status === 'expected' && e.kind === 'org_deposit');
  const overdue = exp.filter(isOverdue);
  const n = Math.max(1, Math.min(HISTORY_DAYS, range));
  const bal = live(t.history.balance, balance).slice(-n);
  const av = live(t.history.cashAvailable, available).slice(-n);
  return {
    balance, tiedInOrders, userWallets, committedRial, orgFree, orgSetAside, reserve, unfunded: 0, available,
    expectedDeposits: sum(exp.map((e) => e.amount)), expectedCount: exp.length,
    overdueCount: overdue.length, overdueAmount: sum(overdue.map((e) => e.amount)),
    history: bal.map((b, i) => ({ t: historyDay(HISTORY_DAYS - n + i), balance: b, available: av[i] ?? 0 })),
  };
}

/** «ریال» and «ریال رزرو»: the bank account split by whose money it is. */
export function rialTreasury(s: Snapshot, range = 30): RialTreasury {
  const { d, t, agg, com } = s;
  const c = cashSummary(d, t, agg, com, range);
  const byOrg = orgAccounts(d, t, com);
  const target = t.targets.rial;
  // sales waiting for free rial → «نیاز به تأمین ریال»
  const queuedValue = r0(s.queued.rial.value);
  const needValue = Math.max(0, r0(queuedValue - c.available));
  const state: StockState = needValue > 1 || c.available < -1 ? 'need_buy'
    : target && c.available < target.minFreeValue ? 'below'
      : target?.maxFreeValue && c.available > target.maxFreeValue ? 'surplus' : 'ok';
  const n = c.history.length;
  const res = live(t.history.reserve, c.reserve).slice(-n);
  return {
    bank: c.balance,
    main: {
      held: c.balance - c.reserve, users: c.userWallets, usersReserved: r0((t.base.userRialReserved ?? 0) + agg.rialLocked),
      orgFree: c.orgFree, orgSetAside: c.orgSetAside, tied: c.tiedInOrders, available: c.available,
      queuedValue, queuedCount: s.queued.rial.count, needValue, target, state,
    },
    reserve: { held: c.reserve, blocked: sum(byOrg.map((a) => a.blocked)), unfunded: 0, expected: c.expectedDeposits, state: 'ok' },
    byOrg,
    history: c.history.map((h, i) => ({ t: h.t, bank: h.balance, available: h.available, reserve: res[i] ?? c.reserve })),
  };
}

export const RIAL_LABEL = 'ریال';
export const RESERVE_LABEL = 'ریال رزرو';
const acctLabel = (name?: string) => `حساب ${name ?? 'سازمان'}`;
const walletLabel = (name?: string) => (name ? `کیف پول ${name}` : 'کیف پول کاربران');

/**
 * Rial movements between the treasuries and wallets, newest first — derived from the bank ledger (deposits,
 * withdrawals, orders, fees), the activity log (packages blocked, paid to recipients, released) and the stock
 * movements (users buying from / selling to our stock, reclaims).
 */
export function rialMoves(s: Snapshot, f: { kind?: string; orgId?: string; userId?: string; limit?: number } = {}): RialMove[] {
  const { d, t } = s;
  const out: RialMove[] = [];
  const fundLabel = (id?: string) => (id ? `صندوق ${fundName(d, id)}` : 'صندوق‌ها');
  const pkgRef = (a: ActivityEvent) => a.refs?.find((r) => r.type === 'package')?.id;
  for (const e of t.cash.entries) {
    if (e.status !== 'done') continue;
    const b = { id: 'rm-' + e.id, at: e.at, amount: Math.abs(e.amount), orgId: e.orgId, orgName: e.orgName, userId: e.userId, ref: e.ref, packageId: e.packageId, title: e.title };
    const o = e.orderId ? t.orders.find((x) => x.id === e.orderId) : undefined;
    if (e.kind === 'org_deposit') out.push({ ...b, kind: 'org_deposit', from: `حساب بانکی ${e.orgName ?? 'سازمان'}`, to: `${RIAL_LABEL} · ${acctLabel(e.orgName)}` });
    else if (e.kind === 'user_deposit') out.push({ ...b, kind: 'user_deposit', from: 'حساب بانکی کاربر', to: walletLabel() });
    else if (e.kind === 'user_withdrawal') out.push({ ...b, kind: 'user_withdrawal', from: walletLabel(), to: 'حساب بانکی کاربر' });
    else if (e.kind === 'order_buy') out.push({ ...b, kind: 'order_buy', from: RIAL_LABEL, to: fundLabel(o?.fundId), fundId: o?.fundId });
    else if (e.kind === 'order_redeem') out.push({ ...b, kind: 'order_redeem', from: fundLabel(o?.fundId), to: RIAL_LABEL, fundId: o?.fundId });
    else if (e.kind === 'fee') out.push({ ...b, kind: 'fee', from: RIAL_LABEL, to: 'کارمزد بانکی' });
    else out.push({ ...b, kind: 'adjustment', from: e.amount >= 0 ? 'اصلاح بانکی' : RIAL_LABEL, to: e.amount >= 0 ? RIAL_LABEL : 'اصلاح بانکی' });
  }
  for (const a of t.activity) {
    if (!a.amount) continue;
    const b = { id: 'rm-' + a.id, at: a.at, amount: Math.abs(a.amount), orgId: a.orgId, orgName: a.orgName, packageId: pkgRef(a), title: a.title };
    if (a.kind === 'package_sent') out.push({ ...b, kind: 'reserve', from: `${RIAL_LABEL} · ${acctLabel(a.orgName)}`, to: RESERVE_LABEL });
    else if (a.kind === 'package_accepted') out.push({ ...b, kind: 'payout', from: RESERVE_LABEL, to: walletLabel(a.actor.name), userId: a.actor.id, userName: a.actor.name });
    else if (a.kind === 'package_cancelled') out.push({ ...b, kind: 'release', from: RESERVE_LABEL, to: `${RIAL_LABEL} · ${acctLabel(a.orgName)}` });
    else if (a.kind === 'milestone_reclaimed') out.push({ ...b, kind: 'reclaim', from: 'دارایی همکاران', to: `${RIAL_LABEL} · ${acctLabel(a.orgName)}` });
  }
  for (const m of t.movements) {
    const b = { id: 'rm-' + m.id, at: m.at, amount: Math.abs(m.value), orgId: m.orgId, orgName: orgName(d, m.orgId), userId: m.userId, userName: m.userName, fundId: m.fundId, packageId: m.packageId };
    // a recipient's fund part is bought from our stock right after the payout: wallet → «ریال»
    if (m.kind === 'user_buy' || m.kind === 'allocate') out.push({ ...b, kind: 'user_buy', from: walletLabel(m.userName), to: RIAL_LABEL, title: m.kind === 'allocate' ? `خرید ${fundName(d, m.fundId)} برای بسته · ${m.title}` : m.title });
    else if (m.kind === 'user_sell') out.push({ ...b, kind: 'user_sell', from: RIAL_LABEL, to: walletLabel(m.userName), title: m.title });
  }
  const list = out
    .filter((m) => (!f.kind || f.kind === 'all' || m.kind === f.kind) && (!f.orgId || m.orgId === f.orgId) && (!f.userId || m.userId === f.userId))
    .sort((a, b) => b.at.localeCompare(a.at));
  return list.slice(0, Math.max(1, Math.min(300, Number(f.limit) || 50)));
}

/** The package a receipt pays for (derived for the operator's review). */
function packageOf(d: MockDB, e: CashEntry): CashEntry['forPackage'] {
  const p = e.packageId && e.orgId ? (d.orgPackages[e.orgId] ?? []).find((x) => x.id === e.packageId) : undefined;
  if (!p) return undefined;
  const status = p.status === 'awaiting_payment' ? 'queued' : p.status === 'sent' || p.status === 'completed' ? 'sent' : p.status === 'cancelled' ? 'cancelled' : 'other';
  return { id: p.id, title: p.title, recipients: p.recipients.length, total: p.total, fromFree: setAsideOf(p), status };
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
    .map((e) => ({ ...e, forPackage: packageOf(d, e), balanceAfter: after.get(e.id), overdue: isOverdue(e) || undefined }))
    .sort((a, b) => (b.status === 'expected' ? b.dueAt ?? b.at : b.at).localeCompare(a.status === 'expected' ? a.dueAt ?? a.at : a.at));
}

// ───────────────────────── Organizations ─────────────────────────

const YEAR_START = () => jalaliToIso(1405, 1, 1);

export function orgRows(s: Snapshot): OrgTreasuryRow[] {
  const { d, t, agg, com } = s;
  const accounts = orgAccounts(d, t, com);
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
      rial: (({ orgId: _i, orgName: _n, status: _s, ...rest }) => { void _i; void _n; void _s; return rest; })(accounts.find((x) => x.orgId === o.id)!),
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
  const c = s.cash;
  if (Math.abs(c.balance - (c.userWallets + c.tiedInOrders + c.orgFree + c.orgSetAside + c.reserve + c.available)) > 2) issues.push('bank ≠ users + tied + organizations + reserve + Namadno free');
  // nothing goes negative: free stock and Namadno's free rial
  for (const p of s.positions) if (p.state !== 'inactive' && p.availableValue < -1) issues.push(`${p.fundId}: free stock < 0`);
  if (c.available < -2) issues.push('Namadno free rial < 0');
  for (const a of orgAccounts(s.d, s.t, s.com)) {
    if (Number.isNaN(a.balance)) issues.push(`${a.orgId}: rial balance is not a number`);
    // nothing is sent before it is paid: sent packages are always covered by the organization's balance
    if (a.blocked > a.balance + 1) issues.push(`${a.orgId}: blocked > balance`);
  }
  for (const m of issues) if (!warned.has(m)) { warned.add(m); console.warn('[treasury] invariant broken:', m); }
  return issues;
}

// ───────────────────────── Summary + detail ─────────────────────────

const FLOW_IN = new Set(['allocate', 'user_buy']);
const FLOW_BACK = new Set(['user_sell', 'reclaim']);

/** Managed assets = Σ held fund value + the rial bank balance. */
export function managedOf(s: Snapshot) {
  const funds = totalsOf(s.positions, s.t).heldValue;
  const rial = s.cash.balance;
  return { value: funds + rial, funds, rial };
}

/** Managed assets per month (Toman, funds + rial) — the last month is live. Used by the overview as well. */
export function aumMonthlyLive(s: Snapshot) {
  const aum = managedOf(s).value;
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
  const managed = managedOf(s);
  const all = managed.value || 1;
  const monthly = aumMonthlyLive(s);
  const a0 = monthly[0]?.aum ?? 0;
  const tgt = t.targets.aum.value;
  return {
    asOf: nowIso(),
    totals,
    coverageDays: coverageAll(positions),
    positions,
    cash: cashSummary(d, t, s.agg, s.com, n),
    rial: rialTreasury(s, n),
    managed,
    mix: [
      { fundId: 'rial', value: managed.rial, pct: r1((managed.rial / all) * 100), targetPct: t.targets.mix.rial },
      ...positions.filter((p) => p.heldValue > 0).map((p) => ({ fundId: p.fundId, value: p.heldValue, pct: r1((p.heldValue / all) * 100), targetPct: t.targets.mix[p.fundId] })),
    ],
    otherTargetPct: t.targets.mix.other,
    byOrg: rows,
    individualsValue: Math.max(0, totals.allocatedValue - sum(rows.map((r) => r.fundValue))),
    flow,
    aumMonthly: monthly.map((m, i) => ({ ...m, target: r0(a0 + ((tgt - a0) * i) / 11) })),
    aumTarget: { value: tgt, by: t.targets.aum.by, pct: r1((managed.value / (tgt || 1)) * 100) },
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
  // nothing goes negative: a buy only from free rial left after the sales waiting for it, a redemption only from free
  // stock left after the queue
  const cashRoom = rialRoom(s);
  const unitRoom = Math.max(0, (p.availableValue - p.queuedValue) / nav);
  if (side === 'buy' && amount > cashRoom) {
    blocking.push(err(422, 'insufficient_cash', `ریال آزاد نمادنو کافی نیست؛ حداکثر ${bn(cashRoom)} تومان.`, { available: cashRoom }));
  }
  if (side === 'redeem' && units > unitRoom + 1e-9) {
    blocking.push(err(422, 'insufficient_stock', p.queuedValue > 0 ? `موجودی آزاد پس از صف تأمین ${bn(unitRoom * nav)} تومان است.` : `موجودی آزاد این صندوق ${bn(Math.max(0, p.availableValue))} تومان است.`, { availableUnits: ru(unitRoom), availableValue: r0(unitRoom * nav) }));
  } else if (side === 'redeem' && p.target && availableValueAfter < minTarget) {
    blocking.push(err(422, 'below_target', `پس از ابطال، موجودی آزاد از حداقل هدف (${bn(minTarget)} تومان) کمتر می‌شود.`, { minFree: minTarget, availableValue: p.availableValue }));
  }
  for (const e of blocking) warnings.push(e.message);
  const rialMin = s.t.targets.rial?.minFreeValue;
  if (side === 'buy' && rialMin && cashAvailableAfter < rialMin && amount <= cashRoom) {
    warnings.push(`پس از این سفارش، ریال آزاد نمادنو ${bn(Math.max(0, cashAvailableAfter))} تومان می‌شود؛ کمتر از حداقل هدف ${bn(rialMin)} تومان.`);
  }
  if (side === 'buy' && p.target && availableValueAfter - p.queuedValue < minTarget) {
    warnings.push(`پس از ثبت، موجودی آزاد هنوز از حداقل هدف (${bn(minTarget)} تومان) کمتر است.`);
  }
  if (side === 'buy' && p.target?.maxFreeValue && availableValueAfter > p.target.maxFreeValue) {
    warnings.push(`پس از ثبت، موجودی آزاد از سقف هدف (${bn(p.target.maxFreeValue)} تومان) بیشتر می‌شود.`);
  }
  if (side === 'redeem' && p.state === 'below') warnings.push('موجودی این صندوق همین حالا زیر هدف است.');
  if (side === 'buy' && p.needBuyValue > 0) warnings.push(`پس از ثبت، صف تأمین این صندوق (نیاز به خرید ${bn(p.needBuyValue)} تومان) خودکار تحویل می‌شود.`);
  return {
    blocking,
    quote: {
      fundId: f.id, side, amount, units: ru(units), fee, nav, settleAt: nowIso(), // recorded = done at once
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
  const at = nowIso();
  // cash first: an order is recorded only when it is done — paid and settled at once (no open / due orders)
  const o: StoredOrder = {
    id: code, code, fundId: f.id, side: q.side, amount: q.amount, units: q.units, navAtOrder: f.nav, fee: q.fee, status: 'placed',
    placedAt: at, settleAt: at, source: b.source === 'suggestion' ? 'suggestion' : 'manual', note: b.note?.trim() || undefined, by,
  };
  s.t.orders.unshift(o);
  const failed = applySettle(d, s.t, o, by);
  if (failed) { s.t.orders.shift(); return failed; }
  fillQueues(d); // the queue («صف تأمین») is served right away from the new stock / rial
  return withDue(o);
}

/** Settles an order at once: held units, cash entry, stock movement and one «… ثبت شد» activity. Returns an error or null. */
function applySettle(d: MockDB, t: TreasuryStore, o: StoredOrder, by: string): TreasuryError | null {
  const f = d.funds.find((x) => x.id === o.fundId);
  if (!f || !(f.nav > 0)) return err(409, 'fund_unavailable', 'NAV این صندوق در دسترس نیست.');
  const h = (t.held[f.id] ??= { units: 0, cost: 0 });
  const at = nowIso();
  o.navAtSettle = f.nav;
  if (o.side === 'buy') {
    o.units = ru((o.amount - o.fee) / f.nav);
    h.units += o.units;
    h.cost += o.amount - o.fee;
    pushCash(t, { kind: 'order_buy', amount: -o.amount, status: 'done', title: `صدور ${f.shortName} · ${o.code}`, orderId: o.id, by });
    pushMovement(t, { fundId: f.id, kind: 'buy_settle', units: o.units, value: o.amount - o.fee, title: `صدور ${o.code}`, orderId: o.id });
  } else {
    if (h.units + 1e-9 < o.units) return err(409, 'insufficient_stock', 'واحد کافی برای ابطال در خزانه نیست.');
    const avg = h.units > 0 ? h.cost / h.units : 0;
    const proceeds = r0(o.units * f.nav - o.fee);
    h.units -= o.units;
    h.cost = Math.max(0, h.cost - avg * o.units);
    pushCash(t, { kind: 'order_redeem', amount: proceeds, status: 'done', title: `ابطال ${f.shortName} · ${o.code}`, orderId: o.id, by });
    pushMovement(t, { fundId: f.id, kind: 'redeem_settle', units: -o.units, value: r0(o.units * f.nav), title: `ابطال ${o.code}`, orderId: o.id });
  }
  o.status = 'settled';
  o.settledAt = at;
  logActivity({
    actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'order_settled',
    title: `${o.side === 'buy' ? 'صدور' : 'ابطال'} ${f.shortName} · ${o.code}`,
    sub: `${bn(o.amount)} تومان · ${units(o.units)} واحد · NAV ${bn(f.nav)}`, amount: o.amount, fundId: f.id, units: o.units, tone: 'success',
    href: `${routes.op.orders}?id=${o.code}`, refs: [{ type: 'order', id: o.code }],
  });
  return null;
}

/** @deprecated Orders are settled when they are recorded (placeOrder); kept for an old open order only. */
export function settleOrder(d: MockDB, id: string, by: string): TreasuryOrder | TreasuryError {
  const t = T(d);
  const o = t.orders.find((x) => x.id === id || x.code === id);
  if (!o) return err(404, 'not_found', 'سفارش پیدا نشد.');
  if (o.status !== 'placed') return err(409, 'not_open', 'این سفارش باز نیست.');
  const failed = applySettle(d, t, o, by);
  if (failed) return failed;
  fillQueues(d);
  return withDue(o);
}

/** @deprecated A recorded order is already done and cannot be cancelled; only an old open order can be. */
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

/** Approve an organization's deposit receipt: the money lands in its rial account (a package waiting for it can then be delivered). */
export function confirmDeposit(d: MockDB, id: string, ref: string | undefined, by: string): CashEntry | TreasuryError {
  const t = T(d);
  const e = t.cash.entries.find((x) => x.id === id);
  if (!e || e.kind !== 'org_deposit') return err(404, 'not_found', 'واریز پیدا نشد.');
  if (e.status !== 'expected') return err(409, 'not_pending', e.status === 'done' ? 'این فیش قبلاً تأیید شده است.' : 'این فیش در انتظار بررسی نیست.');
  e.status = 'done';
  e.at = nowIso();
  e.receivedAt = e.at;
  e.ref = ref?.trim() || e.ref;
  e.by = by;
  if (e.orgId) orgAcct(t, e.orgId).balance += e.amount;
  logActivity({
    actor: { kind: 'operator', name: by }, orgId: e.orgId, orgName: e.orgName, category: 'cash', kind: 'deposit_confirmed',
    title: `تأیید فیش واریز ${e.orgName ?? ''}`.trim(), sub: e.title + (e.note ? ` · ${e.note}` : ''), amount: e.amount, tone: 'success',
    href: `${routes.op.cash}?id=${e.id}`, refs: [{ type: 'cash', id: e.id }, ...(e.packageId ? [{ type: 'package', id: e.packageId }] : [])],
  });
  return e;
}
/** Approve = confirm. */
export const approveDeposit = confirmDeposit;

/** Reject an organization's deposit receipt with a reason; it can upload a new one. */
export function rejectDeposit(d: MockDB, id: string, reason: string | undefined, by: string): CashEntry | TreasuryError {
  const t = T(d);
  const e = t.cash.entries.find((x) => x.id === id);
  if (!e || e.kind !== 'org_deposit') return err(404, 'not_found', 'واریز پیدا نشد.');
  if (e.status !== 'expected') return err(409, 'not_pending', 'این فیش در انتظار بررسی نیست.');
  const why = reason?.trim();
  if (!why) return err(422, 'missing_reason', 'دلیل رد فیش را بنویسید؛ برای سازمان نمایش داده می‌شود.');
  e.status = 'rejected';
  e.rejectedAt = nowIso();
  e.rejectReason = why;
  e.by = by;
  logActivity({
    actor: { kind: 'operator', name: by }, orgId: e.orgId, orgName: e.orgName, category: 'cash', kind: 'deposit_rejected',
    title: `رد فیش واریز ${e.orgName ?? ''}`.trim(), sub: `${e.title} · ${why}`, amount: e.amount, tone: 'warning',
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
  orgAcct(t, o.id).balance += amount;
  logActivity({
    actor: { kind: 'operator', name: by }, orgId: o.id, orgName: o.name, category: 'cash', kind: 'deposit_recorded',
    title: `ثبت واریز ${o.name}`, sub: e.ref ? `مرجع ${e.ref}` : undefined, amount, tone: 'success', href: `${routes.op.cash}?id=${e.id}`, refs: [{ type: 'cash', id: e.id }],
  });
  return e;
}

/**
 * Organization panel: a deposit receipt («فیش واریز» + optional description) waiting for Namadno's review.
 * `packageId` = the receipt of a package waiting for payment (a new one replaces a pending one).
 */
export function submitReceipt(d: MockDB, orgId: string, b: { amount?: number; receipt?: ReceiptFile; note?: string; packageId?: string }, by: string): CashEntry | TreasuryError {
  const t = T(d);
  const o = d.organizations.find((x) => x.id === orgId);
  if (!o) return err(404, 'not_found', 'سازمان پیدا نشد.');
  const amount = r0(Number(b.amount));
  if (!(amount >= 1_000_000)) return err(422, 'bad_amount', 'مبلغ واریز حداقل ۱ میلیون تومان است.');
  if (!b.receipt) return err(422, 'missing_receipt', 'تصویر یا فایل فیش واریز را بارگذاری کنید.');
  const pkg = b.packageId ? (d.orgPackages[orgId] ?? []).find((x) => x.id === b.packageId) : undefined;
  if (b.packageId && (!pkg || pkg.status !== 'awaiting_payment')) return err(422, 'bad_package', 'این بسته در انتظار واریز نیست.');
  // a queued package: the receipt covers what «آزاد» did not (the rest is set aside for it)
  const need = pkg ? r0(pkg.total - setAsideOf(pkg)) : 0;
  if (pkg && amount + 1 < need) return err(422, 'bad_amount', `مبلغ فیش باید دست‌کم ${money(need)} تومان باشد.`, { shortfall: need });
  // one pending receipt per package: a new upload replaces the previous one
  if (pkg) for (const x of t.cash.entries) if (x.packageId === pkg.id && x.status === 'expected') x.status = 'cancelled';
  const note = b.note?.trim() || undefined;
  const e = pushCash(t, {
    kind: 'org_deposit', amount, status: 'expected', title: pkg ? `فیش «${pkg.title}»` : 'شارژ حساب سازمان',
    orgId: o.id, orgName: o.name, packageId: pkg?.id, receipt: b.receipt, note, submittedBy: by,
  });
  logActivity({
    actor: { kind: 'org', id: o.id, name: by }, orgId: o.id, orgName: o.name, category: 'cash', kind: 'deposit_submitted',
    title: `فیش واریز ${o.name}`, sub: `${e.title} · در انتظار تأیید نمادنو`, amount, tone: 'info', href: `${routes.op.cash}?id=${e.id}`,
    refs: [{ type: 'cash', id: e.id }, ...(pkg ? [{ type: 'package', id: pkg.id, label: pkg.title }] : [])],
  });
  return e;
}
/** @deprecated Use submitReceipt. */
export const announceDeposit = submitReceipt;

// ───────────────────────── Targets ─────────────────────────

export function patchTargets(d: MockDB, b: TargetsPatch, by: string): TreasuryTargets | TreasuryError {
  const t = T(d);
  const at = nowIso();
  if (b.mix) {
    const vals = Object.values(b.mix);
    if (vals.some((v) => !(v >= 0)) || Math.round(sum(vals)) !== 100) return err(422, 'bad_mix', 'جمع ترکیب دارایی باید ۱۰۰٪ باشد.');
  }
  if (b.rial) {
    if (!(b.rial.minFreeValue >= 0)) return err(422, 'bad_target', 'حداقل ریال آزاد معتبر نیست.');
    if (b.rial.maxFreeValue !== undefined && b.rial.maxFreeValue !== null && !(b.rial.maxFreeValue > b.rial.minFreeValue)) return err(422, 'bad_target', 'سقف ریال آزاد باید از حداقل بیشتر باشد.');
  }
  if (b.stock) {
    for (const s of b.stock) {
      if (!d.funds.some((f) => f.id === s.fundId)) return err(422, 'bad_target', 'صندوق هدف معتبر نیست.', { fundId: s.fundId });
      if (!(s.minFreeValue >= 0)) return err(422, 'bad_target', 'حداقل موجودی معتبر نیست.', { fundId: s.fundId });
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
      const clean = { fundId: s.fundId, minFreeValue: r0(s.minFreeValue), maxFreeValue: s.maxFreeValue ? r0(s.maxFreeValue) : undefined };
      const i = next.findIndex((x) => x.fundId === s.fundId);
      if (i >= 0) next[i] = clean; else next.push(clean);
    }
    t.targets.stock = next;
  }
  if (b.rial) t.targets.rial = { minFreeValue: r0(b.rial.minFreeValue), maxFreeValue: b.rial.maxFreeValue ? r0(b.rial.maxFreeValue) : undefined };
  if (b.mix) t.targets.mix = { ...b.mix };
  if (b.aum) t.targets.aum = { value: r0(b.aum.value), by: b.aum.by };
  if (b.orgs) t.targets.orgs = { value: r0(b.orgs.value), by: b.orgs.by };
  if (b.users) t.targets.users = { value: r0(b.users.value), by: b.users.by };
  t.targets.updatedAt = at;
  t.targets.updatedBy = by;
  logActivity({ actor: { kind: 'operator', name: by }, category: 'treasury', kind: 'targets_updated', title: 'به‌روزرسانی اهداف خزانه', sub: Object.keys(b).map((k) => TARGET_LABEL[k] ?? k).join('، '), tone: 'info', href: routes.op.planning });
  return t.targets;
}
const TARGET_LABEL: Record<string, string> = { stock: 'موجودی صندوق‌ها', rial: 'ریال آزاد', mix: 'ترکیب دارایی', aum: 'دارایی تحت مدیریت', orgs: 'سازمان‌ها', users: 'کاربران' };

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
      // in the queue: sent to the recipients once its receipt is approved
      if (pkg.status === 'awaiting_payment') {
        out.push({ id: `ev-queue-${pkg.id}`, at: daysFromNow(1, '12:00'), kind: 'planned_package', title: `در صف تأیید فیش «${pkg.title}»`, value: pkg.total, count: pkg.recipients.length, orgId, orgName: oName, fundId: single, href: `${routes.op.cash}?status=expected` });
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
    const projectedEnd = p.availableValue - p.queuedValue + p.pendingBuyValue - demand + returns;
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
    // free stock (after the queue) against the minimum target
    const free = Math.max(0, r0(p.availableValue - p.queuedValue));
    out.push({ key: `stock:${p.fundId}`, label: `موجودی آزاد ${p.shortName}`, current: free, target: tg.minFreeValue, pct: tg.minFreeValue > 0 ? pct(free, tg.minFreeValue) : 100, onTrack: p.state === 'ok' || p.state === 'surplus', unit: 'toman' });
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
  // buy suggestions keep Namadno's free rial above its minimum target («ریال» stays healthy)
  let cashLeft = Math.max(0, rialRoom(s) - (s.t.targets.rial?.minFreeValue ?? 0));
  const urgency: Record<StockState, number> = { need_buy: 0, shortfall: 0, below: 1, ok: 2, surplus: 3, inactive: 4 };
  for (const ff of [...perFund].sort((a, b) => urgency[a.state] - urgency[b.state])) {
    if (!ff.suggestion) continue;
    const p = s.positions.find((x) => x.fundId === ff.fundId)!;
    const buy = ff.suggestion.side === 'buy';
    const severity: Severity = ff.state === 'need_buy' || ff.state === 'shortfall' ? 'critical' : ff.state === 'below' ? 'warning' : 'info';
    const id = `rec-${ff.suggestion.side}-${ff.fundId}-${h}`;
    if (!buy) {
      recs.push({
        id, kind: 'redeem', severity, title: `ابطال ${p.shortName}`, reason: ff.suggestion.reason, fundId: ff.fundId, amount: ff.suggestion.amount,
        action: { type: 'order', side: 'redeem', fundId: ff.fundId, amount: ff.suggestion.amount },
      });
      continue;
    }
    const need = ff.suggestion.amount;
    const room = p.target?.maxFreeValue ? p.target.maxFreeValue - (p.availableValue - p.queuedValue + p.pendingBuyValue) : Infinity;
    const nowAmt = roundDown(Math.max(0, Math.min(need, room, cashLeft)));
    const capped = nowAmt < need;
    const limit = room < need && room <= cashLeft ? 'سقف هدف موجودی' : 'ریال آزاد بالای حداقل هدف';
    // when capped, one plain sentence replaces the forecast's reason (which explains the full amount)
    const why = !capped ? ff.suggestion.reason
      : nowAmt >= MIN_ORDER
        ? `تا ${faDigits(h)} روز آینده حدود ${bn(need)} تومان صدور لازم است تا موجودی آزاد بالای حداقل هدف بماند؛ اکنون ${bn(nowAmt)} تومان (به اندازه‌ی ${limit}) و باقی در نوبت‌های بعد.`
        : `تا ${faDigits(h)} روز آینده حدود ${bn(need)} تومان صدور لازم است، ولی ریال آزاد نمادنو بالای حداقل هدف کافی نیست؛ با پذیرش بسته‌ها و فروش کاربران ریال آزاد بالا می‌رود.`;
    if (nowAmt >= MIN_ORDER) {
      cashLeft -= nowAmt;
      recs.push({
        id, kind: 'buy', severity, title: `صدور ${p.shortName}`, reason: why, fundId: ff.fundId, amount: nowAmt, horizonAmount: need,
        action: { type: 'order', side: 'buy', fundId: ff.fundId, amount: nowAmt },
      });
    } else {
      recs.push({
        id, kind: 'buy', severity, title: `صدور ${p.shortName}`, reason: why, fundId: ff.fundId, amount: need, horizonAmount: need,
        action: { type: 'link', href: routes.op.cash },
      });
    }
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
  // the rial treasuries first: everything users and organizations do is in rial
  const rt = rialTreasury(s);
  const cashHref = routes.op.cash;
  // nothing goes negative: sales waiting for free rial → «نیاز به تأمین ریال» (e.g. a redemption)
  if (rt.main.state === 'need_buy') out.push({ id: 'act-rial-need', kind: 'rial_need', severity: 'critical', title: 'نیاز به تأمین ریال', sub: `${faDigits(rt.main.queuedCount)} فروش کاربر در صف واریز · ${bn(rt.main.needValue)} تومان${s.queued.rial.needBy ? ` · تا ${faDigits(jDateTime(s.queued.rial.needBy))}` : ''}`, at: s.queued.rial.needBy, amount: rt.main.needValue, href: `${routes.op.funds}?state=need_buy`, cta: { label: 'صف تأمین' } });
  else if (rt.main.state === 'below' && rt.main.target) out.push({ id: 'act-rial-below', kind: 'rial_below', severity: 'warning', title: 'ریال آزاد زیر هدف', sub: `ریال آزاد ${bn(rt.main.available)} تومان؛ حداقل هدف ${bn(rt.main.target.minFreeValue)} تومان`, amount: rt.main.target.minFreeValue - rt.main.available, href: cashHref, cta: { label: 'نقدینگی' } });
  for (const p of positions) {
    const href = routes.op.fund(p.fundId);
    const order = p.suggestion ? { type: 'order' as const, side: p.suggestion.side, fundId: p.fundId, amount: p.suggestion.amount } : undefined;
    // «نیاز به خرید»: items wait in the queue for this fund — buy now (an open buy order may already cover it)
    if (p.state === 'need_buy') {
      const covered = p.pendingBuyValue >= p.needBuyValue;
      out.push({
        id: `act-need-${p.fundId}`, kind: 'stock_need_buy', severity: 'critical', title: `نیاز به خرید ${p.shortName}`,
        sub: `${faDigits(p.queuedCount)} مورد در صف تأمین · ${bn(p.needBuyValue)} تومان${p.needBy ? ` · تحویل تا ${faDigits(jDateTime(p.needBy))}` : ''}${covered ? ' · سفارش صدور باز پوشش می‌دهد' : ''}`,
        at: p.needBy, amount: p.suggestion?.amount ?? p.needBuyValue, fundId: p.fundId, href,
        cta: covered || !order ? { label: 'سفارش‌ها' } : { label: 'ثبت صدور', action: order },
      });
    }
    if (p.state === 'below') out.push({ id: `act-below-${p.fundId}`, kind: 'stock_below', severity: 'warning', title: `موجودی ${p.shortName} زیر هدف`, sub: p.target ? `موجودی آزاد ${bn(Math.max(0, p.availableValue - p.queuedValue))} تومان؛ حداقل هدف ${bn(p.target.minFreeValue)} تومان` : `موجودی آزاد ${bn(p.availableValue)} تومان`, amount: p.suggestion?.amount, fundId: p.fundId, href, cta: { label: 'ثبت صدور', action: order } });
    if (p.state === 'surplus') out.push({ id: `act-surplus-${p.fundId}`, kind: 'stock_surplus', severity: 'info', title: `مازاد موجودی ${p.shortName}`, sub: `موجودی آزاد ${bn(p.availableValue)} تومان، بیش از سقف هدف`, amount: p.suggestion?.amount, fundId: p.fundId, href, cta: { label: 'ثبت ابطال', action: order } });
  }
  for (const o of t.orders.filter((x) => x.status === 'placed' && x.settleAt <= at)) {
    out.push({ id: `act-settle-${o.id}`, kind: 'order_settle', severity: 'warning', title: `تسویه‌ی سفارش ${o.code}`, sub: `${o.side === 'buy' ? 'صدور' : 'ابطال'} ${fundName(d, o.fundId)} · ${bn(o.amount)} تومان`, at: o.settleAt, amount: o.amount, fundId: o.fundId, href: `${routes.op.orders}?id=${o.code}`, cta: { label: 'ثبت تسویه', action: { type: 'settle_order', id: o.id } } });
  }
  // deposit receipts waiting for the operator's review (nothing is ever overdue)
  for (const e of t.cash.entries.filter((x) => x.status === 'expected' && x.kind === 'org_deposit')) {
    const queued = e.packageId && e.orgId ? (d.orgPackages[e.orgId] ?? []).find((p) => p.id === e.packageId && p.status === 'awaiting_payment') : undefined;
    out.push({
      id: `act-dep-${e.id}`, kind: 'deposit_review', severity: 'warning',
      title: `بررسی فیش واریز ${e.orgName ?? ''}`.trim(),
      sub: `${e.title}${queued ? ` · ${faDigits(queued.recipients.length)} همکار در صف` : ''}${e.note ? ` · ${e.note}` : ''}`,
      at: e.at, amount: e.amount, orgId: e.orgId, href: `${routes.op.cash}?id=${e.id}`, cta: { label: 'بررسی فیش', action: { type: 'review_deposit', id: e.id } },
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

/**
 * org.ts — a package was delivered to its recipients: its amount is blocked in «ریال رزرو» from the organization's free
 * rial (sending is allowed only when «آزاد» covers it — otherwise the package waits for its receipt, see onPackageAwaiting).
 */
export function onPackageSent(orgId: string, pkg: OrgPackage, actorName?: string, afterReceipt?: boolean): { fromFree: number; toDeposit: number } {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return { fromFree: pkg.total, toDeposit: 0 };
  const oName = orgName(d, orgId);
  logActivity({
    actor: { kind: 'org', id: orgId, name: actorName ?? oName ?? orgId }, orgId, orgName: oName, category: 'package', kind: 'package_sent',
    title: `ارسال «${pkg.title}»`,
    sub: `${faDigits(pkg.recipients.length)} گیرنده · بلاک در «ریال رزرو»${afterReceipt ? (pkg.stockQueuedAt ? ' پس از تأمین موجودی' : ' پس از تأیید فیش واریز') : ' از حساب آزاد سازمان'}`,
    amount: pkg.total, tone: 'primary', href: routes.op.organization(orgId), refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
  return { fromFree: pkg.total, toDeposit: 0 };
}

/** org.ts — a package was submitted with a deposit receipt («آزاد» did not cover it): it waits for Namadno's approval. */
export function onPackageAwaiting(orgId: string, pkg: OrgPackage, actorName: string | undefined, shortfall: number) {
  const d = db();
  if (!treasuryOf(d)) return;
  const oName = orgName(d, orgId);
  logActivity({
    actor: { kind: 'org', id: orgId, name: actorName ?? oName ?? orgId }, orgId, orgName: oName, category: 'package', kind: 'package_awaiting',
    title: `ثبت «${pkg.title}» با فیش واریز`, sub: `${faDigits(pkg.recipients.length)} گیرنده · ${bn(shortfall)} تومان با فیش · پس از تأیید نمادنو ارسال می‌شود`,
    amount: pkg.total, tone: 'info', href: routes.op.organization(orgId), refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
}

/** org.ts — a paid package waits for Namadno's stock («در انتظار تأمین موجودی»): the operator sees «نیاز به خرید». */
export function onPackageStockWait(orgId: string, pkg: OrgPackage, actorName: string | undefined, missing: Record<string, number>) {
  const d = db();
  if (!treasuryOf(d)) return;
  const oName = orgName(d, orgId);
  const what = Object.entries(missing).map(([f, v]) => `${fundName(d, f)} ${bn(v)}`).join(' · ');
  logActivity({
    actor: actorName ? { kind: 'org', id: orgId, name: actorName } : { kind: 'system', name: SYSTEM_ACTOR }, orgId, orgName: oName, category: 'package', kind: 'package_stock_wait',
    title: `«${pkg.title}» در صف تأمین موجودی`, sub: `${faDigits(pkg.recipients.length)} گیرنده · نیاز به خرید ${what} تومان · ارسال تا ${faDigits(jDateTime(pkg.stockEta ?? nowIso()))}`,
    amount: pkg.total, tone: 'warning', href: `${routes.op.funds}?state=need_buy`, refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
}

/** org.ts — a package was cancelled: its blocked or set-aside money returns to the organization's free balance; a pending receipt for it is cancelled. */
export function onPackageCancelled(pkg: OrgPackage, wasQueued = false) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  for (const e of t.cash.entries) if (e.packageId === pkg.id && e.status === 'expected') e.status = 'cancelled';
  const orgId = Object.entries(d.orgPackages).find(([, list]) => list.includes(pkg))?.[0];
  const oName = orgName(d, orgId);
  if (orgId && wasQueued) {
    // a package in the queue blocked nothing and reached no one: it just leaves the queue (what «آزاد» set aside is free again)
    logActivity({
      actor: { kind: 'org', id: orgId, name: oName ?? orgId }, orgId, orgName: oName, category: 'package', kind: 'package_cancelled',
      title: `لغو «${pkg.title}» پیش از تأیید فیش`, sub: 'از صف تأیید واریز خارج شد؛ به همکاران ارسال نشده بود', amount: pkg.total, tone: 'neutral',
      href: routes.op.organization(orgId), refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
    });
    return;
  }
  const back = r0(sum(pkg.recipients.filter((r) => r.status === 'pending').map((r) => r.amount)) * (1 - reclaimedPct(pkg) / 100));
  if (!orgId || back < 1) return;
  logActivity({
    actor: { kind: 'org', id: orgId, name: oName ?? orgId }, orgId, orgName: oName, category: 'package', kind: 'package_cancelled',
    title: `لغو «${pkg.title}»`, sub: 'مبلغ بلاک‌شده به حساب آزاد سازمان برگشت', amount: back, tone: 'neutral',
    href: routes.op.organization(orgId), refs: [{ type: 'package', id: pkg.id, label: pkg.title }],
  });
}

/** app.ts — an employee accepted a package: the money goes from «ریال رزرو» to the user; its fund parts are bought from our stock. */
export function onPackageAccepted(ud: UserData, pkg: InboxPackage, split: AllocationSplit, waitingFunds: string[] = []) {
  const d = db();
  const t = treasuryOf(d);
  if (!t) return;
  // «ریال رزرو» → the user's rial wallet: the organization's balance pays the recipient
  if (pkg.orgId) orgAcct(t, pkg.orgId).balance -= pkg.amount;
  for (const [fid, pct] of [['gold', split.gold], ['fixed', split.fixed]] as const) {
    if (!pct || waitingFunds.includes(fid)) continue; // a part waiting for stock leaves it when it is delivered
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
  // a reclaimed share is bought back by Namadno and credited to the organization's rial account
  if (kind === 'reclaimed' && orgId && total > 0) orgAcct(t, orgId).balance += r0(total);
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
