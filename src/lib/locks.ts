/** Canonical lock-type metadata (labels, colors, icons) — same in app, org and operator panels. */
import type { LockType } from '@/types/domain';

const LOCK = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2';
const FLAG = 'M5 21V4M5 4h11l-2 4 2 4H5';

export const LOCK_META: Record<LockType | 'none', { label: string; short: string; bg: string; fg: string; d: string }> = {
  collateral: { label: 'وثیقه اعتبار و وام', short: 'وثیقه', bg: 'var(--soft-info)', fg: 'var(--info-text)', d: LOCK },
  vesting: { label: 'قفل زمانی سازمان', short: 'قفل زمانی', bg: 'var(--soft-warning)', fg: 'var(--warning-text)', d: LOCK },
  installment: { label: 'وثیقه خرید اقساطی', short: 'اقساطی', bg: 'var(--soft-secondary)', fg: 'var(--secondary-text)', d: LOCK },
  milestone: { label: 'آزادسازی مرحله‌ای', short: 'مرحله‌ای', bg: 'var(--soft-primary)', fg: 'var(--primary-text)', d: FLAG },
  legal: { label: 'مسدودی قانونی', short: 'مسدودی', bg: 'var(--soft-error)', fg: 'var(--error-text)', d: LOCK },
  none: { label: 'بدون قفل', short: 'بدون قفل', bg: 'var(--soft-success)', fg: 'var(--success-text)', d: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5zM12 15v2' },
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
