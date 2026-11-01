'use client';
/**
 * Operator treasury («خزانه») — types + React Query hooks owned by the "op-treasury" area.
 *
 * Namadno buys units from investment funds and keeps them as ONE pooled stock. Parts of that stock are allocated to
 * organizations' packages and to users (partly reserved); the rest is free stock.
 *
 * Rial first: every interaction with users and organizations is in rial; funds are back-office policy. The bank
 * account is split into two rial treasuries that work like the fund stock:
 *   «ریال»      main rial: users' wallets, organizations' free balances, cash tied in buy orders and Namadno's free rial
 *   «ریال رزرو» reserve rial: money of sent packages waiting for their recipients
 * Flow: organization deposit → «ریال» (the organization's free balance) → a sent package blocks its amount in
 * «ریال رزرو» → the recipient accepts → the user's rial wallet → the fund parts are bought from our stock (back to
 * «ریال», Namadno's free rial). A user selling units is paid from «ریال»; a buy order («صدور») is paid from «ریال».
 *
 * Identities (per fund, units):
 *   allocated = baseline + Σ modelled holdings          reserved = baseline + Σ modelled reservations
 *   committed = baseline + pending recipients of sent packages × split
 *   available (free stock) = held − allocated − committed − pending redeem       (negative = shortfall)
 *   coverageDays = (available + pending buy) value / net daily demand            (null when net demand ≤ 0)
 * Cash: balance (bank) = opening + Σ done entries.
 * Organization rial account: balance = approved deposits − paid to recipients + reclaimed shares;
 *   blocked = pending recipients of its sent packages (always covered by the balance — a package is sent only when it is paid);
 *   setAside = the part of «آزاد» kept for its packages waiting for receipt approval (the queue, `awaiting_payment`);
 *   free = max(0, balance − blocked − setAside); pending = receipts waiting for review. Nothing is ever unfunded.
 * «ریال رزرو» held = Σ blocked · «ریال» held = bank − «ریال رزرو» held
 * Namadno free rial (`CashSummary.available`) = «ریال» held − user wallets − organizations' free and set-aside − tied in buy orders
 *                                            = bank − user wallets − tied − Σ organizations' balances.
 *
 * Endpoints are implemented by src/mocks/handlers/op-treasury-extra.ts (engine: src/mocks/treasury.ts) and
 * documented in docs/API.md («بهره‌بردار — خزانه …»).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ID, ISODate, LockType, Toman } from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

// ───────────────────────── Stock ─────────────────────────

/**
 * `need_buy` («نیاز به خرید»): items wait in the queue for this fund's stock (packages, users' purchases) — buy now.
 * Nothing is ever negative: what the stock cannot cover waits, so `shortfall` («کسری») is no longer produced (deprecated).
 */
export type StockState = 'need_buy' | 'shortfall' | 'below' | 'ok' | 'surplus' | 'inactive';
export type OrderSide = 'buy' | 'redeem';

/** Per-fund stock targets. Free stock should stay above max(minFreeValue, net daily demand × targetDays). */
export interface StockTarget {
  fundId: ID;
  minFreeValue: Toman;
  targetDays: number;
  /** Above this the fund is «مازاد» and a redemption is suggested. */
  maxFreeValue?: Toman;
}

export interface StockSuggestion { side: OrderSide; amount: Toman; reason: string }

/** One fund in the treasury. Units are fund units; values are units × current NAV. */
export interface TreasuryPosition {
  fundId: ID;
  name: string;
  shortName: string;
  symbol: string;
  nav: Toman;
  status: 'active' | 'coming_soon' | 'paused';
  settlement: 'T+0' | 'T+1' | 'T+2';
  heldUnits: number;
  allocatedUnits: number;
  reservedUnits: number;
  /** Reserved units per reservation type (units, not Toman). */
  reservedByType: Record<LockType, number>;
  committedUnits: number;
  pendingBuyUnits: number;
  pendingRedeemUnits: number;
  /** held − allocated − committed − pendingRedeem. Never negative: what the stock cannot cover waits in the queue. */
  availableUnits: number;
  heldValue: Toman;
  allocatedValue: Toman;
  reservedValue: Toman;
  committedValue: Toman;
  availableValue: Toman;
  pendingBuyValue: Toman;
  pendingRedeemValue: Toman;
  /** Demand waiting in the queue for this fund (packages «در انتظار تأمین موجودی» + users' purchases), Toman. */
  queuedValue: Toman;
  queuedCount: number;
  /** max(0, queued − available): what must be bought to release the queue («نیاز به خرید»). */
  needBuyValue: Toman;
  /** The earliest time promised to a waiting item (fund settlement + one working day, e.g. 72h for T+2). */
  needBy?: ISODate;
  /** Average cost of one held unit (Toman). */
  avgCost: Toman;
  /** heldValue − cost of held units. */
  unrealizedPnl: Toman;
  /** NET daily drain of free stock in Toman: user buys + new packages − user sells. ≤ 0 means the stock grows. */
  demandPerDay: Toman;
  coverageDays: number | null;
  target?: StockTarget;
  /** Lower edge of the target band in Toman: max(target.minFreeValue, max(0, demandPerDay) × target.targetDays). */
  minTargetValue?: Toman;
  state: StockState;
  suggestion?: StockSuggestion;
}

