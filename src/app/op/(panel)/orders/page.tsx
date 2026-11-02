'use client';
/**
 * Operator console — orders to funds («سفارش‌ها»): the ledger of executed orders. Cash-first: an order is recorded only
 * when it is done (paid, units in or out of the stock at once), so there is nothing open, due or to settle.
 * Kit list page: heading («ثبت سفارش», CSV) → stats (buys and redemptions this month, fees, treasury suggestions) →
 * treasury suggestions (plan recommendations + position suggestions, one per fund → OrderDialog) → ledger (side tabs
 * «همه / صدور / ابطال», fund filter, code search, pager) → inspector (when it was recorded, units, NAV, fee, cash, effect).
 * Deep links: ?id=<order id or code> opens the inspector · ?side=buy|redeem · ?fund=<fundId> (?status= is ignored).
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useTreasuryOrders, useTreasuryPlan, useTreasuryPositions, type OrderSide, type Severity, type TreasuryOrder,
} from '@/api/op-treasury-extra';
import {
  Card, Empty, ErrorBlock, Ident, List, ListRow, Note, PageHeading, Pill, SearchField, Select, SkeletonRows, StatStrip,
  Table, TableFoot, Tabs, Tile, Toolbar, usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { SEVERITY, SIDE, TI, amt, fundUi, isNeed, orderAt, thisMonth, unitsText } from '@/components/op/treasury/ui';
import { OrderInspector } from '@/components/op/orders/OrderInspector';
import { scaled } from '@/components/op/cash/money';
import { dayTime, downloadCsv, pctT, raw } from '@/components/op/system/fmt';
import { enDigits, faDigits, jDateTime, money } from '@/lib/format';
import { routes } from '@/lib/routes';

type SideTab = OrderSide | 'all';
/** Recommendation kinds that are orders (a `settle` recommendation is no longer produced and is never shown). */
const ORDER_REC_KINDS = new Set<string>(['buy', 'redeem', 'settle', 'rebalance']);
const SIDES: SideTab[] = ['all', 'buy', 'redeem'];
const PAGE = 10;
const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const SOURCE: Record<TreasuryOrder['source'], string> = { manual: 'ثبت دستی', suggestion: 'پیشنهاد خزانه' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const HEAD = { title: 'سفارش‌ها', crumbs: [{ label: 'خزانه' }], sub: 'دفتر صدور و ابطال واحد نزد صندوق‌ها؛ هر سفارش همان لحظه‌ی ثبت پرداخت و انجام می‌شود' };

interface Suggestion {
  key: string; fundId: string; side: OrderSide; amount: number; reason: string; severity: Severity; recId?: string; plan: boolean;
  /** The live (position) amount when it differs from the 30-day plan amount for the same side. */
  nowAmount?: number;
}
type Prefill = { n: number; fundId?: string; side?: OrderSide; amount?: number; source?: 'manual' | 'suggestion'; recommendationId?: string; reason?: string };

export default function OpOrdersPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><StatStrip loading items={[]} /></>}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const linkId = sp.get('id');
  const linkSide = sp.get('side') as SideTab | null;

  const [tab, setTab] = useState<SideTab>(() => (linkSide && SIDES.includes(linkSide) ? linkSide : 'all'));
  const [fund, setFund] = useState<string>(() => sp.get('fund') ?? 'all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(linkId);
  const [dlg, setDlg] = useState<Prefill | null>(null);
  const seq = useRef(0);

  const allQ = useTreasuryOrders();
  const positions = useTreasuryPositions();
  const plan = useTreasuryPlan(30);

  // the ledger: every order is recorded when done, newest first (an old cancelled one, if any, is left out)
  const all = useMemo(
    () => (allQ.data ?? []).filter((o) => o.status !== 'cancelled').sort((a, b) => orderAt(b).localeCompare(orderAt(a))),
    [allQ.data],
  );
  const pos = useMemo(() => new Map((positions.data ?? []).map((p) => [p.fundId, p])), [positions.data]);
  const short = (id: string) => pos.get(id)?.shortName ?? id;

  // ?id=<order id or code> (fund pages, activity, notifications): open its inspector and show it in «همه», also when a
  // new link arrives while the page stays open.
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!linkId || handledLink.current === linkId || !allQ.data) return;
    handledLink.current = linkId;
    const o = allQ.data.find((x) => x.id === linkId || x.code === linkId);
    setSelId(o?.id ?? linkId);
    setTab('all');
    setFund('all');
    setQ('');
  }, [linkId, allQ.data]);

  // ── numbers: this month's buys, redemptions and fees ──
  const month = useMemo(() => thisMonth(), []);
  const inMonth = all.filter((o) => orderAt(o) >= month.from);
  const buys = inMonth.filter((o) => o.side === 'buy');
  const redeems = inMonth.filter((o) => o.side === 'redeem');
  const monthSum = sum(inMonth.map((o) => o.amount));
  const feesMonth = sum(inMonth.map((o) => o.fee));

  // ── suggestions: plan recommendations first (they carry an id), then live position suggestions; one per fund ──
  const suggestions = useMemo(() => {
    const out: Suggestion[] = [];
    const seen = new Set<string>();
    for (const r of plan.data?.recommendations ?? []) {
      if (r.action.type !== 'order' || seen.has(r.action.fundId)) continue;
      const { fundId, side: sd, amount } = r.action;
      seen.add(fundId);
      const live = pos.get(fundId)?.suggestion;
      const nowAmount = live && live.side === sd && live.amount !== amount ? live.amount : undefined;
      out.push({ key: r.id, fundId, side: sd, amount, reason: r.reason, severity: r.severity, recId: r.id, plan: true, nowAmount });
    }
    for (const p of positions.data ?? []) {
      if (!p.suggestion || seen.has(p.fundId)) continue;
      seen.add(p.fundId);
      out.push({
        key: `pos-${p.fundId}`, fundId: p.fundId, side: p.suggestion.side, amount: p.suggestion.amount, reason: p.suggestion.reason, plan: false,
        // «نیاز به خرید»: items wait in the queue for this fund's stock
        severity: isNeed(p.state) ? 'critical' : p.state === 'below' ? 'warning' : 'info',
      });
    }
    return out.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }, [plan.data, positions.data, pos]);
  const urgent = suggestions.filter((x) => x.severity === 'critical').length;
  /** A cash note of the plan (a link-only recommendation outside the order kinds) — tolerated, not produced any more. */
  const collect = plan.data?.recommendations.find((r) => !ORDER_REC_KINDS.has(r.kind) && r.action.type === 'link');

  // ── list ──
  const needle = enDigits(q.trim()).toLowerCase();
  const byFund = useMemo(() => all.filter((o) => fund === 'all' || o.fundId === fund), [all, fund]);
  const rows = useMemo(() => byFund.filter((o) => (tab === 'all' || o.side === tab)
    && (!needle || o.code.toLowerCase().includes(needle) || (o.note ?? '').includes(q.trim()))), [byFund, tab, needle, q]);
  const pg = usePaging(rows, PAGE, `${tab}|${fund}|${needle}`);
  const count = (t: SideTab) => (t === 'all' ? byFund.length : byFund.filter((o) => o.side === t).length);
  const sel = all.find((o) => o.id === selId || o.code === selId);
  const fundOptions = useMemo(() => {
    const n = new Map<string, number>();
    all.forEach((o) => n.set(o.fundId, (n.get(o.fundId) ?? 0) + 1));
    const ids = [...new Set([...(positions.data ?? []).filter((p) => p.status === 'active').map((p) => p.fundId), ...n.keys()])];
    return [{ key: 'all', label: 'همه صندوق‌ها', count: all.length }, ...ids.map((id) => ({ key: id, label: pos.get(id)?.name ?? id, count: n.get(id) ?? 0 }))];
  }, [all, positions.data, pos]);

  const openOrder = (p: Omit<Prefill, 'n'> = {}) => { seq.current += 1; setDlg({ ...p, n: seq.current }); };
  const closeInspector = () => {
    setSelId(null);
    if (linkId) router.replace(routes.op.orders, { scroll: false });
  };
  const toggleSide = (t: OrderSide) => setTab((x) => (x === t ? 'all' : t));
  const clear = () => { setTab('all'); setFund('all'); setQ(''); };

  const exportCsv = () => {
    if (!rows.length) return;
    downloadCsv('namadno-fund-orders', [
      ['کد', 'صندوق', 'نوع', 'مبلغ (تومان)', 'واحد', 'NAV', 'کارمزد', 'زمان ثبت', 'ثبت‌کننده', 'منبع', 'یادداشت'],
      ...rows.map((o) => [o.code, short(o.fundId), SIDE[o.side].label, raw(o.amount), o.units, raw(o.navAtSettle ?? o.navAtOrder), raw(o.fee),
        jDateTime(orderAt(o)), o.by, SOURCE[o.source], o.note ?? '']),
    ]);
    toast(`فایل ${faDigits(rows.length)} سفارش آماده شد`);
  };

  const columns: Column<TreasuryOrder>[] = [
    {
      key: 'code', label: 'سفارش', width: 'minmax(0, 1.2fr)',
      render: (o) => <Ident lead={<Tile d={fundUi(o.fundId).d} tone={fundUi(o.fundId).tone} />} title={<span className="ltr num">{o.code}</span>} sub={short(o.fundId)} />,
    },
    { key: 'side', label: 'نوع', width: '84px', render: (o) => <Pill tone={SIDE[o.side].tone} icon={SIDE[o.side].d}>{SIDE[o.side].label}</Pill> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '128px', render: (o) => <span className="num">{money(o.amount)}</span> },
    { key: 'units', label: 'واحد', width: '88px', render: (o) => <span className="num">{unitsText(o.units)}</span> },
    { key: 'nav', label: 'NAV', width: '96px', render: (o) => <span className="num mute">{money(o.navAtSettle ?? o.navAtOrder)}</span> },
    { key: 'fee', label: 'کارمزد', width: '88px', render: (o) => <span className="num mute">{amt(o.fee)}</span> },
    { key: 'at', label: 'ثبت', width: '124px', col: true, render: (o) => <><span className="num">{dayTime(orderAt(o))}</span><span className="sm el">{o.by}</span></> },
    {
      key: 'note', label: 'یادداشت', width: 'minmax(0, 1fr)', col: true,
      render: (o) => <><span className="el">{o.note || '—'}</span><span className="sm el">{SOURCE[o.source]}</span></>,
    },
  ];

  return (
    <>
      <PageHeading {...HEAD}>
        <button type="button" className="nm-btn ghost" onClick={exportCsv} disabled={!rows.length}><Icon d={TI.download} size={17} />خروجی</button>
        <button type="button" className="nm-btn" onClick={() => openOrder()}><Icon d={TI.plus} size={17} strokeWidth={2} />ثبت سفارش</button>
      </PageHeading>

      <StatStrip loading={allQ.isLoading} items={[
        {
          label: `صدور ${month.name}`, ...scaled(sum(buys.map((o) => o.amount))),
          note: buys.length ? `${faDigits(buys.length)} سفارش · ${faDigits(new Set(buys.map((o) => o.fundId)).size)} صندوق` : 'صدوری در این ماه ثبت نشده',
          onClick: () => toggleSide('buy'), active: tab === 'buy',
        },
        {
          label: `ابطال ${month.name}`, ...scaled(sum(redeems.map((o) => o.amount))),
          note: redeems.length ? `${faDigits(redeems.length)} سفارش · ${faDigits(new Set(redeems.map((o) => o.fundId)).size)} صندوق` : 'ابطالی در این ماه ثبت نشده',
          onClick: () => toggleSide('redeem'), active: tab === 'redeem',
        },
        {
          label: `کارمزد ${month.name}`, ...scaled(feesMonth),
          note: monthSum ? `${pctT((feesMonth / monthSum) * 100, 2)} از مبلغ سفارش‌ها` : 'بدون سفارش در این ماه',
        },
        {
          label: 'پیشنهادهای خزانه', value: faDigits(suggestions.length), unit: 'پیشنهاد',
          note: urgent ? `${faDigits(urgent)} فوری · نیاز به خرید` : suggestions.length ? 'برای ماندن در محدوده‌ی هدف' : 'همه در محدوده‌ی هدف',
          trend: urgent ? 'down' : undefined,
        },
      ]} />

      <Card title="پیشنهادهای خزانه" count={suggestions.length || undefined} sub="بر پایه‌ی حداقل و سقف هدف هر صندوق، صف تأمین و پیش‌بینی ۳۰ روز" more={{ label: 'برنامه‌ریزی', href: routes.op.planning }}>
        {(plan.isLoading && positions.isLoading) ? <SkeletonRows n={2} />
          : (plan.isError && positions.isError) ? <ErrorBlock error={plan.error} flat onRetry={() => { plan.refetch(); positions.refetch(); }} />
          : suggestions.length ? (
            <>
              {collect && (
                <Note tone="warn" icon={TI.cash} action={collect.action.type === 'link' ? <Link href={collect.action.href} className="nm-btn sm ghost">نقدینگی</Link> : undefined}>
                  <b>{collect.title}</b> · {collect.reason}
                </Note>
              )}
              <List>
                {suggestions.map((x) => {
                  const u = fundUi(x.fundId);
                  const sd = SIDE[x.side];
                  return (
                    <ListRow
                      key={x.key}
                      lead={<Tile d={u.d} tone={u.tone} />}
                      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{sd.label} {short(x.fundId)}<Pill tone={SEVERITY[x.severity].tone}>{SEVERITY[x.severity].label}</Pill><Pill>{x.plan ? 'افق ۳۰ روز' : 'وضعیت فعلی'}</Pill></span>}
                      sub={x.nowAmount ? `${x.reason} نیاز همین حالا: ${amt(x.nowAmount)} تومان.` : x.reason}
                      trail={(
                        <>
                          <span className="nm-col" style={{ alignItems: 'flex-end', gap: 2 }}>
                            <span className="num" style={{ fontWeight: 600 }}>{amt(x.amount)}</span>
                            <span className="mute" style={{ fontSize: 12 }}>تومان</span>
                          </span>
                          <button
                            type="button" className="nm-btn sm line" aria-label={`ثبت ${sd.label} ${short(x.fundId)}`}
                            onClick={() => openOrder({ fundId: x.fundId, side: x.side, amount: x.amount, source: 'suggestion', recommendationId: x.recId, reason: x.reason })}
                          >
                            ثبت {sd.label}
                          </button>
                        </>
                      )}
                    />
                  );
                })}
              </List>
            </>
          ) : <Note tone="ok">موجودی همه‌ی صندوق‌های فعال در محدوده‌ی هدف است؛ پیشنهادی برای صدور یا ابطال نیست.</Note>}
      </Card>

      <Card flush>
        <Toolbar>
          <Tabs label="نوع سفارش" value={tab} onChange={setTab} items={[
            { key: 'all', label: 'همه', count: count('all') },
            { key: 'buy', label: SIDE.buy.label, count: count('buy') },
            { key: 'redeem', label: SIDE.redeem.label, count: count('redeem') },
          ]} />
          <span className="grow" />
          <Select label="صندوق" prefix="صندوق" icon={TI.stock} value={fund} onChange={setFund} align="end" options={fundOptions} />
          <SearchField value={q} onChange={setQ} placeholder="کد سفارش، مثلاً TR-1042" label="جستجوی کد سفارش" width={210} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(o) => o.id} rowLabel={(o) => `${o.code} · ${SIDE[o.side].label} ${short(o.fundId)}`}
          onRowClick={(o) => setSelId((x) => (x === o.id || x === o.code ? null : o.id))} selectedKey={sel?.id ?? null}
          loading={allQ.isLoading} error={allQ.isError ? allQ.error : undefined} onRetry={() => allQ.refetch()}
          empty={(
            <Empty
              icon={TI.order}
              title={needle ? 'سفارشی با این کد پیدا نشد' : tab !== 'all' || fund !== 'all' ? 'سفارشی با این فیلترها نیست' : 'هنوز سفارشی ثبت نشده است'}
              action={(needle || tab !== 'all' || fund !== 'all') ? <button type="button" className="nm-btn sm ghost" onClick={clear}>نمایش همه‌ی سفارش‌ها</button> : undefined}
            />
          )}
          minWidth={1000}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="سفارش" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          {rows.length > 0 && <span className="num">جمع <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(rows.map((o) => o.amount)))}</b> تومان</span>}
        </TableFoot>
      </Card>

      {sel && <OrderInspector key={`insp-${sel.id}`} order={sel} position={pos.get(sel.fundId)} onClose={closeInspector} />}

      {dlg && (
        <OrderDialog
          key={`order-${dlg.n}`} open onClose={() => setDlg(null)}
          fundId={dlg.fundId} side={dlg.side} amount={dlg.amount} source={dlg.source} recommendationId={dlg.recommendationId} reason={dlg.reason}
          onPlaced={(o) => { setTab('all'); setFund('all'); setQ(''); setSelId(o.id); }}
        />
      )}
    </>
  );
}
