/**
 * In-browser mock database used by the MSW handlers.
 * - Seeded from src/mocks/seed/*.ts
 * - Persisted to localStorage so flows survive page reloads
 * - Reset with POST /api/v1/_mock/reset (or the "بازنشانی داده‌های نمایشی" button)
 *
 * The real backend replaces all of this; nothing outside src/mocks imports it.
 */
import type {
  AppNotification, ApprovalRequest, BankAccount, BlogPost, Card, CreditProduct, CreditSummary, Employee, FaqItem,
  Fund, Holding, InboxPackage, InstallmentPurchase, Loan, OrgPackage, Organization, PlatformRule, RiskAlert,
  Store, Ticket, Transaction, UserProfile, KycLevel, PlatformUser,
} from '@/types/domain';
import { buildSeed } from './seed';

export interface UserData {
  profile: UserProfile;
  holdings: Holding[];
  inbox: InboxPackage[];
  transactions: Transaction[];
  notifications: AppNotification[];
  bankAccounts: BankAccount[];
  credit: CreditSummary;
  loans: Loan[];
  card?: Card;
  installments: InstallmentPurchase[];
  tickets: Ticket[];
  passwordSet: boolean;
}

export interface MockDB {
  version: number;
  funds: Fund[];
  /** Registered app users (employees with an app account), keyed by user id. */
  users: Record<string, UserData>;
  /** Other platform users shown in the operator panel (lightweight). */
  platformUsers: PlatformUser[];
  organizations: Organization[];
  employees: Record<string, Employee[]>; // by orgId
  orgPackages: Record<string, OrgPackage[]>; // by orgId
  requests: ApprovalRequest[];
  products: CreditProduct[];
  rules: PlatformRule[];
  riskAlerts: RiskAlert[];
  stores: Store[];
  faq: FaqItem[];
  blog: BlogPost[];
  /** Free-form bag for surface-specific seed data (see seed/extra-*.ts). */
  extra: Record<string, unknown>;
  /** Current mock sessions: token → identity */
  sessions: Record<string, { role: 'employee' | 'org_admin' | 'operator'; userId: string; orgId?: string }>;
  /** Pending signups / OTPs by mobile */
  otp: Record<string, { code: string; purpose: string }>;
}

const STORAGE_KEY = 'nm-mock-db';
export const DB_VERSION = 2;

let state: MockDB | null = null;

function load(): MockDB {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDB;
        if (parsed.version === DB_VERSION) return parsed;
      }
    } catch { /* corrupted or unavailable → reseed */ }
  }
  return buildSeed();
}

export function db(): MockDB {
  if (!state) state = load();
  return state;
}

export function save() {
  if (!state || typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota/private mode */ }
}

export function resetDb() {
  state = buildSeed();
  save();
}

// ───────────── helpers shared by handlers ─────────────

export const DEMO_USER_ID = 'u-1001'; // سارا محمدی
export const DEMO_ORG_ID = 'org-arman'; // هلدینگ آرمان
export const DEMO_ORG_ADMIN_ID = 'oa-201'; // نیما رضایی
export const DEMO_OPERATOR_ID = 'op-301'; // علی نادری

export function userData(userId: string = DEMO_USER_ID): UserData {
  const u = db().users[userId];
  if (!u) throw new Error('user not found: ' + userId);
  return u;
}

export function fund(id: string): Fund {
  const f = db().funds.find((x) => x.id === id);
  if (!f) throw new Error('fund not found: ' + id);
  return f;
}

/** Recomputes free/locked of every holding from its locks. Call after any mutation. */
export function recalcHoldings(u: UserData) {
  for (const h of u.holdings) {
    if (h.fundId) {
      const f = fund(h.fundId);
      h.value = Math.round((h.units ?? 0) * f.nav);
    }
    h.locked = Math.min(h.value, h.locks.reduce((s, l) => s + l.amount, 0));
    h.free = Math.max(0, h.value - h.locked);
  }
}

export function setKyc(userId: string, level: KycLevel) {
  userData(userId).profile.kycLevel = level;
}

let seq = Date.now() % 100000;
export function newId(prefix: string) {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

export function trackingCode() {
  return 'NM-' + Math.random().toString(16).slice(2, 7).toUpperCase();
}
