'use client';
/** /app/funds — design: app-funds (all funds, filter chips, search). */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useFunds, usePortfolio } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { compactMoney, faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Fund, Holding } from '@/types/domain';
import { RISK, fundMono, signedPct } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

type Filter = 'all' | 'mine' | 'commodity' | 'fixed' | 'equity' | 'soon';
const CHIPS: [Filter, string][] = [['all', 'همه'], ['mine', 'صندوق‌های من'], ['commodity', 'طلا و کالا'], ['fixed', 'درآمد ثابت'], ['equity', 'سهامی'], ['soon', 'به‌زودی']];

function matches(f: Fund, owned: boolean, filter: Filter) {
  const soon = f.status === 'coming_soon';
  switch (filter) {
    case 'all': return true;
    case 'mine': return owned;
    case 'soon': return soon;
    case 'commodity': return !soon && f.category === 'commodity';
    case 'fixed': return !soon && f.category === 'fixed_income';
    case 'equity': return !soon && (f.category === 'equity' || f.category === 'mixed');
    default: return true;
  }
}

export default function FundsPage() {
  const funds = useFunds();
  const pf = usePortfolio();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const holdings = useMemo(() => {
    const m: Record<string, Holding> = {};
    for (const h of pf.data?.holdings ?? []) if (h.fundId && h.value > 0) m[h.fundId] = h;
    return m;
  }, [pf.data]);

  const all = funds.data ?? [];
  const mine = all.filter((f) => !!holdings[f.id]).length;
  const term = q.trim();
  const list = all.filter((f) => matches(f, !!holdings[f.id], filter) && (!term || f.name.includes(term) || f.symbol.includes(term) || f.shortName.includes(term)));

  return (
    <div className="pg-money">
      <Scr gap={12}>
        <label style={{ height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: '1px solid var(--glass-border)', background: 'var(--card-bg)', boxShadow: 'var(--shadow-glass)', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Icon name="search" size={20} style={{ color: 'var(--text-secondary)' }} />
          <input className="mn-search" type="search" aria-label="جستجوی صندوق" placeholder="جستجوی نام یا نماد صندوق" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 'none' }} />
        </label>

        <div role="tablist" aria-label="فیلتر صندوق‌ها" className="mn-noscroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 'none', margin: '0 -16px', padding: '0 16px' }}>
          {CHIPS.map(([id, label]) => {
            const on = filter === id;
            return (
              <button key={id} role="tab" aria-selected={on} onClick={() => setFilter(id)} style={{ height: 34, flex: 'none', padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'var(--primary-main)' : 'var(--glass-border)'}`, background: on ? 'var(--primary-main)' : 'var(--card-bg)', color: on ? '#FFFFFF' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', flex: 'none' }}>
          <span className="num">{funds.data ? `${faDigits(all.length)} صندوق · ${faDigits(mine)} تا را دارید` : '…'}</span>
          <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-main)' }} />در سبد شما
          </span>
        </div>

        {funds.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={98} />)}
        {funds.isError && <ErrorState message={funds.error?.message} onRetry={() => void funds.refetch()} />}

        {list.map((f) => <FundCard key={f.id} fund={f} holding={holdings[f.id]} />)}

        {funds.data && list.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{term ? 'صندوقی با این نام پیدا نشد' : 'صندوقی در این دسته نیست'}</div>
        )}
        <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.8, color: 'var(--text-secondary)' }}>بازدهی‌ها مربوط به یک سال گذشته و نمونه هستند؛ بازدهی گذشته تضمینی برای آینده نیست.</p>
      </Scr>

      <AppHeader title="همه صندوق‌ها" back={routes.app.home} />
      <BottomNav active="assets" />
    </div>
  );
}

function FundCard({ fund: f, holding: h }: { fund: Fund; holding?: Holding }) {
  const owned = !!h;
  const soon = f.status === 'coming_soon';
  const buyable = !owned && !soon && f.status === 'active';
  const risk = RISK[f.risk];
  const ret = soon ? '—' : signedPct(f.return1y);
  const retColor = soon ? 'var(--text-secondary)' : f.return1y >= 0 ? 'var(--success-text)' : 'var(--error-text)';
  const free = h?.free ?? 0;
  const locked = h?.locked ?? 0;
  const freePct = h && h.value ? Math.round((free / h.value) * 1000) / 10 : 0;
  const aria = `${f.name}، بازدهی یک‌ساله ${ret}، ریسک ${soon ? '—' : risk.label}` + (owned ? `، در سبد شما · ${locked ? `آزاد ${compactMoney(free)}، قفل ${compactMoney(locked)}` : 'همه آزاد'}` : '');
  const style = { boxSizing: 'border-box' as const, padding: '12px 14px', display: 'flex', flexDirection: 'column' as const, gap: 8, color: 'var(--text-primary)', textDecoration: 'none', borderColor: owned ? 'rgb(var(--primary-main-rgb) / .28)' : 'var(--glass-border)', flex: 'none' };

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: owned ? 'var(--soft-primary)' : 'rgb(var(--grey-500-rgb) / .12)', color: owned ? 'var(--primary-text)' : 'var(--text-secondary)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flex: 'none' }}>{fundMono(f)}</span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>{f.name}</span>
            <span className="chip">{f.symbol}</span>
            {owned && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-main)', flex: 'none' }} aria-hidden="true" />}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.description}</span>
        </span>
        <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 700, color: retColor, whiteSpace: 'nowrap' }}>{ret}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
        <span>NAV <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{soon || !f.nav ? '—' : money(f.nav)}</span></span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-disabled)' }} />
        <span>ریسک <span style={{ color: soon ? 'var(--text-secondary)' : risk.color, fontWeight: 600 }}>{soon ? '—' : risk.label}</span></span>
        <span style={{ marginRight: 'auto' }} />
        {owned && <span className="lbl" style={{ height: 26, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>دارید · <span className="num">{compactMoney(h.value)}</span></span>}
        {buyable && <span className="lbl" style={{ height: 26, padding: '0 12px', background: 'var(--primary-main)', color: '#FFFFFF' }}>خرید</span>}
        {soon && <span className="lbl" style={{ height: 26, background: 'var(--soft-default)', color: 'var(--default-text)' }}>به‌زودی</span>}
      </div>
      {owned && (
        <div style={{ height: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
          {locked > 0 ? (
            <div className="lkleg" style={{ fontSize: 11, gap: 10 }}>
              <span><span className="lkdot" />آزاد <b>{compactMoney(free)}</b></span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="lock" size={12} />قفل <b>{compactMoney(locked)}</b></span>
            </div>
          ) : (
            <div className="lkleg" style={{ fontSize: 11, gap: 10 }}><span><span className="lkdot" />همه آزاد <b>{compactMoney(free)}</b></span></div>
          )}
          <div className="lkbar" role="img" aria-label={`آزاد ${compactMoney(free)} · قفل ${compactMoney(locked)}`} style={{ flex: 1, minWidth: 40, height: 5 }}>
            {free > 0 && <span className="f" style={{ width: locked > 0 ? `${freePct}%` : '100%' }} />}
            {locked > 0 && <span className="l" style={{ flex: 1 }} />}
          </div>
        </div>
      )}
    </>
  );

  if (owned) return <Link href={routes.app.asset(f.kind)} className="card" aria-label={aria} style={style}>{body}</Link>;
  if (buyable) return <Link href={routes.app.convert('buy', f.id)} className="card" aria-label={aria} style={style}>{body}</Link>;
  return <div className="card" aria-label={aria} aria-disabled="true" style={style}>{body}</div>;
}
