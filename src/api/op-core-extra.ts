'use client';
/**
 * Extra React Query hooks owned by the "op-core" area (operator console: overview, organizations, users).
 * Endpoints are documented in src/mocks/handlers/op-core-extra.ts. All keys live under ['op', 'core', …]
 * so the core operator mutations (which invalidate qk.op.all) refresh them too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssetKind, ISODate, LockType, Organization, Toman } from '@/types/domain';
import { get, post } from './client';
import { qk } from './keys';

// ───────────── Types ─────────────

export interface ContractVersion { v: number; note: string; at: ISODate; by: string }
export interface HrUser {
  id: string; name: string; email: string; mobile?: string; role: string; lastLoginAt?: ISODate; twoFA: boolean; status: 'active' | 'invited';
  /** How the first login happens: an SMS invite link, or a temporary password set by the operator (changed on first login). */
  access?: 'invite' | 'temp_password';
}

/** Operator-only contract & metrics data of an organization (beyond `Organization`). */
export interface OrgContractExt {
  // metrics
  aum: Toman;
  locked: Toman;
  lockByType: Partial<Record<LockType, Toman>>;
  growthPct: number; // AUM change vs. last month
  aumHistory: Toman[]; // last 12 months, oldest first
  aumMix: { gold: number; fixed: number; rial: number }; // percent
  credit: { activeLoans: number; outstanding: Toman; cardHolders: number; overdue: number };
  newEmployeesMonth: number;
  // contract terms (Organization.settings holds the rest)
  cardPct: number;
  perPersonCap: Toman;
  vestingMaxMonths: number;
  milestoneMaxSteps: number;
  allowCollateral: boolean;
  allowInstallmentLock: boolean;
  financeApproval: boolean;
  version: number;
  versions: ContractVersion[]; // newest first
  // profile
  nationalId?: string;
  representative?: { name: string; phone: string };
  accountManager: string;
  city: string;
  hrEmail: string;
  hrUsers: HrUser[];
  createdAt: ISODate;
}

/** Body accepted by PATCH /op/organizations/:id (core endpoint, extended by this area). */
export type OrgPatch = Partial<Organization> & { id: string; contract?: Partial<OrgContractExt>; changeNote?: string };
/** Body accepted by POST /op/organizations (core endpoint, extended by this area). */
/** `hrUsers[].tempPassword`: required for each user when `sendInvites` is false (≥ 8 characters, letters and digits); never stored in plain text. */
export type OrgCreate = Partial<Organization> & { contract?: Partial<OrgContractExt>; hrUsers?: (Omit<HrUser, 'id' | 'status' | 'twoFA' | 'access'> & { tempPassword?: string })[]; sendInvites?: boolean };

export type FacilityKind = 'loan' | 'card' | 'bnpl';
export interface Facility {
  id: string;
  kind: FacilityKind;
  title: string;
  status: 'current' | 'late' | 'blocked' | 'settled';
  amount: Toman; // principal / credit limit / purchase price
  used: Toman; // remaining principal (loan, bnpl) or used credit (card)
  months?: number;
  paidCount?: number;
  totalCount?: number;
  nextDue?: { at: ISODate; amount: Toman };
  collateral?: { holdingKind: AssetKind; amount: Toman };
}

export interface UserMetaRow { facilities: FacilityKind[]; lockTypes: LockType[]; kyc: 'ok' | 'pending' | 'rejected' }
export interface UsersMeta {
  meta: Record<string, UserMetaRow>;
  totals: { users: number; newThisMonth: number; locked: number; lockedPct: number; kycPending: number; kycAvgDays: number; legal: number; suspended: number };
}

export interface UserNote { id: string; text: string; tag: 'security' | 'credit' | 'support'; by: string; at: ISODate }
export interface UserLog { id: string; text: string; by: string; at: ISODate; tone: 'primary' | 'success' | 'warning' | 'error' | 'default' }
export interface OpUserExtra {
  facilities: Facility[];
  notes: UserNote[];
  logs: UserLog[];
  devices: { count: number; newDevice: boolean; lastLoginAt: ISODate; city: string };
  department?: string;
  contract?: { loanMaxPct: number; cardPct: number };
}

export interface OverviewExt {
  range: '7' | '30' | '90';
  flow: { inflow: number[]; outflow: number[]; labels: string[] }; // billion Toman per day
  deltas: { aumPct: number; newOrgs: number; newUsers: number; spark: number[][] };
  unaccepted: { count: number; older7d: number };
  lockCounts: Record<LockType, number>; // number of lock items (milestone: contracts, legal: orders)
  services: { name: string; latencyMs: number | null; ok: boolean }[];
  feed: { text: string; at: ISODate; tone: 'primary' | 'success' | 'error' | 'warning'; href: string }[];
}

export interface OrgCreditRow { userId: string; name: string; kind: FacilityKind; amount: Toman; remain: Toman; collateral?: { holdingKind: AssetKind; amount: Toman }; status: Facility['status'] }

// ───────────── Keys ─────────────
export const opCoreKeys = {
  orgExt: ['op', 'core', 'org-ext'] as const,
  orgCredit: (id: string) => ['op', 'core', 'org-credit', id] as const,
  overview: (range: string) => ['op', 'core', 'overview', range] as const,
  usersMeta: ['op', 'core', 'users-meta'] as const,
  userExtra: (id: string) => ['op', 'core', 'user-extra', id] as const,
};

// ───────────── Queries ─────────────
export const useOrgContracts = () => useQuery({ queryKey: opCoreKeys.orgExt, queryFn: () => get<Record<string, OrgContractExt>>('/op/core/org-ext') });
export const useOrgCredit = (id: string) => useQuery({ queryKey: opCoreKeys.orgCredit(id), queryFn: () => get<OrgCreditRow[]>(`/op/core/organizations/${id}/credit`), enabled: !!id });
export const useOverviewExt = (range: '7' | '30' | '90') => useQuery({ queryKey: opCoreKeys.overview(range), queryFn: () => get<OverviewExt>('/op/core/overview', { range }) });
export const useUsersMeta = () => useQuery({ queryKey: opCoreKeys.usersMeta, queryFn: () => get<UsersMeta>('/op/core/users-meta') });
export const useOpUserExtra = (id: string) => useQuery({ queryKey: opCoreKeys.userExtra(id), queryFn: () => get<OpUserExtra>(`/op/core/users/${id}/extra`), enabled: !!id });

// ───────────── Mutations ─────────────
function useCoreMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.op.all }); qc.invalidateQueries({ queryKey: qk.org.all }); },
  });
}

export const useAddUserNote = () => useCoreMutation((v: { userId: string; text: string; tag: UserNote['tag'] }) => post<UserNote>(`/op/core/users/${v.userId}/notes`, v));
export const useResetUserPassword = () => useCoreMutation((v: { userId: string }) => post<{ sent: boolean }>(`/op/core/users/${v.userId}/reset-password`, v));
export const useInviteHrUser = () => useCoreMutation((v: { orgId: string; name: string; email: string; role: string }) => post<HrUser>(`/op/core/organizations/${v.orgId}/hr-users`, v));
