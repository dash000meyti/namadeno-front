'use client';
/**
 * /op — command center («نمای کلی»), driven by the treasury summary.
 * Key numbers → what needs action now + stock health per fund → stock flow + cash → managed assets vs target + asset mix
 * → recent activity + top organizations. The former reports page is the «خروجی گزارش» menu (Excel / printable PDF).
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useOpOrganizations } from '@/api/op';
import { useOpActivity, useTreasurySummary, type CashSummary, type StockState, type TreasuryPosition, type TreasurySummary } from '@/api/op-treasury-extra';
import {
  Allocation, Ava, BigNum, Card, Empty, ErrorBlock, KV, Legend, LineChart, List, ListRow, MenuButton, Meter, Note, PageHeading, Pill,
  SkeletonCard, SkeletonRows, Spark, StatStrip, Tabs, Tile,
} from '@/components/panel/kit';
import { ActionQueue } from '@/components/op/overview/ActionQueue';
import { useOverviewExports } from '@/components/op/overview/exports';
import { ACTOR, STOCK_STATE, TI, amt, daysText, fundUi } from '@/components/op/treasury/ui';
import { dec, errMsg, pctT } from '@/components/op/system/fmt';
import { faDigits, jDate, jDayMonth, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

type Range = 7 | 30 | 90;
const RANGES: { key: Range; label: string }[] = [{ key: 7, label: '۷ روز' }, { key: 30, label: '۳۰ روز' }, { key: 90, label: '۹۰ روز' }];
const STATE_RANK: Record<StockState, number> = { shortfall: 0, below: 1, surplus: 2, ok: 3, inactive: 4 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Billions with one decimal for chart axes («۱٫۲»). */
const b1 = (n: number) => dec(n, 1);

/** Toman amount split into a StatStrip value and unit: 585.8e9 → ['۵۸۵٫۸', 'میلیارد تومان']. */
function split(n: number): [string, string] {
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e12) return [s + dec(a / 1e12, 2), 'هزار میلیارد تومان'];
  if (a >= 1e9) return [s + dec(a / 1e9, 1), 'میلیارد تومان'];
  if (a >= 1e6) return [s + dec(a / 1e6, 0), 'میلیون تومان'];
  return [money(n), 'تومان'];
}
const signedAmt = (n: number) => (n > 0 ? '+' : '') + amt(n);

export default function OpOverviewPage() {
  const [range, setRange] = useState<Range>(30);
  const q = useTreasurySummary(range);
  // keep the previous range on screen while the new one loads
  const last = useRef<TreasurySummary | undefined>(undefined);
  useEffect(() => { if (q.data) last.current = q.data; }, [q.data]);
  const s = q.data ?? last.current;
  const exportItems = useOverviewExports(s);

  return (
    <>
      <PageHeading title="نمای کلی" crumbs={[{ label: 'پایش' }]} sub={`${jDate(now())} · خزانه، نقدینگی و کارهای باز در یک نگاه`}>
        <Tabs label="بازه‌ی زمانی" value={range} onChange={setRange} items={RANGES} />
        <MenuButton text="خروجی گزارش" label="خروجی گزارش (Excel یا PDF)" icon={TI.download} items={exportItems} align="end" />
      </PageHeading>

      {s ? <Stats s={s} /> : q.isError ? null : <StatStrip loading items={[]} />}

      <div className="nm-grid c2 stretch">
        <ActionQueue />
        {s ? <StockHealth s={s} /> : q.isError ? <ErrorBlock error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} /> : <SkeletonCard h={420} />}
      </div>

      {s ? (
        <>
          <div className="nm-grid side stretch">
            <FlowCard s={s} />
            <CashCard c={s.cash} />
          </div>
          <div className="nm-grid side stretch">
            <AumCard s={s} />
            <MixCard s={s} />
          </div>
          <div className="nm-grid side stretch">
            <ActivityCard />
            <OrgsCard s={s} />
          </div>
        </>
      ) : !q.isError && (
        <>
          <div className="nm-grid side"><SkeletonCard h={320} /><SkeletonCard h={320} /></div>
          <div className="nm-grid side"><SkeletonCard h={300} /><SkeletonCard h={300} /></div>
        </>
      )}
    </>
  );
}

