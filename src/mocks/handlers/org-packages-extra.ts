/**
 * Additional mock endpoints owned by the "org-packages" area. Registered before the core handlers (can override).
 *
 * PATCH  /api/v1/org/packages/:id                         (overrides core)
 *        body: Partial<OrgPackage> & { recipientIds?: string[]; recipientAmounts?: Record<employeeId, Toman> }
 *        `recipientAmounts` = per-person amounts from an Excel file → amountSource 'file' (amountPerPerson 0, total = Σ amounts).
 *        `recipientIds` without amounts, or a positive `amountPerPerson`, switches back to one amount for everyone.
 *        → OrgPackage. Draft only. Validates amount ≥ 0, fixed split = 100%, milestone steps (1–8, each ≥ 5%, sum = 100%,
 *          every step with a future due date, in order) and (re)builds `milestoneProgress` when the lock policy changes
 *          (`requiresApproval` missing = true). Errors: 404 not_found, 409 not_draft,
 *          422 bad_amount | bad_split | bad_steps | cash_not_allowed | policy_not_allowed.
 * GET    /api/v1/org/packages/:id/insights
 *        → PackageInsights { recipients[] (with department, code, chosen split, reminded), allocation {gold,fixed,rial},
 *          claims: pending milestone_release requests of this package (stepId, trigger) }
 * POST   /api/v1/org/packages/:id/remind                   body: { employeeIds?: string[] } (default: every pending recipient)
 *        → { reminded: number, employeeIds: string[] }   (registered app users get a notification)
 * PATCH  /api/v1/org/packages/:id/milestones/:stepId       body: { requiresApproval?: boolean; dueDate?: ISODate }
 *        → OrgPackage. Draft or sent package, step not settled yet (released / reclaimed). Updates the step in `milestoneProgress`, in
 *          `lockPolicy.steps` and in the recipients' app copies (milestone lock + inbox). A new future due date withdraws
 *          a pending request that the old due date opened. Errors: 404 not_found, 409 already_released | already_reclaimed | not_editable,
 *          422 bad_due (missing / invalid / in the past / before the previous step / after the next step) | no_changes.
 * (all)  /api/v1/*  (pass-through, registered first in handlers/index.ts) runs processDueMilestones() (handlers/org.ts):
 *        due steps without approval are released automatically; due steps that need approval open a
 *        `milestone_release` request (trigger 'due_date'). The real backend does this on a schedule.
 * POST   /api/v1/org/packages/:id/milestones/:stepId/reclaim   body: { note: string }   («بازپس‌گیری»)
 *        → OrgPackage. The step is not paid: status 'reclaimed' (+ reclaimedAt, reclaimNote), its share leaves the
 *          employees' assets (reservation and holding) and returns to the organization's budget; the employee gets a
 *          ledger entry and a notification with the note; pending requests of the step become 'rejected' with the note;
 *          the next step becomes current. Irreversible. Sent packages only. (reclaimStep in handlers/org.ts)
 *          Errors: 404 not_found, 409 not_sent | already_released | already_reclaimed, 422 note_required (≥ 3 characters).
 * GET    /api/v1/org/reports/overview
 *        → ReportsOverview { weekly[], earlierMonths[], currentMonthExtra, units[], exports[] }
 * POST   /api/v1/org/reports/exports/:id                   body: { format: 'xlsx' | 'pdf' } → ReportFile { fileName, title, columns, rows }
 * GET    /api/v1/org/contract/approval-chain               → ApprovalChain { items[], updatedAt }
 * PATCH  /api/v1/org/contract/approval-chain               body: { values: Record<id, boolean> } → ApprovalChain
 *        (locked items cannot be disabled → 422 locked_step)
 */
