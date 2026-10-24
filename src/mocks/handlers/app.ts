/** Employee app endpoints (/me/*, /funds, /stores, /support). */
import { http } from 'msw';
import type {
  AllocationSplit, AssetKind, Holding, InstallmentPlanOption, Lock, LoanQuote, Portfolio, Transaction,
} from '@/types/domain';
import { db, fund, newId, recalcHoldings, trackingCode, userData, type UserData } from '../db';
import { body, fail, latency, ok, p, qs, who } from '../http';
import { now, jalaliToIso } from '@/lib/clock';
import { faDigits, money } from '@/lib/format';

const nowIso = () => now().toISOString();

function u(req: Request): UserData {
  return userData(who(req, 'employee').userId);
}

function holding(ud: UserData, kind: AssetKind): Holding {
  let h = ud.holdings.find((x) => x.kind === kind);
  if (!h) {
    const f = fund(kind);
    h = { kind, fundId: kind, name: f.name, units: 0, value: 0, free: 0, locked: 0, change: 0, changePct: 0, locks: [] };
    ud.holdings.push(h);
  }
  return h;
}

export function portfolioOf(ud: UserData): Portfolio {
  recalcHoldings(ud);
  const total = ud.holdings.reduce((s, h) => s + h.value, 0);
  const locked = ud.holdings.reduce((s, h) => s + h.locked, 0);
  const change = ud.holdings.filter((h) => h.kind !== 'rial').reduce((s, h) => s + h.change, 0);
  return {
    total, free: total - locked, locked,
    changeToday: change, changeTodayPct: total ? (change / (total - change)) * 100 : 0,
    holdings: ud.holdings, updatedAt: nowIso(),
  };
}

function addTx(ud: UserData, t: Omit<Transaction, 'id' | 'trackingCode' | 'at' | 'status'> & Partial<Pick<Transaction, 'status' | 'at'>>) {
  const tx: Transaction = { id: newId('tx'), trackingCode: trackingCode(), at: nowIso(), status: 'success', ...t, title: faDigits(t.title), subtitle: faDigits(t.subtitle) };
  ud.transactions.unshift(tx);
  return tx;
}

function notify(ud: UserData, n: { title: string; body: string; tone: 'primary' | 'success' | 'warning' | 'info' | 'secondary' | 'error' | 'default'; icon: string; href?: string }) {
  ud.notifications.unshift({ id: newId('nt'), at: nowIso(), read: false, ...n, title: faDigits(n.title), body: faDigits(n.body) });
}

/** Adds `amount` Toman to a holding (buys units at NAV for funds). */
function credit(ud: UserData, kind: AssetKind, amount: number) {
  const h = holding(ud, kind);
  if (kind === 'rial') h.value += amount;
  else h.units = (h.units ?? 0) + amount / fund(kind).nav;
  recalcHoldings(ud);
}

function debit(ud: UserData, kind: AssetKind, amount: number) {
  const h = holding(ud, kind);
  recalcHoldings(ud);
  if (amount > h.free + 1) return false;
  if (kind === 'rial') h.value -= amount;
  else h.units = Math.max(0, (h.units ?? 0) - amount / fund(kind).nav);
  recalcHoldings(ud);
  return true;
}

function addLock(ud: UserData, kind: AssetKind, lock: Omit<Lock, 'id' | 'holdingKind' | 'createdAt'>) {
  const l: Lock = { id: newId('lk'), holdingKind: kind, createdAt: nowIso(), ...lock };
  holding(ud, kind).locks.push(l);
  recalcHoldings(ud);
  return l;
}

const LIMIT_PCT = 0.4;
function loanCapacity(ud: UserData) {
  const pf = portfolioOf(ud);
  return Math.floor((pf.free * LIMIT_PCT) / 10000) * 10000;
}

