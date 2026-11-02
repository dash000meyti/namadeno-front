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

const scaleOf = (ref: number) => { const a = Math.abs(ref); return a >= 1e12 ? 1e12 : a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : 1; };
const SCALE_WORD: Record<number, string> = { 1e12: 'هزار میلیارد', 1e9: 'میلیارد', 1e6: 'میلیون', 1: 'تومان' };

/**
 * Short numbers for a StatStrip note, in the scale of the cell's value (the unit is already shown on the value):
 * noteAmounts(4.4e9, [10.5e9, 6.1e9]) → ['۱۰٫۵', '۶٫۱']; when an amount needs a larger scale its word is added.
 */
export function noteAmounts(value: number, xs: number[]): string[] {
  const vs = scaleOf(value);
  return xs.map((n) => {
    const s = Math.max(vs, scaleOf(n));
    const num = s === 1 ? money(n) : (n < 0 ? '−' : '') + faDigits(String(Math.round((Math.abs(n) / s) * 10) / 10), true);
    return s === vs ? num : `${num} ${SCALE_WORD[s]}`;
  });
}
