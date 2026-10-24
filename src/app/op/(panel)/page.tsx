'use client';
/**
 * Operator console — platform overview. Kit overview page: key numbers → locked assets by lock type →
 * asset flow + AUM mix → top organizations + service health and recent events. Period tabs drive the flow and deltas.
 */
import { useState } from 'react';
import type { LockType, Organization } from '@/types/domain';
import { useOpOrganizations, useOpOverview } from '@/api/op';
import { useOrgContracts, useOverviewExt, type OrgContractExt } from '@/api/op-core-extra';
import {
  Allocation, Ava, BigNum, Card, ErrorBlock, FreeLocked, Ident, Legend, LineChart, List, ListRow, Meter, PageHeading, Pill, Section,
  Skel, SkeletonCard, SkeletonRows, StatStrip, Table, Tabs, type Column, type Tone,
} from '@/components/panel/kit';
import { LockTypeChip } from '@/components/ui/LockBar';
import { errMsg, fb, pctFa, signedPct } from '@/components/op/core/ui';
import { faDigits, jDayMonth, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Range = '7' | '30' | '90';
const RANGE_LABEL: Record<Range, string> = { '7': '۷ روز', '30': '۳۰ روز', '90': '۹۰ روز' };
const LOCK_ORDER: LockType[] = ['collateral', 'vesting', 'milestone', 'installment', 'legal'];
const LOCK_UNIT: Record<LockType, string> = { collateral: 'قلم', vesting: 'قلم', installment: 'قلم', milestone: 'قرارداد', legal: 'دستور' };
const LOCK_TONE: Record<LockType, Tone> = { collateral: 'info', vesting: 'warning', installment: 'secondary', milestone: 'primary', legal: 'error' };
const DAY = 86400000;
const bn = (n: number) => `${fb(n)} میلیارد`;
/** Billions with one decimal (chart values are already in billions). */
const b1 = (v: number) => faDigits(String(Math.round(v * 10) / 10), true);
const dot = (color: string) => <i style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: 'none', margin: '0 4px' }} />;

type TopRow = { o: Organization; e?: OrgContractExt };

