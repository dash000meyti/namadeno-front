/**
 * Namadno domain model — the shapes the REST API returns.
 * These types are the contract between the frontend and the backend team.
 * Money is always an integer number of TOMAN. Dates are ISO-8601 strings (UTC).
 * Fund units are decimals. IDs are opaque strings.
 */

// ───────────────────────── Common ─────────────────────────
export type ID = string;
export type ISODate = string;
export type Toman = number;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  code: string;
  message: string; // Persian, user-facing
  details?: Record<string, unknown>;
}

// ───────────────────────── Auth / identity ─────────────────────────
export type Role = 'employee' | 'org_admin' | 'operator';

export interface Session {
  token: string;
  role: Role;
  userId: ID;
  orgId?: ID;
  expiresAt: ISODate;
  /** Signed in with a temporary password: the panel asks for a new password before anything else. */
  mustChangePassword?: boolean;
}

/** KYC levels: 1 = Shahkar (mobile ↔ national ID), 2 = civil registry (birth date), 3 = SEJAM. */
export type KycLevel = 1 | 2 | 3;

export interface UserProfile {
  id: ID;
  firstName: string;
  lastName: string;
  fullName: string;
  mobile: string; // 09xxxxxxxxx (latin digits in data; UI converts)
  nationalId: string;
  birthDate?: string; // Jalali YYYY/MM/DD as entered
  employeeCode?: string;
  orgId: ID;
  orgName: string;
  jobTitle?: string;
  kycLevel: KycLevel;
  creditScore: number;
  joinedAt: ISODate;
  avatarLetter: string;
  status: 'active' | 'suspended' | 'invited';
}

export interface BankAccount {
  id: ID;
  bankName: string;
  iban: string; // IRxxxxxxxxxxxxxxxxxxxxxxxx
  ownerName: string;
  isDefault: boolean;
  verified: boolean;
}

// ───────────────────────── Funds & holdings ─────────────────────────
export type AssetKind = 'rial' | 'gold' | 'fixed' | 'equity' | 'mixed' | 'silver' | 'saffron' | 'leverage' | 'project' | 'energy';
export type FundCategory = 'commodity' | 'fixed_income' | 'equity' | 'mixed';
export type RiskLevel = 'low' | 'medium' | 'high' | 'very_high';

export interface Fund {
  id: ID; // e.g. 'gold'
  kind: AssetKind;
  name: string; // صندوق طلا
  symbol: string; // طلانو
  shortName: string; // طلا
  category: FundCategory;
  description: string;
  nav: Toman; // price per unit
  navChangePct1d: number;
  return1y: number; // percent
  effectiveYield?: number; // fixed income
  risk: RiskLevel;
  aum: Toman;
  investors: number;
  status: 'active' | 'coming_soon' | 'paused';
  settlement: 'T+0' | 'T+1' | 'T+2';
  feePct: number; // trade fee
  /** NAV history for the charts, newest last. */
  history?: { t: ISODate; v: number }[];
}

export type LockType = 'collateral' | 'vesting' | 'installment' | 'milestone' | 'legal';

export interface MilestoneStep {
  id: ID;
  title: string;
  sharePct: number; // of the contract total
  /**
   * Steps run in order; exactly one open step is 'pending_approval' (the current step).
   * With `requiresApproval: false` the current step only waits for its due date.
   * 'reclaimed' («بازپس‌گیری»): the organization decided not to pay the step — its share left the employee's assets
   * and went back to the organization (POST /org/packages/:id/milestones/:stepId/reclaim). Final, like 'released'.
   */
  status: 'released' | 'pending_approval' | 'future' | 'reclaimed';
  releasedAt?: ISODate;
  /** reclaimed only: when, and the organization's explanation shown to the employee. */
  reclaimedAt?: ISODate;
  reclaimNote?: string;
  /**
   * Due date («سررسید»). Required for new milestone packages (create / draft PATCH → 422 bad_steps) and editable
   * until the step is released (PATCH /org/packages/:id/milestones/:stepId). Older data may not have it.
   */
  dueDate?: ISODate;
  /**
   * «نیاز به تأیید». Missing = true.
   * true: at the due date the step opens a `milestone_release` request for the organization and is released when it is approved.
   * false: the step is released automatically at its due date.
   */
  requiresApproval?: boolean;
}

