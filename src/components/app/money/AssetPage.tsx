'use client';
/**
 * Asset detail page shared by /app/assets/rial, /gold, /fixed and /[kind]
 * (design: app-rial, app-gold, app-fixed). Colored band with the «دارایی کل» card and
 * the free/locked composition, value chart, notes, active locks and the latest history.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useBankAccounts, useFund, useHolding, useMe, useTransactions } from '@/api/app';
import { useHoldingStats } from '@/api/app-money-extra';
import { ApiRequestError } from '@/api/client';
import { AppHeader, HeaderIconButton } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon, ICONS } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { LOCK_META } from '@/lib/locks';
import { faDigits, jDate, jMonthYear, money, pct, percent, relTime, signedMoney, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import type { AssetKind, BankAccount, Fund, Holding, Lock, Transaction } from '@/types/domain';
import {
  D, RANGES, assetMeta, balanceSeries, fundSeries, linePath, lockLink, lockProgress, lockSub, milestoneProgress, stepView, txVisual,
  type RangeKey,
} from './lib';
import './money.css';

const BAND_KINDS = ['gold', 'fixed', 'rial'];

function emptyHolding(f: Fund): Holding {
  return { kind: f.kind, fundId: f.id, name: f.name, units: 0, value: 0, free: 0, locked: 0, change: 0, changePct: 0, locks: [] };
}

/** Simulated live NAV movement (design: componentDidMount tick every 3.5s with a color flash). */
function useLiveTick(enabled: boolean, value: number, lowVol: boolean) {
  const [s, setS] = useState<{ gain: number; flash: '' | 'up' | 'down' }>({ gain: 0, flash: '' });
  useEffect(() => { setS({ gain: 0, flash: '' }); }, [value]);
  useEffect(() => {
    if (!enabled || value <= 0) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      const rel = lowVol ? 2.3e-6 + Math.random() * 1.4e-5 : 4e-5 + Math.random() * 1.4e-4;
      const step = Math.round((Math.random() < 0.8 ? 1 : -0.5) * value * rel);
      setS((p) => ({ gain: p.gain + step, flash: step > 0 ? 'up' : 'down' }));
      if (fade) clearTimeout(fade);
      fade = setTimeout(() => setS((p) => ({ ...p, flash: '' })), 1100);
    }, 3500);
    return () => { clearInterval(id); if (fade) clearTimeout(fade); };
  }, [enabled, value, lowVol]);
  return s;
}

