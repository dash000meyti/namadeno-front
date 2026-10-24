/** Design constants shared by the app-core screens (icon paths, tones, allocation colors). */
import type { AllocationSplit, AssetKind, LockPolicy, Transaction } from '@/types/domain';
import { jDate } from '@/lib/format';
import { HOURGLASS, LOCK_META } from '@/lib/locks';

/** Icon paths copied from the design files. */
export const P = {
  arrowFwd: 'M19 12H5M11 6l-6 6 6 6',
  chevLeft: 'M14 6l-6 6 6 6',
  chevDown: 'M6 9l6 6 6-6',
  chevUp: 'M6 15l6-6 6 6',
  back: 'M10 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-11',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 12l2.5 2.5 5-5',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.6 5.6l12.8 12.8',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M8 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5zM12 15v2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11L20 13v6H4z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  deposit: 'M12 4v11M8 11l4 4 4-4M4 15v4h16v-4',
  withdraw: 'M12 15V4M8 8l4-4 4 4M4 15v4h16v-4',
  credit: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 14.5l5-5',
  creditFull: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 14.5l5-5M9.5 9.5h.01M14.5 14.5h.01',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  card: 'M3 9h18M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 15h4',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z',
  shieldCheck: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  chat: 'M4 5h16v11H9l-5 4z',
  ticket: 'M4 7h16v4a2 2 0 0 0 0 4v2H4v-2a2 2 0 0 0 0-4zM10 7v10',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
};

export const AMBER = 'var(--warning-main)';
export const TEAL = 'var(--secondary-main)';
export const GREY = 'var(--grey-600)';

export type Tone = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'default';
export const TONE: Record<Tone, [string, string]> = {
  primary: ['var(--soft-primary)', 'var(--primary-text)'],
  secondary: ['var(--soft-secondary)', 'var(--secondary-text)'],
  success: ['var(--soft-success)', 'var(--success-text)'],
  info: ['var(--soft-info)', 'var(--info-text)'],
  warning: ['var(--soft-warning)', 'var(--warning-text)'],
  error: ['var(--soft-error)', 'var(--error-text)'],
  default: ['var(--soft-default)', 'var(--default-text)'],
};

/** Allocation parts of an inbox package, in display order. */
export type PartKey = 'gold' | 'fixed' | 'rial';
export const PARTS: { key: PartKey; short: string; name: string; color: string; soft: string; fg: string; icon: string }[] = [
  { key: 'gold', short: 'طلا', name: 'صندوق طلا', color: AMBER, soft: 'var(--soft-warning)', fg: 'var(--warning-text)', icon: 'M4 18h16l-2-6H6zM8 12l1.5-5h5L16 12' },
  { key: 'fixed', short: 'درآمد ثابت', name: 'صندوق درآمد ثابت', color: TEAL, soft: 'var(--soft-secondary)', fg: 'var(--secondary-text)', icon: 'M4 19h16M6 16V10M10 16V7M14 16v-5M18 16V5' },
  { key: 'rial', short: 'ریال', name: 'کیف پول ریالی', color: GREY, soft: 'var(--soft-default)', fg: 'var(--default-text)', icon: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 12h.01M18 12h.01' },
];

export const splitPct = (s: AllocationSplit | undefined, k: PartKey) => (s ? (k === 'rial' ? s.rial ?? 0 : s[k]) ?? 0 : 0);

/** Reserve tag for a package lock policy («آزاد» / «پس‌انداز» / «مرحله‌ای», from LOCK_META). */
export function policyTag(lp: LockPolicy): { label: string; bg: string; fg: string; d: string } {
  const m = LOCK_META[lp.type];
  return { label: m.short, bg: m.bg, fg: m.fg, d: m.d };
}

/** One-line release condition of a package's reserve policy. */
export function policyNote(lp: LockPolicy): string {
  if (lp.type === 'vesting') return 'بخش صندوقی · آزاد در ' + jDate(lp.releaseAt);
  if (lp.type === 'milestone') return `بخش صندوقی · دریافت در ${faN(lp.steps.length)} مرحله با تأیید سازمان`;
  return 'همه واحدها از لحظه دریافت آزادند';
}

const faN = (n: number) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** Hero-card gradients per holding (design: app-assets HC list). */
export const HERO_COLORS: Partial<Record<AssetKind, [string, string]>> = {
  rial: ['#434A62', '#6B7390'],
  gold: ['#A9761E', '#D9A84B'],
  fixed: ['#2A6684', '#55A0C3'],
  equity: ['#2F3AB8', '#5A66E0'],
  mixed: ['#277C5A', '#55B08C'],
  silver: ['#636C83', '#9AA3B7'],
  saffron: ['#A85A22', '#DB8E50'],
  leverage: ['#9C3030', '#D45C5C'],
  project: ['#25628F', '#4FA0D1'],
  energy: ['#454C5E', '#7A8296'],
};

/** Wallet-list dot colors (design: rial grey, gold amber, fixed teal, others primary-light). */
export const walletDot = (k: AssetKind) => (k === 'rial' ? GREY : k === 'gold' ? AMBER : k === 'fixed' ? TEAL : 'var(--primary-light)');

/** Icon + tone of a transaction row in «فعالیت اخیر». */
export function txVisual(t: Transaction): { d: string; tone: Tone } {
  switch (t.category) {
    case 'inbox': return { d: P.inbox, tone: 'primary' };
    case 'trade': return { d: P.swap, tone: 'primary' };
    case 'rial': return t.amount >= 0 ? { d: P.deposit, tone: 'success' } : { d: P.withdraw, tone: 'default' };
    case 'card': return { d: P.card, tone: 'default' };
    case 'loan': return { d: P.creditFull, tone: 'info' };
    case 'installment': return { d: P.cart, tone: 'secondary' };
    case 'fund': return { d: P.percent, tone: 'secondary' };
    case 'lock': return t.lockEvent === 'released' ? { d: LOCK_META.none.d, tone: 'success' } : { d: t.lockType ? LOCK_META[t.lockType].d : HOURGLASS, tone: 'info' };
    default: return { d: P.info, tone: 'default' };
  }
}
