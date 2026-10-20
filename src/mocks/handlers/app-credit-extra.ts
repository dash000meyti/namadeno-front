/**
 * Mock endpoints owned by the "app-credit" area (credit, loans, card, installment purchase).
 * Registered before the core handlers, so the routes below override the core ones with the same path.
 *
 * GET  /me/credit/extra
 *      → CreditExtra { cardUnsecuredLimit, cardLocked, cardLockSources: AssetKind[], installmentLimit,
 *                      installmentOutstanding, installmentAvailable, scoreUpdatedAt, scoreNextUpdateAt }
 *
 * POST /me/loans                         (override: collateral may be split over several holdings)
 *      ← { amount, months, collateralKind?: AssetKind, collaterals?: AssetKind[] }   (greedy in the given order, FREE part only)
 *      → Loan   · errors: 403 kyc_required · 409 active_loan · 422 over_limit | insufficient_collateral | bad_amount
 *
 * POST /me/loans/:id/pay                 (override: source may be 'bank'; settlement releases every collateral lock of the loan)
 *      ← { count?: number, source?: AssetKind | 'bank' }
 *      → Transaction · errors: 404 not_found · 409 settled · 422 insufficient_free
 *
 * POST /me/installments/quote            (override: prepayment chosen by the user, collateral = 50% of the financed amount)
 *      ← { storeId, price, prepayment? }
 *      → InstallmentPlanOption[]
 *
 * POST /me/installments                  (override: 50% collateral, plan fields kept on the purchase)
 *      ← { storeId, productId?, title, price, months, monthly, prepayment?, collateralKind? }
 *      → InstallmentPurchase & { prepayment, collateralKind, collateralAmount, codeExpiresAt }
 *      · errors: 403 kyc_required · 422 insufficient_collateral | insufficient_free | over_limit
 *
 * POST /me/installments/:id/pay          (new)
 *      ← { count?: number, source?: AssetKind | 'bank' }
 *      → Transaction (each paid installment releases collateral/remaining of the purchase lock)
 *
 * POST /me/card/charge                   (override: usage above cardUnsecuredLimit is locked from FREE rial, then gold)
 *      ← { amount } → { card, transaction } · errors: 403 kyc_required · 409 card_blocked · 422 over_limit | insufficient_collateral
 *
 * POST /me/card/settle                   (override: source rial | fixed | bank; releases card locks above the unsecured part)
 *      ← { amount, source?: 'rial' | 'fixed' | 'bank' } → { card, transaction, released }
 *
 * POST /me/card/otp                      (override: 60 s validity)          → { code, expiresIn }
 * POST /me/card/otp/sms                  (new)                              → { sent: true, mobile }
 * POST /me/card/block                    (new, permanent block)             → { card, transaction }
 * POST /me/card/physical                 (new, physical card request)       → { transaction } · 409 already_requested
 */
import { http } from 'msw';
import type { HttpHandler } from 'msw';
import type { AssetKind, Card, InstallmentPlanOption, InstallmentPurchase, Loan, Transaction } from '@/types/domain';
import { db, fund, newId, recalcHoldings, userData, type UserData } from '../db';
import { body, fail, latency, ok, p, who } from '../http';
import { APP_CREDIT_DEFAULTS, type AppCreditExtraState } from '../seed/extra-app-credit';
import { ledger } from './app';
import { now } from '@/lib/clock';
import { faDigits, money } from '@/lib/format';

const nowIso = () => now().toISOString();
const DAY = 86_400_000;

function u(req: Request): UserData {
  return userData(who(req, 'employee').userId);
}

function cfg(): AppCreditExtraState {
  return { ...APP_CREDIT_DEFAULTS, ...((db().extra.appCredit as Partial<AppCreditExtraState>) ?? {}) };
}

const allLocks = (ud: UserData) => ud.holdings.flatMap((h) => h.locks);

function loanCapacity(ud: UserData) {
  const pf = ledger.portfolioOf(ud);
  return Math.floor((pf.free * 0.4) / 10000) * 10000;
}

const loanRate = (months: number) => (months <= 6 ? 16 : months <= 12 ? 18 : 21);
function loanMonthly(amount: number, months: number) {
  const r = loanRate(months) / 1200;
  return Math.round((amount * r) / (1 - Math.pow(1 + r, -months)) / 1000) * 1000;
}

