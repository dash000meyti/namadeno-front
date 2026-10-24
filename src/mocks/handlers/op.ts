/** Operator console endpoints (/op/*). */
import { http } from 'msw';
import type { AssetKind, Organization, PlatformUser } from '@/types/domain';
import { db, newId, recalcHoldings } from '../db';
import { body, fail, latency, ok, p, qs } from '../http';
import { now } from '@/lib/clock';
import { ledger, portfolioOf } from './app';

const nowIso = () => now().toISOString();

const OP_SETTINGS = {
  platformName: 'نمادنو', supportPhone: '۰۲۱-۹۱۰۰۰۰۰۰', maintenance: false, twoFactorRequired: true, sessionMinutes: 30,
  team: [
    { id: 'op-301', name: 'علی نادری', role: 'مدیر محصول', email: 'a.naderi@namadno.ir' },
    { id: 'op-302', name: 'مهسا بهرامی', role: 'کارشناس ریسک', email: 'm.bahrami@namadno.ir' },
    { id: 'op-303', name: 'کامران وفایی', role: 'پشتیبانی', email: 'k.vafaei@namadno.ir' },
  ],
};

/** Operator view of every user: the full demo user + lightweight platform users. */
function allUsers(): PlatformUser[] {
  const out: PlatformUser[] = [];
  for (const ud of Object.values(db().users)) {
    const pf = portfolioOf(ud);
    const legal = ud.holdings.flatMap((h) => h.locks).some((l) => l.type === 'legal');
    out.push({ ...ud.profile, portfolioValue: pf.total, freeValue: pf.free, lockedValue: pf.locked, riskScore: 12, lastActiveAt: nowIso(), flags: legal ? ['legal_hold'] : [] });
  }
  return out.concat(db().platformUsers.filter((x) => !db().users[x.id]));
}

