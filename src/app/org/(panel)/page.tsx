'use client';
/** Organization dashboard (design: org-dashboard). */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Skeleton } from '@/components/app/Screen';
import { useDecideOrgRequest, useOrgDashboard, useOrgEmployees, useOrgPackages, useOrgRequests } from '@/api/org';
import { useOrgPeopleInsights, useReopenOrgRequest } from '@/api/org-people-extra';
import { routes } from '@/lib/routes';
import { compactMoney, faDigits, jDate, jDayMonth, money, pct, percent, time } from '@/lib/format';
import type { ApprovalRequest, OrgPackage } from '@/types/domain';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { I, avOf, compactParts, errMsg, tone } from '@/components/org/people/shared';
import './page.css';

const SPARKS: number[][][] = [
  [[0, 30], [10, 26], [20, 28], [30, 20], [40, 22], [50, 14], [60, 16], [70, 8], [80, 10]],
  [[0, 24], [10, 20], [20, 26], [30, 18], [40, 22], [50, 12], [60, 16], [70, 10], [80, 6]],
  [[0, 28], [10, 24], [20, 22], [30, 24], [40, 16], [50, 18], [60, 12], [70, 14], [80, 8]],
  [[0, 30], [10, 28], [20, 24], [30, 26], [40, 18], [50, 20], [60, 12], [70, 14], [80, 8]],
];
const sparkPath = (pts: number[][]) => pts.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + q[1]).join(' ');

const REQ_TYPE: Record<ApprovalRequest['kind'], string> = {
  milestone_release: 'تأیید مرحله قرارداد', loan: 'درخواست وام', cash_withdrawal: 'برداشت نقدی',
  credit_increase: 'افزایش سقف اعتبار', installment: 'خرید اقساطی', profile_change: 'تغییر اطلاعات',
};
const stepNo = (title: string) => /مرحله\s+([0-9۰-۹]+)/.exec(title)?.[1];

