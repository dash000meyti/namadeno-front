'use client';
/**
 * /op/funds — «موجودی صندوق‌ها»: the treasury stock. Kit list page: heading («ثبت سفارش», NAV refresh, CSV) → stock stats
 * → funds table (state tabs, search; gold and fixed income first) → inspector (stock breakdown, coverage vs the target
 * band, the suggestion with a prefilled order, recent movements) → recent stock movements (row → movement inspector).
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRefreshNav } from '@/api/op-system-extra';
import {
  useStockMovements, useTreasuryPositions, useTreasurySummary,
  type OrderSide, type StockMovement, type StockState, type TreasuryPosition,
} from '@/api/op-treasury-extra';
import {
  Card, Empty, Ident, Inspector, KeyStats, List, ListRow, MenuButton, Meter, Note, PageHeading, Pill, SearchField, Section,
  Select, StatStrip, Table, TableFoot, Tabs, Toolbar, Who, usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { MOVE_KIND, STOCK_STATE, TI, amt, daysText } from '@/components/op/treasury/ui';
import { dayTime, downloadCsv, errMsg, pctT, raw } from '@/components/op/system/fmt';
import {
  CORE_FUNDS, CoverageBlock, FundTile, MovementInspector, PositionBreakdown, StatePill, SuggestionNote, bnOr, minTargetOf,
  moveActor, movementColumns, samt, sbn, sortPositions, useOrgNames,
} from '@/components/op/funds/stock';
import { faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';

type Filt = 'all' | Exclude<StockState, 'inactive'>;
const TABS: { key: Filt; label: string }[] = [
  { key: 'all', label: 'همه' }, { key: 'shortfall', label: 'کسری' }, { key: 'below', label: 'زیر هدف' },
  { key: 'ok', label: 'متعادل' }, { key: 'surplus', label: 'مازاد' },
];
type MoveFilt = 'all' | StockMovement['kind'];
const PAGE = 10;
const MOVE_PAGE = 8;

type Sel = { kind: 'fund' | 'move'; id: string } | null;
interface OrderPrefill { key: number; fundId?: string; side?: OrderSide; amount?: number; source?: 'manual' | 'suggestion'; reason?: string }

export default function OpFundsPage() {
  const toast = useToast();
  const positions = useTreasuryPositions();
  const summary = useTreasurySummary(30);
  const refresh = useRefreshNav();
  const orgName = useOrgNames();
  const [filt, setFilt] = useState<Filt>('all');
  const [q, setQ] = useState('');
  const [moveKind, setMoveKind] = useState<MoveFilt>('all');
  const moves = useStockMovements({ kind: moveKind, limit: 40 });
  const [sel, setSel] = useState<Sel>(null);
  const [order, setOrder] = useState<OrderPrefill | null>(null);
  const openOrder = (o: Omit<OrderPrefill, 'key'> = {}) => setOrder({ key: Date.now(), ...o });

  const list = useMemo(() => sortPositions(positions.data ?? []), [positions.data]);
  const needle = q.trim();
  const rows = useMemo(() => list.filter((p) => (filt === 'all' || p.state === filt)
    && (!needle || [p.name, p.shortName, p.symbol].some((s) => s.includes(needle)))), [list, filt, needle]);
  const pg = usePaging(rows, PAGE, `${filt}|${needle}`);
  const moveRows = moves.data ?? [];
  const mpg = usePaging(moveRows, MOVE_PAGE, moveKind);
  const count = (s: StockState) => list.filter((p) => p.state === s).length;
  const nameOf = (id: string) => list.find((p) => p.fundId === id)?.shortName ?? id;
  const toggle = (kind: 'fund' | 'move', id: string) => setSel((s) => (s?.kind === kind && s.id === id ? null : { kind, id }));
  const selFund = sel?.kind === 'fund' ? list.find((p) => p.fundId === sel.id) : undefined;
  const selMove = sel?.kind === 'move' ? moveRows.find((m) => m.id === sel.id) : undefined;

  const t = summary.data?.totals;
  const attention = count('shortfall') + count('below');
  const open = t ? t.pendingBuyValue + t.pendingRedeemValue : 0;

  const onRefresh = () => refresh.mutate({}, {
    onSuccess: (r) => toast(`NAV ${faDigits(r.funds.length)} صندوق فعال از هسته معاملات به‌روزرسانی شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const exportCsv = () => {
    if (!list.length) return toast('داده‌ای برای خروجی وجود ندارد', 'info');
    downloadCsv('namadno-treasury-stock', [
      ['صندوق', 'نماد', 'NAV (تومان)', 'واحد موجودی', 'ارزش موجودی', 'تخصیص به کاربران', 'رزرو', 'تعهد بسته‌ها', 'در انتظار ابطال', 'موجودی آزاد', 'صدور در راه', 'پوشش (روز)', 'هدف (روز)', 'وضعیت'],
      ...list.map((p) => [p.name, p.symbol, raw(p.nav), p.heldUnits.toFixed(2), raw(p.heldValue), raw(p.allocatedValue), raw(p.reservedValue), raw(p.committedValue), raw(p.pendingRedeemValue), raw(p.availableValue), raw(p.pendingBuyValue), p.coverageDays ?? '', p.target?.targetDays ?? '', STOCK_STATE[p.state].label]),
    ]);
    toast('خروجی موجودی صندوق‌ها (CSV) آماده شد');
  };
  const clear = () => { setFilt('all'); setQ(''); };

  const columns: Column<TreasuryPosition>[] = [
    {
      key: 'fund', label: 'صندوق', width: 'minmax(0, 1.5fr)',
      render: (p) => <Ident lead={<FundTile fundId={p.fundId} inactive={p.state === 'inactive'} />} title={p.name} sub={`${p.symbol} · ${p.state === 'inactive' ? 'غیرفعال' : CORE_FUNDS.includes(p.fundId) ? 'صندوق اصلی' : `تسویه ${p.settlement}`}`} />,
    },
    { key: 'nav', label: 'NAV (تومان)', width: '96px', align: 'end', render: (p) => (p.nav ? <span className="num">{money(p.nav)}</span> : bnOr(0)) },
    { key: 'held', label: 'موجودی', width: '72px', align: 'end', render: (p) => <span className="num" style={{ fontWeight: 600 }}>{bnOr(p.heldValue)}</span> },
    { key: 'alloc', label: 'تخصیص', width: '68px', align: 'end', render: (p) => <span className="num">{bnOr(p.allocatedValue)}</span> },
    { key: 'res', label: 'رزرو', width: '60px', align: 'end', render: (p) => <span className="num mute">{bnOr(p.reservedValue)}</span> },
    { key: 'com', label: 'تعهد', width: '56px', align: 'end', render: (p) => <span className="num mute">{bnOr(p.committedValue)}</span> },
    {
      key: 'free', label: 'آزاد', width: '84px', align: 'end', col: true, render: (p) => (
        <>
          <span className="num" style={{ fontWeight: 600, color: p.availableValue < 0 ? 'var(--error-text)' : undefined }}>{p.state === 'inactive' ? bnOr(0) : sbn(p.availableValue)}</span>
          {p.pendingBuyValue > 0 && <span className="sm">در راه <span className="num">{sbn(p.pendingBuyValue)}</span></span>}
        </>
      ),
    },
    {
      key: 'cov', label: 'پوشش', width: '96px', col: true, render: (p) => {
        if (p.state === 'inactive') return bnOr(0);
        const tg = p.target;
        return (
          <>
            <span className="num">{daysText(p.coverageDays)}{tg && <span className="sm"> / {faDigits(tg.targetDays)}</span>}</span>
            {tg && p.coverageDays != null && <Meter value={p.coverageDays / tg.targetDays} tone={STOCK_STATE[p.state].tone} width={72} thin label={`پوشش ${daysText(p.coverageDays)} از هدف ${faDigits(tg.targetDays)} روز`} />}
          </>
        );
      },
    },
    { key: 'st', label: 'وضعیت', width: '76px', render: (p) => <StatePill p={p} /> },
  ];

  return (
    <>
      <PageHeading title="موجودی صندوق‌ها" crumbs={[{ label: 'خزانه' }]}
        sub="واحدهایی که نمادنو در هر صندوق نگه می‌دارد؛ سهم تخصیص‌یافته به کاربران، رزرو، تعهد بسته‌های ارسالی و موجودی آزاد">
        <MenuButton label="اقدام‌های دیگر" align="end" items={[
          { label: refresh.isPending ? 'در حال به‌روزرسانی NAV…' : 'به‌روزرسانی NAV', onClick: onRefresh, disabled: refresh.isPending },
          { label: 'خروجی CSV موجودی', onClick: exportCsv },
          'sep',
          { label: 'تعریف صندوق جدید', onClick: () => toast('درخواست تعریف صندوق جدید ثبت شد؛ پس از دریافت مجوز فعال می‌شود', 'info') },
        ]} />
        <button type="button" className="nm-btn" onClick={() => openOrder()}><Icon d={TI.plus} size={17} strokeWidth={2} />ثبت سفارش</button>
      </PageHeading>

      {!summary.isError && (
        <StatStrip loading={!t} items={t ? [
          {
            label: 'ارزش موجودی', value: sbn(t.heldValue), unit: 'میلیارد تومان',
            note: t.unrealizedPnl >= 0 ? `سود تحقق‌نیافته ${amt(t.unrealizedPnl)}` : `زیان تحقق‌نیافته ${amt(-t.unrealizedPnl)}`, trend: t.unrealizedPnl >= 0 ? 'up' : 'down',
          },
          { label: 'تخصیص به کاربران', value: sbn(t.allocatedValue), unit: 'میلیارد تومان', note: `${pctT(t.heldValue ? (t.allocatedValue / t.heldValue) * 100 : 0, 0)} موجودی · تعهد ${amt(t.committedValue)}` },
          { label: 'رزروشده', value: sbn(t.reservedValue), unit: 'میلیارد تومان', note: `${pctT(t.allocatedValue ? (t.reservedValue / t.allocatedValue) * 100 : 0, 0)} تخصیص‌ها` },
          {
            label: 'موجودی آزاد', value: sbn(t.availableValue), unit: 'میلیارد تومان',
            note: `پوشش ${daysText(summary.data?.coverageDays)}${attention ? ` · ${faDigits(attention)} زیر هدف` : ''}`, trend: attention ? 'warn' : undefined,
          },
          {
            label: 'سفارش‌های باز', value: faDigits(t.openOrders), unit: 'سفارش', href: routes.op.orders,
            note: t.dueOrders ? `${faDigits(t.dueOrders)} سررسید تسویه · ${amt(open)}` : open ? `${amt(open)} تومان` : 'سفارش بازی نیست', trend: t.dueOrders ? 'warn' : undefined,
          },
        ] : []} />
      )}

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت موجودی" value={filt} onChange={setFilt}
            items={TABS.map((x) => ({ ...x, count: x.key === 'all' ? list.length : count(x.key), hot: x.key === 'shortfall' || x.key === 'below' }))} />
          <span className="grow" />
          <SearchField value={q} onChange={setQ} placeholder="نام یا نماد صندوق" label="جستجوی صندوق" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(p) => p.fundId} rowLabel={(p) => p.name}
          onRowClick={(p) => toggle('fund', p.fundId)} selectedKey={sel?.kind === 'fund' ? sel.id : null}
          dimRow={(p) => p.state === 'inactive'}
          loading={positions.isLoading} error={positions.isError ? positions.error : undefined} onRetry={() => positions.refetch()}
          empty={<Empty icon={TI.stock} title="صندوقی با این فیلترها پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />}
          minWidth={900}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="صندوق" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          <span className="mute">مبالغ به میلیارد تومان · پوشش با احتساب صدورهای در راه</span>
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
            ['آزاد', <span key="a" className="num" style={{ color: p.availableValue < 0 ? 'var(--error-text)' : undefined }}>{samt(p.availableValue)}</span>],
            ['پوشش', <span key="c" className="num">{daysText(p.coverageDays)}</span>],
          ]} />
          {s && <SuggestionNote stack suggestion={s} onOrder={() => onOrder({ side: s.side, amount: s.amount, source: 'suggestion', reason: s.reason })} />}
          <Section title="تفکیک موجودی"><PositionBreakdown p={p} /></Section>
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
