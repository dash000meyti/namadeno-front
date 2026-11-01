'use client';
/**
 * Operator console — orders to funds («سفارش‌ها»). Kit list page: heading («ثبت سفارش») → stats (open buys, open redeems,
 * due for settlement, settled this month, fees) → treasury suggestions (plan recommendations + position suggestions,
 * one per fund) → orders list (status tabs, side + fund filters, code search, pager) → inspector (details, effect on
 * free stock and coverage, «ثبت تسویه» / «لغو سفارش»).
 * Deep links: ?id=<order id or code> opens the inspector · ?status=placed|due|settled|cancelled|all · ?fund=<fundId>.
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
import { SEVERITY, SIDE, TI, amt, fundUi, isNeed, orderStatus, unitsText } from '@/components/op/treasury/ui';
import { OrderInspector } from '@/components/op/orders/OrderInspector';
import { scaled } from '@/components/op/cash/money';
import { downloadCsv, pctT, raw } from '@/components/op/system/fmt';
import { JALALI_MONTHS, enDigits, faDigits, jDate, money } from '@/lib/format';
import { jParts, jalaliToIsoAny } from '@/lib/jalali';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

type Status = 'placed' | 'due' | 'settled' | 'cancelled' | 'all';
const ORDER_REC_KINDS = new Set<string>(['buy', 'redeem', 'settle', 'rebalance']);
const STATUSES: Status[] = ['placed', 'due', 'settled', 'cancelled', 'all'];
const PAGE = 10;
const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const HEAD = { title: 'سفارش‌ها', crumbs: [{ label: 'خزانه' }], sub: 'سفارش‌های نمادنو به صندوق‌ها: «صدور» برای خرید واحد و «ابطال» برای بازگرداندن واحد به صندوق' };

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
  const linkStatus = sp.get('status') as Status | null;

  const [tab, setTab] = useState<Status>(() => (linkStatus && STATUSES.includes(linkStatus) ? linkStatus : 'placed'));
  const [side, setSide] = useState<OrderSide | 'all'>('all');
  const [fund, setFund] = useState<string>(() => sp.get('fund') ?? 'all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(linkId);
  const [dlg, setDlg] = useState<Prefill | null>(null);
  const seq = useRef(0);

  const allQ = useTreasuryOrders();
  const listQ = useTreasuryOrders({ status: tab, fundId: fund === 'all' ? undefined : fund, side });
  const positions = useTreasuryPositions();
  const plan = useTreasuryPlan(30);

  const all = useMemo(() => allQ.data ?? [], [allQ.data]);
  const pos = useMemo(() => new Map((positions.data ?? []).map((p) => [p.fundId, p])), [positions.data]);
  const short = (id: string) => pos.get(id)?.shortName ?? id;

  // ?id=<order id or code> (fund pages, action queue, activity): open its inspector and switch the list to the tab that
  // holds it, also when a new link arrives while the page stays open. Unknown ids fall back to «همه».
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    if (!linkId || handledLink.current === linkId || !allQ.data) return;
    handledLink.current = linkId;
    const o = allQ.data.find((x) => x.id === linkId || x.code === linkId);
    setSelId(o?.id ?? linkId);
    if (linkStatus && STATUSES.includes(linkStatus)) return;
    setTab(!o ? 'all' : o.status === 'placed' ? (o.dueNow ? 'due' : 'placed') : o.status);
    setSide('all');
    setFund('all');
    setQ('');
  }, [linkId, linkStatus, allQ.data]);

  // ── numbers ──
  const open = all.filter((o) => o.status === 'placed');
  const openBuy = open.filter((o) => o.side === 'buy');
  const openRedeem = open.filter((o) => o.side === 'redeem');
  const due = open.filter((o) => o.dueNow);
  const month = useMemo(() => {
    const p = jParts(now());
    const start = jalaliToIsoAny(p.y, p.m, 1);
    return { name: JALALI_MONTHS[p.m - 1], from: start ? new Date(Date.parse(start) - 12 * 3_600_000).toISOString() : '' };
  }, []);
  const settledMonth = all.filter((o) => o.status === 'settled' && (o.settledAt ?? '') >= month.from);
  const settledSum = sum(settledMonth.map((o) => o.amount));
  const feesMonth = sum(settledMonth.map((o) => o.fee));
  const counts: Record<Status, number> = {
    placed: open.length, due: due.length, settled: all.filter((o) => o.status === 'settled').length,
    cancelled: all.filter((o) => o.status === 'cancelled').length, all: all.length,
  };

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
  /** A cash note of the plan (a link-only recommendation outside the order kinds) — tolerated, not produced any more. */
  const collect = plan.data?.recommendations.find((r) => !ORDER_REC_KINDS.has(r.kind) && r.action.type === 'link');

  // ── list ──
  const needle = enDigits(q.trim()).toLowerCase();
  const rows = useMemo(() => (listQ.data ?? []).filter((o) => !needle || o.code.toLowerCase().includes(needle) || (o.note ?? '').includes(q.trim())), [listQ.data, needle, q]);
  const pg = usePaging(rows, PAGE, `${tab}|${side}|${fund}|${needle}`);
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
  const filterBy = (t: Status, s: OrderSide | 'all' = 'all') => { setTab(t); setSide(s); };
  const isOn = (t: Status, s: OrderSide | 'all' = 'all') => tab === t && side === s && fund === 'all';
  const clear = () => { setTab('all'); setSide('all'); setFund('all'); setQ(''); };

  const exportCsv = () => {
    if (!rows.length) return;
    downloadCsv('namadno-fund-orders', [
      ['کد', 'صندوق', 'نوع', 'مبلغ (تومان)', 'کارمزد', 'واحد', 'NAV', 'وضعیت', 'ثبت', 'سررسید/تسویه', 'ثبت‌کننده', 'منبع'],
      ...rows.map((o) => [o.code, short(o.fundId), SIDE[o.side].label, raw(o.amount), raw(o.fee), o.units, raw(o.navAtSettle ?? o.navAtOrder), orderStatus(o).label,
        jDate(o.placedAt), jDate(o.settledAt ?? o.cancelledAt ?? o.settleAt), o.by, o.source === 'suggestion' ? 'پیشنهاد خزانه' : 'دستی']),
    ]);
    toast(`فایل ${faDigits(rows.length)} سفارش آماده شد`);
  };

  const columns: Column<TreasuryOrder>[] = [
    {
      key: 'code', label: 'سفارش', width: 'minmax(0, 1.3fr)',
      render: (o) => <Ident lead={<Tile d={fundUi(o.fundId).d} tone={fundUi(o.fundId).tone} />} title={<span className="ltr num">{o.code}</span>} sub={short(o.fundId)} />,
    },
    { key: 'side', label: 'نوع', width: '84px', render: (o) => <Pill tone={SIDE[o.side].tone} icon={SIDE[o.side].d}>{SIDE[o.side].label}</Pill> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '136px', render: (o) => <span className="num">{money(o.amount)}</span> },
    { key: 'units', label: 'واحد', width: '92px', render: (o) => <span className="num">{unitsText(o.units)}</span> },
    { key: 'nav', label: 'NAV', width: '100px', render: (o) => <span className="num mute">{money(o.navAtSettle ?? o.navAtOrder)}</span> },
    { key: 'st', label: 'وضعیت', width: '128px', render: (o) => { const s = orderStatus(o); return <Pill tone={s.tone} dot>{s.label}</Pill>; } },
    {
      key: 'date', label: 'تاریخ تسویه', width: '96px',
      render: (o) => <span className="num sm">{o.status === 'settled' && o.settledAt ? jDate(o.settledAt) : o.status === 'cancelled' ? '—' : jDate(o.settleAt)}</span>,
    },
    {
      key: 'by', label: 'ثبت‌کننده', width: 'minmax(0, 1fr)', col: true,
      render: (o) => <><span className="el">{o.by}</span><span className="sm el">{o.source === 'suggestion' ? 'پیشنهاد خزانه' : 'ثبت دستی'}</span></>,
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
          label: 'صدور باز', ...scaled(sum(openBuy.map((o) => o.amount))),
          note: openBuy.length ? `${faDigits(openBuy.length)} سفارش در انتظار تسویه` : 'سفارش بازی نیست',
          onClick: () => filterBy(isOn('placed', 'buy') ? 'all' : 'placed', isOn('placed', 'buy') ? 'all' : 'buy'), active: isOn('placed', 'buy'),
        },
        {
          label: 'ابطال باز', ...scaled(sum(openRedeem.map((o) => o.amount))),
          note: openRedeem.length ? `${faDigits(openRedeem.length)} سفارش در انتظار تسویه` : 'سفارش بازی نیست',
          onClick: () => filterBy(isOn('placed', 'redeem') ? 'all' : 'placed', isOn('placed', 'redeem') ? 'all' : 'redeem'), active: isOn('placed', 'redeem'),
        },
        {
          label: 'سررسید تسویه', value: faDigits(due.length), unit: 'سفارش',
          note: due.length ? `آماده‌ی تسویه · ${amt(sum(due.map((o) => o.amount)))}` : 'سفارشی سررسید نشده',
          trend: due.length ? 'warn' : undefined,
          onClick: () => filterBy(isOn('due') ? 'all' : 'due'), active: isOn('due'),
        },
        {
          label: `تسویه‌شده در ${month.name}`, ...scaled(settledSum),
          note: `${faDigits(settledMonth.length)} سفارش · ${faDigits(settledMonth.filter((o) => o.side === 'buy').length)} صدور، ${faDigits(settledMonth.filter((o) => o.side === 'redeem').length)} ابطال`,
          onClick: () => filterBy(isOn('settled') ? 'all' : 'settled'), active: isOn('settled'),
        },
        {
          label: `کارمزد ${month.name}`, ...scaled(feesMonth),
          note: settledSum ? `${pctT((feesMonth / settledSum) * 100, 2)} از مبلغ تسویه‌شده` : 'بدون تسویه در این ماه',
        },
      ]} />

      <Card title="پیشنهادهای خزانه" count={suggestions.length || undefined} sub="بر پایه‌ی هدف پوشش هر صندوق و پیش‌بینی ۳۰ روز" more={{ label: 'برنامه‌ریزی', href: routes.op.planning }}>
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
                {suggestions.map((s) => {
                  const u = fundUi(s.fundId);
                  const sd = SIDE[s.side];
                  return (
                    <ListRow
                      key={s.key}
                      lead={<Tile d={u.d} tone={u.tone} />}
                      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{sd.label} {short(s.fundId)}<Pill tone={SEVERITY[s.severity].tone}>{SEVERITY[s.severity].label}</Pill><Pill>{s.plan ? 'افق ۳۰ روز' : 'وضعیت فعلی'}</Pill></span>}
                      sub={s.nowAmount ? `${s.reason} نیاز همین حالا: ${amt(s.nowAmount)} تومان.` : s.reason}
                      trail={(
                        <>
                          <span className="nm-col" style={{ alignItems: 'flex-end', gap: 2 }}>
                            <span className="num" style={{ fontWeight: 600 }}>{amt(s.amount)}</span>
                            <span className="mute" style={{ fontSize: 12 }}>تومان</span>
                          </span>
                          <button
                            type="button" className="nm-btn sm line" aria-label={`ثبت سفارش ${sd.label} ${short(s.fundId)}`}
                            onClick={() => openOrder({ fundId: s.fundId, side: s.side, amount: s.amount, source: 'suggestion', recommendationId: s.recId, reason: s.reason })}
                          >
                            ثبت سفارش
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
          <Tabs label="وضعیت سفارش" value={tab} onChange={setTab} items={[
            { key: 'placed', label: 'باز', count: counts.placed },
            { key: 'due', label: 'سررسید تسویه', count: counts.due, hot: true },
            { key: 'settled', label: 'تسویه‌شده', count: counts.settled },
            { key: 'cancelled', label: 'لغوشده', count: counts.cancelled },
            { key: 'all', label: 'همه', count: counts.all },
          ]} />
          <span className="grow" />
          <Select label="نوع سفارش" prefix="نوع" value={side} onChange={setSide} align="end" options={[
            { key: 'all', label: 'همه' }, { key: 'buy', label: SIDE.buy.label }, { key: 'redeem', label: SIDE.redeem.label },
          ]} />
          <Select label="صندوق" prefix="صندوق" icon={TI.stock} value={fund} onChange={setFund} align="end" options={fundOptions} />
          <SearchField value={q} onChange={setQ} placeholder="کد سفارش، مثلاً TR-1042" label="جستجوی کد سفارش" width={210} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(o) => o.id} rowLabel={(o) => `${o.code} · ${SIDE[o.side].label} ${short(o.fundId)}`}
          onRowClick={(o) => setSelId((s) => (s === o.id || s === o.code ? null : o.id))} selectedKey={sel?.id ?? null}
          dimRow={(o) => o.status === 'cancelled'}
          loading={listQ.isLoading} error={listQ.isError ? listQ.error : undefined} onRetry={() => listQ.refetch()}
          empty={(
            <Empty
              icon={TI.order}
              title={needle ? 'سفارشی با این کد پیدا نشد' : tab === 'due' ? 'سفارشی سررسید تسویه نیست' : tab === 'placed' ? 'سفارش بازی نیست' : 'سفارشی با این فیلترها نیست'}
              action={(needle || tab !== 'all' || side !== 'all' || fund !== 'all') ? <button type="button" className="nm-btn sm ghost" onClick={clear}>نمایش همه‌ی سفارش‌ها</button> : undefined}
            />
          )}
          minWidth={980}
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
          onPlaced={(o) => { setTab('placed'); setSide('all'); setFund('all'); setQ(''); setSelId(o.id); }}
        />
      )}
    </>
  );
}
