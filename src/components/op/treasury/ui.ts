/**
 * Shared vocabulary of the operator treasury screens (stock, orders, cash, planning, activity).
 * Labels follow docs/WORDING.md: «رزرو» (never «قفل»), «صدور» = buying units from a fund, «ابطال» = redeeming units.
 * Tones are Panel kit tones (src/components/panel/kit.tsx).
 */
import type { Tone } from '@/components/panel/kit';
import type {
  ActionKind, ActivityCategory, ActorKind, CashEntry, CashEntryKind, ForecastEvent, OrderSide, QueueItem, RialMoveKind, RialTreasuryId,
  Severity, StockMovement, StockState, TreasuryOrder,
} from '@/api/op-treasury-extra';
import { FUND_UI } from '@/components/op/system/funds';
import { JALALI_MONTHS, compactMoney, faDigits } from '@/lib/format';
import { jParts, jalaliToIsoAny } from '@/lib/jalali';
import { now } from '@/lib/clock';
import type { AssetKind } from '@/types/domain';

/** Icons used across the treasury pages. */
export const TI = {
  stock: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  order: 'M7 4h10l3 3v13H4V4zM8 10h8M8 14h8M8 18h5',
  buy: 'M12 4v16M5 13l7 7 7-7',
  redeem: 'M12 20V4M5 11l7-7 7 7',
  cash: 'M3 7h18v12H3zM3 11h18M7 15h3',
  deposit: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  plan: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  org: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  team: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  system: 'M4 5h16v11H4zM8 20h8M12 16v4',
  chevL: 'M14 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  wallet: 'M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2zM16 14h.01',
  reserve: 'M6 3h12M6 21h12M7 3c0 4 5 5 5 9s-5 5-5 9M17 3c0 4-5 5-5 9s5 5 5 9',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
};

/**
 * The two rial treasuries («ریال» and «ریال رزرو») — shown like funds in the stock list, first.
 * Everything users and organizations do with Namadno is in rial; funds are back-office policy.
 */
export const RIAL_UI: Record<RialTreasuryId, { name: string; short: string; sub: string; d: string; tone: Tone; col: string }> = {
  rial: { name: 'ریال', short: 'ریال', sub: 'کیف پول کاربران، حساب آزاد سازمان‌ها و ریال آزاد نمادنو', d: TI.wallet, tone: 'neutral', col: '--grey-600' },
  rial_reserve: { name: 'ریال رزرو', short: 'ریال رزرو', sub: 'مبلغ بسته‌های ارسالی تا دریافت گیرندگان', d: TI.reserve, tone: 'secondary', col: '--secondary-main' },
};

/** Organization rial account states. */
export const ORG_RIAL = {
  free: { label: 'آزاد', tone: 'success' as Tone, sub: 'واریز‌شده، هنوز در بسته‌ای تعریف نشده' },
  blocked: { label: 'بلاک‌شده', tone: 'secondary' as Tone, sub: 'در «ریال رزرو» برای بسته‌های ارسالی' },
  setAside: { label: 'کنار گذاشته', tone: 'info' as Tone, sub: 'از «آزاد» برای بسته‌های در صف، تا تأیید فیش' },
  queued: { label: 'بسته در صف', tone: 'warning' as Tone, sub: 'تا تأیید فیش واریز ارسال نمی‌شود؛ چیزی بلاک نشده است' },
  pending: { label: 'در انتظار تأیید فیش', tone: 'warning' as Tone, sub: 'فیش واریز بارگذاری‌شده، هنوز تأیید نشده' },
};

/** Rial movements between the treasuries and wallets. */
export const RIAL_MOVE: Record<RialMoveKind, { label: string; tone: Tone; d: string }> = {
  org_deposit: { label: 'واریز سازمان', tone: 'success', d: TI.deposit },
  reserve: { label: 'بلاک برای بسته', tone: 'secondary', d: TI.reserve },
  payout: { label: 'دریافت بسته', tone: 'primary', d: TI.user },
  release: { label: 'برگشت به حساب سازمان', tone: 'neutral', d: TI.reserve },
  reclaim: { label: 'بازپس‌گیری', tone: 'warning', d: TI.org },
  user_buy: { label: 'خرید کاربر از موجودی', tone: 'info', d: TI.buy },
  user_sell: { label: 'فروش کاربر به نمادنو', tone: 'neutral', d: TI.redeem },
  user_deposit: { label: 'واریز کاربر', tone: 'success', d: TI.deposit },
  user_withdrawal: { label: 'برداشت کاربر', tone: 'neutral', d: TI.redeem },
  order_buy: { label: 'صدور', tone: 'primary', d: TI.buy },
  order_redeem: { label: 'ابطال', tone: 'info', d: TI.redeem },
  fee: { label: 'کارمزد', tone: 'neutral', d: TI.cash },
  adjustment: { label: 'اصلاح', tone: 'neutral', d: TI.cash },
};

