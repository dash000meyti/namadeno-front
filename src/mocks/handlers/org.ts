/** Organization (HR) panel endpoints (/org/*). */
import { http } from 'msw';
import type { ApprovalRequest, Employee, InboxPackage, LockPolicy, MilestoneStep, OrgPackage } from '@/types/domain';
import { db, fund, newId, recalcHoldings, save, type UserData } from '../db';
import { body, fail, latency, ok, p, qs, who } from '../http';
import { now } from '@/lib/clock';
import { faDigits, money } from '@/lib/format';
import { DEFAULT_UNIT, isOrgRequest } from '@/lib/org';
import { ledger } from './app';

const nowIso = () => now().toISOString();
const orgOf = (req: Request) => who(req, 'org_admin').orgId!;
const org = (id: string) => db().organizations.find((o) => o.id === id)!;
const employees = (orgId: string) => (db().employees[orgId] ??= []);
const packages = (orgId: string) => (db().orgPackages[orgId] ??= []);

/** Pushes a sent package into each recipient's app inbox (only registered app users exist in the mock). */
function deliver(pkg: OrgPackage, orgId: string) {
  for (const r of pkg.recipients) {
    const ud = db().users[r.employeeId];
    if (!ud || ud.inbox.some((i) => i.packageId === pkg.id)) continue;
    const item: InboxPackage = {
      id: newId('in'), packageId: pkg.id, title: pkg.title, reason: pkg.reason, orgId, orgName: org(orgId).name, amount: r.amount,
      message: pkg.message, sentAt: pkg.sentAt!, expiresAt: pkg.expiresAt, allocationMode: pkg.allocationMode, fixedSplit: pkg.fixedSplit,
      cashAllowed: pkg.cashAllowed, lockPolicy: pkg.lockPolicy, status: 'pending',
    };
    ud.inbox.unshift(item);
    ledger.notify(ud, { title: 'بسته جدید: ' + pkg.title, body: `${money(r.amount)} تومان از ${org(orgId).name} · منتظر تأیید شما`, tone: 'primary', icon: 'inbox', href: '/app/inbox' });
  }
}

type MsStepInput = Extract<LockPolicy, { type: 'milestone' }>['steps'][number];
const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : NaN);

/**
 * Checks the due dates of milestone steps (create / draft PATCH): every step needs a valid due date, in the future,
 * not before the previous step's. Returns the error message or null.
 */
export function milestoneDueError(steps: MsStepInput[]): string | null {
  if (steps.some((s) => !Number.isFinite(timeOf(s.dueDate)))) return 'سررسید همه‌ی مراحل الزامی است.';
  if (steps.some((s) => timeOf(s.dueDate) <= now().getTime())) return 'سررسید مراحل باید در آینده باشد.';
  if (steps.some((s, i) => i > 0 && timeOf(s.dueDate) < timeOf(steps[i - 1].dueDate))) return 'سررسید هر مرحله باید هم‌زمان یا پس از مرحله‌ی قبل باشد.';
  return null;
}

/** Progress of a new milestone package: the first step is current, the rest are future. Missing `requiresApproval` = true. */
export function buildProgress(steps: MsStepInput[]): MilestoneStep[] {
  return steps.map((s, i): MilestoneStep => ({
    id: `ms-${i + 1}`, title: s.title, sharePct: s.sharePct, dueDate: s.dueDate, requiresApproval: s.requiresApproval !== false,
    status: i === 0 ? 'pending_approval' : 'future',
  }));
}

/** Does a milestone_release request belong to this package step? Older requests without ids match by requester. */
function isStepRequest(r: ApprovalRequest, pkg: OrgPackage, step: MilestoneStep) {
  if (r.kind !== 'milestone_release' || !pkg.recipients.some((x) => x.employeeId === r.requesterId)) return false;
  if (!r.packageId) return true;
  return r.packageId === pkg.id && (!r.stepId || r.stepId === step.id);
}