/** Same plan formula the UI shows: fee grows with the term, collateral = 50% of the financed part. */
export function installmentOption(price: number, prepayment: number, months: number, feePctPer3m: number): InstallmentPlanOption {
  const financed = Math.max(0, price - prepayment);
  const fee = feePctPer3m * (months / 3);
  const monthly = Math.round((financed * (1 + fee / 100)) / months / 10000) * 10000;
  return { months, prepayment, monthly, feePct: Math.round(fee * 10) / 10, totalPay: prepayment + monthly * months, collateral: [{ holdingKind: 'fixed', amount: Math.round(financed / 2 / 1000) * 1000 }] };
}

type PurchaseX = InstallmentPurchase & { prepayment?: number; collateralKind?: AssetKind; collateralAmount?: number; codeExpiresAt?: string };

function installmentOutstanding(ud: UserData) {
  const ids = new Set(ud.installments.filter((i) => i.paidCount < i.months).map((i) => i.id));
  return allLocks(ud).filter((l) => l.type === 'installment' && l.sourceId && ids.has(l.sourceId)).reduce((s, l) => s + l.amount, 0);
}

// ───────── card collateral ─────────
function cardLocks(ud: UserData, card: Card) {
  return allLocks(ud).filter((l) => l.sourceId === card.id);
}
function cardLocked(ud: UserData, card: Card) {
  return cardLocks(ud, card).reduce((s, l) => s + l.amount, 0);
}
/** Free amount available for new card locks, from the configured sources. */
function cardLockCapacity(ud: UserData) {
  recalcHoldings(ud);
  return cfg().cardLockSources.reduce((s, k) => s + (ud.holdings.find((h) => h.kind === k)?.free ?? 0), 0);
}
/** Brings the card's locks to max(0, creditUsed − unsecured). Returns the signed change. */
function syncCardLocks(ud: UserData, card: Card): number {
  const target = Math.max(0, card.creditUsed - cfg().cardUnsecuredLimit);
  const current = cardLocked(ud, card);
  if (target > current) {
    let need = target - current;
    for (const kind of cfg().cardLockSources) {
      if (need <= 0) break;
      const h = ud.holdings.find((x) => x.kind === kind);
      if (!h) continue;
      recalcHoldings(ud);
      const take = Math.min(h.free, need);
      if (take <= 0) continue;
      const existing = h.locks.find((l) => l.sourceId === card.id);
      if (existing) existing.amount += take;
      else ledger.addLock(ud, kind as AssetKind, { type: 'collateral', amount: take, title: kind === 'rial' ? 'رزرو تسویه اعتبار کارت' : 'وثیقه اعتبار کارت', condition: 'آزاد با تسویه صورت‌حساب کارت', sourceId: card.id });
      need -= take;
    }
    recalcHoldings(ud);
    return target - current - need;
  }
  if (target < current) {
    let release = current - target;
    const locks = cardLocks(ud, card).reverse();
    for (const l of locks) {
      if (release <= 0) break;
      const r = Math.min(l.amount, release);
      l.amount -= r;
      release -= r;
    }
    for (const h of ud.holdings) h.locks = h.locks.filter((l) => !(l.sourceId === card.id && l.amount <= 0));
    recalcHoldings(ud);
    return -(current - target);
  }
  return 0;
}

function holdingName(ud: UserData, kind: string) {
  return ud.holdings.find((h) => h.kind === kind)?.name ?? (kind === 'rial' ? 'کیف پول ریالی' : fund(kind).name);
}

/** Debits a payment source. 'bank' = paid through the bank gateway (no wallet movement). */
function paySource(ud: UserData, source: string, amount: number): boolean {
  if (source === 'bank') return true;
  return ledger.debit(ud, source as AssetKind, amount);
}
const sourceLabel = (ud: UserData, source: string) => (source === 'bank' ? 'درگاه بانکی' : holdingName(ud, source));

