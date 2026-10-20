/**
 * Additional mock endpoints owned by the "org-packages" area. Registered before the core handlers (can override).
 *
 * PATCH  /api/v1/org/packages/:id                         (overrides core)
 *        body: Partial<OrgPackage> & { recipientIds?: string[] }
 *        → OrgPackage. Draft only. Validates amount ≥ 0, fixed split = 100%, milestone steps (1–8, each ≥ 5%, sum = 100%)
 *          and (re)builds `milestoneProgress` when the lock policy changes. Errors: 404 not_found, 409 not_draft,
 *          422 bad_amount | bad_split | bad_steps | cash_not_allowed | policy_not_allowed.
 * GET    /api/v1/org/packages/:id/insights
 *        → PackageInsights { recipients[] (with department, code, chosen split, reminded), allocation {gold,fixed,rial},
 *          fixRequests: stepId[], claims: pending milestone_release requests }
 * POST   /api/v1/org/packages/:id/remind                   body: { employeeIds?: string[] } (default: every pending recipient)
 *        → { reminded: number, employeeIds: string[] }   (registered app users get a notification)
 * POST   /api/v1/org/packages/:id/milestones/:stepId/fix   body: { note?: string } → { fixRequests: string[] }
 * DELETE /api/v1/org/packages/:id/milestones/:stepId/fix   → { fixRequests: string[] }   (undo the correction request)
 * GET    /api/v1/org/reports/overview
 *        → ReportsOverview { weekly[], earlierMonths[], currentMonthExtra, units[], exports[], schedules[] }
 * PATCH  /api/v1/org/reports/schedules/:id                 body: { enabled: boolean } → ReportSchedule
 * POST   /api/v1/org/reports/schedules                     body: { title?, format? } → ReportSchedule (201)
 * POST   /api/v1/org/reports/exports/:id                   body: { format: 'xlsx' | 'pdf' } → ReportFile { fileName, title, columns, rows }
 * GET    /api/v1/org/contract/approval-chain               → ApprovalChain { items[], updatedAt }
 * PATCH  /api/v1/org/contract/approval-chain               body: { values: Record<id, boolean> } → ApprovalChain
 *        (locked items cannot be disabled → 422 locked_step)
 */
import { http, type HttpHandler } from 'msw';
import type { AllocationSplit, LockPolicy, MilestoneStep, OrgPackage } from '@/types/domain';
import type { PackageInsights, ReportFile, ReportsOverview } from '@/api/org-packages-extra';
import { db, newId } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { defaultOrgPkgStore, type OrgPkgStore } from '../seed/extra-org-packages';
import { ledger } from './app';
import { now, jalaliToIso } from '@/lib/clock';
import { jDate, money } from '@/lib/format';

const nowIso = () => now().toISOString();
const orgOf = (req: Request) => who(req, 'org_admin').orgId!;
const org = (id: string) => db().organizations.find((o) => o.id === id)!;
const employees = (orgId: string) => (db().employees[orgId] ??= []);
const packages = (orgId: string) => (db().orgPackages[orgId] ??= []);
const store = (): OrgPkgStore => (db().extra.orgPackages ??= defaultOrgPkgStore()) as OrgPkgStore;
const REASON: Record<string, string> = { bonus: 'پاداش', welfare: 'مزایا', eid: 'عیدی', project_contract: 'قرارداد پروژه', other: 'سایر' };

/** Allocation an employee chose for a package: real choice for app users, deterministic sample otherwise. */
export function chosenSplit(pkg: OrgPackage, employeeId: string): AllocationSplit {
  const ud = db().users[employeeId];
  const inbox = ud?.inbox.find((i) => i.packageId === pkg.id);
  if (inbox?.acceptedSplit) return inbox.acceptedSplit;
  if (pkg.allocationMode === 'fixed' && pkg.fixedSplit) return pkg.fixedSplit;
  const options: [number, number, number][] = pkg.cashAllowed
    ? [[50, 30, 20], [60, 40, 0], [40, 40, 20], [30, 50, 20], [70, 30, 0], [50, 50, 0], [40, 50, 10]]
    : [[50, 50, 0], [60, 40, 0], [40, 60, 0], [70, 30, 0], [30, 70, 0]];
  const h = (employeeId + pkg.id).split('').reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 9973, 7);
  const [gold, fixed, rial] = options[h % options.length];
  return { gold, fixed, rial };
}

