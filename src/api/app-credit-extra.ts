'use client';
/** Extra React Query hooks owned by the "app-credit" area (endpoints in src/mocks/handlers/app-credit-extra.ts). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetKind, Card, InstallmentPlanOption, InstallmentPurchase, Loan, Store, StoreProduct, Transaction } from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

export interface CreditExtra {
  cardUnsecuredLimit: number;
  cardLocked: number;
  cardLockSources: AssetKind[];
  installmentLimit: number;
  installmentOutstanding: number;
  installmentAvailable: number;
  scoreUpdatedAt: string;
  scoreNextUpdateAt: string;
}

/** Store/product with the display fields the mock adds (category, icon, shipping, special offer). */
export type StoreProductX = StoreProduct & { category?: string; icon?: string };
export type StoreX = Omit<Store, 'products'> & { shipping?: string; special?: boolean; products?: StoreProductX[] };
export type InstallmentPurchaseX = InstallmentPurchase & { prepayment?: number; collateralKind?: AssetKind; collateralAmount?: number; codeExpiresAt?: string };
export type CardSettingsX = Card['settings'] & { atmDailyLimit?: number };
export type PaySource = AssetKind | 'bank';

export const creditExtraKey = ['me', 'credit', 'extra'] as const;

function useMeMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: qk.me.all }) });
}

export const useCreditExtra = () => useQuery({ queryKey: creditExtraKey, queryFn: () => get<CreditExtra>('/me/credit/extra') });

/** Loan with collateral split over several holdings (greedy in the given order, FREE part only). */
export const useCreateLoanSplit = () =>
  useMeMutation((v: { amount: number; months: number; collaterals: AssetKind[] }) => post<Loan>('/me/loans', v));

/** Pays loan or installment-purchase installments. */
export const usePayDebt = () =>
  useMeMutation((v: { kind: 'loan' | 'inst'; id: string; count: number; source: PaySource }) =>
    post<Transaction>(v.kind === 'loan' ? `/me/loans/${v.id}/pay` : `/me/installments/${v.id}/pay`, { count: v.count, source: v.source }));

export const useInstallmentQuoteX = () =>
  useMutation({ mutationFn: (v: { storeId: string; price: number; prepayment: number }) => post<InstallmentPlanOption[]>('/me/installments/quote', v) });

export const useCreateInstallmentX = () =>
  useMeMutation((v: { storeId: string; productId?: string; title: string; price: number; months: number; monthly: number; prepayment: number; collateralKind: AssetKind }) =>
    post<InstallmentPurchaseX>('/me/installments', v));

export const useSettleCardX = () =>
  useMeMutation((v: { amount: number; source: PaySource }) => post<{ card: Card; transaction: Transaction; released: number }>('/me/card/settle', v));

export const useCardSettingsX = () => useMeMutation((v: Partial<CardSettingsX>) => patch<Card>('/me/card/settings', v));
export const useCardOtpSms = () => useMutation({ mutationFn: () => post<{ sent: boolean; mobile: string }>('/me/card/otp/sms') });
export const useBlockCard = () => useMeMutation(() => post<{ card: Card; transaction: Transaction }>('/me/card/block'));
export const useRequestPhysicalCard = () => useMeMutation(() => post<{ transaction: Transaction }>('/me/card/physical'));
