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
