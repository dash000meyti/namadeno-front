'use client';
/**
 * Organization dashboard — kit overview page: key numbers, the latest batch, requests waiting for a decision,
 * team assets (free/locked + mix), one quiet contract line. Detailed charts live in Reports.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Allocation, Ava, BigNum, Card, Empty, ErrorBlock, FreeLocked, KV, List, Meter, PageHeading, Pill, SkeletonCard, SkeletonRows, StatStrip } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useDecideOrgRequest, useOrgDashboard, useOrgPackages, useOrgRequests } from '@/api/org';
import { useOrgPeopleInsights, useReopenOrgRequest } from '@/api/org-people-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, pct, percent, time } from '@/lib/format';
import type { ApprovalRequest, OrgPackage } from '@/types/domain';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { I, compactParts, errMsg } from '@/components/org/people/shared';

const REQ_TYPE: Record<ApprovalRequest['kind'], string> = {
  milestone_release: 'تأیید مرحله قرارداد', loan: 'درخواست وام', cash_withdrawal: 'برداشت نقدی',
  credit_increase: 'افزایش سقف اعتبار', installment: 'خرید اقساطی', profile_change: 'تغییر اطلاعات',
};
const STEPS = ['بارگذاری لیست', 'اعتبارسنجی', 'تأیید مدیر مالی', 'ارسال به کارکنان'];
const stepNo = (title: string) => /مرحله\s+([0-9۰-۹]+)/.exec(title)?.[1];
/** «۱۸٫۶ میلیارد تومان» as one short string. */
const compact = (n: number) => compactParts(n).join(' ');

