'use client';
/** Operator console — platform overview (design: op-overview). */
import { useState } from 'react';
import Link from 'next/link';
import type { LockType } from '@/types/domain';
import { useOpOrganizations, useOpOverview } from '@/api/op';
import { useOrgContracts, useOverviewExt } from '@/api/op-core-extra';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { ICON, LOCK_COL, LkType, PanelState, Segmented, TILES, donut, fb, niceMax, pctFa, signedPct, smooth } from '@/components/op/core/ui';
import { faDigits, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

type Range = '7' | '30' | '90';
const RANGE_LABEL: Record<Range, string> = { '7': '۷ روز', '30': '۳۰ روز', '90': '۹۰ روز' };
const LOCK_ORDER: LockType[] = ['collateral', 'vesting', 'milestone', 'installment', 'legal'];
const LOCK_UNIT: Record<LockType, string> = { collateral: 'قلم', vesting: 'قلم', installment: 'قلم', milestone: 'قرارداد', legal: 'دستور' };

function Spark({ id, pts, col }: { id: string; pts: number[]; col: string }) {
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${i * 10} ${v}`).join(' ');
  return (
    <div dir="ltr" style={{ width: 64, height: 36, flex: 'none' }}>
      <svg viewBox="0 0 80 40" width="64" height="36" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs><linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: `var(${col})`, stopOpacity: 0.22 }} /><stop offset="1" style={{ stopColor: `var(${col})`, stopOpacity: 0 }} /></linearGradient></defs>
        <path d={`${d} L80 40 L0 40 Z`} fill={`url(#sp-${id})`} />
        <path d={d} fill="none" style={{ stroke: `var(${col})` }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function OpOverviewPage() {
  const [range, setRange] = useState<Range>('30');
  const ov = useOpOverview();
  const ext = useOverviewExt(range);
  const orgsQ = useOpOrganizations();
  const contracts = useOrgContracts();

  const heading = (
    <PageHeading title="نمای کلی پلتفرم" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'عملیات' }, { label: 'نمای کلی' }]}>
      <Segmented label="بازه زمانی" value={range} onChange={setRange} options={[['7', '۷ روز'], ['30', '۳۰ روز'], ['90', '۹۰ روز']]} />
    </PageHeading>
  );

  if (ov.isLoading || !ov.data) {
    return (
      <>
        {heading}
        {ov.isError ? <PanelState error={ov.error} onRetry={() => ov.refetch()} /> : <><PanelState loading height={104} /><PanelState loading height={140} /><PanelState loading height={228} /></>}
      </>
    );
  }

  const { stats, funds, lockMix } = ov.data;
  const x = ext.data;
  const orgs = orgsQ.data ?? ov.data.topOrganizations;
  const cx = contracts.data ?? {};
  const activeOrgs = orgs.filter((o) => o.status === 'active').length;
  const spark = x?.deltas.spark ?? [[30, 26, 28, 20, 22, 14, 16, 8, 10], [28, 28, 24, 24, 20, 20, 14, 14, 8], [30, 26, 24, 22, 18, 16, 12, 10, 6], [30, 24, 26, 18, 20, 14, 16, 10, 8]];

  const widgets = [
    { id: 'a', href: routes.op.funds, title: 'AUM تحت مدیریت', value: fb(stats.aum), unit: 'میلیارد تومان', delta: x ? signedPct(x.deltas.aumPct) : '…', ok: true, note: 'نسبت به دوره قبل', col: '--chart-1' },
    { id: 'b', href: routes.op.organizations, title: 'سازمان‌های فعال', value: faDigits(activeOrgs), unit: 'سازمان', delta: x ? '+' + faDigits(x.deltas.newOrgs) : '…', ok: true, note: 'قرارداد جدید', col: '--chart-1' },
    { id: 'c', href: routes.op.users, title: 'کاربران', value: money(stats.users), unit: 'نفر', delta: x ? '+' + money(x.deltas.newUsers) : '…', ok: true, note: 'کاربر جدید', col: '--chart-1' },
    { id: 'd', href: routes.op.requests, title: 'بسته‌های تأییدنشده', value: x ? money(x.unaccepted.count) : '…', unit: 'بسته', delta: 'نیاز به پیگیری', ok: false, note: x ? `${money(x.unaccepted.older7d)} مورد بیش از ۷ روز` : '', col: '--warning-main' },
  ];

  // free / locked across the platform
  const lockedTotal = stats.lockedValue;
  const aumAll = stats.lockedValue + stats.freeValue;
  const lockedPct = aumAll ? (lockedTotal / aumAll) * 100 : 0;
  const mixSum = LOCK_ORDER.reduce((s, k) => s + (lockMix[k] ?? 0), 0) || 1;

  // asset-flow chart
  const inflow = x?.flow.inflow ?? [];
  const outflow = x?.flow.outflow ?? [];
  const n = inflow.length;
  const yMax = niceMax(Math.max(1, ...inflow, ...outflow));
  const px = (i: number) => Math.round((36 + (n > 1 ? (i * 528) / (n - 1) : 0)) * 10) / 10;
  const py = (v: number) => Math.round((116 - (v / yMax) * 108) * 10) / 10;
  const pIn = inflow.map((v, i) => [px(i), py(v)] as [number, number]);
  const pOut = outflow.map((v, i) => [px(i), py(v)] as [number, number]);
  const dIn = smooth(pIn);
  const last = pIn[pIn.length - 1];
  const yGrid = [0, 1, 2, 3, 4].map((i) => ({ y: 8 + i * 27, label: faDigits(String(Math.round(((yMax * (4 - i)) / 4) * 10) / 10), true) }));

  // AUM mix by fund
  const withAum = funds.filter((f) => f.aum > 0);
  const gold = withAum.find((f) => f.id === 'gold')?.aum ?? 0;
  const fixed = withAum.find((f) => f.id === 'fixed')?.aum ?? 0;
  const other = withAum.filter((f) => f.id !== 'gold' && f.id !== 'fixed').reduce((s, f) => s + f.aum, 0);
  const fundSum = gold + fixed + other || 1;
  const mixRows = [
    { name: 'صندوق طلا', v: gold, col: '--warning-main' },
    { name: 'درآمد ثابت', v: fixed, col: '--chart-3' },
    { name: 'سایر صندوق‌ها', v: other, col: '--grey-500' },
  ].filter((m) => m.v > 0);
  const segs = donut(mixRows.map((m) => m.v));

  // top organizations by AUM
  const top = [...orgs].map((o) => ({ o, e: cx[o.id] })).sort((a, b) => (b.e?.aum ?? 0) - (a.e?.aum ?? 0)).slice(0, 5);

  const incidents = x?.services.filter((s) => !s.ok).length ?? 0;
  const nowD = now();

  return (
    <>
      {heading}

      <div style={{ height: 104, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
        {widgets.map((w, i) => (
          <Link key={w.id} href={w.href} className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, color: 'inherit', textDecoration: 'none' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{w.title}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{w.value}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.unit}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span className="lbl" style={{ height: 20, padding: '0 6px', background: w.ok ? 'var(--soft-success)' : 'var(--soft-warning)', color: w.ok ? 'var(--success-text)' : 'var(--warning-text)' }}>{w.delta}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.note}</span>
              </span>
            </div>
            <Spark id={w.id} pts={spark[i] ?? spark[0]} col={w.col} />
          </Link>
        ))}
      </div>

      <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '18px 20px', display: 'flex', alignItems: 'stretch', gap: 20 }}>
        <div style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICON.lock} size={16} /></span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>ارزش دارایی قفل‌شده</span>
            <Link href={routes.op.funds} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>به تفکیک صندوق</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <span className="num" style={{ fontSize: 26, lineHeight: 1.1 }}>{fb(lockedTotal)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>میلیارد تومان</span>
            <span className="lbl" style={{ height: 20, padding: '0 6px', background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>{pctFa(lockedPct)} از AUM</span>
          </div>
          <LockBar free={stats.freeValue} locked={lockedTotal} />
          <div className="lkleg">
            <span><span className="lkdot" />آزاد <b>{fb(stats.freeValue)}</b> میلیارد</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={ICON.lock} size={12} />قفل <b>{fb(lockedTotal)}</b> میلیارد</span>
          </div>
        </div>
        <span style={{ width: 1, background: 'var(--divider)', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          {LOCK_ORDER.map((k) => {
            const share = ((lockMix[k] ?? 0) / mixSum) * 100;
            const count = x?.lockCounts[k];
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span><LkType type={k} /></span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 18, lineHeight: 1.2 }}>{fb((lockedTotal * share) / 100)}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>میلیارد</span></span>
                <span style={{ height: 4, borderRadius: 2, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${share}%`, background: `var(${LOCK_COL[k]})` }} /></span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pctFa(share)}{count !== undefined ? ` · ${money(count)} ${LOCK_UNIT[k]}` : ''}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: 228, flex: 'none', display: 'flex', gap: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>جریان دارایی — {RANGE_LABEL[range]}</h6>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>میلیارد تومان در روز</span>
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 0, borderTop: '2px solid var(--chart-1)' }} />ورودی بسته‌ها</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 0, borderTop: '2px dashed var(--chart-2)' }} />خروجی / برداشت</span>
            </div>
          </div>
          <div dir="ltr" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {n > 0 ? (
              <svg viewBox="0 0 568 124" width="100%" height="124" preserveAspectRatio="none" role="img" aria-label={`جریان دارایی ${RANGE_LABEL[range]}: ورودی ${faDigits(inflow[n - 1], true)} و خروجی ${faDigits(outflow[n - 1], true)} میلیارد در آخرین روز`} style={{ display: 'block', overflow: 'visible', flex: 'none' }}>
                <defs><linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.24 }} /><stop offset="1" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0 }} /></linearGradient></defs>
                {yGrid.map((g) => (
                  <g key={g.y}>
                    <line x1="36" x2="568" y1={g.y} y2={g.y} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" strokeDasharray="3 4" />
                    <text x="28" y={g.y + 3} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>{g.label}</text>
                  </g>
                ))}
                <path d={`${dIn} L${last[0]} 116 L${pIn[0][0]} 116 Z`} fill="url(#g-in)" />
                <path d={smooth(pOut)} fill="none" style={{ stroke: 'var(--chart-2)' }} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={dIn} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <circle cx={last[0]} cy={last[1]} r="4" style={{ fill: 'var(--chart-1)', stroke: 'var(--bg-paper)' }} strokeWidth="2" />
              </svg>
            ) : <div style={{ height: 124 }} />}
            <div style={{ height: 14, paddingLeft: 36, display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: '14px', color: 'var(--text-secondary)' }}>
              {(x?.flow.labels ?? []).map((l, i) => <span key={i}>{l}</span>)}
            </div>
          </div>
        </div>

        <div className="card" style={{ width: 372, flex: 'none', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>ترکیب AUM</h6>
            <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>به تفکیک صندوق</span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mixRows.map((m) => (
                <div key={m.name} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${m.col})`, flex: 'none' }} />
                  <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{pctFa((m.v / fundSum) * 100)}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', width: 84, textAlign: 'left' }}>{fb(m.v, 0)} میلیارد</span>
                </div>
              ))}
            </div>
            <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`ترکیب AUM: ${mixRows.map((m) => m.name + ' ' + pctFa((m.v / fundSum) * 100)).join('، ')}`} style={{ flex: 'none' }}>
              <circle cx="60" cy="60" r="48" fill="none" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="12" />
              {mixRows.map((m, i) => <circle key={m.name} cx="60" cy="60" r="48" fill="none" style={{ stroke: `var(${m.col})` }} strokeWidth="12" strokeDasharray={segs[i].dash} strokeDashoffset={segs[i].off} transform="rotate(-90 60 60)" />)}
              <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="300" style={{ fill: 'var(--text-primary)', fontFamily: 'inherit' }}>{fb(fundSum, 0)}</text>
              <text x="60" y="76" textAnchor="middle" fontSize="11" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>میلیارد تومان</text>
            </svg>
          </div>
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: 24, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 8 }}>
          <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>سازمان‌های برتر</h6>
            <span className="lbl" style={{ background: 'var(--soft-default)', color: 'var(--default-text)' }}>بر اساس AUM</span>
            <Link href={routes.op.organizations} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>همهٔ سازمان‌ها<Icon d={ICON.chevL} size={16} /></Link>
          </div>
          <div style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: '1fr 84px 128px 84px', alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>سازمان</span><span>کارکنان</span><span>AUM</span><span>رشد</span>
          </div>
          {top.map(({ o, e }, i) => {
            const g = e?.growthPct ?? 0;
            return (
              <Link key={o.id} href={routes.op.organization(o.id)} className="hov" style={{ height: 34, flex: 'none', display: 'grid', gridTemplateColumns: '1fr 84px 128px 84px', alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: TILES[i % 5][0], color: TILES[i % 5][1], display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{o.logoLetter}</span>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
                </span>
                <span className="num" style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>{faDigits(o.employees)}</span>
                <span className="num" style={{ fontSize: 13, fontWeight: 400 }}>{e && e.aum > 0 ? fb(e.aum) + ' میلیارد' : '—'}</span>
                <span><span className="lbl" style={{ height: 20, padding: '0 6px', background: g > 0 ? 'var(--soft-success)' : 'var(--soft-default)', color: g > 0 ? 'var(--success-text)' : 'var(--default-text)' }}>{signedPct(g)}</span></span>
              </Link>
            );
          })}
        </div>

        <div className="card" style={{ width: 372, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 12 }}>
          <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>سلامت سرویس‌ها</h6>
            {x && <span className="lbl" style={{ background: incidents ? 'var(--soft-warning)' : 'var(--soft-success)', color: incidents ? 'var(--warning-text)' : 'var(--success-text)' }}>{incidents ? `${faDigits(incidents)} اختلال` : 'همه سالم'}</span>}
            <Link href={routes.op.risk} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>ریسک و تقلب<Icon d={ICON.chevL} size={16} /></Link>
          </div>
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
            {(x?.services ?? []).map((s) => (
              <Link key={s.name} href={routes.op.risk} className="hov" style={{ height: 28, margin: '0 -8px', padding: '0 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'inherit', textDecoration: 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.ok ? 'var(--success-main)' : 'var(--error-main)', boxShadow: `0 0 0 3px ${s.ok ? 'var(--soft-success)' : 'var(--soft-error)'}`, flex: 'none' }} />
                <span style={{ flex: 1, fontWeight: 500, whiteSpace: 'nowrap' }}>{s.name}</span>
                <span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)', width: 48, textAlign: 'right' }}>{s.latencyMs === null ? '—' : `${s.latencyMs}ms`}</span>
                <span className="lbl" style={{ height: 20, padding: '0 6px', background: s.ok ? 'var(--soft-success)' : 'var(--soft-error)', color: s.ok ? 'var(--success-text)' : 'var(--error-text)' }}>{s.ok ? 'سالم' : 'اختلال'}</span>
              </Link>
            ))}
          </div>
          <div style={{ margin: '6px 20px', height: 1, background: 'var(--divider)', flex: 'none' }} />
          <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
            {(x?.feed ?? []).map((e) => (
              <Link key={e.text} href={e.href} className="hov" style={{ height: 26, margin: '0 -8px', padding: '0 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'inherit', textDecoration: 'none' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--${e.tone}-main)`, flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.text}</span>
                <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{relTime(e.at, nowD)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