import { http, type HttpHandler } from 'msw';
import type { AllocationSplit, LockPolicy, OrgPackage } from '@/types/domain';
import type { PackageInsights, ReportFile, ReportsOverview } from '@/api/org-packages-extra';
import { db } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { defaultOrgPkgStore, type OrgPkgStore } from '../seed/extra-org-packages';
import { ledger } from './app';
import { buildProgress, milestoneDueError, processDueMilestones, reclaimStep } from './org';
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
  if (!allowed.includes(lp.type)) return fail(422, 'policy_not_allowed', 'این شیوه‌ی دریافت در قرارداد سازمان شما فعال نیست.');
  if (lp.type === 'vesting' && (!lp.releaseAt || new Date(lp.releaseAt).getTime() <= now().getTime())) return fail(422, 'bad_release_date', 'تاریخ آزادسازی باید در آینده باشد.');
  if (lp.type === 'milestone') {
    const steps = lp.steps ?? [];
    if (!steps.length || steps.length > 8) return fail(422, 'bad_steps', 'تعداد مراحل باید بین ۱ تا ۸ باشد.');
    if (steps.some((s) => !s.title?.trim())) return fail(422, 'bad_steps', 'عنوان همه مراحل را وارد کنید.');
    if (steps.some((s) => !(s.sharePct >= 5))) return fail(422, 'bad_steps', 'سهم هر مرحله حداقل ۵٪ است.');
    if (steps.reduce((s, x) => s + x.sharePct, 0) !== 100) return fail(422, 'bad_steps', 'جمع درصد مراحل باید ۱۰۰٪ باشد.');
    const dueErr = milestoneDueError(steps);
    if (dueErr) return fail(422, 'bad_steps', dueErr);
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
      columns: ['عنوان بسته', 'نوع', 'تاریخ ارسال', 'گیرندگان', 'مبلغ هر نفر', 'جمع کل', 'شیوه‌ی دریافت', 'پذیرفته‌شده'],
      rows: pk.map((x) => [x.title, REASON[x.reason] ?? x.reason, toCsvDate(x.sentAt), String(x.recipients.length), x.amountSource === 'file' ? 'متغیر (از فایل)' : money(x.amountPerPerson), money(x.total),
        x.lockPolicy.type === 'none' ? 'آزاد' : x.lockPolicy.type === 'vesting' ? 'پس‌انداز تا ' + jDate(x.lockPolicy.releaseAt) : 'دریافت مرحله‌ای',
        String(x.recipients.filter((r) => r.status === 'accepted').length)]),
    };
  }
  if (id === 'credit') {
    const o = org(orgId);
    return {
      fileName: `credit-${stamp}`, title: 'گزارش تسهیلات',
      columns: ['کارمند', 'کد پرسنلی', 'واحد', 'دارایی کل', 'رزروشده', 'سقف وام'],
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

/**
 * Pass-through for every API request (app, org and operator): runs the due-date processing of milestone steps first.
 * Registered before all other handlers (handlers/index.ts).
 */
export const milestoneTickHandlers: HttpHandler[] = [
  http.all(p('/*'), () => { processDueMilestones(); return undefined; }),
];

export const orgPackagesHandlers: HttpHandler[] = [
  // ───── draft update (override: validation + milestone progress) ─────
  http.patch(p('/org/packages/:id'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'draft') return fail(409, 'not_draft', 'فقط پیش‌نویس قابل ویرایش است.');
    const b = await body<Partial<OrgPackage> & { recipientIds?: string[]; recipientAmounts?: Record<string, number> }>(request);
    const { recipientIds, recipientAmounts, amountSource: _src, id: _ignore, status: _s, recipients: _r, total: _t, milestoneProgress: _m, createdAt: _c, sentAt: _sa, ...rest } = b;
    void _ignore; void _s; void _r; void _t; void _m; void _c; void _sa; void _src;
    if (recipientAmounts && Object.values(recipientAmounts).some((v) => !Number.isFinite(v) || v <= 0)) return fail(422, 'bad_amount', 'مبلغ هر نفر معتبر نیست.');
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
        pkg.milestoneProgress = buildProgress(rest.lockPolicy.steps);
      } else delete pkg.milestoneProgress;
    }
    const nameOf = (eid: string) => employees(id).find((e) => e.id === eid)?.fullName ?? eid;
    if (recipientAmounts) {
      // per-person amounts from a file: the file decides who receives what
      const ids = recipientIds ?? Object.keys(recipientAmounts);
      pkg.recipients = ids.map((eid) => ({ employeeId: eid, name: nameOf(eid), amount: recipientAmounts[eid] ?? 0, status: 'pending' as const }));
      pkg.amountSource = 'file';
      pkg.amountPerPerson = 0;
    } else {
      if (recipientIds) {
        pkg.recipients = recipientIds.map((eid) => ({ employeeId: eid, name: nameOf(eid), amount: pkg.amountPerPerson, status: 'pending' as const }));
        pkg.amountSource = 'uniform';
      }
      if ((rest.amountPerPerson ?? 0) > 0) pkg.amountSource = 'uniform';
      if (pkg.amountSource !== 'file') pkg.recipients.forEach((r) => { r.amount = pkg.amountPerPerson; });
    }
    pkg.total = pkg.recipients.reduce((s, r) => s + r.amount, 0);
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
      ? db().requests.filter((r) => r.kind === 'milestone_release' && r.status === 'pending' && ids.includes(r.requesterId) && (!r.packageId || r.packageId === pkg.id))
        .map((r) => ({ stepId: r.stepId ?? pendingStep?.id, requestId: r.id, requesterName: r.requesterName, createdAt: r.createdAt, note: r.note, trigger: r.trigger ?? 'employee' as const }))
      : [];
    const res: PackageInsights = { recipients, allocation, claims };
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

  // ───── milestone step: due date and «نیاز به تأیید» ─────
  http.patch(p('/org/packages/:id/milestones/:stepId'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    const steps = pkg?.milestoneProgress ?? [];
    const i = steps.findIndex((s) => s.id === params.stepId);
    if (!pkg || pkg.lockPolicy.type !== 'milestone' || i < 0) return fail(404, 'not_found', 'مرحله پیدا نشد.');
    if (pkg.status !== 'draft' && pkg.status !== 'sent') return fail(409, 'not_editable', 'این قرارداد دیگر قابل تغییر نیست.');
    const step = steps[i];
    if (step.status === 'released') return fail(409, 'already_released', 'این مرحله قبلاً آزاد شده است.');
    if (step.status === 'reclaimed') return fail(409, 'already_reclaimed', 'این مرحله بازپس گرفته شده است.');
    const b = await body<{ requiresApproval?: boolean; dueDate?: string | null }>(request);
    const hasDue = 'dueDate' in b;
    const hasAp = typeof b.requiresApproval === 'boolean';
    if (!hasDue && !hasAp) return fail(422, 'no_changes', 'سررسید یا نیاز به تأیید را مشخص کنید.');
    if (hasDue) {
      const t = b.dueDate ? new Date(b.dueDate).getTime() : NaN;
      if (!b.dueDate) return fail(422, 'bad_due', 'سررسید مرحله الزامی است.');
      if (!Number.isFinite(t)) return fail(422, 'bad_due', 'تاریخ سررسید معتبر نیست.');
      if (t <= now().getTime()) return fail(422, 'bad_due', 'سررسید باید امروز یا پس از آن باشد.');
      const prev = steps[i - 1]?.dueDate;
      const next = steps[i + 1]?.dueDate;
      if (prev && t < new Date(prev).getTime()) return fail(422, 'bad_due', 'سررسید این مرحله نمی‌تواند پیش از مرحله‌ی قبل باشد.');
      if (next && t > new Date(next).getTime()) return fail(422, 'bad_due', 'سررسید این مرحله نمی‌تواند پس از مرحله‌ی بعد باشد.');
    }
    const patchStep = (s?: { dueDate?: string; requiresApproval?: boolean }) => {
      if (!s) return;
      if (hasDue) s.dueDate = b.dueDate!;
      if (hasAp) s.requiresApproval = b.requiresApproval;
    };
    patchStep(step);
    patchStep(pkg.lockPolicy.steps[i]);
    // the employees' app copies (milestone lock steps and the inbox item's policy)
    for (const r of pkg.recipients) {
      const ud = db().users[r.employeeId];
      if (!ud) continue;
      const lock = ud.holdings.flatMap((h) => h.locks).find((l) => l.type === 'milestone' && l.sourceId === pkg.id);
      patchStep(lock?.steps?.find((s) => s.id === step.id));
      const lp = ud.inbox.find((x) => x.packageId === pkg.id)?.lockPolicy;
      if (lp && lp !== pkg.lockPolicy && lp.type === 'milestone') patchStep(lp.steps[i]);
    }
    // a later due date withdraws the request that the old due date opened
    if (hasDue) {
      const list = db().requests;
      for (let k = list.length - 1; k >= 0; k -= 1) {
        const q = list[k];
        if (q.trigger === 'due_date' && q.status === 'pending' && q.packageId === pkg.id && q.stepId === step.id) list.splice(k, 1);
      }
    }
    processDueMilestones(); // e.g. approval turned off for a step whose due date has passed → released now
    return ok(pkg);
  }),

  // ───── milestone reclaim («بازپس‌گیری») ─────
  http.post(p('/org/packages/:id/milestones/:stepId/reclaim'), async ({ request, params }) => {
    await latency();
    const id = orgOf(request);
    const pkg = packages(id).find((x) => x.id === params.id);
    const step = pkg?.milestoneProgress?.find((s) => s.id === params.stepId);
    if (!pkg || !step) return fail(404, 'not_found', 'مرحله پیدا نشد.');
    if (pkg.status !== 'sent') return fail(409, 'not_sent', 'بازپس‌گیری فقط برای قرارداد ارسال‌شده ممکن است.');
    if (step.status === 'released') return fail(409, 'already_released', 'این مرحله آزاد شده و قابل بازپس‌گیری نیست.');
    if (step.status === 'reclaimed') return fail(409, 'already_reclaimed', 'این مرحله قبلاً بازپس گرفته شده است.');
    const b = await body<{ note?: string }>(request);
    const note = (b.note ?? '').trim();
    if (note.length < 3) return fail(422, 'note_required', 'توضیح بازپس‌گیری را برای کارمند بنویسید.');
    reclaimStep(id, pkg, step, note);
    return ok(pkg);
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
    const seededIds = new Set(['pkg-mehr', 'pkg-welfare-aban', 'pkg-ms-portal', 'pkg-ms-brand', 'pkg-shahrivar', 'pkg-tir', 'pkg-eid']);
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
    const res: ReportsOverview = { weekly, earlierMonths: s.earlierMonths, currentMonthExtra, units, exports: s.exports };
    return ok(res);
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
