'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useLoanQuote, useMe, usePortfolio } from '@/api/app';
import { useCreateLoanSplit } from '@/api/app-credit-extra';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, jMonthYear, money, percent, units } from '@/lib/format';
import { now } from '@/lib/clock';
import type { AssetKind } from '@/types/domain';
import { CI, KIND_ICON, KIND_TONE, TONE } from '@/components/app/credit/icons';
import { addDays, ApiErrorNotice, KvRows, KycBanner, LockSplit, PrimaryButton, StepLabel, Stepper } from '@/components/app/credit/ui';

export default function LoanConfirmPage() {
  return (
    <Suspense fallback={<Scr gap={8}><Skeleton h={44} /><Skeleton h={220} /></Scr>}>
      <LoanConfirm />
    </Suspense>
  );
}

function LoanConfirm() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const amount = Number(sp.get('amount')) || 0;
  const months = Number(sp.get('months')) || 0;
  const kinds = (sp.get('collateral') ?? '').split(',').filter(Boolean) as AssetKind[];
  const editHref = `${routes.app.loan}?amount=${amount}&months=${months}&collateral=${encodeURIComponent(kinds.join(','))}`;

  const me = useMe();
  const pf = usePortfolio();
  const quote = useLoanQuote();
  const create = useCreateLoanSplit();
  const [agree, setAgree] = useState(false);

  const { mutate } = quote;
  useEffect(() => {
    if (amount > 0 && months > 0) mutate({ amount, months, collateralKind: kinds[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, months, mutate]);
  const q = quote.data;

  // exactly which holdings and how much becomes locked (FREE part only, in the chosen order)
  let left = amount;
  const alloc = kinds.map((k) => {
    const h = pf.data?.holdings.find((x) => x.kind === k);
    const take = h ? Math.min(h.free, left) : 0;
    left -= take;
    return { h, take };
  }).filter((a): a is { h: NonNullable<typeof a.h>; take: number } => !!a.h && a.take > 0);
  const short = !!pf.data && left > 0;

  const first = addDays(now(), 30);
  const last = addDays(now(), 30 * months);
  const valid = amount > 0 && months > 0 && kinds.length > 0;

  const submit = () => {
    if (!agree || short) return;
    create.mutate({ amount, months, collaterals: alloc.map((a) => a.h.kind) }, {
      onSuccess: (loan) => {
        toast(`وام ${money(loan.principal)} تومانی فعال شد و به کیف پول ریالی واریز شد`);
        router.push(routes.app.credit);
      },
    });
  };

  return (
    <>
      <Scr gap={8}>
        <Stepper steps={['مبلغ و مدت', 'پشتوانه', 'تأیید']} current={2} />
        {me.data && me.data.kycLevel < 2 && <KycBanner text="برای ثبت درخواست وام، احراز هویت پایه (ثبت احوال) را تکمیل کنید." />}

        {!valid && <ErrorState message="اطلاعات درخواست کامل نیست؛ مبلغ و پشتوانه را دوباره انتخاب کنید." onRetry={() => router.push(routes.app.loan)} />}
        {valid && pf.isLoading && <><Skeleton h={230} /><Skeleton h={190} /></>}

        {valid && pf.data && (
          <>
            {/* summary */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <KvRows vSize={14} rows={[
                { k: 'مبلغ وام', v: money(amount), u: 'تومان' },
                { k: 'مدت بازپرداخت', v: faDigits(months), u: 'ماه', w: 400 },
                { k: 'قسط ماهانه', v: q ? money(q.monthlyPayment) : '—', u: 'تومان' },
                { k: 'کارمزد / سود مؤثر', v: q ? faDigits(q.ratePct) + '٪' : '—', u: 'سالانه', w: 400 },
                { k: 'اولین قسط', v: jDayMonth(first), u: jDate(first).slice(0, 4), w: 400 },
                { k: 'آخرین قسط', v: jDayMonth(last), u: jDate(last).slice(0, 4), w: 400 },
              ]} />
              <div style={{ height: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                <div style={{ position: 'relative', height: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                  <span style={{ position: 'absolute', top: 6, right: 8, left: 8, height: 2, borderRadius: 1, background: 'var(--ring-track)' }} />
                  {Array.from({ length: months }, (_, i) => {
                    const size = i === 0 ? 14 : 12;
                    return <span key={i} title={`قسط ${faDigits(i + 1)} · ${jMonthYear(addDays(now(), 30 * (i + 1)))}`} style={{ position: 'relative', width: size, height: size, boxSizing: 'border-box', borderRadius: '50%', background: i === 0 ? 'var(--primary-main)' : 'var(--bg-paper)', border: `2px solid ${i === 0 ? 'var(--primary-main)' : 'var(--ring-track)'}`, flex: 'none' }} />;
                  })}
                </div>
                <div className="row" style={{ height: 14, fontSize: 11, lineHeight: 1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  <span><span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>اولین قسط</span> · {jDayMonth(first, true)}</span>
                  <span style={{ marginRight: 'auto' }}>{faDigits(months)} قسط ماهانه · آخرین قسط {jDayMonth(last, true)}</span>
                </div>
              </div>
            </div>

            {/* collateral: exactly what becomes reserved */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
              <div className="row" style={{ height: 24, gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>پشتوانه‌ای که رزرو می‌شود</span>
                {alloc.length === 1 && <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{percent((alloc[0].take / alloc[0].h.free) * 100, 1)} از بخش آزاد صندوق</span>}
                {alloc.length > 1 && <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>از {faDigits(alloc.length)} صندوق</span>}
              </div>
              {alloc.map(({ h, take }, i) => {
                const tone = TONE[KIND_TONE[h.kind] ?? 'def'];
                const nav = h.units ? h.value / h.units : 0;
                return (
                  <div key={h.kind} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: i ? 8 : 0, borderTop: i ? '1px dashed var(--divider)' : 0 }}>
                    <div className="row" style={{ height: 44 }}>
                      <span style={{ width: 36, height: 36, borderRadius: '50%', background: tone[0], color: tone[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={KIND_ICON[h.kind] ?? CI.trend} size={18} /></span>
                      <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.name}</span>
                        <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{money(take)} تومان{nav ? ` · ${units(take / nav)} واحد` : ''}</span>
                      </span>
                      <span className="lktype" style={{ background: LOCK_META.collateral.bg, color: LOCK_META.collateral.fg }}><Icon d={LOCK_META.collateral.d} size={12} />{LOCK_META.collateral.label}</span>
                    </div>
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>پیش از تأیید: آزاد {money(h.free)} · رزرو {money(h.locked)} از {money(h.value)}</span>
                    <LockSplit free={h.free - take} locked={h.locked + take} freeLabel="آزاد پس از تأیید" />
                  </div>
                );
              })}
              {short && <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5 }}>بخش آزاد دارایی‌های انتخاب‌شده تغییر کرده و {money(left)} تومان کم است؛ پشتوانه را ویرایش کنید.</span>}
              <div className="row" style={{ minHeight: 32, gap: 8, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, background: 'var(--soft-info)', color: 'var(--info-text)' }}>
                <Icon d={CI.refresh} size={16} />
                <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.5 }}>رزرو تا تسویه‌ی کامل وام (پس از قسط {faDigits(months)} · {jDayMonth(last, true)})؛ در این مدت بازده می‌گیرد و پس از آزاد شدن قابل فروش است</span>
              </div>
            </div>

            {/* agreement */}
            <label style={{ height: 44, boxSizing: 'border-box', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 'none' }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, margin: 0, accentColor: 'var(--primary-main)', flex: 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}><span style={{ fontWeight: 700, color: 'var(--primary-text)' }}>قرارداد تسهیلات</span> و رزرو پشتوانه را می‌پذیرم</span>
            </label>

            <div role="status" style={{ minHeight: 48, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <Icon d={CI.warn} size={20} />
              <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>اگر ۲ قسط پشت سر هم پرداخت نشود، به اندازه‌ی بدهی از پشتوانه فروخته و بدهی تسویه می‌شود.</span>
            </div>

            <ApiErrorNotice error={create.error} />

            <PrimaryButton d={CI.check} onClick={submit} disabled={!agree || short || alloc.length === 0} busy={create.isPending}>ثبت درخواست</PrimaryButton>
            <Link href={editHref} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 600, textDecoration: 'none', flex: 'none' }}><Icon d={CI.back} size={16} />بازگشت و ویرایش</Link>
          </>
        )}
      </Scr>

      <AppHeader title="تأیید درخواست وام" back={editHref} badge={<StepLabel n={3} />} />
      <BottomNav active="credit" />
    </>
  );
}
