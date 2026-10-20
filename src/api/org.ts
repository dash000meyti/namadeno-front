'use client';
/** React Query hooks for the organization (HR) panel. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalRequest, Employee, Holding, Loan, OrgPackage, Organization } from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

export interface OrgDashboard {
  organization: Organization;
  kpis: { employees: number; activeEmployees: number; totalSent: number; awaitingAcceptance: number; employeeAssets: number; lockedAssets: number; pendingRequests: number };
  recentPackages: OrgPackage[];
  pendingRequests: ApprovalRequest[];
  monthly: { month: string; sent: number }[];
}
export interface OrgEmployeeDetail { employee: Employee; packages: OrgPackage[]; holdings?: Holding[]; requests: ApprovalRequest[]; loans: Loan[] }
export interface OrgCredit {
  settings: Organization['settings'];
  totals: { loansOutstanding: number; cardCreditUsed: number; installmentsOutstanding: number; collateralLocked: number };
  employees: { id: string; name: string; department: string; portfolio: number; locked: number; loanCap: number }[];
}
export interface OrgReports {
  totalSent: number; byReason: Record<string, number>; allocation: { gold: number; fixed: number; rial: number };
  lockMix: { none: number; vesting: number; milestone: number }; acceptanceRate: number; monthly: { month: string; sent: number; accepted: number }[];
}
export type NewPackage = Partial<OrgPackage> & { recipientIds?: string[] };

export const useOrgMe = () => useQuery({ queryKey: qk.org.me, queryFn: () => get<{ organization: Organization; admin: Organization['admins'][number] }>('/org/me') });
export const useOrgDashboard = () => useQuery({ queryKey: qk.org.dashboard, queryFn: () => get<OrgDashboard>('/org/dashboard') });
export const useOrgEmployees = (f: { q?: string; status?: string; department?: string } = {}) => useQuery({ queryKey: qk.org.employees(f), queryFn: () => get<Employee[]>('/org/employees', f) });
export const useOrgEmployee = (id: string) => useQuery({ queryKey: qk.org.employee(id), queryFn: () => get<OrgEmployeeDetail>(`/org/employees/${id}`), enabled: !!id });
export const useOrgPackages = (status?: string) => useQuery({ queryKey: qk.org.packages(status), queryFn: () => get<OrgPackage[]>('/org/packages', { status }) });
export const useOrgPackage = (id: string) => useQuery({ queryKey: qk.org.package(id), queryFn: () => get<OrgPackage>(`/org/packages/${id}`), enabled: !!id });
export const useOrgRequests = (status?: string) => useQuery({ queryKey: qk.org.requests(status), queryFn: () => get<ApprovalRequest[]>('/org/requests', { status }) });
export const useOrgCredit = () => useQuery({ queryKey: qk.org.credit, queryFn: () => get<OrgCredit>('/org/credit') });
export const useOrgReports = () => useQuery({ queryKey: qk.org.reports, queryFn: () => get<OrgReports>('/org/reports') });
export const useOrgContract = () => useQuery({ queryKey: qk.org.contract, queryFn: () => get<Organization>('/org/contract') });

function useOrgMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all }); // packages/milestones affect the employee app
      qc.invalidateQueries({ queryKey: qk.op.all });
    },
  });
}

export const useCreateEmployee = () => useOrgMutation((v: Partial<Employee>) => post<Employee>('/org/employees', v));
export const useUpdateEmployee = () => useOrgMutation((v: Partial<Employee> & { id: string }) => patch<Employee>(`/org/employees/${v.id}`, v));
export const useCreatePackage = () => useOrgMutation((v: NewPackage) => post<OrgPackage>('/org/packages', v));
export const useUpdatePackage = () => useOrgMutation((v: NewPackage & { id: string }) => patch<OrgPackage>(`/org/packages/${v.id}`, v));
export const useSendPackage = () => useOrgMutation((id: string) => post<OrgPackage>(`/org/packages/${id}/send`));
export const useCancelPackage = () => useOrgMutation((id: string) => post<OrgPackage>(`/org/packages/${id}/cancel`));
export const useReleaseMilestone = () => useOrgMutation((v: { packageId: string; stepId: string }) => post<OrgPackage>(`/org/packages/${v.packageId}/milestones/${v.stepId}/release`));
export const useDecideOrgRequest = () => useOrgMutation((v: { id: string; approve: boolean; note?: string }) => post<ApprovalRequest>(`/org/requests/${v.id}/decision`, v));
export const useUpdateContract = () => useOrgMutation((v: Partial<Organization>) => patch<Organization>('/org/contract', v));
