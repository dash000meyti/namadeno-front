'use client';
/**
 * Operator console — fund. Kit detail page: heading (fund tile, status/type pills, NAV refresh, edit, pause/resume/launch)
 * → stats → tabs: performance (NAV chart with range, recent NAVs + CSV export, today's orders, fund info),
 * locks (free/locked AUM by lock type), settings (trading and collateral groups + sticky save bar).
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useOpFund } from '@/api/op';
import { useRefreshNav, useUpdateFundX, type OpFund } from '@/api/op-system-extra';
import type { Fund, LockType } from '@/types/domain';
import {
  ActionBar, Allocation, BigNum, Card, Chips, Confirm, Empty, ErrorBlock, FreeLocked, KV,
  NumberInput, PageHeading, Pill, Section, SettingRow, SettingsGroup, SkeletonCard, StatStrip, Switch, Table, Tabs, Tile,
  type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { bn, dayTime, dec, downloadCsv, errMsg, raw, spct } from '@/components/op/system/fmt';
import { IC, type ToneKey } from '@/components/op/system/ui';
import { CATEGORY_LABEL, FUND_STATUS, FUND_UI, LOCK_ORDER, fundTitle, lockedOf } from '@/components/op/system/funds';
import { FundEditDialog, NavChart } from '@/components/op/system/FundUi';
import { faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Tab = 'perf' | 'locks' | 'settings';
const RANGES: [number, string][] = [[7, '۷ روز'], [30, '۳۰ روز'], [90, '۹۰ روز']];
const SETTLEMENTS: Fund['settlement'][] = ['T+0', 'T+1', 'T+2'];
const PAUSE_BODY = 'خرید و فروش واحدهای این صندوق برای همهٔ کاربران متوقف می‌شود. واحدهای فعلی، سود و NAV و رزروها بدون تغییر باقی می‌مانند و هر زمان می‌توانید صندوق را دوباره فعال کنید.';

/** Legacy tone key → kit tone. */
const kt = (t: ToneKey): Tone => (t === 'default' ? 'neutral' : t);
const trend = (n: number) => (n > 0 ? 'up' as const : n < 0 ? 'down' as const : undefined);
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));

/** A round axis floor under the lowest value, so day-to-day NAV moves stay visible. */

/** NAV line (kit LineChart). Big NAVs read in thousands. LTR wrapper keeps the y-axis labels left of the plot in the RTL page. */

interface LockRow { t: LockType; v: number; units: number; pct: number; holders: number }