// ───────────────────────── key numbers ─────────────────────────

function Stats({ s }: { s: TreasurySummary }) {
  const t = s.totals;
  const c = s.cash;
  const weak = s.positions.filter((p) => p.state === 'shortfall' || p.state === 'below');
  const shortfall = weak.some((p) => p.state === 'shortfall');
  const [aumV, aumU] = split(t.heldValue);
  const [freeV, freeU] = split(t.availableValue);
  const [resV, resU] = split(t.reservedValue);
  const [cashV, cashU] = split(c.available);
  const commit = t.committedValue + c.committedRial;
  const [comV, comU] = split(commit);
  const resPct = t.allocatedValue ? (t.reservedValue / t.allocatedValue) * 100 : 0;
  return (
    <StatStrip items={[
      { label: 'دارایی تحت مدیریت', value: aumV, unit: aumU, href: routes.op.planning, note: `${pctT(s.aumTarget.pct, 0)} از هدف ${amt(s.aumTarget.value)}`, trend: s.aumTarget.pct >= 100 ? 'up' : undefined },
      {
        label: 'موجودی آزاد', value: freeV, unit: freeU, href: routes.op.funds,
        note: `پوشش ${daysText(s.coverageDays)}`,
        trend: shortfall ? 'down' : weak.length ? 'warn' : undefined,
      },
      { label: 'رزروشده', value: resV, unit: resU, href: routes.op.funds, note: `${pctT(resPct, 0)} از دارایی کاربران` },
      {
        label: 'نقد در دسترس', value: cashV, unit: cashU, href: routes.op.cash,
        note: c.overdueCount ? `${faDigits(c.overdueCount)} واریز معوق · ${amt(c.overdueAmount)}` : c.expectedCount ? `${faDigits(c.expectedCount)} واریز در راه · ${amt(c.expectedDeposits)}` : 'واریز در انتظاری نیست',
        trend: c.available < 0 ? 'down' : c.overdueCount ? 'warn' : undefined,
      },
      { label: 'تعهدات باز', value: comV, unit: comU, href: routes.op.organizations, note: 'بسته‌های در انتظار پذیرش' },
    ]} />
  );
}

// ───────────────────────── stock health ─────────────────────────

function StockHealth({ s }: { s: TreasurySummary }) {
  const list = s.positions.filter((p) => p.status === 'active')
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.heldValue - a.heldValue);
  const weak = list.filter((p) => p.state === 'shortfall' || p.state === 'below').length;
  return (
    <Card title="سلامت خزانه" more={{ label: 'موجودی صندوق‌ها', href: routes.op.funds }}
      actions={<Pill tone={weak ? 'warning' : 'success'} dot>{weak ? `${faDigits(weak)} صندوق نیازمند صدور` : 'همه در محدوده‌ی هدف'}</Pill>}>
      {list.length ? (
        <List>{list.map((p) => <StockRow key={p.fundId} p={p} />)}</List>
      ) : <Empty icon={TI.stock} title="صندوق فعالی در خزانه نیست" />}
    </Card>
  );
}

function StockRow({ p }: { p: TreasuryPosition }) {
  const u = fundUi(p.fundId);
  const st = STOCK_STATE[p.state];
  const target = p.target?.targetDays;
  const cov = p.coverageDays;
  const covText = cov == null ? 'بدون مصرف' : target ? `${faDigits(Math.min(999, Math.round(cov)))} از ${faDigits(target)} روز` : daysText(cov);
  return (
    <ListRow href={routes.op.fund(p.fundId)} label={`${p.name}: ${st.label}، موجودی آزاد ${amt(p.availableValue)} تومان، پوشش ${covText}`}
      lead={<Tile d={u.d} tone={u.tone} />}
      title={p.shortName}
      sub={p.availableValue < 0 ? `کسری ${amt(-p.availableValue)} تومان` : `آزاد ${amt(p.availableValue)} تومان`}
      trail={(
        <>
          {target && cov != null && <Meter value={cov / target} tone={st.tone} width={56} label={`پوشش ${covText}`} />}
          <span className="num mute" style={{ fontSize: 12.5, minWidth: 64, textAlign: 'left' }}>{covText}</span>
          <Pill tone={st.tone} title={st.hint}>{st.label}</Pill>
        </>
      )}
    />
  );
}

