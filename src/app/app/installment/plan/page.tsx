'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useFunds, usePortfolio, useStore } from '@/api/app';
import { useInstallmentQuoteX, type StoreX } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, units } from '@/lib/format';
import { now } from '@/lib/clock';
import { CI, KIND_ICON, KIND_TONE, productIcon } from '@/components/app/credit/icons';
import { collateralFor, defaultDown, downMax, downStep, planMonthly, planMonths } from '@/components/app/credit/calc';
import { addDays, ApiErrorNotice, LockSplit, RadioCard, Segmented, Slider, StepLabel } from '@/components/app/credit/ui';

export default function InstallmentPlanPage() {
  return (
    <Suspense fallback={<Scr gap={8}><Skeleton h={68} /><Skeleton h={100} /></Scr>}>
      <Plan />
    </Suspense>
  );
}

function Plan() {
  const router = useRouter();
  const sp = useSearchParams();
  const storeId = sp.get('store') ?? '';
  const productId = sp.get('product') ?? '';
  const store = useStore(storeId);
  const pf = usePortfolio();
  const funds = useFunds();
  const quote = useInstallmentQuoteX();

  const s = store.data as StoreX | undefined;
  const product = s?.products?.find((p) => p.id === productId) ?? s?.products?.[0];
  const price = product?.price ?? 0;

  const [downState, setDown] = useState<number | null>(sp.get('down') !== null ? Number(sp.get('down')) : null);
  const [monthsState, setMonths] = useState<number | null>(sp.get('months') ? Number(sp.get('months')) : null);
  const [colState, setCol] = useState<string | null>(sp.get('col'));

  const dMax = downMax(price);
  const step = downStep(price);
  const down = Math.min(dMax, Math.max(0, downState ?? defaultDown(price)));

  const { mutate } = quote;
  useEffect(() => {
    if (!s || !price) return;
    const t = setTimeout(() => mutate({ storeId: s.id, price, prepayment: down }), 250);
    return () => clearTimeout(t);
  }, [s, price, down, mutate]);
  const options = quote.data && quote.data[0]?.prepayment === down ? quote.data : undefined;

  const monthOpts = options ? options.map((o) => o.months) : s ? planMonths(s.maxMonths) : [];
  const months = monthsState && monthOpts.includes(monthsState) ? monthsState : (monthOpts[1] ?? monthOpts[0] ?? 0);
  const opt = options?.find((o) => o.months === months);
  const monthly = opt?.monthly ?? (s && months ? planMonthly(price, down, months, s.feePct) : 0);
  const coll = opt?.collateral[0]?.amount ?? collateralFor(price, down);
  const financed = price - down;

  // collateral candidates: FREE part of fund holdings
  const holdings = (pf.data?.holdings ?? []).filter((h) => h.kind !== 'rial' && h.value > 0);
  const preferred = holdings.find((h) => h.kind === 'fixed' && h.free >= coll) ?? holdings.find((h) => h.free >= coll) ?? holdings[0];
  const col = colState && holdings.some((h) => h.kind === colState) ? colState : preferred?.kind;
  const CF = holdings.find((h) => h.kind === col);
  const short = !!CF && CF.free < coll;
  const first = addDays(now(), 30);

  const next = () => {
    if (!s || !product || !CF || short) return;
    router.push(`${routes.app.installmentConfirm({ store: s.id, product: product.id, months })}&down=${down}&col=${CF.kind}`);
  };

  return (
    <>
      <Scr gap={8}>
        {(store.isLoading || pf.isLoading) && <><Skeleton h={68} /><Skeleton h={100} /><Skeleton h={62} /></>}
        {store.isError && <ErrorState message={store.error?.message} onRetry={() => store.refetch()} />}
        {s && !product && <ErrorState message="کالای انتخاب‌شده پیدا نشد." onRetry={() => router.push(routes.app.store(s.id))} />}

        {s && product && pf.data && (
          <>
            {/* product */}
            <div className="card" style={{ boxSizing: 'border-box', height: 68, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={productIcon(product.icon)} size={22} /></span>
              <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.name} · {product.category ?? s.category}</span></span>
              <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{money(price)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
            </div>

            {/* down payment */}
            <div className="card" style={{ boxSizing: 'border-box', height: 100, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
              <div className="row" style={{ height: 22, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>پیش‌پرداخت</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 16, whiteSpace: 'nowrap' }}>{money(down)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
              </div>
              <div className="row" style={{ height: 32, gap: 8 }}>
                <button type="button" onClick={() => setDown(Math.max(0, down - step))} aria-label="کاهش پیش‌پرداخت" disabled={down <= 0} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: 'none', opacity: down <= 0 ? 0.4 : 1 }}><Icon d={CI.minus} size={16} /></button>
                <Slider label="پیش‌پرداخت" value={down} min={0} max={dMax} step={step} onChange={setDown} style={{ flex: 1 }} />
                <button type="button" onClick={() => setDown(Math.min(dMax, down + step))} aria-label="افزایش پیش‌پرداخت" disabled={down >= dMax} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: 'none', opacity: down >= dMax ? 0.4 : 1 }}><Icon d={CI.plus} size={16} /></button>
              </div>
              <div className="row" style={{ height: 14, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                <span className="num" style={{ fontWeight: 400 }}>بدون پیش‌پرداخت</span>
                <span className="num" style={{ marginRight: 'auto', fontWeight: 400 }}>مبلغ اقساطی: {money(financed)} تومان</span>
              </div>
            </div>

            {/* months */}
            <div style={{ height: 62, display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
              <span style={{ height: 18, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600 }}>تعداد اقساط</span>
              <Segmented label="تعداد اقساط" value={months} onChange={setMonths} items={monthOpts.map((m) => ({ id: m, label: `${faDigits(m)} ماه` }))} />
            </div>

            {/* result */}
            <div className="card" aria-live="polite" style={{ boxSizing: 'border-box', height: 68, padding: '10px 8px', display: 'flex', alignItems: 'stretch', flex: 'none', opacity: quote.isPending ? 0.6 : 1 }}>
              {[
                { k: 'قسط ماهانه', v: money(monthly), u: 'تومان' },
                { k: 'جمع بازپرداخت', v: money(monthly * months), u: 'تومان' },
                { k: 'اولین قسط', v: jDayMonth(first), u: jDate(first).slice(0, 4) },
              ].map((r, i) => (
                <div key={r.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, borderRight: `1px solid ${i === 0 ? 'transparent' : 'var(--divider)'}`, lineHeight: 1 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
                  <span className="num" style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{r.v} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>{r.u}</span></span>
                </div>
              ))}
            </div>
            <ApiErrorNotice error={quote.error} />

            {/* collateral */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
              <div className="row" style={{ height: 18, gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>وثیقه</span>
                <span className="num" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>لازم: {money(coll)} تومان (۵۰٪ مبلغ اقساطی)</span>
              </div>
              <div role="radiogroup" aria-label="وثیقه" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {holdings.map((h) => {
                  const f = funds.data?.find((x) => x.id === h.fundId);
                  const nav = f?.nav ?? (h.units ? h.value / h.units : 0);
                  const calm = f ? f.category === 'fixed_income' : h.kind === 'fixed';
                  const enough = h.free >= coll;
                  return (
                    <RadioCard key={h.kind} on={h.kind === col} onClick={() => setCol(h.kind)} d={KIND_ICON[h.kind] ?? CI.trend} tone={KIND_TONE[h.kind] ?? 'def'} title={h.name}
                      sub={enough ? `آزاد ${money(h.free)} · قفل ${nav ? units(coll / nav, calm ? 1 : 2) : '—'} واحد` : `آزاد ${money(h.free)} · برای این وثیقه کافی نیست`}
                      disabled={!enough}
                      trailing={<span className="lbl" style={{ height: 22, background: calm ? 'var(--soft-success)' : 'var(--soft-warning)', color: calm ? 'var(--success-text)' : 'var(--warning-text)', fontWeight: 600 }}>{calm ? 'کم‌نوسان' : 'پرنوسان'}</span>} />
                  );
                })}
              </div>
            </div>

            {/* what becomes locked */}
            {CF && (
              <div className="card" style={{ boxSizing: 'border-box', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', background: 'rgb(var(--secondary-main-rgb) / .06)' }}>
                <div className="row" style={{ height: 22, gap: 8 }}>
                  <span className="lktype" style={{ background: 'var(--soft-secondary)', color: 'var(--secondary-text)' }}><Icon d={CI.lock} size={12} />وثیقه خرید اقساطی</span>
                  <span className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{money(coll)} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>از {CF.name}</span></span>
                </div>
                <LockSplit free={Math.max(0, CF.free - coll)} locked={CF.locked + Math.min(coll, CF.free)} freeLabel="آزاد پس از خرید" />
                {short
                  ? <span className="num" style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600, lineHeight: 1.5 }}>بخش آزاد {CF.name} کافی نیست؛ پیش‌پرداخت را بیشتر کنید یا وثیقه دیگری انتخاب کنید.</span>
                  : <span className="num" style={{ fontSize: 11, color: 'var(--secondary-text)', fontWeight: 500, lineHeight: 1.5 }}>با پرداخت هر قسط، {money(coll / Math.max(1, months))} از وثیقه آزاد می‌شود · {faDigits(months)} قسط</span>}
              </div>
            )}
            <div role="status" style={{ minHeight: 44, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}><Icon d={CI.info} size={18} /><span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>بخش قفل‌شده بازده می‌گیرد ولی تا آزادسازی قابل فروش یا برداشت نیست.</span></div>

            <button type="button" onClick={next} disabled={!CF || short || !months} style={{ height: 48, width: '100%', border: 0, boxSizing: 'border-box', borderRadius: 8, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: !CF || short ? 0.45 : 1 }}>
              <Icon d={CI.chevL} size={18} />ادامه
            </button>
          </>
        )}
      </Scr>

      <AppHeader title="طرح اقساط" back={storeId ? routes.app.store(storeId) : routes.app.installment} badge={<StepLabel n={2} />} />
      <BottomNav active="credit" />
    </>
  );
}
