'use client';
/**
 * Home — «دارایی‌ها» (design: app-assets).
 * Sticky hero card deck (total + one card per holding), pending packages, wallets with
 * withdrawable/reserved split, and recent activity in a sheet that scrolls over the hero.
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
import { HERO_COLORS, P } from '@/components/app/core/meta';
import { faDigits, jDate, jDayMonth, money, percent, signedMoney, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { ASSET_ICON, HOURGLASS } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { txVisual } from '@/components/app/money/lib';
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
            <section className="home-sheet" aria-label="کیف پول‌ها، دریافتی‌ها و تراکنش‌ها">
              <span className="grab" aria-hidden="true" />
              {pendingList.length > 0 && <PendingBlock list={pendingList} m={m} />}
              <WalletList holdings={pf.data.holdings} m={m} />
              <Transactions list={txs.data} loading={txs.isLoading} />
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
// tapping a peek brings it forward, the dots under the stack show where you are.
// All cards are white with a faint tint of their asset color; actions sit inside the card.

type HeroCard =
  | { k: 'total' }
  | { k: 'asset'; h: Holding; g1: string };

const PEEK = 30; // visible height of each card peeking behind the front one
const MAX_PEEKS = 2;
const CARD_H = 218;

function HeroDeck({ portfolio, pendingCount, hidden, onToggleHidden }: { portfolio: Portfolio; pendingCount: number; hidden: boolean; onToggleHidden: () => void }) {
  const cards: HeroCard[] = [
    { k: 'total' },
    ...portfolio.holdings
      .filter((h) => h.value > 0 || h.kind === 'rial')
      .map((h) => ({ k: 'asset' as const, h, g1: (HERO_COLORS[h.kind] ?? ['#434A62'])[0] })),
  ];
  const n = cards.length;
  const peeks = Math.min(MAX_PEEKS, n - 1);
  const [cur, setCur] = useState(0);
  const at = Math.min(cur, n - 1);

  // live price ticks: every ~3.5s the total moves; a rise flashes green, then settles
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
    <div className="hd">
      <div className="hd-stack" role="region" aria-roledescription="carousel" aria-label="دارایی کل و دارایی‌ها" style={{ height: peeks * PEEK + CARD_H }}>
        {cards.map((c, i) => {
          const rel = (i - at + n) % n; // 0 = front, 1..peeks = peeking behind
          const shown = rel <= peeks;
          const front = rel === 0;
          const isTotal = c.k === 'total';
          const name = isTotal ? 'دارایی کل' : c.h.name;
          const value = isTotal ? total : c.h.value;
          const change = isTotal ? profit : c.h.change;
          const changePct = isTotal ? pct : c.h.changePct;
          const free = isTotal ? portfolio.free : c.h.free;
          const locked = isTotal ? portfolio.locked : c.h.locked;
          const up = change >= 0;
          const tint = isTotal ? 'var(--primary-main)' : c.g1;
          return (
            <article
              key={isTotal ? 'total' : c.h.kind}
              className={'hd-card' + (front ? ' front' : '')}
              aria-hidden={!front}
              style={{
                top: front ? peeks * PEEK : Math.max(0, (peeks - rel) * PEEK),
                height: CARD_H,
                transform: front ? 'none' : `scale(${1 - rel * 0.045})`,
                opacity: shown ? 1 : 0,
                zIndex: 10 - rel,
                '--tint': tint,
              } as React.CSSProperties}
            >
              <LogoMark size={190} className="hd-wm" />
              {!front && shown && (
                <button type="button" className="hd-peek" onClick={() => setCur(i)} aria-label={'نمایش ' + name}>
                  {isTotal ? <LogoMark size={12} className="hd-logo" /> : <AssetIc kind={c.h.kind} size="sm" />}
                  <span>{name}</span>
                  <b className="num">{m(value)}</b>
                </button>
              )}
              <header className="hd-head">
                {isTotal ? <LogoMark size={16} className="hd-logo" /> : <AssetIc kind={c.h.kind} />}
                <span className="hd-name">{name}</span>
                {isTotal && (
                  <button type="button" className="hd-ghost" onClick={onToggleHidden} tabIndex={front ? 0 : -1} aria-label={hidden ? 'نمایش موجودی' : 'پنهان کردن موجودی'} aria-pressed={hidden}>
                    <Icon d={hidden ? P.eyeOff : P.eye} size={18} />
                  </button>
                )}
              </header>
              <div className="hd-row">
                <div className={'hd-value num' + (isTotal && flash ? ' ' + flash : '')} aria-live={isTotal && front ? 'polite' : undefined}>
                  {m(value)}<small>تومان</small>
                </div>
                <div className={'hd-change' + (up ? ' up' : ' down')}>
                  <span dir="ltr" className="num">{hidden ? '••••' : signedMoney(change)}</span>
                  <span><span dir="ltr" className="num">{percent(changePct, 2, true)}</span> {isTotal || c.h.kind !== 'rial' ? 'امروز' : 'این ماه'}</span>
                </div>
              </div>
              <div className="hd-split">
                <span className="hd-bar" aria-hidden="true">
                  <i className="f" style={{ width: locked > 0 ? `calc(${(free / (free + locked)) * 100}% - 2px)` : '100%' }} />
                  {locked > 0 && <i className="l" />}
                </span>
                <span className="hd-leg num">
                  <span>آزاد {m(free)}</span>
                  {locked > 0 ? <span><Icon d={HOURGLASS} size={11} />رزرو {m(locked)}</span> : <span>همه آزاد</span>}
                </span>
              </div>
              {isTotal ? <TotalActions pendingCount={pendingCount} front={front} /> : <AssetActions h={c.h} front={front} />}
            </article>
          );
        })}
      </div>
      {n > 1 && (
        <div className="hd-dots" role="group" aria-label="انتخاب کارت">
          {cards.map((c, i) => (
            <button key={i} type="button" onClick={() => setCur(i)} aria-label={c.k === 'total' ? 'دارایی کل' : c.h.name} aria-current={i === at} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Symbol tile of a wallet / fund: faint tint of its color with the icon in that color. */