/** Name recorded on requests closed by the automatic due-date release. */
export const AUTO_DECIDER = 'سامانه';
/** A step that is neither released nor reclaimed. */
export const isOpenStep = (s: MilestoneStep) => s.status === 'pending_approval' || s.status === 'future';
/** After a step is settled (released or reclaimed) the next future step becomes current. */
function advance(pkg: OrgPackage) {
  const next = pkg.milestoneProgress!.find((s) => s.status === 'future');
  if (next && !pkg.milestoneProgress!.some((s) => s.status === 'pending_approval')) next.status = 'pending_approval';
}
const employeeLock = (ud: UserData, pkgId: string) =>
  ud.holdings.flatMap((h) => h.locks).find((l) => l.type === 'milestone' && l.sourceId === pkgId);

/**
 * Releases a milestone step: its share leaves the employees' milestone lock (ledger tx + notification), the next
 * step becomes current and every pending request for this step is closed as approved.
 */
export function releaseStep(pkg: OrgPackage, stepId: string, decidedBy = 'نیما رضایی') {
  const step = pkg.milestoneProgress?.find((s) => s.id === stepId);
  if (!step || !isOpenStep(step)) return null;
  const auto = decidedBy === AUTO_DECIDER;
  step.status = 'released';
  step.releasedAt = nowIso();
  advance(pkg);
  for (const r of pkg.recipients) {
    const ud = db().users[r.employeeId];
    if (!ud) continue;
    const lock = employeeLock(ud, pkg.id);
    if (!lock) continue;
    const total = lock.contractTotal ?? r.amount;
    const amt = Math.round((total * step.sharePct) / 100);
    lock.amount = Math.max(0, lock.amount - amt);
    lock.steps = pkg.milestoneProgress!.map((s) => ({ ...s }));
    if (lock.amount === 0) for (const h of ud.holdings) h.locks = h.locks.filter((l) => l.id !== lock.id);
    recalcHoldings(ud);
    const idx = pkg.milestoneProgress!.indexOf(step) + 1;
    const n = pkg.milestoneProgress!.length;
    ledger.addTx(ud, { category: 'lock', title: `آزادسازی مرحله ${idx} ${pkg.title}`, subtitle: `مرحله ${idx} از ${n}`, amount: amt, holdingKind: lock.holdingKind, lockType: 'milestone', lockEvent: 'released' });
    ledger.notify(ud, { title: `${money(amt)} تومان از ${pkg.title} آزاد شد`, body: auto ? `مرحله ${idx} «${step.title}» در سررسید آزاد شد` : `مرحله ${idx} «${step.title}» تأیید شد`, tone: 'success', icon: 'unlock', href: '/app/history' });
  }
  for (const rq of db().requests) {
    if (rq.status !== 'pending' || !isStepRequest(rq, pkg, step)) continue;
    rq.status = 'approved';
    rq.decidedAt = nowIso();
    rq.decidedBy = decidedBy;
  }
  return step;
}

/**
 * Reclaims a milestone step («بازپس‌گیری»): the organization decided not to pay it. For every recipient with an app
 * account the step's share leaves the milestone reservation AND the holding (units / value), with a ledger entry and
 * a calm notification carrying the organization's note. The amount goes back to the organization's budget, pending
 * requests for the step become 'rejected' with the note, and the next step becomes current. Irreversible.
 */
export function reclaimStep(orgId: string, pkg: OrgPackage, step: MilestoneStep, note: string, decidedBy = 'نیما رضایی') {
  if (!isOpenStep(step)) return null;
  const o = org(orgId);
  const steps = pkg.milestoneProgress!;
  const idx = steps.indexOf(step) + 1;
  step.status = 'reclaimed';
  step.reclaimedAt = nowIso();
  step.reclaimNote = note;
  advance(pkg);
  let back = 0;
  for (const r of pkg.recipients) {
    back += Math.round((r.amount * step.sharePct) / 100);
    const ud = db().users[r.employeeId];
    if (!ud) continue;
    const lock = employeeLock(ud, pkg.id);
    if (!lock) continue;
    const amt = Math.round(((lock.contractTotal ?? r.amount) * step.sharePct) / 100);
    const h = ud.holdings.find((x) => x.locks.includes(lock));
    lock.amount = Math.max(0, lock.amount - amt);
    lock.steps = steps.map((s) => ({ ...s }));
    // the asset itself leaves the employee (not only the reservation)
    if (h?.fundId) h.units = Math.max(0, (h.units ?? 0) - amt / fund(h.fundId).nav);
    else if (h) h.value = Math.max(0, h.value - amt);
    if (lock.amount === 0) for (const x of ud.holdings) x.locks = x.locks.filter((l) => l.id !== lock.id);
    recalcHoldings(ud);
    ledger.addTx(ud, { category: 'lock', title: `بازپس‌گیری مرحله ${faDigits(idx)} ${pkg.title}`, subtitle: `مرحله ${faDigits(idx)} از ${faDigits(steps.length)} · به ${o.name} برگشت`, amount: -amt, holdingKind: lock.holdingKind, lockType: 'milestone', details: [{ label: 'توضیح سازمان', value: note }] });
    ledger.notify(ud, { title: `سهم مرحله‌ی ${faDigits(idx)} «${step.title}» بازپس گرفته شد`, body: `${o.name}: ${note} · ${money(amt)} تومان`, tone: 'default', icon: 'flag', href: '/app/history' });
  }
  o.budgetUsed = Math.max(0, o.budgetUsed - back);
  for (const rq of db().requests) {
    if (rq.status !== 'pending' || !isStepRequest(rq, pkg, step)) continue;
    rq.status = 'rejected';
    rq.note = note;
    rq.decidedAt = nowIso();
    rq.decidedBy = decidedBy;
  }
  return step;
}