export const appCreditHandlers: HttpHandler[] = [
  // ───────── summary used by credit / card / installment screens ─────────
  http.get(p('/me/credit/extra'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = cfg();
    ledger.portfolioOf(ud);
    const outstanding = installmentOutstanding(ud);
    return ok({
      cardUnsecuredLimit: c.cardUnsecuredLimit,
      cardLocked: ud.card ? cardLocked(ud, ud.card) : 0,
      cardLockSources: c.cardLockSources,
      installmentLimit: c.installmentLimit,
      installmentOutstanding: outstanding,
      installmentAvailable: Math.max(0, c.installmentLimit - outstanding),
      scoreUpdatedAt: c.scoreUpdatedAt,
      scoreNextUpdateAt: c.scoreNextUpdateAt,
    });
  }),

  // ───────── loans ─────────
  http.post(p('/me/loans'), async ({ request }) => {
    await latency();
    const ud = u(request);
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای وام، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    if (ud.loans.some((l) => l.status === 'active')) return fail(409, 'active_loan', 'در هر زمان فقط یک وام فعال مجاز است.', { loanId: ud.loans.find((l) => l.status === 'active')?.id });
    const b = await body<{ amount: number; months: number; collateralKind?: AssetKind; collaterals?: AssetKind[] }>(request);
    if (!(b.amount >= 5_000_000)) return fail(422, 'bad_amount', 'حداقل مبلغ وام ۵٬۰۰۰٬۰۰۰ تومان است.');
    if (![6, 12, 18].includes(b.months)) return fail(422, 'bad_months', 'مدت بازپرداخت معتبر نیست.');
    const cap = loanCapacity(ud);
    if (b.amount > cap) return fail(422, 'over_limit', 'مبلغ از سقف وام (۴۰٪ دارایی آزاد) بیشتر است.', { max: cap });
    const kinds = (b.collaterals?.length ? b.collaterals : [b.collateralKind ?? 'gold']).filter((k, i, a) => a.indexOf(k) === i && k !== 'rial');
    recalcHoldings(ud);
    const plan: { kind: AssetKind; take: number }[] = [];
    let left = b.amount;
    for (const k of kinds) {
      const h = ud.holdings.find((x) => x.kind === k);
      const take = Math.min(h?.free ?? 0, left);
      if (take > 0) { plan.push({ kind: k, take }); left -= take; }
    }
    if (left > 0) return fail(422, 'insufficient_collateral', 'بخش آزاد دارایی‌های انتخاب‌شده برای وثیقه کافی نیست.', { short: left });

    const rate = loanRate(b.months);
    const monthly = loanMonthly(b.amount, b.months);
    const id = newId('loan');
    const locks = plan.map((x) => ledger.addLock(ud, x.kind, { type: 'collateral', amount: x.take, title: 'وثیقه وام', condition: 'آزاد با تسویه وام', sourceId: id, paidCount: 0, totalCount: b.months }));
    const start = now();
    const loan: Loan = {
      id, principal: b.amount, months: b.months, ratePct: rate, monthlyPayment: monthly, startedAt: start.toISOString(),
      collateral: { holdingKind: plan[0].kind, amount: plan[0].take, lockId: locks[0].id }, status: 'active',
      installments: Array.from({ length: b.months }, (_, i) => ({ n: i + 1, dueDate: new Date(start.getTime() + (i + 1) * 30 * DAY).toISOString(), amount: monthly, status: i === 0 ? 'due' : 'upcoming' })),
    };
    ud.loans.unshift(loan);
    ledger.credit(ud, 'rial', b.amount);
    ledger.addTx(ud, { category: 'loan', title: 'واریز وام', subtitle: `${faDigits(b.months)} ماهه · کیف پول ریالی`, amount: b.amount, holdingKind: 'rial', details: [{ label: 'قسط ماهانه', value: money(monthly) + ' تومان' }, { label: 'نرخ سالانه', value: faDigits(rate) + '٪' }] });
    for (const x of plan) ledger.addTx(ud, { category: 'lock', title: 'قفل وثیقه وام — ' + holdingName(ud, x.kind), subtitle: 'آزاد با تسویه وام', amount: x.take, holdingKind: x.kind, lockType: 'collateral', lockEvent: 'locked' });
    ud.credit.activeLoanId = id;
    ledger.notify(ud, { title: 'وام شما فعال شد', body: `${money(b.amount)} تومان به کیف پول ریالی واریز شد`, tone: 'success', icon: 'check', href: '/app/credit' });
    return ok(loan);
  }),

  http.post(p('/me/loans/:id/pay'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    const loan = ud.loans.find((x) => x.id === params.id);
    if (!loan) return fail(404, 'not_found', 'وام پیدا نشد.');
    if (loan.status !== 'active') return fail(409, 'settled', 'این وام قبلاً تسویه شده است.');
    const b = await body<{ count?: number; source?: string }>(request);
    const count = Math.max(1, Math.floor(b.count ?? 1));
    const open = loan.installments.filter((i) => i.status !== 'paid').slice(0, count);
    const total = open.reduce((s, i) => s + i.amount, 0);
    const src = b.source ?? 'rial';
    if (!paySource(ud, src, total)) return fail(422, 'insufficient_free', 'موجودی آزاد این منبع برای پرداخت کافی نیست.');
    open.forEach((i) => { i.status = 'paid'; i.paidAt = nowIso(); });
    const next = loan.installments.find((i) => i.status !== 'paid');
    if (next) next.status = 'due';
    const paid = loan.installments.filter((i) => i.status === 'paid').length;
    const locks = allLocks(ud).filter((l) => l.sourceId === loan.id || l.id === loan.collateral.lockId);
    locks.forEach((l) => { l.paidCount = paid; });
    const tx = ledger.addTx(ud, {
      category: 'loan', title: `قسط وام — ${faDigits(paid)} از ${faDigits(loan.months)}`, subtitle: 'از ' + sourceLabel(ud, src), amount: -total,
      holdingKind: src === 'bank' ? undefined : (src as AssetKind), details: [{ label: 'تعداد قسط', value: faDigits(open.length) }],
    });
    if (!next) {
      loan.status = 'settled';
      ud.credit.activeLoanId = undefined;
      const ids = new Set(locks.map((l) => l.id));
      for (const l of locks) ledger.addTx(ud, { category: 'lock', title: 'آزادسازی وثیقه وام', subtitle: 'تسویه کامل وام · ' + holdingName(ud, l.holdingKind), amount: l.amount, holdingKind: l.holdingKind, lockType: 'collateral', lockEvent: 'released' });
      for (const h of ud.holdings) h.locks = h.locks.filter((l) => !ids.has(l.id));
      recalcHoldings(ud);
      const freed = locks.reduce((s, l) => s + l.amount, 0);
      ledger.notify(ud, { title: 'وام تسویه شد', body: `${money(freed)} تومان وثیقه آزاد شد`, tone: 'success', icon: 'unlock', href: '/app/history' });
    }
    return ok(tx);
  }),

  // ───────── installment purchase ─────────
  http.post(p('/me/installments/quote'), async ({ request }) => {
    await latency();
    const b = await body<{ storeId: string; price: number; prepayment?: number }>(request);
    const s = db().stores.find((x) => x.id === b.storeId);
    if (!s) return fail(404, 'not_found', 'فروشگاه پیدا نشد.');
    if (!(b.price > 0)) return fail(422, 'bad_amount', 'قیمت معتبر نیست.');
    const pre = Math.min(Math.max(0, Math.round(b.prepayment ?? b.price * 0.1)), Math.round(b.price / 2));
    const months = [3, 6, 10, 12].filter((m) => m <= s.maxMonths).slice(-3);
    return ok(months.map((m) => installmentOption(b.price, pre, m, s.feePct)));
  }),

  http.post(p('/me/installments'), async ({ request }) => {
    await latency();
    const ud = u(request);
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای خرید اقساطی، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    const b = await body<{ storeId: string; title: string; price: number; months: number; monthly?: number; prepayment?: number; collateralKind?: AssetKind }>(request);
    const s = db().stores.find((x) => x.id === b.storeId);
    if (!s) return fail(404, 'not_found', 'فروشگاه پیدا نشد.');
    if (!(b.price > 0) || !(b.months > 0)) return fail(422, 'bad_amount', 'اطلاعات طرح اقساط معتبر نیست.');
    const pre = Math.min(Math.max(0, b.prepayment ?? 0), Math.round(b.price / 2));
    const opt = installmentOption(b.price, pre, b.months, s.feePct);
    const financed = b.price - pre;
    const c = cfg();
    if (financed > c.installmentLimit - installmentOutstanding(ud)) return fail(422, 'over_limit', 'مبلغ اقساطی از اعتبار اقساطی قابل استفاده بیشتر است.', { available: c.installmentLimit - installmentOutstanding(ud) });
    const kind = b.collateralKind ?? 'fixed';
    const lockAmt = opt.collateral[0].amount;
    recalcHoldings(ud);
    if (ledger.holding(ud, kind).free < lockAmt) return fail(422, 'insufficient_collateral', 'بخش آزاد این دارایی برای وثیقه کافی نیست.');
    if (pre && !ledger.debit(ud, 'rial', pre)) return fail(422, 'insufficient_free', 'موجودی آزاد کیف پول ریالی برای پیش‌پرداخت کافی نیست.');
    const id = newId('inst');
    const lock = ledger.addLock(ud, kind, { type: 'installment', amount: lockAmt, title: 'خرید اقساطی ' + s.name, condition: 'با پرداخت هر قسط، بخشی آزاد می‌شود', sourceId: id, paidCount: 0, totalCount: b.months });
    const code = 'NM-' + Math.floor(1000 + Math.random() * 8999) + '-' + String(Math.floor(Math.random() * 99)).padStart(2, '0');
    const purchase: PurchaseX = {
      id, storeId: s.id, storeName: s.name, title: b.title, price: b.price, months: b.months, monthly: opt.monthly, paidCount: 0, purchaseCode: code,
      createdAt: nowIso(), lockId: lock.id, prepayment: pre, collateralKind: kind, collateralAmount: lockAmt, codeExpiresAt: new Date(now().getTime() + 72 * 3600_000).toISOString(),
    };
    ud.installments.unshift(purchase);
    ledger.addTx(ud, { category: 'installment', title: 'خرید اقساطی — ' + s.name, subtitle: `${b.title} · ${faDigits(b.months)} قسط`, amount: -pre, holdingKind: pre ? 'rial' : undefined, details: [{ label: 'کد خرید', value: code }, { label: 'قسط ماهانه', value: money(opt.monthly) + ' تومان' }] });
    ledger.addTx(ud, { category: 'lock', title: 'قفل وثیقه خرید اقساطی', subtitle: holdingName(ud, kind), amount: lockAmt, holdingKind: kind, lockType: 'installment', lockEvent: 'locked' });
    ledger.notify(ud, { title: 'خرید اقساطی ثبت شد', body: `کد خرید ${code} · ${s.name}`, tone: 'success', icon: 'cart', href: '/app/installment' });
    return ok(purchase);
  }),

  http.post(p('/me/installments/:id/pay'), async ({ request, params }) => {
    await latency();
    const ud = u(request);
    const ip = ud.installments.find((x) => x.id === params.id);
    if (!ip) return fail(404, 'not_found', 'خرید اقساطی پیدا نشد.');
    const remaining = ip.months - ip.paidCount;
    if (remaining <= 0) return fail(409, 'settled', 'همه اقساط این خرید پرداخت شده است.');
    const b = await body<{ count?: number; source?: string }>(request);
    const n = Math.min(remaining, Math.max(1, Math.floor(b.count ?? 1)));
    const total = ip.monthly * n;
    const src = b.source ?? 'rial';
    if (!paySource(ud, src, total)) return fail(422, 'insufficient_free', 'موجودی آزاد این منبع برای پرداخت کافی نیست.');
    ip.paidCount += n;
    const lock = allLocks(ud).find((l) => l.id === ip.lockId);
    let released = 0;
    if (lock) {
      released = n >= remaining ? lock.amount : Math.round((lock.amount / remaining) * n);
      lock.amount -= released;
      lock.paidCount = ip.paidCount;
      if (lock.amount <= 0) for (const h of ud.holdings) h.locks = h.locks.filter((l) => l.id !== lock.id);
      recalcHoldings(ud);
    }
    const tx = ledger.addTx(ud, {
      category: 'installment', title: `قسط خرید اقساطی — ${faDigits(ip.paidCount)} از ${faDigits(ip.months)}`, subtitle: `${ip.storeName} · از ${sourceLabel(ud, src)}`,
      amount: -total, holdingKind: src === 'bank' ? undefined : (src as AssetKind),
    });
    if (lock && released > 0) ledger.addTx(ud, { category: 'lock', title: 'آزادسازی وثیقه با پرداخت قسط', subtitle: holdingName(ud, lock.holdingKind), amount: released, holdingKind: lock.holdingKind, lockType: 'installment', lockEvent: 'released' });
    return ok(tx);
  }),

  // ───────── card ─────────
  http.post(p('/me/card/charge'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card;
    if (!c) return fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
    if (ud.profile.kycLevel < 2) return fail(403, 'kyc_required', 'برای اعتبار کارت، احراز هویت سطح ۲ الزامی است.', { requiredLevel: 2 });
    if (c.status === 'blocked') return fail(409, 'card_blocked', 'کارت مسدود دائم است و قابل شارژ نیست.');
    const b = await body<{ amount: number }>(request);
    if (!(b.amount >= 100_000)) return fail(422, 'bad_amount', 'حداقل مبلغ شارژ ۱۰۰٬۰۰۰ تومان است.');
    if (b.amount > c.creditLimit - c.creditUsed) return fail(422, 'over_limit', 'مبلغ از اعتبار در دسترس بیشتر است.');
    const need = Math.max(0, c.creditUsed + b.amount - cfg().cardUnsecuredLimit) - cardLocked(ud, c);
    if (need > cardLockCapacity(ud)) return fail(422, 'insufficient_collateral', 'دارایی آزاد کافی برای وثیقه این مبلغ ندارید.', { need });
    c.creditUsed += b.amount;
    c.balance += b.amount;
    c.statementAmount = c.creditUsed;
    const locked = syncCardLocks(ud, c);
    const tx = ledger.addTx(ud, {
      category: 'card', title: 'شارژ کارت از اعتبار', subtitle: 'کارت نمادنو', amount: b.amount,
      lockType: locked > 0 ? 'collateral' : undefined, lockEvent: locked > 0 ? 'locked' : undefined,
      details: locked > 0 ? [{ label: 'افزایش قفل وثیقه', value: money(locked) + ' تومان' }] : undefined,
    });
    return ok({ card: c, transaction: tx });
  }),

  http.post(p('/me/card/settle'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card;
    if (!c) return fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
    const b = await body<{ amount: number; source?: string }>(request);
    const amt = Math.min(Math.round(b.amount || 0), c.creditUsed);
    if (!(amt > 0)) return fail(422, 'bad_amount', 'بدهی‌ای برای تسویه وجود ندارد.');
    if (amt < c.creditUsed && amt < 1_000_000) return fail(422, 'bad_amount', 'حداقل مبلغ تسویه بخشی ۱٬۰۰۰٬۰۰۰ تومان است.');
    const src = b.source ?? 'rial';
    if (!paySource(ud, src, amt)) return fail(422, 'insufficient_free', 'موجودی آزاد این منبع کافی نیست.');
    c.creditUsed -= amt;
    c.statementAmount = c.creditUsed;
    const released = -Math.min(0, syncCardLocks(ud, c));
    const tx = ledger.addTx(ud, {
      category: 'card', title: 'تسویه صورت‌حساب کارت', subtitle: 'از ' + sourceLabel(ud, src), amount: -amt, holdingKind: src === 'bank' ? undefined : (src as AssetKind),
      lockType: released > 0 ? 'collateral' : undefined, lockEvent: released > 0 ? 'released' : undefined,
      details: released > 0 ? [{ label: 'آزادسازی وثیقه', value: money(released) + ' تومان' }] : undefined,
    });
    return ok({ card: c, transaction: tx, released });
  }),

  http.post(p('/me/card/otp'), async ({ request }) => {
    await latency();
    const c = u(request).card;
    if (!c) return fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
    if (c.status !== 'active') return fail(409, 'card_frozen', 'کارت مسدود است؛ برای دریافت رمز پویا ابتدا مسدودی را رفع کنید.');
    return ok({ code: String(Math.floor(100000 + Math.random() * 900000)), expiresIn: 60 });
  }),
  http.post(p('/me/card/otp/sms'), async ({ request }) => {
    await latency();
    const ud = u(request);
    return ok({ sent: true, mobile: ud.profile.mobile });
  }),
  http.post(p('/me/card/block'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card;
    if (!c) return fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
    if (c.status === 'blocked') return fail(409, 'card_blocked', 'کارت قبلاً مسدود دائم شده است.');
    c.status = 'blocked';
    const tx: Transaction = ledger.addTx(ud, { category: 'card', title: 'مسدودسازی دائم کارت', subtitle: 'کارت نمادنو ' + c.maskedPan.slice(-4), amount: 0 });
    ledger.notify(ud, { title: 'کارت شما مسدود دائم شد', body: 'برای صدور کارت جدید با پشتیبانی تماس بگیرید', tone: 'error', icon: 'card', href: '/app/card' });
    return ok({ card: c, transaction: tx });
  }),
  http.post(p('/me/card/physical'), async ({ request }) => {
    await latency();
    const ud = u(request);
    const c = ud.card as (Card & { physicalRequestedAt?: string }) | undefined;
    if (!c) return fail(404, 'no_card', 'کارتی برای شما صادر نشده است.');
    if (c.physicalRequestedAt) return fail(409, 'already_requested', 'درخواست کارت فیزیکی قبلاً ثبت شده است.');
    c.physicalRequestedAt = nowIso();
    const tx = ledger.addTx(ud, { category: 'card', title: 'درخواست کارت فیزیکی', subtitle: 'ارسال به نشانی ثبت‌شده · رایگان', amount: 0, status: 'pending', details: [{ label: 'زمان تقریبی تحویل', value: '۷ روز کاری' }] });
    return ok({ transaction: tx });
  }),
];

