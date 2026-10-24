'use client';
/** «به دارایی شما اضافه شد» — after accepting a package (design: app-inbox-done). */
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useFunds, useInboxItem, usePortfolio, useTransactions } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { outcome } from '@/components/app/core/inbox';
import { P, PARTS, policyTag, splitPct } from '@/components/app/core/meta';
import { FreeLockedBlock } from '@/components/app/core/ui';
import { money, units } from '@/lib/format';
import { HOURGLASS, LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

export default function InboxDonePage() {
  return (
    <>
      <Suspense fallback={<Scr gap={12}><Skeleton h={180} /></Scr>}>
        <DoneContent />
      </Suspense>
      <AppHeader title="دریافت بسته" />
      <BottomNav active="inbox" />
    </>
  );
}

function DoneContent() {
  const id = useSearchParams().get('id') ?? '';
  const item = useInboxItem(id);
  const pf = usePortfolio();
  const funds = useFunds();
  const txs = useTransactions({ category: 'inbox', limit: 5 });

  if (!id) return <Scr gap={12}><ErrorState message="بسته‌ای انتخاب نشده است" /></Scr>;
  if (item.isLoading) return <Scr gap={12}><Skeleton h={180} /><Skeleton h={160} /><Skeleton h={96} /></Scr>;
  if (item.isError || !item.data) return <Scr gap={12}><ErrorState message="بسته پیدا نشد" onRetry={() => item.refetch()} /></Scr>;

  const pkg = item.data;
  if (pkg.status !== 'accepted') {
    return (
      <Scr gap={12}>
        <ErrorState message="این بسته هنوز تأیید نشده است." />
        <Link href={routes.app.inbox(pkg.id)} className="btn" style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none', flex: 'none' }}>رفتن به دریافتی‌ها</Link>
      </Scr>
    );
  }

  const split = pkg.acceptedSplit ?? pkg.fixedSplit ?? { gold: 50, fixed: 50 };
  const tag = policyTag(pkg.lockPolicy);
  const done = PARTS.filter((p) => splitPct(split, p.key) > 0).map((p) => {
    const w = splitPct(split, p.key);
    const v = Math.round((pkg.amount * w) / 100);
    const nav = p.key === 'rial' ? undefined : funds.data?.find((f) => f.id === p.key)?.nav;
    const locked = p.key !== 'rial' && pkg.lockPolicy.type !== 'none';
    return {
      ...p, w, v,
      unitsText: p.key === 'rial' ? 'نقدی' : nav ? `${units(v / nav, 2)} واحد` : '',
      tlabel: locked ? tag.label : 'آزاد',
      tbg: locked ? tag.bg : 'var(--soft-success)',
      tfg: locked ? tag.fg : 'var(--success-text)',
      td: locked ? tag.d : LOCK_META.none.d,
    };
  });
  const out = outcome(pkg, split);
  const tx = txs.data?.find((t) => t.title.includes(pkg.title));

  return (
    <Scr gap={12}>
      {/* success block */}
      <div style={{ boxSizing: 'border-box', height: 180, padding: '6px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flex: 'none', textAlign: 'center' }}>
        <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 8px rgb(var(--success-main-rgb) / .08)' }}>
          <Icon d="M5 12.5l4.5 4.5L19 7.5" size={36} />
        </span>
        <h2 style={{ margin: '12px 0 0', height: 24, fontSize: 18, fontWeight: 700, lineHeight: '24px' }}>به دارایی شما اضافه شد</h2>
        <span className="num" style={{ marginTop: 4, height: 36, fontSize: 30, lineHeight: '36px', whiteSpace: 'nowrap' }}>{money(pkg.amount)} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
        <span style={{ marginTop: 4, height: 16, fontSize: 12, lineHeight: '16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{pkg.title} · {pkg.orgName}</span>
      </div>

      {/* allocation done */}
      <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>تخصیص انجام‌شده</span>
          <span className="lbl" style={{ marginRight: 'auto', height: 20, background: 'var(--soft-success)', color: 'var(--success-text)' }}>موفق</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {done.map((dn) => (
            <div key={dn.key} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dn.color, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dn.name}</span>
                <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{dn.unitsText}</span>
              </span>
              <span className="lktype" style={{ background: dn.tbg, color: dn.tfg }}><Icon d={dn.td} size={12} />{dn.tlabel}</span>
              <span className="num" style={{ width: 84, textAlign: 'left', fontSize: 14, fontWeight: 400, whiteSpace: 'nowrap' }}>{money(dn.v)}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 8, display: 'flex', gap: 2 }}>
          {done.map((dn) => <span key={dn.key} style={{ flex: dn.w, height: 8, borderRadius: 3, background: dn.color }} />)}
        </div>
      </div>

      {/* free vs reserved of this package */}
      <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>از این بسته</span>
        <FreeLockedBlock free={out.free} locked={out.locked} freeNote={out.freeNote} lockNote={out.lockNote} fmt={money} />
      </div>

      {/* new total */}
      {pf.data && (
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>دارایی کل جدید:</span>
            <span className="num" style={{ marginRight: 'auto', fontSize: 16, whiteSpace: 'nowrap' }}>{money(pf.data.total)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
          </div>
          <LockBar free={pf.data.free} locked={pf.data.locked} />
          <div className="lkleg">
            <span><span className="lkdot" />آزاد <b>{money(pf.data.free)}</b></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={HOURGLASS} size={12} />رزرو <b>{money(pf.data.locked)}</b></span>
          </div>
        </div>
      )}

      {/* actions */}
      <Link href={routes.app.home} className="btn" style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none', flex: 'none' }}>مشاهده دارایی‌ها</Link>
      <Link href={tx ? routes.app.transaction(tx.id) : routes.app.history('inbox')} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', textDecoration: 'none', flex: 'none' }}>
        جزئیات تراکنش<Icon d={P.chevLeft} size={16} />
      </Link>
    </Scr>
  );
}
