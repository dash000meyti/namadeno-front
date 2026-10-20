/** Presentation of credit products in the operator console (design: op-funds / op-products). */
import type { LockType, Organization } from '@/types/domain';
import type { OpProduct } from '@/api/op-system-extra';
import { faDigits, money } from '@/lib/format';
import { dec } from './fmt';
import { IC, type ToneKey } from './ui';

export const PRODUCT_UI: Record<OpProduct['kind'], { short: string; type: string; d: string; tone: ToneKey; lock: LockType; lockRule: (p: OpProduct) => string; lockRelease: string; monthsLabel: string; monthChoices: number[] }> = {
  card_credit: { short: 'اعتبار کارت', type: 'اعتبار گردان روی کارت نمادنو', d: IC.card, tone: 'primary', lock: 'collateral', lockRule: () => 'رزرو تسویه از کیف ریالی قفل می‌شود', lockRelease: 'آزاد با تسویه صورت‌حساب', monthsLabel: '', monthChoices: [] },
  loan: { short: 'وام', type: 'وثیقه: قفل بخشی از دارایی آزاد', d: IC.percent, tone: 'info', lock: 'collateral', lockRule: () => 'وثیقه از بخش آزاد قفل می‌شود', lockRelease: 'آزاد با تسویه کامل وام', monthsLabel: 'گزینه‌های مدت بازپرداخت (ماه)', monthChoices: [3, 6, 12, 18, 24, 36] },
  installment: { short: 'خرید اقساطی', type: 'فروشگاه‌های طرف قرارداد', d: IC.bag, tone: 'success', lock: 'installment', lockRule: (p) => `${faDigits(p.meta?.lockRatioPct ?? 100)}٪ مبلغ خرید قفل می‌شود`, lockRelease: 'با هر قسط، بخشی آزاد می‌شود', monthsLabel: 'گزینه‌های تعداد اقساط', monthChoices: [3, 6, 9, 10, 12, 18] },
};

const monthsText = (m: number[]) => (m.length ? faDigits([...m].sort((a, b) => a - b).join(' / ')) : '—');

/** Short parameter chips (funds page table). */
export function paramChips(p: OpProduct): string[] {
  const m = p.meta ?? {};
  const months = [...p.monthsOptions].sort((a, b) => a - b);
  if (p.kind === 'card_credit') return [`تا ${faDigits(p.maxPctOfAssets)}٪ آزاد`, `تسویه ${faDigits(m.settleDays ?? 30)} روزه`];
  if (p.kind === 'loan') return [`تا ${faDigits(p.maxPctOfAssets)}٪ آزاد`, months.length ? `${faDigits(months[0])} تا ${faDigits(months[months.length - 1])} ماه` : '—', `نرخ ${dec(p.rateMax)}٪`];
  return [`قفل اقساطی ${faDigits(m.lockRatioPct ?? 100)}٪`, `تا ${faDigits(months[months.length - 1] ?? 0)} قسط`, `کارمزد ${dec(m.feePct ?? p.rateMax)}٪`];
}

/** Key/value parameter rows (products page cards). */
export function paramRows(p: OpProduct): [string, string][] {
  const m = p.meta ?? {};
  if (p.kind === 'card_credit') return [['سقف نسبت به دارایی آزاد', `تا ${faDigits(p.maxPctOfAssets)}٪`], ['مهلت تسویه', `${faDigits(m.settleDays ?? 30)} روز`], ['نرخ جریمهٔ تأخیر', `${dec(m.latePenaltyPct ?? 0)}٪ ماهانه`]];
  if (p.kind === 'loan') return [['سقف LTV', `تا ${faDigits(p.maxPctOfAssets)}٪`], ['بازپرداخت', `${monthsText(p.monthsOptions)} ماه`], ['نرخ مؤثر', `${dec(p.rateMax)}٪`]];
  return [['قفل اقساطی', `${faDigits(m.lockRatioPct ?? 100)}٪ مبلغ خرید`], ['تعداد اقساط', monthsText(p.monthsOptions)], ['حداکثر هر خرید', `${money(m.maxPurchase ?? 0)} تومان`]];
}

/** Organizations whose contract has the product enabled. */
export function orgsWith(kind: OpProduct['kind'], orgs: Organization[]): Organization[] {
  return orgs.filter((o) => o.status !== 'suspended' && (kind === 'loan' ? o.settings.loanEnabled : kind === 'card_credit' ? o.settings.cardEnabled : o.settings.installmentEnabled));
}

export const PRODUCT_STATUS: Record<OpProduct['status'], { label: string; tone: ToneKey }> = {
  active: { label: 'فعال', tone: 'success' },
  paused: { label: 'متوقف', tone: 'warning' },
  draft: { label: 'پیش‌نویس', tone: 'default' },
};
