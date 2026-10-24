'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useInstallments, usePortfolio } from '@/api/app';
import type { InstallmentPurchaseX } from '@/api/app-credit-extra';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, time } from '@/lib/format';
import { CI } from '@/components/app/credit/icons';
import { addDays, KvRows, LockSplit } from '@/components/app/credit/ui';

export default function InstallmentDonePage() {
  return (
    <Suspense fallback={<Scr gap={10}><Skeleton h={126} /><Skeleton h={160} /></Scr>}>
      <Done />
    </Suspense>
  );
}

function Done() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const insts = useInstallments();
  const pf = usePortfolio();
  const [copied, setCopied] = useState(false);

  const ip = (insts.data as InstallmentPurchaseX[] | undefined)?.find((x) => x.id === id);
  const lock = ip ? pf.data?.holdings.flatMap((h) => h.locks).find((l) => l.id === ip.lockId) : undefined;
  const h = lock ? pf.data?.holdings.find((x) => x.kind === lock.holdingKind) : undefined;
  const lockAmt = ip?.collateralAmount ?? lock?.amount ?? 0;
  const first = ip ? addDays(ip.createdAt, 30) : '';
  const expires = ip?.codeExpiresAt ?? (ip ? addDays(ip.createdAt, 3) : '');

  const copy = async () => {
    if (!ip) return;
    try { await navigator.clipboard.writeText(ip.purchaseCode); } catch { /* clipboard unavailable */ }
    setCopied(true);
  };

  return (
    <>
      <Scr gap={10}>
        {insts.isLoading && <><Skeleton h={126} /><Skeleton h={160} /><Skeleton h={130} /></>}
        {insts.isError && <ErrorState onRetry={() => insts.refetch()} />}
        {insts.data && !ip && <ErrorState message="خرید اقساطی پیدا نشد." />}

        {ip && (
          <>
            {/* success */}
            <div style={{ boxSizing: 'border-box', height: 126, padding: '4px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 'none', textAlign: 'center' }}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 8px rgb(var(--success-main-rgb) / .08)' }}><Icon d={CI.check2} size={32} /></span>
              <h2 style={{ margin: '4px 0 0', height: 24, fontSize: 18, fontWeight: 700, lineHeight: '24px' }}>خرید اقساطی ثبت شد</h2>
              <span style={{ height: 16, fontSize: 12, lineHeight: '16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{ip.title} · {ip.storeName} · {faDigits(ip.months)} قسط</span>
            </div>

            {/* code */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 'none', textAlign: 'center', borderColor: 'rgb(var(--primary-main-rgb) / .4)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1 }}>کد خرید شما</span>
              <div className="row" style={{ gap: 10, height: 44 }}>
                <span dir="ltr" className="num" style={{ fontSize: 30, letterSpacing: '.08em', lineHeight: 1, whiteSpace: 'nowrap', color: 'var(--primary-text)', fontWeight: 400 }}>{ip.purchaseCode}</span>
                <button type="button" onClick={copy} aria-label={copied ? 'کپی شد' : 'کپی کد'} aria-pressed={copied} style={{ width: 40, height: 40, borderRadius: 10, border: 0, background: copied ? 'var(--soft-success)' : 'var(--soft-primary)', color: copied ? 'var(--success-text)' : 'var(--primary-text)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, flex: 'none' }}><Icon d={copied ? CI.check2 : CI.copy} size={18} /></button>
              </div>
              <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>این کد را هنگام پرداخت در <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ip.storeName}</span> وارد کنید.</span>
              <span className="lbl" style={{ background: 'var(--soft-warning)', color: 'var(--warning-text)', gap: 4 }}><Icon d={CI.clock} size={12} />اعتبار ۷۲ ساعت · تا {jDayMonth(expires)} {time(expires)}</span>
            </div>

            {/* summary */}
            <div className="card" style={{ boxSizing: 'border-box', padding: '4px 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
              <KvRows h={32} rows={[
                { k: 'مبلغ خرید', v: money(ip.price), u: 'تومان' },
                { k: 'پیش‌پرداخت (از کیف پول ریالی)', v: money(ip.prepayment ?? 0), u: 'تومان' },
                { k: 'اقساط', v: `${faDigits(ip.months)} × ${money(ip.monthly)}`, u: 'تومان' },
                { k: 'اولین قسط', v: jDayMonth(first), u: jDate(first).slice(0, 4) },
              ]} />
            </div>

            {/* new reserve */}
            {h && lock && (
              <Link href={routes.app.asset(h.kind)} className="card" style={{ boxSizing: 'border-box', padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none', color: 'var(--text-primary)', textDecoration: 'none' }}>
                <div className="row" style={{ height: 22, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>رزرو جدید</span>
                  <span className="lktype" style={{ background: LOCK_META.installment.bg, color: LOCK_META.installment.fg }}><Icon d={LOCK_META.installment.d} size={12} />{LOCK_META.installment.label}</span>
                  <Icon d={CI.chevL} size={16} style={{ marginRight: 'auto', color: 'var(--text-disabled)' }} />
                </div>
                <span className="num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{money(lockAmt)} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>از {h.name} رزرو شد</span></span>
                <LockSplit free={h.free} locked={h.locked} />
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>با پرداخت هر قسط {money(lockAmt / Math.max(1, ip.months))} آزاد می‌شود · اگر کد تا {jDayMonth(expires)} استفاده نشود، کل پشتوانه آزاد می‌شود.</span>
              </Link>
            )}

            <Link href={routes.app.credit} style={{ height: 48, boxSizing: 'border-box', borderRadius: 8, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}>بازگشت به اعتبار</Link>
            <Link href={`${routes.app.payInstallment()}?inst=${encodeURIComponent(ip.id)}`} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none', flex: 'none' }}><Icon d={CI.chevL} size={16} />مشاهده سفارش و اقساط</Link>
          </>
        )}
      </Scr>

      <AppHeader title="کد خرید" back={routes.app.credit} backIcon="close" badge={ip ? <span className="lbl" style={{ marginRight: 'auto', marginLeft: 4, background: 'var(--soft-success)', color: 'var(--success-text)', fontWeight: 600 }}>ثبت شد</span> : undefined} />
      <BottomNav active="credit" />
    </>
  );
}
