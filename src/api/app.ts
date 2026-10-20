'use client';
/** React Query hooks for the employee app. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AllocationSplit, AppNotification, AssetKind, BankAccount, Card, CreditSummary, FaqItem, Fund, Holding, InboxPackage,
  InstallmentPlanOption, InstallmentPurchase, Loan, LoanQuote, Portfolio, Store, Ticket, Transaction, UserProfile,
} from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

// queries
export const useMe = () => useQuery({ queryKey: qk.me.profile, queryFn: () => get<UserProfile>('/me') });
export const usePortfolio = () => useQuery({ queryKey: qk.me.portfolio, queryFn: () => get<Portfolio>('/me/portfolio') });
export const useHolding = (kind: AssetKind) =>
  useQuery({ queryKey: qk.me.holding(kind), queryFn: () => get<{ holding: Holding; fund?: Fund; transactions: Transaction[] }>(`/me/holdings/${kind}`) });
export const useFunds = () => useQuery({ queryKey: qk.funds, queryFn: () => get<Fund[]>('/funds') });
export const useFund = (id: string) => useQuery({ queryKey: qk.fund(id), queryFn: () => get<Fund>(`/funds/${id}`), enabled: !!id });
export const useInbox = (status?: 'pending' | 'accepted') => useQuery({ queryKey: qk.me.inbox(status), queryFn: () => get<InboxPackage[]>('/me/inbox', { status }) });
export const useInboxItem = (id: string) => useQuery({ queryKey: qk.me.inboxItem(id), queryFn: () => get<InboxPackage>(`/me/inbox/${id}`), enabled: !!id });
export const useTransactions = (f: { category?: string; holding?: string; q?: string; limit?: number } = {}) =>
  useQuery({ queryKey: qk.me.transactions(f), queryFn: () => get<Transaction[]>('/me/transactions', f) });
export const useTransaction = (id: string) => useQuery({ queryKey: qk.me.transaction(id), queryFn: () => get<Transaction>(`/me/transactions/${id}`), enabled: !!id });
export const useNotifications = () => useQuery({ queryKey: qk.me.notifications, queryFn: () => get<AppNotification[]>('/me/notifications') });
export const useBankAccounts = () => useQuery({ queryKey: qk.me.banks, queryFn: () => get<BankAccount[]>('/me/bank-accounts') });
export const useCredit = () => useQuery({ queryKey: qk.me.credit, queryFn: () => get<CreditSummary>('/me/credit') });
export const useLoans = () => useQuery({ queryKey: qk.me.loans, queryFn: () => get<Loan[]>('/me/loans') });
export const useLoan = (id: string) => useQuery({ queryKey: qk.me.loan(id), queryFn: () => get<Loan>(`/me/loans/${id}`), enabled: !!id });
export const useCard = () => useQuery({ queryKey: qk.me.card, queryFn: () => get<Card>('/me/card') });
export const useStores = () => useQuery({ queryKey: qk.stores, queryFn: () => get<Store[]>('/stores') });
export const useStore = (id: string) => useQuery({ queryKey: qk.store(id), queryFn: () => get<Store>(`/stores/${id}`), enabled: !!id });
export const useInstallments = () => useQuery({ queryKey: qk.me.installments, queryFn: () => get<InstallmentPurchase[]>('/me/installments') });
export const useFaq = () => useQuery({ queryKey: qk.faq, queryFn: () => get<FaqItem[]>('/support/faq') });
export const useTickets = () => useQuery({ queryKey: qk.me.tickets, queryFn: () => get<Ticket[]>('/me/tickets') });
export const useTicket = (id: string) => useQuery({ queryKey: qk.me.ticket(id), queryFn: () => get<Ticket>(`/me/tickets/${id}`), enabled: !!id });

/** Pending inbox count for badges. */
export const usePendingCount = () => {
  const q = useInbox('pending');
  return q.data?.length ?? 0;
};

// mutations — every money movement invalidates the whole "me" cache
function useMeMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: qk.me.all }) });
}

