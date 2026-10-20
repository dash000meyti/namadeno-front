'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useFunds, useMe, usePortfolio, useStore } from '@/api/app';
import { useCreateInstallmentX, useInstallmentQuoteX, type StoreX } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, percent, units } from '@/lib/format';
import { now } from '@/lib/clock';
import type { AssetKind } from '@/types/domain';
import { CI, KIND_ICON, KIND_TONE, TONE } from '@/components/app/credit/icons';
import { collateralFor, planMonthly } from '@/components/app/credit/calc';
import { addDays, ApiErrorNotice, KvRows, KycBanner, LockSplit, PrimaryButton, StepLabel, Stepper } from '@/components/app/credit/ui';

export default function InstallmentConfirmPage() {
  return (
    <Suspense fallback={<Scr gap={8}><Skeleton h={44} /><Skeleton h={220} /></Scr>}>
      <Confirm />
    </Suspense>
  );
}

function Confirm() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const storeId = sp.get('store') ?? '';
  const productId = sp.get('product') ?? '';
  const months = Number(sp.get('months')) || 0;
  const down = Math.max(0, Number(sp.get('down')) || 0);
  const col = (sp.get('col') ?? 'fixed') as AssetKind;
  const planHref = `${routes.app.installmentPlan(storeId, productId)}&down=${down}&months=${months}&col=${col}`;

  const me = useMe();
  const store = useStore(storeId);
  const pf = usePortfolio();
  const funds = useFunds();
  const quote = useInstallmentQuoteX();
  const create = useCreateInstallmentX();
  const [agree, setAgree] = useState(false);

  const s = store.data as StoreX | undefined;
  const product = s?.products?.find((p) => p.id === productId);
  const price = product?.price ?? 0;

  const { mutate } = quote;
  useEffect(() => {
    if (s && price) mutate({ storeId: s.id, price, prepayment: down });
  }, [s, price, down, mutate]);
  const opt = quote.data?.find((o) => o.months === months);
  const monthly = opt?.monthly ?? (s ? planMonthly(price, down, months, s.feePct) : 0);
  const coll = opt?.collateral[0]?.amount ?? collateralFor(price, down);

  const h = pf.data?.holdings.find((x) => x.kind === col);
  const f = funds.data?.find((x) => x.id === h?.fundId);
  const nav = f?.nav ?? (h?.units ? h.value / h.units : 0);
  const rial = pf.data?.holdings.find((x) => x.kind === 'rial');
  const shortCollateral = !!h && h.free < coll;
  const shortRial = down > 0 && !!rial && rial.free < down;
  const first = addDays(now(), 30);

  const submit = () => {
    if (!s || !product || !agree || shortCollateral || shortRial) return;
    create.mutate({ storeId: s.id, productId: product.id, title: product.title, price, months, monthly, prepayment: down, collateralKind: col }, {
      onSuccess: (p) => {
        toast('خرید اقساطی ثبت شد');
        router.push(routes.app.installmentDone(p.id));
      },
    });
  };

  return (
    <>
      <Scr gap={8}>
        <Stepper steps={['انتخاب کالا', 'طرح و وثیقه', 'تأیید']} current={2} />
        {me.data && me.data.kycLevel < 2 && <KycBanner text="ثبت خرید اقساطی پس از تکمیل احراز هویت پایه (ثبت احوال) ممکن است." />}
        {(store.isLoading || pf.isLoading) && <><Skeleton h={230} /><Skeleton h={190} /></>}
        {store.isError && <ErrorState message={store.error?.message} onRetry={() => store.refetch()} />}
        {s && !product && <ErrorState message="کالای انتخاب‌شده پیدا نشد." onRetry={() => router.push(routes.app.store(s.id))} />}

        {s && product && pf.data && (
          <>
            {/* summary */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '6px 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <KvRows rows={[
                { k: 'کالا', v: `${product.title} — ${s.name}` },
                { k: 'قیمت کالا', v: money(price), u: 'تومان' },
                { k: 'پیش‌پرداخت', v: money(down), u: 'تومان' },
                { k: 'تعداد اقساط', v: faDigits(months), u: 'ماه' },
                { k: 'قسط ماهانه', v: money(monthly), u: 'تومان' },
                { k: 'جمع بازپرداخت', v: money(monthly * months), u: 'تومان' },
                { k: 'اولین قسط', v: jDayMonth(first), u: jDate(first).slice(0, 4) },
              ]} />
            </div>

            {/* collateral: exactly what becomes locked */}
            {h && (
              <div className="card" style={{ boxSizing: 'border-box', padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
                <div className="row" style={{ height: 24, gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>وثیقه‌ای که قفل می‌شود</span>
                  {h.free > 0 && <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{percent(Math.min(100, (coll / h.free) * 100), 1)} از بخش آزاد صندوق</span>}
                </div>
                <div className="row" style={{ height: 44 }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: TONE[KIND_TONE[h.kind] ?? 'def'][0], color: TONE[KIND_TONE[h.kind] ?? 'def'][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={KIND_ICON[h.kind] ?? CI.trend} size={18} /></span>
                  <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.name}</span>
                    <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{money(coll)} تومان{nav ? ` · ${units(coll / nav, 1)} واحد` : ''}</span>
                  </span>
                  <span className="lktype" style={{ background: 'var(--soft-secondary)', color: 'var(--secondary-text)' }}><Icon d={CI.lock} size={12} />اقساطی</span>
                </div>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>پیش از تأیید: آزاد {money(h.free)} · قفل {money(h.locked)} از {money(h.value)}</span>
                <LockSplit free={Math.max(0, h.free - coll)} locked={h.locked + Math.min(coll, h.free)} freeLabel="آزاد پس از تأیید" />
                <div className="row" style={{ minHeight: 32, gap: 8, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, background: 'var(--soft-secondary)', color: 'var(--secondary-text)' }}>
                  <Icon d={CI.refresh} size={16} />
                  <span className="num" style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.5 }}>وثیقه خرید اقساطی · با پرداخت هر قسط، {money(coll / Math.max(1, months))} آزاد می‌شود</span>
                </div>
                {shortCollateral && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5 }}>بخش آزاد {h.name} برای این وثیقه کافی نیست؛ طرح را ویرایش کنید.</span>}
              </div>
            )}
            {shortRial && <span className="num" style={{ padding: '0 4px', fontSize: 12, fontWeight: 600, color: 'var(--error-text)', lineHeight: 1.5 }}>پیش‌پرداخت از کیف پول ریالی برداشت می‌شود و موجودی آزاد آن ({money(rial?.free ?? 0)} تومان) کافی نیست.</span>}

            {/* agreement */}
            <label style={{ height: 44, boxSizing: 'border-box', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 'none' }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, margin: 0, accentColor: 'var(--primary-main)', flex: 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>شرایط <span style={{ fontWeight: 700, color: 'var(--primary-text)' }}>قرارداد خرید اقساطی</span> و قفل وثیقه را می‌پذیرم</span>
            </label>

            <div role="status" style={{ minHeight: 48, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}><Icon d={CI.warn} size={18} /><span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>کد خرید ۷۲ ساعت اعتبار دارد؛ در صورت استفاده‌نشدن، وثیقه خودکار آزاد می‌شود.</span></div>

            <ApiErrorNotice error={create.error} />
            <PrimaryButton d={CI.code} onClick={submit} disabled={!agree || shortCollateral || shortRial || !h} busy={create.isPending}>ثبت و دریافت کد خرید</PrimaryButton>
            <Link href={planHref} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none', flex: 'none' }}><Icon d={CI.back} size={16} />بازگشت و ویرایش</Link>
          </>
        )}
      </Scr>

      <AppHeader title="تأیید خرید اقساطی" back={planHref} badge={<StepLabel n={3} />} />
      <BottomNav active="credit" />
    </>
  );
}