/**
 * One item waiting in the queue («صف تأمین») — nothing is allowed to go negative, so what the stock or Namadno's free
 * rial cannot cover waits here and is fulfilled automatically (oldest first) as soon as it is covered:
 *   package  an organization's package «در انتظار تأمین موجودی» (one row per fund part; `value` = that part)
 *   buy      a user's fund purchase (money already paid from the wallet; units arrive when the stock does)
 *   accept   the fund part of an accepted package the stock could not cover yet
 *   sell     a user's sale to Namadno waiting for Namadno's free rial (fundId 'rial'; `value` = rial to pay)
 * `count` > 1 = aggregated orders of users the mock does not model one by one.
 */
export interface QueueItem {
  id: ID;
  kind: 'package' | 'buy' | 'accept' | 'sell';
  fundId: ID | 'rial';
  value: Toman;
  title: string;
  orgId?: ID;
  orgName?: string;
  userId?: ID;
  userName?: string;
  packageId?: ID;
  count?: number;
  at: ISODate;
  /** Promised at the latest (settlement + one working day). */
  eta: ISODate;
}

export interface StockMovement {
  id: ID;
  at: ISODate;
  fundId: ID;
  kind: 'buy_settle' | 'redeem_settle' | 'allocate' | 'user_buy' | 'user_sell' | 'reclaim' | 'adjust';
  /** Signed: + goes into free stock, − leaves it (allocated to someone or redeemed). */
  units: number;
  value: Toman;
  title: string;
  orgId?: ID;
  userId?: ID;
  userName?: string;
  packageId?: ID;
  orderId?: ID;
}

export interface TreasuryPositionDetail extends TreasuryPosition {
  /** 90 days, oldest first, Toman values; the last point is live. */
  history: { t: ISODate; available: Toman; held: Toman }[];
  movements: StockMovement[];
  orders: TreasuryOrder[];
  /** Missing for inactive funds. */
  forecast?: FundForecast;
}

// ───────────────────────── Orders ─────────────────────────

export interface TreasuryOrder {
  id: ID;
  /** «TR-1042» */
  code: string;
  fundId: ID;
  side: OrderSide;
  /** buy: Toman paid (fee included) · redeem: Toman value redeemed at order NAV. */
  amount: Toman;
  units: number;
  navAtOrder: Toman;
  navAtSettle?: Toman;
  fee: Toman;
  status: 'placed' | 'settled' | 'cancelled';
  placedAt: ISODate;
  settleAt: ISODate;
  settledAt?: ISODate;
  cancelledAt?: ISODate;
  cancelReason?: string;
  /** placed and settleAt ≤ now — ready for «ثبت تسویه». */
  dueNow: boolean;
  source: 'manual' | 'suggestion';
  note?: string;
  by: string;
}

export interface OrderQuote {
  fundId: ID;
  side: OrderSide;
  amount: Toman;
  units: number;
  fee: Toman;
  nav: Toman;
  settleAt: ISODate;
  cashAvailableAfter: Toman;
  availableUnitsAfter: number;
  /** Free stock value after settlement. */
  availableValueAfter: Toman;
  coverageDaysAfter: number | null;
  /** Human-readable warnings (Persian). Also lists what would make the order fail. */
  warnings: string[];
}

export interface PlaceOrderBody {
  fundId: ID;
  side: OrderSide;
  amount: Toman;
  note?: string;
  source?: 'manual' | 'suggestion';
  recommendationId?: ID;
}

