/** Shared metadata and helpers for the organization «بسته‌های دارایی» screens. */
import type { LockPolicy, OrgPackage, PackageReason } from '@/types/domain';
import { LOCK_META } from '@/lib/locks';
import { faDigits, jDate, JALALI_MONTHS } from '@/lib/format';
import { jalaliToIso, now } from '@/lib/clock';

export const I = {
  pkg: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  reports: 'M4 20h16M7 16V10M12 16V5M17 16v-3',
  contract: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2',
  calendarS: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  wallet: 'M3 7h18v12H3zM3 7l2-3h12l2 3M15 12h3',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H15',
  shield: 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  plus: 'M12 5v14M5 12h14',
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M7 10l5 5 5-5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5',
  edit: 'M4 20h4l10-10-4-4L4 16zM13 7l4 4',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  credit: 'M3 6h18v12H3zM3 10h18M7 15h3',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.6 5.6l12.8 12.8',
};

export type Tone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'default';

export const REASONS: { key: PackageReason; label: string; tone: Tone }[] = [
  { key: 'bonus', label: 'پاداش', tone: 'primary' },
  { key: 'welfare', label: 'مزایا', tone: 'info' },
  { key: 'eid', label: 'عیدی', tone: 'warning' },
  { key: 'other', label: 'سایر', tone: 'default' },
  { key: 'project_contract', label: 'قرارداد پروژه', tone: 'primary' },
];
export const reasonMeta = (r: PackageReason) => REASONS.find((x) => x.key === r) ?? REASONS[3];

/** Avatar color pairs used in tables (design: AV). */
export const AV: [string, string][] = [
  ['var(--soft-primary)', 'var(--primary-text)'], ['var(--soft-success)', 'var(--success-text)'],
  ['var(--soft-info)', 'var(--info-text)'], ['var(--soft-warning)', 'var(--warning-text)'],
  ['var(--soft-default)', 'var(--default-text)'], ['var(--soft-primary)', 'var(--primary-text)'],
  ['var(--soft-info)', 'var(--info-text)'], ['var(--soft-success)', 'var(--success-text)'],
];

/** Lock-type chip data (design `lkt`; «بدون قفل» uses the neutral tone on the org screens). */
export function lockChip(type: LockPolicy['type'], long = false) {
  const m = LOCK_META[type];
  if (type === 'none') return { label: long ? m.label : m.short, bg: 'var(--soft-default)', fg: 'var(--default-text)', d: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5z' };
  return { label: long ? m.label : m.short, bg: m.bg, fg: m.fg, d: m.d };
}

/** «۱۸٫۶ میلیارد» → { value: '۱۸٫۶', unit: 'میلیارد' } */
export function splitCompact(n: number): { value: string; unit: string } {
  const abs = Math.abs(n);
  const fmt = (v: number) => faDigits(String(Math.round(v * 100) / 100), true);
  if (abs >= 1e9) return { value: fmt(n / 1e9), unit: 'میلیارد' };
  if (abs >= 1e6) return { value: fmt(n / 1e6), unit: 'میلیون' };
  return { value: faDigits(String(Math.round(n))), unit: '' };
}

/** Released / pending figures of a milestone package. */
export function milestoneStats(pkg: OrgPackage) {
  const steps = pkg.milestoneProgress ?? [];
  const rel = steps.filter((s) => s.status === 'released');
  const relPct = rel.reduce((s, x) => s + x.sharePct, 0);
  const pending = steps.find((s) => s.status === 'pending_approval');
  return { steps, relN: rel.length, relPct, pending, pendingIdx: pending ? steps.indexOf(pending) + 1 : 0 };
}

/** Status shown in lists: «sent» packages that are fully accepted (and fully released) read as completed. */
export function effectiveStatus(pkg: OrgPackage): OrgPackage['status'] {
  if (pkg.status !== 'sent') return pkg.status;
  const allAccepted = pkg.recipients.length > 0 && pkg.recipients.every((r) => r.status !== 'pending');
  if (pkg.lockPolicy.type === 'milestone') return allAccepted && milestoneStats(pkg).relPct >= 100 ? 'completed' : 'sent';
  return allAccepted ? 'completed' : 'sent';
}

export function statusLabel(pkg: OrgPackage): { text: string; tone: Tone } {
  const st = effectiveStatus(pkg);
  if (st === 'draft') return { text: 'پیش‌نویس', tone: 'default' };
  if (st === 'cancelled') return { text: 'لغوشده', tone: 'error' };
  if (st === 'completed') return { text: 'تکمیل‌شده', tone: 'success' };
  const ms = milestoneStats(pkg);
  if (pkg.lockPolicy.type === 'milestone' && ms.pending) return { text: `منتظر تأیید مرحله ${faDigits(ms.pendingIdx)}`, tone: 'warning' };
  return { text: 'ارسال‌شده', tone: 'info' };
}

/** Short policy description under the chip (design `polSub`). */
export function policySub(pkg: OrgPackage): string {
  const lp = pkg.lockPolicy;
  if (lp.type === 'vesting') return 'آزاد در ' + jDate(lp.releaseAt);
  if (lp.type === 'milestone') {
    const ms = milestoneStats(pkg);
    return `${faDigits(ms.relN)} از ${faDigits(ms.steps.length || lp.steps.length)} مرحله · ${faDigits(ms.relPct)}٪ آزاد`;
  }
  return pkg.status === 'draft' ? 'بدون قفل' : 'همه آزاد';
}

export function allocationText(pkg: Pick<OrgPackage, 'allocationMode' | 'fixedSplit'>): string {
  if (pkg.allocationMode === 'free' || !pkg.fixedSplit) return 'انتخاب آزاد کارمند';
  const s = pkg.fixedSplit;
  const parts: string[] = [];
  if (s.gold) parts.push(`طلا ${faDigits(s.gold)}٪`);
  if (s.fixed) parts.push(`درآمد ثابت ${faDigits(s.fixed)}٪`);
  if (s.rial) parts.push(`ریال ${faDigits(s.rial)}٪`);
  if (parts.length === 1) return '۱۰۰٪ ' + (s.gold ? 'صندوق طلا' : s.fixed ? 'درآمد ثابت' : 'ریال');
  return 'تخصیص ثابت · ' + parts.join(' · ');
}

// ───────────── Jalali date input helpers ─────────────
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export function jParts(iso: string | Date) {
  const [y, m, d] = latin(jDate(iso)).split('/').map(Number);
  return { y, m, d };
}

/** «۱۴۰۵/۱۰/۱۵» → ISO (12:00 Tehran) or null. Supported years 1404–1406 (mock calendar range). */
export function parseJalali(input: string): string | null {
  const m = latin(input.trim()).match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1404 || y > 1406 || mo < 1 || mo > 12 || d < 1) return null;
  const max = mo <= 6 ? 31 : mo < 12 ? 30 : 29;
  if (d > max) return null;
  return jalaliToIso(y, mo, d);
}

/** Today + n months as a Jalali display string. */
export function jalaliAddMonths(n: number, from: Date = now()): string {
  const p = jParts(from);
  let y = p.y, m = p.m + n;
  while (m > 12) { m -= 12; y += 1; }
  const max = m <= 6 ? 31 : m < 12 ? 30 : 29;
  return jDate(jalaliToIso(Math.min(y, 1406), m, Math.min(p.d, max)));
}

export const monthName = (iso: string) => JALALI_MONTHS[jParts(iso).m - 1];
