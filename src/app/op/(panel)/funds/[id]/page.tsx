'use client';
/**
 * Operator console — fund. Kit detail page: heading (fund tile, status / stock-state pills, «ثبت سفارش», more actions:
 * NAV refresh, edit, pause/resume; launch for drafts) → stock stats → tabs:
 *   موجودی     «صف تأمین» (when items wait for this fund's stock: the need, the promise, «ثبت صدور», the waiting items),
 *              stock breakdown, free-stock trend vs the target band, 30-day forecast, the suggestion, recent movements
 *   سفارش‌ها   ledger of this fund's executed orders («صدور» / «ابطال», recorded when done) + inspector
 *   عملکرد    NAV chart with range, recent NAVs + CSV export, users' orders today, fund info
 *   رزروها     free / reserved AUM by reservation type
 *   تنظیمات   trading and collateral groups + sticky save bar
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useOpFund } from '@/api/op';
import { useRefreshNav, useUpdateFundX, type OpFund } from '@/api/op-system-extra';
import {
  useTreasuryOrders, useTreasuryPosition,
  type OrderSide, type QueueItem, type TreasuryPositionDetail,
} from '@/api/op-treasury-extra';
import type { Fund, LockType } from '@/types/domain';
import {
  ActionBar, Allocation, BigNum, Card, Chips, Confirm, Empty, ErrorBlock, FreeLocked, KV, Legend, LineChart, MenuButton,
  NumberInput, PageHeading, Pill, Section, SettingRow, SettingsGroup, SkeletonCard, StatStrip, Switch, Table, TableFoot, Tabs, Tile, Toolbar,
  niceMax, usePaging, type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { bn, dayTime, dec, downloadCsv, errMsg, raw, spct } from '@/components/op/system/fmt';
import { IC, type ToneKey } from '@/components/op/system/ui';
import { CATEGORY_LABEL, FUND_STATUS, FUND_UI, LOCK_ORDER, fundTitle, lockedOf } from '@/components/op/system/funds';
import { FundEditDialog, NavChart } from '@/components/op/system/FundUi';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { SIDE, STOCK_STATE, TI, amt, buyNowCap, isNeed, orderAt, thisMonth, unitsText } from '@/components/op/treasury/ui';
import {
  CoverageBlock, MovementInspector, OpLabel, PositionBreakdown, StatePill, SuggestionNote, minTargetOf, movementColumns, samt, sbn, useOrgNames,
} from '@/components/op/funds/stock';
import { OrderInspector, orderColumns } from '@/components/op/funds/orders';
import { QueueCard, QueueItemInspector } from '@/components/op/funds/queue';
import { faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Tab = 'stock' | 'orders' | 'perf' | 'locks' | 'settings';
type OrderFilt = 'all' | OrderSide;
const RANGES: [number, string][] = [[7, '۷ روز'], [30, '۳۰ روز'], [90, '۹۰ روز']];
const STOCK_RANGES: [number, string][] = [[30, '۳۰ روز'], [90, '۹۰ روز']];
const SETTLEMENTS: Fund['settlement'][] = ['T+0', 'T+1', 'T+2'];
const PAUSE_BODY = 'خرید و فروش واحدهای این صندوق برای همهٔ کاربران متوقف می‌شود. واحدهای فعلی، سود و NAV و رزروها بدون تغییر باقی می‌مانند و هر زمان می‌توانید صندوق را دوباره فعال کنید.';

/** Legacy tone key → kit tone. */
const kt = (t: ToneKey): Tone => (t === 'default' ? 'neutral' : t);
const trend = (n: number) => (n > 0 ? 'up' as const : n < 0 ? 'down' as const : undefined);

interface LockRow { t: LockType; v: number; units: number; pct: number; holders: number }
interface OrderPrefill { key: number; side?: OrderSide; amount?: number; source?: 'manual' | 'suggestion'; reason?: string }
type Sel = { kind: 'move' | 'order'; id: string } | { kind: 'queue'; id: string; item: QueueItem } | null;

