'use client';
/** /app/convert?dir=buy|sell&fund=<id> — design: app-convert (rial ⇄ fund). */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useFunds, useMe, usePortfolio, useTrade } from '@/api/app';
import { ApiRequestError } from '@/api/client';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon, ICONS } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { money, units as fmtUnits } from '@/lib/format';
import { routes } from '@/lib/routes';
import type { Fund, Holding } from '@/types/domain';
import { D, amountText, assetIcon, assetMeta, feeLabel, floorK, fundMono, parseAmount } from '@/components/app/money/lib';
import '@/components/app/money/money.css';

type Dir = 'buy' | 'sell';

export default function ConvertPage() {
  return (
    <Suspense fallback={null}>
      <ConvertScreen />
    </Suspense>
  );
}

function ConvertScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const funds = useFunds();
  const pf = usePortfolio();
  const me = useMe();
  const trade = useTrade();

  const [dir, setDir] = useState<Dir>(sp.get('dir') === 'sell' ? 'sell' : 'buy');
  const [fundId, setFundId] = useState<string>(sp.get('fund') || 'gold');
  const [amount, setAmount] = useState<number | null>(null);
  const [max, setMax] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const active = useMemo(() => (funds.data ?? []).filter((f) => f.status === 'active'), [funds.data]);
  const F: Fund | undefined = active.find((f) => f.id === fundId) ?? active.find((f) => f.id === 'gold') ?? active[0];

  // keep the URL shareable
  useEffect(() => {
    if (!F) return;
    if (sp.get('dir') !== dir || sp.get('fund') !== F.id) router.replace(routes.app.convert(dir, F.id), { scroll: false });
  }, [dir, F, sp, router]);

  const hmap = useMemo(() => {
    const m: Record<string, Holding> = {};
    for (const h of pf.data?.holdings ?? []) m[h.kind] = h;
    return m;
  }, [pf.data]);

  const loading = funds.isLoading || pf.isLoading;
  const failed = funds.isError || pf.isError;
  const sell = dir === 'sell';
  const title = F ? (sell ? 'فروش ' : 'خرید ') + F.name : 'خرید و فروش';
  const backHref = F && hmap[F.kind]?.value ? routes.app.asset(F.kind) : routes.app.funds;

  if (loading || failed || !F) {
    return (
      <div className="pg-money">
        <Scr gap={12}>
          {failed ? (
            <ErrorState message={(funds.error ?? pf.error)?.message} onRetry={() => { void funds.refetch(); void pf.refetch(); }} />
          ) : !loading && !F ? (
            <ErrorState message="صندوق فعالی برای معامله وجود ندارد." />
          ) : (
            <>
              <Skeleton h={152} />
              <Skeleton h={110} />
              <Skeleton h={90} />
              <Skeleton h={90} />
            </>
          )}
        </Scr>
        <AppHeader title={title} back={routes.app.home} />
        <BottomNav active="assets" />
      </div>
    );
  }

  const rial = hmap.rial ?? { value: 0, free: 0, locked: 0 };
  const fh = hmap[F.kind];
  const nav = F.nav;
  const uTotal = fh?.units ?? (fh ? fh.value / nav : 0);
  const uFree = fh ? fh.free / nav : 0;
  const fundLocked = fh?.locked ?? 0;
  const maxAmount = sell ? floorK(fh?.free ?? 0) : Math.max(0, Math.floor(rial.free));
  const amt = max ? maxAmount : amount ?? Math.min(10_000_000, maxAmount);
  const fee = Math.round((amt * F.feePct) / 100);
  const u = (sell ? amt : amt - fee) / nav;
  const meta = assetMeta(F.kind);

  const invalid = amt <= 0 ? 'مبلغ را وارد کنید.' : amt > maxAmount ? (sell ? 'مبلغ از بخش آزاد این صندوق بیشتر است.' : 'مبلغ از موجودی آزاد کیف پول ریالی بیشتر است.') : null;
  const showInvalid = invalid && (amount !== null || max);

  const rialSide = { name: 'کیف پول ریالی', d: ICONS.banknote, bg: 'var(--soft-default)', fg: 'var(--default-text)', isFund: false };
  const fundSide = { name: F.name, d: assetIcon(F.kind), bg: meta.soft, fg: meta.fg, isFund: true };
  const from = sell
    ? { ...fundSide, bal: fmtUnits(uFree) + ' واحد', cap: 'آزاد از ' + fmtUnits(uTotal) + ' واحد' }
    : { ...rialSide, bal: money(rial.free), cap: 'تومان · آزاد' };
  const to = sell
    ? { ...rialSide, bal: money(rial.value), cap: 'تومان' }
    : { ...fundSide, bal: fmtUnits(uTotal) + ' واحد', cap: 'NAV ' + money(nav) };

  const preview = [
    { k: sell ? 'واحد فروش' : 'واحد خرید', v: '≈ ' + fmtUnits(Math.max(0, u)), u: 'واحد' },
    { k: 'NAV امروز', v: money(nav), u: 'تومان' },
    { k: 'کارمزد ' + feeLabel(F.feePct), v: money(fee), u: 'تومان' },
  ];
  const after = sell
    ? [
        { k: F.name + ' · آزاد', dot: meta.dot, before: fmtUnits(uFree) + ' واحد', value: fmtUnits(Math.max(uFree - u, 0)) + ' واحد' },
        { k: 'کیف پول ریالی · آزاد', dot: 'var(--grey-600)', before: money(rial.free), value: money(rial.free + Math.max(0, amt - fee)) },
      ]
    : [
        { k: 'کیف پول ریالی · آزاد', dot: 'var(--grey-600)', before: money(rial.free), value: money(Math.max(0, rial.free - amt)) },
        { k: F.name + ' · آزاد', dot: meta.dot, before: fmtUnits(uFree) + ' واحد', value: fmtUnits(uFree + Math.max(0, u)) + ' واحد' },
      ];
  const lockedAmt = sell ? fundLocked : rial.locked;
  const lockHref = sell ? routes.app.asset(F.kind) : routes.app.asset('rial');
  const note = sell
    ? `مبلغ فروش پس از تسویه (${F.settlement === 'T+0' ? 'امروز' : F.settlement === 'T+2' ? 'دو روز کاری بعد' : 'فردا'}) به کیف پول ریالی واریز می‌شود.`
    : 'واحدهای خریداری‌شده از ساعت ۱۴ فردا قابل فروش به ریال‌اند.';
  const kycNeeded = (me.data && me.data.kycLevel < 3) || !!kycError;

  const pickList = active
    .filter((x) => !sell || (hmap[x.kind]?.value ?? 0) > 0)
    .map((x) => {
      const h = hmap[x.kind];
      const owned = (h?.value ?? 0) > 0;
      const on = x.id === F.id;
      const none = sell && (h?.free ?? 0) <= 0;
      const m = assetMeta(x.kind);
      return { x, owned, on, none, m, h };
    });

  const swap = () => { setDir(sell ? 'buy' : 'sell'); setMax(false); setAmount(null); };

  const submit = () => {
    if (invalid || trade.isPending) return;
    trade.mutate(
      { direction: dir, fundId: F.id, amount: amt },
      {
        onSuccess: (tx) => router.push(routes.app.receipt(tx.id)),
        onError: (e: unknown) => {
          if (e instanceof ApiRequestError && e.code === 'kyc_required') {
            setKycError(e.message);
            return;
          }
          toast(e instanceof Error ? e.message : 'خطا در ثبت سفارش', 'error');
        },
      },
    );
  };

  const changeBtn = (
    <button onClick={() => setPickOpen(true)} aria-haspopup="dialog" aria-label="انتخاب صندوق دیگر" style={{ height: 32, padding: '0 10px', border: 0, borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', flex: 'none' }}>
      <Icon d={D.chevron} size={14} />تغییر
    </button>
  );

  const side = (s: typeof from, label: string) => (
    <div className="card" style={{ boxSizing: 'border-box', height: 72, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, color: s.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={s.d} size={22} /></span>
      <span className="col" style={{ flex: 1, gap: 3, lineHeight: 1.3 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
      </span>
      <span className="col" style={{ alignItems: 'flex-start', gap: 3, lineHeight: 1.2, flex: 'none' }}>
        <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{s.bal}</span>
        <span className="num" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.cap}</span>
      </span>
      {s.isFund && changeBtn}
    </div>
  );

  return (
    <div className="pg-money">
      <Scr gap={12}>
        {/* from / to */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          {side(from, 'از')}
          <button className="glass" onClick={swap} aria-label="جابه‌جایی مبدأ و مقصد" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1, width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--primary-text)', cursor: 'pointer', padding: 0 }}>
            <Icon name="swap" size={22} />
          </button>
          {side(to, 'به')}
        </div>

        {/* amount */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <div className="row" style={{ height: 20, gap: 8 }}>
            <label htmlFor="cv-amount" style={{ fontSize: 13, fontWeight: 700 }}>{sell ? 'مبلغ فروش' : 'مبلغ خرید'}</label>
            <span className="num" style={{ marginRight: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sell ? 'قابل فروش (آزاد)' : 'قابل استفاده (آزاد)'} {money(maxAmount)} تومان</span>
          </div>
          <div style={{ height: 52, boxSizing: 'border-box', padding: '0 6px 0 14px', borderRadius: 8, border: `1px solid ${showInvalid ? 'var(--error-main)' : max ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="cv-amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amountText(amt)}
              placeholder="۰"
              aria-invalid={!!showInvalid}
              onChange={(e) => { setMax(false); setAmount(parseAmount(e.target.value)); }}
              className="num"
              style={{ flex: 1, minWidth: 0, height: 48, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 22, fontWeight: 300, outline: 'none', padding: 0 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>تومان</span>
            <button onClick={() => { if (max) { setMax(false); setAmount(null); } else setMax(true); }} aria-pressed={max} style={{ height: 36, border: `1px solid ${max ? 'transparent' : 'var(--outline-border)'}`, borderRadius: 999, background: max ? 'var(--soft-primary)' : 'transparent', color: max ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '0 12px', whiteSpace: 'nowrap' }}>حداکثر</button>
          </div>
          {showInvalid && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)' }}>{invalid}</span>}
          {lockedAmt > 0 && (
            <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', margin: '-4px 0 -6px' }}>
              <Icon name="lock" size={12} />
              <span style={{ minWidth: 0 }}>قفل‌شده: <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(lockedAmt)}</span> — قابل استفاده نیست ·</span>
              <Link href={lockHref} style={{ height: 28, display: 'inline-flex', alignItems: 'center', padding: '0 4px', margin: '0 -4px', fontWeight: 600 }}>چرا؟</Link>
            </div>
          )}
        </div>

        {/* preview */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
          <div className="row" style={{ height: 22, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>پیش‌نمایش</span>
            <span className="lbl" style={{ marginRight: 'auto', height: 22, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 600 }}>{sell ? 'واریز ' + F.settlement : 'صدور پایان روز'}</span>
          </div>
          <div style={{ height: 54, display: 'flex', alignItems: 'stretch' }}>
            {preview.map((p, i) => (
              <div key={p.k} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: 1, borderRight: `1px solid ${i === preview.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.k}</span>
                <span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{p.v} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>{p.u}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* after */}
        <div className="card" style={{ boxSizing: 'border-box', padding: '4px 14px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
          {after.map((a, i) => (
            <div key={a.k} className="row" style={{ height: 42, gap: 8, borderBottom: `1px dashed ${i === after.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.dot, flex: 'none' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{a.k}</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{a.before}</span>
              <Icon name="forward" size={14} style={{ color: 'var(--text-disabled)' }} />
              <span className="num" style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{a.value}</span>
            </div>
          ))}
        </div>

        {/* info */}
        <div role="status" style={{ minHeight: 44, boxSizing: 'border-box', padding: '8px 12px', borderRadius: 12, background: 'var(--soft-info)', color: 'var(--info-text)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Icon name="info" size={20} />
          <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>{note}</span>
        </div>

        {kycNeeded && (
          <div role="alert" style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, background: kycError ? 'var(--soft-error)' : 'var(--soft-warning)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <Icon name="shield" size={20} style={{ color: kycError ? 'var(--error-text)' : 'var(--warning-text)' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.7, color: 'var(--text-primary)' }}>{kycError ?? 'خرید و فروش صندوق نیازمند احراز هویت سطح ۳ (سجام) است.'}</span>
            <Link href={routes.app.kyc} style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: kycError ? 'var(--error-text)' : 'var(--warning-text)' }}>
              احراز هویت<Icon name="forward" size={14} />
            </Link>
          </div>
        )}

        <button className="btn mn-cta" onClick={submit} disabled={!!invalid || trade.isPending} style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', fontSize: 15, flex: 'none' }}>
          {trade.isPending ? 'در حال ثبت…' : sell ? 'تأیید فروش' : 'تأیید خرید'}
          {!trade.isPending && <Icon name="check" size={18} />}
        </button>
      </Scr>

      <AppHeader title={title} back={backHref} />
      <BottomNav active="assets" />

      <Sheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title={sell ? 'فروش به ریال از کدام صندوق؟' : 'خرید کدام صندوق با ریال؟'}
        subtitle={sell ? 'فقط بخش آزاد هر صندوق قابل فروش است' : 'از موجودی آزاد کیف پول ریالی'}
        height="auto"
        label="انتخاب صندوق"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
          {pickList.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>صندوقی برای فروش ندارید.</span>}
          {pickList.map(({ x, owned, on, none, h }) => (
            <button
              key={x.id}
              onClick={() => { if (none) return; setFundId(x.id); setMax(false); setAmount(null); setPickOpen(false); }}
              disabled={none}
              aria-pressed={on}
              style={{ width: '100%', minHeight: 60, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 14, border: `${on ? '2px' : '1px'} solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: none ? 0.55 : 1, flex: 'none' }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 12, background: assetMeta(x.kind).soft, color: assetMeta(x.kind).fg, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 12, fontWeight: 800 }}>{fundMono(x)}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.35 }}>
                <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
                <span className="num" style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{owned && h ? `آزاد ${money(h.free)} از ${money(h.value)} تومان` : 'NAV ' + money(x.nav)}</span>
              </span>
              <span className="num" style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', color: none ? 'var(--text-disabled)' : 'var(--primary-text)' }}>{none ? 'همه قفل' : on ? 'انتخاب شده' : ''}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
