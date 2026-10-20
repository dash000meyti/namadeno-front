/**
 * Additional mock endpoints owned by the "op-system" area (operator console:
 * funds, products, rules, requests, risk, reports, settings).
 * Registered before the core handlers, so the overrides below win.
 *
 * Optional fields added to core resources (backend: return them when available)
 *   Fund.meta            FundMeta    (see src/api/op-system-extra.ts) — returned by GET /op/funds, /op/funds/:id
 *   CreditProduct.meta   ProductMeta — returned by GET /op/products
 *   RiskAlert.signals    RiskSignal[] — returned by GET /op/risk
 *   GET /op/settings     also returns OpSettingsX fields (team[].roleKey/status/lastLoginAt, roleMatrix, notify, …)
 *
 * Overrides of core endpoints
 *   PATCH /api/v1/op/funds/:id                 body Partial<Fund> & { meta?: Partial<FundMeta> } → OpFund   (meta deep-merged, stamps meta.updatedAt/By; 422 on invalid fee/settlement/ltv)
 *   PATCH /api/v1/op/products/:id              body Partial<CreditProduct> & { meta?: Partial<ProductMeta> } → OpProduct (422 on invalid rates/percent/months)
 *   PATCH /api/v1/op/rules/:id                 body Partial<PlatformRule> → PlatformRule (also logs the change in the rules history, bumps version)
 *   POST  /api/v1/op/requests/:id/decision     body { approve, note? } → ApprovalRequest (decidedBy = calling operator; notifies the employee in-app)
 *
 * New endpoints
 *   POST  /api/v1/op/funds/nav-refresh         body { fundId? } → { lastNavAt, funds: OpFund[] }
 *   GET   /api/v1/op/rules/meta                → RulesMeta { version, history[], defaults{ruleId: {enabled, value}} }
 *   POST  /api/v1/op/rules/batch               body { changes: { id, enabled?, value? }[] } → { version, rules, history }  (422 on invalid values)
 *   GET   /api/v1/op/requests/meta             → Record<requestId, RequestMeta { slaDueAt, riskScore, creditScore?, details[], factors[], checks[] }>
 *   PATCH /api/v1/op/requests/:id/meta         body { checks: boolean[] } → RequestMeta
 *   POST  /api/v1/op/requests/:id/reopen       → ApprovalRequest (back to pending; 409 if already pending)
 *   POST  /api/v1/op/requests/:id/escalate     → RiskAlert (new open alert referring the request to the risk team)
 *   GET   /api/v1/op/risk/insights             → RiskInsights { platformScore, platformScoreDelta, suspiciousToday, txToday, alertsToday, daily[30], legalHolds[] }
 *   POST  /api/v1/op/legal-holds/:id/release   → LegalHold (record: only when status = pending, else 409; lock: removes the user's legal lock)
 *   GET   /api/v1/op/reports/extra             → ReportsExtra { aumMonthly[12], lockedValue, credit[6], creditOutstanding, …, sla, schedules[] }
 *   POST  /api/v1/op/reports/schedules         body { name, period, recipients, format } → ReportSchedule (422 without name)
 *   PATCH /api/v1/op/reports/schedules/:id     body { enabled } → ReportSchedule
 *   GET   /api/v1/op/system-status             → SystemStatus { checkedAt, services[], incidents[], notice? }
 *   POST  /api/v1/op/system-status/refresh     → SystemStatus
 *   POST  /api/v1/op/settings/team             body { name, email, roleKey } → OpSettingsX (422 invalid name/email, 409 duplicate email)
 *   PATCH /api/v1/op/settings/team/:id         body { status: 'active'|'inactive' } → OpSettingsX (422 for the panel owner)
 *   POST  /api/v1/op/settings/api-key/rotate   → OpSettingsX (new masked key)
 *   POST  /api/v1/op/settings/sessions/revoke  → OpSettingsX (ends every session except the current one)
 */
import { http, type HttpHandler } from 'msw';
import type { ApprovalRequest, CreditProduct, Fund, Lock, PlatformRule, RiskAlert } from '@/types/domain';
import type {
  FundMeta, LegalHold, OpTeamMember, ProductMeta, ReportSchedule, RequestMeta, RuleChange, RuleHistoryItem, RulesMeta, SystemStatus,
} from '@/api/op-system-extra';
import { db, newId, recalcHoldings } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { now, daysFromNow } from '@/lib/clock';
import { faDigits, money } from '@/lib/format';
import { ledger } from './app';

