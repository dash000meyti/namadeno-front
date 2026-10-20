'use client';
/**
 * Extra React Query hooks + types owned by the "op-system" area
 * (operator console: funds, products, rules, requests, risk, reports, settings).
 * Endpoints are implemented by src/mocks/handlers/op-system-extra.ts — see the
 * contract documented at the top of that file.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApprovalRequest, CreditProduct, Fund, ID, ISODate, LockType, PlatformRule, RiskAlert, Toman,
} from '@/types/domain';
import type { OpSettings } from './op';
import { get, patch, post } from './client';
import { qk } from './keys';

// ───────────────────────── Types (optional extensions of core resources) ─────────────────────────

/** Operator-only settings stored on a fund (`Fund.meta`, optional field returned by /op/funds). */
export interface FundMeta {
  manager: string;
  sellFeePct: number;
  minBuy: Toman;
  collateralEnabled: boolean;
  maxLtvPct: number;
  /** Locked value (Toman) of the fund's AUM per lock type. Free = aum − Σ. */
  lockByType: Record<LockType, Toman>;
  holdersByType: Record<LockType, number>;
  ordersToday: { buyCount: number; buyValue: Toman; sellCount: number; sellValue: Toman };
  investorsDeltaMonth: number;
  lastNavAt: ISODate;
  updatedAt?: ISODate;
  updatedBy?: string;
}
export type OpFund = Fund & { meta?: FundMeta };

/** Extra default parameters stored on a credit product (`CreditProduct.meta`). */
export interface ProductMeta {
  settleDays?: number;
  latePenaltyPct?: number;
  perPersonCap?: Toman;
  minScore?: number;
  liquidateAfter?: number;
  lockRatioPct?: number;
  feePct?: number;
  maxPurchase?: Toman;
  codeValidityHours?: number;
  autoLock?: boolean;
  updatedAt?: ISODate;
}
export type OpProduct = CreditProduct & { meta?: ProductMeta };

export interface RuleHistoryItem { id: ID; at: ISODate; group: string; text: string; by: string }
export interface RulesMeta { version: number; history: RuleHistoryItem[]; defaults: Record<ID, { enabled: boolean; value?: number | string }> }
export interface RuleChange { id: ID; enabled?: boolean; value?: number | string }

export type RequestFactorTone = 'success' | 'warning' | 'error';
export interface RequestMeta {
  slaDueAt: ISODate;
  riskScore: number;
  creditScore?: number;
  details: { k: string; v: string }[];
  factors: { t: string; tone: RequestFactorTone }[];
  checks: boolean[];
}

export type RiskSignal = 'velocity' | 'newdev' | 'big' | 'night' | 'mule';
export type OpRiskAlert = RiskAlert & { signals?: RiskSignal[] };

export interface LegalHold {
  id: ID;
  source: 'record' | 'lock';
  userId?: ID;
  userName: string;
  reference: string;
  holding: string;
  reason: string;
  amount: Toman;
  createdAt: ISODate;
  status: 'active' | 'risk' | 'pending' | 'done';
  releasedAt?: ISODate;
}

export interface RiskInsights {
  platformScore: number;
  platformScoreDelta: number;
  suspiciousToday: number;
  txToday: number;
  alertsToday: number;
  daily: { date: ISODate; critical: number; high: number; medium: number }[];
  legalHolds: LegalHold[];
}

export interface ReportSchedule { id: ID; name: string; period: string; recipients: string; format: 'PDF' | 'XLSX'; nextAt: ISODate; enabled: boolean }
export interface ServiceHealth { id: ID; name: string; sub: string; latencyMs: number | null; uptime: number; status: 'ok' | 'slow' | 'down' }
export interface Incident { id: ID; at: ISODate; title: string; sub: string; service: string; severity: 'high' | 'medium' | 'low'; duration: string; state: 'open' | 'resolved' }
export interface SystemStatus { checkedAt: ISODate; services: ServiceHealth[]; incidents: Incident[]; notice?: string }

export interface ReportsExtra {
  aumMonthly: { month: string; aum: Toman; inflow: Toman }[];
  lockedValue: Toman;
  credit: { month: string; disbursed: Toman; collected: Toman }[];
  creditOutstanding: Toman;
  creditDeltaPct: number;
  orgCount: number;
  newOrgs: number;
  sla: { overall: number; delta: number; services: { name: string; uptime: number; status: ServiceHealth['status'] }[] };
  updated: { aum: ISODate; credit: ISODate; orgs: ISODate };
  schedules: ReportSchedule[];
}

export type RoleKey = 'pm' | 'fin' | 'risk' | 'sup';
export type PermKey = 'orgs' | 'contracts' | 'requests' | 'funds' | 'rules' | 'legal' | 'users';
export interface OpTeamMember { id: ID; name: string; role: string; email: string; roleKey?: RoleKey; status?: 'active' | 'inactive' | 'invited'; lastLoginAt?: ISODate }
/** /op/settings with the operator-console extensions (all optional on the wire). */
export type OpSettingsX = Omit<OpSettings, 'team'> & {
  team: OpTeamMember[];
  platformVersion?: string;
  roleMatrix?: Record<PermKey, Record<RoleKey, boolean>>;
  lang?: 'fa' | 'en';
  timezone?: string;
  navTime?: string;
  notify?: { requests: boolean; risk: boolean; legal: boolean; services: boolean; orgs: boolean };
  dailyEmail?: string;
  minPasswordLength?: number;
  ipRestrict?: boolean;
  activeSessions?: number;
  activeDevices?: number;
  apiKeyMasked?: string;
  apiKeyCreatedAt?: ISODate;
  webhookEnabled?: boolean;
  webhookUrl?: string;
  rateLimit?: number;
};