export const useAcceptInbox = () => useMeMutation((v: { id: string; split?: AllocationSplit }) => post<{ transaction: Transaction; portfolio: Portfolio; package: InboxPackage }>(`/me/inbox/${v.id}/accept`, { split: v.split }));
export const useTrade = () => useMeMutation((v: { direction: 'buy' | 'sell'; fundId: string; amount: number }) => post<Transaction>('/me/trades', v));
export const useDeposit = () => useMeMutation((v: { amount: number; destination: AssetKind }) => post<Transaction>('/me/deposits', v));
export const useWithdraw = () => useMeMutation((v: { amount: number; bankAccountId?: string }) => post<Transaction>('/me/withdrawals', v));
export const useAddBankAccount = () => useMeMutation((v: { iban: string; bankName?: string }) => post<BankAccount>('/me/bank-accounts', v));
export const useSetDefaultBank = () => useMeMutation((id: string) => post<BankAccount[]>(`/me/bank-accounts/${id}/default`));
export const useLoanQuote = () => useMutation({ mutationFn: (v: { amount: number; months: number; collateralKind?: AssetKind }) => post<LoanQuote>('/me/loans/quote', v) });
export const useCreateLoan = () => useMeMutation((v: { amount: number; months: number; collateralKind?: AssetKind }) => post<Loan>('/me/loans', v));
export const usePayInstallment = () => useMeMutation((v: { loanId: string; count?: number; source?: AssetKind }) => post<Transaction>(`/me/loans/${v.loanId}/pay`, v));
export const useCardSettings = () => useMeMutation((v: Partial<Card['settings']>) => patch<Card>('/me/card/settings', v));
export const useFreezeCard = () => useMeMutation((frozen: boolean) => post<Card>('/me/card/freeze', { frozen }));
export const useChargeCard = () => useMeMutation((amount: number) => post<{ card: Card; transaction: Transaction }>('/me/card/charge', { amount }));
export const useSettleCard = () => useMeMutation((amount: number) => post<{ card: Card; transaction: Transaction }>('/me/card/settle', { amount }));
export const useCardOtp = () => useMutation({ mutationFn: () => post<{ code: string; expiresIn: number }>('/me/card/otp') });
export const useInstallmentQuote = () => useMutation({ mutationFn: (v: { storeId: string; price: number }) => post<InstallmentPlanOption[]>('/me/installments/quote', v) });
export const useCreateInstallment = () => useMeMutation((v: { storeId: string; title: string; price: number; months: number; monthly: number; prepayment?: number; collateralKind?: AssetKind }) => post<InstallmentPurchase>('/me/installments', v));
export const useKycLevel2 = () => useMeMutation((v: { birthDate: string }) => post<{ level: number; fullName: string; fatherName: string; registryOffice: string }>('/me/kyc/level2', v));
export const useKycLevel3Otp = () => useMutation({ mutationFn: () => post<{ sent: boolean; devCode?: string }>('/me/kyc/level3/request-otp') });
export const useKycLevel3Verify = () => useMeMutation((code: string) => post<{ level: number }>('/me/kyc/level3/verify', { code }));
export const useReadAllNotifications = () => useMeMutation(() => post('/me/notifications/read-all'));
export const useReadNotification = () => useMeMutation((id: string) => post(`/me/notifications/${id}/read`));
export const useCreateTicket = () => useMeMutation((v: { subject: string; text: string }) => post<Ticket>('/me/tickets', v));
export const useSendTicketMessage = () => useMeMutation((v: { id: string; text: string }) => post<Ticket>(`/me/tickets/${v.id}/messages`, { text: v.text }));
export const useUpdateProfile = () => useMeMutation((v: Partial<UserProfile>) => patch<UserProfile>('/me/profile', v));
export const useChangePassword = () => useMutation({ mutationFn: (v: { current?: string; next: string }) => post('/me/password', v) });
export const useResetMockData = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => post('/_mock/reset'), onSuccess: () => qc.invalidateQueries() });
};
