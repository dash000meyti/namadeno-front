'use client';
/** React Query hooks for the operator console. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApprovalRequest, AssetKind, Card, CreditProduct, Employee, Fund, InstallmentPurchase, Loan, Lock, OrgPackage, Organization, PlatformRule,
  PlatformStats, PlatformUser, Portfolio, RiskAlert, Transaction,
} from '@/types/domain';
import { del, get, patch, post } from './client';
import { qk } from './keys';

export interface OpOverview {
  stats: PlatformStats; funds: Fund[]; recentRequests: ApprovalRequest[]; alerts: RiskAlert[]; topOrganizations: Organization[];
  lockMix: Record<'collateral' | 'vesting' | 'installment' | 'milestone' | 'legal', number>; usersSample: PlatformUser[];
}
export interface OpOrganizationDetail { organization: Organization; employees: Employee[]; packages: OrgPackage[]; requests: ApprovalRequest[] }
export interface OpUserDetail { user: PlatformUser; portfolio: Portfolio | null; loans: Loan[]; card?: Card; installments: InstallmentPurchase[]; transactions: Transaction[]; alerts: RiskAlert[] }
export interface OpReports { aumByFund: { fundId: string; name: string; aum: number }[]; monthly: { month: string; packages: number; loans: number; withdrawals: number }[]; byOrganization: { id: string; name: string; budgetUsed: number; employees: number }[] }
export interface OpSettings { platformName: string; supportPhone: string; maintenance: boolean; twoFactorRequired: boolean; sessionMinutes: number; team: { id: string; name: string; role: string; email: string }[] }

export const useOpOverview = () => useQuery({ queryKey: qk.op.overview, queryFn: () => get<OpOverview>('/op/overview') });
export const useOpOrganizations = (f: { q?: string; status?: string } = {}) => useQuery({ queryKey: qk.op.organizations(f), queryFn: () => get<Organization[]>('/op/organizations', f) });
export const useOpOrganization = (id: string) => useQuery({ queryKey: qk.op.organization(id), queryFn: () => get<OpOrganizationDetail>(`/op/organizations/${id}`), enabled: !!id });
export const useOpUsers = (f: { q?: string; filter?: string } = {}) => useQuery({ queryKey: qk.op.users(f), queryFn: () => get<PlatformUser[]>('/op/users', f) });
export const useOpUser = (id: string) => useQuery({ queryKey: qk.op.user(id), queryFn: () => get<OpUserDetail>(`/op/users/${id}`), enabled: !!id });
export const useOpFunds = () => useQuery({ queryKey: qk.op.funds, queryFn: () => get<Fund[]>('/op/funds') });
export const useOpFund = (id: string) => useQuery({ queryKey: qk.op.fund(id), queryFn: () => get<Fund>(`/op/funds/${id}`), enabled: !!id });
export const useOpProducts = () => useQuery({ queryKey: qk.op.products, queryFn: () => get<CreditProduct[]>('/op/products') });
export const useOpRules = () => useQuery({ queryKey: qk.op.rules, queryFn: () => get<PlatformRule[]>('/op/rules') });
export const useOpRequests = (f: { status?: string; kind?: string } = {}) => useQuery({ queryKey: qk.op.requests(f), queryFn: () => get<ApprovalRequest[]>('/op/requests', f) });
export const useOpRisk = (status?: string) => useQuery({ queryKey: qk.op.risk(status), queryFn: () => get<{ alerts: RiskAlert[]; rules: PlatformRule[] }>('/op/risk', { status }) });
export const useOpReports = () => useQuery({ queryKey: qk.op.reports, queryFn: () => get<OpReports>('/op/reports') });
export const useOpSettings = () => useQuery({ queryKey: qk.op.settings, queryFn: () => get<OpSettings>('/op/settings') });

function useOpMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.op.all });
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all });
    },
  });
}

export const useCreateOrganization = () => useOpMutation((v: Partial<Organization>) => post<Organization>('/op/organizations', v));
export const useUpdateOrganization = () => useOpMutation((v: Partial<Organization> & { id: string }) => patch<Organization>(`/op/organizations/${v.id}`, v));
export const useSetUserStatus = () => useOpMutation((v: { id: string; status: PlatformUser['status'] }) => post(`/op/users/${v.id}/status`, v));
export const useApplyLegalHold = () => useOpMutation((v: { userId: string; holdingKind: AssetKind; amount: number; reference: string; reason: string }) => post<Lock>(`/op/users/${v.userId}/legal-hold`, v));
export const useRemoveLegalHold = () => useOpMutation((v: { userId: string; lockId: string }) => del(`/op/users/${v.userId}/legal-hold/${v.lockId}`));
export const useUpdateFund = () => useOpMutation((v: Partial<Fund> & { id: string }) => patch<Fund>(`/op/funds/${v.id}`, v));
export const useUpdateProduct = () => useOpMutation((v: Partial<CreditProduct> & { id: string }) => patch<CreditProduct>(`/op/products/${v.id}`, v));
export const useUpdateRule = () => useOpMutation((v: Partial<PlatformRule> & { id: string }) => patch<PlatformRule>(`/op/rules/${v.id}`, v));
export const useDecideOpRequest = () => useOpMutation((v: { id: string; approve: boolean; note?: string }) => post<ApprovalRequest>(`/op/requests/${v.id}/decision`, v));
export const useUpdateAlert = () => useOpMutation((v: Partial<RiskAlert> & { id: string }) => patch<RiskAlert>(`/op/risk/${v.id}`, v));
export const useUpdateOpSettings = () => useOpMutation((v: Partial<OpSettings>) => patch<OpSettings>('/op/settings', v));
