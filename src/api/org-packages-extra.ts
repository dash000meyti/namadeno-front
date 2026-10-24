'use client';
/**
 * Extra React Query hooks owned by the "org-packages" area
 * (endpoints documented in src/mocks/handlers/org-packages-extra.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationSplit, ID, ISODate, OrgPackage, Toman } from '@/types/domain';
import { get, patch, post } from './client';
import { qk } from './keys';

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
export interface MilestoneClaim {
  stepId?: ID; requestId: ID; requesterName: string; createdAt: ISODate; note?: string;
  /** What opened the request: the employee's completion report or the step's due date. */
  trigger?: 'employee' | 'due_date';
}
export interface PackageInsights {
  recipients: PackageRecipientInsight[];
  /** Accepted amounts by destination (toman). */
  allocation: { gold: Toman; fixed: Toman; rial: Toman };
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

/**
 * Due date and «نیاز به تأیید» of one milestone step (draft or sent package, step not released yet).
 * The response package is written to the cache at once, so the fields do not jump back while the lists refresh.
 */
export const useUpdateMilestoneStep = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { packageId: ID; stepId: ID; requiresApproval?: boolean; dueDate?: ISODate }) =>
      patch<OrgPackage>(`/org/packages/${v.packageId}/milestones/${v.stepId}`, {
        ...(v.requiresApproval !== undefined ? { requiresApproval: v.requiresApproval } : {}),
        ...(v.dueDate !== undefined ? { dueDate: v.dueDate } : {}),
      }),
    onSuccess: (pkg) => {
      qc.setQueryData(qk.org.package(pkg.id), pkg);
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all }); // the employee app shows the steps
      qc.invalidateQueries({ queryKey: qk.op.all });
    },
  });
};

export const useRemindPackage = () =>
  useX((v: { packageId: string; employeeIds?: string[] }) => post<{ reminded: number; employeeIds: string[] }>(`/org/packages/${v.packageId}/remind`, { employeeIds: v.employeeIds }));
/**
 * «بازپس‌گیری»: the step is not paid — its share leaves the employee's assets and returns to the organization.
 * `note` (≥ 3 characters) is the explanation the employee sees. Irreversible.
 */
export const useReclaimMilestone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { packageId: ID; stepId: ID; note: string }) => post<OrgPackage>(`/org/packages/${v.packageId}/milestones/${v.stepId}/reclaim`, { note: v.note }),
    onSuccess: (pkg) => {
      qc.setQueryData(qk.org.package(pkg.id), pkg);
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all }); // the employee's assets change
      qc.invalidateQueries({ queryKey: qk.op.all });
    },
  });
};
export const useToggleSchedule = () => useX((v: { id: string; enabled: boolean }) => patch<ReportSchedule>(`/org/reports/schedules/${v.id}`, { enabled: v.enabled }));
export const useCreateSchedule = () => useX((v: { title?: string; format?: 'Excel' | 'PDF' }) => post<ReportSchedule>('/org/reports/schedules', v));
export const useExportReport = () => useX((v: { id: ReportExport['id']; format: 'xlsx' | 'pdf' }) => post<ReportFile>(`/org/reports/exports/${v.id}`, { format: v.format }));
export const useUpdateApprovalChain = () => useX((values: Record<string, boolean>) => patch<ApprovalChain>('/org/contract/approval-chain', { values }));
