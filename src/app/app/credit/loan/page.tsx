'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useCredit, useLoanQuote, useLoans, usePortfolio } from '@/api/app';
import { ApiRequestError } from '@/api/client';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { CI, KIND_ICON, KIND_TONE, TONE } from '@/components/app/credit/icons';
import { LOAN_MIN, LOAN_MONTHS } from '@/components/app/credit/meta';
import { addDays, lockedNote, LockSplit, Segmented, Slider, StepLabel, Stepper, Toggle } from '@/components/app/credit/ui';

export default function LoanPage() {
  return (
    <Suspense fallback={<Scr gap={8}><Skeleton h={44} /><Skeleton h={140} /></Scr>}>
      <LoanRequest />
    </Suspense>
  );
}

function LoanRequest() {
  const router = useRouter();
  const sp = useSearchParams();
  const credit = useCredit();
  const pf = usePortfolio();
  const loans = useLoans();
  const quote = useLoanQuote();

  const loanMax = credit.data?.loanMax ?? 0;
  const initMonths = Number(sp.get('months'));
  const [amountRaw, setAmount] = useState<number | null>(sp.get('amount') ? Number(sp.get('amount')) : null);
  const [months, setMonths] = useState<number>((LOAN_MONTHS as readonly number[]).includes(initMonths) ? initMonths : 12);
  const [sel, setSel] = useState<string[] | null>(sp.get('collateral') ? sp.get('collateral')!.split(',').filter(Boolean) : null);

  const canBorrow = loanMax >= LOAN_MIN;
  const amount = canBorrow ? Math.min(loanMax, Math.max(LOAN_MIN, amountRaw ?? Math.min(30_000_000, loanMax))) : 0;

  const funds = useMemo(() => (pf.data?.holdings ?? []).filter((h) => h.kind !== 'rial' && h.value > 0), [pf.data]);
  const best = funds.reduce<typeof funds[number] | undefined>((b, h) => (!b || h.free > b.free ? h : b), undefined);
  const selected = new Set(sel ?? (best ? [best.kind] : []));

  let left = amount;
  const rows = funds.map((h) => {
    const on = selected.has(h.kind) && h.free > 0;
    const take = on ? Math.min(h.free, left) : 0;
    left -= take;
    return { h, on, take };
  });
  const alloc = rows.filter((r) => r.take > 0);
  const short = left > 0;
  const firstKind = alloc[0]?.h.kind;

  // live quote
  const { mutate } = quote;
  useEffect(() => {
    if (!canBorrow) return;
    const t = setTimeout(() => mutate({ amount, months, collateralKind: firstKind }), 300);
    return () => clearTimeout(t);
  }, [amount, months, firstKind, canBorrow, mutate]);
  const q = quote.data && quote.data.amount === amount && quote.data.months === months ? quote.data : undefined;
  const quoteErr = quote.error instanceof ApiRequestError ? quote.error : null;

  const toggle = (kind: string, free: number) => {
    if (free <= 0) return;
    const n = new Set(selected);
    if (n.has(kind)) n.delete(kind); else n.add(kind);
    setSel(funds.map((f) => f.kind).filter((k) => n.has(k)));
  };

  const first = addDays(now(), 30);
  const activeLoan = loans.data?.find((l) => l.status === 'active');
  const contDisabled = !canBorrow || short || alloc.length === 0;
  const results = [
    { k: 'قسط ماهانه', v: q ? money(q.monthlyPayment) : '—', u: 'تومان' },
    { k: 'کارمزد / سود مؤثر', v: q ? faDigits(q.ratePct) + '٪' : '—', u: 'سالانه' },
    { k: 'اولین قسط', v: jDayMonth(first), u: jDate(first).slice(0, 4) },
  ];

  return (
    <>
      <Scr gap={8}>
        <Stepper steps={['مبلغ و مدت', 'پشتوانه', 'تأیید']} current={1} />

        {(credit.isLoading || pf.isLoading) && <><Skeleton h={140} /><Skeleton h={66} /><Skeleton h={200} /></>}
        {(credit.isError || pf.isError) && <ErrorState onRetry={() => { credit.refetch(); pf.refetch(); }} />}

        {activeLoan && (
          <div role="status" style={{ minHeight: 44, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <Icon d={CI.info} size={18} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>هر بار یک وام فعال می‌توانید داشته باشید؛ وام {money(activeLoan.principal)} تومانی شما در حال بازپرداخت است.</span>
            <Link href={routes.app.payInstallment(activeLoan.id)} style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text)', whiteSpace: 'nowrap' }}>پرداخت قسط</Link>
          </div>
        )}

        {credit.data && pf.data && (
          <>
            {/* amount */}
            <div className="card" style={{ boxSizing: 'border-box', height: 140, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>مبلغ وام</span>
                <span className="lbl" style={{ marginRight: 'auto', height: 22, background: 'var(--soft-primary)', color: 'var(--primary-text)', fontWeight: 600 }}>تا {faDigits(credit.data.loanMaxPct)}٪ دارایی آزاد</span>
              </div>
              <span className="num" style={{ fontSize: 30, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{money(amount)} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              <Slider label="مبلغ وام" value={amount} min={LOAN_MIN} max={canBorrow ? loanMax : LOAN_MIN} step={10_000} style={{ margin: '2px 0' }}
                onChange={(v) => setAmount(v >= loanMax ? loanMax : Math.round(v / 100_000) * 100_000)} />
              <div className="row" style={{ height: 16, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                <span className="num" style={{ fontWeight: 400 }}>حداقل {money(LOAN_MIN)}</span>
                <span className="num" style={{ marginRight: 'auto', fontWeight: 400 }}>حداکثر {money(loanMax)} = {faDigits(credit.data.loanMaxPct)}٪ دارایی آزاد</span>
              </div>
            </div>
            {!canBorrow && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5, padding: '0 4px' }}>سقف وام شما ({money(loanMax)} تومان) کمتر از حداقل مبلغ وام است؛ با افزایش دارایی آزاد، سقف بالا می‌رود.</span>
            )}

            {/* duration */}
            <div style={{ height: 66, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <span style={{ height: 20, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>مدت بازپرداخت</span>
              <Segmented label="مدت بازپرداخت" items={LOAN_MONTHS.map((m) => ({ id: m as number, label: `${faDigits(m)} ماه` }))} value={months} onChange={setMonths} />
            </div>

            {/* result */}
            <div className="card" aria-live="polite" style={{ boxSizing: 'border-box', height: 72, padding: '12px 8px', display: 'flex', alignItems: 'stretch', flex: 'none', opacity: quote.isPending ? 0.6 : 1 }}>
              {results.map((r, i) => (
                <div key={r.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRight: `1px solid ${i === 0 ? 'transparent' : 'var(--divider)'}`, lineHeight: 1 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
                  <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{r.v} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>{r.u}</span></span>
                </div>
              ))}
            </div>
            {quoteErr && quoteErr.code !== 'over_limit' && <span style={{ fontSize: 12, color: 'var(--error-text)', padding: '0 4px' }}>{quoteErr.message}</span>}

            {/* collateral: FREE part of each fund */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px 6px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <div className="row" style={{ height: 24, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>انتخاب پشتوانه</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>لازم: {money(amount)} تومان</span>
              </div>
              <span style={{ height: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: '18px', whiteSpace: 'nowrap' }}>فقط بخش آزاد هر صندوق قابل استفاده است</span>
              {rows.map(({ h, on, take }, i) => {
                const tone = TONE[KIND_TONE[h.kind] ?? 'def'];
                const sub = take > 0 ? `${money(take)} رزرو می‌شود` : on ? 'نیاز نیست' : lockedNote(h);
                return (
                  <div key={h.kind} className="row" style={{ height: 50, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}`, opacity: h.free > 0 ? 1 : 0.5 }}>
                    <span style={{ width: 36, height: 36, borderRadius: '50%', background: tone[0], color: tone[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={KIND_ICON[h.kind] ?? CI.trend} size={18} /></span>
                    <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.name}</span>
                      <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>آزاد <b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{money(h.free)}</b> · {sub}</span>
                    </span>
                    <Toggle on={on} onClick={() => toggle(h.kind, h.free)} label={h.name} disabled={h.free <= 0} style={{ marginLeft: -6 }} />
                  </div>
                );
              })}
            </div>

            {/* what becomes reserved */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', background: 'rgb(var(--info-main-rgb) / .06)' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>با تأیید وام رزرو می‌شود</span>
                <span className="lktype" style={{ marginRight: 'auto', background: LOCK_META.collateral.bg, color: LOCK_META.collateral.fg }}><Icon d={LOCK_META.collateral.d} size={12} />{LOCK_META.collateral.label}</span>
              </div>
              {alloc.map(({ h, take }) => (
                <div key={h.kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="row" style={{ height: 20, gap: 8 }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{money(take)} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>از {h.name}</span></span>
                  </div>
                  <LockSplit free={h.free - take} locked={h.value - (h.free - take)} freeLabel="آزاد پس از تأیید" />
                </div>
              ))}
              {short && <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5 }}>پشتوانه کافی نیست · {money(left)} تومان دیگر انتخاب کنید</span>}
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}><Icon d={CI.refresh} size={14} />رزرو تا تسویه‌ی کامل وام · در این مدت هم بازده می‌گیرد</span>
            </div>

            {/* continue */}
            <button type="button" disabled={contDisabled} aria-disabled={contDisabled}
              onClick={() => router.push(routes.app.loanConfirm(amount, months, alloc.map((a) => a.h.kind).join(',')))}
              style={{ opacity: contDisabled ? 0.45 : 1, height: 48, width: '100%', border: 0, boxSizing: 'border-box', borderRadius: 8, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: contDisabled ? 'default' : 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ادامه<Icon d={CI.chevL} size={18} />
            </button>
          </>
        )}
      </Scr>

      <AppHeader title="درخواست وام" back={routes.app.credit} badge={<StepLabel n={2} />} />
      <BottomNav active="credit" />
    </>
  );
}
