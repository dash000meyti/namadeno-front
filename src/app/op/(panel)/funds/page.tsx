'use client';
/**
 * /op/funds — «موجودی صندوق‌ها»: the treasury stock. Kit list page: heading («ثبت سفارش», NAV refresh, CSV) → stock stats
 * (the rial treasury first) → «نیاز به خرید» (only when something waits in the queue «صف تأمین»: one row per fund — and
 * «ریال» for users' sales waiting for free rial — with the need, the queue, the promise, open-order cover and «ثبت صدور»;
 * row → inspector with the waiting items) → stock table: «ریال» and «ریال رزرو» first (everything users and organizations do is in
 * rial), then the funds (state tabs, search; gold and fixed income first) → inspector (fund: stock breakdown, coverage vs
 * the target band, the suggestion with a prefilled order, recent movements · rial: «خزانه‌ی ریالی», bank waterfall,
 * «ریال رزرو», organizations' rial accounts, recent rial moves) → recent stock movements (row → movement inspector).
 * Nothing goes negative: what the stock cannot cover waits in the queue and is delivered automatically (oldest first)
 * once Namadno buys — nothing is ever short or negative. Deep link: ?state=need_buy|below|ok|surplus selects that tab.
 */
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRefreshNav } from '@/api/op-system-extra';
import {
  useRialTreasury, useStockMovements, useStockQueue, useTreasuryPositions, useTreasurySummary,
  type OrderSide, type RialTreasury, type RialTreasuryId, type StockMovement, type StockState, type TreasuryPosition,
} from '@/api/op-treasury-extra';
import {
  Card, Empty, Ident, Inspector, KeyStats, List, ListRow, MenuButton, Meter, Note, PageHeading, Pill, SearchField, Section,
  Select, SkeletonCard, StatStrip, Table, TableFoot, Tabs, Toolbar, Who, usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { MOVE_KIND, RIAL_UI, SIDE, STOCK_STATE, TI, amt, daysText, isNeed } from '@/components/op/treasury/ui';
import { dayTime, downloadCsv, errMsg, raw } from '@/components/op/system/fmt';
import {
  CORE_FUNDS, CoverageBlock, FundTile, MovementInspector, PositionBreakdown, StatePill, SuggestionNote, bnOr, minTargetOf,
  moveActor, movementColumns, sbn, sortPositions, useOrgNames,
} from '@/components/op/funds/stock';
import {
  RIAL_IDS, RIAL_SHORT_SUB, RialCell, RialInspector, RialStatePill, RialTile, rialReportRows, rialStatus, type StockCol,
} from '@/components/op/funds/rial';
import { NeedNote, QueueEta, QueueList, buyAsk, earliestEta, needCovered, type OrderAsk } from '@/components/op/funds/queue';
import { faDigits, jDateTime, money } from '@/lib/format';
import { routes } from '@/lib/routes';

type Filt = 'all' | Exclude<StockState, 'inactive' | 'shortfall'>;
const TABS: { key: Filt; label: string }[] = [
  { key: 'all', label: 'همه' }, { key: 'need_buy', label: 'نیاز به خرید' }, { key: 'below', label: 'زیر هدف' },
  { key: 'ok', label: 'متعادل' }, { key: 'surplus', label: 'مازاد' },
];
/** ?state= → tab (the old «shortfall» opens «نیاز به خرید»). */
const filtOf = (v: string | null): Filt => (v === 'shortfall' ? 'need_buy' : TABS.some((t) => t.key === v) ? (v as Filt) : 'all');
/** The deprecated `shortfall` is shown as `need_buy`. */
const norm = (s: StockState): StockState => (s === 'shortfall' ? 'need_buy' : s);
const HEAD = {
  title: 'موجودی صندوق‌ها', crumbs: [{ label: 'خزانه' }],
  sub: 'ریال، ریال رزرو و واحدهایی که نمادنو در هر صندوق نگه می‌دارد؛ سهم کاربران، رزرو، تعهد بسته‌های ارسالی و موجودی آزاد',
};
type MoveFilt = 'all' | StockMovement['kind'];
const PAGE = 10;
const MOVE_PAGE = 8;

type Sel = { kind: 'fund' | 'move' | 'rial' | 'need'; id: string } | null;
/** A row of the stock table: one of the two rial treasuries, or a fund. */
type Row = { kind: 'rial'; key: RialTreasuryId; r: RialTreasury; state: StockState } | { kind: 'fund'; key: string; p: TreasuryPosition };
/** A row of «نیاز به خرید»: a fund whose queue is larger than its free stock, or «ریال» (users' sales waiting for free rial). */
type NeedRow = { kind: 'fund'; key: string; p: TreasuryPosition } | { kind: 'rial'; key: 'rial'; r: RialTreasury };
interface OrderPrefill extends OrderAsk { key: number }

export default function OpFundsPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>}>
      <FundsInner />
    </Suspense>
  );
}

