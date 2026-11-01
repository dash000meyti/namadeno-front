/**
 * Organization-side vocabulary of the rial account («حساب ریالی سازمان»): icons, movement labels and deposit states.
 * Org wording (docs/WORDING.md): «آزاد», «بلاک‌شده», «فیش واریز», «در انتظار تأیید», «اعلام واریز», «سقف بودجه‌ی سالانه»; never «قفل».
 * There is no payment deadline: a receipt is waiting for Namadno's review, approved or rejected (with a reason).
 * The operator console has its own labels in src/components/op/treasury/ui.ts (RIAL_MOVE).
 */
import type { Tone } from '@/components/panel/kit';
import type { RialMoveKind } from '@/api/op-treasury-extra';
import type { OrgAccountEntry } from '@/api/org-money-extra';

export const OM = {
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18',
  deposit: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  reserve: 'M6 3h12M6 21h12M7 3c0 4 5 5 5 9s-5 5-5 9M17 3c0 4-5 5-5 9s5 5 5 9',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  back: 'M9 14l-5-5 5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  x: 'M6 6l12 12M18 6L6 18',
};

/** Movements the organization sees in «گردش حساب»; `sign` = effect on the organization's money (+ in, − out, '' = moved to «بلاک‌شده»). */
export const ORG_MOVE: Partial<Record<RialMoveKind, { label: string; tone: Tone; d: string; sign: '+' | '−' | '' }>> = {
  org_deposit: { label: 'واریز', tone: 'success', d: OM.deposit, sign: '+' },
  reserve: { label: 'بلاک برای بسته', tone: 'secondary', d: OM.reserve, sign: '' },
  payout: { label: 'پرداخت به همکار', tone: 'primary', d: OM.user, sign: '−' },
  release: { label: 'برگشت به آزاد', tone: 'neutral', d: OM.back, sign: '+' },
  reclaim: { label: 'بازپس‌گیری', tone: 'warning', d: OM.back, sign: '+' },
};

/** Receipt state pill: «در انتظار تأیید» / «تأیید شد» / «رد شد» / «لغو شد». */
export function entryState(e: Pick<OrgAccountEntry, 'status'>): { label: string; tone: Tone; d: string } {
  if (e.status === 'done') return { label: 'تأیید شد', tone: 'success', d: OM.check };
  if (e.status === 'rejected') return { label: 'رد شد', tone: 'error', d: OM.alert };
  if (e.status === 'cancelled') return { label: 'لغو شد', tone: 'neutral', d: OM.x };
  return { label: 'در انتظار تأیید', tone: 'warning', d: OM.clock };
}

/** The latest receipt of a package (newest first, cancelled ones skipped), from GET /org/account entries. */
export function latestReceiptFor(entries: OrgAccountEntry[] | undefined, packageId: string): OrgAccountEntry | undefined {
  return (entries ?? []).filter((e) => e.packageId === packageId && e.status !== 'cancelled').sort((a, b) => b.at.localeCompare(a.at))[0];
}