/** Next free request id («RQ-3113»). */
function nextRequestId() {
  const max = db().requests.reduce((m, r) => Math.max(m, Number(/^RQ-(\d+)$/.exec(r.id)?.[1] ?? 0)), 0);
  return `RQ-${max + 1}`;
}

/**
 * Due-date processing of milestone steps (simple mock version — the real backend runs this on a schedule).
 * For every sent milestone package with at least one accepted recipient, the first not-released step is checked:
 * - due date not reached → nothing happens;
 * - `requiresApproval: false` → released automatically, then the next step is checked;
 * - approval needed → a pending `milestone_release` request is opened for each accepted recipient (once per step).
 * Idempotent: safe to run on every request.
 */
export function processDueMilestones() {
  const t = now().getTime();
  let changed = false;
  for (const [orgId, list] of Object.entries(db().orgPackages)) {
    for (const pkg of list) {
      const steps = pkg.milestoneProgress;
      if (pkg.status !== 'sent' || pkg.lockPolicy.type !== 'milestone' || !steps?.length) continue;
      const accepted = pkg.recipients.filter((r) => r.status === 'accepted');
      if (!accepted.length) continue; // the contract starts when the employee accepts it
      for (let guard = 0; guard < steps.length; guard += 1) {
        const step = steps.find(isOpenStep);
        if (!step || !(timeOf(step.dueDate) <= t)) break;
        if (step.requiresApproval === false) {
          releaseStep(pkg, step.id, AUTO_DECIDER);
          changed = true;
          continue;
        }
        const idx = steps.indexOf(step) + 1;
        const o = org(orgId);
        for (const r of accepted) {
          // one request per step and recipient: an existing one (any status) is never duplicated
          const exists = db().requests.some((q) => q.kind === 'milestone_release' && q.requesterId === r.employeeId
            && (q.packageId ? q.packageId === pkg.id && (!q.stepId ? q.status === 'pending' : q.stepId === step.id) : q.status === 'pending'));
          if (exists) continue;
          db().requests.unshift({
            id: nextRequestId(), kind: 'milestone_release', title: `آزادسازی مرحله ${faDigits(idx)} «${step.title}»`,
            requesterId: r.employeeId, requesterName: r.name, orgId, orgName: o.name, amount: Math.round((r.amount * step.sharePct) / 100),
            createdAt: step.dueDate!, status: 'pending', note: 'سررسید این مرحله رسیده است.', packageId: pkg.id, stepId: step.id, trigger: 'due_date',
          });
          changed = true;
        }
        break;
      }
    }
  }
  if (changed) save();
}

