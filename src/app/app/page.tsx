'use client';
/**
 * Home — «دارایی‌ها» (design: app-assets).
 * Sticky hero card deck (total + one card per holding), pending packages, wallets with
 * withdrawable/locked split, and recent activity in a sheet that scrolls over the hero.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import './page.css';
import { useFund, useInbox, useMe, usePortfolio, useTransactions } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { HERO_COLORS, P, TONE, txVisual, walletDot } from '@/components/app/core/meta';
import { faDigits, jDate, money, percent, relTime, signedMoney } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import type { Holding, InboxPackage, Portfolio, Transaction } from '@/types/domain';

const HIDE_KEY = 'nm-hide-balance';
const MASK = '••••••';

export default function HomePage() {
  const me = useMe();
  const pf = usePortfolio();
  const pending = useInbox('pending');
  const txs = useTransactions({ limit: 5 });
  const [hidden, setHidden] = useState(false);

  useEffect(() => { try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { /* storage unavailable */ } }, []);
  const toggleHidden = () => setHidden((h) => { try { localStorage.setItem(HIDE_KEY, h ? '0' : '1'); } catch { /* ignore */ } return !h; });
  const m = (n: number) => (hidden ? MASK : money(n));

  const pendingList = pending.data ?? [];
  const first = me.data?.firstName;

  return (
    <div className="pg-home">
      <Scr gap={12} style={{ paddingBottom: 0 }}>
        {pf.isLoading ? (
          <>
            <Skeleton h={196} r={16} />
            <Skeleton h={320} r={28} />
          </>
        ) : pf.isError || !pf.data ? (
          <ErrorState message="دریافت دارایی‌ها ممکن نشد" onRetry={() => pf.refetch()} />
        ) : (
          <>
            <HeroDeck portfolio={pf.data} pendingCount={pendingList.length} hidden={hidden} onToggleHidden={toggleHidden} />

            {/* sheet: scrolls up over the pinned hero card */}
            <section className="home-sheet" aria-label="کیف پول‌ها، دریافتی‌ها و فعالیت‌ها">
              <span className="grab" aria-hidden="true" />
              {pendingList.length > 0 && <PendingBlock list={pendingList} m={m} />}
              <WalletList holdings={pf.data.holdings} m={m} />
              <Activity list={txs.data} loading={txs.isLoading} />
            </section>
          </>
        )}
      </Scr>

      <AppHeader
        leading={
          <>
            <Link href={routes.app.profile} aria-label="حساب کاربری" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, marginRight: 4, textDecoration: 'none', flex: 'none' }}>
              {me.data?.avatarLetter ?? ''}
            </Link>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginRight: 4, whiteSpace: 'nowrap', minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{first ? `سلام، ${first}` : 'سلام'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.data?.orgName ?? ''}</span>
            </span>
          </>
        }
      />
      <BottomNav active="assets" />
    </div>
  );
}

// ───────────────────────── Hero deck ─────────────────────────

type HeroCard =
  | { k: 'total' }
  | { k: 'asset'; h: Holding; g1: string; g2: string };

const HPOS: [string, number, number][] = [['none', 1, 10], ['translateY(9px) scale(.955)', 1, 9], ['translateY(18px) scale(.91)', 1, 8]];

