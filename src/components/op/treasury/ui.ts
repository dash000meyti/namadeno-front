/**
 * Shared vocabulary of the operator treasury screens (stock, orders, cash, planning, activity).
 * Labels follow docs/WORDING.md: «رزرو» (never «قفل»), «صدور» = buying units from a fund, «ابطال» = redeeming units.
 * Tones are Panel kit tones (src/components/panel/kit.tsx).
 */
import type { Tone } from '@/components/panel/kit';
import type {
  ActionKind, ActivityCategory, ActorKind, CashEntry, CashEntryKind, ForecastEvent, OrderSide, Severity, StockMovement,
  StockState, TreasuryOrder,
} from '@/api/op-treasury-extra';
import { FUND_UI } from '@/components/op/system/funds';
import { compactMoney, faDigits } from '@/lib/format';
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
};

const toKit = (t: string): Tone => (t === 'default' ? 'neutral' : (t as Tone));
/** Icon, kit tone and chart colour variable of a fund (fund ids are asset kinds: gold, fixed, …). */
export function fundUi(fundId: string): { d: string; tone: Tone; col: string } {
  const u = FUND_UI[fundId as AssetKind] ?? { d: TI.stock, tone: 'default', col: '--grey-500' };
  return { d: u.d, tone: toKit(u.tone), col: `var(${u.col})` };
}

export const STOCK_STATE: Record<StockState, { label: string; tone: Tone; hint: string }> = {
  shortfall: { label: 'کسری', tone: 'error', hint: 'موجودی آزاد منفی است؛ خرید فوری لازم است' },
  below: { label: 'زیر هدف', tone: 'warning', hint: 'موجودی آزاد کمتر از هدف پوشش است' },
  ok: { label: 'متعادل', tone: 'success', hint: 'موجودی آزاد در محدوده‌ی هدف است' },
  surplus: { label: 'مازاد', tone: 'info', hint: 'موجودی آزاد بیشتر از سقف هدف است' },
  inactive: { label: 'غیرفعال', tone: 'neutral', hint: 'صندوق فعال نیست' },
};

export const SIDE: Record<OrderSide, { label: string; long: string; tone: Tone; d: string }> = {
  buy: { label: 'صدور', long: 'صدور واحد (خرید از صندوق)', tone: 'primary', d: TI.buy },
  redeem: { label: 'ابطال', long: 'ابطال واحد (فروش به صندوق)', tone: 'info', d: TI.redeem },
};

export function orderStatus(o: TreasuryOrder): { label: string; tone: Tone } {
  if (o.status === 'settled') return { label: 'تسویه‌شده', tone: 'success' };
  if (o.status === 'cancelled') return { label: 'لغوشده', tone: 'neutral' };
  return o.dueNow ? { label: 'سررسید تسویه', tone: 'warning' } : { label: 'در انتظار تسویه', tone: 'info' };
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
  if (e.status === 'done') return { label: 'انجام‌شده', tone: 'success' };
  if (e.status === 'cancelled') return { label: 'لغوشده', tone: 'neutral' };
  return e.overdue ? { label: 'دیرکرد', tone: 'error' } : { label: 'در انتظار', tone: 'warning' };
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

export const ACTOR: Record<ActorKind, { label: string; one: string; d: string; tone: Tone }> = {
  user: { label: 'کاربران', one: 'کاربر', d: TI.user, tone: 'info' },
  org: { label: 'سازمان‌ها', one: 'سازمان', d: TI.org, tone: 'secondary' },
  operator: { label: 'تیم نمادنو', one: 'تیم نمادنو', d: TI.team, tone: 'primary' },
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
  stock_shortfall: { d: TI.alert, tone: 'error' },
  stock_below: { d: TI.stock, tone: 'warning' },
  stock_surplus: { d: TI.stock, tone: 'info' },
  order_settle: { d: TI.order, tone: 'primary' },
  deposit_overdue: { d: TI.cash, tone: 'error' },
  deposit_expected: { d: TI.cash, tone: 'warning' },
  request_sla: { d: TI.clock, tone: 'warning' },
  risk_alert: { d: TI.alert, tone: 'error' },
  milestone_due: { d: TI.target, tone: 'info' },
  org_onboarding: { d: TI.org, tone: 'secondary' },
  service_incident: { d: TI.system, tone: 'warning' },
};

export const EVENT_KIND: Record<ForecastEvent['kind'], { label: string; tone: Tone }> = {
  vesting_release: { label: 'آزادسازی پس‌انداز', tone: 'success' },
  milestone_due: { label: 'سررسید مرحله', tone: 'info' },
  package_expiry: { label: 'پایان مهلت بسته', tone: 'neutral' },
  planned_package: { label: 'بسته‌ی برنامه‌ریزی‌شده', tone: 'warning' },
  order_settle: { label: 'تسویه‌ی سفارش', tone: 'primary' },
  deposit_due: { label: 'سررسید واریز', tone: 'warning' },
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
