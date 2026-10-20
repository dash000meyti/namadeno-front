/**
 * Additional mock endpoints owned by the "org-people" area (HR panel: dashboard, employees,
 * credit, requests). Registered before the core handlers (can override / fall through).
 *
 * GET  /api/v1/org/people/facts
 *      → Record<employeeId, EmpFacts>   free/locked split, locks by type, allocation %, loan, card, pending packages, score
 * GET  /api/v1/org/people/employees/:id
 *      → EmpDetailExtra                 holdings (real or derived), loans, card, activity, per-package split, e-mail, last activity
 * GET  /api/v1/org/people/insights
 *      → PeopleInsights                 dashboard: allocation (Toman), sent this/last month, new employees, pending milestone steps
 * GET  /api/v1/org/people/credit
 *      → PeopleCredit                   active loans of employees, 6-month repayment schedule, cards, overdue installments
 * GET  /api/v1/org/people/requests
 *      → { items: RequestRow[]; avgResponseDays: number | null }   requests enriched with employee facts, details and rule checks
 * POST /api/v1/org/people/requests/:id/reopen
 *      → ApprovalRequest                undo a decision (409 irreversible for an approved milestone release)
 * POST /api/v1/org/people/employees/import   { rows: ImportRow[]; sendSms: boolean }
 *      → { created: Employee[]; errors: { row: number; message: string }[] }
 * POST /api/v1/org/people/employees/status   { ids: string[]; status: 'active' | 'invited' | 'inactive' }
 *      → { updated: number }
 * POST /api/v1/org/employees  (override of the core endpoint)
 *      { fullName, nationalId, mobile, employeeCode?, department?, jobTitle?, joinedAt?, email?, role?, cardLimitPct?, sendSms? }
 *      → 201 Employee · 422 missing_fields | bad_national_id | bad_mobile · 409 duplicate | duplicate_code
 * GET  /api/v1/org/*  (pass-through) syncs portfolio/locked of employees that have an app account, then falls through.
 * POST /api/v1/org/requests/:id/decision  (pass-through) notifies the employee's app for non-milestone requests,
 *      then falls through to the core handler which records the decision (and releases milestone steps).
 *
 * Types: src/api/org-people-extra.ts
 */
import { http, type HttpHandler } from 'msw';
import type { AllocationSplit, ApprovalRequest, AssetKind, Employee, Holding, Lock, LockType, Loan, LoanInstallment, OrgPackage } from '@/types/domain';
import type { CreditLoanRow, EmpActivity, EmpDetailExtra, EmpFacts, ImportRow, PeopleCredit, PeopleInsights, RequestRow } from '@/api/org-people-extra';
import { db, newId, recalcHoldings, type UserData } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { seed_orgPeople, type OrgPeopleExtra, type OrgPeopleProfile } from '../seed/extra-org-people';
import { jalaliToIso, minutesAgo, now } from '@/lib/clock';
import { JALALI_MONTHS, enDigits, faDigits, jDayMonth, money, pct, signedMoney } from '@/lib/format';
import { ASSET_META, LOCK_META } from '@/lib/locks';
import { ledger } from './app';

// ───────────── helpers ─────────────
const nowIso = () => now().toISOString();
const orgOf = (req: Request) => who(req, 'org_admin').orgId!;
const orgById = (id: string) => db().organizations.find((o) => o.id === id)!;
const employees = (orgId: string) => (db().employees[orgId] ??= []);
const packages = (orgId: string) => (db().orgPackages[orgId] ??= []);
const CARD_PCT = 25;
const MIN_SCORE = 600;

function store(): OrgPeopleExtra {
  const x = db().extra.orgPeople as OrgPeopleExtra | undefined;
  if (x && x.profiles) return x;
  seed_orgPeople(db()); // DB persisted before this area existed
  return db().extra.orgPeople as OrgPeopleExtra;
}
const BLANK: OrgPeopleProfile = { email: '', score: 0, kycLevel: 0, split: [0, 0, 0], locks: [], loan: 0, loanMonths: 12, loanPaid: 0, loanOverdue: 0, cardLimit: 0, cardUsed: 0, bank: '—', lastActiveMin: -1, role: 'کارمند' };
const profile = (id: string): OrgPeopleProfile => store().profiles[id] ?? BLANK;

const J = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
function jp(d: Date | string) {
  const parts = J.formatToParts(new Date(d));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  return { y: g('year'), m: g('month'), d: g('day') };
}
function addMonths(y: number, m: number, k: number) {
  const t = y * 12 + (m - 1) + k;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}