export const orgHandlers = [
  http.get(p('/org/me'), async ({ request }) => {
    await latency();
    const s = who(request, 'org_admin');
    const o = org(s.orgId!);
    const admin = o.admins.find((a) => a.id === s.userId) ?? o.admins[0];
    return ok({ organization: o, admin });
  }),

  http.get(p('/org/dashboard'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const emps = employees(id);
    const pk = packages(id);
    const pendingReq = db().requests.filter((r) => r.orgId === id && r.status === 'pending' && isOrgRequest(r));
    const sent = pk.filter((x) => x.status !== 'draft');
    const totalSent = sent.reduce((s, x) => s + x.total, 0);
    const awaiting = sent.flatMap((x) => x.recipients).filter((r) => r.status === 'pending').length;
    const assets = emps.reduce((s, e) => s + e.portfolioValue, 0);
    const locked = emps.reduce((s, e) => s + e.lockedValue, 0);
    return ok({
      organization: org(id),
      kpis: { employees: emps.length, activeEmployees: emps.filter((e) => e.status === 'active').length, totalSent, awaitingAcceptance: awaiting, employeeAssets: assets, lockedAssets: locked, pendingRequests: pendingReq.length },
      recentPackages: pk.slice(0, 5),
      pendingRequests: pendingReq.slice(0, 5),
      monthly: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'].map((m, i) => ({ month: m, sent: [2.6, 0.4, 0.9, 7.2, 1.8, 5.4, 9.1, 2.3][i] * 1e9 })),
    });
  }),

  // employees
  http.get(p('/org/employees'), async ({ request }) => {
    await latency();
    const q = qs(request);
    const text = q.get('q') ?? '';
    const status = q.get('status');
    const dept = q.get('department');
    let list = employees(orgOf(request));
    if (text) list = list.filter((e) => e.fullName.includes(text) || e.employeeCode.includes(text) || e.nationalId.includes(text));
    if (status && status !== 'all') list = list.filter((e) => e.status === status);
    if (dept && dept !== 'all') list = list.filter((e) => e.department === dept);
    return ok(list);
  }),
  http.get(p('/org/employees/:id'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const e = employees(id).find((x) => x.id === params.id);
    if (!e) return fail(404, 'not_found', 'کارمند پیدا نشد.');
    const pk = packages(id).filter((x) => x.recipients.some((r) => r.employeeId === e.id));
    const ud = db().users[e.id];
    const holdings = ud ? (recalcHoldings(ud), ud.holdings) : undefined;
    const requests = db().requests.filter((r) => r.requesterId === e.id && isOrgRequest(r));
    return ok({ employee: e, packages: pk, holdings, requests, loans: ud?.loans ?? [] });
  }),
  http.post(p('/org/employees'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const b = await body<Partial<Employee>>(request);
    if (!b.nationalId) return fail(422, 'missing_fields', 'کد ملی الزامی است.');
    if (employees(id).some((e) => e.nationalId === b.nationalId)) return fail(409, 'duplicate', 'کارمندی با این کد ملی وجود دارد.');
    const e: Employee = {
      id: newId('u'), fullName: b.fullName || b.nationalId, nationalId: b.nationalId, mobile: b.mobile ?? '', employeeCode: b.employeeCode ?? String(1080 + employees(id).length),
      department: b.department?.trim() || DEFAULT_UNIT, jobTitle: b.jobTitle ?? '', status: 'invited', joinedAt: nowIso(), totalReceived: 0, portfolioValue: 0, lockedValue: 0, avatarLetter: (b.fullName || 'ک')[0],
    };
    employees(id).unshift(e);
    org(id).employees += 1;
    return ok(e, { status: 201 });
  }),
  http.patch(p('/org/employees/:id'), async ({ request, params }) => {
    await latency();
    const e = employees(orgOf(request)).find((x) => x.id === params.id);
    if (!e) return fail(404, 'not_found', 'کارمند پیدا نشد.');
    const b = await body<Partial<Employee>>(request);
    if (b.department !== undefined && !b.department.trim()) b.department = DEFAULT_UNIT; // never without a unit
    Object.assign(e, b);
    return ok(e);
  }),

  // packages
  http.get(p('/org/packages'), async ({ request }) => {
    await latency();
    const status = qs(request).get('status');
    const list = packages(orgOf(request)).filter((x) => !status || status === 'all' || x.status === status);
    return ok(list);
  }),
  http.get(p('/org/packages/:id'), async ({ request, params }) => {
    await latency();
    const x = packages(orgOf(request)).find((i) => i.id === params.id);
    return x ? ok(x) : fail(404, 'not_found', 'بسته پیدا نشد.');
  }),
  http.post(p('/org/packages'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const b = await body<Partial<OrgPackage> & { recipientIds?: string[]; recipientAmounts?: Record<string, number> }>(request);
    const amounts = b.recipientAmounts;
    if (amounts && Object.values(amounts).some((v) => !Number.isFinite(v) || v <= 0)) return fail(422, 'bad_amount', 'مبلغ هر نفر معتبر نیست.');
    const per = amounts ? 0 : b.amountPerPerson ?? 0;
    const ids = b.recipientIds ?? (amounts ? Object.keys(amounts) : []);
    const recipients = ids.map((eid) => ({ employeeId: eid, name: employees(id).find((e) => e.id === eid)?.fullName ?? eid, amount: amounts ? amounts[eid] ?? 0 : per, status: 'pending' as const }));
    const pkg: OrgPackage = {
      id: newId('pkg'), title: b.title || 'بسته جدید', reason: b.reason ?? 'bonus', createdAt: nowIso(), status: 'draft',
      recipients, amountSource: amounts ? 'file' : 'uniform',
      amountPerPerson: per, total: recipients.reduce((s, r) => s + r.amount, 0), allocationMode: b.allocationMode ?? 'free', fixedSplit: b.fixedSplit, cashAllowed: !!b.cashAllowed,
      lockPolicy: b.lockPolicy ?? { type: 'none' }, message: b.message, expiresAt: b.expiresAt,
    };
    if (pkg.lockPolicy.type === 'milestone') {
      const sum = pkg.lockPolicy.steps.reduce((s, x) => s + x.sharePct, 0);
      if (sum !== 100) return fail(422, 'bad_steps', 'جمع درصد مراحل باید ۱۰۰٪ باشد.');
      const dueErr = milestoneDueError(pkg.lockPolicy.steps);
      if (dueErr) return fail(422, 'bad_steps', dueErr);
      pkg.milestoneProgress = buildProgress(pkg.lockPolicy.steps);
    }
    packages(id).unshift(pkg);
    return ok(pkg, { status: 201 });
  }),
  http.patch(p('/org/packages/:id'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'draft') return fail(409, 'not_draft', 'فقط پیش‌نویس قابل ویرایش است.');
    const b = await body<Partial<OrgPackage> & { recipientIds?: string[] }>(request);
    Object.assign(pkg, b);
    if (b.recipientIds) pkg.recipients = b.recipientIds.map((eid) => ({ employeeId: eid, name: employees(id).find((e) => e.id === eid)?.fullName ?? eid, amount: pkg.amountPerPerson, status: 'pending' as const }));
    pkg.recipients.forEach((r) => { r.amount = pkg.amountPerPerson; });
    pkg.total = pkg.amountPerPerson * pkg.recipients.length;
    return ok(pkg);
  }),
  http.post(p('/org/packages/:id/send'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'draft') return fail(409, 'already_sent', 'این بسته قبلاً ارسال شده است.');
    if (!pkg.recipients.length) return fail(422, 'no_recipients', 'حداقل یک گیرنده انتخاب کنید.');
    const o = org(id);
    if (o.budgetUsed + pkg.total > o.budgetYear) return fail(422, 'over_budget', 'مبلغ بسته از بودجه باقی‌مانده سازمان بیشتر است.');
    pkg.status = 'sent';
    pkg.sentAt = nowIso();
    o.budgetUsed += pkg.total;
    deliver(pkg, id);
    return ok(pkg);
  }),
  http.post(p('/org/packages/:id/cancel'), async ({ request, params }) => {
    await latency();
    const pkg = packages(orgOf(request)).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    pkg.status = 'cancelled';
    return ok(pkg);
  }),
  http.post(p('/org/packages/:id/milestones/:stepId/release'), async ({ request, params }) => {
    await latency();
    const pkg = packages(orgOf(request)).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.milestoneProgress?.find((s) => s.id === params.stepId)?.status === 'reclaimed') return fail(409, 'already_reclaimed', 'این مرحله بازپس گرفته شده است.');
    // releaseStep also closes the pending requests of this step
    const step = releaseStep(pkg, String(params.stepId));
    if (!step) return fail(409, 'already_released', 'این مرحله قبلاً آزاد شده است.');
    return ok(pkg);
  }),

  // requests
  http.get(p('/org/requests'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const status = qs(request).get('status');
    // only the kinds the organization approves; the rest live in the operator console
    return ok(db().requests.filter((r) => r.orgId === id && isOrgRequest(r) && (!status || status === 'all' || r.status === status)));
  }),
  http.post(p('/org/requests/:id/decision'), async ({ request, params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    const b = await body<{ approve: boolean; note?: string }>(request);
    if (r.kind === 'milestone_release' && !b.approve) {
      // a milestone step is never just «rejected»: it is reclaimed (its share returns to the organization)
      const note = (b.note ?? '').trim();
      if (note.length < 3) return fail(422, 'note_required', 'توضیح بازپس‌گیری را برای کارمند بنویسید.');
      const pkg = (r.packageId ? packages(r.orgId).find((x) => x.id === r.packageId) : undefined)
        ?? packages(r.orgId).find((x) => x.lockPolicy.type === 'milestone' && x.recipients.some((y) => y.employeeId === r.requesterId));
      const step = r.stepId ? pkg?.milestoneProgress?.find((s) => s.id === r.stepId) : pkg?.milestoneProgress?.find((s) => s.status === 'pending_approval');
      if (pkg && step && isOpenStep(step)) reclaimStep(r.orgId, pkg, step, note);
      if (r.status === 'pending') { r.status = 'rejected'; r.note = note; r.decidedAt = nowIso(); r.decidedBy = 'نیما رضایی'; }
      return ok(r);
    }
    r.status = b.approve ? 'approved' : 'rejected';
    r.note = b.note ?? r.note;
    r.decidedAt = nowIso();
    r.decidedBy = 'نیما رضایی';
    if (b.approve && r.kind === 'milestone_release') {
      const pkg = (r.packageId ? packages(r.orgId).find((x) => x.id === r.packageId) : undefined)
        ?? packages(r.orgId).find((x) => x.lockPolicy.type === 'milestone' && x.recipients.some((y) => y.employeeId === r.requesterId));
      const step = (r.stepId ? pkg?.milestoneProgress?.find((s) => s.id === r.stepId && s.status !== 'released') : undefined)
        ?? (r.stepId ? undefined : pkg?.milestoneProgress?.find((s) => s.status === 'pending_approval'));
      if (pkg && step) releaseStep(pkg, step.id);
    }
    return ok(r);
  }),

  // credit overview for the organization
  http.get(p('/org/credit'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const o = org(id);
    const emps = employees(id).filter((e) => e.status === 'active');
    return ok({
      settings: o.settings,
      totals: { loansOutstanding: 412_000_000, cardCreditUsed: 186_400_000, installmentsOutstanding: 94_500_000, collateralLocked: emps.reduce((s, e) => s + e.lockedValue, 0) },
      employees: emps.map((e) => ({ id: e.id, name: e.fullName, department: e.department, portfolio: e.portfolioValue, locked: e.lockedValue, loanCap: Math.round(((e.portfolioValue - e.lockedValue) * o.settings.loanMaxPct) / 100) })),
    });
  }),

  // reports
  http.get(p('/org/reports'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const pk = packages(id).filter((x) => x.status !== 'draft');
    const byReason: Record<string, number> = {};
    pk.forEach((x) => { byReason[x.reason] = (byReason[x.reason] ?? 0) + x.total; });
    return ok({
      totalSent: pk.reduce((s, x) => s + x.total, 0),
      byReason,
      allocation: { gold: 48, fixed: 41, rial: 11 },
      lockMix: { none: 44, vesting: 38, milestone: 18 },
      acceptanceRate: 87,
      monthly: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'].map((m, i) => ({ month: m, sent: [2.6, 0.4, 0.9, 7.2, 1.8, 5.4, 9.1, 2.3][i] * 1e9, accepted: [2.5, 0.4, 0.85, 7.0, 1.7, 5.2, 7.6, 1.1][i] * 1e9 })),
    });
  }),

  // contract & settings
  http.get(p('/org/contract'), async ({ request }) => { await latency(); return ok(org(orgOf(request))); }),
  http.patch(p('/org/contract'), async ({ request }) => {
    await latency();
    const o = org(orgOf(request));
    const b = await body<Partial<typeof o>>(request);
    if (b.settings) Object.assign(o.settings, b.settings);
    if (b.admins) o.admins = b.admins;
    return ok(o);
  }),
];