export default function OpFundPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useOpFund(id);
  const pos = useTreasuryPosition(id);
  const refresh = useRefreshNav();
  const update = useUpdateFundX();
  const [tab, setTabRaw] = useState<Tab>('stock');
  const [modal, setModal] = useState<'' | 'edit' | 'pause'>('');
  const [order, setOrder] = useState<OrderPrefill | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const f = q.data as OpFund | undefined;
  const d = pos.data;

  const crumbs = [{ label: 'موجودی صندوق‌ها', href: routes.op.funds }];
  if (q.isLoading) return <><PageHeading title="در حال بارگذاری…" crumbs={crumbs} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>;
  if (q.isError || !f) return <><PageHeading title="صندوق" crumbs={crumbs} /><ErrorBlock error={q.error} message={errMsg(q.error, 'صندوق پیدا نشد.')} onRetry={() => q.refetch()} /></>;

  const ui = FUND_UI[f.kind];
  const st = FUND_STATUS[f.status];
  const draft = f.status === 'coming_soon';
  const paused = f.status === 'paused';
  const active = f.status === 'active';
  const locked = lockedOf(f);
  const free = Math.max(0, f.aum - locked);
  const lockedPct = f.aum ? (locked / f.aum) * 100 : 0;
  const d1 = f.navChangePct1d;
  const lockRows: LockRow[] = LOCK_ORDER.filter((t) => (f.meta?.lockByType[t] ?? 0) > 0).map((t) => {
    const v = f.meta?.lockByType[t] ?? 0;
    return { t, v, units: f.nav ? v / f.nav : 0, pct: f.aum ? (v / f.aum) * 100 : 0, holders: f.meta?.holdersByType[t] ?? 0 };
  });
  // cash-first: orders are recorded when done — the stat counts this month's buys and redemptions
  const month = thisMonth();
  const monthOrders = (d?.orders ?? []).filter((o) => o.status !== 'cancelled' && orderAt(o) >= month.from);
  const monthBuy = monthOrders.filter((o) => o.side === 'buy').reduce((s, o) => s + o.amount, 0);
  const monthRedeem = monthOrders.filter((o) => o.side === 'redeem').reduce((s, o) => s + o.amount, 0);
  const need = !!d && isNeed(d.state);
  const attention = need || d?.state === 'below';

  const setTab = (t: Tab) => { setTabRaw(t); setSel(null); };
  const openOrder = (o: Omit<OrderPrefill, 'key'> = {}) => setOrder({ key: Date.now(), ...o });
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
    { key: 'p', label: 'سهم از موجودی', render: (r) => <span className="num mute">{dec(r.pct)}٪</span> },
    { key: 'h', label: 'دارندگان', render: (r) => <span className="num mute">{money(r.holders)} نفر</span> },
  ];

  const navStat: Stat = { label: 'NAV هر واحد', value: f.nav ? money(f.nav) : '—', unit: 'تومان', note: f.nav ? `${spct(d1, 2)} امروز` : 'در انتظار NAV اولیه', trend: trend(d1) };
  const stats: Stat[] = d && d.state !== 'inactive' ? [
    navStat,
    { label: 'موجودی خزانه', value: sbn(d.heldValue), unit: 'میلیارد تومان', note: `${unitsText(d.heldUnits)} واحد` },
    { label: 'تخصیص به کاربران', value: sbn(d.allocatedValue), unit: 'میلیارد تومان', note: `رزرو ${amt(d.reservedValue)} · ${money(f.investors)} دارنده` },
    {
      label: 'موجودی آزاد', value: sbn(Math.max(0, d.availableValue)), unit: 'میلیارد تومان', trend: need ? 'down' : attention ? 'warn' : undefined,
      note: d.needBuyValue > 0
        ? `نیاز به خرید ${amt(d.needBuyValue)}`
        : d.target ? `حداقل هدف ${amt(d.target.minFreeValue)}` : 'بدون هدف',
    },
    {
      label: `سفارش‌های ${month.name}`, value: faDigits(monthOrders.length), unit: 'سفارش', onClick: () => setTab('orders'), active: tab === 'orders',
      note: monthOrders.length
        ? [monthBuy > 0 && `صدور ${amt(monthBuy)}`, monthRedeem > 0 && `ابطال ${amt(monthRedeem)}`].filter(Boolean).join(' · ')
        : 'سفارشی در این ماه ثبت نشده',
    },
  ] : [
    navStat,
    { label: 'موجودی خزانه', value: bn(f.aum), unit: 'میلیارد تومان', note: draft ? 'پس از راه‌اندازی' : '—' },
    { label: 'دارندگان واحد', value: money(f.investors), unit: 'نفر', note: '—' },
    { label: 'واحدهای رزروشده', value: `${faDigits(Math.round(lockedPct))}٪`, unit: 'از کل واحدها', note: `${bn(locked)} میلیارد · ${faDigits(lockRows.length)} نوع رزرو` },
  ];

  const more = [
    { label: refresh.isPending ? 'در حال به‌روزرسانی NAV…' : 'به‌روزرسانی NAV', onClick: onRefresh, disabled: refresh.isPending || draft },
    { label: 'ویرایش اطلاعات صندوق', onClick: () => setModal('edit') },
    ...(active ? ['sep' as const, { label: 'غیرفعال‌سازی موقت', onClick: () => setModal('pause'), danger: true, disabled: update.isPending }] : []),
  ];

  return (
    <>
      <PageHeading
        crumbs={crumbs}
        lead={<Tile d={ui.d} tone={draft ? 'neutral' : kt(ui.tone)} size="xl" />}
        title={fundTitle(f)}
        sub={<>{draft ? 'در انتظار مجوز' : f.description} · آخرین NAV <span className="num">{dayTime(f.meta?.lastNavAt)}</span></>}
        pills={<><Pill tone={kt(st.tone)} dot>{st.label}</Pill>{d && d.state !== 'inactive' && <StatePill p={d} />}<Pill>ETF {f.shortName}</Pill></>}
      >
        <MenuButton label="اقدام‌های دیگر" align="end" items={more} />
        {draft
          ? <button type="button" className="nm-btn" disabled={update.isPending} onClick={() => setStatus('active')}><Icon d={IC.play} size={15} />راه‌اندازی صندوق</button>
          : paused
            ? <button type="button" className="nm-btn line ok" disabled={update.isPending} onClick={() => setStatus('active')}><Icon d={IC.check} size={16} />فعال‌سازی مجدد</button>
            : <button type="button" className="nm-btn" onClick={() => openOrder()}><Icon d={TI.plus} size={16} strokeWidth={2} />ثبت سفارش</button>}
      </PageHeading>

      <StatStrip loading={pos.isLoading} items={stats} />

      <Tabs label="بخش‌های صندوق" size="lg" value={tab} onChange={setTab} items={[
        { key: 'stock', label: 'موجودی' },
        { key: 'orders', label: 'سفارش‌ها' },
        { key: 'perf', label: 'عملکرد' },
        { key: 'locks', label: 'رزروها', count: lockRows.length },
        { key: 'settings', label: 'تنظیمات' },
      ]} />

      {tab === 'stock' && (
        pos.isLoading ? <SkeletonCard h={360} />
          : pos.isError || !d ? <ErrorBlock error={pos.error} message={errMsg(pos.error, 'موجودی این صندوق دریافت نشد.')} onRetry={() => pos.refetch()} />
            : <StockTab d={d} active={active} sel={sel} onSelect={setSel} onOrder={openOrder} />
      )}

      {tab === 'orders' && <OrdersTab fundId={f.id} p={d} canOrder={active} sel={sel} onSelect={setSel} onOrder={() => openOrder()} />}

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
        <Card flush title="تفکیک موجودی — آزاد / رزرو" sub={`کل موجودی ${bn(f.aum)} میلیارد تومان`}
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
      {order && <OrderDialog key={order.key} open onClose={() => setOrder(null)} fundId={f.id} side={order.side} amount={order.amount} source={order.source} reason={order.reason} />}
    </>
  );
}