export const appHandlers = [
  // ───────── profile ─────────
  http.get(p('/me'), async ({ request }) => { await latency(); return ok(u(request).profile); }),
  http.patch(p('/me/profile'), async ({ request }) => {
    await latency();
    const ud = u(request);
    Object.assign(ud.profile, await body(request));
    return ok(ud.profile);
  }),
  http.post(p('/me/password'), async ({ request }) => {
    await latency();
    const b = await body<{ current?: string; next: string }>(request);
    if (!b.next || b.next.length < 8) return fail(422, 'weak_password', 'رمز عبور باید حداقل ۸ کاراکتر باشد.');
    u(request).passwordSet = true;
    return ok({ ok: true });
  }),

  // ───────── portfolio & funds ─────────
  http.get(p('/me/portfolio'), async ({ request }) => { await latency(); return ok(portfolioOf(u(request))); }),
  http.get(p('/me/holdings/:kind'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    portfolioOf(ud);
    const h = ud.holdings.find((x) => x.kind === params.kind);
    if (!h) return fail(404, 'not_found', 'دارایی پیدا نشد.');
    const f = h.fundId ? db().funds.find((x) => x.id === h.fundId) : undefined;
    const txs = ud.transactions.filter((t) => t.holdingKind === h.kind).slice(0, 10);
    return ok({ holding: h, fund: f, transactions: txs });
  }),
  http.get(p('/funds'), async () => { await latency(); return ok(db().funds.map(({ history, ...f }) => { void history; return f; })); }),
  http.get(p('/funds/:id'), async ({ params }) => {
    await latency();
    const f = db().funds.find((x) => x.id === params.id);
    return f ? ok(f) : fail(404, 'not_found', 'صندوق پیدا نشد.');
  }),

  // ───────── inbox ─────────
  http.get(p('/me/inbox'), async ({ request }) => {
    await latency();
    const status = qs(request).get('status');
    const items = u(request).inbox.filter((x) => !status || x.status === status);
    return ok(items);
  }),
  http.get(p('/me/inbox/:id'), async ({ request, params }) => {
    await latency();
    const x = u(request).inbox.find((i) => i.id === params.id);
    return x ? ok(x) : fail(404, 'not_found', 'بسته پیدا نشد.');
  }),
  http.post(p('/me/inbox/:id/accept'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    const pkg = ud.inbox.find((i) => i.id === params.id);
    if (!pkg) return fail(404, 'not_found', 'بسته پیدا نشد.');
    if (pkg.status !== 'pending') return fail(409, 'already_accepted', 'این بسته قبلاً تأیید شده است.');
    const b = await body<{ split?: AllocationSplit }>(request);
    const split: AllocationSplit = pkg.allocationMode === 'fixed' ? pkg.fixedSplit! : b.split ?? { gold: 50, fixed: 50 };
    const sum = (split.gold ?? 0) + (split.fixed ?? 0) + (split.rial ?? 0);
    if (Math.round(sum) !== 100) return fail(422, 'bad_split', 'جمع تخصیص باید ۱۰۰٪ باشد.');
    if ((split.rial ?? 0) > 0 && !pkg.cashAllowed) return fail(422, 'cash_not_allowed', 'این بسته فقط به صندوق‌ها تخصیص داده می‌شود و سهم ریالی ندارد.');
    const parts: [AssetKind, number][] = [['gold', split.gold], ['fixed', split.fixed], ['rial', split.rial ?? 0]];
    for (const [kind, pct] of parts) {
      if (!pct) continue;
      const amt = Math.round((pkg.amount * pct) / 100);
      credit(ud, kind, amt);
      const lp = pkg.lockPolicy;
      if (kind !== 'rial' && lp.type === 'vesting') {
        addLock(ud, kind, { type: 'vesting', amount: amt, title: pkg.title, condition: 'آزاد در ' + jDateFa(lp.releaseAt), releaseAt: lp.releaseAt, sourceId: pkg.packageId });
      }
      if (kind !== 'rial' && lp.type === 'milestone') {
        addLock(ud, kind, {
          type: 'milestone', amount: amt, title: pkg.title, condition: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود', sourceId: pkg.packageId, contractTotal: amt,
          steps: lp.steps.map((s, i) => ({ id: `ms-${i + 1}`, title: s.title, sharePct: s.sharePct, dueDate: s.dueDate, requiresApproval: s.requiresApproval !== false, status: i === 0 ? 'pending_approval' : 'future' })),
        });
      }
    }
    pkg.status = 'accepted';
    pkg.acceptedAt = nowIso();
    pkg.acceptedSplit = split;
    const tx = addTx(ud, { category: 'inbox', title: `دریافت ${pkg.title} — ${pkg.orgName}`, subtitle: 'تأیید دریافت', amount: pkg.amount, lockType: pkg.lockPolicy.type === 'none' ? undefined : pkg.lockPolicy.type, lockEvent: pkg.lockPolicy.type === 'none' ? undefined : 'locked' });
    // reflect on the organization side
    for (const list of Object.values(db().orgPackages)) {
      const op = list.find((x) => x.id === pkg.packageId);
      const r = op?.recipients.find((x) => x.employeeId === ud.profile.id);
      if (r) { r.status = 'accepted'; r.acceptedAt = nowIso(); }
    }
    return ok({ transaction: tx, portfolio: portfolioOf(ud), package: pkg });
  }),

  // ───────── transactions ─────────
  http.get(p('/me/transactions'), async ({ request }) => {
    await latency();
    const q = qs(request);
    const cat = q.get('category');
    const kind = q.get('holding');
    const text = q.get('q');
    let list = u(request).transactions;
    if (cat && cat !== 'all') list = list.filter((t) => t.category === cat || (cat === 'lock' && !!t.lockType));
    if (kind) list = list.filter((t) => t.holdingKind === kind);
    if (text) list = list.filter((t) => t.title.includes(text) || t.subtitle.includes(text));
    const limit = Number(q.get('limit') || 0);
    return ok(limit ? list.slice(0, limit) : list);
  }),
  http.get(p('/me/transactions/:id'), async ({ request, params }) => {
    await latency();
    const t = u(request).transactions.find((x) => x.id === params.id || x.trackingCode === params.id);
    return t ? ok(t) : fail(404, 'not_found', 'تراکنش پیدا نشد.');
  }),

  // ───────── notifications ─────────
  http.get(p('/me/notifications'), async ({ request }) => { await latency(); return ok(u(request).notifications); }),
  http.post(p('/me/notifications/read-all'), async ({ request }) => {
    await latency();
    u(request).notifications.forEach((n) => { n.read = true; });
    return ok({ ok: true });
  }),
  http.post(p('/me/notifications/:id/read'), async ({ request, params }) => {
    await latency();
    const n = u(request).notifications.find((x) => x.id === params.id);
    if (n) n.read = true;
    return ok({ ok: true });
  }),

  // ───────── trades (rial ⇄ fund) ─────────
  http.post(p('/me/trades'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ direction: 'buy' | 'sell'; fundId: string; amount: number }>(request);
    const f = db().funds.find((x) => x.id === b.fundId);
    if (!f || f.status !== 'active') return fail(422, 'fund_unavailable', 'این صندوق در حال حاضر قابل معامله نیست.');
    if (!(b.amount > 0)) return fail(422, 'bad_amount', 'مبلغ معتبر نیست.');
    if (ud.profile.kycLevel < 3) return fail(403, 'kyc_required', 'خرید و فروش صندوق نیازمند احراز هویت سطح ۳ (سجام) است.', { requiredLevel: 3 });
    const fee = Math.round(b.amount * (f.feePct / 100));
    if (b.direction === 'buy') {
      if (!debit(ud, 'rial', b.amount)) return fail(422, 'insufficient_free', 'موجودی آزاد کیف پول ریالی کافی نیست.');
      credit(ud, f.kind, b.amount - fee);
      const tx = addTx(ud, { category: 'trade', title: 'خرید ' + f.name, subtitle: f.symbol, amount: -b.amount, units: (b.amount - fee) / f.nav, holdingKind: f.kind, details: [{ label: 'کارمزد', value: money(fee) + ' تومان' }, { label: 'NAV', value: money(f.nav) }] });
      return ok(tx);
    }
    if (!debit(ud, f.kind, b.amount)) return fail(422, 'insufficient_free', 'بخش آزاد این صندوق کافی نیست.');
    credit(ud, 'rial', b.amount - fee);
    const tx = addTx(ud, { category: 'trade', title: 'فروش ' + f.name, subtitle: f.symbol + ' · واریز به کیف پول ریالی', amount: b.amount - fee, units: -(b.amount / f.nav), holdingKind: f.kind, status: 'pending', details: [{ label: 'کارمزد', value: money(fee) + ' تومان' }, { label: 'تسویه', value: f.settlement }] });
    return ok(tx);
  }),

  // ───────── deposit / withdraw ─────────
  http.post(p('/me/deposits'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ amount: number; destination: AssetKind }>(request);
    if (!(b.amount >= 10_000)) return fail(422, 'bad_amount', 'حداقل مبلغ واریز ۱۰٬۰۰۰ تومان است.');
    const dest = b.destination || 'rial';
    credit(ud, dest, b.amount);
    const tx = addTx(ud, { category: 'rial', title: dest === 'rial' ? 'واریز از کارت بانکی' : 'واریز و خرید ' + fund(dest).name, subtitle: 'شاپرک · ' + (dest === 'rial' ? 'کیف پول ریالی' : fund(dest).name), amount: b.amount, holdingKind: dest });
    return ok(tx);
  }),
  http.post(p('/me/withdrawals'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ amount: number; bankAccountId?: string }>(request);
    if (!(b.amount > 0)) return fail(422, 'bad_amount', 'مبلغ معتبر نیست.');
    if (!debit(ud, 'rial', b.amount)) return fail(422, 'insufficient_free', 'مبلغ از موجودی قابل برداشت بیشتر است.');
    const acc = ud.bankAccounts.find((a) => a.id === b.bankAccountId) ?? ud.bankAccounts.find((a) => a.isDefault);
    const tx = addTx(ud, { category: 'rial', title: 'برداشت به حساب بانکی', subtitle: acc ? acc.bankName : 'کیف پول ریالی', amount: -b.amount, holdingKind: 'rial', status: 'pending', details: acc ? [{ label: 'شبا', value: acc.iban }] : undefined });
    return ok(tx);
  }),
  http.get(p('/me/bank-accounts'), async ({ request }) => { await latency(); return ok(u(request).bankAccounts); }),
  http.post(p('/me/bank-accounts'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ iban: string; bankName?: string }>(request);
    if (!/^IR\d{24}$/.test((b.iban || '').replace(/\s/g, ''))) return fail(422, 'bad_iban', 'شماره شبا معتبر نیست.');
    const acc = { id: newId('ba'), bankName: b.bankName || 'بانک', iban: b.iban.replace(/\s/g, ''), ownerName: ud.profile.fullName, isDefault: false, verified: true };
    ud.bankAccounts.push(acc);
    return ok(acc);
  }),
  http.post(p('/me/bank-accounts/:id/default'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    ud.bankAccounts.forEach((a) => { a.isDefault = a.id === params.id; });
    return ok(ud.bankAccounts);
  }),

  // ───────── credit & loans ─────────
  http.get(p('/me/credit'), async ({ request }) => {
    await latency();
    const ud = u(request);
    ud.credit.loanMax = loanCapacity(ud);
    if (ud.card) { ud.credit.creditLimit = ud.card.creditLimit; ud.credit.creditUsed = ud.card.creditUsed; }
    return ok(ud.credit);
  }),
  http.get(p('/me/loans'), async ({ request }) => { await latency(); return ok(u(request).loans); }),
  http.get(p('/me/loans/:id'), async ({ request, params }) => {
    await latency();
    const l = u(request).loans.find((x) => x.id === params.id);
    return l ? ok(l) : fail(404, 'not_found', 'وام پیدا نشد.');
  }),
  http.post(p('/me/loans/quote'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ amount: number; months: number; collateralKind?: AssetKind }>(request);
    const rate = b.months <= 6 ? 16 : b.months <= 12 ? 18 : 21;
    const r = rate / 1200;
    const monthly = Math.round((b.amount * r) / (1 - Math.pow(1 + r, -b.months)) / 1000) * 1000;
    const kind = b.collateralKind ?? 'gold';
    const q: LoanQuote = { amount: b.amount, months: b.months, ratePct: rate, monthlyPayment: monthly, totalRepay: monthly * b.months, collateral: [{ holdingKind: kind, amount: b.amount }] };
    if (b.amount > loanCapacity(ud)) return fail(422, 'over_limit', 'مبلغ از سقف وام (۴۰٪ دارایی آزاد) بیشتر است.', { max: loanCapacity(ud), quote: q });
    return ok(q);
  }),
  http.post(p('/me/loans'), async ({ request }) => {
    await latency();
    const ud = u(request);
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای وام، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    if (ud.loans.some((l) => l.status === 'active')) return fail(409, 'active_loan', 'در هر زمان فقط یک وام فعال مجاز است.');
    const b = await body<{ amount: number; months: number; collateralKind?: AssetKind }>(request);
    if (b.amount > loanCapacity(ud)) return fail(422, 'over_limit', 'مبلغ از سقف وام بیشتر است.');
    const kind = b.collateralKind ?? 'gold';
    const h = holding(ud, kind);
    if (h.free < b.amount) return fail(422, 'insufficient_collateral', 'بخش آزاد این دارایی برای پشتوانه‌ی این مبلغ کافی نیست؛ دارایی دیگری انتخاب کنید یا مبلغ را کمتر کنید.');
    const rate = b.months <= 6 ? 16 : b.months <= 12 ? 18 : 21;
    const r = rate / 1200;
    const monthly = Math.round((b.amount * r) / (1 - Math.pow(1 + r, -b.months)) / 1000) * 1000;
    const id = newId('loan');
    const lock = addLock(ud, kind, { type: 'collateral', amount: b.amount, title: 'پشتوانه‌ی وام', condition: 'آزاد با تسویه وام', sourceId: id, paidCount: 0, totalCount: b.months });
    const start = now();
    const loan = {
      id, principal: b.amount, months: b.months, ratePct: rate, monthlyPayment: monthly, startedAt: start.toISOString(),
      collateral: { holdingKind: kind, amount: b.amount, lockId: lock.id }, status: 'active' as const,
      installments: Array.from({ length: b.months }, (_, i) => ({ n: i + 1, dueDate: new Date(start.getTime() + (i + 1) * 30 * 86400000).toISOString(), amount: monthly, status: (i === 0 ? 'due' : 'upcoming') as 'due' | 'upcoming' })),
    };
    ud.loans.unshift(loan);
    credit(ud, 'rial', b.amount);
    addTx(ud, { category: 'loan', title: 'واریز وام', subtitle: `${b.months} ماهه · کیف پول ریالی`, amount: b.amount, holdingKind: 'rial' });
    addTx(ud, { category: 'lock', title: 'رزرو پشتوانه‌ی وام — ' + h.name, subtitle: 'آزاد با تسویه وام', amount: b.amount, holdingKind: kind, lockType: 'collateral', lockEvent: 'locked' });
    ud.credit.activeLoanId = id;
    notify(ud, { title: 'وام شما فعال شد', body: `${money(b.amount)} تومان به کیف پول ریالی واریز شد`, tone: 'success', icon: 'check', href: '/app/credit' });
    return ok(loan);
  }),
  http.post(p('/me/loans/:id/pay'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    const loan = ud.loans.find((x) => x.id === params.id);
    if (!loan) return fail(404, 'not_found', 'وام پیدا نشد.');
    const b = await body<{ count?: number; source?: AssetKind }>(request);
    const count = Math.max(1, b.count ?? 1);
    const open = loan.installments.filter((i) => i.status !== 'paid').slice(0, count);
    const total = open.reduce((s, i) => s + i.amount, 0);
    const src = b.source ?? 'rial';
    if (!debit(ud, src, total)) return fail(422, 'insufficient_free', 'موجودی آزاد برای پرداخت کافی نیست.');
    open.forEach((i) => { i.status = 'paid'; i.paidAt = nowIso(); });
    const next = loan.installments.find((i) => i.status !== 'paid');
    if (next) next.status = 'due';
    const paid = loan.installments.filter((i) => i.status === 'paid').length;
    const lock = ud.holdings.flatMap((h) => h.locks).find((l) => l.id === loan.collateral.lockId);
    if (lock) lock.paidCount = paid;
    const tx = addTx(ud, { category: 'loan', title: `قسط وام — ${paid} از ${loan.months}`, subtitle: 'از ' + holding(ud, src).name, amount: -total, holdingKind: src });
    if (!next) {
      loan.status = 'settled';
      ud.credit.activeLoanId = undefined;
      for (const h of ud.holdings) h.locks = h.locks.filter((l) => l.id !== loan.collateral.lockId);
      recalcHoldings(ud);
      addTx(ud, { category: 'lock', title: 'آزادسازی پشتوانه‌ی وام', subtitle: 'تسویه کامل وام', amount: loan.collateral.amount, holdingKind: loan.collateral.holdingKind, lockType: 'collateral', lockEvent: 'released' });
      notify(ud, { title: 'وام تسویه شد', body: `${money(loan.collateral.amount)} تومان از پشتوانه‌ی وام آزاد شد`, tone: 'success', icon: 'unlock', href: '/app/history' });
    }
    return ok(tx);
  }),

  // ───────── card ─────────
  http.get(p('/me/card'), async ({ request }) => {
    await latency();
    const c = u(request).card;
    return c ? ok(c) : fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
  }),
  http.patch(p('/me/card/settings'), async ({ request }) => {
    await latency();
    const c = u(request).card!;
    Object.assign(c.settings, await body(request));
    return ok(c);
  }),
  http.post(p('/me/card/freeze'), async ({ request }) => {
    await latency();
    const c = u(request).card!;
    const b = await body<{ frozen: boolean }>(request);
    c.status = b.frozen ? 'frozen' : 'active';
    return ok(c);
  }),
  http.post(p('/me/card/charge'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card!;
    const b = await body<{ amount: number }>(request);
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای اعتبار کارت، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    if (b.amount > c.creditLimit - c.creditUsed) return fail(422, 'over_limit', 'مبلغ از اعتبار در دسترس بیشتر است.');
    c.creditUsed += b.amount;
    c.balance += b.amount;
    c.statementAmount = c.creditUsed;
    const tx = addTx(ud, { category: 'card', title: 'شارژ کارت از اعتبار', subtitle: 'کارت نمادنو', amount: b.amount });
    return ok({ card: c, transaction: tx });
  }),
  http.post(p('/me/card/settle'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card!;
    const b = await body<{ amount: number }>(request);
    const amt = Math.min(b.amount, c.creditUsed);
    if (!debit(ud, 'rial', amt)) return fail(422, 'insufficient_free', 'موجودی آزاد کیف پول ریالی کافی نیست.');
    c.creditUsed -= amt;
    c.statementAmount = c.creditUsed;
    const tx = addTx(ud, { category: 'card', title: 'تسویه صورت‌حساب کارت', subtitle: 'از کیف پول ریالی', amount: -amt, holdingKind: 'rial' });
    return ok({ card: c, transaction: tx });
  }),
  http.post(p('/me/card/otp'), async () => {
    await latency();
    return ok({ code: String(Math.floor(100000 + Math.random() * 900000)), expiresIn: 120 });
  }),

  // ───────── installments ─────────
  http.get(p('/stores'), async () => { await latency(); return ok(db().stores); }),
  http.get(p('/stores/:id'), async ({ params }) => {
    await latency();
    const s = db().stores.find((x) => x.id === params.id);
    return s ? ok(s) : fail(404, 'not_found', 'فروشگاه پیدا نشد.');
  }),
  http.post(p('/me/installments/quote'), async ({ request }) => {
    await latency();
    const b = await body<{ storeId: string; price: number }>(request);
    const s = db().stores.find((x) => x.id === b.storeId);
    if (!s) return fail(404, 'not_found', 'فروشگاه پیدا نشد.');
    const options: InstallmentPlanOption[] = [3, 6, 9, 12].filter((m) => m <= s.maxMonths).map((m) => {
      const pre = Math.round(b.price * 0.1 / 1000) * 1000;
      const fee = s.feePct * (m / 3);
      const rest = (b.price - pre) * (1 + fee / 100);
      const monthly = Math.round(rest / m / 1000) * 1000;
      return { months: m, prepayment: pre, monthly, feePct: Math.round(fee * 10) / 10, totalPay: pre + monthly * m, collateral: [{ holdingKind: 'gold', amount: Math.round((b.price - pre) / 1000) * 1000 }] };
    });
    return ok(options);
  }),
  http.get(p('/me/installments'), async ({ request }) => { await latency(); return ok(u(request).installments); }),
  http.post(p('/me/installments'), async ({ request }) => {
    await latency();
    const ud = u(request);
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای خرید اقساطی، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    const b = await body<{ storeId: string; title: string; price: number; months: number; monthly: number; prepayment?: number; collateralKind?: AssetKind }>(request);
    const s = db().stores.find((x) => x.id === b.storeId);
    if (!s) return fail(404, 'not_found', 'فروشگاه پیدا نشد.');
    const kind = b.collateralKind ?? 'gold';
    const lockAmt = b.price - (b.prepayment ?? 0);
    if (holding(ud, kind).free < lockAmt) return fail(422, 'insufficient_collateral', 'بخش آزاد این دارایی برای پشتوانه‌ی این مبلغ کافی نیست؛ دارایی دیگری انتخاب کنید یا مبلغ را کمتر کنید.');
    if (b.prepayment && !debit(ud, 'rial', b.prepayment)) return fail(422, 'insufficient_free', 'موجودی آزاد کیف پول ریالی برای پیش‌پرداخت کافی نیست.');
    const id = newId('inst');
    const lock = addLock(ud, kind, { type: 'installment', amount: lockAmt, title: 'خرید اقساطی ' + s.name, condition: 'با پرداخت هر قسط، بخشی آزاد می‌شود', sourceId: id, paidCount: 0, totalCount: b.months });
    const code = 'BN-' + Math.floor(10000 + Math.random() * 89999);
    const purchase = { id, storeId: s.id, storeName: s.name, title: b.title, price: b.price, months: b.months, monthly: b.monthly, paidCount: 0, purchaseCode: code, createdAt: nowIso(), lockId: lock.id };
    ud.installments.unshift(purchase);
    addTx(ud, { category: 'installment', title: 'خرید اقساطی — ' + s.name, subtitle: `${b.months} قسط · پشتوانه‌ی ${holding(ud, kind).name}`, amount: -(b.prepayment ?? 0) });
    addTx(ud, { category: 'lock', title: 'رزرو پشتوانه‌ی خرید اقساطی', subtitle: holding(ud, kind).name, amount: lockAmt, holdingKind: kind, lockType: 'installment', lockEvent: 'locked' });
    return ok(purchase);
  }),

  // ───────── KYC ─────────
  http.post(p('/me/kyc/level2'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ birthDate: string }>(request);
    if (!b.birthDate) return fail(422, 'bad_birth_date', 'تاریخ تولد را وارد کنید.');
    ud.profile.birthDate = b.birthDate;
    if (ud.profile.kycLevel < 2) ud.profile.kycLevel = 2;
    return ok({ level: ud.profile.kycLevel, fullName: ud.profile.fullName, fatherName: 'محمد', registryOffice: 'تهران' });
  }),
  http.post(p('/me/kyc/level3/request-otp'), async () => { await latency(); return ok({ sent: true, devCode: '12345', ttl: 120 }); }),
  http.post(p('/me/kyc/level3/verify'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ code: string }>(request);
    if (!b.code || b.code.length < 5) return fail(422, 'bad_code', 'کد سجام صحیح نیست.');
    ud.profile.kycLevel = 3;
    return ok({ level: 3 });
  }),

  // ───────── support ─────────
  http.get(p('/support/faq'), async () => { await latency(); return ok(db().faq); }),
  http.get(p('/me/tickets'), async ({ request }) => { await latency(); return ok(u(request).tickets); }),
  http.get(p('/me/tickets/:id'), async ({ request, params }) => {
    await latency();
    const t = u(request).tickets.find((x) => x.id === params.id);
    return t ? ok(t) : fail(404, 'not_found', 'تیکت پیدا نشد.');
  }),
  http.post(p('/me/tickets'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const b = await body<{ subject: string; text: string }>(request);
    const t = { id: 'SP-' + (4121 + ud.tickets.length), subject: b.subject || 'گفتگو با پشتیبانی', status: 'open' as const, createdAt: nowIso(), messages: [{ id: newId('m'), from: 'user' as const, text: b.text, at: nowIso() }] };
    ud.tickets.unshift(t);
    return ok(t);
  }),
  http.post(p('/me/tickets/:id/messages'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    const t = ud.tickets.find((x) => x.id === params.id);
    if (!t) return fail(404, 'not_found', 'تیکت پیدا نشد.');
    const b = await body<{ text: string }>(request);
    t.messages.push({ id: newId('m'), from: 'user', text: b.text, at: nowIso() });
    t.messages.push({ id: newId('m'), from: 'agent', text: 'پیام شما دریافت شد؛ همکاران ما به‌زودی پاسخ می‌دهند.', at: new Date(now().getTime() + 60000).toISOString() });
    return ok(t);
  }),
];

function jDateFa(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}/${g('month')}/${g('day')}`.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

// re-exported for org/op handlers that move money on the employee side
export const ledger = { credit, debit, addLock, addTx, notify, holding, portfolioOf };
void jalaliToIso;
