'use client';
/** /op/funds/[id] — design: op-fund.dc.html (KPIs, NAV chart, today's orders, fund settings, AUM free/locked breakdown). */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpFund } from '@/api/op';
import { useRefreshNav, useUpdateFundX, type OpFund } from '@/api/op-system-extra';
import type { Fund } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { bn, dayTime, dec, downloadCsv, errMsg, raw, smoothPath, spct } from '@/components/op/system/fmt';
import { CardHead, Chip, Confirm, DlgHead, FormError, IC, Kpi, Lbl, Modal, NumField, Sw, TONES, useWidth } from '@/components/op/system/ui';
import { CATEGORIES, CATEGORY_LABEL, FUND_STATUS, FUND_UI, LOCK_ORDER, fundTitle, lockedOf } from '@/components/op/system/funds';

export default function OpFundPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useOpFund(id);
  const refresh = useRefreshNav();
  const update = useUpdateFundX();
  const [edit, setEdit] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
  const f = q.data as OpFund | undefined;

  if (q.isLoading) {
    return (
      <>
        <Skeleton h={48} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} />)}</div>
        <Skeleton h={200} />
      </>
    );
  }
  if (q.isError || !f) {
    return (
      <>
        <PageHeading title="صندوق" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'صندوق‌ها', href: routes.op.funds }]} />
        <ErrorState message={errMsg(q.error, 'صندوق پیدا نشد.')} onRetry={() => q.refetch()} />
      </>
    );
  }

  const ui = FUND_UI[f.kind];
  const st = FUND_STATUS[f.status];
  const [tbg, tfg] = TONES[ui.tone];
  const paused = f.status === 'paused';
  const draft = f.status === 'coming_soon';

  const setStatus = (status: Fund['status']) => update.mutate({ id: f.id, status }, {
    onSuccess: () => { setConfirmPause(false); toast(status === 'paused' ? `${f.name} به‌صورت موقت غیرفعال شد؛ خرید و فروش متوقف است` : `${f.name} ${draft ? 'راه‌اندازی' : 'دوباره فعال'} شد`); },
    onError: (e) => { setConfirmPause(false); toast(errMsg(e), 'error'); },
  });

  return (
    <>
      <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={routes.op.funds} className="ibtn" aria-label="بازگشت به صندوق‌ها" style={{ background: 'var(--glass-bg)', boxShadow: '0 0 0 1px var(--glass-edge)' }}><Icon d={IC.back} size={20} /></Link>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: tbg, color: tfg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ui.d} size={22} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PageHeading title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{fundTitle(f)}<Lbl tone={ui.tone}>ETF {f.shortName}</Lbl><Lbl tone={st.tone}>{st.label}</Lbl></span>}
            crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'صندوق‌ها', href: routes.op.funds }, { label: fundTitle(f) }]}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>آخرین NAV: <span className="num" style={{ fontWeight: 500 }}>{dayTime(f.meta?.lastNavAt)}</span></span>
            <button type="button" className="btno" disabled={refresh.isPending || draft} style={{ opacity: refresh.isPending || draft ? 0.6 : 1 }}
              onClick={() => refresh.mutate({ fundId: f.id }, { onSuccess: () => toast(`NAV از هسته معاملات به‌روزرسانی شد — ${money(f.nav)} تومان`), onError: (e) => toast(errMsg(e), 'error') })}>
              <Icon d={IC.refresh} size={18} />به‌روزرسانی NAV
            </button>
            <button type="button" className="btnp" onClick={() => setEdit(true)}><Icon d={IC.pen} size={18} />ویرایش</button>
          </PageHeading>
        </div>
      </div>

      <KpiRow f={f} />

      <div style={{ flex: 'none', display: 'flex', gap: 24, minHeight: 200 }}>
        <NavChartCard f={f} color={ui.col} />
        <OrdersCard f={f} />
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: 24, alignItems: 'stretch' }}>
        <SettingsCard f={f} onTogglePause={() => (paused || draft ? setStatus('active') : setConfirmPause(true))} busyStatus={update.isPending && update.variables?.status !== undefined} />
        <BreakdownCard f={f} />
      </div>

      <EditFundModal f={f} open={edit} onClose={() => setEdit(false)} />
      <Confirm open={confirmPause} onClose={() => setConfirmPause(false)} danger busy={update.isPending} onConfirm={() => setStatus('paused')}
        title={`غیرفعال‌سازی موقت ${f.name}`} confirmLabel="غیرفعال‌سازی موقت"
        body={<>خرید و فروش واحدهای این صندوق برای همهٔ کاربران متوقف می‌شود. واحدهای فعلی، سود و NAV و قفل‌ها بدون تغییر باقی می‌مانند و هر زمان می‌توانید صندوق را دوباره فعال کنید.</>} />
    </>
  );
}

