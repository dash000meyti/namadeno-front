/** Formatting for the operator's orders and cash screens. */
import { faDigits, money } from '@/lib/format';

/**
 * Big Toman amount split into a short number and its scale for StatStrip cells:
 * 259.4e9 → { value: «۲۵۹٫۴», unit: «میلیارد تومان» } (the number stays short so five cells fit side by side).
 */
export function scaled(n: number): { value: string; unit: string } {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const f = (v: number) => sign + faDigits(String(Math.round(v * 10) / 10), true);
  if (a >= 1e12) return { value: f(a / 1e12), unit: 'هزار میلیارد تومان' };
  if (a >= 1e9) return { value: f(a / 1e9), unit: 'میلیارد تومان' };
  if (a >= 1e6) return { value: f(a / 1e6), unit: 'میلیون تومان' };
  return { value: money(n), unit: 'تومان' };
}

/** Signed full amount for ledgers: «+۱۲٬۵۰۰٬۰۰۰» / «−۸۰۰٬۰۰۰». */
export const signed = (n: number) => (n > 0 ? '+' : '') + money(n);
