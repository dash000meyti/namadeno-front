'use client';
/** Extra React Query hooks owned by the "site" area (for endpoints in src/mocks/handlers/site-extra.ts). */
import { useQuery } from '@tanstack/react-query';
import type { CreditProduct } from '@/types/domain';
import { get } from './client';

export interface SiteStats { organizations: number; employees: number; aum: number; funds: number }
export type PublicCreditProduct = Pick<CreditProduct, 'id' | 'kind' | 'name' | 'rateMin' | 'rateMax' | 'maxPctOfAssets' | 'monthsOptions'>;

export const siteKeys = {
  stats: ['site', 'stats'] as const,
  creditProducts: ['site', 'credit-products'] as const,
};

/** GET /public/stats — headline numbers for the landing page. */
export const useSiteStats = () => useQuery({ queryKey: siteKeys.stats, queryFn: () => get<SiteStats>('/public/stats') });

/** GET /public/credit-products — active credit products (public subset). */
export const usePublicCreditProducts = () => useQuery({ queryKey: siteKeys.creditProducts, queryFn: () => get<PublicCreditProduct[]>('/public/credit-products') });
