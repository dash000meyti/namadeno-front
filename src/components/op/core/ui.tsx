'use client';
/** Data helpers shared by the op-core screens (overview, organizations, users): icons, status/product meta, number formats, Jalali parsing. UI comes from the Panel kit. */
import type { LockType, Organization } from '@/types/domain';
import { ApiRequestError } from '@/api/client';
import { enDigits, faDigits } from '@/lib/format';

export const ICON = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  funds: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  risk: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM12 9v4M12 16.5h.01',
  check: 'M5 12.5l4.5 4.5L19 7',
  pen: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
  pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M10 9v6M14 9v6',
  play: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M10 8l6 4-6 4z',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  bag: 'M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2',
  gold: 'M4 17l2-6h5l1 6zM12 17l1-6h5l2 6zM8 11l2-6h4l2 6',
  bond: 'M4 19l5-6 4 3 7-9M4 5v14h16',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2M16 14h.01',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  alert: 'M12 3l9 16H3zM12 10v4M12 17.5h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM9 12l2 2 4-4',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.5 5.5l13 13',
  trend: 'M4 17l5-6 4 3 7-9M15 5h5v5',
  history: 'M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  ext: 'M14 5h5v5M19 5l-8 8M17 13v6H5V7h6',
  id: 'M3 5h18v14H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5 16c.5-2 1.6-3 3-3s2.5 1 3 3M14 9h4M14 13h4',
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M7 10l5 5 5-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  key: 'M14.5 9.5a4 4 0 1 0-3.9 3.1L4 19v2h3v-2h2v-2h2l1.6-1.6M15 9h.01',
  unlock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
};

/** Lock-type colors as CSS var names (for bars/dots) on top of the canonical LOCK_META. */
export const LOCK_COL: Record<LockType, string> = { collateral: '--info-main', vesting: '--warning-main', installment: '--secondary-main', milestone: '--primary-main', legal: '--error-main' };


export const ORG_STATUS: Record<Organization['status'], { label: string; bg: string; fg: string }> = {
  active: { label: 'فعال', bg: 'var(--soft-success)', fg: 'var(--success-text)' },
  onboarding: { label: 'در حال عقد', bg: 'var(--soft-info)', fg: 'var(--info-text)' },
  suspended: { label: 'معلق', bg: 'var(--soft-error)', fg: 'var(--error-text)' },
};

export const PRODUCT_META = {
  card: { name: 'اعتبار کارت', d: ICON.card, bg: 'var(--soft-primary)', fg: 'var(--primary-text)' },
  loan: { name: 'وام', d: ICON.percent, bg: 'var(--soft-info)', fg: 'var(--info-text)' },
  bnpl: { name: 'خرید اقساطی', d: ICON.bag, bg: 'var(--soft-success)', fg: 'var(--success-text)' },
} as const;
export type ProductKey = keyof typeof PRODUCT_META;

export function orgProducts(o: Organization): ProductKey[] {
  const out: ProductKey[] = [];
  if (o.settings.cardEnabled) out.push('card');
  if (o.settings.loanEnabled) out.push('loan');
  if (o.settings.installmentEnabled) out.push('bnpl');
  return out;
}

// ───────────── number formatting ─────────────
const trim = (v: number, dec: number) => {
  let s = v.toFixed(dec);
  if (dec > 0) s = s.replace(/\.?0+$/, '');
  return faDigits(s, true);
};
/** Billions of Toman, e.g. 68.4e9 → «۶۸٫۴». */
export const fb = (n: number, dec = 1) => trim(n / 1e9, dec);
/** Millions of Toman, e.g. 202.5e6 → «۲۰۲٫۵». */
export const fm = (n: number, dec = 1) => trim(n / 1e6, dec);
/** Integer percent, e.g. 25.6 → «۲۶٪». */
export const pctFa = (n: number) => faDigits(Math.round(n)) + '٪';
/** Signed percent with one decimal, e.g. 8.5 → «+۸٫۵٪», −1.4 → «−۱٫۴٪». */
export const signedPct = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + trim(Math.abs(n), 1) + '٪';

export function errMsg(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message;
  return 'خطا در ارتباط با سرور';
}

export function splitPct(total: number, locked: number) {
  const free = Math.max(0, total - locked);
  const freePct = total > 0 ? Math.round((free / total) * 1000) / 10 : 100;
  return { free, locked, freePct, lockedPct: Math.round((100 - freePct) * 10) / 10 };
}

/**
 * Parses a Jalali date typed as «۱۴۰۵/۰۸/۰۱» (Persian or Latin digits) into an ISO string at 12:00 Tehran.
 * Returns null when the text is not a real Jalali date.
 */
export function parseJalali(text: string): string | null {
  const m = enDigits(text.trim()).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1300 || y > 1500 || mo < 1 || mo > 12 || d < 1 || d > 31 || (mo > 6 && d > 30)) return null;
  const doy = mo <= 6 ? (mo - 1) * 31 + (d - 1) : 186 + (mo - 7) * 30 + (d - 1);
  const guess = Date.UTC(y + 621, 2, 21, 8, 30) + doy * 86400000;
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const dt = new Date(guess + off * 86400000);
    const parts = fmt.formatToParts(dt);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    if (g('year') === y && g('month') === mo && g('day') === d) return dt.toISOString();
  }
  return null;
}