// ───────────────────────── Cash ─────────────────────────

export type CashEntryKind = 'org_deposit' | 'order_buy' | 'order_redeem' | 'user_deposit' | 'user_withdrawal' | 'fee' | 'adjustment';

/** An uploaded payment receipt («فیش واریز»). `url` = a preview (image) or the file link; the real backend stores the file. */
export interface ReceiptFile {
  id: ID;
  name: string;
  /** MIME type: image/jpeg | image/png | image/webp | application/pdf. */
  type: string;
  /** Bytes. */
  size: number;
  url?: string;
}

export interface CashEntry {
  id: ID;
  /** When it hit the account (done) or was submitted (expected). */
  at: ISODate;
  kind: CashEntryKind;
  /** Signed Toman: + into the platform account. */
  amount: Toman;
  /**
   * Organization deposits: `expected` = a receipt waiting for the operator's review («در انتظار تأیید»),
   * `done` = approved (the money is in the organization's account), `rejected` = not accepted (see rejectReason).
   * There is no overdue state.
   */
  status: 'expected' | 'done' | 'cancelled' | 'rejected';
  title: string;
  orgId?: ID;
  orgName?: string;
  packageId?: ID;
  orderId?: ID;
  userId?: ID;
  /** @deprecated Deposits have no due date any more (receipts are reviewed instead). */
  dueAt?: ISODate;
  receivedAt?: ISODate;
  /** Bank reference of a received deposit (optional; organizations write it in `note`). */
  ref?: string;
  /** The organization's optional description of the transfer (e.g. the tracking number), or an operator note. */
  note?: string;
  /** The uploaded payment receipt («فیش واریز») of an organization deposit. */
  receipt?: ReceiptFile;
  /** Who submitted the receipt (organization panel member) — `by` is who approved / recorded it. */
  submittedBy?: string;
  rejectedAt?: ISODate;
  rejectReason?: string;
  /**
   * The package this receipt pays for (read-only, derived): `queued` = still waiting in the queue for this approval
   * (nothing delivered or blocked yet); `fromFree` = what the organization's «آزاد» covered (set aside for it).
   */
  forPackage?: { id: ID; title: string; recipients: number; total: Toman; fromFree: Toman; status: 'queued' | 'sent' | 'cancelled' | 'other' };
  /** Account balance right after this entry (done entries only). */
  balanceAfter?: Toman;
  /** @deprecated Always false — there is no overdue state. */
  overdue?: boolean;
  by?: string;
}

export interface CashSummary {
  /** Bank account balance (= «ریال» held + «ریال رزرو» held). */
  balance: Toman;
  /** Cash set aside for open buy orders. */
  tiedInOrders: Toman;
  /** Users' rial wallets (held in the same account, not the operator's money). */
  userWallets: Toman;
  /** @deprecated Rial part of open package commitments (before the rial treasuries); not part of `available` any more. */
  committedRial: Toman;
  /** Organizations' free balances (paid, not yet defined in a package). */
  orgFree: Toman;
  /** Organizations' money kept for their packages waiting for receipt approval (part of «ریال»). */
  orgSetAside: Toman;
  /** «ریال رزرو» held: sent packages waiting for recipients. */
  reserve: Toman;
  /** @deprecated Always 0 — a package is sent only when it is paid, so blocked money is always covered. */
  unfunded: Toman;
  /** Namadno's free rial = balance − user wallets − tied in orders − organizations' free and set-aside − reserve. */
  available: Toman;
  expectedDeposits: Toman;
  expectedCount: number;
  /** @deprecated Always 0 — receipts are reviewed, nothing becomes overdue. */
  overdueCount: number;
  /** @deprecated Always 0. */
  overdueAmount: Toman;
  /** oldest first; the last point is live. */
  history: { t: ISODate; balance: Toman; available: Toman }[];
}

// ───────────────────────── Organizations ─────────────────────────

export interface OrgTreasuryRow {
  orgId: ID;
  orgName: string;
  status: 'active' | 'onboarding' | 'suspended';
  /** Members' assets incl. rial (same number as the organization's AUM). */
  value: Toman;
  /** Members' fund holdings only (part of the allocated stock). */
  fundValue: Toman;
  reservedValue: Toman;
  /** Pending recipients of sent packages (not accepted yet). */
  commitments: Toman;
  pendingRecipients: number;
  depositsExpected: Toman;
  depositsOverdue: Toman;
  depositsReceivedYear: Toman;
  /** The organization's rial account with Namadno. */
  rial: OrgRialBalance;
}