function AssetIc({ kind, size = 'md' }: { kind: Holding['kind']; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 11 : size === 'lg' ? 18 : 15;
  return (
    <span className={'ak ' + size} style={{ '--tint': (HERO_COLORS[kind] ?? ['#434A62'])[0] } as React.CSSProperties} aria-hidden="true">
      <Icon d={ASSET_ICON[kind] ?? ASSET_ICON.equity} size={px} strokeWidth={1.8} />
    </span>
  );
}

/** «دارایی کل» actions inside the card: one main action and three quick ones. */
function TotalActions({ pendingCount, front }: { pendingCount: number; front: boolean }) {
  const t = front ? 0 : -1;
  return (
    <nav className="hd-acts" aria-label="اکشن‌های سریع">
      {pendingCount > 0 ? (
        <Link href={routes.app.inbox()} tabIndex={t} className="hd-main" aria-label={`دریافتی‌ها — ${faDigits(pendingCount)} دریافتی جدید`}>
          <Icon d={P.inbox} size={19} strokeWidth={1.8} />دریافتی‌ها<span className="b num">{faDigits(pendingCount)}</span>
        </Link>
      ) : (
        <Link href={routes.app.deposit()} tabIndex={t} className="hd-main" aria-label="افزایش دارایی — واریز از کارت بانکی">
          <Icon d={P.plus} size={19} strokeWidth={1.8} />افزایش دارایی
        </Link>
      )}
      {pendingCount > 0
        ? <Quick href={routes.app.deposit()} label="واریز" d={P.deposit} t={t} />
        : <Quick href={routes.app.inbox()} label="دریافتی‌ها" d={P.inbox} t={t} />}
      <Quick href={routes.app.withdraw} label="برداشت" d={P.withdraw} t={t} />
      <Quick href={routes.app.credit} label="اعتبار" d={P.credit} t={t} />
    </nav>
  );
}

function Quick({ href, label, d, t }: { href: string; label: string; d: string; t: number }) {
  return (
    <Link href={href} tabIndex={t} className="hd-quick" aria-label={label}>
      <span className="ic"><Icon d={d} size={19} strokeWidth={1.8} /></span>
      <span className="lb">{label}</span>
    </Link>
  );
}

/** Asset card actions inside the card: buy / sell (wallet: deposit / withdraw) and «مشاهده» (the asset page). */
function AssetActions({ h, front }: { h: Holding; front: boolean }) {
  const isRial = h.kind === 'rial';
  const fundId = h.fundId ?? h.kind;
  const a1 = isRial ? { label: 'واریز', href: routes.app.deposit(), d: P.deposit } : { label: 'خرید', href: routes.app.convert('buy', fundId), d: P.plus };
  const a2 = isRial ? { label: 'برداشت', href: routes.app.withdraw, d: P.withdraw } : { label: 'فروش', href: routes.app.convert('sell', fundId), d: P.minus };
  const t = front ? 0 : -1;
  return (
    <nav className="hd-acts" aria-label={'اکشن‌های ' + h.name}>
      <Link href={a1.href} tabIndex={t} className="hd-main tinted"><Icon d={a1.d} size={19} strokeWidth={1.8} />{a1.label}</Link>
      <Link href={a2.href} tabIndex={t} className="hd-main soft"><Icon d={a2.d} size={19} strokeWidth={1.8} />{a2.label}</Link>
      <Quick href={routes.app.asset(h.kind)} label="مشاهده" d={P.eye} t={t} />
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
              <div style={{ height: 30, display: 'flex', alignItems: 'center', gap: 10 }}>
                <AssetIc kind={h.kind} size="lg" />
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={HOURGLASS} size={12} />رزروشده <b>{m(h.locked)}</b></span>
                ) : (
                  <span>همه آزاد</span>
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

/** Tehran calendar day of a moment, for grouping. */
const dayKey = (d: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(d));

/** Recent transactions grouped by day: icon, title, time · source, lock/status, signed amount. */
function Transactions({ list, loading }: { list?: Transaction[]; loading: boolean }) {
  const items = list ?? [];
  const today = dayKey(now());
  const yesterday = dayKey(new Date(now().getTime() - 86400000));
  const groups: { key: string; label: string; rows: Transaction[] }[] = [];
  for (const t of items) {
    const k = dayKey(t.at);
    let g = groups.find((x) => x.key === k);
    if (!g) {
      g = { key: k, label: k === today ? 'امروز' : k === yesterday ? 'دیروز' : jDayMonth(t.at), rows: [] };
      groups.push(g);
    }
    g.rows.push(t);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
      <SectionHead title="تراکنش‌ها" href={routes.app.history()} />
      {loading ? (
        <Skeleton h={112} />
      ) : items.length === 0 ? (
        <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>هنوز تراکنشی ثبت نشده است.</div>
      ) : (
        <div className="card tx-card">
          {groups.map((g) => (
            <section key={g.key} className="tx-day" aria-label={g.label}>
              <h3 className="tx-day-t num">{g.label}</h3>
              {g.rows.map((t) => {
                const v = txVisual(t);
                return (
                  <Link key={t.id} href={routes.app.transaction(t.id)} className="tx-row">
                    <span className="tx-ic" style={{ background: v.bg, color: v.fg }}><Icon d={v.d} size={19} /></span>
                    <span className="tx-main">
                      <b>{t.title}</b>
                      <span className="tx-meta">
                        {v.lock && <span className="lktype tx-lock" style={{ background: v.lock.bg, color: v.lock.fg }}><Icon d={v.lock.d} size={11} />{v.lock.label}</span>}
                        <span className="num">{time(t.at)}</span>
                        <span className="tx-sep" aria-hidden="true" />
                        <span className="tx-src">{t.subtitle}</span>
                      </span>
                    </span>
                    <span className="tx-amt">
                      <span className="num v" style={{ color: v.amountColor }}>{v.amount}</span>
                      {v.status
                        ? <span className="lbl tx-st" style={{ background: v.status.bg, color: v.status.fg }}>{v.status.label}</span>
                        : <small className="num">{v.sub2 ?? 'تومان'}</small>}
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
