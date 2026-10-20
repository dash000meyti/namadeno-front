/**
 * Persian formatting helpers. All user-visible numbers use Persian digits,
 * the thousands separator «٬» and the decimal separator «٫».
 */

const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Latin → Persian digits (also converts "." to «٫» when `decimal` is true). */
export function faDigits(input: string | number, decimal = false): string {
  let s = String(input).replace(/[0-9]/g, (d) => FA[+d]);
  if (decimal) s = s.replace(/\./g, '٫');
  return s;
}

/** Persian/Arabic → Latin digits (for parsing user input). */
export function enDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٬,]/g, '')
    .replace(/٫/g, '.');
}

/** 98000000 → «۹۸٬۰۰۰٬۰۰۰». Rounds to integer. */
export function money(n: number): string {
  const sign = n < 0 ? '−' : '';
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return sign + faDigits(s);
}

/** Signed money: +۴٬۰۰۰٬۰۰۰ / −۲٬۳۴۰٬۰۰۰ */
export function signedMoney(n: number): string {
  return (n > 0 ? '+' : '') + money(n);
}

/** 98000000 → «۹۸ میلیون», 1.2e9 → «۱٫۲ میلیارد» */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const fmt = (v: number) => faDigits(String(Math.round(v * 10) / 10), true);
  if (abs >= 1e12) return sign + fmt(abs / 1e12) + ' هزار میلیارد';
  if (abs >= 1e9) return sign + fmt(abs / 1e9) + ' میلیارد';
  if (abs >= 1e6) return sign + fmt(abs / 1e6) + ' میلیون';
  if (abs >= 1e3) return sign + fmt(abs / 1e3) + ' هزار';
  return money(n);
}

/** 32.5 → «۳۲٫۵۰» (fund units, 2 decimals, floor). */
export function units(n: number, digits = 2): string {
  const f = Math.pow(10, digits);
  const v = Math.floor(Math.abs(n) * f) / f;
  return (n < 0 ? '−' : '') + faDigits(v.toFixed(digits), true);
}

/** 1.2 → «۱٫۲۰٪», with optional sign. */
export function percent(n: number, digits = 2, signed = false): string {
  const s = faDigits(Math.abs(n).toFixed(digits), true) + '٪';
  if (!signed) return (n < 0 ? '−' : '') + s;
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
}

/** Integer percent: 40 → «۴۰٪» */
export function pct(n: number): string {
  return faDigits(Math.round(n)) + '٪';
}

// ───────────── Dates (Jalali via Intl) ─────────────

const jParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
};

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

const pad = (n: number) => String(n).padStart(2, '0');

/** «۱۴۰۵/۰۸/۱۵» */
export function jDate(iso: string | Date): string {
  const { y, m, d } = jParts(new Date(iso));
  return faDigits(`${y}/${pad(m)}/${pad(d)}`);
}

/** «۱۵ آبان» or «۱۵ آبان ۱۴۰۵» */
export function jDayMonth(iso: string | Date, withYear = false): string {
  const { y, m, d } = jParts(new Date(iso));
  return faDigits(`${d} ${JALALI_MONTHS[m - 1]}${withYear ? ' ' + y : ''}`);
}

/** «آبان ۱۴۰۵» */
export function jMonthYear(iso: string | Date): string {
  const { y, m } = jParts(new Date(iso));
  return faDigits(`${JALALI_MONTHS[m - 1]} ${y}`);
}

/** «۱۴:۰۲» */
export function time(iso: string | Date): string {
  const s = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date(iso));
  return faDigits(s);
}

/** «۱۵ آبان ۱۴۰۵ · ۱۴:۰۲» */
export function jDateTime(iso: string | Date): string {
  return `${jDayMonth(iso, true)} · ${time(iso)}`;
}

/** Relative time in Persian: «۱۰ دقیقه پیش», «امروز ۰۹:۰۰», «دیروز», else «۵ مهر». */
export function relTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diff = (now.getTime() - t) / 1000;
  if (diff < 60) return 'همین حالا';
  if (diff < 3600) return faDigits(Math.floor(diff / 60)) + ' دقیقه پیش';
  if (diff < 4 * 3600) return faDigits(Math.floor(diff / 3600)) + ' ساعت پیش';
  const a = jParts(new Date(iso));
  const b = jParts(now);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return 'امروز ' + time(iso);
  const y = jParts(new Date(now.getTime() - 86400000));
  if (a.y === y.y && a.m === y.m && a.d === y.d) return 'دیروز';
  return jDayMonth(iso);
}

/** Masks: «۰۹۱۲•••۴۵۶۷» */
export function maskMobile(m: string): string {
  return faDigits(m.slice(0, 4) + '•••' + m.slice(-4));
}

export function iban(i: string): string {
  return i.replace(/(.{4})/g, '$1 ').trim();
}
