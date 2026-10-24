/**
 * Additional mock endpoints owned by the "op-core" area (operator console: overview, organizations, users).
 * Registered before the core handlers, so the overrides below win; a resolver that returns nothing falls
 * through to the core handler. Types: src/api/op-core-extra.ts.
 *
 * ── New endpoints ──
 * GET    /api/v1/op/core/org-ext                         → Record<orgId, OrgContractExt>   (metrics + contract terms + HR users of every organization)
 * GET    /api/v1/op/core/organizations/:id/credit        → OrgCreditRow[]                   (loans / card credit / BNPL of the organization's users)
 * POST   /api/v1/op/core/organizations/:id/hr-users      { name, email, role } → HrUser (status «invited»)   · 422 missing_fields
 * GET    /api/v1/op/core/overview?range=7|30|90          → OverviewExt                      (daily flow series, KPI deltas, lock counts, service health, feed)
 * GET    /api/v1/op/core/users-meta                      → UsersMeta                        (facility kinds / lock types / KYC state per user + platform totals)
 * GET    /api/v1/op/core/users/:id/extra                 → OpUserExtra                      (facilities, operator notes, audit log, devices)
 * POST   /api/v1/op/core/users/:id/notes                 { text, tag } → UserNote           · 422 missing_text
 * POST   /api/v1/op/core/users/:id/reset-password        {} → { sent: true }
 *
 * ── Overrides of core endpoints ──
 * POST   /api/v1/op/organizations          body: Partial<Organization> & { contract?: Partial<OrgContractExt>; hrUsers?: {name,email,mobile?,role}[]; sendInvites?: boolean }
 *                                          → Organization (201, status «onboarding»)   · 422 missing_name | invalid_employees | missing_funds
 * PATCH  /api/v1/op/organizations/:id      body: Partial<Organization> & { contract?: Partial<OrgContractExt>; changeNote?: string }
 *                                          → Organization; a change of settings/contract bumps the contract version (OrgContractExt.versions)
 * GET    /api/v1/op/users/:id              platform users without an app account get a real Portfolio built from their operator-side breakdown
 * POST   /api/v1/op/users/:id/legal-hold   { holdingKind, amount, reference, reason } → Lock   · 422 missing_reference | invalid_amount | exceeds_free
 *                                          (locks from the FREE part only; adds a «lock» transaction + notification for app users)
 * DELETE /api/v1/op/users/:id/legal-hold/:lockId → { ok: true }   · 404 not_found (works for platform users too)
 * POST   /api/v1/op/users/:id/status       logs the change in the user's audit log, then falls through to the core handler
 */
import { http, type HttpHandler } from 'msw';
import type { AssetKind, Holding, Lock, LockType, Organization, PlatformUser, Portfolio } from '@/types/domain';
import type { Facility, FacilityKind, HrUser, OpUserExtra, OrgContractExt, OrgCreate, OrgCreditRow, OrgPatch, OverviewExt, UserLog, UserMetaRow, UserNote, UsersMeta } from '@/api/op-core-extra';
import { db, newId, recalcHoldings, type UserData } from '../db';
import { body, fail, latency, ok, p, qs } from '../http';
import { seed_opCore, type OpCoreExtra, type PlatformUserMeta } from '../seed/extra-op-core';
import { ledger, portfolioOf } from './app';
import { daysFromNow, now } from '@/lib/clock';
import { faDigits, jDayMonth, money } from '@/lib/format';

const nowIso = () => now().toISOString();
const OPERATOR = 'علی نادری';

function ext(): OpCoreExtra {
  const d = db();
  if (!d.extra.opCore) seed_opCore(d);
  return d.extra.opCore as OpCoreExtra;
}

function defaultExt(o: Organization): OrgContractExt {
  return {
    aum: 0, locked: 0, lockByType: {}, growthPct: 0, aumHistory: Array(12).fill(0), aumMix: { gold: 0, fixed: 0, rial: 0 },
    credit: { activeLoans: 0, outstanding: 0, cardHolders: 0, overdue: 0 }, newEmployeesMonth: 0,
    cardPct: 20, perPersonCap: 30_000_000, vestingMaxMonths: 3, milestoneMaxSteps: 5, allowCollateral: true, allowInstallmentLock: o.settings.installmentEnabled,
    financeApproval: true, version: 1, versions: [{ v: 1, note: 'عقد قرارداد اولیه', at: o.contractStart, by: OPERATOR }],
    accountManager: OPERATOR, city: 'تهران', hrEmail: o.admins[0]?.email ?? '', hrUsers: [], createdAt: nowIso(),
  };
}

