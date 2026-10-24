'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useBankAccounts, useCard, useFunds, usePortfolio } from '@/api/app';
import { useCreditExtra, useSettleCardX, type PaySource } from '@/api/app-credit-extra';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { AmountChips, AmountField, ApiErrorNotice, daysUntil, PrimaryButton, Segmented, sourceFree, SourcePicker } from '@/components/app/credit/ui';

const MIN_PART = 1_000_000;

export default function CardSettlePage() {
  const router = useRouter();
  const toast = useToast();
  const card = useCard();
  const pf = usePortfolio();
  const banks = useBankAccounts();
  const funds = useFunds();
  const extra = useCreditExtra();
  const settle = useSettleCardX();
  const [mode, setMode] = useState<'full' | 'part'>('full');
  const [part, setPart] = useState<number | null>(null);
  const [src, setSrc] = useState<PaySource>('rial');

  const c = card.data;
  const debt = c?.creditUsed ?? 0;
  const isFull = mode === 'full';
  const partAmt = part ?? Math.min(6_000_000, debt);
  const amt = isFull ? debt : Math.min(partAmt, debt);
  const after = Math.max(0, debt - amt);

  // collateral release: card locks follow max(0, debt − unsecured allowance)
  const unsecured = extra.data?.cardUnsecuredLimit ?? 0;
  const lockedNow = extra.data?.cardLocked ?? 0;
  const lockedAfter = Math.min(lockedNow, Math.max(0, after - unsecured));
  const released = lockedNow - lockedAfter;
  const lockHolding = c && pf.data ? pf.data.holdings.filter((h) => h.locks.some((l) => l.sourceId === c.id)).map((h) => h.name).join('، ') : '';
  const rel = released > 0
    ? { title: `${money(released)} تومان از پشتوانه آزاد می‌شود`, sub: lockedAfter > 0 ? `پس از تسویه · رزرو باقی‌مانده‌ی کارت ${money(lockedAfter)} تومان` : `پس از تسویه · کل پشتوانه‌ی کارت در ${lockHolding || 'کیف پول ریالی'} آزاد می‌شود`, ok: true }
    : { title: lockedNow > 0 ? `${money(lockedNow)} تومان پشتوانه در ${lockHolding} رزرو می‌ماند` : 'پشتوانه‌ای برای کارت رزرو نشده است', sub: `آزاد با تسویه کامل صورت‌حساب · مانده بدهی ${money(after)} تومان`, ok: false };

  const partInvalid = !isFull && (amt < MIN_PART && amt < debt);
  const insufficient = amt > sourceFree(src, pf.data);
  const disabled = !c || debt <= 0 || amt <= 0 || partInvalid || insufficient;

  const submit = () => {
    if (disabled) return;
    settle.mutate({ amount: amt, source: src }, {
      onSuccess: (r) => {
        toast(r.released > 0 ? `${money(amt)} تومان تسویه شد و ${money(r.released)} تومان از پشتوانه آزاد شد` : `${money(amt)} تومان از بدهی کارت تسویه شد`);
        router.push(routes.app.receipt(r.transaction.id));
      },
    });
  };

  const chips = [3_000_000, 6_000_000, 9_000_000].filter((v) => v <= debt).map((v) => ({ id: v, label: money(v) }));

  return (
    <>
      <Scr gap={8}>
        {card.isLoading && <><Skeleton h={96} /><Skeleton h={64} /><Skeleton h={122} /></>}
        {card.isError && <ErrorState message={card.error?.message} onRetry={() => card.refetch()} />}
        {c && (
          <>
            {/* debt */}
            <div className="card" style={{ boxSizing: 'border-box', height: 96, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>بدهی جاری کارت</span>
                <span className="lbl" style={{ marginRight: 'auto', height: 22, background: 'var(--soft-warning)', color: 'var(--warning-text)', fontWeight: 600 }}>مهلت تسویه {faDigits(Math.max(0, daysUntil(c.statementDue)))} روز</span>
              </div>
              <span className="num" style={{ fontSize: 26, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{money(debt)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Icon d={CI.refresh} size={14} />تسویه خودکار {jDayMonth(c.statementDue)} از کیف پول ریالی · بدون کارمزد</span>
            </div>

            {debt <= 0 ? (
              <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', flex: 'none' }}>
                <Icon d={CI.checkCircle} size={28} style={{ color: 'var(--success-text)' }} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>بدهی‌ای برای تسویه ندارید</span>
              </div>
            ) : (
              <>
                {/* mode */}
                <div style={{ height: 64, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
                  <span style={{ height: 18, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>نوع تسویه</span>
                  <Segmented label="نوع تسویه" value={mode} onChange={setMode} items={[{ id: 'full' as const, label: 'تسویه کامل' }, { id: 'part' as const, label: 'تسویه بخشی' }]} />
                </div>

                {/* amount */}
                <div className="card" style={{ boxSizing: 'border-box', minHeight: 122, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
                  <div className="row" style={{ height: 18, gap: 8, lineHeight: 1 }}>
                    <label htmlFor="stl-amt" style={{ fontSize: 13, fontWeight: 600 }}>مبلغ تسویه</label>
                    <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{isFull ? 'کل بدهی · قابل تغییر نیست' : `حداقل ${money(Math.min(MIN_PART, debt))} · حداکثر ${money(debt)}`}</span>
                  </div>
                  <AmountField id="stl-amt" label="مبلغ تسویه" value={isFull ? debt : partAmt} disabled={isFull} invalid={partInvalid || (!isFull && partAmt > debt)} onChange={(v) => setPart(v)} />
                  <AmountChips height={28} value={isFull ? -1 : amt} onPick={(v) => setPart(v)} disabled={isFull} items={chips} />
                  {!isFull && partAmt > debt && <span style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600 }}>مبلغ بیش از بدهی است؛ {money(debt)} تومان تسویه می‌شود.</span>}
                </div>

                {/* source */}
                <span style={{ height: 18, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>پرداخت از</span>
                <SourcePicker value={src} onChange={(v) => setSrc(v as PaySource)} portfolio={pf.data} banks={banks.data} funds={funds.data} height={48} />
                {insufficient && <span className="num" style={{ padding: '0 4px', fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5, flex: 'none' }}>موجودی آزاد این منبع از مبلغ تسویه کمتر است</span>}

                {/* result */}
                <div className="card" style={{ boxSizing: 'border-box', height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none', background: 'rgb(var(--primary-main-rgb) / .08)' }}>
                  <span className="col" style={{ gap: 2, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>بدهی پس از تسویه</span><span className="num" style={{ fontSize: 18, whiteSpace: 'nowrap' }}>{money(after)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span></span>
                  <span className="col" style={{ marginRight: 'auto', gap: 2, lineHeight: 1.25, alignItems: 'flex-start' }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>اعتبار آزادشده</span><span className="num" style={{ fontSize: 14, color: 'var(--success-text)', whiteSpace: 'nowrap' }}>+{money(amt)}</span></span>
                </div>

                {/* collateral release */}
                <div className="card" style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, flex: 'none', background: rel.ok ? 'rgb(var(--success-main-rgb) / .08)' : 'var(--card-bg)' }}>
                  <div className="row" style={{ minHeight: 22, gap: 8 }}>
                    <span className="lktype" style={{ background: LOCK_META.collateral.bg, color: LOCK_META.collateral.fg }}><Icon d={LOCK_META.collateral.d} size={12} />{LOCK_META.collateral.short}</span>
                    <span className="num" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: rel.ok ? 'var(--success-text)' : 'var(--text-primary)', lineHeight: 1.4 }}>{rel.title}</span>
                  </div>
                  <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{rel.sub}</span>
                </div>

                <ApiErrorNotice error={settle.error} />
                <PrimaryButton d={CI.check2} onClick={submit} disabled={disabled} busy={settle.isPending}>تسویه {money(amt)} تومان</PrimaryButton>
              </>
            )}
          </>
        )}
      </Scr>

      <AppHeader title="تسویه زودتر" back={routes.app.card} />
      <BottomNav active="card" />
    </>
  );
}