function validatePolicy(lp: LockPolicy | undefined, orgId: string) {
  if (!lp) return null;
  const allowed = org(orgId).settings.lockPolicies;
  if (!allowed.includes(lp.type)) return fail(422, 'policy_not_allowed', 'این سیاست قفل در قرارداد سازمان مجاز نیست.');
  if (lp.type === 'vesting' && (!lp.releaseAt || new Date(lp.releaseAt).getTime() <= now().getTime())) return fail(422, 'bad_release_date', 'تاریخ آزادسازی باید در آینده باشد.');
  if (lp.type === 'milestone') {
    const steps = lp.steps ?? [];
    if (!steps.length || steps.length > 8) return fail(422, 'bad_steps', 'تعداد مراحل باید بین ۱ تا ۸ باشد.');
    if (steps.some((s) => !s.title?.trim())) return fail(422, 'bad_steps', 'عنوان همه مراحل را وارد کنید.');
    if (steps.some((s) => !(s.sharePct >= 5))) return fail(422, 'bad_steps', 'سهم هر مرحله حداقل ۵٪ است.');
    if (steps.reduce((s, x) => s + x.sharePct, 0) !== 100) return fail(422, 'bad_steps', 'جمع درصد مراحل باید ۱۰۰٪ باشد.');
  }
  return null;
}

function toCsvDate(iso?: string) { return iso ? jDate(iso) : '—'; }