/**
 * An organization's rial account with Namadno (Toman). balance = blocked + setAside + free.
 * A package is sent only when it is paid: when «آزاد» is short it waits in a queue (`awaiting_payment`) until Namadno
 * approves its receipt — nothing is delivered, blocked or unfunded meanwhile; only the part «آزاد» covered is set aside.
 */
export interface OrgRialBalance {
  /** Approved deposits − paid to recipients + reclaimed shares. */
  balance: Toman;
  /** Pending recipients of its sent packages (whole amounts), kept in «ریال رزرو». Always ≤ balance. */
  blocked: Toman;
  /** Paid and not yet defined in a package. */
  free: Toman;
  /** Kept from «آزاد» for its packages waiting for receipt approval (the part of them «آزاد» covered). */
  setAside: Toman;
  /** Whole amount and number of its packages waiting for receipt approval (`awaiting_payment`, not delivered). */
  queuedTotal: Toman;
  queuedCount: number;
  /** @deprecated Always 0 — nothing is sent before it is paid. */
  unfunded: Toman;
  /** Receipts waiting for Namadno's review. */
  pending: Toman;
  pendingCount: number;
}
export interface OrgRialAccount extends OrgRialBalance { orgId: ID; orgName: string; status: 'active' | 'onboarding' | 'suspended' }

// ───────────────────────── Rial treasuries ─────────────────────────

export type RialTreasuryId = 'rial' | 'rial_reserve';
/** «ریال» and «ریال رزرو» — the bank account split by whose money it is. Toman. */
export interface RialTreasury {
  /** Bank account balance = main.held + reserve.held. */
  bank: Toman;
  main: {
    held: Toman;
    /** Users' rial wallets, and their reserved part (e.g. card collateral). */
    users: Toman;
    usersReserved: Toman;
    /** Organizations' free balances. */
    orgFree: Toman;
    /** Organizations' money kept for their packages waiting for receipt approval. */
    orgSetAside: Toman;
    /** Set aside for open buy orders. */
    tied: Toman;
    /** Namadno's free rial (= CashSummary.available). Never negative. */
    available: Toman;
    /** Users' sales to Namadno waiting in the queue for free rial (rial to pay), and how many. */
    queuedValue: Toman;
    queuedCount: number;
    /** max(0, queued − available): rial Namadno must raise (e.g. a redemption) to release the queue («نیاز به تأمین ریال»). */
    needValue: Toman;
    target?: RialTarget;
    /** need_buy when sales wait for rial; otherwise below / surplus / ok against the target band. */
    state: StockState;
  };
  reserve: {
    /** = blocked: sent packages are always paid. */
    held: Toman;
    /** Pending recipients of sent packages (whole amounts). */
    blocked: Toman;
    /** @deprecated Always 0 — nothing is sent before it is paid. */
    unfunded: Toman;
    /** Organizations' receipts waiting for review (not part of the bank until approved). */
    expected: Toman;
    /** Always ok (kept for compatibility). */
    state: StockState;
  };
  byOrg: OrgRialAccount[];
  /** oldest first; the last point is live. */
  history: { t: ISODate; bank: Toman; available: Toman; reserve: Toman }[];
}

export type RialMoveKind =
  | 'org_deposit' | 'reserve' | 'payout' | 'release' | 'reclaim'
  | 'user_buy' | 'user_sell' | 'user_deposit' | 'user_withdrawal' | 'order_buy' | 'order_redeem' | 'fee' | 'adjustment';
/** One rial movement between the treasuries and wallets (derived from the ledger, packages and stock movements). */
export interface RialMove {
  id: ID;
  at: ISODate;
  kind: RialMoveKind;
  /** Always positive; `from` → `to` gives the direction. */
  amount: Toman;
  from: string;
  to: string;
  title: string;
  orgId?: ID;
  orgName?: string;
  userId?: ID;
  userName?: string;
  fundId?: ID;
  packageId?: ID;
  ref?: string;
}

export interface OrgTreasuryDetail {
  row: OrgTreasuryRow;
  deposits: CashEntry[];
  upcoming: ForecastEvent[];
}

// ───────────────────────── Targets + planning ─────────────────────────

/** Namadno's free rial should stay between these (Toman). */
export interface RialTarget { minFreeValue: Toman; maxFreeValue?: Toman }

