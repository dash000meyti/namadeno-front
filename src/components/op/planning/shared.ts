/** Small formatting helpers of the operator planning page (/op/planning). Data only, no UI. */
import type { ForecastBucket, ForecastEvent, OrderSide, TargetProgress, TreasuryAssumptions } from '@/api/op-treasury-extra';
import { amt, daysText } from '@/components/op/treasury/ui';
import { pctT } from '@/components/op/system/fmt';
import { faDigits, money } from '@/lib/format';
import { now } from '@/lib/clock';

const DAY = 86_400_000;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** «۴۲٫۴ میلیارد تومان». */
export const tm = (n: number) => `${amt(n)} تومان`;
/** StatStrip value + unit: 42.4e9 → ['۴۲٫۴', 'میلیارد تومان']. */
export function amtParts(n: number): [string, string] {
  const [v, ...u] = amt(n).split(' ');
  return [v, [...u, 'تومان'].join(' ')];
}
/** Signed compact Toman: «+۱۵٫۵ میلیارد» / «−۳۷٫۸ میلیارد». */
export const sAmt = (n: number) => (n > 0 ? '+' : '') + amt(n);

/** Drain of the free stock in one week (new packages + user buys). */
export const demandOf = (b: ForecastBucket) => b.newPackages + b.userBuys;
/** Units coming back to the free stock in one week. */
export const returnsOf = (b: ForecastBucket) => b.userSells + b.vestingSellBack + b.reclaims;
export const totals = (bs: ForecastBucket[]) => ({
  newPackages: sum(bs.map((b) => b.newPackages)),
  userBuys: sum(bs.map((b) => b.userBuys)),
  userSells: sum(bs.map((b) => b.userSells)),
  vestingSellBack: sum(bs.map((b) => b.vestingSellBack)),
  reclaims: sum(bs.map((b) => b.reclaims)),
  commitments: sum(bs.map((b) => b.commitments)),
  demand: sum(bs.map(demandOf)),
  returns: sum(bs.map(returnsOf)),
});

const dayKey = (t: number) => Math.floor((t + 3.5 * 3_600_000) / DAY);
/** Days from today (Tehran): 0 today, 1 tomorrow, −1 yesterday. */
export const daysUntil = (iso: string) => dayKey(Date.parse(iso)) - dayKey(now().getTime());
/** «امروز» · «فردا» · «۵ روز دیگر» · «۲ روز گذشته». */
export function untilText(iso: string): string {
  const n = daysUntil(iso);
  if (n === 0) return 'امروز';
  if (n === 1) return 'فردا';
  if (n === -1) return 'دیروز';
  return n > 0 ? `${faDigits(n)} روز دیگر` : `${faDigits(-n)} روز گذشته`;
}

/** Value of a target-progress item in its unit. */
export function progressValue(p: Pick<TargetProgress, 'unit'>, v: number): string {
  if (p.unit === 'toman') return amt(v);
  if (p.unit === 'days') return daysText(v);
  if (p.unit === 'pct') return pctT(v);
  return money(v);
}

/** «۵۹۱٫۸ میلیارد از ۷۵۰ میلیارد تومان» · «۹ از ۱۴» · «۱۷ از ۲۱ روز» · «همخوانی ۹۵٫۹٪». */
export function progressLine(p: TargetProgress): string {
  if (p.unit === 'pct') return `همخوانی ${pctT(p.current)} با هدف`;
  if (p.unit === 'days') return `${daysText(p.current)} از هدف ${daysText(p.target)}`;
  if (p.unit === 'toman') return `${amt(p.current)} از ${amt(p.target)} تومان`;
  return `${money(p.current)} از ${money(p.target)}`;
}

/** «ماهانه ۳۵٫۴ میلیارد تومان لازم است» for goals with a date. */
export function neededText(p: TargetProgress): string | null {
  if (p.neededPerMonth == null || p.neededPerMonth <= 0) return null;
  const v = p.unit === 'toman' ? tm(p.neededPerMonth) : p.neededPerMonth < 10 ? faDigits(String(Math.round(p.neededPerMonth * 10) / 10), true) : money(p.neededPerMonth);
  const unit = p.key === 'orgs' ? ' سازمان' : p.key === 'users' ? ' کاربر' : '';
  return `ماهانه ${v}${unit} رشد لازم است`;
}

/** What an upcoming event does to the free stock or the cash account (with the forecast assumptions). */
export function eventEffect(e: ForecastEvent, a: TreasuryAssumptions): { text: string; estimate?: number; sign?: 1 | -1 } {
  switch (e.kind) {
    case 'vesting_release':
      return { text: `پس‌انداز آزاد می‌شود و بنا بر فرض پیش‌بینی حدود ${pctT(a.vestingSellBackPct * 100)} آن فروخته می‌شود و به موجودی آزاد برمی‌گردد.`, estimate: e.value * a.vestingSellBackPct, sign: 1 };
    case 'milestone_due':
      return { text: `سازمان این مرحله را تأیید یا بازپس می‌گیرد؛ بنا بر فرض پیش‌بینی حدود ${pctT(a.reclaimRate * 100)} سهم مراحل بازپس گرفته می‌شود و به موجودی آزاد برمی‌گردد.`, estimate: e.value * a.reclaimRate, sign: 1 };
    case 'package_expiry':
      return { text: 'سهم گیرندگانی که تا پایان مهلت بسته را نپذیرند، به موجودی آزاد برمی‌گردد.', estimate: e.value, sign: 1 };
    case 'planned_package':
      return { text: 'با ارسال این بسته، سهم صندوق‌ها از موجودی آزاد برای گیرندگان کنار گذاشته می‌شود.', estimate: e.value, sign: -1 };
    case 'order_settle':
      return { text: 'با تسویه، واحدهای صدور به موجودی خزانه اضافه می‌شوند و مبلغ ابطال به حساب ریالی برمی‌گردد.' };
    case 'deposit_due':
      return { text: 'با دریافت این واریز، نقدینگی در دسترس برای صدور واحد افزایش می‌یابد.' };
  }
}

/** Prefill of the shared order dialog. `key` remounts it fresh. */
export interface OrderPrefill { key: string; fundId?: string; side?: OrderSide; amount?: number; recommendationId?: string; source: 'manual' | 'suggestion'; reason?: string }
