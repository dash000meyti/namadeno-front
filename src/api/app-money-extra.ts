'use client';
/** Extra React Query hooks owned by the "app-money" area (for endpoints in src/mocks/handlers/app-money-extra.ts). */
import { useQuery } from '@tanstack/react-query';
import type { AssetKind, Toman } from '@/types/domain';
import { get } from './client';

export interface HoldingStats {
  kind: AssetKind;
  units: number;
  nav: Toman;
  avgCost: Toman;
  costBasis: Toman;
  pnl: Toman;
  pnlPct: number;
  dailyAccrual: Toman;
}

/** Average cost / profit-loss of a fund holding. Key lives under ['me', …] so money mutations invalidate it. */
export const useHoldingStats = (kind: string, enabled = true) =>
  useQuery({
    queryKey: ['me', 'holding', kind, 'stats'] as const,
    queryFn: () => get<HoldingStats>(`/me/holdings/${kind}/stats`),
    enabled: enabled && !!kind && kind !== 'rial',
  });

/**
 * Fixed withdrawal caps of the rial wallet (set by the operator in /op/rules) and what is left of them. Within the caps a
 * withdrawal goes through at once (no approval); above them POST /me/withdrawals answers 422 over_daily_limit /
 * over_monthly_limit. `null` = no cap. Days and months are Jalali. Only the free («آزاد») part is withdrawable anyway.
 */
export interface WithdrawLimits {
  daily: Toman | null;
  monthly: Toman | null;
  usedToday: Toman;
  usedMonth: Toman;
  remainingToday: Toman | null;
  remainingMonth: Toman | null;
}

/** GET /me/withdrawals/limits — under ['me', …] so a withdrawal refreshes it. */
export const useWithdrawLimits = () =>
  useQuery({ queryKey: ['me', 'withdrawals', 'limits'] as const, queryFn: () => get<WithdrawLimits>('/me/withdrawals/limits') });
