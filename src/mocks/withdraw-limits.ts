/**
 * Withdrawal caps of the rial wallet (area "app-money"). The operator sets a fixed daily and monthly cap per user in
 * /op/rules (`r-limit-withdraw-daily`, `r-limit-withdraw-monthly`). Within them a withdrawal goes through at once — there
 * is no approval — and above them it is refused (422 over_daily_limit / over_monthly_limit). Days and months are Jalali
 * (Tehran), counted from the user's own withdrawals (not failed ones). A disabled rule = no cap.
 */
import type { Transaction } from '@/types/domain';
import type { WithdrawLimits } from '@/api/app-money-extra';
import { now } from '@/lib/clock';
import { money } from '@/lib/format';
import { jParts } from '@/lib/jalali';
import { db, type UserData } from './db';

const capOf = (id: string): number | null => {
  const r = db().rules.find((x) => x.id === id);
  return r && r.enabled && typeof r.value === 'number' && r.value > 0 ? r.value : null;
};

/** A withdrawal to a bank account (signed amount < 0 on the rial wallet), not failed. */
export const isWithdrawal = (t: Transaction) => t.category === 'rial' && t.amount < 0 && t.title.startsWith('برداشت') && t.status !== 'failed';

export function withdrawLimits(ud: UserData): WithdrawLimits {
  const today = jParts(now());
  let usedToday = 0;
  let usedMonth = 0;
  for (const t of ud.transactions) {
    if (!isWithdrawal(t)) continue;
    const p = jParts(t.at);
    if (p.y !== today.y || p.m !== today.m) continue;
    usedMonth += -t.amount;
    if (p.d === today.d) usedToday += -t.amount;
  }
  const daily = capOf('r-limit-withdraw-daily');
  const monthly = capOf('r-limit-withdraw-monthly');
  const remainingToday = daily === null ? null : Math.max(0, daily - usedToday);
  const remainingMonth = monthly === null ? null : Math.max(0, monthly - usedMonth);
  return { daily, monthly, usedToday, usedMonth, remainingToday, remainingMonth };
}

/** The error for an amount over a cap, or null when it fits. */
export function overLimit(l: WithdrawLimits, amount: number): { code: string; message: string } | null {
  if (l.remainingToday !== null && amount > l.remainingToday) {
    return { code: 'over_daily_limit', message: `سقف برداشت روزانه ${money(l.daily ?? 0)} تومان است؛ امروز تا ${money(l.remainingToday)} تومان می‌توانید برداشت کنید.` };
  }
  if (l.remainingMonth !== null && amount > l.remainingMonth) {
    return { code: 'over_monthly_limit', message: `سقف برداشت ماهانه ${money(l.monthly ?? 0)} تومان است؛ این ماه تا ${money(l.remainingMonth)} تومان می‌توانید برداشت کنید.` };
  }
  return null;
}