export interface TreasuryTargets {
  stock: StockTarget[];
  /** Free rial of «ریال» (Namadno's own). */
  rial?: RialTarget;
  /** Total managed assets (Σ held fund value + the rial bank balance) by a date. */
  aum: { value: Toman; by: ISODate };
  /** Percent per fund id plus 'rial'; key 'other' = every other fund together. Sums to 100. */
  mix: Record<string, number>;
  /** Active organizations by a date. */
  orgs: { value: number; by: ISODate };
  /** Users by a date. */
  users: { value: number; by: ISODate };
  updatedAt: ISODate;
  updatedBy: string;
}

export type TargetsPatch = Partial<Pick<TreasuryTargets, 'stock' | 'rial' | 'aum' | 'mix' | 'orgs' | 'users'>>;

export type Horizon = 30 | 60 | 90;

/** Toman totals across funds for one week of the horizon. */
export interface ForecastBucket {
  label: string;
  from: ISODate;
  to: ISODate;
  /** Open commitments expected to be accepted (already out of free stock — informational). */
  commitments: Toman;
  /** Planned + expected new packages (drain). */
  newPackages: Toman;
  /** User buys from the stock (drain). */
  userBuys: Toman;
  /** User sells back to the stock (return). */
  userSells: Toman;
  /** Savings releases expected to be sold back (return). */
  vestingSellBack: Toman;
  /** Milestone shares expected to be reclaimed + expired commitments (return). */
  reclaims: Toman;
}

export interface ForecastEvent {
  id: ID;
  at: ISODate;
  kind: 'vesting_release' | 'milestone_due' | 'package_expiry' | 'planned_package' | 'order_settle' | 'deposit_due';
  title: string;
  value: Toman;
  count?: number;
  orgId?: ID;
  orgName?: string;
  fundId?: ID;
  href?: string;
}

export interface FundForecast {
  fundId: ID;
  availableNow: Toman;
  pendingBuy: Toman;
  demand: Toman;
  returns: Toman;
  /** returns − demand (negative = the stock drains). */
  net: Toman;
  /** availableNow + pendingBuy − demand + returns. */
  projectedEnd: Toman;
  /** max(minFreeValue, net daily demand × targetDays). */
  minTarget: Toman;
  coverageDays: number | null;
  state: StockState;
  suggestion?: StockSuggestion;
}

export type Severity = 'critical' | 'warning' | 'info';

export type OrderAction = { type: 'order'; side: OrderSide; fundId: ID; amount: Toman };

export interface Recommendation {
  id: ID;
  kind: 'buy' | 'redeem' | 'collect_deposit' | 'settle' | 'rebalance';
  severity: Severity;
  title: string;
  reason: string;
  fundId?: ID;
  orgId?: ID;
  /** With an order action: the amount to order now. Otherwise the amount the item is about. */
  amount?: Toman;
  /** Buy recommendations: the total need over the horizon (the order now may be smaller — capped by the stock maximum and free cash). */
  horizonAmount?: Toman;
  action: OrderAction | { type: 'link'; href: string };
}

export interface TargetProgress {
  /** 'aum' · 'orgs' · 'users' · 'mix' · 'stock:<fundId>' */
  key: string;
  label: string;
  current: number;
  target: number;
  by?: ISODate;
  /** 0–100 (capped). */
  pct: number;
  onTrack: boolean;
  /** Growth needed per month to reach the target by its date. */
  neededPerMonth?: number;
  unit: 'toman' | 'count' | 'days' | 'pct';
}

export interface TreasuryAssumptions {
  /** Share of open commitments that recipients accept (the rest returns on expiry). */
  acceptanceRate: number;
  /** Share of released savings that users sell back to the stock. */
  vestingSellBackPct: number;
  /** Share of milestone value that organizations reclaim. */
  reclaimRate: number;
  /** Gross user buys from the stock per day (Toman). */
  demandPerDay: Record<ID, Toman>;
  /** User sells back to the stock per day (Toman). */
  returnsPerDay: Record<ID, Toman>;
  /** Expected new packages per month beyond the planned ones (Toman, split by defaultSplit). */
  newPackagesPerMonth: Toman;
  /** Split used for packages where the employee chooses (free allocation). */
  defaultSplit: { gold: number; fixed: number; rial?: number };
}