const nowIso = () => now().toISOString();
type FundX = Fund & { meta?: FundMeta };
type ProductX = CreditProduct & { meta?: ProductMeta };
type Settings = Record<string, unknown> & { team?: OpTeamMember[] };

const settings = (): Settings => ((db().extra.opSettings ??= {}) as Settings);
function operatorName(req: Request) {
  const id = who(req, 'operator').userId;
  return settings().team?.find((m) => m.id === id)?.name ?? 'علی نادری';
}

// ───────────── rules helpers ─────────────
const rulesMeta = (): RulesMeta => ((db().extra.opRulesMeta ??= { version: 1, history: [], defaults: {} }) as RulesMeta);
function sectionOf(id: string) {
  if (id.startsWith('r-pkg')) return 'بسته‌ها';
  if (id.startsWith('r-limit-withdraw') || id.startsWith('r-withdraw')) return 'برداشت';
  if (id.startsWith('r-credit')) return 'تسهیلات';
  if (id.startsWith('r-kyc')) return 'KYC';
  if (id.startsWith('r-lock')) return 'قفل دارایی';
  if (id.startsWith('r-risk')) return 'ریسک';
  return 'محدودیت‌ها';
}
const fmtVal = (v: unknown) => (typeof v === 'number' ? money(v) : faDigits(String(v ?? '—')));
function validateRule(r: PlatformRule, c: RuleChange): string | null {
  if (c.value === undefined || typeof c.value !== 'number') return null;
  if (!Number.isFinite(c.value) || c.value < 0) return `مقدار «${r.title}» معتبر نیست.`;
  if (r.id === 'r-credit-min-score' && (c.value < 300 || c.value > 900)) return 'حداقل امتیاز اعتباری باید بین ۳۰۰ تا ۹۰۰ باشد.';
  if ((r.unit ?? '').includes('٪') && c.value > 100) return `«${r.title}» نمی‌تواند بیشتر از ۱۰۰٪ باشد.`;
  return null;
}
function applyRuleChanges(changes: RuleChange[], by: string): { error?: string; history: RuleHistoryItem[] } {
  const rules = db().rules;
  for (const c of changes) {
    const r = rules.find((x) => x.id === c.id);
    if (!r) return { error: `قانون ${c.id} پیدا نشد.`, history: [] };
    const err = validateRule(r, c);
    if (err) return { error: err, history: [] };
  }
  const items: RuleHistoryItem[] = [];
  for (const c of changes) {
    const r = rules.find((x) => x.id === c.id)!;
    const texts: string[] = [];
    if (c.enabled !== undefined && c.enabled !== r.enabled) { texts.push(`${c.enabled ? 'فعال‌سازی' : 'غیرفعال‌سازی'} «${r.title}»`); r.enabled = c.enabled; }
    if (c.value !== undefined && c.value !== r.value) {
      texts.push(typeof c.value === 'number' ? `${r.title} ${fmtVal(r.value)} → ${fmtVal(c.value)}` : `به‌روزرسانی «${r.title}»`);
      r.value = c.value;
    }
    for (const t of texts) items.push({ id: newId('rh'), at: nowIso(), group: sectionOf(r.id), text: t, by });
  }
  if (items.length) {
    const m = rulesMeta();
    m.version += 1;
    m.history = [...items, ...m.history].slice(0, 50);
  }
  return { history: items };
}

// ───────────── requests helpers ─────────────
const reqMetaStore = () => ((db().extra.opRequestMeta ??= {}) as Record<string, RequestMeta>);
function personOf(id: string) {
  const ud = db().users[id];
  if (ud) return { creditScore: ud.profile.creditScore, riskScore: 12 };
  const pu = db().platformUsers.find((x) => x.id === id);
  return pu ? { creditScore: pu.creditScore, riskScore: pu.riskScore } : undefined;
}
function metaOf(r: ApprovalRequest): RequestMeta {
  const store = reqMetaStore();
  const person = personOf(r.requesterId);
  const m = store[r.id] ?? {
    slaDueAt: new Date(new Date(r.createdAt).getTime() + 24 * 3600000).toISOString(),
    riskScore: person?.riskScore ?? 20,
    details: [{ k: 'عنوان', v: r.title }, { k: 'سازمان', v: r.orgName }],
    factors: [],
    checks: [],
  };
  return { ...m, creditScore: person?.creditScore || undefined };
}