export default function OrgDashboardPage() {
  const dash = useOrgDashboard();
  const insights = useOrgPeopleInsights();
  const pkgs = useOrgPackages();
  const reqs = useOrgRequests();
  const emps = useOrgEmployees();
  const decide = useDecideOrgRequest();
  const reopen = useReopenOrgRequest();
  const { show, node: toast } = usePanelToast();
  const [touched, setTouched] = useState<string[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (dash.data) setUpdated(new Date()); }, [dash.data]);

  const d = dash.data;
  const org = d?.organization;
  const ins = insights.data;

  // latest batch: the newest draft waiting for approval, otherwise the newest sent package
  const latest: OrgPackage | undefined = useMemo(() => {
    const list = pkgs.data ?? [];
    const drafts = list.filter((x) => x.status === 'draft').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (drafts[0]) return drafts[0];
    return list.filter((x) => x.sentAt && x.status !== 'cancelled').sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0];
  }, [pkgs.data]);

  const requests = useMemo(() => {
    const all = (reqs.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return all.filter((r) => r.status === 'pending' || touched.includes(r.id)).slice(0, 3);
  }, [reqs.data, touched]);
  const openCount = d?.kpis.pendingRequests ?? (reqs.data ?? []).filter((r) => r.status === 'pending').length;

  const act = (r: ApprovalRequest, approve: boolean) => {
    setBusy(r.id);
    decide.mutate({ id: r.id, approve }, {
      onSuccess: () => {
        setTouched((t) => (t.includes(r.id) ? t : [...t, r.id]));
        if (approve && r.kind === 'milestone_release') show(`مرحله ${stepNo(r.title) ?? ''} قرارداد ${r.requesterName} تأیید شد · ${money(r.amount ?? 0)} تومان آزاد شد`);
        else show(`${REQ_TYPE[r.kind]} ${r.requesterName} ${approve ? 'تأیید شد' : 'رد شد'}`, approve ? 'success' : 'info');
      },
      onError: (e) => show(errMsg(e), 'error'),
      onSettled: () => setBusy(null),
    });
  };
  const undo = (r: ApprovalRequest) => {
    setBusy(r.id);
    reopen.mutate(r.id, {
      onSuccess: () => show(`تصمیم ${REQ_TYPE[r.kind]} ${r.requesterName} بازگردانی شد`, 'info'),
      onError: (e) => show(errMsg(e), 'error'),
      onSettled: () => setBusy(null),
    });
  };

  // KPI widgets
  const widgets = (() => {
    if (!d || !ins) return [];
    const [sentV, sentU] = compactParts(ins.sentThisMonth);
    const [lockV, lockU] = compactParts(d.kpis.lockedAssets);
    const diff = ins.sentLastMonth ? ((ins.sentThisMonth - ins.sentLastMonth) / ins.sentLastMonth) * 100 : null;
    return [
      { title: 'کارکنان فعال', value: faDigits(d.kpis.activeEmployees), unit: 'نفر', delta: '+' + faDigits(ins.newEmployees30d), t: tone('success'), note: 'نسبت به ماه قبل', sc: 'var(--chart-1)', href: routes.org.employees },
      { title: 'بسته‌های این ماه', value: sentV, unit: sentU, delta: diff === null ? '—' : percent(diff, 1, true), t: tone(diff === null || diff >= 0 ? 'success' : 'error'), note: 'نسبت به ' + ins.lastMonthName, sc: 'var(--chart-1)', href: routes.org.packages },
      { title: 'دارایی قفل‌شده پرسنل', value: lockV, unit: lockU, delta: d.kpis.employeeAssets ? pct((d.kpis.lockedAssets / d.kpis.employeeAssets) * 100) : '—', t: tone('warning'), note: 'از کل دارایی', sc: 'var(--warning-main)', href: routes.org.reports },
      { title: 'مراحل در انتظار تأیید', value: faDigits(ins.milestones.count), unit: 'مرحله', delta: 'مرحله‌ای', t: tone('primary'), note: compactMoney(ins.milestones.amount), sc: 'var(--chart-1)', href: routes.org.requests + '?type=milestone_release' },
    ];
  })();

  // allocation donut
  const C = 2 * Math.PI * 56;
  const donut = (() => {
    if (!ins) return { items: [], total: 0 };
    const a = ins.allocation;
    const total = a.gold + a.fixed + a.other;
    let cum = 0;
    const items = [
      { label: 'طلا', v: a.gold, color: 'var(--warning-main)' },
      { label: 'درآمد ثابت', v: a.fixed, color: 'var(--chart-3)' },
      { label: 'ریال و سایر', v: a.other, color: 'var(--chart-4)' },
    ].map((x) => {
      const share = total ? x.v / total : 0;
      const len = C * share;
      const it = { ...x, pct: pct(share * 100), dash: `${Math.max(0, len - 3).toFixed(2)} ${C.toFixed(2)}`, off: (-cum).toFixed(2), show: len > 0 };
      cum += len;
      return it;
    });
    return { items, total };
  })();
  const [donutV, donutU] = compactParts(donut.total);

  // latest batch stepper
  const batch = (() => {
    if (!latest) return null;
    const isDraft = latest.status === 'draft';
    const states: ('done' | 'current' | 'pending')[] = isDraft ? ['done', 'done', 'current', 'pending'] : ['done', 'done', 'done', 'done'];
    const labels = ['بارگذاری لیست', 'اعتبارسنجی', 'تأیید مدیر مالی', 'ارسال به کارکنان'];
    const steps = labels.map((label, i) => {
      const s = states[i];
      const done = s === 'done';
      const cur = s === 'current';
      return {
        label, n: faDigits(i + 1), done,
        bg: done || cur ? 'var(--primary-main)' : 'var(--step-pending)', fg: done || cur ? '#FFFFFF' : 'var(--step-pending-text)', ring: cur ? '0 0 0 4px var(--soft-primary)' : 'none',
        lineR: i === 0 ? 'transparent' : states[i - 1] !== 'pending' && s !== 'pending' ? 'var(--primary-main)' : 'var(--divider)',
        lineL: i === labels.length - 1 ? 'transparent' : done ? 'var(--primary-main)' : 'var(--divider)',
        w: cur ? 700 : done ? 600 : 500, c: cur ? 'var(--primary-text)' : done ? 'var(--text-primary)' : 'var(--text-secondary)',
      };
    });
    const invalid = latest.recipients.filter((r) => emps.data?.find((e) => e.id === r.employeeId)?.status === 'inactive').length;
    const accepted = latest.recipients.filter((r) => r.status === 'accepted').length;
    const waiting = latest.recipients.filter((r) => r.status === 'pending').length;
    return { isDraft, steps, accepted, waiting, invalid };
  })();

  const tiles = org ? [
    { label: 'سقف وام', value: org.settings.loanEnabled ? `${pct(org.settings.loanMaxPct)} دارایی` : 'غیرفعال', d: I.percent, t: tone('primary') },
    { label: 'بازپرداخت', value: org.settings.loanMonthsOptions.map((m) => faDigits(m)).join(' / ') + ' ماه', d: I.calendar, t: tone('info') },
    { label: 'اعتبار کارت', value: org.settings.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال', d: I.credit, t: tone('success') },
    { label: 'قفل زمانی پیش‌فرض', value: org.settings.lockPolicies.includes('vesting') ? '۳ ماه' : 'غیرفعال', d: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3M12 15v2', t: tone('warning') },
  ] : [];

  if (dash.isError) return (<><PageHeading title="داشبورد سازمان" /><ErrorState message={errMsg(dash.error)} onRetry={() => dash.refetch()} /></>);

  return (
    <div className="pg-odash" style={{ display: 'flex', flexDirection: 'column', gap: 24, flex: '1 0 auto' }}>
      <PageHeading title="داشبورد سازمان" crumbs={[{ label: org?.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'منابع انسانی', href: routes.org.employees }, { label: 'داشبورد' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{updated ? `به‌روزرسانی: امروز ${time(updated)}` : 'در حال به‌روزرسانی…'}</span>
      </PageHeading>

      {/* KPI row */}
      <div style={{ minHeight: 104, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
        {!widgets.length && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} />)}
        {widgets.map((w, i) => {
          const path = sparkPath(SPARKS[i]);
          return (
            <Link key={w.title} href={w.href} className="card od-kpi" style={{ boxSizing: 'border-box', padding: 16, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="cell" style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-secondary)', fontWeight: 600 }}>{w.title}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{w.value}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{w.unit}</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><span className="lbl" style={{ height: 20, padding: '0 6px', background: w.t[0], color: w.t[1] }}>{w.delta}</span><span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{w.note}</span></span>
              </div>
              <div dir="ltr" style={{ width: 48, height: 36, flex: 'none' }}>
                <svg viewBox="0 0 80 40" width="48" height="36" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
                  <defs><linearGradient id={`od-sp-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: w.sc, stopOpacity: 0.22 }} /><stop offset="1" style={{ stopColor: w.sc, stopOpacity: 0 }} /></linearGradient></defs>
                  <path d={path + ' L80 40 L0 40 Z'} fill={`url(#od-sp-${i})`} />
                  <path d={path} fill="none" style={{ stroke: w.sc }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Row 2: allocation donut + latest batch */}
      <div style={{ minHeight: 240, flex: 'none', display: 'flex', gap: 24 }}>
        <div className="card" style={{ width: 360, flex: 'none', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>ترکیب دارایی پرسنل</h6>
            <Link href={routes.org.reports} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>گزارش‌ها<Icon d={I.chevL} size={16} /></Link>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div dir="ltr" style={{ width: 150, height: 150, flex: 'none', position: 'relative' }}>
              <svg viewBox="0 0 150 150" width="150" height="150" aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
                <circle cx="75" cy="75" r="56" fill="none" style={{ stroke: 'var(--divider)' }} strokeWidth="14" />
                {donut.items.filter((x) => x.show).map((x) => <circle key={x.label} cx="75" cy="75" r="56" fill="none" style={{ stroke: x.color }} strokeWidth="14" strokeDasharray={x.dash} strokeDashoffset={x.off} />)}
              </svg>
              <div dir="rtl" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, lineHeight: 1.1 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>دارایی کل</span>
                <span className="num" style={{ fontSize: 22 }}>{ins ? donutV : '—'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{donutU}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {donut.items.map((x) => (
                <div key={x.label} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', borderRadius: 10, background: 'var(--bg-neutral)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: x.color, flex: 'none' }} />
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}><span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{x.label}</span><span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{compactMoney(x.v)} تومان</span></span>
                  <span className="num" style={{ fontSize: 15, fontWeight: 500 }}>{x.pct}</span>
                </div>
              ))}
              {!ins && [0, 1, 2].map((i) => <Skeleton key={i} h={36} r={10} />)}
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!latest || !batch ? (
            pkgs.isLoading ? <Skeleton h={200} style={{ boxShadow: 'none' }} /> : (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                <span>هنوز بسته‌ای ارسال نشده است.</span>
                <Link href={routes.org.newRecipients()} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)' }}>ارسال بسته دارایی</Link>
              </div>
            )
          ) : (
            <>
              <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <h6 className="cell" style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>وضعیت آخرین ارسال — {latest.title}</h6>
                {batch.isDraft
                  ? <span className="lbl" style={{ background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>در انتظار تأیید</span>
                  : <span className="lbl" style={{ background: 'var(--soft-success)', color: 'var(--success-text)' }}>{latest.status === 'completed' ? 'تکمیل شده' : 'ارسال شد'}</span>}
                <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {batch.isDraft ? `ایجاد پیش‌نویس: ${jDayMonth(latest.createdAt)}` : `زمان ارسال: ${jDayMonth(latest.sentAt!)}`}
                </span>
              </div>
              <div style={{ height: 52, display: 'flex', alignItems: 'flex-start' }}>
                {batch.steps.map((s) => (
                  <div key={s.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ width: '100%', height: 28, display: 'flex', alignItems: 'center' }}>
                      <span style={{ flex: 1, height: 2, background: s.lineR }} />
                      <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', background: s.bg, color: s.fg, fontSize: 12, fontWeight: 700, boxShadow: s.ring }}>
                        {s.done ? <Icon d={I.check} size={16} strokeWidth={2.2} /> : <span>{s.n}</span>}
                      </span>
                      <span style={{ flex: 1, height: 2, background: s.lineL }} />
                    </div>
                    <span style={{ fontSize: 12, lineHeight: 1.3, fontWeight: s.w, color: s.c, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', gap: 24, padding: '0 4px', minWidth: 0, flexWrap: 'wrap', rowGap: 8 }}>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>گیرندگان</span><span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{faDigits(latest.recipients.length)} نفر</span></span>
                <span style={{ width: 1, height: 28, background: 'var(--divider)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>جمع بسته‌ها</span><span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{compactMoney(latest.total)} تومان</span></span>
                <span style={{ width: 1, height: 28, background: 'var(--divider)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>میانگین هر نفر</span><span className="num" style={{ fontSize: 16, whiteSpace: 'nowrap' }}>{money(latest.amountPerPerson)} تومان</span></span>
                <span style={{ width: 1, height: 28, background: 'var(--divider)' }} />
                {batch.isDraft ? (
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>خطای اعتبارسنجی</span><span className="num" style={{ fontSize: 16, color: batch.invalid ? 'var(--error-text)' : 'var(--success-text)', whiteSpace: 'nowrap' }}>{faDigits(batch.invalid)} مورد</span></span>
                ) : (
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>پذیرفته‌شده</span><span className="num" style={{ fontSize: 16, color: 'var(--success-text)', whiteSpace: 'nowrap' }}>{faDigits(batch.accepted)} از {faDigits(latest.recipients.length)}</span></span>
                )}
              </div>
              <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
                {batch.isDraft
                  ? <Link href={routes.org.newReview(latest.id)} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', textDecoration: 'none' }}>تأیید و ارسال</Link>
                  : <Link href={routes.org.newRecipients()} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', textDecoration: 'none' }}>ارسال بسته جدید</Link>}
                <Link href={routes.org.package(latest.id)} className="btn" style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>جزئیات</Link>
                <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {batch.isDraft ? 'تأییدکننده بعدی: مدیر مالی' : batch.waiting ? `${faDigits(batch.waiting)} نفر هنوز تأیید نکرده‌اند` : 'همه گیرندگان تأیید کرده‌اند'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 3: contract tiles + recent requests */}
      <div style={{ flex: '1 0 auto', minHeight: 216, display: 'flex', gap: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>قرارداد و محدودیت‌ها</h6>
            {org && <span className="lbl" style={{ background: org.status === 'active' ? 'var(--soft-success)' : 'var(--soft-warning)', color: org.status === 'active' ? 'var(--success-text)' : 'var(--warning-text)' }}>{org.status === 'active' ? 'فعال' : org.status === 'onboarding' ? 'در حال راه‌اندازی' : 'تعلیق'}</span>}
            <Link href={routes.org.contract} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>تنظیمات قرارداد<Icon d={I.chevL} size={16} /></Link>
          </div>
          <div style={{ flex: 1, minHeight: 96, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            {!org && [0, 1, 2, 3].map((i) => <Skeleton key={i} h={96} r={12} style={{ boxShadow: 'none' }} />)}
            {tiles.map((k) => (
              <Link key={k.label} href={routes.org.contract} className="od-tile" style={{ boxSizing: 'border-box', padding: 12, borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: k.t[0], color: k.t[1], display: 'grid', placeItems: 'center' }}><Icon d={k.d} size={18} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.2, minWidth: 0 }}><span className="num cell" style={{ fontSize: 16, fontWeight: 500 }}>{k.value}</span><span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.label}</span></span>
              </Link>
            ))}
          </div>
          {org && <span className="cell" style={{ fontSize: 11, lineHeight: '16px', color: 'var(--text-secondary)' }}>قرارداد <span dir="ltr">{org.contractNo}</span> · اعتبار تا {jDate(org.contractEnd)} · تغییر سقف‌ها از طریق بهره‌بردار انجام می‌شود</span>}
        </div>

        <div className="card" style={{ width: 400, flex: 'none', boxSizing: 'border-box', padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>درخواست‌های اخیر</h6>
            <span className="lbl" style={{ background: 'var(--soft-error)', color: 'var(--error-text)' }}>{faDigits(openCount)}</span>
            <Link href={routes.org.requests} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>همه<Icon d={I.chevL} size={16} /></Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {reqs.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} h={40} r={10} style={{ marginBottom: 8, boxShadow: 'none' }} />)}
            {!reqs.isLoading && !requests.length && <span style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>درخواست در انتظاری وجود ندارد.</span>}
            {requests.map((q, i) => {
              const decided = q.status !== 'pending';
              const ms = q.kind === 'milestone_release';
              const t = q.status === 'approved' ? tone('success') : q.status === 'rejected' ? tone('error') : ms ? tone('primary') : tone('warning');
              const status = q.status === 'approved' ? 'تأیید شد' : q.status === 'rejected' ? 'رد شد' : ms ? 'مرحله‌ای' : 'در انتظار';
              const [avBg, avFg] = avOf(q.requesterId);
              const who = ms ? `${q.requesterName} · مرحله ${stepNo(q.title) ?? ''} · ${money(q.amount ?? 0)} تومان` : `${q.requesterName}${q.amount ? ` · ${money(q.amount)} تومان` : ''}`;
              const isBusy = busy === q.id;
              return (
                <div key={q.id} style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px dashed ${i < requests.length - 1 ? 'var(--divider)' : 'transparent'}`, opacity: isBusy ? 0.6 : 1 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{q.requesterName[0]}</span>
                  <Link href={`${routes.org.requests}?id=${q.id}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25, color: 'inherit', textDecoration: 'none' }}>
                    <span className="cell" style={{ fontSize: 13, fontWeight: 600 }}>{REQ_TYPE[q.kind]}</span>
                    <span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{who}</span>
                  </Link>
                  <span className="lbl" style={{ height: 22, fontSize: 11, background: t[0], color: t[1] }}>{status}</span>
                  {!decided ? (
                    <span style={{ display: 'flex', gap: 2 }}>
                      <button className="ibtn" disabled={isBusy} aria-label={`تأیید درخواست ${q.requesterName}`} onClick={() => act(q, true)} style={{ width: 32, height: 32, color: 'var(--success-text)', background: 'var(--soft-success)' }}><Icon d={I.check} size={16} strokeWidth={2.2} /></button>
                      <button className="ibtn" disabled={isBusy} aria-label={`رد درخواست ${q.requesterName}`} onClick={() => act(q, false)} style={{ width: 32, height: 32, color: 'var(--error-text)' }}><Icon d={I.x} size={16} strokeWidth={2.2} /></button>
                    </span>
                  ) : !(ms && q.status === 'approved') ? (
                    <button className="ibtn" disabled={isBusy} aria-label={`بازگردانی تصمیم ${q.requesterName}`} onClick={() => undo(q)} style={{ width: 32, height: 32 }}><Icon d={I.undo} size={16} /></button>
                  ) : <span style={{ width: 32 }} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {toast}
    </div>
  );
}