function orgExt(o: Organization): OrgContractExt {
  const x = ext();
  if (!x.orgs[o.id]) x.orgs[o.id] = defaultExt(o);
  return x.orgs[o.id];
}

function addLog(userId: string, text: string, tone: UserLog['tone'] = 'default', by = OPERATOR) {
  const x = ext();
  (x.logs[userId] ??= []).unshift({ id: newId('lg'), text, by, at: nowIso(), tone });
}

const HOLDING_NAME: Record<string, string> = { rial: 'کیف پول ریالی', gold: 'صندوق طلا', fixed: 'صندوق درآمد ثابت' };

// ───────────── users ─────────────

function facilitiesOf(ud: UserData): Facility[] {
  const out: Facility[] = [];
  for (const l of ud.loans.filter((x) => x.status === 'active')) {
    const paid = l.installments.filter((i) => i.status === 'paid').length;
    const next = l.installments.find((i) => i.status !== 'paid');
    out.push({
      id: l.id, kind: 'loan', title: 'وام با پشتوانه دارایی', status: l.installments.some((i) => i.status === 'overdue') ? 'late' : 'current',
      amount: l.principal, used: l.installments.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0), months: l.months,
      paidCount: paid, totalCount: l.installments.length, nextDue: next ? { at: next.dueDate, amount: next.amount } : undefined,
      collateral: { holdingKind: l.collateral.holdingKind, amount: l.collateral.amount },
    });
  }
  if (ud.card) {
    out.push({ id: ud.card.id, kind: 'card', title: 'کارت نمادنو', status: ud.card.status === 'active' ? 'current' : 'blocked', amount: ud.card.creditLimit, used: ud.card.creditUsed, nextDue: { at: ud.card.statementDue, amount: ud.card.statementAmount } });
  }
  for (const it of ud.installments) {
    if (it.paidCount >= it.months) continue;
    const lock = ud.holdings.flatMap((h) => h.locks).find((l) => l.id === it.lockId);
    out.push({
      id: it.id, kind: 'bnpl', title: 'خرید اقساطی ' + it.storeName, status: 'current', amount: it.price, used: it.monthly * (it.months - it.paidCount), months: it.months,
      paidCount: it.paidCount, totalCount: it.months, collateral: lock ? { holdingKind: lock.holdingKind, amount: lock.amount } : undefined,
    });
  }
  return out;
}

function recalcMeta(m: PlatformUserMeta) {
  for (const h of m.holdings) {
    h.locked = Math.min(h.value, h.locks.reduce((s, l) => s + l.amount, 0));
    h.free = Math.max(0, h.value - h.locked);
  }
}

function syncPlatformUser(pu: PlatformUser, m: PlatformUserMeta) {
  recalcMeta(m);
  pu.portfolioValue = m.holdings.reduce((s, h) => s + h.value, 0);
  pu.lockedValue = m.holdings.reduce((s, h) => s + h.locked, 0);
  pu.freeValue = pu.portfolioValue - pu.lockedValue;
  const legal = m.holdings.some((h) => h.locks.some((l) => l.type === 'legal'));
  pu.flags = pu.flags.filter((f) => f !== 'legal_hold');
  if (legal) pu.flags.push('legal_hold');
}

function portfolioFromMeta(m: PlatformUserMeta): Portfolio {
  recalcMeta(m);
  const total = m.holdings.reduce((s, h) => s + h.value, 0);
  const locked = m.holdings.reduce((s, h) => s + h.locked, 0);
  return { total, free: total - locked, locked, changeToday: 0, changeTodayPct: 0, holdings: m.holdings, updatedAt: nowIso() };
}

function kycState(u: { kycLevel: number; flags?: string[] }): UserMetaRow['kyc'] {
  if (u.flags?.includes('kyc_rejected')) return 'rejected';
  return u.kycLevel < 2 ? 'pending' : 'ok';
}

