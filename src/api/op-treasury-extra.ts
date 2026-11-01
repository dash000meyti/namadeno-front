'use client';
/**
 * Operator treasury («خزانه») — types + React Query hooks owned by the "op-treasury" area.
 *
 * Namadno buys units from investment funds and keeps them as ONE pooled stock. Parts of that stock are allocated to
 * organizations' packages and to users (partly reserved); the rest is free stock. Cash flows through one platform
 * rial account: organization deposits in, unit buy orders («صدور») out, redemptions («ابطال») in.
 *
 * Identities (per fund, units):
 *   allocated = baseline + Σ modelled holdings          reserved = baseline + Σ modelled reservations
 *   committed = baseline + pending recipients of sent packages × split
 *   available (free stock) = held − allocated − committed − pending redeem       (negative = shortfall)
 *   coverageDays = (available + pending buy) value / net daily demand            (null when net demand ≤ 0)
 * Cash: balance = opening + Σ done entries; available = balance − tied in buy orders − user wallets − committed rial.
 *
 * Endpoints are implemented by src/mocks/handlers/op-treasury-extra.ts (engine: src/mocks/treasury.ts) and
 * documented in docs/API.md («بهره‌بردار — خزانه …»).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ID, ISODate, LockType, Toman } from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

// ───────────────────────── Stock ─────────────────────────

export type StockState = 'shortfall' | 'below' | 'ok' | 'surplus' | 'inactive';
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
  /** held − allocated − committed − pendingRedeem. Negative = shortfall. */
  availableUnits: number;
  heldValue: Toman;
  allocatedValue: Toman;
  reservedValue: Toman;
  committedValue: Toman;
  availableValue: Toman;
  pendingBuyValue: Toman;
  pendingRedeemValue: Toman;
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

export interface CashEntry {
  id: ID;
  /** When it hit the account (done) or was created (expected). */
  at: ISODate;
  kind: CashEntryKind;
  /** Signed Toman: + into the platform account. */
  amount: Toman;
  status: 'expected' | 'done' | 'cancelled';
  title: string;
  orgId?: ID;
  orgName?: string;
  packageId?: ID;
  orderId?: ID;
  userId?: ID;
  dueAt?: ISODate;
  receivedAt?: ISODate;
  /** Bank reference of a received deposit. */
  ref?: string;
  note?: string;
  /** Account balance right after this entry (done entries only). */
  balanceAfter?: Toman;
  /** expected and dueAt < now. */
  overdue?: boolean;
  by?: string;
}

export interface CashSummary {
  balance: Toman;
  /** Cash set aside for open buy orders. */
  tiedInOrders: Toman;
  /** Users' rial wallets (held in the same account, not the operator's money). */
  userWallets: Toman;
  /** Rial part of open package commitments. */
  committedRial: Toman;
  available: Toman;
  expectedDeposits: Toman;
  expectedCount: number;
  overdueCount: number;
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
}

export interface OrgTreasuryDetail {
  row: OrgTreasuryRow;
  deposits: CashEntry[];
  upcoming: ForecastEvent[];
}

// ───────────────────────── Targets + planning ─────────────────────────

export interface TreasuryTargets {
  stock: StockTarget[];
  /** Total managed assets (Σ held value) by a date. */
  aum: { value: Toman; by: ISODate };
  /** Percent per fund id; key 'other' = every other fund together. Sums to 100. */
  mix: Record<string, number>;
  /** Active organizations by a date. */
  orgs: { value: number; by: ISODate };
  /** Users by a date. */
  users: { value: number; by: ISODate };
  updatedAt: ISODate;
  updatedBy: string;
}

export type TargetsPatch = Partial<Pick<TreasuryTargets, 'stock' | 'aum' | 'mix' | 'orgs' | 'users'>>;

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
  /** Held value per fund; targetPct for funds with their own mix target. */
  mix: { fundId: ID; value: Toman; pct: number; targetPct?: number }[];
  /** Target share of all funds without their own key (targets.mix.other). */
  otherTargetPct?: number;
  byOrg: OrgTreasuryRow[];
  /** Allocated fund value held by individual users (not through an organization). */
  individualsValue: Toman;
  /** Daily Toman flows of the last `range` days, oldest first; the last point is today (live). */
  flow: { labels: ISODate[]; allocated: Toman[]; returned: Toman[]; bought: Toman[]; redeemed: Toman[] };
  /** Managed assets per month this year (last = now) with the target path. */
  aumMonthly: { month: string; aum: Toman; target?: Toman }[];
  aumTarget: { value: Toman; by: ISODate; pct: number };
  growth: { activeOrgs: number; orgs: number; activeUsers: number; users: number };
}

// ───────────────────────── Actions + activity ─────────────────────────

export type ActionKind =
  | 'stock_shortfall' | 'stock_below' | 'stock_surplus' | 'order_settle' | 'deposit_overdue' | 'deposit_expected'
  | 'request_sla' | 'risk_alert' | 'milestone_due' | 'org_onboarding' | 'service_incident';

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
    action?: OrderAction | { type: 'confirm_deposit'; id: ID } | { type: 'settle_order'; id: ID };
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
  actor?: ActorKind | 'all';
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
  org: (id: string) => ['op', 'treasury', 'org', id] as const,
  targets: ['op', 'treasury', 'targets'] as const,
  plan: (h: number) => ['op', 'treasury', 'plan', h] as const,
  actions: ['op', 'actions'] as const,
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

export const useConfirmDeposit = () => useTreasuryMutation((v: { id: ID; ref?: string }) => post<CashEntry>(`/op/treasury/deposits/${v.id}/confirm`, { ref: v.ref }));
export const useRecordDeposit = () => useTreasuryMutation((v: { orgId: ID; amount: Toman; ref?: string; note?: string }) => post<CashEntry>('/op/treasury/deposits', v));

export const useOrgTreasury = (orgId: string | undefined) =>
  useQuery({ queryKey: tq.org(orgId ?? ''), queryFn: () => get<OrgTreasuryDetail>(`/op/treasury/orgs/${orgId}`), enabled: !!orgId });

export const useTreasuryTargets = () =>
  useQuery({ queryKey: tq.targets, queryFn: () => get<TreasuryTargets>('/op/treasury/targets') });
export const useUpdateTargets = () => useTreasuryMutation((v: TargetsPatch) => patch<TreasuryTargets>('/op/treasury/targets', v));

export const useTreasuryPlan = (horizon: Horizon = 30) =>
  useQuery({ queryKey: tq.plan(horizon), queryFn: () => get<TreasuryPlan>('/op/treasury/plan', { horizon }) });

/** «صف اقدام»: everything that needs the operator, most severe first. */
export const useTreasuryActions = () =>
  useQuery({ queryKey: tq.actions, queryFn: () => get<ActionItem[]>('/op/actions') });

export const useOpActivity = (f: ActivityFilter = {}) =>
  useQuery({ queryKey: tq.activity(clean(f)), queryFn: () => get<ActivityPage>('/op/activity', clean(f)) });