export interface Lock {
  id: ID;
  type: LockType;
  holdingKind: AssetKind; // which wallet/fund is locked
  amount: Toman; // currently locked value
  title: string; // e.g. «پشتوانه‌ی وام»
  condition: string; // release condition, user-facing
  createdAt: ISODate;
  releaseAt?: ISODate; // vesting
  sourceId?: ID; // loan / package / installment purchase / legal case id
  /** milestone only */
  contractTotal?: Toman;
  steps?: MilestoneStep[];
  /** installment / loan progress */
  paidCount?: number;
  totalCount?: number;
  /** legal only */
  reference?: string;
}

export interface Holding {
  kind: AssetKind;
  fundId?: ID; // undefined for rial
  name: string;
  units?: number; // funds only
  value: Toman; // total value
  free: Toman; // value − sum(locks)
  locked: Toman;
  change: Toman; // today (funds) or this month (rial)
  changePct: number;
  locks: Lock[];
}

export interface Portfolio {
  total: Toman;
  free: Toman;
  locked: Toman;
  changeToday: Toman;
  changeTodayPct: number;
  holdings: Holding[];
  updatedAt: ISODate;
}

// ───────────────────────── Inbox / packages ─────────────────────────
export type PackageReason = 'bonus' | 'welfare' | 'eid' | 'project_contract' | 'other';
export type AllocationMode = 'free' | 'fixed'; // free = employee chooses the split
export type LockPolicy =
  | { type: 'none' }
  | { type: 'vesting'; releaseAt: ISODate }
  /** steps: title, sharePct, dueDate (required for new packages), requiresApproval (missing = true). */
  | { type: 'milestone'; steps: Omit<MilestoneStep, 'id' | 'status' | 'releasedAt' | 'reclaimedAt' | 'reclaimNote'>[] };

export interface AllocationSplit {
  gold: number; // percent
  fixed: number; // percent
  rial?: number; // percent (only when cash withdrawal is allowed)
}

/** A package the employee receives (inbox item). */
export interface InboxPackage {
  id: ID;
  packageId: ID; // org-side package
  title: string;
  reason: PackageReason;
  orgId: ID;
  orgName: string;
  amount: Toman;
  message?: string;
  sentAt: ISODate;
  expiresAt?: ISODate;
  allocationMode: AllocationMode;
  fixedSplit?: AllocationSplit; // when allocationMode = fixed
  cashAllowed: boolean;
  lockPolicy: LockPolicy;
  status: 'pending' | 'accepted' | 'expired';
  acceptedAt?: ISODate;
  acceptedSplit?: AllocationSplit;
}

// ───────────────────────── Transactions / history ─────────────────────────
export type TxCategory = 'inbox' | 'trade' | 'rial' | 'card' | 'loan' | 'installment' | 'fund' | 'lock';
export type TxStatus = 'success' | 'pending' | 'failed';

export interface Transaction {
  id: ID;
  trackingCode: string; // NM-7F21A
  category: TxCategory;
  title: string;
  subtitle: string;
  at: ISODate;
  amount: Toman; // signed: + income, − expense
  units?: number; // for fund trades (signed)
  holdingKind?: AssetKind;
  status: TxStatus;
  lockType?: LockType;
  lockEvent?: 'locked' | 'released';
  details?: { label: string; value: string }[];
}

// ───────────────────────── Notifications ─────────────────────────
export type Tone = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'default';

export interface AppNotification {
  id: ID;
  title: string;
  body: string;
  at: ISODate;
  read: boolean;
  tone: Tone;
  icon: string; // icon name from components/ui/Icon
  href?: string; // in-app route
}

// ───────────────────────── Credit, loans, card ─────────────────────────
export interface CreditSummary {
  score: number; // 300..900
  scoreBand: 'poor' | 'fair' | 'good' | 'excellent';
  scoreChange: number;
  creditLimit: Toman; // card credit limit
  creditUsed: Toman;
  loanMax: Toman; // max new loan (based on free assets)
  loanMaxPct: number; // e.g. 40
  activeLoanId?: ID;
  factors: { title: string; impact: 'positive' | 'neutral' | 'negative'; note: string }[];
}