// ───────────────────────── stock flow + cash ─────────────────────────

function FlowCard({ s }: { s: TreasurySummary }) {
  const f = s.flow;
  // label the range from the data on screen (the previous range stays visible while a new one loads)
  const days = f.labels.length;
  const total = { allocated: sum(f.allocated), returned: sum(f.returned), bought: sum(f.bought), redeemed: sum(f.redeemed) };
  // cumulative: what users took from the free stock (net of what came back) vs what orders added (net of redemptions)
  const cum = (xs: number[]) => { let a = 0; return xs.map((v) => (a += v) / 1e9); };
  const used = cum(f.allocated.map((v, i) => v - (f.returned[i] ?? 0)));
  const supplied = cum(f.bought.map((v, i) => v - (f.redeemed[i] ?? 0)));
  const usedTotal = total.allocated - total.returned;
  const suppliedTotal = total.bought - total.redeemed;
  const net = suppliedTotal - usedTotal;
  const lo = Math.min(0, ...used, ...supplied);
  const labels = f.labels.map((d) => jDayMonth(d));
  return (
    <Card title="جریان موجودی" sub={`${faDigits(days)} روز گذشته · تجمعی، میلیارد تومان`}
      actions={<Pill tone={net >= 0 ? 'success' : 'warning'} title="تأمین از صندوق‌ها منهای مصرف خالص کاربران">خالص {signedAmt(net)}</Pill>}>
      {labels.length > 1 ? (
        <LineChart labels={labels} height={220} fmt={b1} min={lo < 0 ? Math.floor(lo) : undefined}
          label={`جریان موجودی ${faDigits(days)} روز گذشته: مصرف خالص کاربران ${amt(usedTotal)} و تأمین از صندوق‌ها ${amt(suppliedTotal)} تومان`}
          series={[
            { name: 'مصرف خالص کاربران', color: 'var(--chart-1)', values: used, area: true },
            { name: 'تأمین از صندوق‌ها', color: 'var(--chart-2)', values: supplied },
          ]} />
      ) : <Empty title="داده‌ای برای این بازه ثبت نشده است" />}
      <Legend items={[
        { label: 'مصرف خالص کاربران', color: 'var(--chart-1)', value: amt(usedTotal) },
        { label: 'تأمین از صندوق‌ها', color: 'var(--chart-2)', value: amt(suppliedTotal) },
      ]} />
      <span className="mute" style={{ fontSize: 12 }}>
        تخصیص {amt(total.allocated)} · بازگشت {amt(total.returned)} · صدور {amt(total.bought)} · ابطال {amt(total.redeemed)}
      </span>
    </Card>
  );
}