// ───────────────────────── stock tab ─────────────────────────

function StockTab({ d, active, sel, onSelect, onOrder }: {
  d: TreasuryPositionDetail; active: boolean; sel: Sel; onSelect: (s: Sel) => void;
  onOrder: (o: Omit<OrderPrefill, 'key'>) => void;
}) {
  const orgName = useOrgNames();
  const pg = usePaging(d.movements, 8);
  const fc = d.forecast as TreasuryPositionDetail['forecast'] | undefined;
  const minTarget = fc?.minTarget ?? minTargetOf(d);
  const s = d.suggestion;
  const fs = fc?.suggestion;
  const selMove = sel?.kind === 'move' ? d.movements.find((m) => m.id === sel.id) : undefined;
  const queued = d.queuedCount > 0 || d.needBuyValue > 0;
  const order = active ? onOrder : undefined;

  if (d.state === 'inactive') {
    return <Card><Empty icon={TI.stock} title="این صندوق هنوز موجودی ندارد" sub="پس از راه‌اندازی و ثبت نخستین صدور، موجودی خزانه، تخصیص‌ها و موجودی آزاد اینجا نمایش داده می‌شود." /></Card>;
  }
  const projected = fc?.projectedEnd ?? 0;
  return (
    <>
      {queued
        ? <QueueCard p={d} onOrder={order} selectedId={sel?.kind === 'queue' ? sel.id : null} onSelect={(i) => onSelect(i ? { kind: 'queue', id: i.id, item: i } : null)} />
        : s && <SuggestionNote suggestion={s} onOrder={active ? () => onOrder({ side: s.side, amount: s.amount, source: 'suggestion', reason: s.reason }) : undefined} />}
      <div className="nm-grid side">
        <div className="nm-stack">
          <FreeTrend d={d} minTarget={minTarget} />

          {fc && (
            <Card title="پیش‌بینی ۳۰ روز آینده" sub="تقاضا در برابر بازگشت به موجودی"
              actions={<Pill tone={STOCK_STATE[fc.state].tone} dot>{STOCK_STATE[fc.state].label}</Pill>}
              more={{ label: 'برنامه‌ریزی', href: routes.op.planning }}>
              <KV rows={[
                [<OpLabel key="a">موجودی آزاد اکنون</OpLabel>, <span key="a" className="num">{samt(fc.availableNow)} تومان</span>],
                ...(d.queuedValue > 0 ? [[<OpLabel key="q" op="−" sub={`${faDigits(d.queuedCount)} مورد منتظر موجودی`}>در صف تأمین</OpLabel>, <span key="q" className="num">{samt(d.queuedValue)} تومان</span>] as [ReactNode, ReactNode]] : []),
                [<OpLabel key="d" op="−" sub="خرید کاربران و بسته‌های تازه">تقاضای پیش‌بینی‌شده</OpLabel>, <span key="d" className="num">{samt(fc.demand)} تومان</span>],
                [<OpLabel key="r" op="+" sub="فروش کاربران، پس‌انداز آزادشده و بازپس‌گیری">بازگشت به موجودی</OpLabel>, <span key="r" className="num">{samt(fc.returns)} تومان</span>],
                // nothing goes negative: a projected gap is what must be bought in advance
                [<OpLabel key="e" op="=" strong>{projected < 0 ? 'نیاز به خرید تا پایان دوره' : 'موجودی آزاد پایان دوره'}</OpLabel>, (
                  <span key="e" className="num" style={{ fontWeight: 600, color: projected < 0 ? 'var(--error-text)' : projected < minTarget ? 'var(--warning-text)' : undefined }}>
                    {amt(Math.abs(projected))} تومان
                  </span>
                )],
                [<OpLabel key="m">حداقل هدف</OpLabel>, <span key="m" className="num mute">{samt(minTarget)} تومان</span>],
              ]} />
              {fs && (!s || s.side !== fs.side || s.amount !== fs.amount) && (
                <SuggestionNote suggestion={fs} when="برای ۳۰ روز آینده" onOrder={active ? () => onOrder({ side: fs.side, amount: fs.side === 'buy' ? buyNowCap(d, fs.amount) : fs.amount, source: 'suggestion', reason: fs.reason }) : undefined} />
              )}
            </Card>
          )}
        </div>

        <div className="nm-stack">
          <Card title="تفکیک موجودی" actions={<BigNum value={sbn(d.heldValue)} unit="میلیارد" />}>
            <PositionBreakdown p={d} />
          </Card>
          <Card title="موجودی آزاد و هدف" more={{ label: 'تغییر هدف', href: routes.op.planning }}>
            <CoverageBlock p={d} minTarget={minTarget} />
          </Card>
        </div>
      </div>

      <Card flush title="جابه‌جایی‌های اخیر" count={d.movements.length} sub="ورود و خروج واحدهای این صندوق از موجودی آزاد">
        <Table
          columns={movementColumns({ orgName })} rows={pg.rows} rowKey={(m) => m.id} rowLabel={(m) => m.title}
          onRowClick={(m) => onSelect(sel?.kind === 'move' && sel.id === m.id ? null : { kind: 'move', id: m.id })}
          selectedKey={sel?.kind === 'move' ? sel.id : null}
          empty={<Empty icon={TI.activity} title="جابه‌جایی‌ای برای این صندوق ثبت نشده است" />}
          minWidth={640}
        />
        <TableFoot shown={pg.rows.length} total={d.movements.length} unit="جابه‌جایی" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {selMove && <MovementInspector key={selMove.id} m={selMove} fundName={d.name} orgName={orgName} onClose={() => onSelect(null)} />}
      {sel?.kind === 'queue' && <QueueItemInspector key={sel.id} i={sel.item} fundName={d.name} onClose={() => onSelect(null)} />}
    </>
  );
}

