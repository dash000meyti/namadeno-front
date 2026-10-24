'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useStore, useStores } from '@/api/app';
import { useCreditExtra, type StoreX } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, money } from '@/lib/format';
import { CI, productIcon, TONE, type Tone } from '@/components/app/credit/icons';
import { defaultDown, planMonthly, planMonths } from '@/components/app/credit/calc';

const TONES: Tone[] = ['primary', 'secondary', 'info', 'warning', 'success'];

export default function StorePage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore(id);
  const stores = useStores();
  const extra = useCreditExtra();
  const [cat, setCat] = useState('all');

  const s = store.data as StoreX | undefined;
  const idx = Math.max(0, (stores.data ?? []).findIndex((x) => x.id === id));
  const storeTone = TONES[idx % TONES.length];
  const products = s?.products ?? [];
  const cats = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c)));
  const shown = cat === 'all' ? products : products.filter((p) => p.category === cat);
  const months = s ? planMonths(s.maxMonths) : [];
  const maxM = months[months.length - 1] ?? 0;

  return (
    <>
      <Scr gap={10}>
        {store.isLoading && <><Skeleton h={92} /><Skeleton h={32} /><Skeleton h={206} /></>}
        {store.isError && <ErrorState message={store.error?.message} onRetry={() => store.refetch()} />}
        {s && (
          <>
            {/* store header */}
            <div className="card" style={{ boxSizing: 'border-box', height: 92, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: TONE[storeTone][0], color: TONE[storeTone][1], display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, flex: 'none' }}>{s.logoLetter}</span>
              <span className="col" style={{ flex: 1, gap: 4, lineHeight: 1.3 }}>
                <span className="row" style={{ gap: 8, height: 24 }}><span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.name}</span><span className="lbl" style={{ background: 'var(--soft-success)', color: 'var(--success-text)' }}>طرف قرارداد</span></span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.category}{s.shipping ? ` · ${s.shipping}` : ''}</span>
                <span className="num" style={{ fontSize: 12, fontWeight: 500, color: 'var(--primary-text)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><Icon d={CI.shieldCheck} size={14} />تا {money(extra.data?.installmentAvailable ?? 0)} تومان اعتبار اقساطی</span>
              </span>
            </div>

            {/* categories */}
            {cats.length > 1 && (
              <div style={{ height: 32, display: 'flex', gap: 6, flex: 'none', overflowX: 'auto', scrollbarWidth: 'none' }}>
                {[{ id: 'all', label: 'همه' }, ...cats.map((c) => ({ id: c, label: c }))].map((c) => {
                  const on = c.id === cat;
                  return (
                    <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={on} style={{ height: 32, padding: '0 12px', border: `1px solid ${on ? 'transparent' : 'var(--outline-border)'}`, borderRadius: 8, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}>{c.label}</button>
                  );
                })}
              </div>
            )}

            {/* products */}
            {shown.length === 0 && <span className="card" style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>کالایی در این دسته ثبت نشده است.</span>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 'none' }}>
              {shown.map((p, i) => {
                const t = TONE[TONES[i % TONES.length]];
                const monthly = maxM ? planMonthly(p.price, defaultDown(p.price), maxM, s.feePct) : 0;
                return (
                  <Link key={p.id} href={routes.app.installmentPlan(s.id, p.id)} className="card" style={{ boxSizing: 'border-box', height: 206, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-primary)', textDecoration: 'none', minWidth: 0 }}>
                    <span style={{ position: 'relative', height: 100, borderRadius: 12, background: t[0], color: t[1], display: 'grid', placeItems: 'center' }}>
                      <Icon d={productIcon(p.icon)} size={44} strokeWidth={1.2} />
                      <span style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, background: 'var(--bg-paper)', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{p.title.charAt(0)}</span>
                    </span>
                    <span style={{ height: 18, fontSize: 13, fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                    <span className="num" style={{ height: 20, fontSize: 15, lineHeight: '20px', whiteSpace: 'nowrap' }}>{money(p.price)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
                    {maxM > 0 && <span className="lbl num" style={{ alignSelf: 'flex-start', height: 22, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 500, fontSize: 11, gap: 4 }}><Icon d={CI.calendar} size={12} />از {faDigits(maxM)} قسط × {money(monthly)}</span>}
                  </Link>
                );
              })}
            </div>

            <div role="status" style={{ minHeight: 44, boxSizing: 'border-box', padding: '6px 12px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <Icon d={CI.info} size={18} />
              <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>قسط دقیق در «طرح اقساط» محاسبه می‌شود؛ ۵۰٪ مبلغ اقساطی از دارایی آزاد شما به‌عنوان «پشتوانه‌ی خرید اقساطی» رزرو و با پرداخت هر قسط، بخشی از آن آزاد می‌شود.</span>
            </div>
          </>
        )}
      </Scr>

      <AppHeader title={s?.name ?? 'فروشگاه'} back={routes.app.installment} />
      <BottomNav active="credit" />
    </>
  );
}