function KpiRow({ f }: { f: OpFund }) {
  const h = f.history ?? [];
  const aum30 = h.length > 30 ? (h[h.length - 1].v / h[h.length - 31].v - 1) * 100 : 0;
  const locked = lockedOf(f);
  const lockedPct = f.aum ? (locked / f.aum) * 100 : 0;
  const typesN = LOCK_ORDER.filter((t) => (f.meta?.lockByType[t] ?? 0) > 0).length;
  const d = f.navChangePct1d;
  const delta = f.meta?.investorsDeltaMonth ?? 0;
  return (
    <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
      <Kpi title="NAV هر واحد" value={f.nav ? money(f.nav) : '—'} unit="تومان" delta={spct(d, 2)} tone={d > 0 ? 'success' : d < 0 ? 'error' : 'default'} note="امروز" icon={{ d: FUND_UI[f.kind].d, tone: FUND_UI[f.kind].tone }} />
      <Kpi title="AUM" value={bn(f.aum)} unit="میلیارد تومان" delta={spct(aum30)} tone={aum30 >= 0 ? 'success' : 'error'} note="۳۰ روز" icon={{ d: IC.funds, tone: 'primary' }} />
      <Kpi title="دارندگان واحد" value={money(f.investors)} unit="نفر" delta={(delta > 0 ? '+' : delta < 0 ? '−' : '') + money(Math.abs(delta))} tone={delta >= 0 ? 'success' : 'error'} note="این ماه" icon={{ d: IC.users, tone: 'info' }} />
      <Kpi title="واحدهای قفل‌شده" value={faDigits(Math.round(lockedPct)) + '٪'} unit="از کل واحدها" delta={bn(locked) + ' میلیارد'} tone="default" note={`${faDigits(typesN)} نوع قفل`} icon={{ d: IC.lock, tone: 'default' }} />
    </div>
  );
}

