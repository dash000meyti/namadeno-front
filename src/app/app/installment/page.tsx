'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useInstallments, usePortfolio, useStores } from '@/api/app';
import { useCreditExtra, type InstallmentPurchaseX, type StoreX } from '@/api/app-credit-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDayMonth, money } from '@/lib/format';
import { CI, TONE, type Tone } from '@/components/app/credit/icons';
import { addDays, Segs } from '@/components/app/credit/ui';

const STORE_TONES: Tone[] = ['primary', 'secondary', 'success', 'warning', 'info'];

export default function InstallmentPage() {
  const stores = useStores();
  const insts = useInstallments();
  const pf = usePortfolio();
  const extra = useCreditExtra();
  const [q, setQ] = useState('');
  const [special, setSpecial] = useState(false);
  const [all, setAll] = useState(false);

  const term = q.trim();
  const list = ((stores.data ?? []) as StoreX[])
    .map((s, i) => ({ s, tone: STORE_TONES[i % STORE_TONES.length] }))
    .filter(({ s }) => !special || s.special)
    .filter(({ s }) => !term || s.name.includes(term) || s.category.includes(term) || (s.products ?? []).some((p) => p.title.includes(term)));
  const shown = all || term ? list : list.slice(0, 4);

  const open = ((insts.data ?? []) as InstallmentPurchaseX[]).filter((i) => i.paidCount < i.months);
  const locks = pf.data?.holdings.flatMap((h) => h.locks) ?? [];
  const holdingName = (k: string) => pf.data?.holdings.find((h) => h.kind === k)?.name ?? k;

  return (
    <>
      <Scr gap={12}>
        {/* usable installment credit */}
        <div className="card" style={{ boxSizing: 'border-box', height: 56, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={CI.shieldCheck} size={18} /></span>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>اعتبار اقساطی قابل استفاده</span>
          <span className="lbl num" style={{ height: 28, padding: '0 10px', background: 'var(--soft-success)', color: 'var(--success-text)', fontSize: 13 }}>{extra.data ? `${money(extra.data.installmentAvailable)} تومان` : '…'}</span>
        </div>

        {/* partner stores */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <div className="row" style={{ height: 24 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>فروشگاه‌های طرف قرارداد</span>
            {!term && list.length > 4 && (
              <button type="button" onClick={() => setAll(!all)} aria-expanded={all} style={{ marginRight: 'auto', border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--primary-text)', display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                {all ? 'کمتر' : 'همه'}<Icon d={all ? CI.chevD : CI.chevL} size={16} />
              </button>
            )}
          </div>
          {stores.isLoading && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></div>}
          {stores.isError && <ErrorState onRetry={() => stores.refetch()} />}
          {stores.data && shown.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 4px' }}>فروشگاهی با این جستجو پیدا نشد.</span>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {shown.map(({ s, tone }) => (
              <Link key={s.id} href={routes.app.store(s.id)} className="card" style={{ boxSizing: 'border-box', height: 64, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', textAlign: 'right', textDecoration: 'none', minWidth: 0 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: TONE[tone][0], color: TONE[tone][1], display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, flex: 'none' }}>{s.logoLetter}</span>
                <span className="col" style={{ flex: 1, gap: 2, lineHeight: 1.3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.category}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* active orders */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>{open.length > 1 ? 'سفارش‌های فعال' : 'سفارش فعال'}</span>
          {insts.isLoading && <Skeleton h={200} />}
          {insts.data && open.length === 0 && <span className="card" style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>سفارش اقساطی فعالی ندارید؛ از فروشگاه‌های بالا کالا انتخاب کنید.</span>}
          {open.map((ip) => {
            const lock = locks.find((l) => l.id === ip.lockId);
            const remain = ip.months - ip.paidCount;
            const perRel = lock ? lock.amount / Math.max(1, remain) : 0;
            const due = addDays(ip.createdAt, 30 * (ip.paidCount + 1));
            const payHref = `${routes.app.payInstallment()}?inst=${encodeURIComponent(ip.id)}`;
            return (
              <div key={ip.id} className="card" style={{ boxSizing: 'border-box', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Link href={payHref} style={{ display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-primary)', textDecoration: 'none' }}>
                  <div className="row" style={{ height: 22, gap: 8 }}>
                    <span style={{ width: 22, height: 22, color: 'var(--primary-text)', display: 'grid', placeItems: 'center' }}><Icon d={CI.laptop} size={20} /></span>
                    <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{ip.title} — {ip.storeName}</span>
                    <span className="lbl" style={{ marginRight: 'auto', background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{faDigits(ip.paidCount)} از {faDigits(ip.months)} قسط</span>
                  </div>
                  <span className="num" style={{ height: 18, fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>{money(ip.price)} تومان · {faDigits(ip.months)} قسط {money(ip.monthly)} تومان</span>
                  <Segs total={ip.months} paid={ip.paidCount} />
                  {lock && (
                    <>
                      <div className="row" style={{ height: 22, gap: 6 }}>
                        <span className="lktype" style={{ background: 'var(--soft-secondary)', color: 'var(--secondary-text)' }}><Icon d={CI.lock} size={12} />اقساطی</span>
                        <span className="num" style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{money(lock.amount)} از {holdingName(lock.holdingKind)} قفل است</span>
                      </div>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>با پرداخت هر قسط، {money(perRel)} از وثیقه آزاد می‌شود · {faDigits(remain)} قسط مانده</span>
                    </>
                  )}
                </Link>
                <div className="row" style={{ height: 44, gap: 10 }}>
                  <span className="col" style={{ gap: 2, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>قسط بعدی · {jDayMonth(due)}</span><span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{money(ip.monthly)} تومان</span></span>
                  <Link href={payHref} style={{ marginRight: 'auto', height: 44, padding: '0 18px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', textDecoration: 'none' }}>پرداخت قسط</Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* how it works */}
        <div className="card" style={{ boxSizing: 'border-box', height: 104, padding: '12px 12px 10px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <span style={{ height: 16, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1 }}>خرید اقساطی چطور کار می‌کند؟</span>
          <div style={{ height: 58, display: 'flex', alignItems: 'flex-start' }}>
            {[
              { label: 'انتخاب کالا', d: CI.cart, t: 'primary' as Tone },
              { label: 'قفل وثیقه', d: CI.lock, t: 'secondary' as Tone },
              { label: 'دریافت کد خرید', d: CI.code, t: 'success' as Tone },
            ].map((h, i) => (
              <div key={h.label} style={{ display: 'contents' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: TONE[h.t][0], color: TONE[h.t][1], display: 'grid', placeItems: 'center' }}><Icon d={h.d} size={18} /></span>
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>{h.label}</span>
                </div>
                {i < 2 && <span style={{ width: 16, height: 36, display: 'grid', placeItems: 'center', color: 'var(--text-disabled)', flex: 'none' }}><Icon d={CI.arrowL} size={16} /></span>}
              </div>
            ))}
          </div>
        </div>
      </Scr>

      <AppHeader
        leading={
          <>
            <Link href={routes.app.credit} className="ibtn" aria-label="بازگشت" style={{ marginLeft: -4, color: 'var(--text-primary)', flex: 'none' }}><Icon name="back" /></Link>
            <label style={{ flex: 1, minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', cursor: 'text' }}>
              <Icon d={CI.search} size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی فروشگاه یا کالا" aria-label="جستجوی فروشگاه یا کالا" style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--text-primary)', outline: 'none', padding: 0 }} />
            </label>
          </>
        }
        actions={
          <button type="button" className="ibtn" aria-label="فقط فروشگاه‌های با پیشنهاد ویژه" aria-pressed={special} onClick={() => setSpecial(!special)}
            style={{ width: 32, height: 32, flex: 'none', color: special ? 'var(--primary-text)' : 'var(--text-secondary)', background: special ? 'var(--soft-primary)' : 'transparent', marginRight: 8 }}>
            <Icon d={CI.sliders} />
          </button>
        }
      />
      <BottomNav active="credit" />
    </>
  );
}