function buildReport(id: string, orgId: string): ReportFile | null {
  const pk = packages(orgId).filter((x) => x.status !== 'draft' && x.status !== 'cancelled');
  const stamp = jDate(now()).replace(/\//g, '-');
  if (id === 'payroll') {
    return {
      fileName: `payroll-${stamp}`, title: 'گزارش حقوق و مزایا',
      columns: ['عنوان بسته', 'نوع', 'تاریخ ارسال', 'گیرندگان', 'مبلغ هر نفر', 'جمع کل', 'سیاست قفل', 'پذیرفته‌شده'],
      rows: pk.map((x) => [x.title, REASON[x.reason] ?? x.reason, toCsvDate(x.sentAt), String(x.recipients.length), money(x.amountPerPerson), money(x.total),
        x.lockPolicy.type === 'none' ? 'بدون قفل' : x.lockPolicy.type === 'vesting' ? 'قفل زمانی تا ' + jDate(x.lockPolicy.releaseAt) : 'آزادسازی مرحله‌ای',
        String(x.recipients.filter((r) => r.status === 'accepted').length)]),
    };
  }
  if (id === 'credit') {
    const o = org(orgId);
    return {
      fileName: `credit-${stamp}`, title: 'گزارش تسهیلات',
      columns: ['کارمند', 'کد پرسنلی', 'واحد', 'دارایی کل', 'قفل‌شده', 'سقف وام'],
      rows: employees(orgId).filter((e) => e.status === 'active').map((e) => [e.fullName, e.employeeCode, e.department, money(e.portfolioValue), money(e.lockedValue), money(((e.portfolioValue - e.lockedValue) * o.settings.loanMaxPct) / 100)]),
    };
  }
  if (id === 'tax') {
    return {
      fileName: `tax-${stamp}`, title: 'گزارش مالیاتی',
      columns: ['کارمند', 'بسته', 'تاریخ', 'مبلغ مشمول'],
      rows: pk.flatMap((x) => x.recipients.filter((r) => r.status === 'accepted').map((r) => [r.name, x.title, toCsvDate(r.acceptedAt ?? x.sentAt), money(r.amount)])),
    };
  }
  return null;
}

export const orgPackagesHandlers: HttpHandler[] = [
  // ───── draft update (override: validation + milestone progress) ─────
  http.patch(p('/org/packages/:id'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'draft') return fail(409, 'not_draft', 'فقط پیش‌نویس قابل ویرایش است.');
    const b = await body<Partial<OrgPackage> & { recipientIds?: string[] }>(request);
    const { recipientIds, id: _ignore, status: _s, recipients: _r, total: _t, milestoneProgress: _m, createdAt: _c, sentAt: _sa, ...rest } = b;
    void _ignore; void _s; void _r; void _t; void _m; void _c; void _sa;
    if (rest.amountPerPerson !== undefined && (!Number.isFinite(rest.amountPerPerson) || rest.amountPerPerson < 0)) return fail(422, 'bad_amount', 'مبلغ هر نفر معتبر نیست.');
    const bad = validatePolicy(rest.lockPolicy, id);
    if (bad) return bad;
    const cash = rest.cashAllowed ?? pkg.cashAllowed;
    if (cash && !org(id).settings.cashWithdrawalAllowed) return fail(422, 'cash_not_allowed', 'برداشت نقدی در قرارداد سازمان مجاز نیست.');
    const mode = rest.allocationMode ?? pkg.allocationMode;
    const split = rest.fixedSplit ?? pkg.fixedSplit;
    if (mode === 'fixed') {
      if (!split) return fail(422, 'bad_split', 'تخصیص ثابت را مشخص کنید.');
      const sum = (split.gold ?? 0) + (split.fixed ?? 0) + (split.rial ?? 0);
      if (Math.round(sum) !== 100) return fail(422, 'bad_split', 'جمع تخصیص باید ۱۰۰٪ باشد.');
      if ((split.rial ?? 0) > 0 && !cash) return fail(422, 'cash_not_allowed', 'سهم ریالی فقط با فعال بودن برداشت نقدی مجاز است.');
    }
    Object.assign(pkg, rest);
    if (mode === 'free') delete pkg.fixedSplit;
    if (rest.message === '') delete pkg.message;
    if (rest.lockPolicy) {
      if (rest.lockPolicy.type === 'milestone') {
        pkg.milestoneProgress = rest.lockPolicy.steps.map((s, i): MilestoneStep => ({ id: `ms-${i + 1}`, title: s.title, sharePct: s.sharePct, dueDate: s.dueDate, status: i === 0 ? 'pending_approval' : 'future' }));
      } else delete pkg.milestoneProgress;
    }
    if (recipientIds) {
      pkg.recipients = recipientIds.map((eid) => ({ employeeId: eid, name: employees(id).find((e) => e.id === eid)?.fullName ?? eid, amount: pkg.amountPerPerson, status: 'pending' as const }));
    }
    pkg.recipients.forEach((r) => { r.amount = pkg.amountPerPerson; });
    pkg.total = pkg.amountPerPerson * pkg.recipients.length;
    return ok(pkg);
  }),

  // ───── package insights (recipients table, allocation donut, milestone claims) ─────
  http.get(p('/org/packages/:id/insights'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    const reminded = store().reminders[pkg.id] ?? [];
    const allocation = { gold: 0, fixed: 0, rial: 0 };
    const recipients = pkg.recipients.map((r) => {
      const e = employees(id).find((x) => x.id === r.employeeId);
      const split = r.status === 'accepted' ? chosenSplit(pkg, r.employeeId) : undefined;
      if (split) {
        allocation.gold += Math.round((r.amount * (split.gold ?? 0)) / 100);
        allocation.fixed += Math.round((r.amount * (split.fixed ?? 0)) / 100);
        allocation.rial += Math.round((r.amount * (split.rial ?? 0)) / 100);
      }
      return {
        ...r, department: e?.department ?? '—', employeeCode: e?.employeeCode ?? '', avatarLetter: e?.avatarLetter ?? r.name[0],
        split, reminded: reminded.includes(r.employeeId),
      };
    });
    const ids = pkg.recipients.map((r) => r.employeeId);
    const pendingStep = pkg.milestoneProgress?.find((s) => s.status === 'pending_approval');
    const claims = pkg.lockPolicy.type === 'milestone'
      ? db().requests.filter((r) => r.kind === 'milestone_release' && r.status === 'pending' && ids.includes(r.requesterId))
        .map((r) => ({ stepId: pendingStep?.id, requestId: r.id, requesterName: r.requesterName, createdAt: r.createdAt, note: r.note }))
      : [];
    const res: PackageInsights = { recipients, allocation, fixRequests: store().fixRequests[pkg.id] ?? [], claims };
    return ok(res);
  }),

  // ───── reminders ─────
  http.post(p('/org/packages/:id/remind'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'sent') return fail(409, 'not_sent', 'یادآوری فقط برای بسته‌های ارسال‌شده ممکن است.');
    const b = await body<{ employeeIds?: string[] }>(request);
    const pending = pkg.recipients.filter((r) => r.status === 'pending' && (!b.employeeIds || b.employeeIds.includes(r.employeeId)));
    if (!pending.length) return fail(422, 'nothing_to_remind', 'گیرنده‌ای در انتظار تأیید نیست.');
    const list = (store().reminders[pkg.id] ??= []);
    for (const r of pending) {
      if (!list.includes(r.employeeId)) list.push(r.employeeId);
      const ud = db().users[r.employeeId];
      if (ud) ledger.notify(ud, { title: 'یادآوری: ' + pkg.title, body: `${money(r.amount)} تومان از ${org(id).name} منتظر تأیید شماست`, tone: 'warning', icon: 'inbox', href: '/app/inbox' });
    }
    return ok({ reminded: pending.length, employeeIds: pending.map((r) => r.employeeId) });
  }),

  // ───── milestone correction request ─────
  http.post(p('/org/packages/:id/milestones/:stepId/fix'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    const step = pkg?.milestoneProgress?.find((s) => s.id === params.stepId);
    if (!pkg || !step) return fail(404, 'not_found', 'مرحله پیدا نشد.');
    if (step.status !== 'pending_approval') return fail(409, 'not_pending', 'این مرحله در انتظار تأیید نیست.');
    const b = await body<{ note?: string }>(request);
    const list = (store().fixRequests[pkg.id] ??= []);
    if (!list.includes(step.id)) list.push(step.id);
    const idx = pkg.milestoneProgress!.indexOf(step) + 1;
    for (const r of pkg.recipients) {
      const ud = db().users[r.employeeId];
      if (ud) ledger.notify(ud, { title: `مرحله ${idx} ${pkg.title} نیاز به اصلاح دارد`, body: b.note || `«${step.title}» توسط سازمان برای اصلاح بازگردانده شد`, tone: 'error', icon: 'flag', href: '/app/history' });
    }
    return ok({ fixRequests: list });
  }),
  http.delete(p('/org/packages/:id/milestones/:stepId/fix'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    const list = (store().fixRequests[pkg.id] ?? []).filter((s) => s !== params.stepId);
    store().fixRequests[pkg.id] = list;
    return ok({ fixRequests: list });
  }),

  // ───── reports ─────
  http.get(p('/org/reports/overview'), async ({ request }) => {
    await latency();
    const id = orgOf(request);
    const s = store();
    const sent = packages(id).filter((x) => x.status !== 'draft' && x.status !== 'cancelled' && x.sentAt);
    const t = now().getTime();
    const weekly = s.weeklyBaseline.map((base, i) => {
      const from = t - (4 - i) * 7 * 86400000;
      const to = t - (3 - i) * 7 * 86400000;
      const extra = sent.filter((x) => { const at = new Date(x.sentAt!).getTime(); return at > from && at <= to; }).reduce((sum, x) => sum + x.total, 0);
      return { label: 'هفته ' + ['۱', '۲', '۳', '۴'][i], sent: base + extra };
    });
    // start of the current Jalali month (mock clock: Aban 1405)
    const parts = jDate(now()).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).split('/').map(Number);
    const monthStart = new Date(jalaliToIso(parts[0], parts[1], 1)).getTime() - 12 * 3600000;
    const seededIds = new Set(['pkg-mehr', 'pkg-welfare-aban', 'pkg-ms-portal', 'pkg-shahrivar', 'pkg-tir', 'pkg-eid']);
    const currentMonthExtra = sent.filter((x) => !seededIds.has(x.id) && new Date(x.sentAt!).getTime() >= monthStart).reduce((sum, x) => sum + x.total, 0);
    const byDept: Record<string, { gold: number; fixed: number; rial: number }> = {};
    for (const pkg of sent) {
      for (const r of pkg.recipients) {
        if (r.status !== 'accepted') continue;
        const dept = employees(id).find((e) => e.id === r.employeeId)?.department ?? 'سایر';
        const sp = chosenSplit(pkg, r.employeeId);
        const d = (byDept[dept] ??= { gold: 0, fixed: 0, rial: 0 });
        d.gold += (r.amount * (sp.gold ?? 0)) / 100;
        d.fixed += (r.amount * (sp.fixed ?? 0)) / 100;
        d.rial += (r.amount * (sp.rial ?? 0)) / 100;
      }
    }
    const units = Object.entries(byDept).map(([department, v]) => {
      const total = v.gold + v.fixed + v.rial || 1;
      const gold = Math.round((v.gold / total) * 100);
      const fixed = Math.round((v.fixed / total) * 100);
      return { department, gold, fixed, rial: Math.max(0, 100 - gold - fixed), amount: Math.round(v.gold + v.fixed + v.rial) };
    }).sort((a, b) => b.amount - a.amount);
    const res: ReportsOverview = { weekly, earlierMonths: s.earlierMonths, currentMonthExtra, units, exports: s.exports, schedules: s.schedules };
    return ok(res);
  }),
  http.patch(p('/org/reports/schedules/:id'), async ({ request, params }) => {
    await latency();
    const sc = store().schedules.find((x) => x.id === params.id);
    if (!sc) return fail(404, 'not_found', 'گزارش زمان‌بندی‌شده پیدا نشد.');
    const b = await body<{ enabled?: boolean }>(request);
    if (typeof b.enabled === 'boolean') sc.enabled = b.enabled;
    return ok(sc);
  }),
  http.post(p('/org/reports/schedules'), async ({ request }) => {
    await latency();
    const b = await body<{ title?: string; format?: 'Excel' | 'PDF' }>(request);
    const sc = { id: newId('sch'), title: b.title || 'گزارش هفتگی بسته‌های دارایی', period: 'هفتگی · شنبه‌ها ۰۹:۰۰', to: 'منابع انسانی', format: b.format ?? 'Excel', enabled: true, tone: 'primary' as const, icon: 'clock' as const };
    store().schedules.push(sc);
    return ok(sc, { status: 201 });
  }),
  http.post(p('/org/reports/exports/:id'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const ex = store().exports.find((x) => x.id === params.id);
    const file = buildReport(String(params.id), id);
    if (!ex || !file) return fail(404, 'not_found', 'گزارش پیدا نشد.');
    ex.lastAt = nowIso();
    return ok(file);
  }),

  // ───── approval chain (contract page) ─────
  http.get(p('/org/contract/approval-chain'), async () => {
    await latency();
    return ok({ items: store().chain, updatedAt: store().chainUpdatedAt });
  }),
  http.patch(p('/org/contract/approval-chain'), async ({ request }) => {
    await latency();
    const b = await body<{ values?: Record<string, boolean> }>(request);
    const values = b.values ?? {};
    for (const it of store().chain) {
      if (!(it.id in values)) continue;
      if (it.locked && !values[it.id]) return fail(422, 'locked_step', 'این مرحله طبق قرارداد الزامی است.');
      it.enabled = !!values[it.id];
    }
    store().chainUpdatedAt = nowIso();
    return ok({ items: store().chain, updatedAt: store().chainUpdatedAt });
  }),
];
