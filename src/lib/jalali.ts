/**
 * Jalali calendar helpers that work for any year (birth dates, contracts, due dates).
 * The date picker (src/components/ui/DateInput.tsx) and the panels' date fields use them.
 */
import { enDigits, faDigits } from './format';

export interface YMD { y: number; m: number; d: number }

const PARTS = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Tehran' });

/** Jalali {y, m, d} of a date (Tehran time). */
export function jParts(iso: string | Date): YMD {
  const parts = PARTS.formatToParts(new Date(iso));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return { y: g('year'), m: g('month'), d: g('day') };
}

/** Jalali date → ISO (12:00 Tehran). Returns null for an impossible date. */
export function jalaliToIsoAny(jy: number, jm: number, jd: number): string | null {
  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : 30)) return null;
  const y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const ml = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13 && gd > ml[gm]; gm++) gd -= ml[gm];
  const iso = new Date(Date.UTC(gy, gm - 1, gd, 8, 30)).toISOString();
  const back = jParts(iso);
  return back.y === jy && back.m === jm && back.d === jd ? iso : null;
}

/** Days in a Jalali month (Esfand has 30 days in leap years). */
export function monthLength(y: number, m: number): number {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  return jalaliToIsoAny(y, 12, 30) ? 30 : 29;
}

/** Column of a date in a week that starts on Saturday (0 = شنبه … 6 = جمعه). */
export function weekdaySat(iso: string): number {
  const i = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(WEEKDAY.format(new Date(iso)));
  return i < 0 ? 0 : i;
}

/** «۱۴۰۵/۰۹/۱۵» or «1405/9/15» → {y, m, d} (null when it is not a real date). */
export function parseJalaliText(text: string): YMD | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(enDigits(text).replace(/\s/g, ''));
  if (!m) return null;
  const p = { y: +m[1], m: +m[2], d: +m[3] };
  return jalaliToIsoAny(p.y, p.m, p.d) ? p : null;
}

/** {y, m, d} → «۱۴۰۵/۰۹/۱۵» (the format the date fields keep). */
export const formatJalali = (p: YMD) => faDigits(`${p.y}/${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`);

/** Comparable number for a Jalali date (yyyymmdd). */
export const ymdKey = (p: YMD) => p.y * 10000 + p.m * 100 + p.d;