/** Free stock over 30/90 days against the current lower and upper edge of the target band. */
function FreeTrend({ d, minTarget }: { d: TreasuryPositionDetail; minTarget: number }) {
  const [range, setRange] = useState(90);
  const pts = d.history.slice(-range);
  const max = d.target?.maxFreeValue;
  const free = pts.map((p) => p.available);
  const lo = Math.min(0, ...free);
  const series = [
    { name: 'موجودی آزاد', color: 'var(--chart-2)', values: free, area: true },
    ...(minTarget > 0 ? [{ name: 'حداقل هدف', color: 'var(--warning-main)', values: pts.map(() => minTarget), dashed: true }] : []),
    ...(max ? [{ name: 'سقف هدف', color: 'var(--info-main)', values: pts.map(() => max), dashed: true }] : []),
  ];
  const first = free[0] ?? 0;
  const last = free[free.length - 1] ?? 0;
  return (
    <Card title="روند موجودی آزاد" sub="میلیارد تومان · محدوده‌ی هدف فعلی"
      actions={<Tabs label="بازه نمودار موجودی" value={range} onChange={setRange} items={STOCK_RANGES.map(([k, l]) => ({ key: k, label: l }))} />}>
      {pts.length > 1 ? (
        <div className="nm-stack" style={{ gap: 12 }}>
          <LineChart label={`روند موجودی آزاد ${d.name} در ${faDigits(range)} روز`} height={230} labels={pts.map((p) => jDayMonth(p.t))}
            min={lo < 0 ? -niceMax(-lo) : 0} fmt={(n) => sbn(n)} series={series} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Legend items={series.map((x) => ({ label: x.name, color: x.color }))} />
            <span className="mute num" style={{ fontSize: 12, marginRight: 'auto' }}>
              {faDigits(range)} روز: {samt(first)} ← {samt(last)}
            </span>
          </div>
        </div>
      ) : <Empty icon={TI.stock} title="سابقه‌ای برای موجودی این صندوق ثبت نشده است" />}
    </Card>
  );
}

