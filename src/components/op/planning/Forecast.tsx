'use client';
/**
 * /op/planning — «پیش‌بینی» tab. Weekly demand vs returns, free stock per fund at the end of the horizon with the
 * suggested orders, recommendations, upcoming events, target progress and the forecast assumptions (read-only).
 * Rows open the kit Inspector; every order goes through the shared OrderDialog (source 'suggestion' when prefilled).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ForecastEvent, FundForecast, Recommendation, TreasuryAssumptions, TreasuryPlan, TreasuryPosition } from '@/api/op-treasury-extra';
import {
  Bars, Card, Empty, Ident, Inspector, KV, KeyStats, Legend, List, ListRow, Meter, Note, Pill, Ring, Section, Select, Table,
  TableFoot, Tile, Toolbar, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { OrderDialog } from '@/components/op/treasury/OrderDialog';
import { EVENT_KIND, SEVERITY, SIDE, STOCK_STATE, TI, amt, buyNowCap, daysText, fundUi } from '@/components/op/treasury/ui';
import { pctT } from '@/components/op/system/fmt';
import { faDigits, jDate, jDayMonth, time } from '@/lib/format';
import { routes } from '@/lib/routes';
import { daysUntil, demandOf, eventEffect, neededText, progressLine, returnsOf, sAmt, tm, totals, untilText, type OrderPrefill } from './shared';

const EVENT_ICON: Record<ForecastEvent['kind'], string> = {
  vesting_release: 'M12 21V11M12 11c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6M12 14c0-2.8-2-5-5-5 0 2.8 2 5 5 5',
  milestone_due: 'M5 21V4M5 4h11l-2 4 2 4H5',
  package_expiry: TI.clock,
  planned_package: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  order_settle: TI.order,
  deposit_due: TI.deposit,
};
const REC_ICON: Record<Recommendation['kind'], string> = { buy: TI.buy, redeem: TI.redeem, collect_deposit: TI.cash, settle: TI.order, rebalance: TI.target };

type Sel = { type: 'fund' | 'event'; id: string } | null;

export function ForecastView({ plan, positions, onTargets }: { plan: TreasuryPlan; positions: TreasuryPosition[]; onTargets: () => void }) {
  const [order, setOrder] = useState<OrderPrefill | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const h = plan.horizon;
  const posOf = (id?: string) => positions.find((p) => p.fundId === id);
  const nameOf = (id?: string) => posOf(id)?.shortName ?? id ?? '';
  const recFor = (fundId: string, side: string) => plan.recommendations.find((r) => r.action.type === 'order' && r.action.fundId === fundId && r.action.side === side);

  const orderSuggested = (ff: FundForecast) => {
    if (!ff.suggestion) return;
    const s = ff.suggestion;
    // the forecast amount is the need over the horizon; the recommendation carries what to order now
    const r = recFor(ff.fundId, s.side);
    const p = posOf(ff.fundId);
    const amount = r?.action.type === 'order' ? r.action.amount : s.side === 'buy' && p ? buyNowCap(p, s.amount) : s.amount;
    setOrder({ key: `s-${ff.fundId}-${s.side}-${Date.now()}`, fundId: ff.fundId, side: s.side, amount, recommendationId: r?.id, source: 'suggestion', reason: r?.reason ?? s.reason });
  };
  const orderRec = (r: Recommendation) => {
    if (r.action.type !== 'order') return;
    setOrder({ key: `r-${r.id}-${Date.now()}`, fundId: r.action.fundId, side: r.action.side, amount: r.action.amount, recommendationId: r.id, source: 'suggestion', reason: r.reason });
  };
  const toggle = (type: 'fund' | 'event', id: string) => setSel((s) => (s?.type === type && s.id === id ? null : { type, id }));

  const fundCols: Column<FundForecast>[] = [
    {
      key: 'fund', label: 'صندوق', width: 'minmax(0, 1.3fr)', render: (f) => {
        const u = fundUi(f.fundId);
        return <Ident lead={<Tile d={u.d} tone={u.tone} />} title={posOf(f.fundId)?.name ?? nameOf(f.fundId)} sub={`پوشش اکنون ${daysText(f.coverageDays)}`} />;
      },
    },
    { key: 'now', label: 'آزاد اکنون', width: '104px', col: true, render: (f) => <><span className="num">{amt(f.availableNow)}</span>{f.pendingBuy > 0 && <span className="sm num">+{amt(f.pendingBuy)} در راه</span>}</> },
    { key: 'flow', label: 'تقاضا / برگشت', width: '116px', col: true, render: (f) => <><span className="num">{sAmt(-f.demand)}</span><span className="sm num">{sAmt(f.returns)}</span></> },
    {
      key: 'end', label: `پایان ${faDigits(h)} روز`, width: '124px', col: true, render: (f) => (
        <>
          <span className="num" style={{ fontWeight: 600, color: f.projectedEnd < 0 ? 'var(--error-text)' : undefined }}>{amt(f.projectedEnd)}</span>
          {f.minTarget > 0 && <Meter value={f.projectedEnd / f.minTarget} tone={STOCK_STATE[f.state].tone} width={88} thin label={`پایان افق نسبت به حداقل هدف: ${faDigits(Math.max(0, Math.round((f.projectedEnd / f.minTarget) * 100)))}٪`} />}
        </>
      ),
    },
    { key: 'min', label: 'حداقل هدف', width: '96px', render: (f) => (f.minTarget > 0 ? <span className="num mute">{amt(f.minTarget)}</span> : <span style={{ color: 'var(--text-disabled)' }}>بدون هدف</span>) },
    { key: 'state', label: 'وضعیت', width: '88px', render: (f) => <Pill tone={STOCK_STATE[f.state].tone} dot title={STOCK_STATE[f.state].hint}>{STOCK_STATE[f.state].label}</Pill> },
    {
      key: 'act', label: '', width: '140px', align: 'end', render: (f) => f.suggestion
        ? (
          <button type="button" className={'nm-btn sm ' + (f.suggestion.side === 'buy' ? 'line' : 'ghost')} onClick={(e) => { e.stopPropagation(); orderSuggested(f); }} aria-label={`ثبت سفارش ${SIDE[f.suggestion.side].label} ${nameOf(f.fundId)} به مبلغ ${tm(f.suggestion.amount)}`}>
            <Icon d={SIDE[f.suggestion.side].d} size={14} />{SIDE[f.suggestion.side].label} {amt(f.suggestion.amount)}
          </button>
        )
        : <span className="sm">بدون نیاز</span>,
    },
  ];

  const selFund = sel?.type === 'fund' ? plan.perFund.find((f) => f.fundId === sel.id) : undefined;
  const selEvent = sel?.type === 'event' ? plan.events.find((e) => e.id === sel.id) : undefined;
  const needs = plan.perFund.filter((f) => f.suggestion).length;

  return (
    <>
      <div className="nm-grid side">
        <FlowCard plan={plan} />
        <RecsCard recs={plan.recommendations} onOrder={orderRec} />
      </div>

      <Card flush title={`موجودی آزاد صندوق‌ها تا ${faDigits(h)} روز آینده`} count={plan.perFund.length} sub={needs ? `${faDigits(needs)} صندوق نیاز به سفارش دارد` : 'موجودی همه‌ی صندوق‌ها در محدوده‌ی هدف است'}>
        <Table
          columns={fundCols} rows={plan.perFund} rowKey={(f) => f.fundId} rowLabel={(f) => posOf(f.fundId)?.name ?? f.fundId}
          onRowClick={(f) => toggle('fund', f.fundId)} selectedKey={sel?.type === 'fund' ? sel.id : null}
          empty={<Empty icon={TI.stock} title="صندوق فعالی برای پیش‌بینی نیست" />} minWidth={880}
        />
        <div className="nm-tfoot"><span>پایان افق = آزاد اکنون + صدور در راه − تقاضا + برگشت · حداقل هدف = بیشترِ «حداقل موجودی» و «تقاضای روزانه × روزهای پوشش»</span></div>
      </Card>

      <div className="nm-grid side">
        <EventsCard events={plan.events} nameOf={nameOf} selectedId={sel?.type === 'event' ? sel.id : null} onPick={(e) => toggle('event', e.id)} />
        <ProgressCard plan={plan} onTargets={onTargets} />
      </div>

      <AssumptionsCard a={plan.assumptions} positions={positions} />

      {selFund && (
        <FundInspector
          key={selFund.fundId} f={selFund} pos={posOf(selFund.fundId)} horizon={h} events={plan.events.filter((e) => e.fundId === selFund.fundId)}
          onClose={() => setSel(null)} onTargets={onTargets}
          onOrder={() => (selFund.suggestion ? orderSuggested(selFund) : setOrder({ key: `m-${selFund.fundId}-${Date.now()}`, fundId: selFund.fundId, source: 'manual' }))}
          onEvent={(e) => setSel({ type: 'event', id: e.id })}
        />
      )}
      {selEvent && <EventInspector key={selEvent.id} e={selEvent} a={plan.assumptions} fundName={posOf(selEvent.fundId)?.name ?? nameOf(selEvent.fundId)} onClose={() => setSel(null)} />}
      {order && (
        <OrderDialog
          key={order.key} open onClose={() => setOrder(null)}
          fundId={order.fundId} side={order.side} amount={order.amount} source={order.source} recommendationId={order.recommendationId} reason={order.reason}
        />
      )}
    </>
  );
}

// ───────────── weekly flow ─────────────

function FlowCard({ plan }: { plan: TreasuryPlan }) {
  const t = totals(plan.buckets);
  const short = plan.buckets.length > 6;
  const rows = plan.buckets.map((b, i) => ({ label: short ? faDigits(i + 1) : b.label, d: demandOf(b), r: returnsOf(b) }));
  const surplus = rows.some((x) => x.r > x.d);
  const series = [
    { name: 'پوشش با برگشت‌ها', color: 'var(--chart-2)' },
    { name: 'برداشت خالص از موجودی', color: 'var(--warning-main)' },
    ...(surplus ? [{ name: 'افزایش خالص موجودی', color: 'var(--chart-1)' }] : []),
  ];
  const data = rows.map((x) => ({ label: x.label, values: [Math.min(x.d, x.r), Math.max(0, x.d - x.r), ...(surplus ? [Math.max(0, x.r - x.d)] : [])] }));
  const net = t.returns - t.demand;
  return (
    <Card title="تقاضا و برگشت هفتگی" sub={short ? 'هر ستون یک هفته از امروز؛ ارتفاع ستون تقاضای همان هفته است' : 'ارتفاع هر ستون تقاضای همان هفته است'} actions={<Pill tone={net < 0 ? 'warning' : 'success'}>خالص {sAmt(net)}</Pill>}>
      <Bars data={data} series={series} height={190} fmt={amt} label={`تقاضا و برگشت موجودی آزاد در ${faDigits(plan.horizon)} روز آینده، به تفکیک هفته`} />
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
      <div className="nm-grid c2" style={{ gap: 16 }}>
        <Section title="برداشت از موجودی" action={<b className="num" style={{ color: 'var(--text-primary)' }}>{tm(t.demand)}</b>}>
          <KV rows={[
            ['بسته‌های تازه و برنامه‌ریزی‌شده', <span key="p" className="num">{amt(t.newPackages)}</span>],
            ['خرید کاربران', <span key="b" className="num">{amt(t.userBuys)}</span>],
          ]} />
        </Section>
        <Section title="برگشت به موجودی" action={<b className="num" style={{ color: 'var(--text-primary)' }}>{tm(t.returns)}</b>}>
          <KV rows={[
            ['فروش کاربران', <span key="s" className="num">{amt(t.userSells)}</span>],
            ['فروش پس‌انداز آزادشده', <span key="v" className="num">{amt(t.vestingSellBack)}</span>],
            ['بازپس‌گیری و پایان مهلت', <span key="r" className="num">{amt(t.reclaims)}</span>],
          ]} />
        </Section>
      </div>
      {t.commitments > 0 && (
        <Note tone="mute">{tm(t.commitments)} از بسته‌های ارسال‌شده در انتظار پذیرش است؛ این مبلغ پیش‌تر از موجودی آزاد کنار گذاشته شده و در تقاضا دوباره شمرده نمی‌شود.</Note>
      )}
    </Card>
  );
}

// ───────────── recommendations ─────────────

function RecsCard({ recs, onOrder }: { recs: Recommendation[]; onOrder: (r: Recommendation) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? recs : recs.slice(0, 4);
  return (
    <Card title="پیشنهادها" count={recs.length || undefined} sub="بر اساس پیش‌بینی و اهداف" more={recs.length > 4 ? { label: all ? 'کمتر' : 'همه', onClick: () => setAll((v) => !v) } : undefined}>
      {recs.length ? (
        <div className="nm-list">
          {shown.map((r) => {
            const sv = SEVERITY[r.severity];
            return (
              <div key={r.id} className="nm-li" style={{ alignItems: 'flex-start', padding: '12px 0' }}>
                <Tile d={REC_ICON[r.kind]} tone={sv.tone} />
                <span className="nm-col" style={{ gap: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <b className="nm-el">{r.title}</b>
                    {r.amount != null && <span className="num mute" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{amt(r.amount)}</span>}
                    <span style={{ marginRight: 'auto' }}><Pill tone={sv.tone}>{sv.label}</Pill></span>
                  </span>
                  <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>{r.reason}</span>
                  <span style={{ marginTop: 4 }}>
                    {r.action.type === 'order'
                      ? <button type="button" className={'nm-btn sm ' + (r.severity === 'critical' ? '' : 'line')} onClick={() => onOrder(r)}><Icon d={SIDE[r.action.side].d} size={14} />ثبت سفارش {SIDE[r.action.side].label}</button>
                      : <Link className="nm-btn sm text" href={r.action.href}>مشاهده<Icon d={TI.chevL} size={14} /></Link>}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : <Empty icon={TI.check} tone="success" title="پیشنهادی نیست" sub="موجودی و نقدینگی با پیش‌بینی این افق هم‌خوان است." />}
    </Card>
  );
}

// ───────────── upcoming events ─────────────

function EventsCard({ events, nameOf, selectedId, onPick }: { events: ForecastEvent[]; nameOf: (id?: string) => string; selectedId: string | null; onPick: (e: ForecastEvent) => void }) {
  const [kind, setKind] = useState<ForecastEvent['kind'] | 'all'>('all');
  const rows = useMemo(() => (kind === 'all' ? events : events.filter((e) => e.kind === kind)), [events, kind]);
  const pg = usePaging(rows, 7, kind);
  const kinds = (Object.keys(EVENT_KIND) as ForecastEvent['kind'][]).filter((k) => events.some((e) => e.kind === k));
  const cols: Column<ForecastEvent>[] = [
    { key: 'at', label: 'تاریخ', width: '104px', col: true, render: (e) => <><span className="num">{jDayMonth(e.at)}</span><span className="sm" style={daysUntil(e.at) < 0 ? { color: 'var(--warning-text)' } : undefined}>{untilText(e.at)}</span></> },
    { key: 'what', label: 'رویداد', width: 'minmax(0, 2fr)', col: true, render: (e) => <><b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{e.title}</b><span className="sm el" style={{ maxWidth: '100%' }}>{[e.orgName, e.fundId && !e.title.includes(nameOf(e.fundId)) ? nameOf(e.fundId) : null].filter(Boolean).join(' · ') || EVENT_KIND[e.kind].label}</span></> },
    { key: 'kind', label: 'نوع', width: '136px', render: (e) => <Pill tone={EVENT_KIND[e.kind].tone}>{EVENT_KIND[e.kind].label}</Pill> },
    { key: 'v', label: 'مبلغ', width: '104px', col: true, render: (e) => <><span className="num">{amt(e.value)}</span>{e.count != null && e.count > 0 && <span className="sm num">{faDigits(e.count)} نفر</span>}</> },
  ];
  return (
    <Card flush title="رویدادهای پیش‌رو" count={events.length || undefined}>
      <Toolbar>
        <span className="grow" />
        <Select label="نوع رویداد" prefix="نوع" value={kind} onChange={setKind} align="end"
          options={[{ key: 'all' as const, label: 'همه', count: events.length }, ...kinds.map((k) => ({ key: k, label: EVENT_KIND[k].label, count: events.filter((e) => e.kind === k).length }))]} />
      </Toolbar>
      <Table
        columns={cols} rows={pg.rows} rowKey={(e) => e.id} rowLabel={(e) => e.title}
        onRowClick={onPick} selectedKey={selectedId}
        empty={<Empty icon={TI.clock} title="رویدادی در این افق نیست" />} minWidth={560}
      />
      <TableFoot shown={pg.rows.length} total={rows.length} unit="رویداد" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
    </Card>
  );
}

// ───────────── target progress + assumptions ─────────────

function ProgressCard({ plan, onTargets }: { plan: TreasuryPlan; onTargets: () => void }) {
  const aum = plan.progress.find((p) => p.key === 'aum');
  const rest = plan.progress.filter((p) => p.key !== 'aum');
  return (
    <Card title="پیشرفت اهداف" more={{ label: 'ویرایش اهداف', onClick: onTargets }}>
      {aum && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Ring value={aum.pct / 100} size={92} stroke={9} color={`var(--${aum.onTrack ? 'success' : 'warning'}-main)`} label={`${aum.label}: ${faDigits(Math.round(aum.pct))}٪ هدف`}>
            <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{faDigits(Math.round(aum.pct))}٪</span>
          </Ring>
          <span className="nm-col" style={{ gap: 4 }}>
            <b style={{ fontSize: 13.5, fontWeight: 600 }}>{aum.label}</b>
            <span className="num" style={{ fontSize: 13 }}>{progressLine(aum)}</span>
            <span className="mute" style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'normal' }}>{[aum.by && `تا ${jDayMonth(aum.by, true)}`, neededText(aum)].filter(Boolean).join(' · ')}</span>
          </span>
        </div>
      )}
      <div className="nm-list">
        {rest.map((p) => {
          const tone: Tone = p.onTrack ? 'success' : 'warning';
          const extra = [p.by && `تا ${jDayMonth(p.by, true)}`, neededText(p)].filter(Boolean).join(' · ');
          return (
            <div key={p.key} className="nm-li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: '10px 0' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</b>
                <span className="num mute" style={{ fontSize: 12, marginRight: 'auto' }}>{progressLine(p)}</span>
              </span>
              <Meter value={p.pct / 100} tone={tone} thin label={`${p.label}: ${faDigits(Math.round(p.pct))}٪`} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="mute" style={{ flex: 1, minWidth: 0 }}>{extra}</span>
                <span style={{ color: `var(--${tone}-text)`, fontWeight: 600 }}>{p.onTrack ? 'در مسیر' : 'نیاز به توجه'}</span>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AssumptionsCard({ a, positions }: { a: TreasuryAssumptions; positions: TreasuryPosition[] }) {
  const active = positions.filter((p) => p.status === 'active' && (a.demandPerDay[p.fundId] || a.returnsPerDay[p.fundId]));
  const main = active.filter((p) => p.fundId === 'gold' || p.fundId === 'fixed');
  const others = active.filter((p) => p.fundId !== 'gold' && p.fundId !== 'fixed');
  const flow = (buy: number, sell: number, k: string) => <span key={k} className="num">خرید {amt(buy)} · فروش {amt(sell)}</span>;
  const split = [pctT(a.defaultSplit.gold, 0), pctT(a.defaultSplit.fixed, 0), ...(a.defaultSplit.rial ? [pctT(a.defaultSplit.rial, 0)] : [])].join(' · ');
  return (
    <Card title="فرض‌های پیش‌بینی" sub="فقط خواندنی · مبنای اعداد این صفحه">
      <div className="nm-grid c3" style={{ gap: 24 }}>
        <Section title="رفتار گیرندگان و کاربران">
          <KV rows={[
            ['پذیرش بسته‌های ارسال‌شده', <span key="a" className="num">{pctT(a.acceptanceRate * 100)}</span>],
            ['فروش پس‌انداز آزادشده', <span key="v" className="num">{pctT(a.vestingSellBackPct * 100)}</span>],
            ['بازپس‌گیری مراحل', <span key="r" className="num">{pctT(a.reclaimRate * 100)}</span>],
          ]} />
        </Section>
        <Section title="بسته‌های تازه">
          <KV rows={[
            ['در هر ماه', <span key="n" className="num">{tm(a.newPackagesPerMonth)}</span>],
            [a.defaultSplit.rial ? 'سهم طلا · درآمد ثابت · ریال' : 'سهم طلا · درآمد ثابت', <span key="s" className="num">{split}</span>],
          ]} />
        </Section>
        <Section title="خرید و فروش روزانه‌ی کاربران">
          <KV rows={[
            ...main.map((p): [string, React.ReactNode] => [p.shortName, flow(a.demandPerDay[p.fundId] ?? 0, a.returnsPerDay[p.fundId] ?? 0, p.fundId)]),
            ...(others.length ? [['سایر صندوق‌ها', flow(others.reduce((s, p) => s + (a.demandPerDay[p.fundId] ?? 0), 0), others.reduce((s, p) => s + (a.returnsPerDay[p.fundId] ?? 0), 0), 'other')] as [string, React.ReactNode]] : []),
          ]} />
        </Section>
      </div>
    </Card>
  );
}

// ───────────── inspectors ─────────────

function FundInspector({ f, pos, horizon, events, onClose, onOrder, onTargets, onEvent }: {
  f: FundForecast; pos?: TreasuryPosition; horizon: number; events: ForecastEvent[];
  onClose: () => void; onOrder: () => void; onTargets: () => void; onEvent: (e: ForecastEvent) => void;
}) {
  const u = fundUi(f.fundId);
  const st = STOCK_STATE[f.state];
  const nowSt = pos ? STOCK_STATE[pos.state] : undefined;
  const name = pos?.name ?? f.fundId;
  return (
    <Inspector
      open onClose={onClose} title="پیش‌بینی صندوق" label={`پیش‌بینی موجودی ${name}`} href={routes.op.fund(f.fundId)} hrefLabel="صفحه‌ی صندوق"
      footer={f.suggestion
        ? <button type="button" className="nm-btn" onClick={onOrder}><Icon d={SIDE[f.suggestion.side].d} size={16} />ثبت سفارش {SIDE[f.suggestion.side].label} {amt(f.suggestion.amount)}</button>
        : <button type="button" className="nm-btn ghost" onClick={onOrder}><Icon d={TI.order} size={16} />ثبت سفارش</button>}
    >
      <Who
        lead={<Tile d={u.d} tone={u.tone} size="xl" />} title={name}
        sub={pos ? <>{pos.symbol} · تسویه <span className="num ltr">{pos.settlement}</span></> : undefined}
        pills={<>{nowSt && <Pill tone={nowSt.tone} dot>اکنون: {nowSt.label}</Pill>}<Pill tone={st.tone} dot>پایان افق: {st.label}</Pill></>}
      />
      <KeyStats items={[['آزاد اکنون', amt(f.availableNow)], [`پایان ${faDigits(horizon)} روز`, amt(f.projectedEnd)], ['پوشش اکنون', daysText(f.coverageDays)]]} />
      <Section title={`جریان موجودی آزاد در ${faDigits(horizon)} روز`}>
        <KV rows={[
          ['موجودی آزاد اکنون', <span key="a" className="num">{tm(f.availableNow)}</span>],
          ['صدور در راه', <span key="p" className="num">{sAmt(f.pendingBuy)}</span>],
          ['تقاضا (بسته‌ها و خرید کاربران)', <span key="d" className="num">{sAmt(-f.demand)}</span>],
          ['برگشت به موجودی', <span key="r" className="num">{sAmt(f.returns)}</span>],
          ['موجودی پایان افق', <b key="e" className="num" style={{ fontWeight: 600, color: f.projectedEnd < 0 ? 'var(--error-text)' : undefined }}>{tm(f.projectedEnd)}</b>],
        ]} />
      </Section>
      <Section title="هدف موجودی">
        {pos?.target ? (
          <>
            <KV rows={[
              ['حداقل موجودی', <span key="m" className="num">{tm(pos.target.minFreeValue)}</span>],
              ['روزهای پوشش هدف', <span key="d" className="num">{faDigits(pos.target.targetDays)} روز</span>],
              ['سقف موجودی', <span key="x" className="num">{pos.target.maxFreeValue ? tm(pos.target.maxFreeValue) : '—'}</span>],
              ['حداقل مؤثر', <span key="e" className="num">{tm(f.minTarget)}</span>],
            ]} />
            {f.minTarget > 0 && <Meter value={f.projectedEnd / f.minTarget} tone={st.tone} label={`پایان افق نسبت به حداقل هدف`} />}
          </>
        ) : (
          <Note tone="mute" action={<button type="button" className="nm-btn sm text" onClick={onTargets}>تعیین هدف</button>}>برای این صندوق هدف موجودی تعیین نشده است.</Note>
        )}
      </Section>
      {f.suggestion && <Note tone={f.suggestion.side === 'buy' ? 'warn' : 'info'} icon={SIDE[f.suggestion.side].d}>{f.suggestion.reason}</Note>}
      {events.length > 0 && (
        <Section title="رویدادهای این صندوق">
          <List>
            {events.slice(0, 5).map((e) => (
              <ListRow key={e.id} onClick={() => onEvent(e)} lead={<Tile d={EVENT_ICON[e.kind]} tone={EVENT_KIND[e.kind].tone} size="sm" />}
                title={e.title} sub={`${jDayMonth(e.at)} · ${untilText(e.at)}`} trail={<span className="num">{amt(e.value)}</span>} />
            ))}
          </List>
        </Section>
      )}
    </Inspector>
  );
}

function EventInspector({ e, a, fundName, onClose }: { e: ForecastEvent; a: TreasuryAssumptions; fundName: string; onClose: () => void }) {
  const k = EVENT_KIND[e.kind];
  const eff = eventEffect(e, a);
  return (
    <Inspector open onClose={onClose} title="رویداد پیش‌رو" label={`جزئیات رویداد ${e.title}`} href={e.href} hrefLabel="مشاهده">
      <Who lead={<Tile d={EVENT_ICON[e.kind]} tone={k.tone} size="xl" />} title={e.title} sub={<><span className="num">{jDate(e.at)}</span> · <span className="num">{time(e.at)}</span> · {untilText(e.at)}</>} pills={<Pill tone={k.tone}>{k.label}</Pill>} />
      <KeyStats items={e.count ? [['مبلغ', amt(e.value)], ['گیرندگان', `${faDigits(e.count)} نفر`], ['تاریخ', jDayMonth(e.at)]] : [['مبلغ', amt(e.value)], ['تاریخ', jDayMonth(e.at)]]} />
      <Section title="اثر بر خزانه">
        <Note tone="mute">{eff.text}</Note>
        {eff.estimate != null && eff.sign && (
          <KV rows={[[eff.sign > 0 ? 'برگشت تخمینی به موجودی آزاد' : 'برداشت تخمینی از موجودی آزاد', <span key="e" className="num">{tm(eff.estimate)}</span>]]} />
        )}
      </Section>
      {(e.orgId || e.fundId) && (
        <Section title="مرتبط">
          <List>
            {e.orgId && <ListRow href={routes.op.organization(e.orgId)} lead={<Tile d={TI.org} tone="secondary" size="sm" />} title={e.orgName ?? 'سازمان'} sub="سازمان" trail={<Icon d={TI.chevL} size={15} />} />}
            {e.fundId && <ListRow href={routes.op.fund(e.fundId)} lead={<Tile d={fundUi(e.fundId).d} tone={fundUi(e.fundId).tone} size="sm" />} title={fundName} sub="صندوق" trail={<Icon d={TI.chevL} size={15} />} />}
          </List>
        </Section>
      )}
    </Inspector>
  );
}