export interface LoanInstallment {
  n: number;
  dueDate: ISODate;
  amount: Toman;
  status: 'paid' | 'due' | 'upcoming' | 'overdue';
  paidAt?: ISODate;
}

export interface Loan {
  id: ID;
  principal: Toman;
  months: number;
  ratePct: number; // annual
  monthlyPayment: Toman;
  startedAt: ISODate;
  collateral: { holdingKind: AssetKind; amount: Toman; lockId: ID };
  installments: LoanInstallment[];
  status: 'active' | 'settled' | 'pending_review' | 'rejected';
}

export interface LoanQuote {
  amount: Toman;
  months: number;
  ratePct: number;
  monthlyPayment: Toman;
  totalRepay: Toman;
  collateral: { holdingKind: AssetKind; amount: Toman }[];
}

export interface Card {
  id: ID;
  holderName: string;
  maskedPan: string; // 6037 •••• •••• 4521
  expiry: string; // 08/09
  status: 'active' | 'frozen' | 'blocked';
  balance: Toman; // spendable (charged from credit)
  creditLimit: Toman;
  creditUsed: Toman;
  statementDue: ISODate;
  statementAmount: Toman;
  settings: {
    online: boolean;
    pos: boolean;
    atm: boolean;
    contactless: boolean;
    dailyLimit: Toman;
    notifyEach: boolean;
  };
}

// ───────────────────────── Installment purchase ─────────────────────────
export interface Store {
  id: ID;
  name: string;
  category: string;
  logoLetter: string;
  maxMonths: number;
  feePct: number;
  products?: StoreProduct[];
}

export interface StoreProduct {
  id: ID;
  title: string;
  price: Toman;
}

export interface InstallmentPlanOption {
  months: number;
  prepayment: Toman;
  monthly: Toman;
  feePct: number;
  totalPay: Toman;
  collateral: { holdingKind: AssetKind; amount: Toman }[];
}

export interface InstallmentPurchase {
  id: ID;
  storeId: ID;
  storeName: string;
  title: string;
  price: Toman;
  months: number;
  monthly: Toman;
  paidCount: number;
  purchaseCode: string;
  createdAt: ISODate;
  lockId?: ID;
}

// ───────────────────────── Support ─────────────────────────
export interface FaqItem { id: ID; q: string; a: string }
export interface TicketMessage { id: ID; from: 'user' | 'agent'; text: string; at: ISODate; attachment?: { name: string; size: string } }
export interface Ticket {
  id: ID; // SP-4120
  subject: string;
  status: 'open' | 'closed';
  createdAt: ISODate;
  messages: TicketMessage[];
}

// ───────────────────────── Organization panel ─────────────────────────
export interface Organization {
  id: ID;
  name: string;
  legalName: string;
  contractNo: string;
  industry: string;
  employees: number;
  activeEmployees: number;
  status: 'active' | 'onboarding' | 'suspended';
  contractStart: ISODate;
  contractEnd: ISODate;
  budgetYear: Toman;
  budgetUsed: Toman;
  logoLetter: string;
  /** contract settings */
  settings: {
    allowedFunds: ID[];
    cashWithdrawalAllowed: boolean;
    lockPolicies: ('none' | 'vesting' | 'milestone')[];
    loanEnabled: boolean;
    loanMaxPct: number;
    loanMonthsOptions: number[];
    cardEnabled: boolean;
    installmentEnabled: boolean;
  };
  /** People who can sign in to the organization panel. `role` is the job title shown in the panel; `panelRole` sets what they may do. */
  admins: { id: ID; name: string; role: string; email: string; panelRole?: OrgPanelRole; /** Has a temporary password set by the operator; changed on first login. */ mustChangePassword?: boolean }[];
}

/**
 * Role in the organization panel: «مدیر» (`admin`, full access incl. departments and panel users),
 * «تأییدکننده» (`approver`, final approval of packages) and «کارشناس» (`specialist`, prepares packages).
 * Only `admin` may create, rename or delete departments. Missing = `specialist`.
 */
export type OrgPanelRole = 'admin' | 'approver' | 'specialist';

/** A unit (department) of an organization. Employees reference it by name (`Employee.department`). */
export interface OrgDepartment {
  id: ID;
  name: string;
  /** Full name of the unit head (optional). */
  head?: string;
  /** Number of employees whose `department` equals `name`. */
  employees: number;
  createdAt: ISODate;
  /** The organization's default unit «سایر» (exists from creation; employees without a unit land here; cannot be renamed or deleted). */
  isDefault?: boolean;
}