export interface TreasuryPlan {
  horizon: Horizon;
  from: ISODate;
  to: ISODate;
  buckets: ForecastBucket[];
  perFund: FundForecast[];
  events: ForecastEvent[];
  recommendations: Recommendation[];
  progress: TargetProgress[];
  assumptions: TreasuryAssumptions;
}

// ───────────────────────── Summary ─────────────────────────

export interface TreasuryTotals {
  heldValue: Toman;
  allocatedValue: Toman;
  reservedValue: Toman;
  committedValue: Toman;
  availableValue: Toman;
  pendingBuyValue: Toman;
  pendingRedeemValue: Toman;
  unrealizedPnl: Toman;
  openOrders: number;
  dueOrders: number;
}

export interface TreasurySummary {
  asOf: ISODate;
  totals: TreasuryTotals;
  /** Whole stock (active funds): Σ(available + pending buy) / Σ net daily demand. */
  coverageDays: number | null;
  positions: TreasuryPosition[];
  cash: CashSummary;
  /** The two rial treasuries. */
  rial: RialTreasury;
  /** Managed assets = Σ held fund value + the rial bank balance. */
  managed: { value: Toman; funds: Toman; rial: Toman };
  /** Held value per fund plus 'rial' (bank balance); targetPct for keys with their own mix target. */
  mix: { fundId: ID; value: Toman; pct: number; targetPct?: number }[];
  /** Target share of all funds without their own key (targets.mix.other). */
  otherTargetPct?: number;
  byOrg: OrgTreasuryRow[];
  /** Allocated fund value held by individual users (not through an organization). */
  individualsValue: Toman;
  /** Daily Toman flows of the last `range` days, oldest first; the last point is today (live). */
  flow: { labels: ISODate[]; allocated: Toman[]; returned: Toman[]; bought: Toman[]; redeemed: Toman[] };
  /** Managed assets (funds + rial) per month this year (last = now) with the target path. */
  aumMonthly: { month: string; aum: Toman; target?: Toman }[];
  aumTarget: { value: Toman; by: ISODate; pct: number };
  growth: { activeOrgs: number; orgs: number; activeUsers: number; users: number };
}

// ───────────────────────── Actions + activity ─────────────────────────

export type ActionKind =
  | 'stock_shortfall' | 'stock_below' | 'stock_surplus' | 'order_settle' | 'deposit_overdue' | 'deposit_expected'
  | 'request_sla' | 'risk_alert' | 'milestone_due' | 'org_onboarding' | 'service_incident' | 'rial_shortfall' | 'rial_below' | 'reserve_unfunded'
  /** A receipt waiting for review (cta review_deposit). deposit_overdue / deposit_expected / reserve_unfunded are no longer produced. */
  | 'deposit_review'
  /**
   * «نیاز به خرید»: items wait for a fund's stock (cta order buy) · «نیاز به تأمین ریال»: users' sales wait for free rial.
   * stock_shortfall / rial_shortfall are no longer produced (nothing goes negative).
   */
  | 'stock_need_buy' | 'rial_need';

export interface ActionItem {
  id: ID;
  kind: ActionKind;
  severity: Severity;
  title: string;
  sub: string;
  at?: ISODate;
  amount?: Toman;
  fundId?: ID;
  orgId?: ID;
  href: string;
  cta: {
    label: string;
    action?: OrderAction | { type: 'confirm_deposit'; id: ID } | { type: 'review_deposit'; id: ID } | { type: 'settle_order'; id: ID };
  };
}

export type ActorKind = 'user' | 'org' | 'operator' | 'system';
export type ActivityCategory = 'package' | 'trade' | 'cash' | 'reserve' | 'account' | 'contract' | 'treasury' | 'request';
/** Same names as the Panel kit tones. */
export type ActivityTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info';

export interface ActivityEvent {
  id: ID;
  at: ISODate;
  actor: { kind: ActorKind; id?: ID; name: string };
  orgId?: ID;
  orgName?: string;
  category: ActivityCategory;
  /** Machine name, e.g. 'package_sent', 'order_settled'. */
  kind: string;
  title: string;
  sub?: string;
  amount?: Toman;
  fundId?: ID;
  units?: number;
  tone: ActivityTone;
  href?: string;
  /** Related ids (package, request, order, user, alert …). */
  refs?: { type: string; id: ID; label?: string }[];
}