export const opHandlers = [
  http.get(p('/op/overview'), async () => {
    await latency();
    const users = allUsers();
    return ok({
      stats: {
        aum: 412_600_000_000, users: 12_840, activeUsers: 9_310, organizations: db().organizations.length,
        lockedValue: 124_300_000_000, freeValue: 288_300_000_000, loansOutstanding: 87_700_000_000,
        pendingRequests: db().requests.filter((r) => r.status === 'pending').length,
        openAlerts: db().riskAlerts.filter((a) => a.status === 'open' || a.status === 'investigating').length,
        monthly: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'].map((m, i) => ({ month: m, inflow: [18, 9, 12, 31, 14, 26, 38, 11][i] * 1e9, outflow: [6, 5, 7, 9, 8, 10, 12, 4][i] * 1e9, aum: [301, 308, 316, 339, 347, 366, 395, 412.6][i] * 1e9 })),
      },
      funds: db().funds.filter((f) => f.status === 'active').map(({ history, ...f }) => { void history; return f; }),
      recentRequests: db().requests.slice(0, 6),
      alerts: db().riskAlerts.slice(0, 5),
      topOrganizations: [...db().organizations].sort((a, b) => b.budgetUsed - a.budgetUsed).slice(0, 5),
      lockMix: { collateral: 46, vesting: 29, installment: 11, milestone: 9, legal: 5 },
      usersSample: users.slice(0, 5),
    });
  }),

  // organizations
  http.get(p('/op/organizations'), async ({ request }) => {
    await latency();
    const q = qs(request);
    const text = q.get('q') ?? '';
    const status = q.get('status');
    let list = db().organizations;
    if (text) list = list.filter((o) => o.name.includes(text) || o.contractNo.includes(text));
    if (status && status !== 'all') list = list.filter((o) => o.status === status);
    return ok(list);
  }),
  http.get(p('/op/organizations/:id'), async ({ params }) => {
    await latency();
    const o = db().organizations.find((x) => x.id === params.id);
    if (!o) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    return ok({ organization: o, employees: db().employees[o.id] ?? [], packages: db().orgPackages[o.id] ?? [], requests: db().requests.filter((r) => r.orgId === o.id) });
  }),
  http.post(p('/op/organizations'), async ({ request }) => {
    await latency();
    const b = await body<Partial<Organization>>(request);
    if (!b.name) return fail(422, 'missing_name', 'نام سازمان الزامی است.');
    const id = newId('org');
    const o: Organization = {
      id, name: b.name, legalName: b.legalName ?? b.name, contractNo: b.contractNo ?? 'NW-' + Math.floor(1100 + Math.random() * 800), industry: b.industry ?? '',
      employees: b.employees ?? 0, activeEmployees: 0, status: 'onboarding', contractStart: b.contractStart ?? nowIso(), contractEnd: b.contractEnd ?? new Date(now().getTime() + 365 * 86400000).toISOString(),
      budgetYear: b.budgetYear ?? 0, budgetUsed: 0, logoLetter: b.name[0],
      settings: b.settings ?? { allowedFunds: ['gold', 'fixed'], cashWithdrawalAllowed: true, lockPolicies: ['none', 'vesting', 'milestone'], loanEnabled: true, loanMaxPct: 40, loanMonthsOptions: [3, 6, 12], cardEnabled: true, installmentEnabled: false },
      admins: b.admins ?? [],
    };
    db().organizations.unshift(o);
    db().employees[id] = [];
    db().orgPackages[id] = [];
    return ok(o, { status: 201 });
  }),
  http.patch(p('/op/organizations/:id'), async ({ request, params }) => {
    await latency();
    const o = db().organizations.find((x) => x.id === params.id);
    if (!o) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    const b = await body<Partial<Organization>>(request);
    if (b.settings) { Object.assign(o.settings, b.settings); delete b.settings; }
    Object.assign(o, b);
    return ok(o);
  }),

  // users
  http.get(p('/op/users'), async ({ request }) => {
    await latency();
    const q = qs(request);
    const text = q.get('q') ?? '';
    const filter = q.get('filter');
    let list = allUsers();
    if (text) list = list.filter((u) => u.fullName.includes(text) || u.mobile.includes(text) || (u.employeeCode ?? '').includes(text));
    if (filter === 'locked') list = list.filter((u) => u.lockedValue > 0);
    if (filter === 'kyc') list = list.filter((u) => u.kycLevel < 2);
    if (filter === 'legal') list = list.filter((u) => u.flags.includes('legal_hold'));
    return ok(list);
  }),
  http.get(p('/op/users/:id'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    const ud = db().users[id];
    if (ud) {
      const pf = portfolioOf(ud);
      return ok({ user: allUsers().find((x) => x.id === id), portfolio: pf, loans: ud.loans, card: ud.card, installments: ud.installments, transactions: ud.transactions.slice(0, 20), alerts: db().riskAlerts.filter((a) => a.userId === id) });
    }
    const pu = db().platformUsers.find((x) => x.id === id);
    if (!pu) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    return ok({ user: pu, portfolio: null, loans: [], installments: [], transactions: [], alerts: db().riskAlerts.filter((a) => a.userId === id) });
  }),
  http.post(p('/op/users/:id/status'), async ({ request, params }) => {
    await latency();
    const b = await body<{ status: PlatformUser['status'] }>(request);
    const ud = db().users[String(params.id)];
    if (ud) ud.profile.status = b.status;
    const pu = db().platformUsers.find((x) => x.id === params.id);
    if (pu) pu.status = b.status;
    return ok({ ok: true });
  }),
  http.post(p('/op/users/:id/legal-hold'), async ({ request, params }) => {
    await latency();
    const b = await body<{ holdingKind: AssetKind; amount: number; reference: string; reason: string }>(request);
    if (!b.reference) return fail(422, 'missing_reference', 'شماره دستور مرجع الزامی است.');
    const ud = db().users[String(params.id)];
    if (!ud) {
      const pu = db().platformUsers.find((x) => x.id === params.id);
      if (!pu) return fail(404, 'not_found', 'کاربر پیدا نشد.');
      pu.lockedValue += b.amount; pu.freeValue -= b.amount;
      if (!pu.flags.includes('legal_hold')) pu.flags.push('legal_hold');
      return ok({ ok: true });
    }
    const lock = ledger.addLock(ud, b.holdingKind, { type: 'legal', amount: b.amount, title: 'مسدودی قانونی', condition: 'تا رفع دستور مرجع · ' + b.reason, reference: b.reference });
    ledger.notify(ud, { title: 'مسدودی قانونی روی حساب شما اعمال شد', body: 'برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.', tone: 'error', icon: 'lock', href: '/app/support' });
    return ok(lock);
  }),
  http.delete(p('/op/users/:id/legal-hold/:lockId'), async ({ params }) => {
    await latency();
    const ud = db().users[String(params.id)];
    if (!ud) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    for (const h of ud.holdings) h.locks = h.locks.filter((l) => l.id !== params.lockId);
    recalcHoldings(ud);
    return ok({ ok: true });
  }),

  // funds
  http.get(p('/op/funds'), async () => { await latency(); return ok(db().funds); }),
  http.get(p('/op/funds/:id'), async ({ params }) => {
    await latency();
    const f = db().funds.find((x) => x.id === params.id);
    return f ? ok(f) : fail(404, 'not_found', 'صندوق پیدا نشد.');
  }),
  http.patch(p('/op/funds/:id'), async ({ request, params }) => {
    await latency();
    const f = db().funds.find((x) => x.id === params.id);
    if (!f) return fail(404, 'not_found', 'صندوق پیدا نشد.');
    Object.assign(f, await body(request));
    return ok(f);
  }),

  // products & rules
  http.get(p('/op/products'), async () => { await latency(); return ok(db().products); }),
  http.patch(p('/op/products/:id'), async ({ request, params }) => {
    await latency();
    const x = db().products.find((i) => i.id === params.id);
    if (!x) return fail(404, 'not_found', 'محصول پیدا نشد.');
    Object.assign(x, await body(request));
    return ok(x);
  }),
  http.get(p('/op/rules'), async () => { await latency(); return ok(db().rules); }),
  http.patch(p('/op/rules/:id'), async ({ request, params }) => {
    await latency();
    const x = db().rules.find((i) => i.id === params.id);
    if (!x) return fail(404, 'not_found', 'قانون پیدا نشد.');
    Object.assign(x, await body(request));
    return ok(x);
  }),

  // requests (all organizations)
  http.get(p('/op/requests'), async ({ request }) => {
    await latency();
    const status = qs(request).get('status');
    const kind = qs(request).get('kind');
    // contract milestones are approved (or reclaimed) by the organization, not by the operator
    return ok(db().requests.filter((r) => r.kind !== 'milestone_release' && (!status || status === 'all' || r.status === status) && (!kind || kind === 'all' || r.kind === kind)));
  }),
  http.post(p('/op/requests/:id/decision'), async ({ request, params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    const b = await body<{ approve: boolean; note?: string }>(request);
    r.status = b.approve ? 'approved' : 'rejected';
    r.note = b.note ?? r.note;
    r.decidedAt = nowIso();
    r.decidedBy = 'علی نادری';
    return ok(r);
  }),

  // risk
  http.get(p('/op/risk'), async ({ request }) => {
    await latency();
    const status = qs(request).get('status');
    return ok({ alerts: db().riskAlerts.filter((a) => !status || status === 'all' || a.status === status), rules: db().rules.filter((r) => r.group === 'risk') });
  }),
  http.patch(p('/op/risk/:id'), async ({ request, params }) => {
    await latency();
    const a = db().riskAlerts.find((x) => x.id === params.id);
    if (!a) return fail(404, 'not_found', 'هشدار پیدا نشد.');
    Object.assign(a, await body(request));
    return ok(a);
  }),

  // reports & settings
  http.get(p('/op/reports'), async () => {
    await latency();
    return ok({
      aumByFund: db().funds.filter((f) => f.aum > 0).map((f) => ({ fundId: f.id, name: f.name, aum: f.aum })),
      monthly: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'].map((m, i) => ({ month: m, packages: [12, 5, 8, 21, 9, 17, 26, 7][i] * 1e9, loans: [4, 3, 5, 6, 5, 7, 9, 3][i] * 1e9, withdrawals: [6, 5, 7, 9, 8, 10, 12, 4][i] * 1e9 })),
      byOrganization: db().organizations.map((o) => ({ id: o.id, name: o.name, budgetUsed: o.budgetUsed, employees: o.employees })),
    });
  }),
  http.get(p('/op/settings'), async () => {
    await latency();
    return ok({ ...OP_SETTINGS, ...((db().extra.opSettings as object) ?? {}) });
  }),
  http.patch(p('/op/settings'), async ({ request }) => {
    await latency();
    db().extra.opSettings = { ...((db().extra.opSettings as object) ?? {}), ...(await body(request)) };
    return ok({ ...OP_SETTINGS, ...(db().extra.opSettings as object) });
  }),
];
