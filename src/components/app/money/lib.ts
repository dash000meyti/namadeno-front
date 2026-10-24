/** Helpers shared by the app-money screens (asset pages, history, receipt, convert …). */
import type { AssetKind, Fund, Lock, LockType, MilestoneStep, RiskLevel, Transaction, TxCategory } from '@/types/domain';
import { ICONS } from '@/components/ui/Icon';
import { ASSET_META, HOURGLASS, LOCK_META } from '@/lib/locks';
import { enDigits, faDigits, jDate, jDateTime, jDayMonth, money, signedMoney, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';

// ───────────── tones ─────────────
export const TONE = {
  primary: ['var(--soft-primary)', 'var(--primary-text)'],
  secondary: ['var(--soft-secondary)', 'var(--secondary-text)'],
  success: ['var(--soft-success)', 'var(--success-text)'],
  info: ['var(--soft-info)', 'var(--info-text)'],
  warning: ['var(--soft-warning)', 'var(--warning-text)'],
  error: ['var(--soft-error)', 'var(--error-text)'],
  def: ['var(--soft-default)', 'var(--default-text)'],
} as const;
export type ToneKey = keyof typeof TONE;

export const LOCK_TONE: Record<LockType, ToneKey> = { collateral: 'info', vesting: 'warning', installment: 'secondary', milestone: 'primary', legal: 'error' };

/** Design icon paths that are not in the shared icon set. */
export const D = {
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2M16 14h.01',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  loanShield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 14.5l5-5',
  report: 'M4 15V5a1 1 0 0 1 1-1h14l-3 5 3 5H5M4 15v6',
  emptyBox: 'M4 7h16v12H4zM4 7l2-3h12l2 3M10 12h4',
} as const;

// ───────────── funds ─────────────
const MONO: Record<string, string> = { gold: 'طلا', fixed: 'ثابت', equity: 'سهام', mixed: 'مختلط', silver: 'نقره', saffron: 'زعفران', leverage: 'اهرم', project: 'پروژه', energy: 'انرژی' };
export const fundMono = (f: Pick<Fund, 'id' | 'shortName'>) => MONO[f.id] ?? f.shortName;

export const RISK: Record<RiskLevel, { label: string; color: string }> = {
  low: { label: 'کم', color: 'var(--success-text)' },
  medium: { label: 'متوسط', color: 'var(--warning-text)' },
  high: { label: 'زیاد', color: 'var(--error-text)' },
  very_high: { label: 'خیلی زیاد', color: 'var(--error-text)' },
};

/** 42 → «+۴۲٪», −4 → «−۴٪» */
export const signedPct = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + faDigits(String(Math.round(Math.abs(n) * 10) / 10), true) + '٪';
/** fee percent: 0.1 → «۰٫۱٪» */
export const feeLabel = (pctValue: number) => faDigits(String(pctValue), true) + '٪';

export function assetMeta(kind: string) {
  return ASSET_META[kind] ?? ASSET_META.equity;
}
/** Icon path for an asset (design: rial banknote, gold coins, others bar chart). */
export function assetIcon(kind: string): string {
  if (kind === 'rial') return ICONS.banknote;
  if (kind === 'gold') return ICONS.gold;
  return ICONS.chart;
}

// ───────────── amounts ─────────────
/** Parses a user-typed amount (Persian/Latin digits, separators) into Toman. */
export function parseAmount(s: string): number {
  const n = Number(enDigits(s).replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
export const amountText = (n: number) => (n > 0 ? money(n) : '');
export const floorK = (n: number) => Math.max(0, Math.floor(n / 1000) * 1000);

// ───────────── locks ─────────────
export interface LockLink { href: string; text: string }
export function lockLink(l: Lock): LockLink | null {
  if (l.type === 'collateral') {
    if (l.holdingKind === 'rial' || (l.sourceId ?? '').startsWith('card')) return { href: routes.app.cardSettle, text: 'تسویه صورت‌حساب' };
    return { href: routes.app.credit, text: 'مشاهده وام' };
  }
  if (l.type === 'installment') return { href: routes.app.installment, text: 'مشاهده خرید اقساطی' };
  if (l.type === 'legal') return { href: routes.app.support, text: 'تماس با پشتیبانی' };
  return null;
}

/** Released share (percent) and amount of a milestone lock. */
export function milestoneProgress(l: Lock) {
  const steps = l.steps ?? [];
  const releasedPct = steps.filter((s) => s.status === 'released').reduce((s, x) => s + x.sharePct, 0);
  const releasedCount = steps.filter((s) => s.status === 'released').length;
  const total = l.contractTotal ?? l.amount;
  const released = Math.max(0, total - l.amount);
  return { releasedPct, releasedCount, count: steps.length, total, released };
}

/** Progress of a reserve toward release, 0..100 (paid installments, elapsed vesting time or released milestones). */
export function lockProgress(l: Lock): number {
  if (l.type === 'milestone') return milestoneProgress(l).releasedPct;
  if (l.totalCount) return Math.round(((l.paidCount ?? 0) / l.totalCount) * 100);
  if (l.type === 'vesting' && l.releaseAt) {
    const a = new Date(l.createdAt).getTime();
    const b = new Date(l.releaseAt).getTime();
    const t = now().getTime();
    return b > a ? Math.min(100, Math.max(0, Math.round(((t - a) / (b - a)) * 100))) : 0;
  }
  return 0;
}

export function lockSub(l: Lock): string {
  if (l.type === 'milestone') {
    const m = milestoneProgress(l);
    return `${jDate(l.createdAt)} · ${faDigits(m.releasedCount)} از ${faDigits(m.count)} مرحله`;
  }
  if (l.totalCount) return `${faDigits(l.paidCount ?? 0)} از ${faDigits(l.totalCount)} قسط پرداخت شده`;
  if (l.type === 'vesting' && l.releaseAt) return 'آزاد در ' + jDate(l.releaseAt);
  return l.condition;
}

/**
 * Look of a milestone step in the app. The current step waits for the organization's approval, or only for its
 * due date when `requiresApproval` is false. A reclaimed step («بازپس‌گیری») is shown calmly, without alarm colors.
 */
export function stepView(s: { status: MilestoneStep['status']; releasedAt?: string; dueDate?: string; requiresApproval?: boolean }) {
  const done = s.status === 'released';
  const pend = s.status === 'pending_approval';
  const back = s.status === 'reclaimed';
  const auto = pend && s.requiresApproval === false;
  return {
    seg: done ? 'var(--primary-main)' : pend ? 'transparent' : 'var(--progress-track)',
    ring: pend ? `inset 0 0 0 1.5px ${auto ? 'var(--info-main)' : 'var(--warning-main)'}` : 'none',
    nBg: done ? 'var(--primary-main)' : pend ? (auto ? 'var(--soft-info)' : 'var(--soft-warning)') : 'var(--soft-default)',
    nFg: done ? '#FFFFFF' : pend ? (auto ? 'var(--info-text)' : 'var(--warning-text)') : 'var(--text-secondary)',
    tc: s.status === 'future' || back ? 'var(--text-secondary)' : 'var(--text-primary)',
    status: done ? 'دریافت شد' + (s.releasedAt ? ' · ' + jDayMonth(s.releasedAt) : '')
      : back ? 'بازپس گرفته شد'
      : auto ? (s.dueDate ? 'آزاد در ' + jDayMonth(s.dueDate) : 'آزاد در سررسید')
      : pend ? 'در انتظار تأیید سازمان' : 'آینده',
    sBg: done ? 'var(--soft-success)' : auto ? 'var(--soft-info)' : pend ? 'var(--soft-warning)' : 'var(--soft-default)',
    sFg: done ? 'var(--success-text)' : auto ? 'var(--info-text)' : pend ? 'var(--warning-text)' : 'var(--default-text)',
  };
}

// ───────────── transactions ─────────────
export const CATEGORY_LABEL: Record<TxCategory, string> = {
  inbox: 'دریافتی', trade: 'خرید/فروش', rial: 'کیف پول ریالی', card: 'کارت', loan: 'وام', installment: 'خرید اقساطی', fund: 'سود صندوق', lock: 'رزرو و آزادسازی',
};

export const STATUS_LABEL: Record<Transaction['status'], { label: string; tone: ToneKey }> = {
  success: { label: 'موفق', tone: 'success' },
  pending: { label: 'در انتظار', tone: 'warning' },
  failed: { label: 'ناموفق', tone: 'error' },
};

export interface TxVisual {
  d: string;
  bg: string;
  fg: string;
  amount: string;
  amountColor: string;
  sub2?: string;
  lock?: { label: string; bg: string; fg: string; d: string };
  status?: { label: string; bg: string; fg: string };
}

function fundTone(kind?: AssetKind): ToneKey {
  if (kind === 'gold' || kind === 'saffron') return 'warning';
  if (kind === 'fixed') return 'secondary';
  if (kind === 'mixed') return 'success';
  if (kind === 'project') return 'info';
  if (kind === 'leverage') return 'error';
  if (kind === 'silver' || kind === 'energy') return 'def';
  return 'primary';
}

/** Icon, tone and amount presentation of a transaction row (design: app-history). */
export function txVisual(tx: Transaction): TxVisual {
  const pos = tx.amount > 0;
  let tone: ToneKey = 'def';
  let d: string = ICONS.receipt;
  let amount = signedMoney(tx.amount);
  let amountColor = pos ? 'var(--success-text)' : 'var(--text-primary)';
  let sub2: string | undefined;

  if (tx.lockEvent && tx.category !== 'inbox') {
    if (tx.lockEvent === 'released') {
      tone = 'success';
      d = LOCK_META.none.d;
      amount = '+' + money(Math.abs(tx.amount));
      amountColor = 'var(--success-text)';
      sub2 = 'آزاد شد';
    } else {
      tone = tx.lockType ? LOCK_TONE[tx.lockType] : 'info';
      d = tx.lockType ? LOCK_META[tx.lockType].d : HOURGLASS;
      amount = money(Math.abs(tx.amount));
      amountColor = 'var(--text-secondary)';
      sub2 = 'رزرو شد';
    }
  } else {
    switch (tx.category) {
      case 'inbox':
        if (tx.lockEvent === 'locked') {
          tone = 'primary';
          d = tx.lockType === 'milestone' ? ICONS.flag : ICONS.gift;
          sub2 = tx.lockType === 'milestone' ? 'دریافت مرحله‌ای' : tx.lockType === 'vesting' ? 'با پس‌انداز' : 'بخشی رزرو';
        } else {
          tone = 'success';
          d = ICONS.gift;
        }
        break;
      case 'trade':
        tone = fundTone(tx.holdingKind);
        d = tx.holdingKind === 'gold' ? ICONS.gold : ICONS.trend;
        if (tx.units) {
          amount = (tx.units > 0 ? '+' : '−') + fmtUnits(Math.abs(tx.units)) + ' واحد';
          amountColor = tx.units > 0 ? 'var(--success-text)' : 'var(--text-primary)';
          sub2 = signedMoney(tx.amount) + ' تومان';
        }
        break;
      case 'fund':
        tone = 'secondary';
        d = ICONS.trend;
        break;
      case 'rial':
        tone = 'def';
        d = pos ? ICONS.deposit : ICONS.bank;
        break;
      case 'card':
        tone = 'def';
        d = ICONS.card;
        break;
      case 'loan':
        tone = 'primary';
        d = ICONS.banknote;
        break;
      case 'installment':
        tone = 'secondary';
        d = ICONS.cart;
        break;
      default:
        break;
    }
  }
  const lt = tx.lockType ? LOCK_META[tx.lockType] : undefined;
  const st = tx.status !== 'success' ? STATUS_LABEL[tx.status] : undefined;
  return {
    d, bg: TONE[tone][0], fg: TONE[tone][1], amount, amountColor, sub2,
    lock: lt ? { label: lt.short, bg: lt.bg, fg: lt.fg, d: lt.d } : undefined,
    status: st ? { label: st.label, bg: TONE[st.tone][0], fg: TONE[st.tone][1] } : undefined,
  };
}

/** Plain-text receipt used by «دانلود» / «اشتراک رسید». */
export function receiptText(tx: Transaction): string {
  const lines = [
    'رسید عملیات — نمادنو',
    '',
    `شرح: ${tx.title}`,
    `مبلغ: ${money(Math.abs(tx.amount))} تومان`,
    tx.units ? `واحد: ${fmtUnits(tx.units)}` : '',
    `کد پیگیری: ${tx.trackingCode}`,
    `تاریخ: ${jDateTime(tx.at)}`,
    `وضعیت: ${STATUS_LABEL[tx.status].label}`,
    tx.subtitle ? `توضیح: ${tx.subtitle}` : '',
    ...(tx.details ?? []).map((r) => `${r.label}: ${r.value}`),
  ];
  return lines.filter((l, i) => l !== '' || i === 1).join('\n');
}

export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Web Share API with clipboard fallback. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ───────────── charts ─────────────
export const RANGES = ['روز', 'هفته', 'ماه', 'سال'] as const;
export type RangeKey = (typeof RANGES)[number];
const RANGE_DAYS: Record<RangeKey, number> = { 'روز': 1, 'هفته': 7, 'ماه': 30, 'سال': 365 };

/** Line path in the design's 326×(22..112) chart box. */
export function linePath(values: number[], w = 326, top = 30, bottom = 98): string {
  const v = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min;
  const n = v.length;
  return v
    .map((x, i) => {
      const px = Math.round(((i * w) / (n - 1)) * 10) / 10;
      const py = span <= Math.abs(max) * 1e-9 ? (top + bottom) / 2 : bottom - ((x - min) / span) * (bottom - top);
      return `${i === 0 ? 'M' : 'L'}${px} ${Math.round(py * 10) / 10}`;
    })
    .join(' ');
}

function sample(arr: number[], n: number): number[] {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
}

/** Deterministic NAV history when the API has none (fund without `history`). */
function synthHistory(f: Fund): number[] {
  if (!f.nav) return [0, 0];
  const r = f.return1y / 100;
  let x = f.id.length * 97 + 13;
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  return Array.from({ length: 365 }, (_, i) => {
    const base = f.nav / Math.pow(1 + r, (364 - i) / 364);
    return i === 364 ? f.nav : base * (1 + (rnd() - 0.5) * 0.01);
  });
}

/** Chart series for a fund over a range; `liveNav` replaces the last point (live tick). */
export function fundSeries(f: Fund, range: RangeKey, liveNav?: number): number[] {
  const h = f.history && f.history.length > 1 ? f.history.map((p) => p.v) : synthHistory(f);
  let s: number[];
  if (range === 'روز') {
    const a = h[h.length - 2];
    const b = h[h.length - 1];
    const amp = Math.abs(b - a) || a * 0.001;
    s = Array.from({ length: 14 }, (_, i) => a + ((b - a) * i) / 13 + (i === 0 || i === 13 ? 0 : amp * 0.35 * Math.sin(i * 1.7 + f.id.length)));
  } else if (range === 'هفته') s = h.slice(-10);
  else if (range === 'ماه') s = sample(h.slice(-31), 18);
  else s = sample(h, 27);
  if (liveNav && s.length) s = [...s.slice(0, -1), liveNav];
  return s;
}

/** Wallet balance reconstructed backwards from the current value and the wallet's transactions. */
export function balanceSeries(value: number, txs: Transaction[], range: RangeKey): number[] {
  const end = now().getTime();
  const days = RANGE_DAYS[range];
  const n = range === 'روز' ? 14 : range === 'هفته' ? 10 : range === 'ماه' ? 16 : 22;
  const start = end - days * 86400000;
  const moves = txs.map((t) => ({ t: new Date(t.at).getTime(), a: t.lockEvent ? 0 : t.amount }));
  return Array.from({ length: n }, (_, i) => {
    const t = start + ((end - start) * i) / (n - 1);
    const after = moves.filter((m) => m.t > t).reduce((s, m) => s + m.a, 0);
    return Math.max(0, value - after);
  });
}