export interface ActivityPage {
  items: ActivityEvent[];
  total: number;
  /** Counts per actor kind for the other filters (for the actor tabs). */
  counts: Record<ActorKind | 'all', number>;
  /** Last 14 days, oldest first. */
  daily: { date: ISODate; user: number; org: number; operator: number; system: number }[];
}

export interface ActivityFilter {
  /** One kind, or several (sent as a comma list, e.g. «سامانه» = `operator,system`). */
  actor?: ActorKind | 'all' | ActorKind[];
  category?: ActivityCategory | 'all';
  orgId?: ID;
  userId?: ID;
  q?: string;
  limit?: number;
  offset?: number;
}

// ───────────────────────── Keys ─────────────────────────

export const tq = {
  all: ['op', 'treasury'] as const,
  summary: (range: number) => ['op', 'treasury', 'summary', range] as const,
  positions: ['op', 'treasury', 'positions'] as const,
  position: (id: string) => ['op', 'treasury', 'position', id] as const,
  movements: (f?: Record<string, unknown>) => ['op', 'treasury', 'movements', f ?? {}] as const,
  orders: (f?: Record<string, unknown>) => ['op', 'treasury', 'orders', f ?? {}] as const,
  quote: (v: Record<string, unknown>) => ['op', 'treasury', 'quote', v] as const,
  cash: (range: number) => ['op', 'treasury', 'cash', range] as const,
  cashEntries: (f?: Record<string, unknown>) => ['op', 'treasury', 'cash-entries', f ?? {}] as const,
  rial: (range: number) => ['op', 'treasury', 'rial', range] as const,
  rialMoves: (f?: Record<string, unknown>) => ['op', 'treasury', 'rial-moves', f ?? {}] as const,
  org: (id: string) => ['op', 'treasury', 'org', id] as const,
  targets: ['op', 'treasury', 'targets'] as const,
  plan: (h: number) => ['op', 'treasury', 'plan', h] as const,
  actions: ['op', 'actions'] as const,
  queue: (f?: Record<string, unknown>) => ['op', 'treasury', 'queue', f ?? {}] as const,
  activity: (f?: Record<string, unknown>) => ['op', 'activity', f ?? {}] as const,
};

/** Every treasury change can move fund AUM, org AUM and the overview — refresh all operator data. */
function useTreasuryMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.op.all });
      qc.invalidateQueries({ queryKey: qk.funds });
      qc.invalidateQueries({ queryKey: qk.org.all });
    },
  });
}