const toKit = (t: string): Tone => (t === 'default' ? 'neutral' : (t as Tone));
/** Icon, kit tone and chart colour variable of a fund (fund ids are asset kinds: gold, fixed, …). */
export function fundUi(fundId: string): { d: string; tone: Tone; col: string } {
  const u = FUND_UI[fundId as AssetKind] ?? { d: TI.stock, tone: 'default', col: '--grey-500' };
  return { d: u.d, tone: toKit(u.tone), col: `var(${u.col})` };
}

/**
 * Nothing goes negative: what the stock cannot cover waits in the queue («صف تأمین») → «نیاز به خرید».
 * `shortfall` is no longer produced; it is kept as an alias of `need_buy` for old data.
 */
const NEED_BUY = { label: 'نیاز به خرید', tone: 'error' as Tone, hint: 'مواردی در صف تأمین منتظر موجودی این صندوق‌اند؛ صدور فوری لازم است' };
/** Items wait in the queue for this stock (the deprecated `shortfall` counts too). */
export const isNeed = (s: StockState) => s === 'need_buy' || s === 'shortfall';
export const STOCK_STATE: Record<StockState, { label: string; tone: Tone; hint: string }> = {
  need_buy: NEED_BUY,
  shortfall: NEED_BUY,
  below: { label: 'زیر هدف', tone: 'warning', hint: 'موجودی آزاد کمتر از حداقل هدف است' },
  ok: { label: 'متعادل', tone: 'success', hint: 'موجودی آزاد در محدوده‌ی هدف است' },
  surplus: { label: 'مازاد', tone: 'info', hint: 'موجودی آزاد بیشتر از سقف هدف است' },
  inactive: { label: 'غیرفعال', tone: 'neutral', hint: 'صندوق فعال نیست' },
};

/** Kinds of items waiting in the queue («صف تأمین») for a fund's stock or Namadno's free rial. */
export const QUEUE_KIND: Record<QueueItem['kind'], { label: string; tone: Tone; d: string }> = {
  package: { label: 'بسته‌ی سازمان', tone: 'secondary', d: TI.org },
  buy: { label: 'خرید کاربر', tone: 'info', d: TI.buy },
  accept: { label: 'سهم بسته‌ی پذیرفته‌شده', tone: 'primary', d: TI.user },
  sell: { label: 'فروش کاربر · در انتظار ریال', tone: 'warning', d: TI.wallet },
};

export const SIDE: Record<OrderSide, { label: string; long: string; tone: Tone; d: string }> = {
  buy: { label: 'صدور', long: 'صدور واحد (خرید از صندوق)', tone: 'primary', d: TI.buy },
  redeem: { label: 'ابطال', long: 'ابطال واحد (فروش به صندوق)', tone: 'info', d: TI.redeem },
};

/**
 * Cash-first: an order to a fund is recorded only when it is done (paid, units in or out of the stock at once), so every
 * order reads «ثبت‌شده». `placed` / `cancelled` are no longer produced; old data falls back to «ثبت‌شده» / «لغوشده».
 */
export function orderStatus(o: TreasuryOrder): { label: string; tone: Tone } {
  if (o.status === 'cancelled') return { label: 'لغوشده', tone: 'neutral' };
  return { label: 'ثبت‌شده', tone: 'success' };
}
/** When an order was recorded (= done). */
export const orderAt = (o: TreasuryOrder): string => o.settledAt ?? o.placedAt;
/** The current Jalali month: its name and the ISO start (half a day early so the whole first day counts). */
export function thisMonth(): { name: string; from: string } {
  const p = jParts(now());
  const start = jalaliToIsoAny(p.y, p.m, 1);
  return { name: JALALI_MONTHS[p.m - 1], from: start ? new Date(Date.parse(start) - 12 * 3_600_000).toISOString() : '' };
}

export const CASH_KIND: Record<CashEntryKind, { label: string; tone: Tone }> = {
  org_deposit: { label: 'واریز سازمان', tone: 'success' },
  order_buy: { label: 'سفارش صدور', tone: 'primary' },
  order_redeem: { label: 'ابطال واحد', tone: 'info' },
  user_deposit: { label: 'واریز کاربران', tone: 'success' },
  user_withdrawal: { label: 'برداشت کاربران', tone: 'warning' },
  fee: { label: 'کارمزد', tone: 'neutral' },
  adjustment: { label: 'اصلاح', tone: 'neutral' },
};

export function cashStatus(e: CashEntry): { label: string; tone: Tone } {
  // organization receipts are reviewed by the operator; nothing becomes overdue
  if (e.status === 'done') return e.kind === 'org_deposit' && e.receipt ? { label: 'تأییدشده', tone: 'success' } : { label: 'انجام‌شده', tone: 'success' };
  if (e.status === 'cancelled') return { label: 'لغوشده', tone: 'neutral' };
  if (e.status === 'rejected') return { label: 'ردشده', tone: 'error' };
  return { label: 'در انتظار تأیید', tone: 'warning' };
}