const RANGES: [number, string][] = [[7, '۷ روز'], [30, '۳۰ روز'], [90, '۹۰ روز']];
function NavChartCard({ f, color }: { f: OpFund; color: string }) {
  const [range, setRange] = useState(90);
  const [ref, W] = useWidth<HTMLDivElement>(528);
  const series = (f.history ?? []).slice(-range);
  const big = f.nav >= 1e6;
  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const vals = series.map((s) => s.v);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || hi * 0.01) * 0.15;
    lo -= pad; hi += pad;
    const x0 = 44, w = Math.max(120, W - x0);
    const pts = vals.map((v, i) => [Math.round((x0 + (i * w) / (vals.length - 1)) * 10) / 10, Math.round((92 - ((v - lo) / (hi - lo)) * 84) * 10) / 10] as [number, number]);
    const line = smoothPath(pts);
    const last = pts[pts.length - 1];
    const ygrid = [0, 1, 2, 3].map((k) => {
      const y = 8 + k * 28;
      const v = hi - ((hi - lo) * (y - 8)) / 84;
      return { y, label: money(big ? v / 1000 : v) };
    });
    const xl = [0, 1, 2, 3, 4, 5].map((k) => series[Math.round((k * (series.length - 1)) / 5)]);
    return { line, area: line + ` L${last[0]} 92 L${pts[0][0]} 92 Z`, last, ygrid, xl, x0, width: x0 + w };
  }, [series, W, big]);
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>روند NAV — {faDigits(range)} روز</h6>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{big ? 'هزار تومان' : 'تومان'} به ازای هر واحد</span>
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {RANGES.map(([r, l]) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} style={{ height: 24, padding: '0 10px', borderRadius: 6, border: 0, background: range === r ? 'var(--soft-primary)' : 'transparent', color: range === r ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>
      <div ref={ref} dir="ltr" style={{ flex: 1, minHeight: 118, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {chart ? (
          <>
            <svg viewBox={`0 0 ${chart.width} 100`} width={chart.width} height="100" role="img" aria-label={`روند NAV ${faDigits(range)} روز`} style={{ display: 'block', overflow: 'visible', flex: 'none' }}>
              <defs><linearGradient id="g-nav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: `var(${color})`, stopOpacity: 0.26 }} /><stop offset="1" style={{ stopColor: `var(${color})`, stopOpacity: 0 }} /></linearGradient></defs>
              {chart.ygrid.map((g) => (
                <g key={g.y}>
                  <line x1={chart.x0} x2={chart.width} y1={g.y} y2={g.y} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" strokeDasharray="3 4" />
                  <text x={chart.x0 - 6} y={g.y + 3} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>{g.label}</text>
                </g>
              ))}
              <path d={chart.area} fill="url(#g-nav)" />
              <path d={chart.line} fill="none" style={{ stroke: `var(${color})` }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={chart.last[0]} cy={chart.last[1]} r="4" style={{ fill: `var(${color})`, stroke: 'var(--bg-paper)' }} strokeWidth="2" />
            </svg>
            <div style={{ height: 14, paddingLeft: chart.x0, display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: '14px', color: 'var(--text-secondary)' }}>
              {chart.xl.map((x, i) => <span key={i}>{jDayMonth(x.t)}</span>)}
            </div>
          </>
        ) : <div dir="rtl" style={{ flex: 1, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>تاریخچه NAV برای این صندوق هنوز ثبت نشده است</div>}
      </div>
    </div>
  );
}

function OrdersCard({ f }: { f: OpFund }) {
  const o = f.meta?.ordersToday ?? { buyCount: 0, buyValue: 0, sellCount: 0, sellValue: 0 };
  const net = o.buyValue - o.sellValue;
  const tot = o.buyValue + o.sellValue;
  const buyPct = tot ? Math.round((o.buyValue / tot) * 100) : 50;
  const when = f.settlement === 'T+0' ? 'امروز' : f.settlement === 'T+1' ? 'فردا' : 'پس‌فردا';
  return (
    <div className="card" style={{ width: 340, flex: 'none', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>سفارش‌های امروز</h6>
        <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>تسویه {when} <span className="num" dir="ltr">{faDigits('10:00')}</span> (<span dir="ltr">{f.settlement}</span>)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>خالص {net >= 0 ? 'ورودی' : 'خروجی'}</span>
        <span className="num" style={{ fontSize: 24, color: net >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{net >= 0 ? '+' : '−'}{bn(Math.abs(net))}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>میلیارد تومان</span>
      </div>
      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', background: 'var(--progress-track)' }}>
        {tot > 0 && <><span style={{ width: `${buyPct}%`, background: 'var(--chart-1)' }} /><span style={{ width: `${100 - buyPct}%`, background: 'var(--error-light)' }} /></>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {[['خرید', o.buyCount, o.buyValue, '--chart-1'], ['فروش', o.sellCount, o.sellValue, '--error-light']].map(([name, count, value, col]) => (
          <div key={String(name)} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, borderBottom: '1px dashed var(--divider)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${col})`, flex: 'none' }} />
            <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{money(Number(count))} سفارش</span>
            <span className="num" style={{ fontWeight: 500, width: 96, textAlign: 'left' }}>{bn(Number(value))} میلیارد</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SettingsDraft { feePct: number; sellFeePct: number; minBuy: number; settlement: Fund['settlement']; collateralEnabled: boolean; maxLtvPct: number }
function SettingsCard({ f, onTogglePause, busyStatus }: { f: OpFund; onTogglePause: () => void; busyStatus: boolean }) {
  const toast = useToast();
  const update = useUpdateFundX();
  const server: SettingsDraft = useMemo(() => ({
    feePct: f.feePct, sellFeePct: f.meta?.sellFeePct ?? f.feePct, minBuy: f.meta?.minBuy ?? 0, settlement: f.settlement,
    collateralEnabled: f.meta?.collateralEnabled ?? false, maxLtvPct: f.meta?.maxLtvPct ?? 0,
  }), [f]);
  const [d, setD] = useState<SettingsDraft>(server);
  useEffect(() => setD(server), [server]);
  const dirty = JSON.stringify(d) !== JSON.stringify(server);
  const bad = { fee: !(d.feePct >= 0 && d.feePct <= 5), sell: !(d.sellFeePct >= 0 && d.sellFeePct <= 5), min: !(d.minBuy >= 0), ltv: !(d.maxLtvPct >= 0 && d.maxLtvPct <= 100) };
  const paused = f.status === 'paused';
  const draft = f.status === 'coming_soon';

  const save = () => {
    if (bad.fee || bad.sell) return toast('کارمزد باید بین ۰ تا ۵ درصد باشد', 'error');
    if (bad.min) return toast('حداقل خرید معتبر نیست', 'error');
    if (bad.ltv) return toast('حداکثر نسبت وثیقه باید بین ۰ تا ۱۰۰ درصد باشد', 'error');
    if (!dirty) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    update.mutate({ id: f.id, feePct: d.feePct, settlement: d.settlement, meta: { sellFeePct: d.sellFeePct, minBuy: d.minBuy, collateralEnabled: d.collateralEnabled, maxLtvPct: d.maxLtvPct } }, {
      onSuccess: () => toast(`تنظیمات ${f.name} ذخیره شد`),
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };
  const row: React.CSSProperties = { minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' };
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardHead title="تنظیمات صندوق" h={44}>
        <span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>آخرین تغییر: {f.meta?.updatedAt ? jDayMonth(f.meta.updatedAt) : '—'}{f.meta?.updatedBy ? ' · ' + f.meta.updatedBy : ''}</span>
      </CardHead>
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={row}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>کارمزد خرید / فروش</span>
          <NumField value={d.feePct} onChange={(n) => setD({ ...d, feePct: n })} decimals w={40} suffix="٪" label="کارمزد خرید" invalid={bad.fee} />
          <NumField value={d.sellFeePct} onChange={(n) => setD({ ...d, sellFeePct: n })} decimals w={40} suffix="٪" label="کارمزد فروش" invalid={bad.sell} />
        </div>
        <div style={row}>
          <label htmlFor="min-buy" style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>حداقل خرید</label>
          <NumField id="min-buy" value={d.minBuy} onChange={(n) => setD({ ...d, minBuy: n })} w={84} suffix="تومان" invalid={bad.min} />
        </div>
        <div style={row}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>تسویه</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['T+0', 'T+1', 'T+2'] as const).map((s) => <Chip key={s} dir="ltr" on={d.settlement === s} onClick={() => setD({ ...d, settlement: s })} style={{ minWidth: 44, padding: '0 8px' }}>{s}</Chip>)}
          </div>
        </div>
        <div style={row}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500 }}>قابل وثیقه</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>فقط از واحدهای آزاد؛ قفل نوع «وثیقه»</span></span>
          <label htmlFor="max-ltv" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>حداکثر نسبت وثیقه</label>
          <NumField id="max-ltv" value={d.maxLtvPct} onChange={(n) => setD({ ...d, maxLtvPct: n })} w={40} suffix="٪" invalid={bad.ltv} disabled={!d.collateralEnabled} />
          <Sw on={d.collateralEnabled} onClick={() => setD({ ...d, collateralEnabled: !d.collateralEnabled })} label="قابل وثیقه" />
        </div>
      </div>
      <div style={{ marginTop: 'auto', height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--divider)' }}>
        <button type="button" className="btnp" onClick={save} disabled={update.isPending} style={{ height: 32, opacity: update.isPending ? 0.7 : 1 }}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
        <button type="button" className="btnt" onClick={() => setD(server)} disabled={!dirty} style={{ height: 32, opacity: dirty ? 1 : 0.5 }}>انصراف</button>
        <button type="button" className="btnt" onClick={onTogglePause} disabled={busyStatus} style={{ marginRight: 'auto', height: 32, color: paused || draft ? 'var(--success-text)' : 'var(--error-text)' }}>
          <Icon d={paused || draft ? IC.check : IC.pause} size={16} />{draft ? 'راه‌اندازی صندوق' : paused ? 'فعال‌سازی مجدد' : 'غیرفعال‌سازی موقت'}
        </button>
      </div>
    </div>
  );
}

function BreakdownCard({ f }: { f: OpFund }) {
  const toast = useToast();
  const [tab, setTab] = useState<'locks' | 'navs'>('locks');
  const locked = lockedOf(f);
  const free = Math.max(0, f.aum - locked);
  const freePct = f.aum ? Math.round((free / f.aum) * 1000) / 10 : 100;
  const rows = LOCK_ORDER.filter((t) => (f.meta?.lockByType[t] ?? 0) > 0).map((t) => {
    const v = f.meta?.lockByType[t] ?? 0;
    return { t, v, units: f.nav ? v / f.nav : 0, pct: f.aum ? (v / f.aum) * 100 : 0, holders: f.meta?.holdersByType[t] ?? 0 };
  });
  const hist = f.history ?? [];
  const navs = hist.slice(-6).map((h, i, a) => ({ ...h, prev: i ? a[i - 1].v : undefined })).slice(1).reverse();
  const aumAt = (v: number) => (f.nav ? (f.aum * v) / f.nav : 0);
  const exportNav = () => {
    const last = hist.slice(-90);
    if (!last.length) return toast('تاریخچه‌ای برای خروجی وجود ندارد', 'info');
    downloadCsv(`nav-${f.id}-90d`, [['تاریخ', 'NAV (تومان)', 'تغییر (%)', 'AUM تقریبی (تومان)'], ...last.map((h, i) => [jDate(h.t), raw(h.v), i ? ((h.v / last[i - 1].v - 1) * 100).toFixed(2) : '', raw(aumAt(h.v))])]);
    toast('خروجی NAV ۹۰ روز اخیر (CSV) آماده شد');
  };
  const lockCols = 'minmax(0, 1fr) 80px 92px 56px 64px';
  const navCols = '1fr 1fr 72px 1fr';
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {([['locks', 'تفکیک AUM — آزاد / قفل'], ['navs', 'آخرین NAV ها']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} style={{ height: 44, boxSizing: 'border-box', padding: '0 2px', marginLeft: 10, border: 0, borderBottom: `2px solid ${tab === k ? 'var(--primary-main)' : 'transparent'}`, background: 'transparent', color: tab === k ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
        ))}
        {tab === 'navs'
          ? <button type="button" className="btnt" onClick={exportNav} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}><Icon d={IC.download} size={16} />خروجی</button>
          : <Lbl tone="warning" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11 }}>{faDigits(Math.round(100 - freePct))}٪ قفل</Lbl>}
      </div>
      {tab === 'locks' ? (
        <>
          <div style={{ boxSizing: 'border-box', padding: '2px 20px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
            <div className="lkbar" role="img" aria-label={`AUM آزاد ${bn(free)} میلیارد · قفل ${bn(locked)} میلیارد`} style={{ height: 8 }}><span className="f" style={{ width: `${freePct}%` }} />{locked > 0 && <span className="l" style={{ flex: 1 }} />}</div>
            <div className="lkleg"><span><span className="lkdot" />آزاد <b>{bn(free)} میلیارد</b></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={IC.lock} size={12} />قفل <b>{bn(locked)} میلیارد</b></span><span style={{ marginRight: 'auto' }}>کل دارایی <b>{bn(f.aum)} میلیارد</b></span></div>
          </div>
          <div style={{ height: 30, flex: 'none', display: 'grid', gridTemplateColumns: lockCols, columnGap: 8, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>نوع قفل</span><span>واحد</span><span>ارزش</span><span>سهم</span><span>دارندگان</span>
          </div>
          {rows.map((r) => (
            <div key={r.t} style={{ height: 34, flex: 'none', display: 'grid', gridTemplateColumns: lockCols, columnGap: 8, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
              <span><span className="lktype" style={{ background: LOCK_META[r.t].bg, color: LOCK_META[r.t].fg }}><Icon d={LOCK_META[r.t].d} size={12} strokeWidth={2} />{LOCK_META[r.t].short}</span></span>
              <span className="num">{money(r.units)}</span>
              <span className="num" style={{ fontWeight: 500 }}>{bn(r.v)} میلیارد</span>
              <span className="num" style={{ color: 'var(--text-secondary)' }}>{dec(r.pct)}٪</span>
              <span className="num" style={{ color: 'var(--text-secondary)' }}>{money(r.holders)} نفر</span>
            </div>
          ))}
          {!rows.length && <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>همهٔ واحدهای این صندوق آزاد است</div>}
        </>
      ) : (
        <>
          <div style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: navCols, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>تاریخ</span><span>NAV</span><span>تغییر</span><span>AUM</span>
          </div>
          {navs.map((n) => {
            const ch = n.prev ? (n.v / n.prev - 1) * 100 : 0;
            return (
              <div key={n.t} style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: navCols, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jDate(n.t)}</span>
                <span className="num">{money(n.v)}</span>
                <span><Lbl tone={ch > 0.05 ? 'success' : ch < -0.05 ? 'error' : 'default'} style={{ height: 20, padding: '0 6px' }}>{Math.abs(ch) < 0.05 ? '۰٫۰٪' : spct(ch)}</Lbl></span>
                <span className="num" style={{ color: 'var(--text-secondary)' }}>{bn(aumAt(n.v))} میلیارد</span>
              </div>
            );
          })}
          {!navs.length && <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>NAVی ثبت نشده است</div>}
        </>
      )}
    </div>
  );
}

function EditFundModal({ f, open, onClose }: { f: OpFund; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateFundX();
  const init = () => ({ name: f.name, symbol: f.symbol, category: f.category, manager: f.meta?.manager ?? '', description: f.description });
  const [d, setD] = useState(init);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setD(init()); setErr(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    if (!d.name.trim()) return setErr('نام صندوق الزامی است.');
    if (!d.symbol.trim()) return setErr('نماد بورسی الزامی است.');
    if (d.description.trim().length < 5) return setErr('توضیح کوتاه را کامل‌تر بنویسید.');
    setErr('');
    update.mutate({ id: f.id, name: d.name.trim(), symbol: d.symbol.trim(), category: d.category, description: d.description.trim(), meta: { manager: d.manager.trim() } }, {
      onSuccess: () => { toast('اطلاعات صندوق ذخیره شد'); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  const cycle = () => setD({ ...d, category: CATEGORIES[(CATEGORIES.indexOf(d.category) + 1) % CATEGORIES.length] });
  return (
    <Modal open={open} onClose={onClose} label={`ویرایش ${f.name}`}>
      <DlgHead title={`ویرایش ${f.name}`} onClose={onClose} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
        <div className="fg"><label className="fl" htmlFor="e-name">نام صندوق</label><input id="e-name" className="fi" value={d.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, name: e.target.value })} /></div>
        <div className="fg"><label className="fl" htmlFor="e-sym">نماد بورسی</label><input id="e-sym" className="fi" value={d.symbol} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, symbol: e.target.value })} /></div>
        <div className="fg"><span className="fl">نوع</span><button type="button" className="fi sel" onClick={cycle} aria-label="نوع صندوق">ETF {CATEGORY_LABEL[d.category]}<Icon d={IC.chev} size={16} style={{ marginRight: 'auto', color: 'var(--text-secondary)' }} /></button></div>
        <div className="fg"><label className="fl" htmlFor="e-mgr">مدیر صندوق</label><input id="e-mgr" className="fi" value={d.manager} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, manager: e.target.value })} /></div>
        <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl" htmlFor="e-desc">توضیح کوتاه (نمایش در اپ)</label><input id="e-desc" className="fi" value={d.description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, description: e.target.value })} /></div>
      </div>
      <FormError>{err}</FormError>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btnp" onClick={save} disabled={update.isPending} style={{ opacity: update.isPending ? 0.7 : 1 }}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button>
        <button type="button" className="btno" onClick={onClose}>انصراف</button>
      </div>
    </Modal>
  );
}