const sameMonth = (iso: string, y: number, m: number) => { const a = jp(iso); return a.y === y && a.m === m; };
function annuity(principal: number, ratePct: number, months: number) {
  const r = ratePct / 1200;
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)) / 1000) * 1000;
}
const hashIdx = (s: string) => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const fundName = (k: string) => ASSET_META[k]?.name ?? k;
const DOT: Record<string, string> = { gold: 'var(--warning-main)', fixed: 'var(--chart-3)', rial: 'var(--chart-4)', equity: 'var(--primary-main)', mixed: 'var(--success-main)', silver: 'var(--grey-500)' };
const normDigits = (s: string) => enDigits(String(s ?? '')).replace(/\s|-/g, '');

// ───────────── derived data for employees without an app account ─────────────
function synthLoan(e: Employee, pr: OrgPeopleProfile): Loan | undefined {
  if (!pr.loan) return undefined;
  const months = pr.loanMonths;
  const monthly = annuity(pr.loan, 18, months);
  const cur = jp(now());
  const day = pr.loanOverdue ? 5 : [16, 20, 18, 25][hashIdx(e.id) % 4]; // upcoming due dates stay after «today» (15th)
  const kind: AssetKind = pr.split[0] >= pr.split[1] ? 'gold' : 'fixed';
  const installments: LoanInstallment[] = Array.from({ length: months }, (_, i) => {
    const n = i + 1;
    const offset = n - (pr.loanPaid + 1) - pr.loanOverdue;
    const ym = addMonths(cur.y, cur.m, offset);
    const dueDate = jalaliToIso(ym.y, ym.m, day);
    const status: LoanInstallment['status'] = n <= pr.loanPaid ? 'paid' : n <= pr.loanPaid + pr.loanOverdue ? 'overdue' : offset === 0 ? 'due' : 'upcoming';
    return { n, dueDate, amount: monthly, status, paidAt: status === 'paid' ? dueDate : undefined };
  });
  const start = addMonths(cur.y, cur.m, -(pr.loanPaid + pr.loanOverdue) - 1);
  return { id: 'loan-' + e.id, principal: pr.loan, months, ratePct: 18, monthlyPayment: monthly, startedAt: jalaliToIso(start.y, start.m, day), collateral: { holdingKind: kind, amount: pr.loan, lockId: 'lk-col-' + e.id }, installments, status: 'active' };
}