function CashCard({ c }: { c: CashSummary }) {
  const [v, u] = split(c.available);
  const minus = (n: number) => <span className="num">{n ? `−${amt(n)}` : '—'}</span>;
  return (
    <Card title="نقدینگی" more={{ label: 'جزئیات', href: routes.op.cash }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <span className="nm-col" style={{ gap: 2 }}>
          <span className="mute" style={{ fontSize: 12.5 }}>نقد در دسترس برای صدور</span>
          <BigNum value={v} unit={u} style={c.available < 0 ? { color: 'var(--error-text)' } : undefined} />
        </span>
        <Spark values={c.history.map((h) => h.available)} width={96} height={30} label={`روند نقد در دسترس در ${faDigits(c.history.length)} روز گذشته`} />
      </div>
      <KV rows={[
        ['موجودی حساب', <span key="b" className="num">{amt(c.balance)}</span>],
        ['سفارش‌های صدور باز', minus(c.tiedInOrders)],
        ['کیف پول کاربران', minus(c.userWallets)],
        ['تعهد ریالی بسته‌ها', minus(c.committedRial)],
      ]} />
      {c.overdueCount > 0 ? (
        <Note tone="warn" action={<Link href={`${routes.op.cash}?status=overdue`} className="nm-btn sm text">پیگیری</Link>}>
          {faDigits(c.overdueCount)} واریز معوق · {amt(c.overdueAmount)} تومان
        </Note>
      ) : c.expectedCount > 0 ? (
        <Note tone="mute" icon={TI.deposit}>{faDigits(c.expectedCount)} واریز سازمان در راه · {amt(c.expectedDeposits)} تومان</Note>
      ) : null}
    </Card>
  );
}

// ───────────────────────── managed assets + mix ─────────────────────────

function AumCard({ s }: { s: TreasurySummary }) {
  const m = s.aumMonthly;
  const held = s.totals.heldValue;
  const [v, u] = split(held);
  const left = Math.max(0, s.aumTarget.value - held);
  const vals = m.flatMap((x) => [x.aum, x.target ?? x.aum]).map((n) => n / 1e9);
  const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) * 0.9) / 50) * 50) : 0;
  return (
    <Card title="دارایی تحت مدیریت" sub={`هدف ${amt(s.aumTarget.value)} تومان تا ${jDayMonth(s.aumTarget.by, true)}`} more={{ label: 'برنامه‌ریزی و اهداف', href: routes.op.planning }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <BigNum value={v} unit={u} />
        <Pill tone={s.aumTarget.pct >= 100 ? 'success' : 'primary'}>{pctT(s.aumTarget.pct, 0)} از هدف</Pill>
        <span className="mute" style={{ fontSize: 12.5 }}>{left > 0 ? `${amt(left)} تومان تا هدف` : 'هدف امسال محقق شد'}</span>
      </div>
      {m.length > 1 ? (
        <LineChart labels={m.map((x) => x.month)} height={200} min={lo} fmt={(n) => dec(n, 0)}
          label={`دارایی تحت مدیریت از ${m[0].month} تا ${m[m.length - 1].month} در برابر مسیر هدف — میلیارد تومان`}
          series={[
            { name: 'دارایی تحت مدیریت', color: 'var(--chart-1)', values: m.map((x) => x.aum / 1e9), area: true },
            { name: 'مسیر هدف', color: 'var(--chart-4)', values: m.map((x) => (x.target ?? x.aum) / 1e9), dashed: true },
          ]} />
      ) : <Empty title="داده‌ای برای امسال ثبت نشده است" />}
      <Legend items={[{ label: 'دارایی تحت مدیریت', color: 'var(--chart-1)' }, { label: 'مسیر هدف', color: 'var(--chart-4)' }]} />
    </Card>
  );
}

function MixCard({ s }: { s: TreasurySummary }) {
  const name = (id: string) => s.positions.find((p) => p.fundId === id)?.shortName ?? id;
  const keyed = s.mix.filter((x) => x.targetPct != null);
  const rest = s.mix.filter((x) => x.targetPct == null);
  const restValue = sum(rest.map((x) => x.value));
  const restPct = sum(rest.map((x) => x.pct));
  const items = [
    ...keyed.map((x) => ({ label: `${name(x.fundId)} · هدف ${pctT(x.targetPct ?? 0, 0)}`, value: x.value, color: fundUi(x.fundId).col })),
    ...(restValue > 0 ? [{ label: s.otherTargetPct != null ? `سایر صندوق‌ها · هدف ${pctT(s.otherTargetPct, 0)}` : 'سایر صندوق‌ها', value: restValue, color: 'var(--chart-4)' }] : []),
  ];
  const gaps = [...keyed.map((x) => Math.abs(x.pct - (x.targetPct ?? 0))), ...(s.otherTargetPct != null ? [Math.abs(restPct - s.otherTargetPct)] : [])];
  const gap = Math.max(0, ...gaps);
  return (
    <Card title="ترکیب دارایی" more={{ label: 'تنظیم هدف', href: routes.op.planning }}
      actions={<Pill tone={gap <= 5 ? 'success' : 'warning'} dot>{gap <= 5 ? 'هم‌سو با هدف' : `${faDigits(Math.round(gap))} واحد درصد فاصله`}</Pill>}>
      {items.length ? <Allocation items={items} fmt={amt} /> : <Empty title="هنوز دارایی‌ای نگهداری نمی‌شود" />}
      {rest.length > 0 && <span className="mute" style={{ fontSize: 12 }}>سایر صندوق‌ها: {rest.map((x) => name(x.fundId)).join('، ')}</span>}
    </Card>
  );
}