export default function OpFundPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useOpFund(id);
  const refresh = useRefreshNav();
  const update = useUpdateFundX();
  const [tab, setTab] = useState<Tab>('perf');
  const [modal, setModal] = useState<'' | 'edit' | 'pause'>('');
  const f = q.data as OpFund | undefined;

  const crumbs = [{ label: 'صندوق‌ها', href: routes.op.funds }];
  if (q.isLoading) return <><PageHeading title="در حال بارگذاری…" crumbs={crumbs} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>;
  if (q.isError || !f) return <><PageHeading title="صندوق" crumbs={crumbs} /><ErrorBlock error={q.error} message={errMsg(q.error, 'صندوق پیدا نشد.')} onRetry={() => q.refetch()} /></>;

  const ui = FUND_UI[f.kind];
  const st = FUND_STATUS[f.status];
  const draft = f.status === 'coming_soon';
  const paused = f.status === 'paused';
  const h = f.history ?? [];
  const aum30 = h.length > 30 ? (h[h.length - 1].v / h[h.length - 31].v - 1) * 100 : 0;
  const locked = lockedOf(f);
  const free = Math.max(0, f.aum - locked);
  const lockedPct = f.aum ? (locked / f.aum) * 100 : 0;
  const d1 = f.navChangePct1d;
  const delta = f.meta?.investorsDeltaMonth ?? 0;
  const lockRows: LockRow[] = LOCK_ORDER.filter((t) => (f.meta?.lockByType[t] ?? 0) > 0).map((t) => {
    const v = f.meta?.lockByType[t] ?? 0;
    return { t, v, units: f.nav ? v / f.nav : 0, pct: f.aum ? (v / f.aum) * 100 : 0, holders: f.meta?.holdersByType[t] ?? 0 };
  });

  const onRefresh = () => refresh.mutate({ fundId: f.id }, {
    onSuccess: () => toast(`NAV از هسته معاملات به‌روزرسانی شد — ${money(f.nav)} تومان`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const setStatus = (status: Fund['status']) => update.mutate({ id: f.id, status }, {
    onSuccess: () => { setModal(''); toast(status === 'paused' ? `${f.name} به‌صورت موقت غیرفعال شد؛ خرید و فروش متوقف است` : `${f.name} ${draft ? 'راه‌اندازی' : 'دوباره فعال'} شد`); },
    onError: (e) => { setModal(''); toast(errMsg(e), 'error'); },
  });

  const lockCols: Column<LockRow>[] = [
    { key: 't', label: 'نوع رزرو', width: 'minmax(0, 1.4fr)', render: (r) => <LockTypeChip type={r.t} long /> },
    { key: 'u', label: 'واحد', render: (r) => <span className="num">{money(r.units)}</span> },
    { key: 'v', label: 'ارزش (میلیارد تومان)', render: (r) => <span className="num" style={{ fontWeight: 600 }}>{bn(r.v)}</span> },
    { key: 'p', label: 'سهم از AUM', render: (r) => <span className="num mute">{dec(r.pct)}٪</span> },
    { key: 'h', label: 'دارندگان', render: (r) => <span className="num mute">{money(r.holders)} نفر</span> },
  ];

  return (
    <>
      <PageHeading
        crumbs={crumbs}
        lead={<Tile d={ui.d} tone={draft ? 'neutral' : kt(ui.tone)} size="xl" />}
        title={fundTitle(f)}
        sub={<>{draft ? 'در انتظار مجوز' : f.description} · آخرین NAV <span className="num">{dayTime(f.meta?.lastNavAt)}</span></>}
        pills={<><Pill tone={kt(st.tone)} dot>{st.label}</Pill><Pill>ETF {f.shortName}</Pill></>}
      >
        <button type="button" className="nm-btn ghost" disabled={refresh.isPending || draft} onClick={onRefresh}>
          <Icon d={IC.refresh} size={16} />{refresh.isPending ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی NAV'}
        </button>
        <button type="button" className="nm-btn ghost" onClick={() => setModal('edit')}><Icon d={IC.pen} size={16} />ویرایش</button>
        {draft
          ? <button type="button" className="nm-btn" disabled={update.isPending} onClick={() => setStatus('active')}><Icon d={IC.play} size={15} />راه‌اندازی صندوق</button>
          : paused
            ? <button type="button" className="nm-btn line ok" disabled={update.isPending} onClick={() => setStatus('active')}><Icon d={IC.check} size={16} />فعال‌سازی مجدد</button>
            : <button type="button" className="nm-btn line danger" disabled={update.isPending} onClick={() => setModal('pause')}><Icon d={IC.pause} size={16} />غیرفعال‌سازی موقت</button>}
      </PageHeading>

      <StatStrip items={[
        { label: 'NAV هر واحد', value: f.nav ? money(f.nav) : '—', unit: 'تومان', note: f.nav ? `${spct(d1, 2)} امروز` : 'در انتظار NAV اولیه', trend: trend(d1) },
        { label: 'AUM', value: bn(f.aum), unit: 'میلیارد تومان', note: h.length > 30 ? `${spct(aum30)} در ۳۰ روز` : '—', trend: trend(aum30) },
        { label: 'دارندگان واحد', value: money(f.investors), unit: 'نفر', note: `${signed(delta)} این ماه`, trend: trend(delta) },
        { label: 'واحدهای رزروشده', value: `${faDigits(Math.round(lockedPct))}٪`, unit: 'از کل واحدها', note: `${bn(locked)} میلیارد · ${faDigits(lockRows.length)} نوع رزرو` },
      ]} />

      <Tabs label="بخش‌های صندوق" size="lg" value={tab} onChange={setTab} items={[
        { key: 'perf', label: 'عملکرد' },
        { key: 'locks', label: 'رزروها', count: lockRows.length },
        { key: 'settings', label: 'تنظیمات' },
      ]} />

      {tab === 'perf' && (
        <div className="nm-grid side">
          <div className="nm-stack">
            <NavCard f={f} />
            <RecentNavs f={f} />
          </div>
          <div className="nm-stack">
            <OrdersCard f={f} />
            <Card title="اطلاعات صندوق" actions={<button type="button" className="nm-btn sm text" onClick={() => setModal('edit')}>ویرایش</button>}>
              <KV rows={[
                ['نماد', f.symbol],
                ['نوع', `ETF ${CATEGORY_LABEL[f.category]}`],
                ['مدیر صندوق', f.meta?.manager || '—'],
                ['توضیح در اپ', f.description],
                ['تسویه', <span key="st" className="ltr">{f.settlement}</span>],
                ['کارمزد خرید / فروش', <span key="fee" className="num">{dec(f.feePct, 2)}٪ / {dec(f.meta?.sellFeePct ?? f.feePct, 2)}٪</span>],
              ]} />
            </Card>
          </div>
        </div>
      )}

      {tab === 'locks' && (
        <Card flush title="تفکیک AUM — آزاد / رزرو" sub={`کل دارایی ${bn(f.aum)} میلیارد تومان`}
          actions={locked > 0 ? <Pill tone="warning">{faDigits(Math.round(lockedPct))}٪ رزرو</Pill> : undefined}>
          <div className="nm-card-b" style={{ paddingTop: 4 }}><FreeLocked free={free} locked={locked} fmt={bn} unit="میلیارد" /></div>
          <Table columns={lockCols} rows={lockRows} rowKey={(r) => r.t} minWidth={620}
            empty={<Empty icon={LOCK_META.none.d} tone="success" title="همهٔ واحدهای این صندوق آزاد است" />} />
        </Card>
      )}

      <FundSettings f={f} visible={tab === 'settings'} />

      {modal === 'edit' && <FundEditDialog f={f} onClose={() => setModal('')} />}
      <Confirm open={modal === 'pause'} onClose={() => setModal('')} danger busy={update.isPending} onConfirm={() => setStatus('paused')}
        title={`غیرفعال‌سازی موقت ${f.name}`} confirmLabel="غیرفعال‌سازی موقت" body={<span className="mute">{PAUSE_BODY}</span>} />
    </>
  );
}

function NavCard({ f }: { f: OpFund }) {
  const [range, setRange] = useState(90);
  const pts = (f.history ?? []).slice(-range);
  const big = pts.length ? Math.max(...pts.map((p) => p.v)) >= 1e6 : f.nav >= 1e6;
  return (
    <Card title="روند NAV" sub={`${big ? 'هزار تومان' : 'تومان'} به ازای هر واحد`}
      actions={<Tabs label="بازه نمودار NAV" value={range} onChange={setRange} items={RANGES.map(([k, l]) => ({ key: k, label: l }))} />}>
      {pts.length > 1
        ? <NavChart points={pts} height={240} label={`روند NAV ${faDigits(range)} روز`} />
        : <Empty icon={IC.trend} title="تاریخچه NAV برای این صندوق هنوز ثبت نشده است" />}
    </Card>
  );
}

function RecentNavs({ f }: { f: OpFund }) {
  const toast = useToast();
  const hist = f.history ?? [];
  const navs = hist.slice(-6).map((x, i, a) => ({ ...x, prev: i ? a[i - 1].v : undefined })).slice(1).reverse();
  const aumAt = (v: number) => (f.nav ? (f.aum * v) / f.nav : 0);
  const exportNav = () => {
    const last = hist.slice(-90);
    if (!last.length) return toast('تاریخچه‌ای برای خروجی وجود ندارد', 'info');
    downloadCsv(`nav-${f.id}-90d`, [['تاریخ', 'NAV (تومان)', 'تغییر (%)', 'AUM تقریبی (تومان)'], ...last.map((x, i) => [jDate(x.t), raw(x.v), i ? ((x.v / last[i - 1].v - 1) * 100).toFixed(2) : '', raw(aumAt(x.v))])]);
    toast('خروجی NAV ۹۰ روز اخیر (CSV) آماده شد');
  };
  const cols: Column<(typeof navs)[number]>[] = [
    { key: 't', label: 'تاریخ', render: (n) => <span className="num mute">{jDate(n.t)}</span> },
    { key: 'v', label: 'NAV (تومان)', render: (n) => <span className="num" style={{ fontWeight: 600 }}>{money(n.v)}</span> },
    {
      key: 'ch', label: 'تغییر', width: '96px', render: (n) => {
        const ch = n.prev ? (n.v / n.prev - 1) * 100 : 0;
        return <Pill tone={ch > 0.05 ? 'success' : ch < -0.05 ? 'error' : 'neutral'}>{Math.abs(ch) < 0.05 ? '۰٫۰٪' : spct(ch)}</Pill>;
      },
    },
    { key: 'aum', label: 'AUM تقریبی', align: 'end', render: (n) => <span className="num mute">{bn(aumAt(n.v))} میلیارد</span> },
  ];
  return (
    <Card flush title="آخرین NAVها" actions={<button type="button" className="nm-btn sm ghost" onClick={exportNav}><Icon d={IC.download} size={15} />خروجی ۹۰ روز</button>}>
      <Table columns={cols} rows={navs} rowKey={(n) => n.t} empty={<Empty title="NAVی ثبت نشده است" />} />
    </Card>
  );
}

function OrdersCard({ f }: { f: OpFund }) {
  const o = f.meta?.ordersToday ?? { buyCount: 0, buyValue: 0, sellCount: 0, sellValue: 0 };
  const net = o.buyValue - o.sellValue;
  const when = f.settlement === 'T+0' ? 'امروز' : f.settlement === 'T+1' ? 'فردا' : 'پس‌فردا';
  return (
    <Card title="سفارش‌های امروز" sub={<>تسویه {when} <span className="num ltr">{faDigits('10:00')}</span> (<span className="ltr">{f.settlement}</span>)</>}>
      {o.buyValue + o.sellValue > 0 ? (
        <Section title={`خالص ${net >= 0 ? 'ورودی' : 'خروجی'}`}
          action={<BigNum value={`${net >= 0 ? '+' : '−'}${bn(Math.abs(net))}`} unit="میلیارد تومان" style={{ color: net >= 0 ? 'var(--success-text)' : 'var(--error-text)' }} />}>
          <Allocation fmt={(n) => `${bn(n)} میلیارد`} items={[
            { label: `خرید · ${money(o.buyCount)} سفارش`, value: o.buyValue, color: 'var(--chart-1)' },
            { label: `فروش · ${money(o.sellCount)} سفارش`, value: o.sellValue, color: 'var(--error-main)' },
          ]} />
        </Section>
      ) : <Empty title="امروز سفارشی ثبت نشده است" />}
    </Card>
  );
}

interface SettingsDraft { feePct: number; sellFeePct: number; minBuy: number; settlement: Fund['settlement']; collateralEnabled: boolean; maxLtvPct: number }

/** Settings tab. Stays mounted while other tabs show, so unsaved edits survive a tab switch. */
function FundSettings({ f, visible }: { f: OpFund; visible: boolean }) {
  const toast = useToast();
  const update = useUpdateFundX();
  const server: SettingsDraft = useMemo(() => ({
    feePct: f.feePct, sellFeePct: f.meta?.sellFeePct ?? f.feePct, minBuy: f.meta?.minBuy ?? 0, settlement: f.settlement,
    collateralEnabled: f.meta?.collateralEnabled ?? false, maxLtvPct: f.meta?.maxLtvPct ?? 0,
  }), [f]);
  const [d, setD] = useState<SettingsDraft>(server);
  useEffect(() => setD(server), [server]);
  const changes = (Object.keys(server) as (keyof SettingsDraft)[]).filter((k) => !Object.is(d[k], server[k])).length;
  const bad = { fee: !(d.feePct >= 0 && d.feePct <= 5), sell: !(d.sellFeePct >= 0 && d.sellFeePct <= 5), min: !(d.minBuy >= 0), ltv: !(d.maxLtvPct >= 0 && d.maxLtvPct <= 100) };
  const set = (patch: Partial<SettingsDraft>) => setD((x) => ({ ...x, ...patch }));

  const save = () => {
    if (bad.fee || bad.sell) return toast('کارمزد باید بین ۰ تا ۵ درصد باشد', 'error');
    if (bad.min) return toast('حداقل خرید معتبر نیست', 'error');
    if (bad.ltv) return toast('حداکثر نسبت پشتوانه باید بین ۰ تا ۱۰۰ درصد باشد', 'error');
    if (!changes) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    update.mutate({ id: f.id, feePct: d.feePct, settlement: d.settlement, meta: { sellFeePct: d.sellFeePct, minBuy: d.minBuy, collateralEnabled: d.collateralEnabled, maxLtvPct: d.maxLtvPct } }, {
      onSuccess: () => toast(`تنظیمات ${f.name} ذخیره شد`),
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  if (!visible) return null;
  const last = f.meta?.updatedAt ? `آخرین تغییر: ${jDayMonth(f.meta.updatedAt)}${f.meta.updatedBy ? ' · ' + f.meta.updatedBy : ''}` : '';
  return (
    <>
      <div className="nm-grid c2">
        <SettingsGroup title="معاملات">
          <SettingRow label="کارمزد خرید" htmlFor="fee-buy" desc="بین ۰ تا ۵ درصد مبلغ هر خرید">
            <NumberInput id="fee-buy" value={d.feePct} onChange={(n) => set({ feePct: n })} decimals width={52} suffix="٪" label="کارمزد خرید" invalid={bad.fee} />
          </SettingRow>
          <SettingRow label="کارمزد فروش" htmlFor="fee-sell" desc="بین ۰ تا ۵ درصد مبلغ هر فروش">
            <NumberInput id="fee-sell" value={d.sellFeePct} onChange={(n) => set({ sellFeePct: n })} decimals width={52} suffix="٪" label="کارمزد فروش" invalid={bad.sell} />
          </SettingRow>
          <SettingRow label="حداقل خرید" htmlFor="min-buy" desc="کمترین مبلغ هر سفارش خرید">
            <NumberInput id="min-buy" value={d.minBuy} onChange={(n) => set({ minBuy: n })} width={96} suffix="تومان" label="حداقل خرید" invalid={bad.min} />
          </SettingRow>
          <SettingRow label="تسویه" desc="زمان تسویه‌ی سفارش‌های خرید و فروش">
            <Chips label="نوع تسویه" value={d.settlement} onChange={(s) => set({ settlement: s })} options={SETTLEMENTS.map((s) => ({ key: s, label: <span dir="ltr">{s}</span> }))} />
          </SettingRow>
        </SettingsGroup>
        <SettingsGroup title="پشتوانه">
          <SettingRow label="قابل استفاده به‌عنوان پشتوانه" desc="فقط از واحدهای آزاد؛ رزرو از نوع «پشتوانه»">
            <Switch on={d.collateralEnabled} onChange={(v) => set({ collateralEnabled: v })} label="قابل استفاده به‌عنوان پشتوانه" />
          </SettingRow>
          <SettingRow label="حداکثر نسبت پشتوانه" htmlFor="max-ltv" desc="بین ۰ تا ۱۰۰ درصد ارزش واحدهای آزاد">
            <NumberInput id="max-ltv" value={d.maxLtvPct} onChange={(n) => set({ maxLtvPct: n })} width={52} suffix="٪" label="حداکثر نسبت پشتوانه" invalid={bad.ltv} disabled={!d.collateralEnabled} />
          </SettingRow>
        </SettingsGroup>
      </div>

      <ActionBar actions={(
        <>
          {changes > 0 && <button type="button" className="nm-btn ghost" onClick={() => setD(server)}>لغو تغییرات</button>}
          <button type="button" className="nm-btn" onClick={save} disabled={update.isPending}><Icon d={IC.check} size={16} strokeWidth={2.2} />{update.isPending ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}</button>
        </>
      )}>
        {changes > 0 ? <Pill tone="warning" dot>{faDigits(changes)} تغییر ذخیره‌نشده</Pill> : <span>{last}</span>}
      </ActionBar>
    </>
  );
}

/** Fund identity (name, symbol, type, manager, app description). Same dialog as the inspector on the funds list. */
