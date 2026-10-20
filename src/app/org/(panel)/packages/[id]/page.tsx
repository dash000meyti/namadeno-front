'use client';
/** Design: org-package-detail.dc.html — package detail: recipients & allocation, or milestone progress with «تأیید مرحله». */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useCancelPackage, useOrgMe, useOrgPackage, useReleaseMilestone } from '@/api/org';
import { useMilestoneFix, usePackageInsights, useRemindPackage, type PackageRecipientInsight } from '@/api/org-packages-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, relTime, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { OrgPackage } from '@/types/domain';
import { AV, I, allocationText, milestoneStats, reasonMeta, soft, splitCompact, type Tone } from '@/components/org/packages/meta';
import { Stepper, type StepDef } from '@/components/org/packages/Stepper';
import { CardError, CardSkeleton, CountTabs, Dialog, Kpi, LockChip, Notice, Pager, SearchBox, errMsg, useFlash, useOrgCrumb } from '@/components/org/packages/ui';

const GRID = 'minmax(0, 1fr) 120px 80px 84px 76px';
const PAGE = 8;
const RSTATUS: Record<PackageRecipientInsight['status'], { s: string; tone: Tone }> = {
  accepted: { s: 'دریافت‌شده', tone: 'success' },
  pending: { s: 'در انتظار', tone: 'warning' },
  expired: { s: 'بازگشت‌خورده', tone: 'default' },
};
const cmp = (n: number) => { const c = splitCompact(n); return `${c.value} ${c.unit}`.trim(); };