// ───────────────────────── Keys ─────────────────────────
export const opx = {
  rulesMeta: ['op', 'x', 'rules-meta'] as const,
  requestMeta: ['op', 'x', 'request-meta'] as const,
  riskInsights: ['op', 'x', 'risk-insights'] as const,
  reportsExtra: ['op', 'x', 'reports-extra'] as const,
  systemStatus: ['op', 'x', 'system-status'] as const,
};

function useOpxMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.op.all });
      qc.invalidateQueries({ queryKey: qk.org.all });
      qc.invalidateQueries({ queryKey: qk.me.all });
      qc.invalidateQueries({ queryKey: qk.funds });
    },
  });
}

// ───────────────────────── Funds ─────────────────────────
export const useRefreshNav = () => useOpxMutation((v: { fundId?: string }) => post<{ lastNavAt: ISODate; funds: OpFund[] }>('/op/funds/nav-refresh', v));
/** PATCH /op/funds/:id with fund fields and/or a partial `meta` (deep-merged by the server). */
export const useUpdateFundX = () => useOpxMutation((v: Partial<Omit<Fund, 'id'>> & { id: string; meta?: Partial<FundMeta> }) => patch<OpFund>(`/op/funds/${v.id}`, v));

// ───────────────────────── Products ─────────────────────────
export const useUpdateProductX = () => useOpxMutation((v: Partial<Omit<CreditProduct, 'id'>> & { id: string; meta?: Partial<ProductMeta> }) => patch<OpProduct>(`/op/products/${v.id}`, v));

// ───────────────────────── Rules ─────────────────────────
export const useRulesMeta = () => useQuery({ queryKey: opx.rulesMeta, queryFn: () => get<RulesMeta>('/op/rules/meta') });
export const useSaveRules = () => useOpxMutation((v: { changes: RuleChange[] }) => post<{ version: number; rules: PlatformRule[]; history: RuleHistoryItem[] }>('/op/rules/batch', v));

// ───────────────────────── Requests ─────────────────────────
export const useRequestMeta = () => useQuery({ queryKey: opx.requestMeta, queryFn: () => get<Record<string, RequestMeta>>('/op/requests/meta') });
export const useUpdateRequestChecks = () => useOpxMutation((v: { id: string; checks: boolean[] }) => patch<RequestMeta>(`/op/requests/${v.id}/meta`, v));
export const useReopenRequest = () => useOpxMutation((v: { id: string }) => post<ApprovalRequest>(`/op/requests/${v.id}/reopen`, v));
export const useEscalateRequest = () => useOpxMutation((v: { id: string }) => post<RiskAlert>(`/op/requests/${v.id}/escalate`, v));

// ───────────────────────── Risk ─────────────────────────
export const useRiskInsights = () => useQuery({ queryKey: opx.riskInsights, queryFn: () => get<RiskInsights>('/op/risk/insights') });
export const useReleaseLegalHold = () => useOpxMutation((v: { id: string }) => post<LegalHold>(`/op/legal-holds/${v.id}/release`, v));

// ───────────────────────── Reports ─────────────────────────
export const useReportsExtra = () => useQuery({ queryKey: opx.reportsExtra, queryFn: () => get<ReportsExtra>('/op/reports/extra') });
export const useUpdateSchedule = () => useOpxMutation((v: { id: string; enabled: boolean }) => patch<ReportSchedule>(`/op/reports/schedules/${v.id}`, v));
export const useCreateSchedule = () => useOpxMutation((v: { name: string; period: string; recipients: string; format: 'PDF' | 'XLSX' }) => post<ReportSchedule>('/op/reports/schedules', v));

// ───────────────────────── Settings ─────────────────────────
export const useSystemStatus = () => useQuery({ queryKey: opx.systemStatus, queryFn: () => get<SystemStatus>('/op/system-status') });
export const useRefreshSystemStatus = () => useOpxMutation((v: Record<string, never>) => post<SystemStatus>('/op/system-status/refresh', v));
export const useUpdateOpSettingsX = () => useOpxMutation((v: Partial<OpSettingsX>) => patch<OpSettingsX>('/op/settings', v));
export const useInviteTeamMember = () => useOpxMutation((v: { name: string; email: string; roleKey: RoleKey }) => post<OpSettingsX>('/op/settings/team', v));
export const useSetTeamMemberStatus = () => useOpxMutation((v: { id: string; status: 'active' | 'inactive' }) => patch<OpSettingsX>(`/op/settings/team/${v.id}`, v));
export const useRotateApiKey = () => useOpxMutation((v: Record<string, never>) => post<OpSettingsX>('/op/settings/api-key/rotate', v));
export const useRevokeSessions = () => useOpxMutation((v: Record<string, never>) => post<OpSettingsX>('/op/settings/sessions/revoke', v));