// ───────────────────────── activity + organizations ─────────────────────────

function ActivityCard() {
  const q = useOpActivity({ limit: 6 });
  const items = q.data?.items ?? [];
  const nowD = now();
  return (
    <Card title="فعالیت‌های اخیر" more={{ label: 'همه‌ی فعالیت‌ها', href: routes.op.activity }}>
      {q.isLoading ? <SkeletonRows n={5} /> : q.isError ? <ErrorBlock flat error={q.error} message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !items.length ? (
        <Empty icon={TI.activity} title="فعالیتی ثبت نشده است" />
      ) : (
        <List>
          {items.map((e) => {
            const a = ACTOR[e.actor.kind];
            const org = e.actor.kind !== 'org' && e.orgName && !e.sub?.includes(e.orgName) ? e.orgName : undefined;
            const who = [e.actor.name, org, e.sub].filter(Boolean).join(' · ');
            return (
              <ListRow key={e.id} href={e.href}
                lead={<Tile d={a.d} tone={e.tone} />}
                title={e.title}
                sub={who}
                trail={(
                  <>
                    {e.amount != null && e.amount !== 0 && <span className="num">{amt(Math.abs(e.amount))}</span>}
                    <span className="num mute" style={{ fontSize: 12, minWidth: 64, textAlign: 'left' }}>{relTime(e.at, nowD)}</span>
                  </>
                )}
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}

function OrgsCard({ s }: { s: TreasurySummary }) {
  const orgs = useOpOrganizations();
  const letter = (id: string, name: string) => orgs.data?.find((o) => o.id === id)?.logoLetter ?? name.charAt(0);
  const top = [...s.byOrg].sort((a, b) => b.value - a.value).filter((r) => r.value > 0).slice(0, 5);
  const g = s.growth;
  return (
    <Card title="سازمان‌های برتر" sub={`${faDigits(g.activeOrgs)} سازمان فعال`} more={{ label: 'همه‌ی سازمان‌ها', href: routes.op.organizations }}>
      <List>
        {top.map((r) => (
          <ListRow key={r.orgId} href={routes.op.organization(r.orgId)} label={`${r.orgName}: دارایی اعضا ${amt(r.value)} تومان`}
            lead={<Ava letter={letter(r.orgId, r.orgName)} id={r.orgId} sq />}
            title={r.orgName}
            sub={r.depositsOverdue > 0 ? `واریز معوق ${amt(r.depositsOverdue)}` : r.pendingRecipients ? `${faDigits(r.pendingRecipients)} گیرنده در انتظار پذیرش` : `رزرو ${amt(r.reservedValue)}`}
            trail={<span className="num">{amt(r.value)}</span>}
          />
        ))}
        {s.individualsValue > 0 && (
          <ListRow href={routes.op.users} label={`کاربران مستقل: دارایی صندوقی ${amt(s.individualsValue)} تومان`}
            lead={<Tile d={TI.user} tone="info" />}
            title="کاربران مستقل"
            sub="دارایی صندوقی خارج از سازمان‌ها"
            trail={<span className="num">{amt(s.individualsValue)}</span>}
          />
        )}
      </List>
    </Card>
  );
}