export default function OrgPackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const orgCrumb = useOrgCrumb();
  const { data: pkg, isLoading, isError, refetch } = useOrgPackage(id);
  const { data: ins } = usePackageInsights(id);
  const { data: me } = useOrgMe();
  const release = useReleaseMilestone();
  const cancel = useCancelPackage();
  const remind = useRemindPackage();
  const fix = useMilestoneFix();
  const globalToast = useToast();
  const { flash, toast } = useFlash();
  const [tab, setTab] = useState<'all' | 'accepted' | 'pending'>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const recipients = useMemo(() => ins?.recipients ?? [], [ins]);
  const filtered = useMemo(() => recipients.filter((r) => (tab === 'all' || r.status === tab) && (!q.trim() || r.name.includes(q.trim()) || r.employeeCode.includes(q.trim()) || r.department.includes(q.trim()))), [recipients, tab, q]);

  const crumbs = [orgCrumb, { label: 'بسته‌های دارایی', href: routes.org.packages }, { label: pkg?.title ?? 'جزئیات بسته' }];
  if (isError) return (<><PageHeading title="جزئیات بسته" crumbs={crumbs} /><CardError message="بسته پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg) {
    return (
      <>
        <PageHeading title="جزئیات بسته" crumbs={crumbs} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} h={92} />)}</div>
        <div style={{ display: 'flex', gap: 20 }}><CardSkeleton h={420} style={{ width: 340, flex: 'none' }} /><CardSkeleton h={420} style={{ flex: 1 }} /></div>
      </>
    );
  }

  const isMs = pkg.lockPolicy.type === 'milestone';
  const isDraft = pkg.status === 'draft';
  const isSent = pkg.status === 'sent';
  const rm = reasonMeta(pkg.reason);
  const n = pkg.recipients.length;
  const acc = pkg.recipients.filter((r) => r.status === 'accepted');
  const pend = pkg.recipients.filter((r) => r.status === 'pending');
  const accPct = n ? Math.round((acc.length * 100) / n) : 0;
  const admin = me?.admin.name ?? 'نیما رضایی';
  const units = new Set(recipients.map((r) => r.department)).size;
  const todayStr = jDate(now());
  const acceptedToday = acc.filter((r) => r.acceptedAt && jDate(r.acceptedAt) === todayStr).length;
  const unreminded = isSent ? recipients.filter((r) => r.status === 'pending' && !r.reminded) : [];
  const ms = milestoneStats(pkg);
  const relAmt = Math.round((pkg.total * ms.relPct) / 100);
  const lockAmt = pkg.total - relAmt;
  const firstName = n === 1 ? pkg.recipients[0].name : `${faDigits(n)} گیرنده`;

  // ───── status stepper ─────
  const steps: StepDef[] = isMs ? [
    { label: 'ایجاد قرارداد', sub: `${jDate(pkg.createdAt)} · ${admin}`, state: 'done', numSub: true },
    { label: 'ارسال به کارمند', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · ${time(pkg.sentAt)}` : 'در انتظار ارسال', state: pkg.sentAt ? 'done' : 'current', numSub: true },
    { label: 'پذیرش کارمند', sub: acc.length ? `${jDate(acc[0].acceptedAt ?? pkg.sentAt ?? pkg.createdAt)} · قفل ${money(acc.reduce((s, r) => s + r.amount, 0))}` : 'در انتظار پذیرش', state: acc.length === n && n ? 'done' : pkg.sentAt ? 'current' : 'pending', numSub: true },
    { label: 'آزادسازی مرحله‌ای', sub: `${faDigits(ms.relN)} از ${faDigits(ms.steps.length)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده`, state: ms.relPct >= 100 ? 'done' : acc.length ? 'current' : 'pending', numSub: true },
  ] : [
    { label: 'ایجاد بسته', sub: `${jDate(pkg.createdAt)} · ${admin}`, state: 'done', numSub: true },
    { label: 'کنترل بودجه', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · تأیید شد` : isDraft ? 'پیش از ارسال' : 'لغو شد', state: pkg.sentAt ? 'done' : isDraft ? 'current' : 'pending', numSub: true },
    { label: 'ارسال به کارکنان', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · ${time(pkg.sentAt)}` : 'ارسال نشده', state: pkg.sentAt ? 'done' : 'pending', numSub: true },
    { label: 'تأیید دریافت کارکنان', sub: pkg.sentAt ? `${faDigits(acc.length)} از ${faDigits(n)} · ${acc.length === n ? 'تکمیل' : 'در جریان'}` : '—', state: pkg.sentAt ? (acc.length === n ? 'done' : 'current') : 'pending', numSub: true },
  ];

  // ───── actions ─────
  const remindOne = (r: PackageRecipientInsight) => remind.mutate({ packageId: pkg.id, employeeIds: [r.employeeId] }, { onSuccess: () => flash(`یادآوری برای ${r.name} پیامک شد`), onError: (e) => flash(errMsg(e), 'error') });
  const remindAll = () => remind.mutate({ packageId: pkg.id }, { onSuccess: (d) => flash(`یادآوری برای ${faDigits(d.reminded)} کارمند در انتظار پیامک شد`), onError: (e) => flash(errMsg(e), 'error') });
  const approve = (stepId: string, idx: number, pct: number) => release.mutate({ packageId: pkg.id, stepId }, {
    onSuccess: () => flash(`مرحله ${faDigits(idx)} تأیید شد · +${money((pkg.total * pct) / 100)} تومان برای ${firstName} آزاد شد`),
    onError: (e) => flash(errMsg(e), 'error'),
  });
  const askFix = (stepId: string, idx: number) => fix.mutate({ packageId: pkg.id, stepId }, { onSuccess: () => flash(`درخواست اصلاح مرحله ${faDigits(idx)} برای ${firstName} ارسال شد`), onError: (e) => flash(errMsg(e), 'error') });
  const undoFix = (stepId: string) => fix.mutate({ packageId: pkg.id, stepId, undo: true }, { onError: (e) => flash(errMsg(e), 'error') });
  const doCancel = () => cancel.mutate(pkg.id, {
    onSuccess: () => { setConfirmCancel(false); globalToast(`پیش‌نویس «${pkg.title}» لغو شد`); router.push(routes.org.packages); },
    onError: (e) => { setConfirmCancel(false); flash(errMsg(e), 'error'); },
  });

  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ whiteSpace: 'nowrap' }}>{pkg.title}</span>
      <span className="lbl" style={{ background: 'var(--soft-default)', color: 'var(--default-text)' }}>{rm.label}</span>
      <LockChip type={pkg.lockPolicy.type} />
      {pkg.status === 'cancelled' && <span className="lbl" style={{ background: 'var(--soft-error)', color: 'var(--error-text)' }}>لغوشده</span>}
      {isDraft && <span className="lbl" style={{ background: 'var(--soft-default)', color: 'var(--default-text)' }}>پیش‌نویس</span>}
    </span>
  );

  return (
    <>
      <PageHeading title={titleNode} crumbs={crumbs}>
        {!isMs && isSent && pend.length > 0 && (
          <button className="btn" onClick={remindAll} disabled={remind.isPending || !unreminded.length} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', opacity: !unreminded.length ? 0.7 : 1 }}>
            <Icon d={I.mail} size={18} />{unreminded.length ? 'یادآوری به همه' : 'یادآوری ارسال شد'}
          </button>
        )}
        {isDraft && (
          <>
            <button className="btn" onClick={() => setConfirmCancel(true)} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--error-text)' }}><Icon d={I.ban} size={18} />لغو پیش‌نویس</button>
            <Link href={routes.org.newSettings(pkg.id)} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none' }}><Icon d={I.edit} size={18} />ادامه ویرایش</Link>
          </>
        )}
        <Link href={routes.org.packages} className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0 10px', textDecoration: 'none' }}><Icon d={I.chevR} size={16} />بازگشت</Link>
      </PageHeading>

      <Stepper steps={steps} emphasizeDone />

      {pkg.status === 'cancelled' && <Notice tone="error" d={I.ban}>این بسته لغو شده و برای کارکنان ارسال نمی‌شود.</Notice>}

      {/* KPI row */}
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {isMs ? (
          <>
            <Kpi compact title="ارزش قرارداد" value={splitCompact(pkg.total).value} unit={`${splitCompact(pkg.total).unit} تومان · طلا`} d={I.coin} tone="primary" delta={`${faDigits(ms.steps.length)} مرحله`} dtone="default" />
            <Kpi compact title="آزادشده" value={splitCompact(relAmt).value} unit={`${splitCompact(relAmt).unit} · ${faDigits(ms.relPct)}٪`.trim()} d={I.check} tone="success" delta={`${faDigits(ms.relN)} مرحله`} dtone="success" />
            <Kpi compact title="قفل‌شده" value={splitCompact(lockAmt).value} unit={`${splitCompact(lockAmt).unit} · ${faDigits(100 - ms.relPct)}٪`.trim()} d={I.lock} tone="warning" delta="مرحله‌ای" dtone="primary" />
            <Kpi compact title="در انتظار تأیید شما" value={ms.pending ? '۱' : '۰'} unit={ms.pending ? `مرحله · ${cmp((pkg.total * ms.pending.sharePct) / 100)}` : 'مرحله'} d={I.inbox} tone="warning"
              delta={ms.pending ? (ms.pending.dueDate ? `مهلت ${jDayMonth(ms.pending.dueDate)}` : 'بدون سررسید') : ms.relPct >= 100 ? 'تکمیل شد' : 'تأیید شد'} dtone={ms.pending ? 'warning' : 'success'} />
          </>
        ) : (
          <>
            <Kpi compact title="گیرندگان" value={faDigits(n)} unit={`نفر · ${faDigits(units)} واحد`} d={I.users} tone="primary" delta={pkg.sentAt ? `ارسال ${relTime(pkg.sentAt, now())}` : 'ارسال نشده'} dtone="default" />
            <Kpi compact title="تأیید و دریافت‌شده" value={faDigits(acc.length)} unit={`نفر · ${faDigits(accPct)}٪`} d={I.check} tone="success" delta={acceptedToday ? `+${faDigits(acceptedToday)} امروز` : `${faDigits(accPct)}٪ پذیرش`} dtone="success" />
            <Kpi compact title="در انتظار تأیید" value={faDigits(pend.length)} unit={`نفر · ${cmp(pend.reduce((s, r) => s + r.amount, 0))}`} d={I.inbox} tone="warning" delta={pkg.expiresAt ? `مهلت تا ${jDayMonth(pkg.expiresAt)}` : '۳۰ روز مهلت'} dtone="warning" />
            <Kpi compact title="جمع بسته" value={splitCompact(pkg.total).value} unit={`${splitCompact(pkg.total).unit} تومان`.trim()} d={I.coin} tone="info" delta={isDraft ? 'پیش‌نویس' : 'رزرو از حساب سازمان'} dtone="info" />
          </>
        )}
      </div>

      {isMs ? <MilestoneView pkg={pkg} ins={ins} firstName={firstName} relAmt={relAmt} lockAmt={lockAmt} onApprove={approve} onFix={askFix} onUndo={undoFix} busy={release.isPending || fix.isPending} />
        : (
          <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <AllocationCard pkg={pkg} allocation={ins?.allocation} />
            {/* Recipients table */}
            <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)' }}>
                <CountTabs items={[
                  { key: 'all', label: 'همه', tone: 'default', count: n },
                  { key: 'accepted', label: 'دریافت‌شده', tone: 'success', count: acc.length },
                  { key: 'pending', label: 'در انتظار', tone: 'warning', count: pend.length },
                ]} value={tab} onChange={(k) => { setTab(k); setPage(0); }} />
                <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="جستجوی کارمند…" label="جستجوی گیرنده" width={200} />
              </div>
              <div className="th" style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 14px' }}>
                <span className="cell">کارمند</span><span className="cell">تخصیص انتخابی</span><span className="cell">تاریخ تأیید</span><span className="cell">وضعیت</span><span />
              </div>
              {!ins && [0, 1, 2, 3].map((i) => <div key={i} style={{ height: 46, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
              {ins && !filtered.length && <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>گیرنده‌ای پیدا نشد</div>}
              {filtered.slice(page * PAGE, page * PAGE + PAGE).map((r) => {
                const sd = isDraft ? { s: 'در انتظار ارسال', tone: 'default' as Tone } : RSTATUS[r.status];
                const st = soft(sd.tone);
                const av = AV[recipients.indexOf(r) % AV.length];
                const sp = r.split;
                return (
                  <div key={r.employeeId} style={{ height: 46, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                    <Link href={routes.org.employee(r.employeeId)} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: av[0], color: av[1], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{r.avatarLetter}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span className="cell" style={{ fontWeight: 600 }}>{r.name}</span><span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{r.department} · {faDigits(r.employeeCode)}</span></span>
                    </Link>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      {sp ? (
                        <>
                          <span dir="ltr" style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}><span style={{ width: `${sp.gold}%`, background: 'var(--warning-main)' }} /><span style={{ width: `${sp.fixed}%`, background: 'var(--chart-3)' }} /><span style={{ width: `${sp.rial ?? 0}%`, background: 'var(--chart-4)' }} /></span>
                          <span className="num" style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 400 }}>طلا {faDigits(sp.gold)}٪ · ثابت {faDigits(sp.fixed)}٪ · ریال {faDigits(sp.rial ?? 0)}٪</span>
                        </>
                      ) : <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>—</span>}
                    </span>
                    <span className="num cell" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{r.acceptedAt ? jDate(r.acceptedAt) : '—'}</span>
                    <span><span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: st.bg, color: st.fg }}>{sd.s}</span></span>
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {isSent && r.status === 'pending' && !r.reminded && <button className="btn" onClick={() => remindOne(r)} disabled={remind.isPending} style={{ height: 30, padding: '0 10px', fontSize: 12, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}>یادآوری</button>}
                      {isSent && r.status === 'pending' && r.reminded && <span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: 'var(--soft-success)', color: 'var(--success-text)' }}>یادآوری شد</span>}
                    </span>
                  </div>
                );
              })}
              <div style={{ flex: 1 }} />
              <Pager page={page} pageSize={PAGE} total={filtered.length} onPage={setPage} />
            </div>
          </div>
        )}

      {confirmCancel && (
        <Dialog title="لغو پیش‌نویس" onClose={() => setConfirmCancel(false)}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>پیش‌نویس «{pkg.title}» برای {faDigits(n)} نفر لغو می‌شود و دیگر قابل ارسال نیست. ادامه می‌دهید؟</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
            <button className="btn" onClick={doCancel} disabled={cancel.isPending} style={{ background: 'var(--error-main)', color: 'var(--error-contrast, #FFFFFF)' }}>{cancel.isPending ? 'در حال لغو…' : 'لغو پیش‌نویس'}</button>
            <button className="btn" onClick={() => setConfirmCancel(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>انصراف</button>
          </div>
        </Dialog>
      )}
      {toast}
    </>
  );
}

function AllocationCard({ pkg, allocation }: { pkg: OrgPackage; allocation?: { gold: number; fixed: number; rial: number } }) {
  const a = allocation ?? { gold: 0, fixed: 0, rial: 0 };
  const sum = a.gold + a.fixed + a.rial;
  const C = 2 * Math.PI * 48;
  let cum = 0;
  const donut = [
    { label: 'صندوق طلا', v: a.gold, color: '--warning-main' },
    { label: 'صندوق درآمد ثابت', v: a.fixed, color: '--chart-3' },
    { label: 'کیف پول ریالی', v: a.rial, color: '--chart-4' },
  ].map((d) => {
    const pct = sum ? Math.round((d.v * 100) / sum) : 0;
    const len = sum ? (C * d.v) / sum : 0;
    const item = { ...d, pct, dash: `${Math.max(0, len - 3).toFixed(2)} ${C.toFixed(2)}`, off: (-cum).toFixed(2) };
    cum += len;
    return item;
  });
  const lp = pkg.lockPolicy;
  const lockedAtEmployees = lp.type === 'vesting' ? a.gold + a.fixed : 0;
  const center = splitCompact(sum);
  const defs: { label: string; value: string; c?: string; chip?: boolean }[] = [
    { label: 'مبلغ هر نفر', value: `${money(pkg.amountPerPerson)} تومان` },
    { label: 'برداشت نقدی', value: pkg.cashAllowed ? 'مجاز' : 'غیرمجاز', c: pkg.cashAllowed ? 'var(--success-text)' : 'var(--text-secondary)' },
    { label: 'تخصیص', value: allocationText(pkg) },
    { label: 'سیاست قفل', value: lp.type === 'vesting' ? 'آزاد در ' + jDate(lp.releaseAt) : 'همه آزاد', chip: true },
    { label: 'قفل‌شده نزد کارکنان', value: lp.type === 'vesting' ? `${cmp(lockedAtEmployees)} · بخش صندوقی` : '—' },
  ];
  return (
    <div className="card" style={{ width: 340, flex: 'none', boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>تخصیص انتخاب‌شده کارکنان</h6>
        <Link href={routes.org.reports} aria-label="گزارش ترکیب تخصیص" className="ibtn" style={{ marginRight: 'auto', width: 28, height: 28, textDecoration: 'none' }}><Icon d={I.reports} size={18} /></Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div dir="ltr" style={{ width: 120, height: 120, flex: 'none', position: 'relative' }}>
          <svg viewBox="0 0 130 130" width={120} height={120} aria-hidden="true" style={{ display: 'block', transform: 'rotate(-90deg)' }}>
            <circle cx="65" cy="65" r="48" fill="none" style={{ stroke: 'var(--divider)' }} strokeWidth="13" />
            {donut.filter((d) => d.v > 0).map((d) => <circle key={d.label} cx="65" cy="65" r="48" fill="none" style={{ stroke: `var(${d.color})` }} strokeWidth="13" strokeDasharray={d.dash} strokeDashoffset={d.off} />)}
          </svg>
          <div dir="rtl" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, lineHeight: 1.1 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تأیید‌شده</span>
            <span className="num" style={{ fontSize: 20 }}>{center.value}</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{center.unit} تومان</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {donut.map((d) => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', borderRadius: 10, background: 'var(--bg-neutral)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${d.color})`, flex: 'none' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}><span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{d.label}</span><span className="num" style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>{cmp(d.v)} تومان</span></span>
              <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{faDigits(d.pct)}٪</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {defs.map((k) => (
          <div key={k.label} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 12, minWidth: 0 }}>
            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{k.label}</span>
            <span className="num cell" style={{ marginRight: 'auto', fontWeight: 500, color: k.c ?? 'var(--text-primary)' }}>{k.value}</span>
            {k.chip && <LockChip type={lp.type} />}
          </div>
        ))}
      </div>
      <Notice tone="info">
        {lp.type === 'vesting' ? `بخش صندوقی هر کارمند پس از تأیید، تا ${jDate(lp.releaseAt)} قفل می‌ماند و بازده می‌گیرد.` : 'سهم هر کارمند پس از تأیید بلافاصله آزاد است و بازده می‌گیرد.'}
      </Notice>
    </div>
  );
}