function FundsInner() {
  const toast = useToast();
  const sp = useSearchParams();
  const stateParam = sp.get('state');
  const positions = useTreasuryPositions();
  const summary = useTreasurySummary(30);
  const rial = useRialTreasury();
  const refresh = useRefreshNav();
  const orgName = useOrgNames();
  const [filt, setFilt] = useState<Filt>(() => filtOf(stateParam));
  // a deep link opened while the page is on screen (e.g. from the action queue) selects its tab
  useEffect(() => { if (stateParam) setFilt(filtOf(stateParam)); }, [stateParam]);
  const queue = useStockQueue();
  const [q, setQ] = useState('');
  const [moveKind, setMoveKind] = useState<MoveFilt>('all');
  const moves = useStockMovements({ kind: moveKind, limit: 40 });
  const [sel, setSel] = useState<Sel>(null);
  const [order, setOrder] = useState<OrderPrefill | null>(null);
  const openOrder = (o: Omit<OrderPrefill, 'key'> = {}) => setOrder({ key: Date.now(), ...o });

  const list = useMemo(() => sortPositions(positions.data ?? []), [positions.data]);
  // «ریال» and «ریال رزرو» always come first; the reserve is «متعادل» in the filters (receipts are reviewed, never late)
  const all: Row[] = useMemo(() => [
    ...(rial.data ? RIAL_IDS.map((id): Row => ({ kind: 'rial', key: id, r: rial.data, state: rialStatus(id, rial.data).state })) : []),
    ...list.map((p): Row => ({ kind: 'fund', key: p.fundId, p })),
  ], [rial.data, list]);
  const needle = q.trim();
  const stateOf = (x: Row) => norm(x.kind === 'rial' ? x.state : x.p.state);
  const rows = useMemo(() => all.filter((x) => (filt === 'all' || norm(x.kind === 'rial' ? x.state : x.p.state) === filt)
    && (!needle || (x.kind === 'rial'
      ? [RIAL_UI[x.key].name, RIAL_SHORT_SUB[x.key], RIAL_UI[x.key].sub]
      : [x.p.name, x.p.shortName, x.p.symbol]).some((s) => s.includes(needle)))), [all, filt, needle]);
  const pg = usePaging(rows, PAGE, `${filt}|${needle}`);
  const moveRows = moves.data ?? [];
  const mpg = usePaging(moveRows, MOVE_PAGE, moveKind);
  const count = (s: StockState) => all.filter((x) => stateOf(x) === s).length;
  const fundCount = (s: StockState) => list.filter((p) => norm(p.state) === s).length;
  const nameOf = (id: string) => list.find((p) => p.fundId === id)?.shortName ?? id;
  const toggle = (kind: NonNullable<Sel>['kind'], id: string) => setSel((s) => (s?.kind === kind && s.id === id ? null : { kind, id }));
  const selFund = sel?.kind === 'fund' ? list.find((p) => p.fundId === sel.id) : undefined;
  const selMove = sel?.kind === 'move' ? moveRows.find((m) => m.id === sel.id) : undefined;
  const selRial = sel?.kind === 'rial' && rial.data ? (sel.id as RialTreasuryId) : undefined;
  const rowSelKey = sel && (sel.kind === 'fund' || sel.kind === 'rial') ? sel.id : null;

  const t = summary.data?.totals;
  const rt = summary.data?.rial ?? rial.data;
  const needN = fundCount('need_buy');
  const belowN = fundCount('below');
  const open = t ? t.pendingBuyValue + t.pendingRedeemValue : 0;
  // «نیاز به خرید»: «ریال» first (users' sales waiting for free rial), then the funds whose queue is larger than their free stock
  const needs: NeedRow[] = useMemo(() => [
    ...(rial.data && (rial.data.main.needValue ?? 0) > 0 ? [{ kind: 'rial' as const, key: 'rial' as const, r: rial.data }] : []),
    ...list.filter((p) => p.needBuyValue > 0 || isNeed(p.state)).map((p) => ({ kind: 'fund' as const, key: p.fundId, p })),
  ], [rial.data, list]);
  const selNeed = sel?.kind === 'need' ? needs.find((x) => x.key === sel.id) : undefined;

  const onRefresh = () => refresh.mutate({}, {
    onSuccess: (r) => toast(`NAV ${faDigits(r.funds.length)} صندوق فعال از هسته معاملات به‌روزرسانی شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const exportCsv = () => {
    if (!list.length && !rial.data) return toast('داده‌ای برای خروجی وجود ندارد', 'info');
    downloadCsv('namadno-treasury-stock', [
      // the rial treasuries first, in their own block (their columns differ from the funds')
      ...(rial.data ? [['خزانه‌ی ریالی — تومان'], ...rialReportRows(rial.data, raw), []] : []),
      ['صندوق', 'نماد', 'NAV (تومان)', 'واحد موجودی', 'ارزش موجودی', 'تخصیص به کاربران', 'رزرو', 'تعهد بسته‌ها', 'در انتظار ابطال', 'موجودی آزاد', 'در صف تأمین', 'نیاز به خرید', 'تحویل صف تا', 'صدور در راه', 'پوشش (روز)', 'هدف (روز)', 'وضعیت'],
      ...list.map((p) => [p.name, p.symbol, raw(p.nav), p.heldUnits.toFixed(2), raw(p.heldValue), raw(p.allocatedValue), raw(p.reservedValue), raw(p.committedValue), raw(p.pendingRedeemValue), raw(Math.max(0, p.availableValue)), raw(p.queuedValue ?? 0), raw(p.needBuyValue ?? 0), p.needBy ? jDateTime(p.needBy) : '', raw(p.pendingBuyValue), p.coverageDays ?? '', p.target?.targetDays ?? '', STOCK_STATE[p.state].label]),
    ]);
    toast('خروجی موجودی ریال و صندوق‌ها (CSV) آماده شد');
  };
  const clear = () => { setFilt('all'); setQ(''); };

  /** Rial rows render their own cells (rial.tsx); fund rows the fund cells below. */
  const cell = (col: StockCol, fund: (p: TreasuryPosition) => ReactNode) => function renderCell(x: Row): ReactNode {
    return x.kind === 'rial' ? <RialCell col={col} id={x.key} r={x.r} /> : fund(x.p);
  };
  const columns: Column<Row>[] = [
    {
      key: 'fund', label: 'صندوق', width: 'minmax(0, 1.5fr)',
      render: cell('fund', (p) => <Ident lead={<FundTile fundId={p.fundId} inactive={p.state === 'inactive'} />} title={p.name} sub={`${p.symbol} · ${p.state === 'inactive' ? 'غیرفعال' : CORE_FUNDS.includes(p.fundId) ? 'صندوق اصلی' : `تسویه ${p.settlement}`}`} />),
    },
    { key: 'nav', label: 'NAV (تومان)', width: '96px', align: 'end', render: cell('nav', (p) => (p.nav ? <span className="num">{money(p.nav)}</span> : bnOr(0))) },
    { key: 'held', label: 'موجودی', width: '72px', align: 'end', render: cell('held', (p) => <span className="num" style={{ fontWeight: 600 }}>{bnOr(p.heldValue)}</span>) },
    { key: 'alloc', label: 'تخصیص', width: '68px', align: 'end', render: cell('alloc', (p) => <span className="num">{bnOr(p.allocatedValue)}</span>) },
    { key: 'res', label: 'رزرو', width: '60px', align: 'end', render: cell('res', (p) => <span className="num mute">{bnOr(p.reservedValue)}</span>) },
    { key: 'com', label: 'تعهد', width: '56px', align: 'end', render: cell('com', (p) => <span className="num mute">{bnOr(p.committedValue)}</span>) },
    {
      key: 'free', label: 'آزاد', width: '108px', align: 'end', col: true, render: cell('free', (p) => (
        <>
          <span className="num" style={{ fontWeight: 600 }}>{p.state === 'inactive' ? bnOr(0) : sbn(Math.max(0, p.availableValue))}</span>
          {p.needBuyValue > 0
            ? <span className="sm" style={{ color: 'var(--error-text)' }} title="صف تأمین بیش از موجودی آزاد است">نیاز <span className="num">{sbn(p.needBuyValue)}</span></span>
            : p.queuedValue > 0 && <span className="sm" title="در صف تأمین">در صف <span className="num">{sbn(p.queuedValue)}</span></span>}
          {p.pendingBuyValue > 0 && <span className="sm">در راه <span className="num">{sbn(p.pendingBuyValue)}</span></span>}
        </>
      )),
    },
    {
      key: 'cov', label: 'پوشش', width: '96px', col: true, render: cell('cov', (p) => {
        if (p.state === 'inactive') return bnOr(0);
        const tg = p.target;
        return (
          <>
            <span className="num">{daysText(p.coverageDays)}{tg && <span className="sm"> / {faDigits(tg.targetDays)}</span>}</span>
            {tg && p.coverageDays != null && <Meter value={p.coverageDays / tg.targetDays} tone={STOCK_STATE[p.state].tone} width={72} thin label={`پوشش ${daysText(p.coverageDays)} از هدف ${faDigits(tg.targetDays)} روز`} />}
          </>
        );
      }),
    },
    { key: 'st', label: 'وضعیت', width: '108px', render: cell('st', (p) => <StatePill p={p} />) },
  ];

  return (
    <>
      <PageHeading {...HEAD}>
        <MenuButton label="اقدام‌های دیگر" align="end" items={[
          { label: refresh.isPending ? 'در حال به‌روزرسانی NAV…' : 'به‌روزرسانی NAV', onClick: onRefresh, disabled: refresh.isPending },
          { label: 'خروجی CSV موجودی', onClick: exportCsv },
          'sep',
          { label: 'تعریف صندوق جدید', onClick: () => toast('درخواست تعریف صندوق جدید ثبت شد؛ پس از دریافت مجوز فعال می‌شود', 'info') },
        ]} />
        <button type="button" className="nm-btn" onClick={() => openOrder()}><Icon d={TI.plus} size={17} strokeWidth={2} />ثبت سفارش</button>
      </PageHeading>

      {!summary.isError && (
        <StatStrip loading={!t || !rt} items={t && rt ? [
          {
            label: 'خزانه‌ی ریالی', value: sbn(rt.bank), unit: 'میلیارد تومان',
            note: (rt.main.needValue ?? 0) > 0 ? `نیاز به تأمین ریال ${amt(rt.main.needValue)}` : `آزاد نمادنو ${amt(Math.max(0, rt.main.available))}`,
            trend: isNeed(rt.main.state) ? 'down' : rt.main.state === 'below' ? 'warn' : undefined,
            onClick: () => toggle('rial', 'rial'), active: sel?.kind === 'rial',
          },
          {
            label: 'ارزش صندوق‌ها', value: sbn(t.heldValue), unit: 'میلیارد تومان',
            note: t.unrealizedPnl >= 0 ? `سود تحقق‌نیافته ${amt(t.unrealizedPnl)}` : `زیان تحقق‌نیافته ${amt(-t.unrealizedPnl)}`, trend: t.unrealizedPnl >= 0 ? 'up' : 'down',
          },
          { label: 'تخصیص به کاربران', value: sbn(t.allocatedValue), unit: 'میلیارد تومان', note: `رزرو ${amt(t.reservedValue)} · تعهد ${amt(t.committedValue)}` },
          {
            label: 'موجودی آزاد صندوق‌ها', value: sbn(t.availableValue), unit: 'میلیارد تومان',
            note: `پوشش ${daysText(summary.data?.coverageDays)}${needN ? ` · ${faDigits(needN)} نیاز به خرید` : belowN ? ` · ${faDigits(belowN)} زیر هدف` : ''}`,
            trend: needN ? 'down' : belowN ? 'warn' : undefined,
          },
          {
            label: 'سفارش‌های باز', value: faDigits(t.openOrders), unit: 'سفارش', href: routes.op.orders,
            note: t.dueOrders ? `${faDigits(t.dueOrders)} سررسید تسویه · ${amt(open)}` : open ? `${amt(open)} تومان` : 'سفارش بازی نیست', trend: t.dueOrders ? 'warn' : undefined,
          },
        ] : []} />
      )}

      {needs.length > 0 && (
        <NeedCard rows={needs} pendingRedeem={t?.pendingRedeemValue ?? 0} etaOf={(id) => earliestEta(queue.data, id)}
          selectedKey={sel?.kind === 'need' ? sel.id : null} onSelect={(k) => toggle('need', k)}
          onOrder={(o) => openOrder(o)} onRedeem={(r) => openOrder(redeemAsk(r, list))} />
      )}

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت موجودی" value={filt} onChange={setFilt}
            items={TABS.map((x) => ({ ...x, count: x.key === 'all' ? all.length : count(x.key), hot: x.key === 'need_buy' || x.key === 'below' }))} />
          <span className="grow" />
          <SearchField value={q} onChange={setQ} placeholder="ریال، نام یا نماد صندوق" label="جستجوی ریال و صندوق‌ها" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(x) => x.key} rowLabel={(x) => (x.kind === 'rial' ? RIAL_UI[x.key].name : x.p.name)}
          onRowClick={(x) => toggle(x.kind, x.key)} selectedKey={rowSelKey}
          dimRow={(x) => x.kind === 'fund' && x.p.state === 'inactive'}
          loading={positions.isLoading || rial.isLoading}
          error={positions.isError ? positions.error : rial.isError ? rial.error : undefined}
          onRetry={() => { positions.refetch(); rial.refetch(); }}
          empty={<Empty icon={TI.stock} title="موردی با این فیلترها پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />}
          minWidth={960}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="ردیف" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          <span className="mute">مبالغ به میلیارد تومان · تعهد ریال = حساب آزاد سازمان‌ها، تعهد ریال رزرو = بلاک‌شده برای بسته‌ها</span>
        </TableFoot>
      </Card>

      <Card flush title="جابه‌جایی‌های اخیر" sub="ورود و خروج واحدها از موجودی آزاد"
        actions={<Select label="نوع جابه‌جایی" prefix="نوع" value={moveKind} onChange={setMoveKind} align="end"
          options={[{ key: 'all', label: 'همه' }, ...(Object.keys(MOVE_KIND) as StockMovement['kind'][]).map((k) => ({ key: k, label: MOVE_KIND[k].label }))]} />}>
        <Table
          columns={movementColumns({ fundName: nameOf, orgName, showFund: true })} rows={mpg.rows} rowKey={(m) => m.id} rowLabel={(m) => m.title}
          onRowClick={(m) => toggle('move', m.id)} selectedKey={sel?.kind === 'move' ? sel.id : null}
          loading={moves.isLoading} error={moves.isError ? moves.error : undefined} onRetry={() => moves.refetch()}
          empty={<Empty icon={TI.activity} title="جابه‌جایی‌ای ثبت نشده است" />}
          minWidth={760}
        />
        <TableFoot shown={mpg.rows.length} total={moveRows.length} unit="جابه‌جایی" page={mpg.page} pages={mpg.pages} onPage={mpg.setPage} />
      </Card>

      {selFund && (
        <FundStockInspector key={selFund.fundId} p={selFund} orgName={orgName} onClose={() => setSel(null)}
          onOrder={(o) => openOrder({ fundId: selFund.fundId, ...o })} />
      )}
      {selRial && rial.data && (
        <RialInspector key={selRial} focus={selRial} r={rial.data} onClose={() => setSel(null)} />
      )}
      {selNeed && (
        <NeedInspector key={selNeed.key} row={selNeed} onClose={() => setSel(null)}
          onOrder={(o) => openOrder(o)} onRedeem={(r) => openOrder(redeemAsk(r, list))} />
      )}
      {selMove && <MovementInspector key={selMove.id} m={selMove} fundName={list.find((p) => p.fundId === selMove.fundId)?.name ?? nameOf(selMove.fundId)} orgName={orgName} onClose={() => setSel(null)} />}

      {order && <OrderDialog key={order.key} open onClose={() => setOrder(null)} fundId={order.fundId} side={order.side} amount={order.amount} source={order.source} reason={order.reason} />}
    </>
  );
}

function FundStockInspector({ p, orgName, onClose, onOrder }: {
  p: TreasuryPosition; orgName: (id: string) => string | undefined; onClose: () => void;
  onOrder: (o: { side?: OrderSide; amount?: number; source?: 'manual' | 'suggestion'; reason?: string }) => void;
}) {
  const moves = useStockMovements({ fundId: p.fundId, limit: 5 });
  const queued = p.queuedCount > 0;
  const queue = useStockQueue(p.fundId);
  const active = p.state !== 'inactive';
  const s = p.suggestion;
  return (
    <Inspector
      open onClose={onClose} title="موجودی صندوق" label={`موجودی ${p.name}`} href={routes.op.fund(p.fundId)} hrefLabel="صفحه‌ی صندوق"
      footer={active ? <button type="button" className={s ? 'nm-btn ghost' : 'nm-btn'} onClick={() => onOrder({})}><Icon d={TI.plus} size={16} strokeWidth={2} />ثبت سفارش</button> : undefined}
    >
      <Who
        lead={<FundTile fundId={p.fundId} inactive={!active} size="xl" />}
        title={`${p.name} — ${p.symbol}`}
        sub={p.nav ? <>NAV <span className="num">{money(p.nav)}</span> تومان · تسویه <span className="ltr">{p.settlement}</span></> : 'در انتظار NAV اولیه'}
        pills={<><StatePill p={p} />{CORE_FUNDS.includes(p.fundId) && <Pill tone="primary">صندوق اصلی</Pill>}</>}
      />

      {!active ? (
        <Note tone="mute">این صندوق هنوز فعال نیست؛ پس از راه‌اندازی، موجودی و سفارش‌های آن اینجا نمایش داده می‌شود.</Note>
      ) : (
        <>
          <KeyStats items={[
            ['موجودی', <span key="h" className="num">{amt(p.heldValue)}</span>],
            p.needBuyValue > 0
              ? ['نیاز به خرید', <span key="a" className="num" style={{ color: 'var(--error-text)' }}>{amt(p.needBuyValue)}</span>]
              : ['آزاد', <span key="a" className="num">{amt(Math.max(0, p.availableValue))}</span>],
            ['پوشش', <span key="c" className="num">{daysText(p.coverageDays)}</span>],
          ]} />
          {queued
            ? <NeedNote stack p={p} onOrder={(o) => onOrder(o)} />
            : s && <SuggestionNote stack suggestion={s} onOrder={() => onOrder({ side: s.side, amount: s.amount, source: 'suggestion', reason: s.reason })} />}
          <Section title="تفکیک موجودی"><PositionBreakdown p={p} /></Section>
          {queued && (
            <Section title="صف تأمین" action={<span className="num mute">{faDigits(p.queuedCount)} مورد · {amt(p.queuedValue)}</span>}>
              <QueueList items={queue.data} loading={queue.isLoading} />
            </Section>
          )}
          <Section title="پوشش در برابر هدف"><CoverageBlock p={p} minTarget={minTargetOf(p)} /></Section>
          <Section title="جابه‌جایی‌های اخیر" action={<Link className="nm-more" href={routes.op.fund(p.fundId)}>همه</Link>}>
            {moves.isLoading ? <span className="mute" style={{ fontSize: 12.5 }}>در حال بارگذاری…</span>
              : (moves.data ?? []).length ? (
                <List>
                  {(moves.data ?? []).map((m) => (
                    <ListRow key={m.id} title={MOVE_KIND[m.kind].label} sub={<>{dayTime(m.at)} · {moveActor(m, orgName)}</>}
                      trail={<span className="num" style={{ color: m.units > 0 ? 'var(--success-text)' : undefined }}>{m.units > 0 ? '+' : '−'}{amt(m.value)}</span>} />
                  ))}
                </List>
              ) : <span className="mute" style={{ fontSize: 12.5 }}>جابه‌جایی‌ای برای این صندوق ثبت نشده است</span>}
          </Section>
        </>
      )}
    </Inspector>
  );
}

// ───────────────────────── «نیاز به خرید» ─────────────────────────

/**
 * «ثبت ابطال» to raise free rial for users' sales in the queue: the need (in 10M steps), from the fund with the most free
 * stock above its minimum (the operator can pick another one in the dialog).
 */
function redeemAsk(r: RialTreasury, list: TreasuryPosition[]): OrderAsk {
  const amount = Math.ceil(Math.max(r.main.needValue ?? 0, 1e7) / 1e7) * 1e7;
  const room = (p: TreasuryPosition) => p.availableValue - (p.queuedValue ?? 0) - (p.minTargetValue ?? 0);
  const from = list.filter((p) => p.status === 'active' && !isNeed(p.state) && room(p) > amount).sort((a, b) => room(b) - room(a))[0];
  return {
    fundId: from?.fundId, side: 'redeem', amount, source: 'manual',
    reason: `${faDigits(r.main.queuedCount)} فروش کاربر در صف واریز است؛ با تسویه‌ی این ابطال ریال آزاد نمادنو تأمین می‌شود و فروش‌ها خودکار پرداخت می‌شوند.`,
  };
}

/** Funds (and «ریال») whose queue is larger than what they can cover now — one row each; row → NeedInspector. */
function NeedCard({ rows, pendingRedeem, etaOf, selectedKey, onSelect, onOrder, onRedeem }: {
  rows: NeedRow[]; pendingRedeem: number; etaOf: (id: string) => string | undefined; selectedKey: string | null;
  onSelect: (key: string) => void; onOrder: (o: OrderAsk) => void; onRedeem: (r: RialTreasury) => void;
}) {
  const need = (x: NeedRow) => (x.kind === 'rial' ? x.r.main.needValue ?? 0 : x.p.needBuyValue);
  const covered = (x: NeedRow) => (x.kind === 'rial' ? pendingRedeem >= need(x) : needCovered(x.p));
  const open = rows.filter((x) => !covered(x)).length;
  const columns: Column<NeedRow>[] = [
    {
      key: 'what', label: 'صندوق', width: 'minmax(0, 1.4fr)',
      render: (x) => (x.kind === 'rial'
        ? <Ident lead={<RialTile id="rial" />} title={RIAL_UI.rial.name} sub="فروش کاربران به نمادنو" />
        : <Ident lead={<FundTile fundId={x.p.fundId} />} title={x.p.name} sub={<>تسویه <span className="ltr">{x.p.settlement}</span></>} />),
    },
    {
      key: 'need', label: 'نیاز', width: '128px', col: true,
      render: (x) => (
        <>
          <span className="num" style={{ fontWeight: 600, color: 'var(--error-text)' }}>{amt(need(x))}</span>
          <span className="sm">{x.kind === 'rial' ? 'نیاز به تأمین ریال' : 'نیاز به خرید'}</span>
        </>
      ),
    },
    {
      key: 'queue', label: 'در صف', width: '112px', col: true,
      render: (x) => {
        const n = x.kind === 'rial' ? x.r.main.queuedCount : x.p.queuedCount;
        const v = x.kind === 'rial' ? x.r.main.queuedValue : x.p.queuedValue;
        return <><span className="num">{faDigits(n)} مورد</span><span className="sm num">{amt(v)}</span></>;
      },
    },
    { key: 'by', label: 'تحویل تا', width: '124px', render: (x) => <QueueEta at={x.kind === 'rial' ? etaOf('rial') : x.p.needBy ?? etaOf(x.p.fundId)} /> },
    {
      key: 'cover', label: 'سفارش باز', width: '150px', col: true,
      render: (x) => {
        if (covered(x)) return <Pill tone="success" dot>{x.kind === 'rial' ? 'ابطال باز پوشش می‌دهد' : 'سفارش باز پوشش می‌دهد'}</Pill>;
        const inWay = x.kind === 'rial' ? pendingRedeem : x.p.pendingBuyValue;
        return inWay > 0
          ? <span className="sm">{x.kind === 'rial' ? 'ابطال' : 'صدور'} در راه <span className="num">{amt(inWay)}</span></span>
          : <span style={{ color: 'var(--text-disabled)' }}>—</span>;
      },
    },
    {
      key: 'act', label: '', width: '112px', align: 'end',
      render: (x) => {
        const label = x.kind === 'rial' ? SIDE.redeem : SIDE.buy;
        const go = () => (x.kind === 'rial' ? onRedeem(x.r) : onOrder(buyAsk(x.p)));
        return (
          // not the `sm` class: `.nm-td .sm` (table secondary text) would grey the label; same size inline
          <button type="button" className={covered(x) ? 'nm-btn ghost' : 'nm-btn'} style={{ height: 34, padding: '0 14px', fontSize: 13 }}
            aria-label={`ثبت ${label.label} — ${x.kind === 'rial' ? RIAL_UI.rial.name : x.p.name}`}
            onClick={(e) => { e.stopPropagation(); go(); }}>
            <Icon d={label.d} size={14} />ثبت {label.label}
          </button>
        );
      },
    },
  ];
  return (
    <Card flush title="نیاز به خرید" count={rows.length}
      sub={open ? 'موارد در صف تأمین منتظر موجودی‌اند؛ با تسویه‌ی سفارش، به ترتیب و خودکار تحویل می‌شوند' : 'سفارش‌های باز نیاز صف را پوشش می‌دهند؛ پس از تسویه، صف خودکار تحویل می‌شود'}
      actions={open ? <Pill tone="error" dot>{faDigits(open)} مورد فوری</Pill> : undefined}>
      <Table
        columns={columns} rows={rows} rowKey={(x) => x.key} rowLabel={(x) => `نیاز به خرید ${x.kind === 'rial' ? RIAL_UI.rial.name : x.p.name}`}
        onRowClick={(x) => onSelect(x.key)} selectedKey={selectedKey} minWidth={820}
      />
      <TableFoot shown={rows.length} total={rows.length} unit="مورد">
        <span className="mute">موعد هر مورد = تسویه‌ی صندوق + یک روز کاری · مبالغ به تومان</span>
      </TableFoot>
    </Card>
  );
}

/** One row of «نیاز به خرید»: what to buy (or raise) by when, and the items waiting for it. */
function NeedInspector({ row, onClose, onOrder, onRedeem }: {
  row: NeedRow; onClose: () => void; onOrder: (o: OrderAsk) => void; onRedeem: (r: RialTreasury) => void;
}) {
  const q = useStockQueue(row.kind === 'rial' ? 'rial' : row.p.fundId);
  if (row.kind === 'rial') {
    const m = row.r.main;
    const eta = earliestEta(q.data, 'rial');
    return (
      <Inspector open onClose={onClose} title="صف تأمین ریال" label="صف تأمین ریال — فروش کاربران"
        footer={(
          <>
            <Link href={routes.op.cash} className="nm-btn ghost"><Icon d={TI.cash} size={16} />نقدینگی</Link>
            <button type="button" className="nm-btn" onClick={() => onRedeem(row.r)}><Icon d={SIDE.redeem.d} size={16} />ثبت ابطال</button>
          </>
        )}>
        <Who lead={<RialTile id="rial" size="xl" />} title={RIAL_UI.rial.name} sub="فروش کاربران به نمادنو، در انتظار ریال آزاد" pills={<RialStatePill id="rial" r={row.r} />} />
        <KeyStats items={[
          ['نیاز به تأمین ریال', <span key="n" className="num" style={{ color: 'var(--error-text)' }}>{amt(m.needValue)}</span>],
          ['فروش در صف', <span key="q" className="num">{faDigits(m.queuedCount)} مورد</span>],
          ['ریال آزاد', <span key="a" className="num">{amt(Math.max(0, m.available))}</span>],
        ]} />
        <Note tone="err" icon={TI.wallet}>
          <b style={{ fontWeight: 600 }}>ریال آزاد نمادنو فروش‌های در صف را پوشش نمی‌دهد{eta ? <> · پرداخت تا <QueueEta at={eta} /></> : null}</b>
          <span style={{ display: 'block' }}>با ابطال از صندوقی که بیش از هدف موجودی دارد ریال آزاد تأمین کنید؛ با تسویه‌ی ابطال، فروش‌ها به ترتیب و خودکار پرداخت می‌شوند.</span>
        </Note>
        <Section title="فروش‌های در صف واریز" action={<span className="num mute">{amt(m.queuedValue)} تومان</span>}>
          <QueueList items={q.data} loading={q.isLoading} />
        </Section>
      </Inspector>
    );
  }
  const p = row.p;
  return (
    <Inspector open onClose={onClose} title="صف تأمین" label={`صف تأمین ${p.name}`} href={routes.op.fund(p.fundId)} hrefLabel="صفحه‌ی صندوق"
      footer={<button type="button" className={needCovered(p) ? 'nm-btn ghost' : 'nm-btn'} onClick={() => onOrder(buyAsk(p))}><Icon d={SIDE.buy.d} size={16} />ثبت صدور</button>}>
      <Who lead={<FundTile fundId={p.fundId} size="xl" />} title={`${p.name} — ${p.symbol}`}
        sub={<>تسویه <span className="ltr">{p.settlement}</span> · موعد هر مورد: تسویه + یک روز کاری</>}
        pills={<><StatePill p={p} />{needCovered(p) && <Pill tone="success">سفارش باز پوشش می‌دهد</Pill>}</>} />
      <KeyStats items={[
        ['نیاز به خرید', <span key="n" className="num" style={{ color: 'var(--error-text)' }}>{amt(p.needBuyValue)}</span>],
        ['در صف', <span key="q" className="num">{faDigits(p.queuedCount)} مورد</span>],
        ['موجودی آزاد', <span key="a" className="num">{amt(Math.max(0, p.availableValue))}</span>],
      ]} />
      <NeedNote p={p} />
      <Section title="موارد در صف" action={<span className="num mute">{amt(p.queuedValue)} تومان</span>}>
        <QueueList items={q.data} loading={q.isLoading} />
      </Section>
      <Section title="تفکیک موجودی"><PositionBreakdown p={p} /></Section>
    </Inspector>
  );
}
