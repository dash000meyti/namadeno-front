/**
 * Canonical lock-type metadata (labels, colors, icons) — same in app, org and operator panels.
 * Customer wording (docs/WORDING.md): the non-withdrawable part is «رزرو», never «قفل»; the API keeps `locks`/`lockType`.
 */
import type { LockType } from '@/types/domain';

const LOCK = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2';
const FLAG = 'M5 21V4M5 4h11l-2 4 2 4H5';
/** Reserved part in general (bars, legends): available later. */
export const HOURGLASS = 'M7 3h10M7 21h10M8 3c0 4.5 8 5.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 5.5-8 9s8 4.5 8 9';
const SPROUT = 'M12 21v-8M12 13c0-4.4 3-7.5 8-7.5 0 4.6-3.2 7.6-8 7.5zM12 15.5c0-3.2-2.4-5.5-6.5-5.5 0 3.4 2.6 5.6 6.5 5.5';
const SHIELD = 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4';
const CALENDAR = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2';
const CHECK = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8.5 12.5l2.5 2.5 4.5-5';

export const LOCK_META: Record<LockType | 'none', { label: string; short: string; bg: string; fg: string; d: string }> = {
  collateral: { label: 'پشتوانه‌ی وام و اعتبار', short: 'پشتوانه', bg: 'var(--soft-info)', fg: 'var(--info-text)', d: SHIELD },
  vesting: { label: 'پس‌انداز سازمانی', short: 'پس‌انداز', bg: 'var(--soft-warning)', fg: 'var(--warning-text)', d: SPROUT },
  installment: { label: 'پشتوانه‌ی خرید اقساطی', short: 'اقساطی', bg: 'var(--soft-secondary)', fg: 'var(--secondary-text)', d: CALENDAR },
  milestone: { label: 'دریافت مرحله‌ای', short: 'مرحله‌ای', bg: 'var(--soft-primary)', fg: 'var(--primary-text)', d: FLAG },
  legal: { label: 'مسدودی قانونی', short: 'مسدودی', bg: 'var(--soft-error)', fg: 'var(--error-text)', d: LOCK },
  none: { label: 'آزاد', short: 'آزاد', bg: 'var(--soft-success)', fg: 'var(--success-text)', d: CHECK },
};

/** Asset kind → display meta used across surfaces. */
export const ASSET_META: Record<string, { name: string; short: string; dot: string; soft: string; fg: string; icon: string }> = {
  rial: { name: 'کیف پول ریالی', short: 'ریال', dot: 'var(--grey-600)', soft: 'var(--soft-default)', fg: 'var(--default-text)', icon: 'banknote' },
  gold: { name: 'صندوق طلا', short: 'طلا', dot: 'var(--warning-main)', soft: 'var(--soft-warning)', fg: 'var(--warning-text)', icon: 'gold' },
  fixed: { name: 'صندوق درآمد ثابت', short: 'درآمد ثابت', dot: 'var(--secondary-main)', soft: 'var(--soft-secondary)', fg: 'var(--secondary-text)', icon: 'chart' },
  equity: { name: 'صندوق سهامی شاخصی', short: 'سهام', dot: 'var(--primary-light)', soft: 'var(--soft-primary)', fg: 'var(--primary-text)', icon: 'trend' },
  mixed: { name: 'صندوق مختلط', short: 'مختلط', dot: 'var(--success-main)', soft: 'var(--soft-success)', fg: 'var(--success-text)', icon: 'pie' },
  silver: { name: 'صندوق نقره', short: 'نقره', dot: 'var(--grey-400)', soft: 'var(--soft-default)', fg: 'var(--default-text)', icon: 'gold' },
  saffron: { name: 'صندوق زعفران', short: 'زعفران', dot: 'var(--warning-main)', soft: 'var(--soft-warning)', fg: 'var(--warning-text)', icon: 'sparkle' },
  leverage: { name: 'صندوق اهرمی', short: 'اهرم', dot: 'var(--error-main)', soft: 'var(--soft-error)', fg: 'var(--error-text)', icon: 'trend' },
  project: { name: 'صندوق پروژه', short: 'پروژه', dot: 'var(--info-main)', soft: 'var(--soft-info)', fg: 'var(--info-text)', icon: 'building' },
  energy: { name: 'صندوق انرژی', short: 'انرژی', dot: 'var(--grey-500)', soft: 'var(--soft-default)', fg: 'var(--default-text)', icon: 'sparkle' },
};

/** Symbol of each wallet / fund (24-grid stroke paths, for <Icon d>): wallet, gold bars, coin stack, trend, pie, coin, crocus, bolt, building, flame. */
export const ASSET_ICON: Record<string, string> = {
  rial: 'M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2M16 14h.01',
  gold: 'M3 18l2-6h6l1 6zM12 18l1-6h6l2 6zM7.5 12l2-6h5l2 6',
  fixed: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  equity: 'M4 17l5-6 4 3 7-9M15 5h5v5',
  mixed: 'M12 3v9h9A9 9 0 1 1 12 3zM15.5 3.7A9 9 0 0 1 20.3 8.5H15.5z',
  silver: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9',
  saffron: 'M12 14c-2.5-3.5-2-8 0-11 2 3 2.5 7.5 0 11zM12 14c-4-.5-6.5-3.5-7.5-7 3 0 6.5 1.5 7.5 7zM12 14c4-.5 6.5-3.5 7.5-7-3 0-6.5 1.5-7.5 7zM12 14v7',
  leverage: 'M13 3L5 14h6l-1 7 8-11h-6z',
  project: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  energy: 'M12 21a6 6 0 0 0 6-6c0-4-3-6.5-4.5-10.5C12 7 11 9 11 11c-1-.8-1.8-1.8-2.2-3C6.9 9.8 6 12.2 6 15a6 6 0 0 0 6 6z',
};