export const MOVE_KIND: Record<StockMovement['kind'], { label: string; tone: Tone }> = {
  buy_settle: { label: 'صدور واحد', tone: 'primary' },
  redeem_settle: { label: 'ابطال واحد', tone: 'info' },
  allocate: { label: 'تخصیص به کاربر', tone: 'warning' },
  user_buy: { label: 'خرید کاربر', tone: 'warning' },
  user_sell: { label: 'فروش کاربر', tone: 'success' },
  reclaim: { label: 'بازپس‌گیری', tone: 'success' },
  adjust: { label: 'اصلاح', tone: 'neutral' },
};

/** Actor groups shown in the console: the Namadno team and automatic actions are one group, «سامانه» (the data keeps both kinds). */
export const ACTOR: Record<ActorKind, { label: string; one: string; d: string; tone: Tone }> = {
  user: { label: 'کاربران', one: 'کاربر', d: TI.user, tone: 'info' },
  org: { label: 'سازمان‌ها', one: 'سازمان', d: TI.org, tone: 'secondary' },
  operator: { label: 'سامانه', one: 'سامانه', d: TI.system, tone: 'neutral' },
  system: { label: 'سامانه', one: 'سامانه', d: TI.system, tone: 'neutral' },
};

export const CATEGORY: Record<ActivityCategory, string> = {
  package: 'بسته', trade: 'معامله', cash: 'نقدینگی', reserve: 'رزرو', account: 'حساب', contract: 'قرارداد', treasury: 'خزانه', request: 'درخواست',
};

export const SEVERITY: Record<Severity, { label: string; tone: Tone }> = {
  critical: { label: 'فوری', tone: 'error' },
  warning: { label: 'مهم', tone: 'warning' },
  info: { label: 'اطلاع', tone: 'info' },
};

export const ACTION_KIND: Record<ActionKind, { d: string; tone: Tone }> = {
  stock_need_buy: { d: TI.alert, tone: 'error' },
  rial_need: { d: TI.wallet, tone: 'error' },
  /** no longer produced (nothing goes negative; see stock_need_buy / rial_need) */
  stock_shortfall: { d: TI.alert, tone: 'error' },
  stock_below: { d: TI.stock, tone: 'warning' },
  stock_surplus: { d: TI.stock, tone: 'info' },
  /** no longer produced (orders are recorded only when done) */
  order_settle: { d: TI.order, tone: 'primary' },
  deposit_overdue: { d: TI.cash, tone: 'error' },
  deposit_expected: { d: TI.cash, tone: 'warning' },
  deposit_review: { d: TI.deposit, tone: 'warning' },
  request_sla: { d: TI.clock, tone: 'warning' },
  risk_alert: { d: TI.alert, tone: 'error' },
  milestone_due: { d: TI.target, tone: 'info' },
  org_onboarding: { d: TI.org, tone: 'secondary' },
  service_incident: { d: TI.system, tone: 'warning' },
  /** no longer produced */
  rial_shortfall: { d: TI.wallet, tone: 'error' },
  rial_below: { d: TI.wallet, tone: 'warning' },
  /** no longer produced (nothing is sent before it is paid) */
  reserve_unfunded: { d: TI.reserve, tone: 'warning' },
};

export const EVENT_KIND: Record<ForecastEvent['kind'], { label: string; tone: Tone }> = {
  vesting_release: { label: 'آزادسازی پس‌انداز', tone: 'success' },
  milestone_due: { label: 'سررسید مرحله', tone: 'info' },
  package_expiry: { label: 'پایان مهلت بسته', tone: 'neutral' },
  planned_package: { label: 'بسته‌ی برنامه‌ریزی‌شده', tone: 'warning' },
  // kept for the type; orders are recorded only when done, so this event is no longer produced
  order_settle: { label: 'سفارش صندوق', tone: 'primary' },
  // kept for the type; receipts are reviewed instead, so this event is no longer produced
  deposit_due: { label: 'فیش واریز', tone: 'warning' },
};

/** A buy suggested for a whole horizon, capped to what fits under the fund's stock maximum now (0.1B / 10M steps). */
export function buyNowCap(p: { target?: { maxFreeValue?: number }; availableValue: number; pendingBuyValue: number }, amount: number): number {
  const max = p.target?.maxFreeValue;
  if (!max) return amount;
  const step = amount >= 1e9 ? 1e8 : 1e7;
  return Math.max(0, Math.min(amount, Math.floor((max - (p.availableValue + p.pendingBuyValue)) / step) * step));
}

/** «۲۵۹ میلیارد» — compact Toman amount (no unit word). */
export const amt = (n: number) => compactMoney(n);
/** Coverage days: «۱۷ روز», «بیش از ۳۶۵ روز», or «بدون مصرف» when net demand ≤ 0. */
export function daysText(d: number | null | undefined): string {
  if (d == null) return 'بدون مصرف';
  if (d > 365) return 'بیش از ۳۶۵ روز';
  return `${faDigits(Math.max(0, Math.round(d)))} روز`;
}
/** Fund units with two decimals at most. */
export function unitsText(u: number): string {
  const v = Math.abs(u) >= 1000 ? Math.round(u) : Math.round(u * 100) / 100;
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬').replace('.', '٫');
  return (v < 0 ? '−' : '') + faDigits(s);
}