const clean = (f?: object) => Object.fromEntries(Object.entries(f ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')) as Record<string, string | number>;

// ───────────────────────── Hooks ─────────────────────────

export const useTreasurySummary = (range: 7 | 30 | 90 = 30) =>
  useQuery({ queryKey: tq.summary(range), queryFn: () => get<TreasurySummary>('/op/treasury/summary', { range }) });

export const useTreasuryPositions = () =>
  useQuery({ queryKey: tq.positions, queryFn: () => get<TreasuryPosition[]>('/op/treasury/positions') });

export const useTreasuryPosition = (fundId: string | undefined) =>
  useQuery({ queryKey: tq.position(fundId ?? ''), queryFn: () => get<TreasuryPositionDetail>(`/op/treasury/positions/${fundId}`), enabled: !!fundId });

export type MovementFilter = { fundId?: ID; kind?: StockMovement['kind'] | 'all'; limit?: number };
export const useStockMovements = (f: MovementFilter = {}) =>
  useQuery({ queryKey: tq.movements(clean(f)), queryFn: () => get<StockMovement[]>('/op/treasury/movements', clean(f)) });

/** status: 'placed' | 'due' (placed and due now) | 'settled' | 'cancelled' | 'all'. */
export type OrderFilter = { status?: TreasuryOrder['status'] | 'due' | 'all'; fundId?: ID; side?: OrderSide | 'all' };
export const useTreasuryOrders = (f: OrderFilter = {}) =>
  useQuery({ queryKey: tq.orders(clean(f)), queryFn: () => get<TreasuryOrder[]>('/op/treasury/orders', clean(f)) });

/** Live quote for the order dialog. Runs only when a fund is chosen and amount > 0. */
export const useOrderQuote = (v: { fundId?: ID; side: OrderSide; amount: Toman }) =>
  useQuery({
    queryKey: tq.quote(v),
    queryFn: () => post<OrderQuote>('/op/treasury/orders/quote', v),
    enabled: !!v.fundId && v.amount > 0,
    retry: false,
    staleTime: 0,
  });

export const usePlaceOrder = () => useTreasuryMutation((v: PlaceOrderBody) => post<TreasuryOrder>('/op/treasury/orders', v));
export const useSettleOrder = () => useTreasuryMutation((v: { id: ID }) => post<TreasuryOrder>(`/op/treasury/orders/${v.id}/settle`));
export const useCancelOrder = () => useTreasuryMutation((v: { id: ID; reason?: string }) => post<TreasuryOrder>(`/op/treasury/orders/${v.id}/cancel`, { reason: v.reason }));

export const useCashSummary = (range: 30 | 90 = 30) =>
  useQuery({ queryKey: tq.cash(range), queryFn: () => get<CashSummary>('/op/treasury/cash', { range }) });

export type CashEntryFilter = { kind?: CashEntryKind | 'all'; status?: CashEntry['status'] | 'overdue' | 'all'; orgId?: ID };
export const useCashEntries = (f: CashEntryFilter = {}) =>
  useQuery({ queryKey: tq.cashEntries(clean(f)), queryFn: () => get<CashEntry[]>('/op/treasury/cash/entries', clean(f)) });

/** «ریال» and «ریال رزرو» with every organization's rial account. */
export const useRialTreasury = (range: 30 | 90 = 30) =>
  useQuery({ queryKey: tq.rial(range), queryFn: () => get<RialTreasury>('/op/treasury/rial', { range }) });

export type RialMoveFilter = { kind?: RialMoveKind | 'all'; orgId?: ID; userId?: ID; limit?: number };
/** Rial movements between the treasuries and wallets, newest first. */
export const useRialMoves = (f: RialMoveFilter = {}) =>
  useQuery({ queryKey: tq.rialMoves(clean(f)), queryFn: () => get<RialMove[]>('/op/treasury/rial/moves', clean(f)) });

/** Approve a receipt: the money goes into the organization's rial account; a package waiting for it is delivered. */
export const useConfirmDeposit = () => useTreasuryMutation((v: { id: ID; ref?: string }) => post<CashEntry & {
  deliveredPackage?: { id: ID; title: string; recipients: number };
  /** Paid, but the stock is short: the package waits for Namadno's buy, sent at the latest by `eta`. */
  stockQueued?: { id: ID; title: string; eta: ISODate };
}>(`/op/treasury/deposits/${v.id}/confirm`, { ref: v.ref }));
/** Reject a receipt with a reason (the organization is notified and can upload a new one). */
export const useRejectDeposit = () => useTreasuryMutation((v: { id: ID; reason: string }) => post<CashEntry>(`/op/treasury/deposits/${v.id}/reject`, { reason: v.reason }));
export const useRecordDeposit = () => useTreasuryMutation((v: { orgId: ID; amount: Toman; ref?: string; note?: string }) => post<CashEntry>('/op/treasury/deposits', v));

export const useOrgTreasury = (orgId: string | undefined) =>
  useQuery({ queryKey: tq.org(orgId ?? ''), queryFn: () => get<OrgTreasuryDetail>(`/op/treasury/orgs/${orgId}`), enabled: !!orgId });

export const useTreasuryTargets = () =>
  useQuery({ queryKey: tq.targets, queryFn: () => get<TreasuryTargets>('/op/treasury/targets') });
export const useUpdateTargets = () => useTreasuryMutation((v: TargetsPatch) => patch<TreasuryTargets>('/op/treasury/targets', v));

export const useTreasuryPlan = (horizon: Horizon = 30) =>
  useQuery({ queryKey: tq.plan(horizon), queryFn: () => get<TreasuryPlan>('/op/treasury/plan', { horizon }) });

/** «صف تأمین»: everything waiting for stock or free rial, oldest first (optionally one fund, or 'rial'). */
export const useStockQueue = (fundId?: string) =>
  useQuery({ queryKey: tq.queue(clean({ fundId })), queryFn: () => get<QueueItem[]>('/op/treasury/queue', clean({ fundId })) });

/** «صف اقدام»: everything that needs the operator, most severe first. */
export const useTreasuryActions = () =>
  useQuery({ queryKey: tq.actions, queryFn: () => get<ActionItem[]>('/op/actions') });

export const useOpActivity = (f: ActivityFilter = {}) =>
  useQuery({ queryKey: tq.activity(clean(f)), queryFn: () => get<ActivityPage>('/op/activity', clean(f)) });