function HeroDeck({ portfolio, pendingCount, hidden, onToggleHidden }: { portfolio: Portfolio; pendingCount: number; hidden: boolean; onToggleHidden: () => void }) {
  const cards: HeroCard[] = [
    { k: 'total' },
    ...portfolio.holdings
      .filter((h) => h.value > 0 || h.kind === 'rial')
      .map((h) => {
        const [g1, g2] = HERO_COLORS[h.kind] ?? ['#434A62', '#6B7390'];
        return { k: 'asset' as const, h, g1, g2 };
      }),
  ];
  const n = cards.length;
  const [hci, setHci] = useState(0);
  const [hprev, setHprev] = useState(-1);
  const cur = Math.min(hci, n - 1);
  const goTo = (to: number) => { if (to === cur) return; setHprev(cur); setHci(to); };

  // live price ticks: every ~3.5s the total moves; a rise flashes green, then fades back
  const [gain, setGain] = useState(0);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      const step = Math.round((Math.random() < 0.8 ? 1 : -0.5) * (4000 + Math.random() * 14000));
      setGain((g) => g + step);
      setFlash(step > 0 ? 'up' : 'down');
      if (fade.current) clearTimeout(fade.current);
      fade.current = setTimeout(() => setFlash(''), 1100);
    }, 3500);
    return () => { clearInterval(t); if (fade.current) clearTimeout(fade.current); };
  }, []);
  // a new snapshot from the server resets the simulated drift
  useEffect(() => { setGain(0); }, [portfolio.updatedAt, portfolio.total]);

  const total = portfolio.total + gain;
  const profit = portfolio.changeToday + gain;
  const base = portfolio.total - portfolio.changeToday;
  const pct = base ? (profit / base) * 100 : 0;

  return (
    <div style={{ flex: 'none', position: 'sticky', top: 12, zIndex: 0 }}>
      <div role="region" aria-roledescription="carousel" aria-label="دارایی کل و دارایی‌ها" style={{ position: 'relative', height: 214 }}>
        {cards.map((c, i) => {
          const rel = (i - cur + n) % n;
          const [tf, op, z] = HPOS[rel] ?? ['translateY(18px) scale(.91)', 0, 1];
          const front = rel === 0;
          const isTotal = c.k === 'total';
          const title = isTotal ? 'دارایی کل' : c.h.name;
          const bg = isTotal ? 'var(--bg-paper) linear-gradient(135deg, rgb(var(--primary-main-rgb) / .10), transparent 60%)' : `linear-gradient(135deg, ${c.g1} 0%, ${c.g2} 100%)`;
          const fg = isTotal ? 'var(--text-primary)' : '#FFFFFF';
          const fg2 = isTotal ? 'var(--text-secondary)' : 'rgb(255 255 255 / .82)';
          const up = isTotal ? profit >= 0 : c.h.change >= 0;
          return (
            <div
              key={isTotal ? 'total' : c.h.kind}
              className={'card' + (i === hprev && !front ? ' hero-leave' : '')}
              aria-hidden={!front}
              style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 196, boxSizing: 'border-box', padding: '6px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', background: bg, color: fg, transformOrigin: 'center bottom', transform: tf, opacity: op, zIndex: z, transition: 'transform .45s cubic-bezier(.2,.8,.2,1), opacity .35s ease' }}
            >
              <button onClick={() => goTo(front ? (i + 1) % n : i)} aria-label={front ? 'کارت بعدی' : 'نمایش ' + title} tabIndex={front ? 0 : -1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, margin: 0, padding: 0, background: 'transparent', cursor: 'pointer' }} />
              <span aria-hidden="true" style={{ position: 'absolute', left: -50, top: -70, width: 180, height: 180, borderRadius: '50%', background: isTotal ? 'rgb(var(--primary-main-rgb) / .08)' : 'rgb(255 255 255 / .12)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none', opacity: front ? 1 : 0, transition: 'opacity .3s' }}>
                <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: isTotal ? 'var(--primary-main)' : '#FFFFFF', flex: 'none' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: fg2, whiteSpace: 'nowrap' }}>{title}</span>
                  {isTotal ? (
                    <button className="ibtn" onClick={onToggleHidden} tabIndex={front ? 0 : -1} aria-label={hidden ? 'نمایش موجودی' : 'پنهان کردن موجودی'} aria-pressed={hidden} style={{ marginRight: 'auto', marginLeft: -12, pointerEvents: 'auto', color: 'var(--text-secondary)' }}>
                      <Icon d={hidden ? P.eyeOff : P.eye} size={22} />
                    </button>
                  ) : (
                    <Link href={routes.app.asset(c.h.kind)} tabIndex={front ? 0 : -1} style={{ marginRight: 'auto', height: 32, padding: '0 8px', borderRadius: 9, background: 'rgb(255 255 255 / .18)', color: '#FFFFFF', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, pointerEvents: 'auto', textDecoration: 'none' }}>
                      جزئیات<Icon d={P.chevLeft} size={15} />
                    </Link>
                  )}
                </div>
                <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="num" style={{ fontSize: 30, lineHeight: '36px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: isTotal ? (flash === 'up' ? 'var(--success-text)' : flash === 'down' ? 'var(--error-text)' : 'var(--text-primary)') : '#FFFFFF', transition: 'color .9s ease' }}>
                      {hidden ? MASK : money(isTotal ? total : c.h.value)}
                    </span>{' '}
                    <span style={{ fontSize: 14, fontWeight: 400, color: fg2 }}>تومان</span>
                  </span>
                  <span aria-live={isTotal ? 'polite' : undefined} style={{ marginRight: 'auto', height: 40, boxSizing: 'border-box', padding: '3px 10px', borderRadius: 8, background: isTotal ? (flash === 'up' ? 'rgb(var(--success-main-rgb) / .32)' : up ? 'var(--soft-success)' : 'var(--soft-error)') : 'rgb(255 255 255 / .92)', transition: 'background .9s ease', color: isTotal ? (up ? 'var(--success-text)' : 'var(--error-text)') : up ? '#17734B' : '#B83232', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    <span dir="ltr" style={{ fontSize: 11, fontWeight: 500 }}>{hidden ? '••••' : signedMoney(isTotal ? profit : c.h.change)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      <span dir="ltr">{percent(isTotal ? pct : c.h.changePct, 2, true)}</span> {isTotal || c.h.kind !== 'rial' ? 'امروز' : 'این ماه'}
                    </span>
                  </span>
                </div>
                {isTotal ? <TotalActions pendingCount={pendingCount} front={front} /> : <AssetActions h={c.h} deep={c.g1} front={front} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ height: 12, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }} aria-label="انتخاب کارت">
        {cards.map((c, i) => {
          const on = i === cur;
          return (
            <button key={i} onClick={() => goTo(i)} aria-label={c.k === 'total' ? 'دارایی کل' : c.h.name} aria-current={on} style={{ width: on ? 18 : 6, height: 6, padding: 0, border: 0, borderRadius: 3, background: on ? 'var(--primary-main)' : 'rgb(var(--grey-500-rgb) / .35)', cursor: 'pointer', transition: 'width .3s, background .3s' }} />
          );
        })}
      </div>
    </div>
  );
}

function QuickAction({ href, label, d, front }: { href: string; label: string; d: string; front: boolean }) {
  return (
    <Link href={href} aria-label={label} className="qa" tabIndex={front ? 0 : -1} style={{ width: 48, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}>
      <span style={{ width: 48, height: 48, boxSizing: 'border-box', border: '1px solid var(--glass-edge)', borderRadius: 14, background: 'var(--bg-paper)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-z1)' }}>
        <Icon d={d} size={20} strokeWidth={1.8} />
      </span>
      <span style={{ fontSize: 11, lineHeight: '13px', whiteSpace: 'nowrap' }}>{label}</span>
    </Link>
  );
}

function TotalActions({ pendingCount, front }: { pendingCount: number; front: boolean }) {
  const primary = { flex: 1, minWidth: 0, height: 48, borderRadius: 14, background: 'var(--primary-main)', color: '#FFFFFF', textDecoration: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-primary)' } as const;
  return (
    <nav aria-label="اکشن‌های سریع" style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, pointerEvents: 'auto' }}>
      {pendingCount > 0 ? (
        <>
          <Link href={routes.app.inbox()} tabIndex={front ? 0 : -1} aria-label={`دریافتی‌ها — ${faDigits(pendingCount)} دریافتی جدید`} style={primary}>
            <Icon d={P.inbox} size={20} strokeWidth={1.8} />دریافتی‌ها
            <span className="num" style={{ minWidth: 20, height: 20, boxSizing: 'border-box', padding: '0 5px', borderRadius: 999, background: 'rgb(255 255 255 / .25)', fontSize: 11, display: 'grid', placeItems: 'center' }}>{faDigits(pendingCount)}</span>
          </Link>
          <QuickAction href={routes.app.deposit()} label="واریز" d={P.deposit} front={front} />
        </>
      ) : (
        <>
          <Link href={routes.app.deposit()} tabIndex={front ? 0 : -1} aria-label="افزایش دارایی — واریز از کارت بانکی" style={primary}>
            <Icon d={P.plus} size={20} strokeWidth={1.8} />افزایش دارایی
          </Link>
          <QuickAction href={routes.app.inbox()} label="دریافتی‌ها" d={P.inbox} front={front} />
        </>
      )}
      <QuickAction href={routes.app.withdraw} label="برداشت" d={P.withdraw} front={front} />
      <QuickAction href={routes.app.credit} label="اعتبار" d={P.credit} front={front} />
    </nav>
  );
}

function AssetActions({ h, deep, front }: { h: Holding; deep: string; front: boolean }) {
  const isRial = h.kind === 'rial';
  const fundId = h.fundId ?? h.kind;
  const a1 = isRial ? { label: 'واریز', href: routes.app.deposit(), d: P.deposit } : { label: 'خرید', href: routes.app.convert('buy', fundId), d: P.plus };
  const a2 = isRial ? { label: 'برداشت', href: routes.app.withdraw, d: P.withdraw } : { label: 'فروش', href: routes.app.convert('sell', fundId), d: P.minus };
  const base = { flex: 1, minWidth: 0, height: 48, borderRadius: 14, textDecoration: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 } as const;
  return (
    <nav aria-label={'اکشن‌های ' + h.name} style={{ marginTop: 16, height: 67, display: 'flex', alignItems: 'flex-start', gap: 8, pointerEvents: 'auto' }}>
      <Link href={a1.href} tabIndex={front ? 0 : -1} style={{ ...base, background: '#FFFFFF', color: deep, boxShadow: '0 8px 18px -8px rgb(20 24 38 / .45)' }}>
        <Icon d={a1.d} size={20} strokeWidth={1.8} />{a1.label}
      </Link>
      <Link href={a2.href} tabIndex={front ? 0 : -1} style={{ ...base, background: 'rgb(255 255 255 / .2)', color: '#FFFFFF', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / .35)' }}>
        <Icon d={a2.d} size={20} strokeWidth={1.8} />{a2.label}
      </Link>
    </nav>
  );
}

// ───────────────────────── Sheet sections ─────────────────────────

function SectionHead({ title, badge, href, linkLabel = 'همه' }: { title: string; badge?: number; href: string; linkLabel?: string }) {
  return (
    <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      {badge !== undefined && (
        <span className="num" style={{ minWidth: 20, height: 20, boxSizing: 'border-box', padding: '0 6px', borderRadius: 999, background: 'var(--error-main)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'inline-grid', placeItems: 'center' }}>{faDigits(badge)}</span>
      )}
      <Link href={href} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        {linkLabel}<Icon d={P.chevLeft} size={16} />
      </Link>
    </div>
  );
}

function PendingBlock({ list, m }: { list: InboxPackage[]; m: (n: number) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
      <SectionHead title="دریافتی‌های در انتظار" badge={list.length} href={routes.app.inbox()} />
      {list.map((p) => (
        <Link
          key={p.id}
          href={routes.app.inbox(p.id)}
          className="card"
          aria-label={`دریافتی جدید: ${p.title} از ${p.orgName}، ${money(p.amount)} تومان، در انتظار تأیید`}
          style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-primary)', textDecoration: 'none', borderColor: 'rgb(var(--primary-main-rgb) / .35)', backgroundImage: 'linear-gradient(135deg, rgb(var(--primary-main-rgb) / .08), transparent 60%)' }}
        >
          <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-main)', flex: 'none' }} />
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
            <span className="num" style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{jDate(p.sentAt)}</span>
          </div>
          <div style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="num" style={{ fontSize: 18, lineHeight: 1, whiteSpace: 'nowrap' }}>{m(p.amount)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
            <span className="btn" style={{ marginRight: 'auto', height: 30, padding: '0 14px', borderRadius: 9, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, boxShadow: 'var(--shadow-primary)' }}>
              <Icon d={P.check} size={15} strokeWidth={2} />تأیید
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function WalletList({ holdings, m }: { holdings: Holding[]; m: (n: number) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
      <SectionHead title="کیف پول‌ها و صندوق‌ها" href={routes.app.funds} linkLabel="همه صندوق‌ها" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {holdings.map((h) => {
          const down = h.changePct < 0;
          return (
            <Link key={h.kind} href={routes.app.asset(h.kind)} className="card" style={{ boxSizing: 'border-box', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-primary)', textDecoration: 'none' }}>
              <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: walletDot(h.kind), flex: 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.name}</span>
                <Icon d={P.chevLeft} size={18} style={{ marginRight: 'auto', color: 'var(--text-disabled)' }} />
              </div>
              <div style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="num" style={{ fontSize: 18, lineHeight: 1, whiteSpace: 'nowrap' }}>{m(h.value)} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span></span>
                <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {h.fundId && h.kind !== 'fixed' && <Spark fundId={h.fundId} />}
                  {h.kind !== 'rial' && (
                    <span className="lbl" style={{ height: 22, background: down ? 'var(--soft-error)' : 'var(--soft-success)', color: down ? 'var(--error-text)' : 'var(--success-text)' }}>{percent(h.changePct, 1, true)}</span>
                  )}
                </span>
              </div>
              <div className="lkleg" style={{ height: 20, borderTop: '1px dashed var(--divider)', paddingTop: 6, marginTop: 2 }}>
                <span><span className="lkdot" />قابل برداشت <b>{m(h.free)}</b></span>
                {h.locked > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={P.lock} size={12} />قفل‌شده <b>{m(h.locked)}</b></span>
                ) : (
                  <span>بدون قفل</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** 56×24 sparkline of the fund's NAV over the last month (hand-made SVG as in the design). */
function Spark({ fundId }: { fundId: string }) {
  const { data } = useFund(fundId);
  const hist = data?.history ?? [];
  if (hist.length < 2) return null;
  const last = hist.slice(-30);
  const step = Math.max(1, Math.floor(last.length / 7));
  const pts = last.filter((_, i) => i % step === 0 || i === last.length - 1).slice(-8).map((p) => p.v);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${Math.round((i / (pts.length - 1)) * 56)} ${Math.round(20 - ((v - min) / span) * 16)}`).join(' ');
  return (
    <span dir="ltr" style={{ width: 56, height: 24, display: 'block' }}>
      <svg viewBox="0 0 56 24" width="56" height="24" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Activity({ list, loading }: { list?: Transaction[]; loading: boolean }) {
  const items = list ?? [];
  const at = now();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>فعالیت اخیر</span>
        <Link href={routes.app.history()} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>همه<Icon d={P.chevLeft} size={16} /></Link>
      </div>
      {loading ? (
        <Skeleton h={112} />
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>هنوز فعالیتی ثبت نشده است.</div>
      ) : (
        <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
          {items.map((t, i) => {
            const v = txVisual(t);
            const [bg, fg] = TONE[v.tone];
            const isLock = t.category === 'lock';
            return (
              <Link key={t.id} href={routes.app.transaction(t.id)} style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px dashed ${i === items.length - 1 ? 'transparent' : 'var(--divider)'}`, color: 'var(--text-primary)', textDecoration: 'none' }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={v.d} size={18} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{relTime(t.at, at)}</span>
                </span>
                <span className="num" style={{ fontSize: 14, fontWeight: 400, color: !isLock && t.amount > 0 ? 'var(--success-text)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {isLock ? money(t.amount) : signedMoney(t.amount)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
