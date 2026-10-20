'use client';
/**
 * Extra React Query hooks owned by the "org-packages" area
 * (endpoints documented in src/mocks/handlers/org-packages-extra.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationSplit, ID, ISODate, Toman } from '@/types/domain';
import { get, patch, post, del } from './client';

// ───────────── types (API contract) ─────────────
export interface PackageRecipientInsight {
  employeeId: ID;
  name: string;
  amount: Toman;
  status: 'pending' | 'accepted' | 'expired';
  acceptedAt?: ISODate;
  department: string;
  employeeCode: string;
  avatarLetter: string;
  /** Allocation the employee chose (accepted recipients only). */
  split?: AllocationSplit;
  reminded: boolean;
}
export interface MilestoneClaim { stepId?: ID; requestId: ID; requesterName: string; createdAt: ISODate; note?: string }
export interface PackageInsights {
  recipients: PackageRecipientInsight[];
  /** Accepted amounts by destination (toman). */
  allocation: { gold: Toman; fixed: Toman; rial: Toman };
  /** Milestone steps sent back to the employee for correction. */
  fixRequests: ID[];
  /** Pending «milestone_release» requests of the recipients. */
  claims: MilestoneClaim[];
}

export type ReportRange = 'm1' | 'm3' | 'm6' | 'y1';
export interface ReportSchedule {
  id: ID; title: string; period: string; to: string; format: 'Excel' | 'PDF'; lastAt?: ISODate; enabled: boolean;
  tone: 'primary' | 'info' | 'warning' | 'success'; icon: 'wallet' | 'percent' | 'file' | 'pkg' | 'clock';
}
export interface ReportExport { id: 'payroll' | 'credit' | 'tax'; title: string; desc: string; lastAt?: ISODate; tone: 'primary' | 'info' | 'warning'; icon: 'wallet' | 'percent' | 'file' }
export interface ReportsOverview {
  /** Weekly totals of the last 4 weeks (toman), oldest first. */
  weekly: { label: string; sent: Toman }[];
  /** Monthly totals before the months returned by GET /org/reports (for the yearly view). */
  earlierMonths: { month: string; sent: Toman }[];
  /** Packages sent in the current month that are not yet part of GET /org/reports `monthly`. */
  currentMonthExtra: Toman;
  /** Allocation chosen by employees, per department (percent). */
  units: { department: string; gold: number; fixed: number; rial: number; amount: Toman }[];
  exports: ReportExport[];
  schedules: ReportSchedule[];
}
export interface ReportFile { fileName: string; title: string; columns: string[]; rows: string[][] }

export interface ApprovalChainItem { id: ID; label: string; desc: string; enabled: boolean; locked: boolean }
export interface ApprovalChain { items: ApprovalChainItem[]; updatedAt?: ISODate }

// ───────────── keys (under the 'org' prefix so org mutations refresh them) ─────────────
export const qkx = {
  insights: (id: string) => ['org', 'pkgx', 'insights', id] as const,
  reports: ['org', 'pkgx', 'reports'] as const,
  chain: ['org', 'pkgx', 'chain'] as const,
};

// ───────────── queries ─────────────
export const usePackageInsights = (id: string) =>
  useQuery({ queryKey: qkx.insights(id), queryFn: () => get<PackageInsights>(`/org/packages/${id}/insights`), enabled: !!id });
export const useReportsOverview = () => useQuery({ queryKey: qkx.reports, queryFn: () => get<ReportsOverview>('/org/reports/overview') });
export const useApprovalChain = () => useQuery({ queryKey: qkx.chain, queryFn: () => get<ApprovalChain>('/org/contract/approval-chain') });

// ───────────── mutations ─────────────
function useX<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
}

export const useRemindPackage = () =>
  useX((v: { packageId: string; employeeIds?: string[] }) => post<{ reminded: number; employeeIds: string[] }>(`/org/packages/${v.packageId}/remind`, { employeeIds: v.employeeIds }));
export const useMilestoneFix = () =>
  useX((v: { packageId: string; stepId: string; undo?: boolean; note?: string }) =>
    v.undo
      ? del<{ fixRequests: string[] }>(`/org/packages/${v.packageId}/milestones/${v.stepId}/fix`)
      : post<{ fixRequests: string[] }>(`/org/packages/${v.packageId}/milestones/${v.stepId}/fix`, { note: v.note }));
export const useToggleSchedule = () => useX((v: { id: string; enabled: boolean }) => patch<ReportSchedule>(`/org/reports/schedules/${v.id}`, { enabled: v.enabled }));
export const useCreateSchedule = () => useX((v: { title?: string; format?: 'Excel' | 'PDF' }) => post<ReportSchedule>('/org/reports/schedules', v));
export const useExportReport = () => useX((v: { id: ReportExport['id']; format: 'xlsx' | 'pdf' }) => post<ReportFile>(`/org/reports/exports/${v.id}`, { format: v.format }));
export const useUpdateApprovalChain = () => useX((values: Record<string, boolean>) => patch<ApprovalChain>('/org/contract/approval-chain', { values }));