// ───────────────────────── orders tab ─────────────────────────

function OrdersTab({ fundId, p, canOrder, sel, onSelect, onOrder }: {
  fundId: string; p?: TreasuryPositionDetail; canOrder: boolean; sel: Sel; onSelect: (s: Sel) => void; onOrder: () => void;
}) {
  const orders = useTreasuryOrders({ fundId });
  const [filt, setFilt] = useState<OrderFilt>('all');
  // the ledger of executed orders, newest first
  const all = useMemo(
    () => (orders.data ?? []).filter((o) => o.status !== 'cancelled').sort((a, b) => orderAt(b).localeCompare(orderAt(a))),
    [orders.data],
  );
  const rows = useMemo(() => all.filter((o) => filt === 'all' || o.side === filt), [all, filt]);
  const pg = usePaging(rows, 10, filt);
  const count = (s: OrderSide) => all.filter((o) => o.side === s).length;
  const selOrder = sel?.kind === 'order' ? all.find((o) => o.id === sel.id) : undefined;

  return (
    <>
      <Card flush>
        <Toolbar>
          <Tabs label="نوع سفارش" value={filt} onChange={setFilt} items={[
            { key: 'all', label: 'همه', count: all.length },
            { key: 'buy', label: SIDE.buy.label, count: count('buy') },
            { key: 'redeem', label: SIDE.redeem.label, count: count('redeem') },
          ]} />
          <span className="grow" />
          {canOrder && <button type="button" className="nm-btn sm ghost" onClick={onOrder}><Icon d={TI.plus} size={15} strokeWidth={2} />ثبت سفارش</button>}
        </Toolbar>
        <Table
          columns={orderColumns} rows={pg.rows} rowKey={(o) => o.id} rowLabel={(o) => `سفارش ${o.code}`}
          onRowClick={(o) => onSelect(sel?.kind === 'order' && sel.id === o.id ? null : { kind: 'order', id: o.id })}
          selectedKey={sel?.kind === 'order' ? sel.id : null}
          loading={orders.isLoading} error={orders.isError ? orders.error : undefined} onRetry={() => orders.refetch()}
          empty={<Empty icon={TI.order} title={filt === 'all' ? 'برای این صندوق سفارشی ثبت نشده است' : `${SIDE[filt].label}ی برای این صندوق ثبت نشده است`} />}
          minWidth={720}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="سفارش" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>
      {selOrder && <OrderInspector key={selOrder.id} o={selOrder} p={p} onClose={() => onSelect(null)} />}
    </>
  );
}

// ───────────────────────── performance ─────────────────────────
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
    <Card title="سفارش‌های کاربران امروز" sub={<>تسویه {when} <span className="num ltr">{faDigits('10:00')}</span> (<span className="ltr">{f.settlement}</span>)</>}>
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
