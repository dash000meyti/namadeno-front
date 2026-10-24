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
import { LogoMark } from '@/components/ui/Brand';
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
            <Skeleton h={300} r={22} />
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

// ───────────────────────── Hero: wallet stack ─────────────────────────
// Apple-Wallet-like stack: one card in front, the next cards peek above it (name + value);
// tapping a peek brings it forward. The front «دارایی کل» is the black Namadno card. Actions live
// in one quiet row under the stack and follow the card in front.

type HeroCard =
  | { k: 'total' }
  | { k: 'asset'; h: Holding; g1: string; g2: string };

const PEEK = 28; // visible height of each card peeking behind the front one
const MAX_PEEKS = 2;

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
  const peeks = Math.min(MAX_PEEKS, n - 1);
  const [cur, setCur] = useState(0);
  const front = cards[Math.min(cur, n - 1)];

  // live price ticks: every ~3.5s the total moves; a rise glows, then settles
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
  useEffect(() => { setGain(0); }, [portfolio.updatedAt, portfolio.total]);

  const total = portfolio.total + gain;
  const profit = portfolio.changeToday + gain;
  const base = portfolio.total - portfolio.changeToday;
  const pct = base ? (profit / base) * 100 : 0;
  const m = (v: number) => (hidden ? MASK : money(v));

  return (
    <div className="hd" style={{ '--peeks': peeks } as React.CSSProperties}>
      <div className="hd-stack" role="region" aria-roledescription="carousel" aria-label="دارایی کل و دارایی‌ها" style={{ height: peeks * PEEK + 180 }}>
        {cards.map((c, i) => {
          const rel = (i - cur + n) % n; // 0 = front, 1..peeks = peeking behind
          const shown = rel <= peeks;
          const isTotal = c.k === 'total';
          const name = isTotal ? 'دارایی کل' : c.h.name;
          const value = isTotal ? total : c.h.value;
          const change = isTotal ? profit : c.h.change;
          const changePct = isTotal ? pct : c.h.changePct;
          const free = isTotal ? portfolio.free : c.h.free;
          const locked = isTotal ? portfolio.locked : c.h.locked;
          const up = change >= 0;
          const top = rel === 0 ? peeks * PEEK : Math.max(0, (peeks - rel) * PEEK);
          return (
            <article
              key={isTotal ? 'total' : c.h.kind}
              className={'hd-card' + (isTotal ? ' total' : '') + (rel === 0 ? ' front' : '')}
              aria-hidden={rel !== 0}
              style={{
                top,
                transform: rel === 0 ? 'none' : `scale(${1 - rel * 0.045})`,
                opacity: shown ? 1 : 0,
                zIndex: 10 - rel,
                background: isTotal ? undefined : `linear-gradient(150deg, ${c.g2} -20%, ${c.g1} 55%, color-mix(in srgb, ${c.g1} 70%, #000) 120%)`,
              }}
            >
              <LogoMark size={210} className="hd-wm" />
              {rel !== 0 && shown && (
                <button type="button" className="hd-peek" onClick={() => setCur(i)} aria-label={'نمایش ' + name} tabIndex={0}>
                  <span>{name}</span>
                  <b className="num">{m(value)}</b>
                  {rel === peeks && n - 1 > peeks && <i className="num">+{faDigits(n - 1 - peeks)}</i>}
                </button>
              )}
              <header className="hd-head">
                {isTotal ? <LogoMark size={16} /> : <span className="hd-dot" />}
                <span className="hd-name">{name}</span>
                {isTotal ? (
                  <button type="button" className="hd-ghost" onClick={onToggleHidden} tabIndex={rel === 0 ? 0 : -1} aria-label={hidden ? 'نمایش موجودی' : 'پنهان کردن موجودی'} aria-pressed={hidden}>
                    <Icon d={hidden ? P.eyeOff : P.eye} size={18} />
                  </button>
                ) : (
                  <Link href={routes.app.asset(c.h.kind)} className="hd-ghost pill" tabIndex={rel === 0 ? 0 : -1}>جزئیات<Icon d={P.chevLeft} size={14} /></Link>
                )}
              </header>
              <div className={'hd-value num' + (isTotal && flash ? ' ' + flash : '')} aria-live={isTotal && rel === 0 ? 'polite' : undefined}>
                {m(value)}<small>تومان</small>
              </div>
              <div className={'hd-change' + (up ? ' up' : ' down')}>
                <Icon d={up ? 'M6 14l6-6 6 6' : 'M6 10l6 6 6-6'} size={14} strokeWidth={2.2} />
                <span dir="ltr" className="num">{hidden ? '••••' : signedMoney(change)}</span>
                <span dir="ltr" className="num">({percent(changePct, 2, true)})</span>
                <span>{isTotal || c.h.kind !== 'rial' ? 'امروز' : 'این ماه'}</span>
              </div>
              <div className="hd-split">
                <span className="hd-bar" aria-hidden="true">
                  <i className="f" style={{ width: locked > 0 ? `calc(${(free / (free + locked)) * 100}% - 2px)` : '100%' }} />
                  {locked > 0 && <i className="l" />}
                </span>
                <span className="hd-leg num">
                  <span>آزاد {m(free)}</span>
                  {locked > 0 ? <span><Icon d={P.lock} size={11} />قفل {m(locked)}</span> : <span>بدون قفل</span>}
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <HeroActions card={front} pendingCount={pendingCount} />
    </div>
  );
}

/** One quiet row of round actions under the stack; follows the card in front. */
function HeroActions({ card, pendingCount }: { card: HeroCard; pendingCount: number }) {
  let items: { label: string; href: string; d: string; badge?: number; primary?: boolean }[];
  if (card.k === 'total') {
    items = [
      { label: 'دریافتی‌ها', href: routes.app.inbox(), d: P.inbox, badge: pendingCount, primary: pendingCount > 0 },
      { label: 'واریز', href: routes.app.deposit(), d: P.deposit, primary: pendingCount === 0 },
      { label: 'برداشت', href: routes.app.withdraw, d: P.withdraw },
      { label: 'اعتبار', href: routes.app.credit, d: P.credit },
    ];
  } else if (card.h.kind === 'rial') {
    items = [
      { label: 'واریز', href: routes.app.deposit(), d: P.deposit, primary: true },
      { label: 'برداشت', href: routes.app.withdraw, d: P.withdraw },
      { label: 'جزئیات', href: routes.app.asset('rial'), d: P.chevLeft },
    ];
  } else {
    const fundId = card.h.fundId ?? card.h.kind;
    items = [
      { label: 'خرید', href: routes.app.convert('buy', fundId), d: P.plus, primary: true },
      { label: 'فروش', href: routes.app.convert('sell', fundId), d: P.minus },
      { label: 'جزئیات', href: routes.app.asset(card.h.kind), d: P.chevLeft },
    ];
  }
  return (
    <nav className="hd-actions" aria-label="اکشن‌های سریع" key={card.k === 'total' ? 'total' : card.h.kind}>
      {items.map((a) => (
        <Link key={a.label} href={a.href} className={'hd-act' + (a.primary ? ' primary' : '')} aria-label={a.badge ? `${a.label} — ${faDigits(a.badge)} مورد جدید` : a.label}>
          <span className="ic">
            <Icon d={a.d} size={20} strokeWidth={1.8} />
            {!!a.badge && <span className="b num">{faDigits(a.badge)}</span>}
          </span>
          <span className="lb">{a.label}</span>
        </Link>
      ))}
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
