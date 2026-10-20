/** Organization (HR) panel endpoints (/org/*). */
import { http } from 'msw';
import type { Employee, InboxPackage, MilestoneStep, OrgPackage } from '@/types/domain';
import { db, newId, recalcHoldings } from '../db';
import { body, fail, latency, ok, p, qs, who } from '../http';
import { now } from '@/lib/clock';
import { money } from '@/lib/format';
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

/** Approves a milestone step: releases its share from the employee's milestone lock. */
function releaseStep(pkg: OrgPackage, stepId: string) {
  const step = pkg.milestoneProgress?.find((s) => s.id === stepId);
  if (!step || step.status === 'released') return null;
  step.status = 'released';
  step.releasedAt = nowIso();
  const next = pkg.milestoneProgress!.find((s) => s.status === 'future');
  if (next && !pkg.milestoneProgress!.some((s) => s.status === 'pending_approval')) next.status = 'pending_approval';
  for (const r of pkg.recipients) {
    const ud = db().users[r.employeeId];
    if (!ud) continue;
    const lock = ud.holdings.flatMap((h) => h.locks).find((l) => l.type === 'milestone' && l.sourceId === pkg.id);
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
    ledger.notify(ud, { title: `${money(amt)} تومان از ${pkg.title} آزاد شد`, body: `مرحله ${idx} «${step.title}» تأیید شد`, tone: 'success', icon: 'unlock', href: '/app/history' });
  }
  return step;
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
    const pendingReq = db().requests.filter((r) => r.orgId === id && r.status === 'pending');
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
    const requests = db().requests.filter((r) => r.requesterId === e.id);
    return ok({ employee: e, packages: pk, holdings, requests, loans: ud?.loans ?? [] });
  }),
  http.post(p('/org/employees'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const b = await body<Partial<Employee>>(request);
    if (!b.fullName || !b.nationalId || !b.mobile) return fail(422, 'missing_fields', 'نام، کد ملی و موبایل الزامی است.');
    if (employees(id).some((e) => e.nationalId === b.nationalId)) return fail(409, 'duplicate', 'کارمندی با این کد ملی وجود دارد.');
    const e: Employee = {
      id: newId('u'), fullName: b.fullName, nationalId: b.nationalId, mobile: b.mobile, employeeCode: b.employeeCode ?? String(1080 + employees(id).length),
      department: b.department ?? 'عمومی', jobTitle: b.jobTitle ?? '', status: 'invited', joinedAt: nowIso(), totalReceived: 0, portfolioValue: 0, lockedValue: 0, avatarLetter: b.fullName[0],
    };
    employees(id).unshift(e);
    org(id).employees += 1;
    return ok(e, { status: 201 });
  }),
  http.patch(p('/org/employees/:id'), async ({ request, params }) => {
    await latency();
    const e = employees(orgOf(request)).find((x) => x.id === params.id);
    if (!e) return fail(404, 'not_found', 'کارمند پیدا نشد.');
    Object.assign(e, await body(request));
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
    const b = await body<Partial<OrgPackage> & { recipientIds?: string[] }>(request);
    const per = b.amountPerPerson ?? 0;
    const ids = b.recipientIds ?? [];
    const pkg: OrgPackage = {
      id: newId('pkg'), title: b.title || 'بسته جدید', reason: b.reason ?? 'bonus', createdAt: nowIso(), status: 'draft',
      recipients: ids.map((eid) => ({ employeeId: eid, name: employees(id).find((e) => e.id === eid)?.fullName ?? eid, amount: per, status: 'pending' as const })),
      amountPerPerson: per, total: per * ids.length, allocationMode: b.allocationMode ?? 'free', fixedSplit: b.fixedSplit, cashAllowed: !!b.cashAllowed,
      lockPolicy: b.lockPolicy ?? { type: 'none' }, message: b.message, expiresAt: b.expiresAt,
    };
    if (pkg.lockPolicy.type === 'milestone') {
      const sum = pkg.lockPolicy.steps.reduce((s, x) => s + x.sharePct, 0);
      if (sum !== 100) return fail(422, 'bad_steps', 'جمع درصد مراحل باید ۱۰۰٪ باشد.');
      pkg.milestoneProgress = pkg.lockPolicy.steps.map((s, i): MilestoneStep => ({ id: `ms-${i + 1}`, title: s.title, sharePct: s.sharePct, dueDate: s.dueDate, status: i === 0 ? 'pending_approval' : 'future' }));
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
    const step = releaseStep(pkg, String(params.stepId));
    if (!step) return fail(409, 'already_released', 'این مرحله قبلاً آزاد شده است.');
    const ids = new Set(pkg.recipients.map((r) => r.employeeId));
    const rq = db().requests.find((r) => r.kind === 'milestone_release' && r.status === 'pending' && ids.has(r.requesterId));
    if (rq) { rq.status = 'approved'; rq.decidedAt = nowIso(); rq.decidedBy = 'نیما رضایی'; }
    return ok(pkg);
  }),

  // requests
  http.get(p('/org/requests'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const status = qs(request).get('status');
    return ok(db().requests.filter((r) => r.orgId === id && (!status || status === 'all' || r.status === status)));
  }),
  http.post(p('/org/requests/:id/decision'), async ({ request, params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    const b = await body<{ approve: boolean; note?: string }>(request);
    r.status = b.approve ? 'approved' : 'rejected';
    r.note = b.note ?? r.note;
    r.decidedAt = nowIso();
    r.decidedBy = 'نیما رضایی';
    if (b.approve && r.kind === 'milestone_release') {
      const pkg = packages(r.orgId).find((x) => x.lockPolicy.type === 'milestone' && x.recipients.some((y) => y.employeeId === r.requesterId));
      const step = pkg?.milestoneProgress?.find((s) => s.status === 'pending_approval');
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
