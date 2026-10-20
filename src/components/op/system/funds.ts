/** Presentation helpers for funds in the operator console (design: op-funds / op-fund). */
import type { AssetKind, Fund, LockType } from '@/types/domain';
import type { OpFund } from '@/api/op-system-extra';
import { IC, type ToneKey } from './ui';

export const LOCK_ORDER: LockType[] = ['collateral', 'milestone', 'vesting', 'installment', 'legal'];
/** Chart colour variable per lock type (design LKT.col). */
export const LOCK_COL: Record<LockType, string> = { collateral: '--info-main', vesting: '--warning-main', installment: '--secondary-main', milestone: '--primary-main', legal: '--error-main' };

const PIE = 'M12 3v9h9a9 9 0 1 1-9-9M15 3.5A9 9 0 0 1 20.5 9H15z';
export const FUND_UI: Record<AssetKind, { d: string; tone: ToneKey; col: string }> = {
  rial: { d: IC.wallet, tone: 'default', col: '--grey-600' },
  gold: { d: IC.gold, tone: 'warning', col: '--warning-main' },
  fixed: { d: IC.bond, tone: 'info', col: '--chart-3' },
  equity: { d: IC.trend, tone: 'primary', col: '--primary-light' },
  mixed: { d: PIE, tone: 'success', col: '--success-main' },
  silver: { d: IC.gold, tone: 'default', col: '--grey-500' },
  saffron: { d: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', tone: 'warning', col: '--warning-main' },
  leverage: { d: IC.trend, tone: 'error', col: '--error-main' },
  project: { d: IC.building, tone: 'info', col: '--info-main' },
  energy: { d: IC.energy, tone: 'default', col: '--chart-4' },
};

export const FUND_STATUS: Record<Fund['status'], { label: string; tone: ToneKey }> = {
  active: { label: 'فعال', tone: 'success' },
  paused: { label: 'غیرفعال موقت', tone: 'warning' },
  coming_soon: { label: 'پیش‌نویس', tone: 'default' },
};

export const CATEGORY_LABEL: Record<Fund['category'], string> = { commodity: 'کالایی', fixed_income: 'درآمد ثابت', equity: 'سهامی', mixed: 'مختلط' };
export const CATEGORIES: Fund['category'][] = ['commodity', 'fixed_income', 'equity', 'mixed'];

export const fundTitle = (f: Fund) => `${f.name} — ${f.symbol}`;
export const etfLabel = (f: Fund) => `ETF ${f.shortName}`;

/** Locked part of the fund's AUM (sum over lock types). */
export function lockedOf(f: OpFund): number {
  const m = f.meta?.lockByType;
  if (!m) return 0;
  return Math.min(f.aum, Object.values(m).reduce((s, v) => s + v, 0));
}

/** Sparkline (96×36) from the last `n` history points. */
export function sparkOf(f: Fund, n = 30): { line: string; area: string } | null {
  const h = (f.history ?? []).slice(-n).map((x) => x.v);
  if (h.length < 2) return null;
  const lo = Math.min(...h), hi = Math.max(...h);
  const span = hi - lo || 1;
  const pts = h.map((v, i) => [Math.round((i * 96) / (h.length - 1) * 10) / 10, Math.round((32 - ((v - lo) / span) * 26) * 10) / 10] as [number, number]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  return { line, area: line + ' L96 36 L0 36 Z' };
}
