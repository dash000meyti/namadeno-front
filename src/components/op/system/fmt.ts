/** Formatting / export helpers for the operator console system pages. */
import { faDigits, jDate, jDayMonth, money, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { ApiRequestError } from '@/api/client';

/** Trimmed decimal with Persian digits: 72.50 → «۷۲٫۵», 3 → «۳». */
export function dec(n: number, digits = 1): string {
  let s = (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
  if (digits > 0) s = s.replace(/\.?0+$/, '');
  return faDigits(s, true);
}
/** Billions: 259e9 → «۲۵۹», 72.5e9 → «۷۲٫۵». */
export const bn = (n: number, digits = 1) => dec(n / 1e9, digits);
/** Millions: 6.8e6 → «۶٫۸». */
export const mn = (n: number, digits = 1) => dec(n / 1e6, digits);
/** «۱۲٫۵٪» (trimmed). */
export const pctT = (n: number, digits = 1) => dec(n, digits) + '٪';
/** Signed trimmed percent «+۱٫۲٪» / «−۰٫۶٪». */
export const spct = (n: number, digits = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + dec(Math.abs(n), digits) + '٪';

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(d);
/** «امروز ۱۴:۰۰» / «دیروز ۱۷:۰۵» / «۱۴۰۵/۰۷/۱۳». */
export function dayTime(iso?: string, withTimeOld = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const n = now();
  if (dayKey(d) === dayKey(n)) return 'امروز ' + time(d);
  if (dayKey(d) === dayKey(new Date(n.getTime() - 86400000))) return 'دیروز ' + time(d);
  return withTimeOld ? jDayMonth(d) + ' ' + time(d) : jDate(d);
}
export const sameDay = (a: string | Date, b: string | Date) => dayKey(new Date(a)) === dayKey(new Date(b));

/** Minutes → «۰۰:۴۲» (h:mm, Persian digits). */
export function hhmm(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return faDigits(`${h < 10 ? '0' : ''}${h}:${r < 10 ? '0' : ''}${r}`);
}
/** Minutes → «۳ س ۲۰ د». */
export function durFa(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? faDigits(`${h} س ${m} د`) : faDigits(`${m} د`);
}

/** User-facing message of an API error. */
export function errMsg(e: unknown, fallback = 'خطا در ارتباط با سرور'): string {
  if (e instanceof ApiRequestError) return e.message || fallback;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') return (e as { message: string }).message;
  return fallback;
}

/** Smooth cubic path through points (Catmull-Rom → Bézier), same as the design charts. */
export function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  const r1 = (v: number) => Math.round(v * 10) / 10;
  let d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += ' C' + r1(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + r1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + r1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
  }
  return d;
}
export const linePath = (pts: [number, number][]) => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');

// ───────────── exports ─────────────
type Cell = string | number | null | undefined;
const csvCell = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** Builds a UTF-8 CSV (with BOM, opens correctly in Excel) and downloads it. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const text = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: Cell) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
/**
 * Opens a printable RTL report in a new window and triggers the browser's print dialog
 * («ذخیره به PDF»). Returns false when the popup was blocked.
 */
export function printReport(title: string, sections: { title: string; rows: Cell[][] }[]): boolean {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  const tables = sections.map((s) => {
    const [head, ...body] = s.rows;
    return `<h2>${esc(s.title)}</h2><table><thead><tr>${(head ?? []).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
  w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:IRANSansX,Tahoma,sans-serif;color:#1F2433;margin:32px;font-size:13px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}p{color:#636B7F;margin:0 0 16px}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px dashed #DEE2EB;padding:8px;text-align:right}th{background:#F1F3F8;font-weight:700}
</style></head><body><h1>${esc(title)}</h1><p>نمادنو · کنسول بهره‌بردار · ${esc(jDate(now()))} ${esc(time(now()))}</p>${tables}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 250);
  return true;
}

/** Plain-number cell for CSV (latin digits, no separators — machine readable). */
export const raw = (n: number) => String(Math.round(n));
export { money };
