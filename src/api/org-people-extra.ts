'use client';
/**
 * Extra React Query hooks owned by the "org-people" area
 * (endpoints in src/mocks/handlers/org-people-extra.ts — see the contract there).
 * Keys live under ['org', 'people', …] so every org mutation (qk.org.all) refreshes them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllocationSplit, ApprovalRequest, AssetKind, Employee, Holding, Loan, LockType, MilestoneStep } from '@/types/domain';
import { get, post } from './client';
import { qk } from './keys';

/** HR-side facts about one employee (free/locked split, locks by type, facilities). */
export interface EmpFacts {
  id: string;
  portfolio: number;
  free: number;
  locked: number;
  locks: { type: LockType; amount: number }[];
  /** allocation of the portfolio in percent */
  allocation: { gold: number; fixed: number; other: number };
  loanActive: number;
  cardLimit: number;
  cardUsed: number;
  pendingPackages: number;
  score: number;
  kycLevel: 0 | 1 | 2 | 3;
  pendingMilestone?: { packageId: string; packageTitle: string; stepIndex: number; stepCount: number; stepTitle: string };
}

export interface EmpActivity { id: string; kind: 'milestone' | 'login' | 'loan' | 'lock' | 'package' | 'installment' | 'card'; title: string; meta: string; at: string }

export interface EmpDetailExtra {
  facts: EmpFacts;
  registered: boolean;
  email: string;
  role: string;
  lastActiveAt?: string;
  holdings: Holding[];
  loans: Loan[];
  card?: { creditLimit: number; creditUsed: number; statementDue: string; status: 'active' | 'frozen' | 'blocked'; overdue: number };
  /** split the employee chose (or the fixed split) per org package id */
  packageSplits: Record<string, AllocationSplit>;
  activity: EmpActivity[];
  /** today's value change of the fund holdings (Toman) */
  todayChange: number;
}

export interface PeopleInsights {
  allocation: { gold: number; fixed: number; other: number };
  sentThisMonth: number;
  sentLastMonth: number;
  thisMonthName: string;
  lastMonthName: string;
  newEmployees30d: number;
  milestones: { count: number; amount: number };
}

export interface CreditLoanRow {
  employeeId: string;
  name: string;
  department: string;
  principal: number;
  remaining: number;
  paidPct: number;
  nextAmount: number;
  nextDate?: string;
  collateralKind: AssetKind;
  collateralAmount: number;
  status: 'ok' | 'late' | 'due';
  overdueCount: number;
  startedAt: string;
}

export interface PeopleCredit {
  loans: CreditLoanRow[];
  schedule: { month: string; loan: number; installment: number }[];
  cards: { count: number; limitTotal: number };
  overdue: { count: number; employees: number; amount: number };
  newLoansThisMonth: number;
  pendingLoanRequests: number;
  /** total disbursed principal of the active loans */
  principalTotal: number;
}

export interface RequestRow extends ApprovalRequest {
  employee?: { department: string; code: string; portfolio: number; free: number; score: number };
  source: string;
  /** CSS color of the source dot (e.g. var(--warning-main)) */
  sourceColor: string;
  details: { label: string; value: string }[];
  checks: { label: string; ok: boolean; value: string }[];
  milestone?: {
    packageId: string;
    packageTitle: string;
    steps: MilestoneStep[];
    stepIndex: number; // 1-based index of the step under review (or last released one)
    stepCount: number;
    sharePct: number;
    amount: number;
    lockedAfter: number;
    holdingName: string;
  };
}

export interface ImportRow { fullName: string; employeeCode: string; nationalId: string; mobile: string; department: string; joinedAt?: string }
export interface NewEmployeeInput extends Partial<Employee> { email?: string; role?: string; cardLimitPct?: number; sendSms?: boolean }

const pk = {
  facts: ['org', 'people', 'facts'] as const,
  employee: (id: string) => ['org', 'people', 'employee', id] as const,
  insights: ['org', 'people', 'insights'] as const,
  credit: ['org', 'people', 'credit'] as const,
  requests: ['org', 'people', 'requests'] as const,
};

export const useOrgPeopleFacts = () => useQuery({ queryKey: pk.facts, queryFn: () => get<Record<string, EmpFacts>>('/org/people/facts') });
export const useOrgPeopleEmployee = (id: string) => useQuery({ queryKey: pk.employee(id), queryFn: () => get<EmpDetailExtra>(`/org/people/employees/${id}`), enabled: !!id });
export const useOrgPeopleInsights = () => useQuery({ queryKey: pk.insights, queryFn: () => get<PeopleInsights>('/org/people/insights') });
export const useOrgPeopleCredit = () => useQuery({ queryKey: pk.credit, queryFn: () => get<PeopleCredit>('/org/people/credit') });
export const useOrgPeopleRequests = () => useQuery({ queryKey: pk.requests, queryFn: () => get<{ items: RequestRow[]; avgResponseDays: number | null }>('/org/people/requests') });

function usePeopleMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all });
      qc.invalidateQueries({ queryKey: qk.op.all });
    },
  });
}

/** Undo a decision (back to pending). Not allowed for an approved milestone release. */
export const useReopenOrgRequest = () => usePeopleMutation((id: string) => post<ApprovalRequest>(`/org/people/requests/${id}/reopen`));
/** Bulk create employees from an Excel/CSV import. */
export const useImportEmployees = () => usePeopleMutation((v: { rows: ImportRow[]; sendSms: boolean }) => post<{ created: Employee[]; errors: { row: number; message: string }[] }>('/org/people/employees/import', v));
/** Bulk status change (suspend / reactivate) for several employees. */
export const useBulkEmployeeStatus = () => usePeopleMutation((v: { ids: string[]; status: Employee['status'] }) => post<{ updated: number }>('/org/people/employees/status', v));