export default function OrgDashboardPage() {
  const dash = useOrgDashboard();
  const insights = useOrgPeopleInsights();
  const pkgs = useOrgPackages();
  const reqs = useOrgRequests();
  const decide = useDecideOrgRequest();
  const reopen = useReopenOrgRequest();
  usePanelToast(); // shows a message flashed by the previous screen
  const show = useToast();
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
    return all.filter((r) => r.status === 'pending' || touched.includes(r.id)).slice(0, 4);
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

  const diff = ins && ins.sentLastMonth ? ((ins.sentThisMonth - ins.sentLastMonth) / ins.sentLastMonth) * 100 : null;
  const sent = ins ? compactParts(ins.sentThisMonth) : null;
  const total = d?.kpis.employeeAssets ?? 0;
  const locked = Math.min(d?.kpis.lockedAssets ?? 0, total);
  const totalParts = compactParts(total);

  // latest batch progress
  const batch = latest && (() => {
    const isDraft = latest.status === 'draft';
    const n = latest.recipients.length;
    const accepted = latest.recipients.filter((r) => r.status === 'accepted').length;
    const waiting = latest.recipients.filter((r) => r.status === 'pending').length;
    return {
      isDraft, n,
      status: isDraft ? 'در انتظار تأیید' : latest.status === 'completed' ? 'تکمیل شده' : 'ارسال شد',
      date: isDraft ? `پیش‌نویس · ${jDayMonth(latest.createdAt)}` : `ارسال · ${jDayMonth(latest.sentAt!)}`,
      fill: isDraft ? 2.5 / STEPS.length : n ? accepted / n : 1,
      progress: isDraft ? `مرحله‌ی ${faDigits(3)} از ${faDigits(STEPS.length)} · ${STEPS[2]}` : waiting ? `${faDigits(accepted)} از ${faDigits(n)} نفر پذیرفته‌اند` : 'همه‌ی گیرندگان پذیرفته‌اند',
    };
  })();

  if (dash.isError) return (<><PageHeading title="داشبورد" /><ErrorBlock error={dash.error} message={errMsg(dash.error)} onRetry={() => dash.refetch()} /></>);

  return (
    <>
      <PageHeading title="داشبورد" crumbs={[{ label: 'عملیات' }]} sub="وضعیت کارکنان، ارسال‌ها و درخواست‌ها در یک نگاه">
        <span className="mute" style={{ fontSize: 12 }}>{updated ? `به‌روز شده ${time(updated)}` : 'در حال به‌روزرسانی…'}</span>
      </PageHeading>

      <StatStrip loading={!d || !ins} items={d && ins && sent ? [
        { label: 'کارکنان فعال', value: faDigits(d.kpis.activeEmployees), unit: 'نفر', href: routes.org.employees, note: ins.newEmployees30d ? `${faDigits(ins.newEmployees30d)} نفر جدید در ۳۰ روز گذشته` : `از ${faDigits(d.kpis.employees)} نفر` },
        {
          label: `ارسال ${ins.thisMonthName}`, value: sent[0], unit: sent[1], href: routes.org.packages,
          ...(diff === null ? { note: 'نخستین ماه ارسال' }
            : !ins.sentThisMonth ? { note: `${ins.lastMonthName}: ${compact(ins.sentLastMonth)}` }
            : { note: `${percent(diff, 1, true)} نسبت به ${ins.lastMonthName}`, trend: diff >= 0 ? 'up' as const : 'down' as const }),
        },
        { label: 'در انتظار تصمیم', value: faDigits(openCount), unit: 'درخواست', href: routes.org.requests, note: openCount ? 'تأیید یا رد از همین صفحه' : 'همه‌ی درخواست‌ها بررسی شده‌اند', trend: openCount ? 'warn' : undefined },
        { label: 'مراحل قرارداد', value: faDigits(ins.milestones.count), unit: 'مرحله', href: `${routes.org.requests}?type=milestone_release`, note: ins.milestones.count ? `${compact(ins.milestones.amount)} در انتظار آزادسازی` : 'مرحله‌ای در انتظار نیست' },
      ] : []} />

      <div className="nm-grid c2 stretch">
        {/* Latest batch */}
        <Card title="آخرین ارسال" more={{ label: 'همه‌ی بسته‌ها', href: routes.org.packages }}>
          {!latest || !batch ? (
            pkgs.isLoading ? <SkeletonRows n={3} /> : (
              <Empty icon={I.pkg} title="هنوز بسته‌ای ارسال نشده است" action={<Link href={routes.org.newRecipients()} className="nm-btn sm">ارسال بسته دارایی</Link>} />
            )
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span className="nm-col"><b style={{ fontSize: 15 }}>{latest.title}</b><small>{batch.date}</small></span>
                <Pill tone={batch.isDraft ? 'warning' : 'success'} dot>{batch.status}</Pill>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Meter value={batch.fill} label={batch.progress} />
                <span className="mute" style={{ fontSize: 12.5 }}>{batch.progress}</span>
              </div>
              <KV rows={[
                ['گیرندگان', <span key="n" className="num">{faDigits(batch.n)} نفر</span>],
                ['جمع بسته', <span key="t" className="num">{compact(latest.total)}</span>],
                ['هر نفر', <span key="p" className="num">{compact(latest.amountPerPerson)}</span>],
              ]} />
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                {batch.isDraft
                  ? <Link href={routes.org.newReview(latest.id)} className="nm-btn sm">تأیید و ارسال</Link>
                  : <Link href={routes.org.newRecipients()} className="nm-btn sm">ارسال بسته جدید</Link>}
                <Link href={routes.org.package(latest.id)} className="nm-btn sm ghost">جزئیات</Link>
              </div>
            </>
          )}
        </Card>

        {/* Requests waiting for a decision */}
        <Card title="در انتظار شما" count={openCount || undefined} more={{ label: 'همه', href: routes.org.requests }}>
          {reqs.isLoading ? <SkeletonRows n={3} /> : !requests.length ? (
            <Empty icon={I.check} tone="success" title="کاری در انتظار شما نیست" sub="درخواست‌های تازه‌ی کارکنان اینجا نمایش داده می‌شود." />
          ) : (
            <List>
              {requests.map((q) => {
                const decided = q.status !== 'pending';
                const ms = q.kind === 'milestone_release';
                const who = ms ? `${q.requesterName} · مرحله ${stepNo(q.title) ?? ''} · ${money(q.amount ?? 0)} تومان` : `${q.requesterName}${q.amount ? ` · ${money(q.amount)} تومان` : ''}`;
                const isBusy = busy === q.id;
                return (
                  <div key={q.id} className="nm-li" style={{ opacity: isBusy ? 0.55 : 1 }}>
                    <Ava letter={q.requesterName[0]} id={q.requesterId} />
                    <Link href={`${routes.org.requests}?id=${q.id}`} className="nm-col" style={{ color: 'inherit' }}>
                      <b>{REQ_TYPE[q.kind]}</b>
                      <small className="num">{who}</small>
                    </Link>
                    <span className="trail">
                      {!decided ? (
                        <>
                          <button type="button" className="nm-ib tn tn-success" disabled={isBusy} aria-label={`تأیید درخواست ${q.requesterName}`} onClick={() => act(q, true)}><Icon d={I.check} size={16} strokeWidth={2.2} /></button>
                          <button type="button" className="nm-ib" disabled={isBusy} aria-label={`رد درخواست ${q.requesterName}`} onClick={() => act(q, false)}><Icon d={I.x} size={16} strokeWidth={2.2} /></button>
                        </>
                      ) : (
                        <>
                          <Pill tone={q.status === 'approved' ? 'success' : 'error'}>{q.status === 'approved' ? 'تأیید شد' : 'رد شد'}</Pill>
                          {!(ms && q.status === 'approved') && <button type="button" className="nm-ib" disabled={isBusy} aria-label={`بازگردانی تصمیم ${q.requesterName}`} onClick={() => undo(q)}><Icon d={I.undo} size={16} /></button>}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </List>
          )}
        </Card>
      </div>

      {/* Team assets: free/locked + mix */}
      {!d || !ins ? <SkeletonCard h={180} /> : (
        <Card title="دارایی کارکنان" sub="مجموع دارایی کارکنان در نمادنو" more={{ label: 'گزارش‌ها', href: routes.org.reports }}>
          <div className="nm-grid c2" style={{ gap: 40, alignItems: 'center' }}>
            <div className="nm-stack" style={{ gap: 12 }}>
              <BigNum value={totalParts[0]} unit={totalParts[1]} />
              <FreeLocked free={total - locked} locked={locked} fmt={compact} />
              {total > 0 && <span className="mute" style={{ fontSize: 12 }}>{pct((locked / total) * 100)} دارایی کارکنان قفل است (قفل زمانی، وثیقه و مرحله‌ای)</span>}
            </div>
            <Allocation compact items={[
              { label: 'طلا', value: ins.allocation.gold, color: 'var(--warning-main)' },
              { label: 'درآمد ثابت', value: ins.allocation.fixed, color: 'var(--chart-3)' },
              { label: 'ریال و سایر', value: ins.allocation.other, color: 'var(--chart-4)' },
            ]} />
          </div>
        </Card>
      )}

      {/* Contract — one quiet line */}
      {org && (
        <Link href={routes.org.contract} className="nm-li" style={{ padding: '6px 8px', borderRadius: 12, fontSize: 12.5, color: 'var(--text-secondary)', minHeight: 40 }}>
          <Pill tone={org.status === 'active' ? 'success' : 'warning'} dot>{org.status === 'active' ? 'قرارداد فعال' : org.status === 'onboarding' ? 'در حال راه‌اندازی' : 'تعلیق'}</Pill>
          <span>قرارداد <span className="ltr">{org.contractNo}</span> · اعتبار تا <span className="num">{jDate(org.contractEnd)}</span></span>
          <span className="nm-more" style={{ marginRight: 'auto' }}>قرارداد و محدودیت‌ها<Icon d={I.chevL} size={14} /></span>
        </Link>
      )}
    </>
  );
}