// ───────────── risk helpers ─────────────
const sevOf = (score: number): RiskAlert['severity'] => (score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
const legalRecords = () => ((db().extra.opLegalHolds ??= []) as LegalHold[]);
type LooseHolding = { name?: string; kind?: string; locks?: Lock[] };
function liveLegalLocks(): LegalHold[] {
  const out: LegalHold[] = [];
  // platform users without an app account keep their wallet breakdown in the op-core area's data
  const core = db().extra.opCore as { users?: Record<string, { holdings?: LooseHolding[] }> } | undefined;
  for (const [uid, m] of Object.entries(core?.users ?? {})) {
    if (db().users[uid]) continue;
    const pu = db().platformUsers.find((x) => x.id === uid);
    for (const h of m.holdings ?? []) {
      for (const l of h.locks ?? []) {
        if (l.type !== 'legal') continue;
        out.push({ id: l.id, source: 'lock', userId: uid, userName: pu?.fullName ?? uid, reference: l.reference ?? '—', holding: h.name ?? String(h.kind ?? ''), reason: l.condition, amount: l.amount, createdAt: l.createdAt, status: 'active' });
      }
    }
  }
  for (const ud of Object.values(db().users)) {
    for (const h of ud.holdings) {
      for (const l of h.locks) {
        if (l.type !== 'legal') continue;
        out.push({ id: l.id, source: 'lock', userId: ud.profile.id, userName: ud.profile.fullName, reference: l.reference ?? '—', holding: h.name, reason: l.condition, amount: l.amount, createdAt: l.createdAt, status: 'active' });
      }
    }
  }
  return out;
}

// ───────────── reports helpers ─────────────
const schedules = () => ((db().extra.opReportSchedules ??= []) as ReportSchedule[]);
const sysStatus = () => db().extra.opSystemStatus as SystemStatus | undefined;

export const opSystemHandlers: HttpHandler[] = [
  // ═════════ funds ═════════
  http.post(p('/op/funds/nav-refresh'), async ({ request }) => {
    await latency();
    const b = await body<{ fundId?: string }>(request);
    const at = nowIso();
    const list = db().funds.filter((f) => (b.fundId ? f.id === b.fundId : f.status === 'active')) as FundX[];
    if (b.fundId && !list.length) return fail(404, 'not_found', 'صندوق پیدا نشد.');
    for (const f of list) if (f.meta) f.meta.lastNavAt = at;
    return ok({ lastNavAt: at, funds: list });
  }),
  http.patch(p('/op/funds/:id'), async ({ request, params }) => {
    await latency();
    const f = db().funds.find((x) => x.id === params.id) as FundX | undefined;
    if (!f) return fail(404, 'not_found', 'صندوق پیدا نشد.');
    const b = await body<Partial<Fund> & { meta?: Partial<FundMeta> }>(request);
    if (b.name !== undefined && !String(b.name).trim()) return fail(422, 'missing_name', 'نام صندوق الزامی است.');
    if (b.symbol !== undefined && !String(b.symbol).trim()) return fail(422, 'missing_symbol', 'نماد بورسی الزامی است.');
    if (b.feePct !== undefined && (!(b.feePct >= 0) || b.feePct > 5)) return fail(422, 'bad_fee', 'کارمزد باید بین ۰ تا ۵ درصد باشد.');
    if (b.settlement !== undefined && !['T+0', 'T+1', 'T+2'].includes(b.settlement)) return fail(422, 'bad_settlement', 'نوع تسویه معتبر نیست.');
    if (b.status !== undefined && !['active', 'paused', 'coming_soon'].includes(b.status)) return fail(422, 'bad_status', 'وضعیت صندوق معتبر نیست.');
    if (b.status === 'active' && f.nav <= 0) return fail(409, 'no_nav', 'پیش از فعال‌سازی، NAV اولیه صندوق باید از هسته معاملات ثبت شود.');
    const m = b.meta;
    if (m) {
      if (m.sellFeePct !== undefined && (!(m.sellFeePct >= 0) || m.sellFeePct > 5)) return fail(422, 'bad_fee', 'کارمزد فروش باید بین ۰ تا ۵ درصد باشد.');
      if (m.maxLtvPct !== undefined && (!(m.maxLtvPct >= 0) || m.maxLtvPct > 100)) return fail(422, 'bad_ltv', 'حداکثر نسبت وثیقه باید بین ۰ تا ۱۰۰ درصد باشد.');
      if (m.minBuy !== undefined && !(m.minBuy >= 0)) return fail(422, 'bad_min_buy', 'حداقل خرید معتبر نیست.');
    }
    const { meta, id, ...rest } = b;
    void id;
    Object.assign(f, rest);
    f.meta = { ...(f.meta as FundMeta), ...(meta ?? {}), updatedAt: nowIso(), updatedBy: operatorName(request) };
    return ok(f);
  }),

  // ═════════ products ═════════
  http.patch(p('/op/products/:id'), async ({ request, params }) => {
    await latency();
    const x = db().products.find((i) => i.id === params.id) as ProductX | undefined;
    if (!x) return fail(404, 'not_found', 'محصول پیدا نشد.');
    const b = await body<Partial<CreditProduct> & { meta?: Partial<ProductMeta> }>(request);
    const rateMin = b.rateMin ?? x.rateMin;
    const rateMax = b.rateMax ?? x.rateMax;
    if (!(rateMin >= 0) || !(rateMax >= 0) || rateMin > rateMax || rateMax > 60) return fail(422, 'bad_rate', 'بازه نرخ معتبر نیست.');
    if (b.maxPctOfAssets !== undefined && (!(b.maxPctOfAssets > 0) || b.maxPctOfAssets > 100)) return fail(422, 'bad_pct', 'سقف نسبت به دارایی آزاد باید بین ۱ تا ۱۰۰ درصد باشد.');
    if (b.monthsOptions !== undefined && !b.monthsOptions.length) return fail(422, 'no_months', 'دست‌کم یک گزینهٔ مدت را انتخاب کنید.');
    const m = b.meta;
    if (m?.minScore !== undefined && (m.minScore < 300 || m.minScore > 900)) return fail(422, 'bad_score', 'حداقل امتیاز اعتباری باید بین ۳۰۰ تا ۹۰۰ باشد.');
    if (m?.lockRatioPct !== undefined && (!(m.lockRatioPct > 0) || m.lockRatioPct > 100)) return fail(422, 'bad_pct', 'نسبت قفل باید بین ۱ تا ۱۰۰ درصد باشد.');
    const { meta, id, ...rest } = b;
    void id;
    Object.assign(x, rest);
    x.meta = { ...(x.meta ?? {}), ...(meta ?? {}), updatedAt: nowIso() };
    return ok(x);
  }),

  // ═════════ rules ═════════
  http.get(p('/op/rules/meta'), async () => { await latency(); return ok(rulesMeta()); }),
  http.post(p('/op/rules/batch'), async ({ request }) => {
    await latency();
    const b = await body<{ changes: RuleChange[] }>(request);
    if (!Array.isArray(b.changes)) return fail(422, 'bad_body', 'فهرست تغییرات معتبر نیست.');
    const res = applyRuleChanges(b.changes, operatorName(request));
    if (res.error) return fail(422, 'invalid_rule', res.error);
    return ok({ version: rulesMeta().version, rules: db().rules, history: res.history });
  }),
  http.patch(p('/op/rules/:id'), async ({ request, params }) => {
    await latency();
    const r = db().rules.find((i) => i.id === params.id);
    if (!r) return fail(404, 'not_found', 'قانون پیدا نشد.');
    const b = await body<Partial<PlatformRule>>(request);
    const res = applyRuleChanges([{ id: r.id, enabled: b.enabled, value: b.value }], operatorName(request));
    if (res.error) return fail(422, 'invalid_rule', res.error);
    return ok(r);
  }),

  // ═════════ requests ═════════
  http.get(p('/op/requests/meta'), async () => {
    await latency();
    return ok(Object.fromEntries(db().requests.map((r) => [r.id, metaOf(r)])));
  }),
  http.patch(p('/op/requests/:id/meta'), async ({ request, params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    const b = await body<{ checks: boolean[] }>(request);
    const m = metaOf(r);
    m.checks = Array.isArray(b.checks) ? b.checks.map(Boolean) : m.checks;
    reqMetaStore()[r.id] = m;
    return ok(m);
  }),
  http.post(p('/op/requests/:id/decision'), async ({ request, params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    if (r.status !== 'pending') return fail(409, 'already_decided', 'برای این درخواست قبلاً تصمیم گرفته شده است.');
    const b = await body<{ approve: boolean; note?: string }>(request);
    r.status = b.approve ? 'approved' : 'rejected';
    r.note = b.note?.trim() || (b.approve ? undefined : r.note);
    r.decidedAt = nowIso();
    r.decidedBy = operatorName(request);
    const ud = db().users[r.requesterId];
    if (ud) {
      ledger.notify(ud, b.approve
        ? { title: 'درخواست شما تأیید شد', body: r.title, tone: 'success', icon: 'check' }
        : { title: 'درخواست شما رد شد', body: r.note ? r.note : r.title, tone: 'error', icon: 'close', href: '/app/support' });
    }
    return ok(r);
  }),
  http.post(p('/op/requests/:id/reopen'), async ({ params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    if (r.status === 'pending') return fail(409, 'already_pending', 'این درخواست هنوز در انتظار بررسی است.');
    r.status = 'pending';
    delete r.decidedAt;
    delete r.decidedBy;
    delete r.note;
    return ok(r);
  }),
  http.post(p('/op/requests/:id/escalate'), async ({ params }) => {
    await latency();
    const r = db().requests.find((x) => x.id === params.id);
    if (!r) return fail(404, 'not_found', 'درخواست پیدا نشد.');
    const exists = db().riskAlerts.find((a) => (a.note ?? '').startsWith('ref:' + r.id + '|') && (a.status === 'open' || a.status === 'investigating'));
    if (exists) return fail(409, 'already_escalated', `این درخواست قبلاً با هشدار ${exists.id} به ریسک ارجاع شده است.`);
    const m = metaOf(r);
    const max = db().riskAlerts.reduce((s, a) => Math.max(s, Number(a.id.replace(/\D/g, '')) || 0), 3300);
    const a: RiskAlert & { signals: string[] } = {
      id: 'AL-' + (max + 1), title: 'ارجاع درخواست ' + r.id + ' — ' + r.title, userId: r.requesterId, userName: r.requesterName, orgName: r.orgName,
      score: m.riskScore, severity: sevOf(m.riskScore), status: 'open', createdAt: nowIso(), amount: r.amount, note: 'ref:' + r.id + '|', signals: [],
    };
    db().riskAlerts.unshift(a);
    return ok(a);
  }),

  // ═════════ risk ═════════
  http.get(p('/op/risk/insights'), async () => {
    await latency();
    const alerts = db().riskAlerts;
    const today = now().toISOString().slice(0, 10);
    const todays = alerts.filter((a) => a.createdAt.slice(0, 10) === today);
    const openN = alerts.filter((a) => a.status === 'open' || a.status === 'investigating').length;
    const s = (db().extra.opRiskSeries ?? { critical: [], high: [], medium: [] }) as { critical: number[]; high: number[]; medium: number[] };
    const daily = Array.from({ length: 30 }, (_, i) => ({ date: daysFromNow(-29 + i), critical: s.critical[i] ?? 0, high: s.high[i] ?? 0, medium: s.medium[i] ?? 0 }));
    const last = daily[29];
    for (const a of todays) {
      if (a.severity === 'critical') last.critical += 1;
      else if (a.severity === 'high') last.high += 1;
      else last.medium += 1;
    }
    return ok({
      platformScore: Math.min(100, Math.round(40 + openN * 1.6)), platformScoreDelta: -3,
      suspiciousToday: 6 + todays.length, txToday: 17_200, alertsToday: todays.length,
      daily, legalHolds: [...liveLegalLocks(), ...legalRecords()],
    });
  }),
  http.post(p('/op/legal-holds/:id/release'), async ({ params }) => {
    await latency();
    const id = String(params.id);
    const rec = legalRecords().find((x) => x.id === id);
    if (rec) {
      if (rec.status === 'done') return fail(409, 'already_released', 'این مسدودی قبلاً رفع شده است.');
      if (rec.status !== 'pending') return fail(409, 'not_releasable', 'رفع مسدودی فقط پس از دریافت دستور رفع از مرجع ممکن است.');
      rec.status = 'done';
      rec.releasedAt = nowIso();
      return ok(rec);
    }
    for (const ud of Object.values(db().users)) {
      for (const h of ud.holdings) {
        const l = h.locks.find((x) => x.id === id && x.type === 'legal');
        if (!l) continue;
        h.locks = h.locks.filter((x) => x.id !== id);
        recalcHoldings(ud);
        ledger.notify(ud, { title: 'مسدودی قانونی حساب شما رفع شد', body: `${money(l.amount)} تومان از ${h.name} آزاد شد.`, tone: 'success', icon: 'unlock' });
        const out: LegalHold = { id, source: 'lock', userId: ud.profile.id, userName: ud.profile.fullName, reference: l.reference ?? '—', holding: h.name, reason: l.condition, amount: l.amount, createdAt: l.createdAt, status: 'done', releasedAt: nowIso() };
        return ok(out);
      }
    }
    return fail(404, 'not_found', 'مسدودی پیدا نشد.');
  }),

  // ═════════ reports ═════════
  http.get(p('/op/reports/extra'), async () => {
    await latency();
    const funds = db().funds as FundX[];
    const aumNow = funds.reduce((s, f) => s + f.aum, 0);
    const locked = funds.reduce((s, f) => s + (f.meta ? Object.values(f.meta.lockByType).reduce((a, b) => a + b, 0) : 0), 0);
    const shape = [312, 328, 341, 352, 366, 380, 396, 408, 421, 440, 458, 480];
    const inflow = [10, 16, 13, 11, 14, 14, 16, 12, 13, 19, 18, 22];
    const months12 = ['آذر', 'دی', 'بهمن', 'اسفند', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'];
    const st = sysStatus();
    const svc = st?.services ?? [];
    const pick = svc.filter((x) => x.id === 'svc-gw' || x.id === 'svc-core');
    const worst = [...svc].sort((a, b) => a.uptime - b.uptime)[0];
    if (worst && !pick.includes(worst)) pick.push(worst);
    const lastNav = funds.map((f) => f.meta?.lastNavAt ?? '').sort().pop() || nowIso();
    return ok({
      aumMonthly: months12.map((month, i) => ({ month, aum: Math.round((shape[i] / 480) * aumNow), inflow: inflow[i] * 1e9 })),
      lockedValue: locked,
      credit: ['خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان'].map((month, i) => ({ month, disbursed: [2.1, 2.4, 2.2, 2.8, 3.0, 3.4][i] * 1e9, collected: [1.2, 1.4, 1.6, 1.7, 1.9, 2.1][i] * 1e9 })),
      creditOutstanding: db().products.reduce((s, x) => s + x.outstanding, 0),
      creditDeltaPct: 12,
      orgCount: db().organizations.length,
      newOrgs: db().organizations.filter((o) => o.status === 'onboarding').length,
      sla: { overall: svc.length ? Math.round((svc.reduce((s, x) => s + x.uptime, 0) / svc.length) * 10) / 10 : 100, delta: -0.2, services: pick.map((x) => ({ name: x.name, uptime: x.uptime, status: x.status })) },
      updated: { aum: lastNav, credit: daysFromNow(0, '08:00'), orgs: daysFromNow(-1, '18:00') },
      schedules: schedules(),
    });
  }),
  http.post(p('/op/reports/schedules'), async ({ request }) => {
    await latency();
    const b = await body<{ name: string; period: string; recipients: string; format: 'PDF' | 'XLSX' }>(request);
    if (!b.name?.trim()) return fail(422, 'missing_name', 'عنوان گزارش الزامی است.');
    if (!b.recipients?.trim()) return fail(422, 'missing_recipients', 'گیرندگان گزارش را مشخص کنید.');
    const days = b.period?.startsWith('روزانه') ? 1 : b.period?.startsWith('هفتگی') ? 7 : 30;
    const s: ReportSchedule = { id: newId('sch'), name: b.name.trim(), period: b.period || 'هفتگی', recipients: b.recipients.trim(), format: b.format === 'XLSX' ? 'XLSX' : 'PDF', nextAt: daysFromNow(days, '08:00'), enabled: true };
    schedules().unshift(s);
    return ok(s, { status: 201 });
  }),
  http.patch(p('/op/reports/schedules/:id'), async ({ request, params }) => {
    await latency();
    const s = schedules().find((x) => x.id === params.id);
    if (!s) return fail(404, 'not_found', 'زمان‌بندی پیدا نشد.');
    const b = await body<{ enabled: boolean }>(request);
    s.enabled = !!b.enabled;
    return ok(s);
  }),

  // ═════════ settings ═════════
  http.get(p('/op/system-status'), async () => {
    await latency();
    return sysStatus() ? ok(sysStatus()) : fail(503, 'not_seeded', 'داده‌های نمایشی قدیمی است؛ از «حساب من» داده‌های نمایشی را بازنشانی کنید.');
  }),
  http.post(p('/op/system-status/refresh'), async () => {
    await latency();
    const st = sysStatus();
    if (!st) return fail(503, 'not_seeded', 'داده‌های نمایشی قدیمی است؛ از «حساب من» داده‌های نمایشی را بازنشانی کنید.');
    const n = Number(db().extra.opStatusTicks ?? 0) + 1;
    db().extra.opStatusTicks = n;
    st.checkedAt = new Date(now().getTime() + n * 60000).toISOString();
    for (const s of st.services) if (s.latencyMs !== null) s.latencyMs = Math.max(8, Math.round(s.latencyMs * (0.9 + ((n * 7 + s.name.length) % 5) / 20)));
    return ok(st);
  }),
  http.post(p('/op/settings/team'), async ({ request }) => {
    await latency();
    const b = await body<{ name: string; email: string; roleKey: OpTeamMember['roleKey'] }>(request);
    const name = (b.name ?? '').trim();
    const email = (b.email ?? '').trim().toLowerCase();
    if (name.length < 3) return fail(422, 'bad_name', 'نام و نام خانوادگی را کامل وارد کنید.');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(422, 'bad_email', 'ایمیل سازمانی معتبر نیست.');
    const team = (settings().team ??= []);
    if (team.some((m) => m.email.toLowerCase() === email)) return fail(409, 'duplicate_email', 'کاربری با این ایمیل قبلاً اضافه شده است.');
    const roles: Record<string, string> = { pm: 'مدیر محصول', fin: 'مالی', risk: 'ریسک', sup: 'پشتیبانی' };
    const roleKey = b.roleKey && roles[b.roleKey] ? b.roleKey : 'sup';
    team.push({ id: newId('op'), name, email, roleKey, role: roles[roleKey], status: 'invited' });
    return ok(settings());
  }),
  http.patch(p('/op/settings/team/:id'), async ({ request, params }) => {
    await latency();
    const team = settings().team ?? [];
    const m = team.find((x) => x.id === params.id);
    if (!m) return fail(404, 'not_found', 'کاربر پیدا نشد.');
    if (m.id === 'op-301') return fail(422, 'owner_locked', 'مالک پنل را نمی‌توان غیرفعال کرد');
    const b = await body<{ status: 'active' | 'inactive' }>(request);
    m.status = b.status === 'active' ? (m.lastLoginAt ? 'active' : 'invited') : 'inactive';
    return ok(settings());
  }),
  http.post(p('/op/settings/api-key/rotate'), async () => {
    await latency();
    const s = settings();
    s.apiKeyMasked = 'nm_live_•••• ' + Math.random().toString(16).slice(2, 6).toUpperCase();
    s.apiKeyCreatedAt = nowIso();
    return ok(s);
  }),
  http.post(p('/op/settings/sessions/revoke'), async () => {
    await latency();
    const s = settings();
    s.activeSessions = 1;
    s.activeDevices = 1;
    return ok(s);
  }),
];
