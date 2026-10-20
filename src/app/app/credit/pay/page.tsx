'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useBankAccounts, useFunds, useInstallments, useLoans, usePortfolio } from '@/api/app';
import { usePayDebt, type InstallmentPurchaseX, type PaySource } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, money } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { addDays, ApiErrorNotice, dueLabel, PrimaryButton, Segmented, Segs, sourceFree, SourcePicker } from '@/components/app/credit/ui';

export default function PayInstallmentPage() {
  return (
    <Suspense fallback={<Scr gap={10}><Skeleton h={40} /><Skeleton h={118} /></Scr>}>
      <PayInstallment />
    </Suspense>
  );
}

type Kind = 'loan' | 'inst';

function PayInstallment() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const loans = useLoans();
  const insts = useInstallments();
  const pf = usePortfolio();
  const banks = useBankAccounts();
  const funds = useFunds();
  const pay = usePayDebt();

  const loanParam = sp.get('loan');
  const instParam = sp.get('inst');
  const activeLoan = loans.data?.find((l) => (loanParam ? l.id === loanParam : l.status === 'active') && l.status === 'active')
    ?? loans.data?.find((l) => l.status === 'active');
  const openInsts = (insts.data ?? []).filter((i) => i.paidCount < i.months) as InstallmentPurchaseX[];
  const activeInst = openInsts.find((i) => i.id === instParam) ?? openInsts[0];

  const [kindState, setKind] = useState<Kind | null>(instParam ? 'inst' : loanParam ? 'loan' : null);
  const kind: Kind = kindState ?? (activeLoan ? 'loan' : 'inst');
  const [nState, setN] = useState(1);
  const [src, setSrc] = useState<PaySource>('rial');

  const loading = loans.isLoading || insts.isLoading || pf.isLoading;
  const isLoan = kind === 'loan';

  // normalized debt
  const allLocks = pf.data?.holdings.flatMap((h) => h.locks) ?? [];
  let K: { id: string; per: number; total: number; paid: number; title: string; icon: string; due?: string } | undefined;
  if (isLoan && activeLoan) {
    const paid = activeLoan.installments.filter((i) => i.status === 'paid').length;
    const next = activeLoan.installments.find((i) => i.status !== 'paid');
    K = { id: activeLoan.id, per: activeLoan.monthlyPayment, total: activeLoan.months, paid, title: `وام ${money(activeLoan.principal)} تومان`, icon: CI.banknote, due: next?.dueDate };
  } else if (!isLoan && activeInst) {
    K = { id: activeInst.id, per: activeInst.monthly, total: activeInst.months, paid: activeInst.paidCount, title: `${activeInst.title} · ${activeInst.storeName}`, icon: CI.cart, due: addDays(activeInst.createdAt, 30 * (activeInst.paidCount + 1)) };
  }

  const remainN = K ? K.total - K.paid : 0;
  const n = Math.max(1, Math.min(nState, remainN || 1));
  const payTotal = K ? K.per * n : 0;
  const after = remainN - n;
  const insufficient = payTotal > sourceFree(src, pf.data);

  // collateral after payment
  let rel: { title: string; sub: string; ok: boolean } | undefined;
  if (K && isLoan && activeLoan) {
    const locks = allLocks.filter((l) => l.sourceId === activeLoan.id || l.id === activeLoan.collateral.lockId);
    const sum = locks.reduce((s, l) => s + l.amount, 0);
    const names = Array.from(new Set(locks.map((l) => pf.data?.holdings.find((h) => h.kind === l.holdingKind)?.name ?? ''))).filter(Boolean).join('، ');
    rel = after === 0
      ? { title: `آزادسازی: ${money(sum)} از وثیقه آزاد شد`, sub: `پس از این پرداخت وام تسویه می‌شود و قفل ${names} برداشته می‌شود.`, ok: true }
      : { title: `وثیقه ${money(sum)} ${names} قفل می‌ماند`, sub: `آزاد با تسویه کامل وام · پس از این پرداخت ${faDigits(after)} قسط مانده`, ok: false };
  } else if (K && activeInst) {
    const lock = allLocks.find((l) => l.id === activeInst.lockId);
    const lockAmt = lock?.amount ?? 0;
    const freed = after === 0 ? lockAmt : Math.round((lockAmt / Math.max(1, remainN)) * n);
    const hName = lock ? pf.data?.holdings.find((h) => h.kind === lock.holdingKind)?.name ?? '' : '';
    rel = { title: `آزادسازی: ${money(freed)} از وثیقه آزاد شد`, sub: `پس از پرداخت · ${hName} · قفل باقی‌مانده ${money(lockAmt - freed)}${after > 0 ? ` تا ${faDigits(after)} قسط دیگر` : ''}`, ok: true };
  }

  const submit = () => {
    if (!K || insufficient) return;
    pay.mutate({ kind, id: K.id, count: n, source: src }, {
      onSuccess: (tx) => {
        toast(after === 0 ? 'پرداخت انجام شد و وثیقه آزاد شد' : 'قسط با موفقیت پرداخت شد');
        router.push(routes.app.receipt(tx.id));
      },
    });
  };

  return (
    <>
      <Scr gap={10}>
        <Segmented label="نوع بدهی" value={kind} onChange={(k) => { setKind(k); setN(1); pay.reset(); }}
          items={[{ id: 'loan' as Kind, label: 'وام فعال', disabled: !activeLoan }, { id: 'inst' as Kind, label: 'خرید اقساطی', disabled: openInsts.length === 0 }]} />

        {loading && <><Skeleton h={118} /><Skeleton h={160} /></>}
        {(loans.isError || insts.isError) && <ErrorState onRetry={() => { loans.refetch(); insts.refetch(); }} />}
        {!loading && !K && (
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', flex: 'none' }}>
            <Icon d={CI.checkCircle} size={28} style={{ color: 'var(--success-text)' }} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>{isLoan ? 'وام فعالی ندارید' : 'خرید اقساطی فعالی ندارید'}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>قسطی برای پرداخت وجود ندارد.</span>
          </div>
        )}

        {K && (
          <>
            {!isLoan && openInsts.length > 1 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 'none' }}>
                {openInsts.map((i) => (
                  <button key={i.id} type="button" aria-pressed={i.id === activeInst?.id} onClick={() => { router.replace(`${routes.app.payInstallment()}?inst=${i.id}`); setN(1); }}
                    style={{ height: 32, padding: '0 12px', border: `1px solid ${i.id === activeInst?.id ? 'transparent' : 'var(--outline-border)'}`, borderRadius: 8, background: i.id === activeInst?.id ? 'var(--soft-primary)' : 'transparent', color: i.id === activeInst?.id ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {i.title}
                  </button>
                ))}
              </div>
            )}

            {/* installment */}
            <div className="card" style={{ boxSizing: 'border-box', height: 118, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <div className="row" style={{ height: 24, gap: 8 }}>
                <span style={{ width: 24, height: 24, color: 'var(--secondary-text)', display: 'grid', placeItems: 'center' }}><Icon d={K.icon} size={20} /></span>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{K.title}</span>
                <span className="lbl" style={{ marginRight: 'auto', background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>قسط {faDigits(K.paid + 1)} از {faDigits(K.total)}</span>
              </div>
              <Segs total={K.total} paid={K.paid} selected={n} />
              <div className="row" style={{ height: 40, gap: 10 }}>
                <span className="col" style={{ gap: 2, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>مبلغ قسط</span><span className="num" style={{ fontSize: 22, whiteSpace: 'nowrap' }}>{money(K.per)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span></span>
                {K.due && <span className="lbl" style={{ marginRight: 'auto', height: 24, background: 'var(--soft-warning)', color: 'var(--warning-text)' }}><Icon d={CI.calendar} size={12} />{dueLabel(K.due)}</span>}
              </div>
            </div>

            {/* source */}
            <span style={{ height: 20, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>پرداخت از</span>
            <SourcePicker value={src} onChange={(v) => setSrc(v as PaySource)} portfolio={pf.data} banks={banks.data} funds={funds.data} />
            {insufficient && <span className="num" style={{ padding: '0 4px', fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5, flex: 'none' }}>موجودی آزاد این منبع از جمع پرداختی کمتر است</span>}

            {/* pay ahead */}
            <div className="card" style={{ boxSizing: 'border-box', height: 64, padding: '0 12px 0 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>پرداخت زودتر چند قسط</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{n === 1 ? `فقط قسط ${faDigits(K.paid + 1)}` : `اقساط ${faDigits(K.paid + 1)} تا ${faDigits(K.paid + n)}`} · بدون کارمزد پیش‌پرداخت</span>
              </span>
              <div dir="ltr" style={{ height: 36, boxSizing: 'border-box', border: '1px solid var(--outline-border)', borderRadius: 8, display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 'none' }}>
                <button type="button" onClick={() => n > 1 && setN(n - 1)} aria-label="کمتر" aria-disabled={n <= 1} style={{ width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: n <= 1 ? 0.4 : 1 }}><Icon d={CI.minus} size={16} /></button>
                <span className="num" aria-live="polite" style={{ width: 28, textAlign: 'center', fontSize: 15, fontWeight: 600, borderLeft: '1px solid var(--outline-border)', borderRight: '1px solid var(--outline-border)', height: 36, lineHeight: '36px' }}>{faDigits(n)}</span>
                <button type="button" onClick={() => n < remainN && setN(n + 1)} aria-label="بیشتر" aria-disabled={n >= remainN} style={{ width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: n >= remainN ? 0.4 : 1 }}><Icon d={CI.plus} size={16} /></button>
              </div>
            </div>

            {/* total */}
            <div className="card" style={{ boxSizing: 'border-box', height: 60, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none', background: 'rgb(var(--primary-main-rgb) / .08)' }}>
              <span className="col" style={{ gap: 2, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>جمع پرداختی</span><span className="num" style={{ fontSize: 20, whiteSpace: 'nowrap' }}>{money(payTotal)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span></span>
              <span className="col" style={{ marginRight: 'auto', gap: 2, lineHeight: 1.25, alignItems: 'flex-start' }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>مانده پس از پرداخت</span><span className="num" style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{money(K.per * after)} تومان</span></span>
            </div>

            {/* collateral after payment */}
            {rel && (
              <div className="card" style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', background: rel.ok ? 'rgb(var(--success-main-rgb) / .08)' : 'var(--card-bg)' }}>
                <div className="row" style={{ minHeight: 22, gap: 8 }}>
                  <span className="lktype" style={{ background: isLoan ? 'var(--soft-info)' : 'var(--soft-secondary)', color: isLoan ? 'var(--info-text)' : 'var(--secondary-text)' }}><Icon d={CI.lock} size={12} />{isLoan ? 'وثیقه' : 'اقساطی'}</span>
                  <span className="num" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: rel.ok ? 'var(--success-text)' : 'var(--text-primary)', lineHeight: 1.4 }}>{rel.title}</span>
                </div>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rel.sub}</span>
              </div>
            )}

            <ApiErrorNotice error={pay.error} />
            <PrimaryButton d={CI.check2} onClick={submit} disabled={insufficient} busy={pay.isPending}>پرداخت {money(payTotal)} تومان</PrimaryButton>
          </>
        )}
      </Scr>

      <AppHeader title="پرداخت قسط" back={routes.app.credit} />
      <BottomNav active="credit" />
    </>
  );
}