function metaRow(holdings: Holding[], facilities: Facility[], kyc: UserMetaRow['kyc']): UserMetaRow {
  const lockTypes: LockType[] = [];
  holdings.forEach((h) => h.locks.forEach((l) => { if (!lockTypes.includes(l.type)) lockTypes.push(l.type); }));
  const kinds: FacilityKind[] = [];
  facilities.forEach((f) => { if (!kinds.includes(f.kind)) kinds.push(f.kind); });
  return { facilities: kinds, lockTypes, kyc };
}

// ───────────── handlers ─────────────

export const opCoreHandlers: HttpHandler[] = [
  // organizations: extension data
  http.get(p('/op/core/org-ext'), async () => {
    await latency();
    const out: Record<string, OrgContractExt> = {};
    for (const o of db().organizations) out[o.id] = orgExt(o);
    return ok(out);
  }),

  http.get(p('/op/core/organizations/:id/credit'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    if (!db().organizations.some((o) => o.id === id)) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    const rows: OrgCreditRow[] = [];
    for (const ud of Object.values(db().users)) {
      if (ud.profile.orgId !== id) continue;
      for (const f of facilitiesOf(ud)) rows.push({ userId: ud.profile.id, name: ud.profile.fullName, kind: f.kind, amount: f.amount, remain: f.used, collateral: f.collateral, status: f.status });
    }
    for (const pu of db().platformUsers) {
      if (pu.orgId !== id || db().users[pu.id]) continue;
      const m = ext().users[pu.id];
      for (const f of m?.facilities ?? []) rows.push({ userId: pu.id, name: pu.fullName, kind: f.kind, amount: f.amount, remain: f.used, collateral: f.collateral, status: f.status });
    }
    return ok(rows);
  }),

  http.post(p('/op/core/organizations/:id/hr-users'), async ({ request, params }) => {
    await latency();
    const o = db().organizations.find((x) => x.id === params.id);
    if (!o) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    const b = await body<{ name?: string; email?: string; role?: string }>(request);
    if (!b.name || !b.email) return fail(422, 'missing_fields', 'نام و ایمیل کاربر HR الزامی است.');
    const u: HrUser = { id: newId('hr'), name: b.name, email: b.email, role: b.role || 'کارشناس HR', twoFA: false, status: 'invited' };
    orgExt(o).hrUsers.push(u);
    return ok(u, { status: 201 });
  }),

  // override: create organization with contract terms + HR users
  http.post(p('/op/organizations'), async ({ request }) => {
    await latency();
    const b = await body<OrgCreate>(request);
    if (!b.name || !b.name.trim()) return fail(422, 'missing_name', 'نام سازمان الزامی است.');
    if (b.employees !== undefined && (!Number.isFinite(b.employees) || b.employees < 1)) return fail(422, 'invalid_employees', 'تعداد کارکنان باید عددی بزرگ‌تر از صفر باشد.');
    if (b.settings && b.settings.allowedFunds && b.settings.allowedFunds.length === 0) return fail(422, 'missing_funds', 'حداقل یک صندوق مجاز انتخاب کنید.');
    const id = newId('org');
    const name = b.name.trim();
    const hr = (b.hrUsers ?? []).map((u): HrUser => ({ id: newId('hr'), name: u.name, email: u.email, mobile: u.mobile, role: u.role, twoFA: false, status: 'invited' }));
    const o: Organization = {
      id, name, legalName: b.legalName ?? name, contractNo: b.contractNo ?? 'NW-' + Math.floor(1130 + Math.random() * 800), industry: b.industry ?? '',
      employees: b.employees ?? 0, activeEmployees: 0, status: 'onboarding',
      contractStart: b.contractStart ?? nowIso(), contractEnd: b.contractEnd ?? new Date(now().getTime() + 365 * 86400000).toISOString(),
      budgetYear: b.budgetYear ?? 0, budgetUsed: 0, logoLetter: name[0],
      settings: { allowedFunds: ['gold', 'fixed'], cashWithdrawalAllowed: true, lockPolicies: ['none', 'vesting', 'milestone'], loanEnabled: true, loanMaxPct: 40, loanMonthsOptions: [3, 6, 12], cardEnabled: true, installmentEnabled: false, ...(b.settings ?? {}) },
      admins: hr.map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email })),
    };
    db().organizations.unshift(o);
    db().employees[id] = [];
    db().orgPackages[id] = [];
    const e = { ...defaultExt(o), ...(b.contract ?? {}), hrUsers: hr, hrEmail: hr[0]?.email ?? '', version: 1, createdAt: nowIso() };
    e.versions = [{ v: 1, note: 'عقد قرارداد اولیه', at: nowIso(), by: OPERATOR }];
    ext().orgs[id] = e;
    return ok(o, { status: 201 });
  }),

  // override: update organization (settings + operator contract terms, versioned)
  http.patch(p('/op/organizations/:id'), async ({ request, params }) => {
    await latency();
    const o = db().organizations.find((x) => x.id === params.id);
    if (!o) return fail(404, 'not_found', 'سازمان پیدا نشد.');
    const b = await body<OrgPatch>(request);
    const { contract, changeNote, settings, id: _id, ...rest } = b;
    void _id;
    if (settings?.loanMaxPct !== undefined && (settings.loanMaxPct < 0 || settings.loanMaxPct > 70)) return fail(422, 'invalid_loan_pct', 'سقف وام باید بین ۰ تا ۷۰ درصد باشد.');
    if (settings?.loanMonthsOptions && settings.loanEnabled !== false && settings.loanMonthsOptions.length === 0) return fail(422, 'missing_months', 'حداقل یک گزینه بازپرداخت انتخاب کنید.');
    if (contract?.cardPct !== undefined && (contract.cardPct < 0 || contract.cardPct > 50)) return fail(422, 'invalid_card_pct', 'اعتبار کارت باید بین ۰ تا ۵۰ درصد باشد.');
    const e = orgExt(o);
    let changed = false;
    if (settings) { Object.assign(o.settings, settings); changed = true; }
    if (contract) {
      const { versions: _v, version: _n, ...c } = contract;
      void _v; void _n;
      Object.assign(e, c);
      changed = true;
    }
    Object.assign(o, rest);
    if (changed) {
      e.version += 1;
      e.versions.unshift({ v: e.version, note: changeNote || 'ویرایش محدودیت‌ها از پنل بهره‌بردار', at: nowIso(), by: OPERATOR });
    }
    return ok(o);
  }),

  // overview extension
  http.get(p('/op/core/overview'), async ({ request }) => {
    await latency();
    const r = qs(request).get('range');
    const range: OverviewExt['range'] = r === '7' || r === '90' ? r : '30';
    const n = Number(range);
    const inflow: number[] = [];
    const outflow: number[] = [];
    for (let d = 90 - n; d < 90; d++) {
      inflow.push(Math.max(0.4, Math.round((2.0 + d * 0.07 + 0.6 * Math.sin(d * 1.3) + 0.3 * Math.sin(d * 0.37)) * 10) / 10));
      outflow.push(Math.max(0.2, Math.round((1.2 + d * 0.032 + 0.35 * Math.sin(d * 1.7 + 1)) * 10) / 10));
    }
    const labels = Array.from({ length: 6 }, (_, i) => jDayMonth(daysFromNow(-Math.round((n - 1) * (1 - i / 5)))));
    const x = ext();
    const created = Object.values(x.orgs).filter((e) => new Date(e.createdAt).getTime() > now().getTime() - n * 86400000).length;
    const pendingLive = Object.values(db().orgPackages).flat().filter((pk) => pk.status === 'sent').reduce((s, pk) => s + pk.recipients.filter((rc) => rc.status === 'pending').length, 0);
    const legalLive = Object.values(db().users).flatMap((u) => u.holdings.flatMap((h) => h.locks)).filter((l) => l.type === 'legal').length
      + Object.values(x.users).flatMap((m) => m.holdings.flatMap((h) => h.locks)).filter((l) => l.type === 'legal').length;
    const onboarding = db().organizations.filter((o) => o.status === 'onboarding').map((o) => ({ o, e: orgExt(o) })).sort((a, b) => b.e.createdAt.localeCompare(a.e.createdAt))[0];
    const gold = db().funds.find((f) => f.id === 'gold');
    const req = db().requests.find((q) => q.status === 'pending');
    const alert = db().riskAlerts.find((a) => a.status === 'open');
    const feed: OverviewExt['feed'] = [];
    if (onboarding) feed.push({ text: 'سازمان جدید ثبت شد — ' + onboarding.o.name, at: onboarding.e.createdAt, tone: 'primary', href: '/op/organizations/' + onboarding.o.id });
    if (req) feed.push({ text: `درخواست جدید ${req.id} — ${req.requesterName}`, at: req.createdAt, tone: 'warning', href: '/op/requests' });
    if (gold) feed.push({ text: 'به‌روزرسانی NAV صندوق طلا — ' + money(gold.nav), at: daysFromNow(0, '09:00'), tone: 'success', href: '/op/funds/gold' });
    if (alert) feed.push({ text: `هشدار ${alert.id} — ${alert.title}`, at: alert.createdAt, tone: 'error', href: '/op/risk' });
    feed.sort((a, b) => b.at.localeCompare(a.at));
    const out: OverviewExt = {
      range,
      flow: { inflow, outflow, labels },
      deltas: {
        aumPct: { 7: 1.1, 30: 4.2, 90: 11.8 }[n] ?? 4.2,
        newOrgs: created + ({ 7: 0, 30: 2, 90: 4 }[n] ?? 0),
        newUsers: { 7: 210, 30: 860, 90: 2140 }[n] ?? 860,
        spark: [
          [30, 26, 28, 20, 22, 14, 16, 8, 10], [28, 28, 24, 24, 20, 20, 14, 14, 8], [30, 26, 24, 22, 18, 16, 12, 10, 6], [30, 24, 26, 18, 20, 14, 16, 10, 8],
        ],
      },
      unaccepted: { count: x.basePendingPackages + pendingLive, older7d: 340 },
      lockCounts: { collateral: 2940, vesting: 1820, milestone: 126, installment: 412, legal: 45 + legalLive },
      services: [
        { name: 'درگاه بانکی', latencyMs: 42, ok: true },
        { name: 'هسته معاملات صندوق', latencyMs: 118, ok: true },
        { name: 'اعتبارسنجی', latencyMs: 64, ok: true },
        { name: 'سرویس اعلان', latencyMs: null, ok: false },
      ],
      feed: feed.slice(0, 4),
    };
    return ok(out);
  }),

  // users: meta per row + platform totals
  http.get(p('/op/core/users-meta'), async () => {
    await latency();
    const meta: Record<string, UserMetaRow> = {};
    for (const ud of Object.values(db().users)) {
      portfolioOf(ud);
      meta[ud.profile.id] = metaRow(ud.holdings, facilitiesOf(ud), kycState(ud.profile));
    }
    for (const pu of db().platformUsers) {
      if (meta[pu.id]) continue;
      const m = ext().users[pu.id];
      meta[pu.id] = metaRow(m?.holdings ?? [], m?.facilities ?? [], kycState(pu));
    }
    const rows = Object.values(meta);
    const statuses = [...Object.values(db().users).map((u) => u.profile.status), ...db().platformUsers.filter((x) => !db().users[x.id]).map((x) => x.status)];
    const users = 12_831 + rows.length;
    const locked = 3_904 + rows.filter((r) => r.lockTypes.length > 0).length;
    const out: UsersMeta = {
      meta,
      totals: {
        users, newThisMonth: 860, locked, lockedPct: Math.round((locked / users) * 100),
        kycPending: 236 + rows.filter((r) => r.kyc === 'pending').length, kycAvgDays: 1.8,
        legal: 47 + rows.filter((r) => r.lockTypes.includes('legal')).length,
        suspended: 17 + statuses.filter((s) => s === 'suspended').length,
      },
    };
    return ok(out);
  }),

  http.get(p('/op/core/users/:id/extra'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    const ud = db().users[id];
    const pu = db().platformUsers.find((x) => x.id === id);
    if (!ud && !pu) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    const x = ext();
    const m = x.users[id];
    const profile = ud ? ud.profile : pu!;
    const org = db().organizations.find((o) => o.id === profile.orgId);
    const notes = x.notes[id] ?? [];
    const tx = ud ? ud.transactions : m?.transactions ?? [];
    const logs: UserLog[] = [
      ...(x.logs[id] ?? []),
      ...notes.map((nt) => ({ id: 'lg-' + nt.id, text: 'یادداشت داخلی ثبت شد', by: nt.by, at: nt.at, tone: 'default' as const })),
      ...tx.slice(0, 4).map((t) => ({ id: 'lg-' + t.id, text: t.title + (t.amount ? ' · ' + money(Math.abs(t.amount)) + ' تومان' : ''), by: t.category === 'inbox' || t.lockType === 'milestone' ? profile.orgName : 'کاربر', at: t.at, tone: (t.lockEvent === 'released' ? 'success' : 'primary') as UserLog['tone'] })),
      { id: 'lg-join-' + id, text: 'حساب با کد فعال‌سازی سازمانی ایجاد شد', by: 'سیستم', at: profile.joinedAt, tone: 'default' as const },
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
    const out: OpUserExtra = {
      facilities: ud ? facilitiesOf(ud) : m?.facilities ?? [],
      notes,
      logs,
      devices: ud
        ? { count: 2, newDevice: true, lastLoginAt: daysFromNow(0, '09:12'), city: 'تهران' }
        : { count: m?.devices.count ?? 1, newDevice: m?.devices.newDevice ?? false, lastLoginAt: pu!.lastActiveAt, city: m?.devices.city ?? 'تهران' },
      department: ud ? db().employees[profile.orgId]?.find((e) => e.id === id)?.department : m?.department,
      contract: org ? { loanMaxPct: org.settings.loanEnabled ? org.settings.loanMaxPct : 0, cardPct: org.settings.cardEnabled ? orgExt(org).cardPct : 0 } : undefined,
    };
    return ok(out);
  }),

  http.post(p('/op/core/users/:id/notes'), async ({ request, params }) => {
    await latency();
    const id = String(params.id);
    if (!db().users[id] && !db().platformUsers.some((x) => x.id === id)) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    const b = await body<{ text?: string; tag?: UserNote['tag'] }>(request);
    if (!b.text || !b.text.trim()) return fail(422, 'missing_text', 'متن یادداشت را وارد کنید.');
    const note: UserNote = { id: newId('nt-op'), text: b.text.trim(), tag: b.tag ?? 'support', by: OPERATOR, at: nowIso() };
    (ext().notes[id] ??= []).unshift(note);
    return ok(note, { status: 201 });
  }),

  http.post(p('/op/core/users/:id/reset-password'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    if (!db().users[id] && !db().platformUsers.some((x) => x.id === id)) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    addLog(id, 'لینک بازنشانی رمز پیامک شد', 'warning');
    return ok({ sent: true });
  }),

  // override: platform users get a real portfolio from their operator-side breakdown (app users fall through)
  http.get(p('/op/users/:id'), async ({ params }) => {
    const id = String(params.id);
    if (db().users[id]) return undefined;
    const pu = db().platformUsers.find((x) => x.id === id);
    const m = ext().users[id];
    if (!pu || !m) return undefined;
    await latency();
    syncPlatformUser(pu, m);
    return ok({ user: pu, portfolio: portfolioFromMeta(m), loans: [], installments: [], transactions: m.transactions, alerts: db().riskAlerts.filter((a) => a.userId === id) });
  }),

  // override: legal hold (free part only), for app users and platform users
  http.post(p('/op/users/:id/legal-hold'), async ({ request, params }) => {
    await latency();
    const id = String(params.id);
    const b = await body<{ holdingKind: AssetKind; amount: number; reference: string; reason: string }>(request);
    if (!b.reference || !String(b.reference).trim()) return fail(422, 'missing_reference', 'شماره دستور مرجع الزامی است.');
    if (!Number.isFinite(b.amount) || b.amount <= 0) return fail(422, 'invalid_amount', 'مبلغ مسدودی معتبر نیست.');
    const reason = b.reason || 'دستور مرجع قضایی';
    const name = HOLDING_NAME[b.holdingKind] ?? db().funds.find((f) => f.id === b.holdingKind)?.name ?? b.holdingKind;
    const ud = db().users[id];
    if (ud) {
      portfolioOf(ud);
      const h = ud.holdings.find((x) => x.kind === b.holdingKind);
      if (!h) return fail(422, 'no_holding', 'کاربر در این دارایی موجودی ندارد.');
      if (b.amount > h.free) return fail(422, 'exceeds_free', `مبلغ مسدودی از بخش آزاد «${h.name}» (${money(h.free)} تومان) بیشتر است.`, { free: h.free });
      const lock = ledger.addLock(ud, b.holdingKind, { type: 'legal', amount: b.amount, title: 'مسدودی قانونی — شماره ' + faDigits(b.reference), condition: 'تا رفع دستور مرجع · ' + reason, reference: b.reference });
      ledger.addTx(ud, { category: 'lock', title: 'مسدودی قانونی — ' + h.name, subtitle: 'تا رفع دستور مرجع', amount: b.amount, holdingKind: b.holdingKind, lockType: 'legal', lockEvent: 'locked' });
      ledger.notify(ud, { title: 'مسدودی قانونی روی حساب شما اعمال شد', body: `${money(b.amount)} تومان از ${h.name} تا رفع دستور مرجع مسدود شد. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.`, tone: 'error', icon: 'lock', href: '/app/support' });
      addLog(id, `اعمال مسدودی قانونی ${money(b.amount)} روی «${h.name}» — شماره ${faDigits(b.reference)}`, 'error');
      return ok(lock);
    }
    const pu = db().platformUsers.find((x) => x.id === id);
    if (!pu) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    const m = ext().users[id];
    if (!m) return fail(422, 'no_holding', 'کاربر در این دارایی موجودی ندارد.');
    recalcMeta(m);
    const h = m.holdings.find((x) => x.kind === b.holdingKind);
    if (!h) return fail(422, 'no_holding', 'کاربر در این دارایی موجودی ندارد.');
    if (b.amount > h.free) return fail(422, 'exceeds_free', `مبلغ مسدودی از بخش آزاد «${h.name}» (${money(h.free)} تومان) بیشتر است.`, { free: h.free });
    const lock: Lock = { id: newId('lk'), type: 'legal', holdingKind: b.holdingKind, amount: b.amount, title: 'مسدودی قانونی — شماره ' + faDigits(b.reference), condition: 'تا رفع دستور مرجع · ' + reason, createdAt: nowIso(), reference: b.reference };
    h.locks.push(lock);
    syncPlatformUser(pu, m);
    addLog(id, `اعمال مسدودی قانونی ${money(b.amount)} روی «${name}» — شماره ${faDigits(b.reference)}`, 'error');
    return ok(lock);
  }),

  http.delete(p('/op/users/:id/legal-hold/:lockId'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    const lockId = String(params.lockId);
    const ud = db().users[id];
    if (ud) {
      const h = ud.holdings.find((x) => x.locks.some((l) => l.id === lockId && l.type === 'legal'));
      const lock = h?.locks.find((l) => l.id === lockId);
      if (!h || !lock) return fail(404, 'not_found', 'مسدودی پیدا نشد.');
      h.locks = h.locks.filter((l) => l.id !== lockId);
      recalcHoldings(ud);
      ledger.addTx(ud, { category: 'lock', title: 'رفع مسدودی قانونی — ' + h.name, subtitle: 'به بخش آزاد برگشت', amount: lock.amount, holdingKind: h.kind, lockType: 'legal', lockEvent: 'released' });
      ledger.notify(ud, { title: 'مسدودی قانونی حساب شما رفع شد', body: `${money(lock.amount)} تومان از ${h.name} آزاد شد.`, tone: 'success', icon: 'unlock', href: '/app' });
      addLog(id, `رفع مسدودی قانونی · +${money(lock.amount)} آزاد شد (${h.name})`, 'success');
      return ok({ ok: true });
    }
    const pu = db().platformUsers.find((x) => x.id === id);
    const m = ext().users[id];
    if (!pu || !m) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    const h = m.holdings.find((x) => x.locks.some((l) => l.id === lockId && l.type === 'legal'));
    const lock = h?.locks.find((l) => l.id === lockId);
    if (!h || !lock) return fail(404, 'not_found', 'مسدودی پیدا نشد.');
    h.locks = h.locks.filter((l) => l.id !== lockId);
    syncPlatformUser(pu, m);
    addLog(id, `رفع مسدودی قانونی · +${money(lock.amount)} آزاد شد (${h.name})`, 'success');
    return ok({ ok: true });
  }),

  // log status changes, then let the core handler apply them
  http.post(p('/op/users/:id/status'), async ({ request, params }) => {
    const b = await body<{ status?: PlatformUser['status'] }>(request.clone());
    const id = String(params.id);
    if (b.status === 'suspended') addLog(id, 'حساب به‌طور موقت مسدود شد', 'error');
    else if (b.status === 'active') addLog(id, 'مسدودی حساب برداشته شد', 'success');
    return undefined;
  }),
];