function MilestoneView({ pkg, ins, firstName, relAmt, lockAmt, onApprove, onFix, onUndo, busy }: {
  pkg: OrgPackage;
  ins?: { fixRequests: string[]; claims: { requesterName: string; createdAt: string; note?: string }[]; recipients: PackageRecipientInsight[] };
  firstName: string; relAmt: number; lockAmt: number;
  onApprove: (stepId: string, idx: number, pct: number) => void; onFix: (stepId: string, idx: number) => void; onUndo: (stepId: string) => void; busy: boolean;
}) {
  const ms = milestoneStats(pkg);
  const single = pkg.recipients.length === 1 ? ins?.recipients[0] : undefined;
  const anyAccepted = pkg.recipients.some((r) => r.status === 'accepted');
  const claim = ins?.claims[0];
  const progText = `${faDigits(ms.relN)} از ${faDigits(ms.steps.length)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده`;
  const defs = [
    { label: 'دارایی', value: `صندوق طلا · با قیمت روز ${pkg.sentAt ? jDayMonth(pkg.sentAt) : '—'}` },
    { label: 'ایجاد', value: `${jDayMonth(pkg.createdAt, true)} · ${pkg.recipients.length > 1 ? faDigits(pkg.recipients.length) + ' گیرنده' : 'یک گیرنده'}` },
    { label: 'آزادسازی', value: 'با تأیید هر مرحله توسط سازمان' },
    { label: 'پس از آزادسازی', value: 'قابل فروش و برداشت' },
  ];
  return (
    <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 340, flex: 'none', boxSizing: 'border-box', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>مشخصات قرارداد</h6>
          <span style={{ marginRight: 'auto' }} /><LockChip type="milestone" />
        </div>
        {single ? (
          <Link href={routes.org.employee(single.employeeId)} className="row-a" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-neutral)' }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, flex: 'none' }}>{single.avatarLetter}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}><span style={{ fontSize: 14, fontWeight: 700 }}>{single.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>گیرنده · واحد {single.department} · کد پرسنلی <span className="num" style={{ fontWeight: 400 }}>{faDigits(single.employeeCode)}</span></span></span>
            <Icon d={I.chevL} size={16} style={{ color: 'var(--text-secondary)' }} />
          </Link>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-neutral)' }}>
            {(ins?.recipients ?? []).slice(0, 4).map((r) => <Link key={r.employeeId} href={routes.org.employee(r.employeeId)} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</Link>)}
            {pkg.recipients.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>و {faDigits(pkg.recipients.length - 4)} نفر دیگر</span>}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ارزش قرارداد در صندوق طلا</span><span className="num" style={{ marginRight: 'auto', fontSize: 18, lineHeight: 1.1 }}>{money(pkg.total)}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span></div>
          <div className="lkbar" role="img" aria-label={`آزاد ${money(relAmt)} · قفل ${money(lockAmt)}`}><span className="f" style={{ width: `${ms.relPct}%` }} /><span className="l" style={{ flex: 1 }} /></div>
          <div className="lkleg"><span><span className="lkdot" />آزاد <b>{money(relAmt)}</b></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2" size={12} />قفل <b>{money(lockAmt)}</b></span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {defs.map((k) => (
            <div key={k.label} style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{k.label}</span>
              <span className="num cell" style={{ marginRight: 'auto', fontWeight: 500 }}>{k.value}</span>
            </div>
          ))}
        </div>
        <Notice tone="info">بخش قفل‌شده در دارایی {firstName} می‌ماند و بازده می‌گیرد، اما تا تأیید هر مرحله توسط سازمان قابل فروش یا برداشت نیست.</Notice>
      </div>

      <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--divider)' }}>
          <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>پیشرفت مراحل · {firstName}</h6>
          <span className="num" style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 400 }}>{progText}</span>
        </div>
        <div style={{ flex: 'none', padding: '12px 16px 6px' }}>
          <div className="lkseg" role="img" aria-label={progText} style={{ height: 8 }}>
            {ms.steps.map((s) => <span key={s.id} className={s.status === 'released' ? 'r' : s.status === 'pending_approval' ? 'p' : ''} style={{ flex: s.sharePct }} />)}
          </div>
        </div>
        {!anyAccepted && pkg.status === 'sent' && <div style={{ padding: '6px 16px' }}><Notice tone="warning" d={I.warn}>کارمند هنوز قرارداد را در اپلیکیشن تأیید نکرده است؛ تأیید مراحل پس از پذیرش او فعال می‌شود.</Notice></div>}
        {ms.steps.map((s, i) => {
          const rel = s.status === 'released';
          const pend = s.status === 'pending_approval';
          const fixReq = pend && !!ins?.fixRequests.includes(s.id);
          const st = rel ? { s: 'آزاد شده', tone: 'success' as Tone } : pend ? (fixReq ? { s: 'اصلاح درخواست شد', tone: 'error' as Tone } : { s: 'در انتظار تأیید سازمان', tone: 'warning' as Tone }) : { s: 'آینده', tone: 'default' as Tone };
          const t = soft(st.tone);
          const sub = rel ? `آزاد شده ${s.releasedAt ? jDayMonth(s.releasedAt) : ''}` : s.dueDate ? `سررسید ${jDayMonth(s.dueDate)}` : 'بدون سررسید';
          const canApprove = pend && pkg.status === 'sent' && anyAccepted;
          return (
            <div key={s.id} style={{ flex: 'none', boxSizing: 'border-box', padding: '9px 16px', borderBottom: '1px dashed var(--divider)', background: pend ? 'rgb(var(--warning-main-rgb) / .06)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', boxSizing: 'border-box', background: rel ? 'var(--primary-main)' : pend ? 'var(--soft-warning)' : 'var(--step-pending)', color: rel ? '#FFFFFF' : pend ? 'var(--warning-text)' : 'var(--step-pending-text)', boxShadow: pend ? 'inset 0 0 0 1.5px var(--warning-main)' : 'none', fontSize: 12, fontWeight: 700 }}>
                  {rel ? <Icon d={I.check} size={16} strokeWidth={2.2} /> : <span>{faDigits(i + 1)}</span>}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}><span className="cell" style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</span><span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>سهم {faDigits(s.sharePct)}٪ · {sub}</span></span>
                <span className="num" style={{ width: 36, flex: 'none', fontSize: 13, fontWeight: 500 }}>{faDigits(s.sharePct)}٪</span>
                <span style={{ width: 118, flex: 'none', display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{money((pkg.total * s.sharePct) / 100)}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>تومان</span></span>
                <span style={{ width: 132, flex: 'none', display: 'flex', justifyContent: 'flex-end' }}><span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: t.bg, color: t.fg }}>{st.s}</span></span>
              </div>
              {pend && !fixReq && pkg.status === 'sent' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 40, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {claim ? <>اعلام انجام توسط {claim.requesterName}: <span className="num" style={{ fontWeight: 400 }}>{relTime(claim.createdAt, now())}</span>{claim.note ? ` · ${claim.note}` : ''}</> : anyAccepted ? 'هنوز اعلام انجامی از طرف کارمند ثبت نشده است' : 'در انتظار پذیرش قرارداد توسط کارمند'}
                  </span>
                  <button className="btn" onClick={() => onFix(s.id, i + 1)} disabled={busy || !anyAccepted} style={{ height: 36, padding: '0 12px', border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', opacity: anyAccepted ? 1 : 0.5 }}>نیاز به اصلاح</button>
                  <button className="btn" onClick={() => onApprove(s.id, i + 1, s.sharePct)} disabled={busy || !canApprove} style={{ height: 36, padding: '0 14px', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: canApprove ? 'var(--shadow-primary)' : 'none', opacity: canApprove ? 1 : 0.5, cursor: canApprove ? 'pointer' : 'not-allowed' }}>
                    <Icon d={I.check} size={16} strokeWidth={2.2} />تأیید انجام تعهد و آزادسازی {faDigits(s.sharePct)}٪
                  </button>
                </div>
              )}
              {fixReq && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 40 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--error-text)', lineHeight: 1.5 }}>درخواست اصلاح برای {firstName} ارسال شد · مرحله همچنان قفل است</span>
                  <button className="btn" onClick={() => onUndo(s.id)} disabled={busy} style={{ height: 32, padding: '0 10px', fontSize: 12, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}>بازگردانی</button>
                </div>
              )}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ height: 40, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)', fontSize: 11, color: 'var(--text-secondary)' }}>
          <Icon d={I.flag} size={14} style={{ flex: 'none' }} />
          <span className="cell">مراحل بعدی پس از اعلام انجام تعهد توسط کارمند، برای تأیید شما فعال می‌شوند.</span>
          <Link href={routes.org.requests} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>درخواست‌های تأیید مرحله</Link>
        </div>
      </div>
    </div>
  );
}