export default function OpOverviewPage() {
  const [range, setRange] = useState<Range>('30');
  const ov = useOpOverview();
  const ext = useOverviewExt(range);
  const orgsQ = useOpOrganizations();
  const contracts = useOrgContracts();

  const heading = (
    <PageHeading title="نمای کلی پلتفرم" crumbs={[{ label: 'عملیات' }]} sub="دارایی‌ها، سازمان‌ها و سرویس‌های نمادنو در یک نگاه">
      <Tabs label="بازه زمانی" value={range} onChange={setRange} items={[{ key: '7', label: '۷ روز' }, { key: '30', label: '۳۰ روز' }, { key: '90', label: '۹۰ روز' }]} />
    </PageHeading>
  );

  if (ov.isLoading || !ov.data) {
    return (
      <>
        {heading}
        {ov.isError ? <ErrorBlock error={ov.error} message={errMsg(ov.error)} onRetry={() => ov.refetch()} /> : (
          <>
            <StatStrip loading items={[]} />
            <SkeletonCard h={260} />
            <div className="nm-grid side"><SkeletonCard h={300} /><SkeletonCard h={300} /></div>
          </>
        )}
      </>
    );
  }

  const { stats, funds, lockMix } = ov.data;
  const x = ext.data;
  const orgs = orgsQ.data ?? ov.data.topOrganizations;
  const cx = contracts.data ?? {};
  const activeOrgs = orgs.filter((o) => o.status === 'active').length;

  // free / locked across the platform
  const lockedTotal = stats.lockedValue;
  const aumAll = stats.lockedValue + stats.freeValue;
  const lockedPct = aumAll ? (lockedTotal / aumAll) * 100 : 0;
  const mixSum = LOCK_ORDER.reduce((s, k) => s + (lockMix[k] ?? 0), 0) || 1;

  // asset flow (one value per day, the last one is today)
  const inflow = x?.flow.inflow ?? [];
  const outflow = x?.flow.outflow ?? [];
  const n = inflow.length;
  const flowLabels = x && x.flow.labels.length === n ? x.flow.labels : Array.from({ length: n }, (_, i) => jDayMonth(new Date(now().getTime() - (n - 1 - i) * DAY)));

  // AUM mix by fund
  const withAum = funds.filter((f) => f.aum > 0);
  const gold = withAum.find((f) => f.id === 'gold')?.aum ?? 0;
  const fixed = withAum.find((f) => f.id === 'fixed')?.aum ?? 0;
  const other = withAum.filter((f) => f.id !== 'gold' && f.id !== 'fixed').reduce((s, f) => s + f.aum, 0);
  const fundSum = gold + fixed + other;
  const mixRows = [
    { label: 'صندوق طلا', value: gold, color: 'var(--warning-main)' },
    { label: 'درآمد ثابت', value: fixed, color: 'var(--chart-3)' },
    { label: 'سایر صندوق‌ها', value: other, color: 'var(--chart-4)' },
  ].filter((m) => m.value > 0);

  // top organizations by AUM
  const top: TopRow[] = [...orgs].map((o) => ({ o, e: cx[o.id] })).sort((a, b) => (b.e?.aum ?? 0) - (a.e?.aum ?? 0)).slice(0, 5);
  const incidents = x?.services.filter((s) => !s.ok).length ?? 0;
  const nowD = now();

  const topCols: Column<TopRow>[] = [
    { key: 'org', label: 'سازمان', render: ({ o }) => <Ident lead={<Ava letter={o.logoLetter} id={o.id} sq size="sm" />} title={o.name} /> },
    { key: 'emp', label: 'کارکنان', width: '72px', render: ({ o }) => <span className="num mute">{faDigits(o.employees)}</span> },
    { key: 'aum', label: 'AUM', width: '116px', render: ({ e }) => <span className="num">{e && e.aum > 0 ? bn(e.aum) : '—'}</span> },
    { key: 'growth', label: 'رشد', width: '76px', render: ({ e }) => { const g = e?.growthPct ?? 0; return <Pill tone={g > 0 ? 'success' : 'neutral'}>{signedPct(g)}</Pill>; } },
  ];

  return (
    <>
      {heading}

      <StatStrip items={[
        { label: 'AUM تحت مدیریت', value: fb(stats.aum), unit: 'میلیارد تومان', href: routes.op.funds, note: x ? `${signedPct(x.deltas.aumPct)} نسبت به دوره قبل` : '…', trend: x && x.deltas.aumPct > 0 ? 'up' : undefined },
        { label: 'سازمان‌های فعال', value: faDigits(activeOrgs), unit: 'سازمان', href: routes.op.organizations, note: x ? `+${faDigits(x.deltas.newOrgs)} قرارداد جدید` : '…', trend: x && x.deltas.newOrgs > 0 ? 'up' : undefined },
        { label: 'کاربران', value: money(stats.users), unit: 'نفر', href: routes.op.users, note: x ? `+${money(x.deltas.newUsers)} کاربر جدید` : '…', trend: x && x.deltas.newUsers > 0 ? 'up' : undefined },
        { label: 'بسته‌های تأییدنشده', value: x ? money(x.unaccepted.count) : '…', unit: 'بسته', href: routes.op.requests, note: x ? `نیاز به پیگیری · ${money(x.unaccepted.older7d)} مورد بیش از ۷ روز` : '…', trend: 'warn' },
      ]} />

      <Card title="ارزش دارایی رزروشده" actions={<Pill tone="warning">{pctFa(lockedPct)} از AUM</Pill>} more={{ label: 'به تفکیک صندوق', href: routes.op.funds }}>
        <div className="nm-grid side-s" style={{ alignItems: 'center' }}>
          <div className="nm-stack" style={{ gap: 12 }}>
            <BigNum value={fb(lockedTotal)} unit="میلیارد تومان" />
            <FreeLocked free={stats.freeValue} locked={lockedTotal} fmt={bn} />
          </div>
          <List>
            {LOCK_ORDER.map((k) => {
              const share = ((lockMix[k] ?? 0) / mixSum) * 100;
              const count = x?.lockCounts[k];
              return (
                <ListRow key={k}
                  lead={<span style={{ width: 84, flex: 'none' }}><LockTypeChip type={k} /></span>}
                  title={<span className="num" style={{ fontWeight: 500 }}>{bn((lockedTotal * share) / 100)}</span>}
                  sub={count !== undefined ? `${money(count)} ${LOCK_UNIT[k]}` : undefined}
                  trail={<><Meter value={share / 100} tone={LOCK_TONE[k]} width={120} label={`${LOCK_META[k].label}: ${pctFa(share)} دارایی رزروشده`} /><span className="num mute" style={{ width: 36, textAlign: 'left', fontSize: 12.5 }}>{pctFa(share)}</span></>}
                />
              );
            })}
          </List>
        </div>
      </Card>

      <div className="nm-grid side">
        <Card title={`جریان دارایی — ${RANGE_LABEL[range]}`} sub="میلیارد تومان در روز"
          actions={<Legend items={[{ label: 'ورودی بسته‌ها', color: 'var(--chart-1)' }, { label: 'خروجی / برداشت', color: 'var(--chart-2)' }]} />}>
          {n > 0 ? (
            <LineChart
              labels={flowLabels} height={220} fmt={b1}
              label={`جریان دارایی ${RANGE_LABEL[range]}: ورودی ${faDigits(inflow[n - 1], true)} و خروجی ${faDigits(outflow[n - 1], true)} میلیارد در آخرین روز`}
              series={[
                { name: 'ورودی بسته‌ها', color: 'var(--chart-1)', values: inflow, area: true },
                { name: 'خروجی / برداشت', color: 'var(--chart-2)', values: outflow, dashed: true },
              ]}
            />
          ) : ext.isError ? <ErrorBlock flat error={ext.error} message={errMsg(ext.error)} onRetry={() => ext.refetch()} /> : <Skel h={220} r={12} />}
        </Card>

        <Card title="ترکیب AUM" sub="به تفکیک صندوق">
          <BigNum value={fb(fundSum, 0)} unit="میلیارد تومان" />
          <Allocation items={mixRows} fmt={(v) => `${fb(v, 0)} میلیارد`} />
        </Card>
      </div>

      <div className="nm-grid side">
        <Card flush title="سازمان‌های برتر" sub="بر اساس AUM" more={{ label: 'همهٔ سازمان‌ها', href: routes.op.organizations }}>
          <Table columns={topCols} rows={top} rowKey={({ o }) => o.id} rowHref={({ o }) => routes.op.organization(o.id)} rowLabel={({ o }) => o.name} loading={contracts.isLoading && !contracts.data} />
        </Card>

        <Card title="سلامت سرویس‌ها" more={{ label: 'ریسک و تقلب', href: routes.op.risk }}
          actions={x && <Pill tone={incidents ? 'warning' : 'success'} dot>{incidents ? `${faDigits(incidents)} اختلال` : 'همه سالم'}</Pill>}>
          {!x ? (ext.isError ? <ErrorBlock flat error={ext.error} message={errMsg(ext.error)} onRetry={() => ext.refetch()} /> : <SkeletonRows n={4} />) : (
            <>
              <List>
                {x.services.map((s) => (
                  <ListRow key={s.name} href={routes.op.risk}
                    lead={dot(s.ok ? 'var(--success-main)' : 'var(--error-main)')}
                    title={s.name}
                    trail={<><span className="num mute ltr" style={{ fontSize: 12 }}>{s.latencyMs === null ? '—' : `${faDigits(s.latencyMs)} ms`}</span><Pill tone={s.ok ? 'success' : 'error'}>{s.ok ? 'سالم' : 'اختلال'}</Pill></>}
                  />
                ))}
              </List>
              {x.feed.length > 0 && (
                <Section title="رویدادهای اخیر">
                  <List>
                    {x.feed.map((e) => (
                      <ListRow key={e.text} href={e.href}
                        lead={dot(`var(--${e.tone}-main)`)}
                        title={<span style={{ fontWeight: 500 }}>{e.text}</span>}
                        trail={<span className="num mute" style={{ fontSize: 12 }}>{relTime(e.at, nowD)}</span>}
                      />
                    ))}
                  </List>
                </Section>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
