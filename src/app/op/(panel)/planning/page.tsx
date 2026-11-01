'use client';
/**
 * /op/planning — «برنامه‌ریزی و اهداف». Kit page: heading with the forecast horizon (30/60/90 days) → key numbers of the
 * plan → «پیش‌بینی» (weekly flow, Namadno's free rial, free stock per fund, suggestions, events, target progress,
 * assumptions) and «اهداف» (free rial, stock, managed assets, mix and growth targets as settings with a save bar).
 * Data: useTreasuryPlan(horizon), useTreasuryPositions, useTreasuryTargets / useUpdateTargets (src/api/op-treasury-extra.ts).
 */
import { useEffect, useState } from 'react';
import { useTreasuryPlan, useTreasuryPositions, type Horizon, type TreasuryPlan } from '@/api/op-treasury-extra';
import { ErrorBlock, PageHeading, SkeletonCard, StatStrip, Tabs, type Stat } from '@/components/panel/kit';
import { ForecastView } from '@/components/op/planning/Forecast';
import { TargetsView } from '@/components/op/planning/Targets';
import { amtParts, sAmt, totals, untilText } from '@/components/op/planning/shared';
import { errMsg } from '@/components/op/system/fmt';
import { faDigits } from '@/lib/format';

type View = 'forecast' | 'targets';
const HORIZONS: Horizon[] = [30, 60, 90];

function planStats(plan: TreasuryPlan): Stat[] {
  const t = totals(plan.buckets);
  const net = t.returns - t.demand;
  const buys = plan.recommendations.filter((r) => r.kind === 'buy');
  const buyTotal = buys.reduce((a, r) => a + (r.amount ?? 0), 0);
  const off = plan.progress.filter((p) => !p.onTrack);
  const next = plan.events.find((e) => e.at >= plan.from) ?? plan.events[0];
  const [dv, du] = amtParts(t.demand);
  const [rv, ru] = amtParts(t.returns);
  const [bv, bu] = amtParts(buyTotal);
  return [
    { label: `تقاضای ${faDigits(plan.horizon)} روز آینده`, value: dv, unit: du, note: 'بسته‌های تازه و خرید کاربران' },
    { label: 'برگشت به موجودی', value: rv, unit: ru, note: `خالص ${sAmt(net)} تومان`, trend: net < 0 ? 'warn' : 'up' },
    {
      label: 'صدور پیشنهادی', value: buyTotal ? bv : '—', unit: buyTotal ? bu : undefined,
      note: buys.length ? `برای ${faDigits(buys.length)} صندوق` : 'موجودی صندوق‌ها کافی است', trend: buys.length ? 'warn' : 'up',
    },
    { label: 'رویدادهای پیش‌رو', value: faDigits(plan.events.length), unit: 'رویداد', note: next ? `نزدیک‌ترین: ${untilText(next.at)}` : 'رویدادی در این افق نیست' },
    {
      label: 'اهداف در مسیر', value: faDigits(plan.progress.length - off.length), unit: `از ${faDigits(plan.progress.length)}`,
      note: off.length ? `${faDigits(off.length)} هدف نیاز به توجه دارد` : 'همه‌ی اهداف در مسیرند', trend: off.length ? 'warn' : 'up',
    },
  ];
}

export default function OpPlanningPage() {
  const [h, setH] = useState<Horizon>(30);
  const [view, setView] = useState<View>('forecast');
  const planQ = useTreasuryPlan(h);
  const positions = useTreasuryPositions();
  // keep the previous horizon on screen while the next one loads
  const [kept, setKept] = useState<TreasuryPlan | undefined>();
  useEffect(() => { if (planQ.data) setKept(planQ.data); }, [planQ.data]);
  const plan = planQ.data ?? kept;
  const recs = plan?.recommendations ?? [];

  return (
    <>
      <PageHeading title="برنامه‌ریزی و اهداف" crumbs={[{ label: 'خزانه' }]} sub="پیش‌بینی تقاضای موجودی و نقدینگی، پیشنهاد صدور و ابطال، و اهداف خزانه و رشد">
        {planQ.isFetching && plan && <span className="mute" style={{ fontSize: 12 }}>در حال به‌روزرسانی…</span>}
        <Tabs label="افق پیش‌بینی" value={h} onChange={setH} items={HORIZONS.map((k) => ({ key: k, label: `${faDigits(k)} روز` }))} />
      </PageHeading>

      {planQ.isError && !plan
        ? <ErrorBlock error={planQ.error} message={errMsg(planQ.error)} onRetry={() => planQ.refetch()} />
        : <StatStrip loading={!plan} items={plan ? planStats(plan) : []} />}

      <Tabs label="بخش‌های برنامه‌ریزی" size="lg" value={view} onChange={setView} items={[
        { key: 'forecast', label: 'پیش‌بینی', count: recs.length || undefined, hot: recs.some((r) => r.severity === 'critical') },
        { key: 'targets', label: 'اهداف' },
      ]} />

      {view === 'forecast' && (
        plan && positions.data
          ? <ForecastView plan={plan} positions={positions.data} onTargets={() => setView('targets')} />
          : planQ.isError ? null : <><div className="nm-grid side"><SkeletonCard h={340} /><SkeletonCard h={340} /></div><SkeletonCard h={300} /></>
      )}
      {view === 'targets' && (
        positions.data
          ? <TargetsView positions={positions.data} progress={plan?.progress} />
          : positions.isError ? <ErrorBlock error={positions.error} message={errMsg(positions.error)} onRetry={() => positions.refetch()} /> : <SkeletonCard h={380} />
      )}
    </>
  );
}