const LOCK_TEXT: Record<LockType, { title: string; condition: string }> = {
  collateral: { title: 'وثیقه وام', condition: 'آزاد با تسویه وام' },
  vesting: { title: 'پاداش تیر ۱۴۰۵', condition: 'آزاد در ۱۴۰۵/۱۰/۱۵' },
  milestone: { title: 'قرارداد پروژه', condition: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود' },
  installment: { title: 'خرید اقساطی', condition: 'با پرداخت هر قسط، بخشی آزاد می‌شود' },
  legal: { title: 'مسدودی قانونی', condition: 'با دستور مرجع رفع می‌شود' },
};

function synthHoldings(e: Employee, pr: OrgPeopleProfile, loan?: Loan): Holding[] {
  const total = e.portfolioValue;
  if (!total) return [];
  const kinds: AssetKind[] = ['gold', 'fixed', 'rial'];
  const sum = pr.split[0] + pr.split[1] + pr.split[2] || 100;
  let left = total;
  const hs: Holding[] = kinds.map((kind, i) => {
    const value = i === 2 ? left : Math.round((total * (pr.split[i] || (i === 2 ? 100 : 0))) / sum);
    left -= value;
    const f = db().funds.find((x) => x.id === kind);
    const change = f ? Math.round((value * f.navChangePct1d) / 100) : 0;
    return { kind, fundId: kind === 'rial' ? undefined : kind, name: fundName(kind), units: f && f.nav ? value / f.nav : undefined, value, free: value, locked: 0, change, changePct: f?.navChangePct1d ?? 0, locks: [] };
  });
  const prefer: Record<LockType, AssetKind> = { collateral: loan?.collateral.holdingKind ?? 'gold', vesting: 'fixed', milestone: 'gold', installment: 'fixed', legal: 'rial' };
  pr.locks.forEach(([type, amount], i) => {
    let h = hs.find((x) => x.kind === prefer[type]);
    if (!h || h.free < amount) h = [...hs].sort((a, b) => b.free - a.free)[0];
    const lock: Lock = {
      id: `lk-${e.id}-${i}`, type, holdingKind: h.kind, amount, title: LOCK_TEXT[type].title, condition: LOCK_TEXT[type].condition, createdAt: jalaliToIso(1405, 4, 2),
      releaseAt: type === 'vesting' ? jalaliToIso(1405, 10, 15) : undefined,
      paidCount: type === 'collateral' && loan ? loan.installments.filter((x) => x.status === 'paid').length : undefined,
      totalCount: type === 'collateral' && loan ? loan.months : undefined,
    };
    h.locks.push(lock);
    h.locked += amount;
    h.free = Math.max(0, h.value - h.locked);
  });
  return hs;
}

/** Live numbers of a registered user, written back to the HR record so every list agrees. */
function syncRegistered(e: Employee, ud: UserData) {
  recalcHoldings(ud);
  e.portfolioValue = ud.holdings.reduce((s, h) => s + h.value, 0);
  e.lockedValue = ud.holdings.reduce((s, h) => s + h.locked, 0);
}

function holdingsOf(e: Employee): { holdings: Holding[]; loans: Loan[]; registered: boolean; ud?: UserData } {
  const ud = db().users[e.id];
  if (ud) { syncRegistered(e, ud); return { holdings: ud.holdings, loans: ud.loans, registered: true, ud }; }
  const pr = profile(e.id);
  const loan = synthLoan(e, pr);
  return { holdings: synthHoldings(e, pr, loan), loans: loan ? [loan] : [], registered: false };
}

function factsOf(orgId: string, e: Employee): EmpFacts {
  const pr = profile(e.id);
  const { holdings, loans, ud } = holdingsOf(e);
  const portfolio = e.portfolioValue;
  const locked = e.lockedValue;
  const byType = new Map<LockType, number>();
  if (ud) holdings.flatMap((h) => h.locks).forEach((l) => byType.set(l.type, (byType.get(l.type) ?? 0) + l.amount));
  else pr.locks.forEach(([t, a]) => byType.set(t, (byType.get(t) ?? 0) + a));
  const val = (k: AssetKind) => holdings.filter((h) => h.kind === k).reduce((s, h) => s + h.value, 0);
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const gold = total ? Math.round((val('gold') / total) * 100) : 0;
  const fixed = total ? Math.round((val('fixed') / total) * 100) : 0;
  const ms = packages(orgId).find((x) => x.status !== 'draft' && x.milestoneProgress?.some((s) => s.status === 'pending_approval') && x.recipients.some((r) => r.employeeId === e.id));
  const step = ms?.milestoneProgress?.find((s) => s.status === 'pending_approval');
  return {
    id: e.id, portfolio, locked, free: Math.max(0, portfolio - locked),
    locks: [...byType.entries()].map(([type, amount]) => ({ type, amount })),
    allocation: { gold, fixed, other: total ? 100 - gold - fixed : 0 },
    loanActive: loans.filter((l) => l.status === 'active').reduce((s, l) => s + l.principal, 0),
    cardLimit: ud ? ud.card?.creditLimit ?? 0 : pr.cardLimit,
    cardUsed: ud ? ud.card?.creditUsed ?? 0 : pr.cardUsed,
    pendingPackages: packages(orgId).filter((x) => x.status === 'sent' || x.status === 'completed').filter((x) => x.recipients.some((r) => r.employeeId === e.id && r.status === 'pending')).length,
    score: ud ? ud.profile.creditScore : pr.score,
    kycLevel: ud ? ud.profile.kycLevel : pr.kycLevel,
    pendingMilestone: ms && step ? { packageId: ms.id, packageTitle: ms.title, stepIndex: ms.milestoneProgress!.indexOf(step) + 1, stepCount: ms.milestoneProgress!.length, stepTitle: step.title } : undefined,
  };
}

function overdueOf(loans: Loan[]) { return loans.flatMap((l) => l.installments).filter((i) => i.status === 'overdue'); }

function activityOf(orgId: string, e: Employee, ud: UserData | undefined, loans: Loan[], lastActiveAt?: string): EmpActivity[] {
  const out: EmpActivity[] = [];
  if (ud) {
    for (const t of ud.transactions) {
      if (!['inbox', 'lock', 'loan', 'installment'].includes(t.category)) continue;
      const kind: EmpActivity['kind'] = t.category === 'lock' ? (t.lockType === 'milestone' ? 'milestone' : 'lock') : t.category === 'inbox' ? 'package' : t.category === 'loan' ? 'loan' : 'installment';
      out.push({ id: t.id, kind, title: t.title, meta: `${signedMoney(t.amount)} تومان · ${t.subtitle}`, at: t.at });
    }
  } else {
    for (const pkg of packages(orgId)) {
      const r = pkg.recipients.find((x) => x.employeeId === e.id);
      if (!r || !pkg.sentAt) continue;
      if (r.status === 'accepted') out.push({ id: 'a-' + pkg.id, kind: 'package', title: 'پذیرش ' + pkg.title, meta: `${money(r.amount)} تومان · ${LOCK_META[pkg.lockPolicy.type].label}`, at: r.acceptedAt ?? pkg.sentAt });
      else out.push({ id: 's-' + pkg.id, kind: 'package', title: 'دریافت بسته ' + pkg.title, meta: `${money(r.amount)} تومان · ${r.status === 'pending' ? 'در انتظار تأیید کارمند' : 'منقضی‌شده'}`, at: pkg.sentAt });
    }
    for (const l of loans) {
      out.push({ id: 'ls-' + l.id, kind: 'loan', title: 'دریافت وام با پشتوانه دارایی', meta: `${money(l.principal)} تومان · ${faDigits(l.months)} ماهه · وثیقه ${fundName(l.collateral.holdingKind)}`, at: l.startedAt });
      l.installments.filter((i) => i.status === 'paid').slice(-2).forEach((i) => out.push({ id: `lp-${l.id}-${i.n}`, kind: 'loan', title: `پرداخت قسط ${faDigits(i.n)} وام`, meta: `${money(i.amount)} تومان · ${faDigits(l.months - i.n)} قسط مانده`, at: i.paidAt ?? i.dueDate }));
    }
  }
  if (lastActiveAt) out.push({ id: 'login', kind: 'login', title: 'ورود جدید به اپ', meta: 'دستگاه: iPhone · تهران', at: lastActiveAt });
  return out.filter((x) => new Date(x.at).getTime() <= now().getTime() + 60_000).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

function splitOf(pkg: OrgPackage, e: Employee, ud?: UserData): AllocationSplit | undefined {
  const inbox = ud?.inbox.find((i) => i.packageId === pkg.id);
  if (inbox?.acceptedSplit) return inbox.acceptedSplit;
  if (pkg.allocationMode === 'fixed' && pkg.fixedSplit) return pkg.fixedSplit;
  const r = pkg.recipients.find((x) => x.employeeId === e.id);
  if (r?.status !== 'accepted') return undefined;
  const s = profile(e.id).split;
  return { gold: s[0], fixed: s[1], rial: s[2] };
}

// ───────────── request enrichment ─────────────
function enrich(r: ApprovalRequest): RequestRow {
  const orgId = r.orgId;
  const o = orgById(orgId);
  const e = employees(orgId).find((x) => x.id === r.requesterId);
  const meta = store().requestMeta[r.id] ?? {};
  const amount = r.amount ?? 0;
  const base: RequestRow = { ...r, source: '—', sourceColor: 'var(--grey-500)', details: [], checks: [] };
  if (!e) return base;
  const f = factsOf(orgId, e);
  const { holdings, loans, ud } = holdingsOf(e);
  base.employee = { department: e.department, code: e.employeeCode, portfolio: f.portfolio, free: f.free, score: f.score };
  const freeOf = (k: AssetKind) => holdings.filter((h) => h.kind === k).reduce((s, h) => s + h.free, 0);
  const bestFund: AssetKind = freeOf('gold') >= freeOf('fixed') ? 'gold' : 'fixed';
  const overdue = overdueOf(loans);
  const scoreCheck = { label: `امتیاز اعتباری ≥ ${faDigits(MIN_SCORE)}`, ok: f.score >= MIN_SCORE, value: f.score ? faDigits(f.score) : '—' };
  const ratio = (n: number, d: number) => (d > 0 ? pct((n / d) * 100) : '—');

  switch (r.kind) {
    case 'loan': {
      const m = /([0-9۰-۹]+)\s*ماهه/.exec(r.title);
      const months = meta.months ?? (m ? Number(enDigits(m[1])) : 12);
      const cap = Math.round((f.free * o.settings.loanMaxPct) / 100);
      base.source = `${money(amount)} از ${fundName(bestFund)}`;
      base.sourceColor = DOT[bestFund];
      base.details = [
        { label: 'مدت بازپرداخت', value: `${faDigits(months)} ماه` },
        { label: 'قسط ماهانه', value: `${money(annuity(amount, 18, months))} تومان` },
        { label: 'نسبت وام به دارایی', value: ratio(amount, f.portfolio) },
      ];
      base.checks = [
        { label: `سقف ${pct(o.settings.loanMaxPct)} دارایی آزاد`, ok: amount <= cap, value: ratio(amount, f.free) },
        scoreCheck,
        { label: 'وام فعال ندارد', ok: !f.loanActive, value: f.loanActive ? `${money(f.loanActive)} فعال` : '—' },
      ];
      break;
    }
    case 'credit_increase': {
      const max = Math.round((f.free * CARD_PCT) / 100);
      base.source = `پشتوانه ${pct(CARD_PCT)} دارایی · ${money(max)}`;
      base.sourceColor = 'var(--chart-1)';
      base.details = [
        { label: 'سقف فعلی', value: `${money(f.cardLimit)} تومان` },
        { label: 'استفاده‌شده', value: `${money(f.cardUsed)} تومان` },
        { label: 'حداکثر مجاز', value: `${money(max)} تومان` },
      ];
      base.checks = [
        { label: `سقف ${pct(CARD_PCT)} دارایی آزاد`, ok: amount <= max, value: ratio(amount, f.free) },
        scoreCheck,
        { label: 'قسط معوق ندارد', ok: overdue.length === 0, value: overdue.length ? `${faDigits(overdue.length)} قسط` : '—' },
      ];
      break;
    }
    case 'cash_withdrawal': {
      const pkgs = packages(orgId).filter((x) => x.sentAt && x.recipients.some((y) => y.employeeId === e.id && y.status === 'accepted'));
      const src = pkgs.find((x) => x.cashAllowed) ?? pkgs[0];
      const bank = ud?.bankAccounts.find((b) => b.isDefault);
      const rialFree = freeOf('rial');
      base.source = `کیف پول ریالی · ${src?.title ?? '—'}`;
      base.sourceColor = DOT.rial;
      base.details = [
        { label: 'حساب مقصد', value: bank ? `${bank.bankName} •••• ${faDigits(bank.iban.slice(-4))}` : profile(e.id).bank },
        { label: 'بسته مبدأ', value: src?.title ?? '—' },
        { label: 'زمان تسویه', value: 'پایا · امروز ۱۸:۰۰' },
      ];
      base.checks = [
        { label: 'برداشت نقدی بسته مجاز', ok: !!src?.cashAllowed, value: src?.cashAllowed ? 'مجاز' : 'غیرمجاز' },
        { label: 'موجودی آزاد (قابل برداشت)', ok: rialFree >= amount, value: money(rialFree) },
        { label: 'سقف برداشت ماهانه', ok: true, value: '۲۵٪' },
      ];
      break;
    }
    case 'milestone_release': {
      const pkg = packages(orgId).find((x) => x.lockPolicy.type === 'milestone' && x.recipients.some((y) => y.employeeId === e.id));
      const steps = pkg?.milestoneProgress ?? [];
      const pending = steps.find((s) => s.status === 'pending_approval');
      const titleStep = steps.find((s) => r.title.includes(s.title));
      const step = r.status === 'pending' ? pending ?? titleStep : titleStep ?? pending;
      const idx = step ? steps.indexOf(step) + 1 : 0;
      const lock = ud?.holdings.flatMap((h) => h.locks).find((l) => l.type === 'milestone' && l.sourceId === pkg?.id);
      const total = lock?.contractTotal ?? pkg?.recipients.find((y) => y.employeeId === e.id)?.amount ?? 0;
      const share = step?.sharePct ?? 0;
      const stepAmount = r.amount ?? Math.round((total * share) / 100);
      const releasedPct = steps.filter((s) => s.status === 'released').reduce((s, x) => s + x.sharePct, 0);
      const lockedNow = lock ? lock.amount : Math.round((total * (100 - releasedPct)) / 100);
      const lockedAfter = r.status === 'pending' ? Math.max(0, lockedNow - stepAmount) : lockedNow;
      const kind: AssetKind = lock?.holdingKind ?? (pkg?.fixedSplit && pkg.fixedSplit.fixed > pkg.fixedSplit.gold ? 'fixed' : 'gold');
      const prevReleased = steps.slice(0, Math.max(0, idx - 1)).every((s) => s.status === 'released');
      const releasedN = steps.filter((s) => s.status === 'released').length;
      base.source = `${fundName(kind)} · آزادسازی ${pct(share)}`;
      base.sourceColor = DOT[kind] ?? 'var(--chart-1)';
      base.details = [
        { label: 'قرارداد', value: pkg?.title ?? '—' },
        { label: 'مرحله', value: step ? `${faDigits(idx)} از ${faDigits(steps.length)} · ${step.title}` : '—' },
        { label: 'قفل باقی‌مانده پس از تأیید', value: `${money(lockedAfter)} تومان` },
      ];
      base.checks = [
        { label: 'گزارش انجام تعهد ثبت شد', ok: true, value: `${jDayMonth(r.createdAt)} · ${faDigits(meta.files ?? 1)} فایل` },
        { label: 'تأیید مدیر پروژه', ok: meta.managerOk ?? false, value: meta.managerOk ? meta.manager ?? 'تأیید شد' : 'در انتظار' },
        { label: 'مراحل قبلی آزاد شده', ok: prevReleased, value: `${faDigits(releasedN)} از ${faDigits(steps.length)}` },
      ];
      if (pkg) base.milestone = { packageId: pkg.id, packageTitle: pkg.title, steps: steps.map((s) => ({ ...s })), stepIndex: idx, stepCount: steps.length, sharePct: share, amount: stepAmount, lockedAfter, holdingName: fundName(kind) };
      break;
    }
    case 'installment': {
      const months = meta.months ?? 6;
      const cap = Math.round(f.free * 0.3);
      base.source = `وثیقه اقساطی · ${fundName(bestFund)}`;
      base.sourceColor = DOT[bestFund];
      base.details = [
        { label: 'فروشگاه', value: meta.store ?? '—' },
        { label: 'تعداد اقساط', value: `${faDigits(months)} قسط` },
        { label: 'قسط ماهانه', value: `${money(Math.round(amount / months))} تومان` },
      ];
      base.checks = [
        { label: 'سقف ۳۰٪ دارایی آزاد', ok: amount <= cap, value: ratio(amount, f.free) },
        scoreCheck,
        { label: 'قسط معوق ندارد', ok: overdue.length === 0, value: overdue.length ? `${faDigits(overdue.length)} قسط` : '—' },
      ];
      break;
    }
    default: {
      base.source = 'اطلاعات حساب';
      base.details = [
        { label: 'نوع تغییر', value: r.title },
        { label: 'روش تأیید', value: 'شاهکار + کد یک‌بارمصرف' },
      ];
      base.checks = [
        { label: 'تطابق شاهکار (موبایل ↔ کد ملی)', ok: true, value: 'تأیید' },
        { label: 'احراز هویت', ok: f.kycLevel >= 2, value: f.kycLevel ? `سطح ${faDigits(f.kycLevel)}` : '—' },
      ];
    }
  }
  return base;
}

function createEmployee(orgId: string, b: Partial<Employee> & { email?: string; role?: string; cardLimitPct?: number }): Employee | { status: number; code: string; message: string } {
  const fullName = (b.fullName ?? '').trim();
  const nationalId = normDigits(b.nationalId ?? '');
  const mobile = normDigits(b.mobile ?? '');
  const code = normDigits(b.employeeCode ?? '');
  if (!fullName || !nationalId || !mobile) return { status: 422, code: 'missing_fields', message: 'نام، کد ملی و موبایل الزامی است.' };
  if (!/^\d{10}$/.test(nationalId)) return { status: 422, code: 'bad_national_id', message: 'کد ملی باید ۱۰ رقم باشد.' };
  if (!/^09\d{9}$/.test(mobile)) return { status: 422, code: 'bad_mobile', message: 'شماره موبایل معتبر نیست.' };
  const list = employees(orgId);
  if (list.some((e) => e.nationalId === nationalId)) return { status: 409, code: 'duplicate', message: 'کارمندی با این کد ملی وجود دارد.' };
  if (code && list.some((e) => e.employeeCode === code)) return { status: 409, code: 'duplicate_code', message: 'این کد پرسنلی قبلاً ثبت شده است.' };
  const e: Employee = {
    id: newId('u'), fullName, nationalId, mobile, employeeCode: code || String(1080 + list.length), department: b.department || 'عمومی', jobTitle: b.jobTitle ?? '',
    status: 'invited', joinedAt: b.joinedAt || nowIso(), totalReceived: 0, portfolioValue: 0, lockedValue: 0, avatarLetter: fullName[0],
  };
  list.unshift(e);
  orgById(orgId).employees += 1;
  store().profiles[e.id] = { ...BLANK, email: b.email ?? '', role: b.role ?? 'کارمند', cardLimit: 0 };
  return e;
}

// ───────────── handlers ─────────────
export const orgPeopleHandlers: HttpHandler[] = [
  // Pass-through for every org GET: refresh the HR record of employees with an app account
  // (portfolio / locked change when they trade, take loans or a milestone is released).
  http.get(p('/org/*'), ({ request }) => {
    const orgId = orgOf(request);
    for (const e of employees(orgId)) { const ud = db().users[e.id]; if (ud) syncRegistered(e, ud); }
    return undefined;
  }),

  http.get(p('/org/people/facts'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const out: Record<string, EmpFacts> = {};
    for (const e of employees(id)) out[e.id] = factsOf(id, e);
    return ok(out);
  }),

  http.get(p('/org/people/employees/:id'), async ({ request, params }) => {
    await latency();
    const orgId = orgOf(request);
    const e = employees(orgId).find((x) => x.id === params.id);
    if (!e) return fail(404, 'not_found', 'کارمند پیدا نشد.');
    const pr = profile(e.id);
    const { holdings, loans, registered, ud } = holdingsOf(e);
    const facts = factsOf(orgId, e);
    const lastActiveAt = pr.lastActiveMin >= 0 ? minutesAgo(pr.lastActiveMin) : undefined;
    const splits: Record<string, AllocationSplit> = {};
    packages(orgId).forEach((x) => { const s = splitOf(x, e, ud); if (s) splits[x.id] = s; });
    const card = ud?.card
      ? { creditLimit: ud.card.creditLimit, creditUsed: ud.card.creditUsed, statementDue: ud.card.statementDue, status: ud.card.status, overdue: 0 }
      : pr.cardLimit ? { creditLimit: pr.cardLimit, creditUsed: pr.cardUsed, statementDue: jalaliToIso(1405, 8, 30), status: 'active' as const, overdue: 0 } : undefined;
    const res: EmpDetailExtra = {
      facts, registered, email: pr.email, role: pr.role, lastActiveAt, holdings, loans, card, packageSplits: splits,
      activity: activityOf(orgId, e, ud, loans, lastActiveAt),
      todayChange: holdings.filter((h) => h.kind !== 'rial').reduce((s, h) => s + h.change, 0),
    };
    return ok(res);
  }),

  http.get(p('/org/people/insights'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const alloc = { gold: 0, fixed: 0, other: 0 };
    for (const e of employees(orgId)) {
      for (const h of holdingsOf(e).holdings) {
        if (h.kind === 'gold') alloc.gold += h.value;
        else if (h.kind === 'fixed') alloc.fixed += h.value;
        else alloc.other += h.value;
      }
    }
    const cur = jp(now());
    const prev = addMonths(cur.y, cur.m, -1);
    const sent = packages(orgId).filter((x) => x.status !== 'draft' && x.status !== 'cancelled' && x.sentAt);
    let count = 0;
    let amount = 0;
    for (const x of packages(orgId)) {
      for (const s of x.milestoneProgress ?? []) {
        if (s.status !== 'pending_approval') continue;
        count += 1;
        amount += Math.round((x.total * s.sharePct) / 100);
      }
    }
    const res: PeopleInsights = {
      allocation: alloc,
      sentThisMonth: sent.filter((x) => sameMonth(x.sentAt!, cur.y, cur.m)).reduce((s, x) => s + x.total, 0),
      sentLastMonth: sent.filter((x) => sameMonth(x.sentAt!, prev.y, prev.m)).reduce((s, x) => s + x.total, 0),
      thisMonthName: JALALI_MONTHS[cur.m - 1],
      lastMonthName: JALALI_MONTHS[prev.m - 1],
      newEmployees30d: employees(orgId).filter((e) => now().getTime() - new Date(e.joinedAt).getTime() <= 30 * 86400000).length,
      milestones: { count, amount },
    };
    return ok(res);
  }),

  http.get(p('/org/people/credit'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const cur = jp(now());
    const months = Array.from({ length: 6 }, (_, i) => addMonths(cur.y, cur.m, i));
    const schedule = months.map((m) => ({ month: JALALI_MONTHS[m.m - 1], loan: 0, installment: 0, y: m.y, m: m.m }));
    const rows: CreditLoanRow[] = [];
    const cards = { count: 0, limitTotal: 0 };
    const overdue = { count: 0, employees: 0, amount: 0 };
    for (const e of employees(orgId)) {
      if (e.status === 'invited') continue;
      const { loans, ud } = holdingsOf(e);
      const f = factsOf(orgId, e);
      if (f.cardLimit > 0) { cards.count += 1; cards.limitTotal += f.cardLimit; }
      const od = overdueOf(loans);
      if (od.length) { overdue.count += od.length; overdue.employees += 1; overdue.amount += od.reduce((s, i) => s + i.amount, 0); }
      for (const l of loans.filter((x) => x.status === 'active')) {
        const unpaid = l.installments.filter((i) => i.status !== 'paid');
        const next = unpaid[0];
        const paid = l.installments.length - unpaid.length;
        const remaining = unpaid.reduce((s, i) => s + i.amount, 0);
        const soon = next ? new Date(next.dueDate).getTime() - now().getTime() <= 3 * 86400000 : false;
        rows.push({
          employeeId: e.id, name: e.fullName, department: e.department, principal: l.principal, remaining, paidPct: Math.round((paid / l.months) * 100),
          nextAmount: next?.amount ?? 0, nextDate: next?.dueDate, collateralKind: l.collateral.holdingKind, collateralAmount: l.collateral.amount,
          status: unpaid.some((i) => i.status === 'overdue') ? 'late' : soon ? 'due' : 'ok', overdueCount: unpaid.filter((i) => i.status === 'overdue').length, startedAt: l.startedAt,
        });
        for (const i of unpaid) {
          const d = jp(i.dueDate);
          const slot = schedule.find((s) => s.y === d.y && s.m === d.m) ?? (i.status === 'overdue' ? schedule[0] : undefined);
          if (slot) slot.loan += i.amount;
        }
      }
      for (const inst of ud?.installments ?? []) {
        const start = jp(inst.createdAt);
        for (let k = inst.paidCount + 1; k <= inst.months; k++) {
          const d = addMonths(start.y, start.m, k);
          const slot = schedule.find((s) => s.y === d.y && s.m === d.m);
          if (slot) slot.installment += inst.monthly;
        }
      }
    }
    const res: PeopleCredit = {
      loans: rows.sort((a, b) => (a.status === 'late' ? -1 : 0) - (b.status === 'late' ? -1 : 0) || b.principal - a.principal),
      schedule: schedule.map(({ month, loan, installment }) => ({ month, loan, installment })),
      cards, overdue,
      newLoansThisMonth: rows.filter((r) => sameMonth(r.startedAt, cur.y, cur.m)).length,
      pendingLoanRequests: db().requests.filter((r) => r.orgId === orgId && r.kind === 'loan' && r.status === 'pending').length,
      principalTotal: rows.reduce((s, r) => s + r.principal, 0),
    };
    return ok(res);
  }),

  http.get(p('/org/people/requests'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const list = db().requests.filter((r) => r.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const decided = list.filter((r) => r.decidedAt);
    const avg = decided.length ? decided.reduce((s, r) => s + (new Date(r.decidedAt!).getTime() - new Date(r.createdAt).getTime()), 0) / decided.length / 86400000 : null;
    return ok({ items: list.map(enrich), avgResponseDays: avg === null ? null : Math.round(avg * 10) / 10 });
  }),

  http.post(p('/org/people/requests/:id/reopen'), async ({ request, params }) => {
    await latency();
    const orgId = orgOf(request);
    const r = db().requests.find((x) => x.id === params.id && x.orgId === orgId);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    if (r.status === 'pending') return ok(r);
    if (r.kind === 'milestone_release' && r.status === 'approved') return fail(409, 'irreversible', 'مبلغ این مرحله آزاد شده و قابل بازگشت نیست.');
    r.status = 'pending';
    delete r.decidedAt;
    delete r.decidedBy;
    return ok(r);
  }),

  http.post(p('/org/people/employees/import'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const b = await body<{ rows: ImportRow[]; sendSms: boolean }>(request);
    const created: Employee[] = [];
    const errors: { row: number; message: string }[] = [];
    (b.rows ?? []).forEach((row, i) => {
      if (!row.employeeCode?.trim()) { errors.push({ row: i + 1, message: 'کد پرسنلی الزامی است.' }); return; }
      const res = createEmployee(orgId, { ...row });
      if ('id' in res) created.push(res);
      else errors.push({ row: i + 1, message: res.message });
    });
    return ok({ created, errors }, { status: created.length ? 201 : 200 });
  }),

  http.post(p('/org/people/employees/status'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const b = await body<{ ids: string[]; status: Employee['status'] }>(request);
    if (!['active', 'invited', 'inactive'].includes(b.status)) return fail(422, 'bad_status', 'وضعیت نامعتبر است.');
    let updated = 0;
    for (const e of employees(orgId)) if (b.ids?.includes(e.id)) { e.status = b.status; updated += 1; }
    return ok({ updated });
  }),

  // Override of the core create endpoint: honours joinedAt / e-mail / role and validates the national id, mobile and code.
  http.post(p('/org/employees'), async ({ request }) => {
    await latency();
    const orgId = orgOf(request);
    const b = await body<Partial<Employee> & { email?: string; role?: string; cardLimitPct?: number; sendSms?: boolean }>(request);
    const res = createEmployee(orgId, b);
    if (!('id' in res)) return fail(res.status, res.code, res.message);
    return ok(res, { status: 201 });
  }),

  // Pass-through: tell the employee about a decision, then let the core handler record it.
  http.post(p('/org/requests/:id/decision'), async ({ request, params }) => {
    const r = db().requests.find((x) => x.id === params.id);
    if (!r || r.kind === 'milestone_release' || r.status !== 'pending') return undefined;
    const ud = db().users[r.requesterId];
    if (!ud) return undefined;
    const b = await body<{ approve: boolean; note?: string }>(request.clone());
    const what = r.title.split(' · ')[0];
    ledger.notify(ud, {
      title: b.approve ? `${what} تأیید شد` : `${what} رد شد`,
      body: b.note ? `${orgById(r.orgId).name}: ${b.note}` : b.approve ? `تأیید توسط ${orgById(r.orgId).name}` : `برای جزئیات با منابع انسانی ${orgById(r.orgId).name} تماس بگیرید`,
      tone: b.approve ? 'success' : 'error', icon: b.approve ? 'check' : 'close', href: r.kind === 'loan' || r.kind === 'credit_increase' ? '/app/credit' : '/app/notifications',
    });
    return undefined;
  }),
];