export interface Employee {
  id: ID; // same id as the user's profile when registered
  fullName: string;
  nationalId: string;
  mobile: string;
  employeeCode: string;
  department: string;
  jobTitle: string;
  status: 'active' | 'invited' | 'inactive';
  joinedAt: ISODate;
  totalReceived: Toman;
  portfolioValue: Toman;
  lockedValue: Toman;
  lastPackageAt?: ISODate;
  avatarLetter: string;
}

export interface OrgPackage {
  id: ID;
  title: string;
  reason: PackageReason;
  createdAt: ISODate;
  sentAt?: ISODate;
  status: 'draft' | 'sent' | 'completed' | 'cancelled';
  recipients: { employeeId: ID; name: string; amount: Toman; status: 'pending' | 'accepted' | 'expired'; acceptedAt?: ISODate }[];
  /** Same amount for everyone. 0 when the amounts come from a file (`amountSource: 'file'`) — then read `recipients[].amount`. */
  amountPerPerson: Toman;
  /** Where the recipients' amounts come from: one amount for everyone (default) or a per-person Excel file. */
  amountSource?: 'uniform' | 'file';
  total: Toman;
  allocationMode: AllocationMode;
  fixedSplit?: AllocationSplit;
  cashAllowed: boolean;
  lockPolicy: LockPolicy;
  milestoneProgress?: MilestoneStep[];
  message?: string;
  expiresAt?: ISODate;
}

export type RequestKind = 'loan' | 'credit_increase' | 'cash_withdrawal' | 'installment' | 'profile_change' | 'milestone_release';

export interface ApprovalRequest {
  id: ID; // RQ-2041
  kind: RequestKind;
  title: string;
  requesterId: ID;
  requesterName: string;
  orgId: ID;
  orgName: string;
  amount?: Toman;
  createdAt: ISODate;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  decidedAt?: ISODate;
  decidedBy?: string;
  /** milestone_release only: the package and the step under review (older requests may not have them). */
  packageId?: ID;
  stepId?: ID;
  /**
   * milestone_release only: what opened the request — the employee's completion report (default) or the step's due date.
   * A milestone_release request is never «rejected» in the usual sense: 'rejected' means the step was reclaimed («بازپس گرفته شد»).
   */
  trigger?: 'employee' | 'due_date';
}

// ───────────────────────── Operator panel ─────────────────────────
export interface PlatformUser extends UserProfile {
  portfolioValue: Toman;
  freeValue: Toman;
  lockedValue: Toman;
  riskScore: number;
  lastActiveAt: ISODate;
  flags: string[];
}

export interface CreditProduct {
  id: ID;
  kind: 'loan' | 'card_credit' | 'installment';
  name: string;
  status: 'active' | 'paused' | 'draft';
  rateMin: number;
  rateMax: number;
  maxPctOfAssets: number;
  monthsOptions: number[];
  activeContracts: number;
  outstanding: Toman;
  defaultRatePct: number;
}

export interface PlatformRule {
  id: ID;
  group: 'limits' | 'locks' | 'credit' | 'kyc' | 'risk';
  title: string;
  description: string;
  enabled: boolean;
  value?: number | string;
  unit?: string;
}

export interface RiskAlert {
  id: ID; // AL-3318
  title: string;
  userId?: ID;
  userName?: string;
  orgName?: string;
  score: number; // 0..100
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: ISODate;
  ruleId?: ID;
  amount?: Toman;
  note?: string;
}

export interface PlatformStats {
  aum: Toman;
  users: number;
  activeUsers: number;
  organizations: number;
  lockedValue: Toman;
  freeValue: Toman;
  loansOutstanding: Toman;
  pendingRequests: number;
  openAlerts: number;
  monthly: { month: string; inflow: Toman; outflow: Toman; aum: Toman }[];
}

// ───────────────────────── Marketing / blog ─────────────────────────
export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  body: string[]; // paragraphs (markdown-free for now)
  category: string;
  author: string;
  publishedAt: ISODate;
  readMinutes: number;
  cover: 'gold' | 'fixed' | 'credit' | 'org' | 'security';
}