export function AssetPage({ kind }: { kind: AssetKind }) {
  const isRial = kind === 'rial';
  const hq = useHolding(kind);
  const notOwned = !isRial && hq.error instanceof ApiRequestError && hq.error.status === 404;
  const fq = useFund(notOwned ? kind : '');
  const me = useMe();
  const banks = useBankAccounts();
  const rialTxs = useTransactions({ holding: 'rial' });
  const data = useMemo(() => {
    if (hq.data) return hq.data;
    if (notOwned && fq.data) return { holding: emptyHolding(fq.data), fund: fq.data, transactions: [] as Transaction[] };
    return undefined;
  }, [hq.data, notOwned, fq.data]);
  const holding = data?.holding;
  const fund = data?.fund;
  const stats = useHoldingStats(kind, !isRial && !!holding && holding.value > 0);
  const tick = useLiveTick(!isRial && !!fund && fund.status === 'active', holding?.value ?? 0, fund?.category === 'fixed_income');

  const [range, setRange] = useState<RangeKey>('ماه');
  const [infoOpen, setInfoOpen] = useState(false);
  const [vestOpen, setVestOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [msOpen, setMsOpen] = useState<string | null>(null);
  const [tipClosed, setTipClosed] = useState(false);
  const toast = useToast();

  const meta = assetMeta(kind);
  const band = BAND_KINDS.includes(kind) ? kind : 'other';
  const bandStyle = band === 'other' ? ({ '--band': meta.dot, '--band-line': meta.dot } as CSSProperties) : undefined;
  const name = holding?.name ?? fund?.name ?? meta.name;
  const symbol = isRial ? 'ریال' : fund?.symbol ?? meta.short;
  const orgName = me.data?.orgName ?? 'سازمان';
  const defaultBank: BankAccount | undefined = (banks.data ?? []).find((b) => b.isDefault) ?? banks.data?.[0];

  const header = (
    <AppHeader
      title={name}
      back={routes.app.home}
      badge={
        <span className="lbl" style={{ height: 22, marginRight: 4, gap: 6, background: meta.soft, color: meta.fg, fontWeight: 600, flex: 'none' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot }} />
          {symbol}
        </span>
      }
      actions={kind === 'gold' ? <HeaderIconButton icon="more" label="گزینه‌های بیشتر" onClick={() => setInfoOpen(true)} first /> : undefined}
    />
  );

  const loading = hq.isLoading || (notOwned && fq.isLoading);
  const failed = (!notOwned && hq.isError) || (notOwned && fq.isError);

  if (!holding || loading || failed) {
    return (
      <div className="pg-money" data-band={band} style={bandStyle}>
        <Scr gap={12} style={{ paddingTop: 16, paddingBottom: 96 }}>
          {failed ? (
            <ErrorState message={(notOwned ? fq.error : hq.error)?.message ?? 'خطا در دریافت اطلاعات'} onRetry={() => { void hq.refetch(); if (notOwned) void fq.refetch(); }} />
          ) : (
            <>
              <div className="band" style={{ margin: '-16px -16px 0', padding: '16px 16px 20px' }}><Skeleton h={168} r={20} /></div>
              <Skeleton h={264} />
              <Skeleton h={120} />
            </>
          )}
        </Scr>
        {header}
        <BottomNav active="assets" />
      </div>
    );
  }

  // ── hero values ──
  const gain = tick.gain;
  const total = holding.value + gain;
  const chg = holding.change + gain;
  const baseForPct = holding.value - holding.change;
  const chgPct = gain === 0 ? holding.changePct : baseForPct ? (chg / baseForPct) * 100 : 0;
  const liveNav = fund && holding.value > 0 ? fund.nav * (1 + gain / holding.value) : fund?.nav;
  const totalColor = tick.flash === 'up' ? 'var(--success-text)' : tick.flash === 'down' ? 'var(--error-text)' : 'var(--text-primary)';
  const badgeBg = chg < 0 ? 'var(--soft-error)' : tick.flash === 'up' ? 'rgb(var(--success-main-rgb) / .32)' : 'var(--soft-success)';
  const badgeFg = chg < 0 ? 'var(--error-text)' : 'var(--success-text)';

  const free = holding.free;
  const locked = holding.locked;
  const freePct = holding.value > 0 ? Math.round((free / holding.value) * 1000) / 10 : 0;
  const lockCount = holding.locks.length;
  const isFixedIncome = fund?.category === 'fixed_income';

  // ── chart ──
  const series = isRial ? balanceSeries(holding.value, rialTxs.data ?? [], range) : fund ? fundSeries(fund, range, liveNav) : [0, 0];
  const line = linePath(series);
  const chartLabel = isRial
    ? 'روند موجودی کیف پول'
    : 'NAV ' + money(liveNav ?? 0) + (isFixedIncome && fund?.effectiveYield ? ' · سود مؤثر ' + pct(fund.effectiveYield) : '');

  // ── facts (details sheet) ──
  const st = stats.data;
  const dash = '…';
  const monthKey = jMonthYear(now());
  const monthTx = (rialTxs.data ?? []).filter((t) => !t.lockEvent && jMonthYear(t.at) === monthKey);
  const inflow = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const outflow = monthTx.filter((t) => t.amount < 0 && t.category === 'rial').reduce((s, t) => s - t.amount, 0);
  const lockedLabel = isRial && holding.locks.length === 1 && (holding.locks[0].sourceId ?? '').startsWith('card') ? 'قفل‌شده (وثیقه کارت)' : 'قفل‌شده';
  const pnlFact = { k: 'سود / زیان', v: st ? signedMoney(st.pnl) : dash, c: st && st.pnl < 0 ? 'var(--error-text)' : 'var(--success-text)' };
  const avgFact = { k: 'میانگین خرید', v: st ? money(st.avgCost) : dash, c: 'var(--text-primary)' };
  const unitsFact = { k: 'واحدها', v: fmtUnits(holding.units ?? 0, 1), c: 'var(--text-primary)' };
  const navFact = { k: 'NAV هر واحد', v: money(fund?.nav ?? 0), c: 'var(--text-primary)' };
  const facts: { k: string; v: string; c: string }[] = isRial
    ? [
        { k: 'موجودی کل', v: money(holding.value), c: 'var(--text-primary)' },
        { k: 'قابل برداشت', v: money(free), c: 'var(--primary-text)' },
        { k: lockedLabel, v: money(locked), c: 'var(--text-primary)' },
        { k: 'ورودی این ماه', v: signedMoney(inflow), c: 'var(--success-text)' },
        { k: 'برداشت این ماه', v: money(outflow), c: 'var(--text-primary)' },
        { k: 'حساب بانکی پیش‌فرض', v: defaultBank?.bankName ?? '—', c: 'var(--text-primary)' },
      ]
    : isFixedIncome
      ? [
          unitsFact, navFact,
          { k: 'سود مؤثر سالانه', v: pct(fund?.effectiveYield ?? fund?.return1y ?? 0), c: 'var(--success-text)' },
          { k: 'سود روزانه', v: st ? '~' + money(st.dailyAccrual) : dash, c: 'var(--success-text)' },
          avgFact, pnlFact,
        ]
      : [
          unitsFact, navFact, avgFact, pnlFact,
          { k: 'قابل فروش (آزاد)', v: money(free), c: 'var(--primary-text)' },
          { k: 'قفل‌شده', v: money(locked), c: 'var(--text-primary)' },
        ];

  const vesting = holding.locks.find((l) => l.type === 'vesting');
  const archiveLocks = kind === 'gold';
  const recent = (data?.transactions ?? []).slice(0, 4);
  const fundId = fund?.id ?? kind;

  return (
    <div className="pg-money" data-band={band} style={bandStyle}>
      <Scr gap={12} style={{ paddingTop: 16, paddingBottom: 96 }}>
        {/* hero on the band */}
        <div className="band" style={{ margin: '-16px -16px 0', padding: '16px 16px 20px' }}>
          <div className="hero">
            <span aria-hidden="true" style={{ position: 'absolute', left: -50, top: -70, width: 180, height: 180, borderRadius: '50%', background: 'var(--band)', opacity: 0.1, pointerEvents: 'none' }} />
            <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--band)', flex: 'none' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>دارایی کل</span>
              <button className="ibtn" aria-label="جزئیات و اطلاعات" aria-haspopup="dialog" onClick={() => setInfoOpen(true)} style={{ marginRight: 'auto', marginLeft: -12, color: 'var(--text-secondary)' }}>
                <Icon name="info" size={22} />
              </button>
            </div>
            <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <span className="num" style={{ fontSize: 30, lineHeight: '36px', whiteSpace: 'nowrap' }}>
                <span style={{ color: totalColor, transition: 'color .9s ease' }}>{money(total)}</span>{' '}
                <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-secondary)' }}>تومان</span>
              </span>
              <span aria-live="polite" style={{ marginRight: 'auto', height: 40, boxSizing: 'border-box', padding: '3px 10px', borderRadius: 8, background: badgeBg, transition: 'background .9s ease', color: badgeFg, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <span dir="ltr" style={{ fontSize: 11, fontWeight: 500 }}>{(chg >= 0 ? '+' : '−') + money(Math.abs(chg))}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  <span dir="ltr">{percent(chgPct, 2, true)}</span> {isRial ? 'این ماه' : 'امروز'}
                </span>
              </span>
            </div>
            <nav aria-label="اکشن‌ها" style={{ marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8, position: 'relative' }}>
              {isRial ? (
                <>
                  <PrimaryAction href={routes.app.deposit()} label="واریز" d={ICONS.deposit} />
                  <QuickAction href={routes.app.withdraw} label="برداشت" d={ICONS.withdraw} width={56} />
                  <QuickAction href={routes.app.convert('buy', 'gold')} label="خرید صندوق" d={ICONS.trend} width={56} />
                </>
              ) : (
                <>
                  <PrimaryAction href={routes.app.convert('buy', fundId)} label={kind === 'gold' ? 'خرید طلا' : 'خرید'} d={ICONS.plus} />
                  <QuickAction href={routes.app.convert('sell', fundId)} label="فروش" d={ICONS.minus} width={48} />
                  <QuickAction href={routes.app.loan} label="وام" d={D.loanShield} width={48} />
                </>
              )}
            </nav>
          </div>

          {/* composition on the band */}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, color: '#FFFFFF' }}>
            <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>ترکیب موجودی</span>
              {lockCount > 0 && (
                <span className="num" style={{ marginRight: 'auto', height: 20, padding: '0 7px', borderRadius: 6, background: 'rgb(255 255 255 / .2)', color: '#FFFFFF', fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  {faDigits(lockCount)} قفل فعال
                </span>
              )}
            </div>
            <div role="img" aria-label={`آزاد ${money(free)} · قفل ${money(locked)}`} style={{ height: 8, borderRadius: 6, display: 'flex', overflow: 'hidden', gap: 2, background: 'rgb(255 255 255 / .16)' }}>
              {free > 0 && <span style={{ width: locked > 0 ? `${freePct}%` : '100%', borderRadius: 6, background: '#FFFFFF' }} />}
              {locked > 0 && <span style={{ flex: 1, borderRadius: 6, background: 'repeating-linear-gradient(135deg, rgb(255 255 255 / .75) 0 3px, rgb(255 255 255 / .22) 3px 6px)' }} />}
            </div>
            {locked > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'rgb(255 255 255 / .85)', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF' }} />آزاد <b className="num" style={{ fontWeight: 600, color: '#FFFFFF' }}>{money(free)}</b>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={12} />قفل <b className="num" style={{ fontWeight: 600, color: '#FFFFFF' }}>{money(locked)}</b>
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgb(255 255 255 / .85)', whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFFFFF' }} />
                {holding.value > 0 ? <>همه آزاد <b className="num" style={{ fontWeight: 600, color: '#FFFFFF' }}>{money(free)}</b></> : 'هنوز از این صندوق ندارید'}
              </div>
            )}
          </div>
        </div>

        {/* chart */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden', flex: 'none' }}>
          <div style={{ padding: '0 14px', height: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="num" style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chartLabel}</span>
            <div style={{ height: 28, display: 'flex', gap: 2, padding: 2, boxSizing: 'border-box', borderRadius: 9, background: 'rgb(var(--grey-500-rgb) / .14)', flex: 'none' }}>
              {RANGES.map((r) => {
                const a = r === range;
                return (
                  <button key={r} onClick={() => setRange(r)} aria-pressed={a} style={{ height: 24, padding: '0 9px', border: 0, borderRadius: 7, background: a ? 'var(--bg-paper)' : 'transparent', boxShadow: a ? 'var(--shadow-z1)' : 'none', color: a ? (isRial ? 'var(--text-primary)' : 'var(--primary-text)') : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 11, fontWeight: a ? 700 : 500, cursor: 'pointer' }}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ position: 'relative', height: 224 }} role="img" aria-label={(isRial ? 'نمودار موجودی ' : 'نمودار ارزش ') + range}>
            <svg viewBox="0 22 326 90" preserveAspectRatio="none" width="100%" height="224" aria-hidden="true" style={{ display: 'block', position: 'absolute', inset: 0 }}>
              <defs>
                <linearGradient id="mn-hero-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'var(--band)', stopOpacity: 0.32 }} />
                  <stop offset="1" style={{ stopColor: 'var(--band)', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d="M0 44H326M0 67H326M0 90H326" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <path d={line + ' L326 112 L0 112 Z'} fill="url(#mn-hero-fill)" />
              <path d={line} fill="none" style={{ stroke: 'var(--band-line)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>

        {/* notes */}
        {isFixedIncome && (
          <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: 'var(--soft-secondary)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <Icon d={D.percent} size={20} style={{ color: 'var(--secondary-text)' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--text-primary)' }}>سود هر روز در NAV صندوق محاسبه می‌شود؛ نوسان این صندوق بسیار کم است.</span>
          </div>
        )}
        {isRial && !tipClosed && (
          <div style={{ boxSizing: 'border-box', padding: '12px 12px 8px', borderRadius: 12, background: 'var(--soft-info)', display: 'flex', alignItems: 'flex-start', gap: 10, flex: 'none' }}>
            <Icon name="info" size={20} style={{ color: 'var(--info-text)', marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, lineHeight: 1.8, fontWeight: 500, color: 'var(--text-primary)' }}>پول ریالی ارزش خود را در برابر تورم حفظ نمی‌کند؛ بخشی را به صندوق تبدیل کنید.</span>
              <Link href={routes.app.convert('buy', 'gold')} style={{ alignSelf: 'flex-start', height: 32, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 13, fontWeight: 700, color: 'var(--info-text)', textDecoration: 'none' }}>
                تبدیل به صندوق<Icon name="forward" size={16} />
              </Link>
            </div>
            <button className="ibtn" aria-label="بستن پیام" onClick={() => setTipClosed(true)} style={{ margin: '-10px -10px 0 -10px', color: 'var(--info-text)' }}>
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        {/* locks */}
        {lockCount > 0 && archiveLocks && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
            {holding.locks.map((l) => (
              <ArchiveLock key={l.id} lock={l} open={msOpen === l.id} onToggle={() => setMsOpen((o) => (o === l.id ? null : l.id))} orgName={orgName} />
            ))}
          </div>
        )}
        {lockCount > 0 && !archiveLocks && (
          <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>قفل‌های فعال</span>
              {vesting ? (
                <button onClick={() => setVestOpen(true)} aria-haspopup="dialog" style={{ marginRight: 'auto', height: 32, border: 0, background: 'transparent', padding: '0 4px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="info" size={16} />درباره قفل زمانی
                </button>
              ) : (
                <span className="chip" style={{ marginRight: 'auto' }}>{faDigits(lockCount)} قفل فعال</span>
              )}
            </div>
            {holding.locks.map((l) => (
              <CardLock key={l.id} lock={l} orgName={orgName} accrues={isFixedIncome} />
            ))}
            {isRial && <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>برداشت و خرید صندوق فقط از بخش آزاد انجام می‌شود.</span>}
          </div>
        )}

        {!isRial && (
          <div style={{ minHeight: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', flex: 'none' }}>
            <Icon name="lock" size={12} style={{ color: 'var(--text-secondary)' }} />
            <span>فروش به ریال فقط از بخش آزاد · تا <b className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(free)}</b> تومان</span>
          </div>
        )}

        {/* linked bank account (rial) */}
        {isRial && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>حساب بانکی متصل</span>
            </div>
            {defaultBank ? (
              <button className="card" onClick={() => setAcctOpen(true)} aria-label="جزئیات حساب بانکی متصل" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--soft-default)', color: 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="bank" size={22} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{defaultBank.bankName}</span>
                    {defaultBank.verified
                      ? <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-success)', color: 'var(--success-text)' }}>تأییدشده</span>
                      : <span className="lbl" style={{ height: 20, fontSize: 11, background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>در انتظار تأیید</span>}
                  </span>
                  <span dir="ltr" className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{'IR•• •••• ' + faDigits(defaultBank.iban.slice(-4))}</span>
                </span>
                <Icon name="forward" size={18} style={{ color: 'var(--text-disabled)' }} />
              </button>
            ) : (
              <Link href={routes.app.profile} className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--primary-text)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="plus" size={20} />افزودن حساب بانکی
              </Link>
            )}
          </div>
        )}

        {/* history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{isRial ? 'تاریخچه کیف پول' : 'تاریخچه'}</span>
            <Link href={routes.app.history()} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2, height: 32 }}>
              همه<Icon name="forward" size={16} />
            </Link>
          </div>
          <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
            {recent.length === 0 && (
              <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>تراکنشی ثبت نشده است</div>
            )}
            {recent.map((t, i) => {
              const v = txVisual(t);
              return (
                <Link key={t.id} href={routes.app.transaction(t.id)} style={{ height: 56, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px dashed ${i === recent.length - 1 ? 'transparent' : 'var(--divider)'}`, color: 'var(--text-primary)', textDecoration: 'none' }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: v.bg, color: v.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={v.d} size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{relTime(t.at, now())}{v.status ? ' · ' + v.status.label : ''}</span>
                  </span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 400, color: v.amountColor, whiteSpace: 'nowrap' }}>{v.amount}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </Scr>

      {header}
      <BottomNav active="assets" />

      {/* details sheet (hero «i») */}
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} hideHeader padding="0 16px 28px" label={'جزئیات ' + name}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--band)' }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>جزئیات {name}</span>
          <button className="ibtn" aria-label="بستن" onClick={() => setInfoOpen(false)} style={{ marginRight: 'auto', marginLeft: -10, color: 'var(--text-secondary)' }}><Icon name="close" size={20} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {facts.map((f) => (
            <div key={f.k} style={{ boxSizing: 'border-box', minHeight: 56, padding: '8px 12px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, lineHeight: 1.2, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.k}</span>
              <span className="num" style={{ fontSize: 16, color: f.c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.v}</span>
            </div>
          ))}
        </div>
      </Sheet>

      {/* vesting lock info */}
      {vesting && (
        <Sheet open={vestOpen} onClose={() => setVestOpen(false)} hideHeader padding="0 16px 28px" label="قفل زمانی سازمان">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d="M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3" size={20} /></span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>قفل زمانی سازمان</span>
            <button className="ibtn" aria-label="بستن" onClick={() => setVestOpen(false)} style={{ marginRight: 'auto', marginLeft: -10, color: 'var(--text-secondary)' }}><Icon name="close" size={20} /></button>
          </div>
          <span style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--text-primary)' }}>
            {orgName} هنگام ارسال بسته «{vesting.title}» این بخش را تا تاریخ مشخصی قفل کرده است. این واحدها تا آن روز قابل فروش یا برداشت نیستند، اما {isFixedIncome ? 'سود روزانه' : 'سود'} همچنان به آن‌ها تعلق می‌گیرد و در تاریخ آزادسازی خودکار آزاد می‌شوند.
          </span>
          <KeyValueCard
            rows={[
              { k: 'نوع قفل', v: LOCK_META.vesting.label },
              { k: 'مبلغ قفل‌شده', v: money(vesting.amount) + ' تومان' },
              { k: 'منبع', v: 'بسته «' + vesting.title + '»' },
              { k: 'آزاد در', v: vesting.releaseAt ? jDate(vesting.releaseAt) : '—' },
            ]}
            minHeight={46}
          />
          <button className="btn" onClick={() => setVestOpen(false)} style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', flex: 'none' }}>متوجه شدم</button>
        </Sheet>
      )}

      {/* bank account sheet (rial) */}
      {isRial && defaultBank && (
        <Sheet open={acctOpen} onClose={() => setAcctOpen(false)} hideHeader padding="0 16px 28px" label="حساب بانکی متصل">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>حساب بانکی متصل</span>
            <button className="ibtn" aria-label="بستن" onClick={() => setAcctOpen(false)} style={{ marginRight: 'auto', marginLeft: -10, color: 'var(--text-secondary)' }}><Icon name="close" size={20} /></button>
          </div>
          <KeyValueCard
            minHeight={48}
            rows={[
              { k: 'صاحب حساب', v: defaultBank.ownerName },
              { k: 'بانک', v: defaultBank.bankName },
              { k: 'شماره شبا', v: 'IR•• •••• •••• •••• •••• ' + faDigits(defaultBank.iban.slice(-4)), ltr: true },
              { k: 'وضعیت', v: defaultBank.verified ? 'تأییدشده · به نام شما' : 'در انتظار تأیید' },
            ]}
          />
          <span style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)' }}>برداشت‌ها فقط به حساب‌های به نام خودتان واریز می‌شود.</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 'none' }}>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard.writeText(defaultBank.iban).then(
                  () => toast('شماره شبا کپی شد'),
                  () => toast('کپی انجام نشد', 'error'),
                );
                setAcctOpen(false);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}
            >
              <Icon name="copy" size={18} />کپی شماره شبا
            </button>
            <Link href={routes.app.profile} className="btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: '1px solid var(--outline-border)', color: 'var(--text-primary)', textDecoration: 'none' }}>مدیریت حساب‌ها</Link>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ───────────── pieces ─────────────

function PrimaryAction({ href, label, d }: { href: string; label: string; d: string }) {
  return (
    <Link href={href} aria-label={label} style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 14, background: 'var(--primary-main)', color: '#FFFFFF', textDecoration: 'none', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: 'var(--shadow-primary)' }}>
      <Icon d={d} size={20} strokeWidth={1.8} />{label}
    </Link>
  );
}

function QuickAction({ href, label, d, width }: { href: string; label: string; d: string; width: number }) {
  return (
    <Link href={href} aria-label={label} className="qa" style={{ width, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}>
      <span style={{ width: 48, height: 48, boxSizing: 'border-box', border: '1px solid var(--glass-edge)', borderRadius: 14, background: 'var(--bg-paper)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-z1)' }}>
        <Icon d={d} size={20} strokeWidth={1.8} />
      </span>
      <span style={{ fontSize: 11, lineHeight: '13px', whiteSpace: 'nowrap' }}>{label}</span>
    </Link>
  );
}

export function KeyValueCard({ rows, minHeight = 46 }: { rows: { k: string; v: string; ltr?: boolean; c?: string }[]; minHeight?: number }) {
  return (
    <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
      {rows.map((r, i) => (
        <div key={r.k} style={{ minHeight, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px dashed ${i === rows.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.k}</span>
          <span dir={r.ltr ? 'ltr' : 'rtl'} className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 500, color: r.c ?? 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function barColors(l: Lock) {
  const c = l.type === 'milestone' ? 'warning' : l.type === 'collateral' ? 'info' : 'secondary';
  return { solid: `var(--${c}-main)`, hatch: `repeating-linear-gradient(135deg, var(--${c}-main) 0 2px, rgb(var(--${c}-main-rgb) / .2) 2px 5px)` };
}

function MilestoneSteps({ lock }: { lock: Lock }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {(lock.steps ?? []).map((s, i) => {
        const v = stepView(s);
        return (
          <div key={s.id} style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, borderTop: '1px solid var(--divider)' }}>
            <span className="num" style={{ width: 20, height: 20, borderRadius: '50%', background: v.nBg, color: v.nFg, fontSize: 11, fontWeight: 600, display: 'grid', placeItems: 'center', flex: 'none' }}>{faDigits(i + 1)}</span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: v.tc }}>{s.title}</span>
            <span className="num" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{pct(s.sharePct)}</span>
            <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, fontWeight: 600, background: v.sBg, color: v.sFg }}>{v.status}</span>
          </div>
        );
      })}
    </div>
  );
}

function MilestoneNote({ orgName }: { orgName: string }) {
  return (
    <div style={{ boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, background: 'var(--soft-primary)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <Icon name="info" size={16} style={{ color: 'var(--primary-text)', marginTop: 3 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--text-primary)' }}>
        آزادسازی هر مرحله را {orgName} پس از تحویل تأیید می‌کند؛ نیازی به اقدامی از طرف شما نیست. واحدهای قفل‌شده همچنان سود می‌گیرند.
      </span>
    </div>
  );
}

/** Gold-style lock card (same structure as the inbox archive). Milestone cards expand to show steps. */
function ArchiveLock({ lock, open, onToggle, orgName }: { lock: Lock; open: boolean; onToggle: () => void; orgName: string }) {
  const m = LOCK_META[lock.type];
  const isMs = lock.type === 'milestone';
  const p = lockProgress(lock);
  const sub = lockSub(lock);
  const bar = barColors(lock);
  const link = lockLink(lock);
  const ms = isMs ? milestoneProgress(lock) : null;
  const rowStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 14, color: 'var(--text-primary)', textDecoration: 'none', border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' };
  const inner = (
    <>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: m.bg, color: m.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={m.d} size={20} /></span>
      <span className="col" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.3 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lock.title}</span>
        <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
        <span role="img" aria-label={sub} style={{ display: 'block', width: 120, height: 6, borderRadius: 3, overflow: 'hidden', background: bar.hatch }}>
          <span style={{ display: 'block', width: `${p}%`, height: '100%', borderRadius: 3, background: bar.solid }} />
        </span>
      </span>
      {ms ? (
        <span className="col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flex: 'none', lineHeight: 1.35 }}>
          <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'line-through', whiteSpace: 'nowrap' }}>{money(ms.total)}</span>
          <span className="num" style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(ms.released)}</span>
          <span className="num" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-text)', whiteSpace: 'nowrap' }}>{pct(ms.releasedPct)} آزاد شده</span>
        </span>
      ) : (
        <span className="col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, flex: 'none' }}>
          <span className="num" style={{ fontSize: 15, fontWeight: 400, whiteSpace: 'nowrap' }}>{money(lock.amount)}</span>
          <span className="lktype" style={{ height: 20, padding: '0 6px', background: m.bg, color: m.fg }}><Icon name="lock" size={12} />{m.short}</span>
        </span>
      )}
    </>
  );
  return (
    <div className="card" style={{ padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
      {isMs ? (
        <button onClick={onToggle} aria-expanded={open} style={rowStyle}>{inner}</button>
      ) : link ? (
        <Link href={link.href} aria-label={`${lock.title} — ${link.text}`} style={rowStyle}>{inner}</Link>
      ) : (
        <div style={{ ...rowStyle, cursor: 'default' }}>{inner}</div>
      )}
      {isMs && open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0 12px', borderTop: '1px dashed var(--divider)' }}>
          <MilestoneSteps lock={lock} />
          <MilestoneNote orgName={orgName} />
        </div>
      )}
    </div>
  );
}

/** Row inside the «قفل‌های فعال» card (fixed / rial / other funds). */
function CardLock({ lock, orgName, accrues }: { lock: Lock; orgName: string; accrues: boolean }) {
  const m = LOCK_META[lock.type];
  const link = lockLink(lock);
  const isMs = lock.type === 'milestone';
  const ms = isMs ? milestoneProgress(lock) : null;
  const cond = lock.condition + (lock.type === 'vesting' && accrues ? ' · سود روزانه همچنان تعلق می‌گیرد' : '');
  const progText = ms ? `${faDigits(ms.releasedCount)} از ${faDigits(ms.count)} مرحله · ${pct(ms.releasedPct)} آزاد شده (${money(ms.released)})` : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, paddingTop: 10, borderTop: '1px dashed var(--divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="lktype" style={{ background: m.bg, color: m.fg }} title={m.label}><Icon d={m.d} size={12} />{m.short}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{lock.title}</span>
        <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(lock.amount)}</span>
      </div>
      <span style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{cond}</span>
      {ms && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div role="img" aria-label={progText} style={{ height: 8, display: 'flex', gap: 3 }}>
            {(lock.steps ?? []).map((s) => {
              const v = stepView(s);
              return <span key={s.id} style={{ flex: s.sharePct, height: 8, boxSizing: 'border-box', borderRadius: 3, background: v.seg, boxShadow: v.ring }} />;
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>{progText}</span>
            <span className="num" style={{ marginRight: 'auto', whiteSpace: 'nowrap' }}>کل {money(ms.total)}</span>
          </div>
          <MilestoneSteps lock={lock} />
          <MilestoneNote orgName={orgName} />
        </div>
      )}
      {link && (
        <Link href={link.href} style={{ alignSelf: 'flex-start', height: 28, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600 }}>
          {link.text}<Icon name="forward" size={14} />
        </Link>
      )}
    </div>
  );
}
