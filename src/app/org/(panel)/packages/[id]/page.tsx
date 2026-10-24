'use client';
/**
 * Organization — package detail. Kit detail page: heading (tile, status pills, actions) → key numbers → cards.
 * Regular package: recipients table (status tabs, search, remind) + accepted allocation, package facts and timeline.
 * Milestone contract: the step waiting for approval (approve / ask for a fix), all steps, contract facts and timeline.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCancelPackage, useOrgMe, useOrgPackage, useReleaseMilestone } from '@/api/org';
import { useMilestoneFix, usePackageInsights, useRemindPackage, type PackageInsights, type PackageRecipientInsight } from '@/api/org-packages-extra';
import {
  Allocation, Ava, BigNum, Card, Confirm, Empty, ErrorBlock, FreeLocked, Ident, KV, List, ListRow, Note, PageHeading, Pill,
  SearchField, Section, SkeletonCard, SkeletonRows, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, usePaging,
  type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, StepMark, type StepState } from '@/components/org/packages/Stepper';
import { I, allocationText, milestoneStats, reasonMeta, splitCompact, statusLabel, type Tone as MetaTone } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, jDayMonth, money, relTime, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { AllocationSplit, OrgPackage } from '@/types/domain';

type RTab = 'all' | 'accepted' | 'pending';
interface TimelineStep { label: string; sub: string; state: StepState }
const PAGE = 8;
const RSTATUS: Record<PackageRecipientInsight['status'], [string, Tone]> = {
  accepted: ['دریافت‌شده', 'success'],
  pending: ['در انتظار', 'warning'],
  expired: ['بازگشت‌خورده', 'neutral'],
};
const kt = (t: MetaTone): Tone => (t === 'default' ? 'neutral' : t);
/** «۱۸٫۶ میلیارد» */
const cmp = (n: number) => { const c = splitCompact(n); return `${c.value} ${c.unit}`.trim(); };
const ASSETS = [
  { key: 'gold', label: 'صندوق طلا', color: 'var(--warning-main)' },
  { key: 'fixed', label: 'صندوق درآمد ثابت', color: 'var(--chart-3)' },
  { key: 'rial', label: 'کیف پول ریالی', color: 'var(--chart-4)' },
] as const;

export default function OrgPackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: pkg, isLoading, isError, error, refetch } = useOrgPackage(id);
  const insQ = usePackageInsights(id);
  const ins = insQ.data;
  const { data: me } = useOrgMe();
  const release = useReleaseMilestone();
  const cancel = useCancelPackage();
  const remind = useRemindPackage();
  const fix = useMilestoneFix();
  const toast = useToast();
  const [tab, setTab] = useState<RTab>('all');
  const [q, setQ] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const recipients = useMemo(() => ins?.recipients ?? [], [ins]);
  const text = q.trim();
  const filtered = useMemo(() => {
    const code = enDigits(text);
    return recipients.filter((r) => (tab === 'all' || r.status === tab) && (!text || r.name.includes(text) || r.employeeCode.includes(code) || r.department.includes(text)));
  }, [recipients, tab, text]);
  const pg = usePaging(filtered, PAGE, `${tab}|${text}`);

  const crumbs = [{ label: 'بسته‌های دارایی', href: routes.org.packages }];
  if (isError) return (<><PageHeading title="جزئیات بسته" crumbs={crumbs} /><ErrorBlock error={error} message="بسته پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg) {
    return (
      <>
        <PageHeading title="جزئیات بسته" crumbs={crumbs} />
        <StatStrip loading items={[]} />
        <div className="nm-grid side"><SkeletonCard h={420} /><SkeletonCard h={320} /></div>
      </>
    );
  }

  const isMs = pkg.lockPolicy.type === 'milestone';
  const isDraft = pkg.status === 'draft';
  const isSent = pkg.status === 'sent';
  const rm = reasonMeta(pkg.reason);
  const sl = statusLabel(pkg);
  const n = pkg.recipients.length;
  const acc = pkg.recipients.filter((r) => r.status === 'accepted');
  const pend = pkg.recipients.filter((r) => r.status === 'pending');
  const pendSum = pend.reduce((s, r) => s + r.amount, 0);
  const accPct = n ? Math.round((acc.length * 100) / n) : 0;
  const admin = me?.admin.name ?? 'نیما رضایی';
  const units = new Set(recipients.map((r) => r.department)).size;
  const todayStr = jDate(now());
  const acceptedToday = acc.filter((r) => r.acceptedAt && jDate(r.acceptedAt) === todayStr).length;
  const unreminded = isSent ? recipients.filter((r) => r.status === 'pending' && !r.reminded) : [];
  const ms = milestoneStats(pkg);
  const pendSteps = ms.steps.filter((s) => s.status === 'pending_approval');
  const stepCount = ms.steps.length || (pkg.lockPolicy.type === 'milestone' ? pkg.lockPolicy.steps.length : 0);
  const relAmt = Math.round((pkg.total * ms.relPct) / 100);
  const lockAmt = pkg.total - relAmt;
  const firstName = n === 1 ? pkg.recipients[0].name : `${faDigits(n)} گیرنده`;
  const total = splitCompact(pkg.total);
  const rel = splitCompact(relAmt);
  const lck = splitCompact(lockAmt);

  // ───── timeline ─────
  const steps: TimelineStep[] = isMs ? [
    { label: 'ایجاد قرارداد', sub: `${jDate(pkg.createdAt)} · ${admin}`, state: 'done' },
    { label: 'ارسال به کارمند', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · ${time(pkg.sentAt)}` : 'در انتظار ارسال', state: pkg.sentAt ? 'done' : 'current' },
    { label: 'پذیرش کارمند', sub: acc.length ? `${jDate(acc[0].acceptedAt ?? pkg.sentAt ?? pkg.createdAt)} · قفل ${money(acc.reduce((s, r) => s + r.amount, 0))}` : 'در انتظار پذیرش', state: acc.length === n && n ? 'done' : pkg.sentAt ? 'current' : 'pending' },
    { label: 'آزادسازی مرحله‌ای', sub: `${faDigits(ms.relN)} از ${faDigits(stepCount)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده`, state: ms.relPct >= 100 ? 'done' : acc.length ? 'current' : 'pending' },
  ] : [
    { label: 'ایجاد بسته', sub: `${jDate(pkg.createdAt)} · ${admin}`, state: 'done' },
    { label: 'کنترل بودجه', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · تأیید شد` : isDraft ? 'پیش از ارسال' : 'لغو شد', state: pkg.sentAt ? 'done' : isDraft ? 'current' : 'pending' },
    { label: 'ارسال به کارکنان', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · ${time(pkg.sentAt)}` : 'ارسال نشده', state: pkg.sentAt ? 'done' : 'pending' },
    { label: 'تأیید دریافت کارکنان', sub: pkg.sentAt ? `${faDigits(acc.length)} از ${faDigits(n)} · ${acc.length === n ? 'تکمیل' : 'در جریان'}` : '—', state: pkg.sentAt ? (acc.length === n ? 'done' : 'current') : 'pending' },
  ];

  // ───── actions ─────
  const remindOne = (r: PackageRecipientInsight) => remind.mutate({ packageId: pkg.id, employeeIds: [r.employeeId] }, { onSuccess: () => toast(`یادآوری برای ${r.name} پیامک شد`), onError: (e) => toast(errMsg(e), 'error') });
  const remindAll = () => remind.mutate({ packageId: pkg.id }, { onSuccess: (d) => toast(`یادآوری برای ${faDigits(d.reminded)} کارمند در انتظار پیامک شد`), onError: (e) => toast(errMsg(e), 'error') });
  const approve = (stepId: string, idx: number, pct: number) => release.mutate({ packageId: pkg.id, stepId }, {
    onSuccess: () => toast(`مرحله ${faDigits(idx)} تأیید شد · +${money((pkg.total * pct) / 100)} تومان برای ${firstName} آزاد شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const askFix = (stepId: string, idx: number) => fix.mutate({ packageId: pkg.id, stepId }, { onSuccess: () => toast(`درخواست اصلاح مرحله ${faDigits(idx)} برای ${firstName} ارسال شد`), onError: (e) => toast(errMsg(e), 'error') });
  const undoFix = (stepId: string) => fix.mutate({ packageId: pkg.id, stepId, undo: true }, { onError: (e) => toast(errMsg(e), 'error') });
  const doCancel = () => cancel.mutate(pkg.id, {
    onSuccess: () => { setConfirmCancel(false); toast(`پیش‌نویس «${pkg.title}» لغو شد`); router.push(routes.org.packages); },
    onError: (e) => { setConfirmCancel(false); toast(errMsg(e), 'error'); },
  });

  // ───── key numbers ─────
  const stats: Stat[] = isMs ? [
    { label: 'ارزش قرارداد', value: total.value, unit: `${total.unit} تومان`.trim(), note: `${faDigits(stepCount)} مرحله · صندوق طلا` },
    { label: 'آزادشده', value: rel.value, unit: `${rel.unit} تومان`.trim(), note: `${faDigits(ms.relPct)}٪ · ${faDigits(ms.relN)} مرحله`, trend: ms.relN ? 'up' : undefined },
    { label: 'قفل‌شده', value: lck.value, unit: `${lck.unit} تومان`.trim(), note: `${faDigits(100 - ms.relPct)}٪ · آزادسازی مرحله‌ای` },
    {
      label: 'در انتظار تأیید شما', value: faDigits(pendSteps.length), unit: 'مرحله', trend: ms.pending ? 'warn' : undefined,
      note: ms.pending ? `${cmp((pkg.total * ms.pending.sharePct) / 100)} تومان · ${ms.pending.dueDate ? 'مهلت ' + jDayMonth(ms.pending.dueDate) : 'بدون سررسید'}` : ms.relPct >= 100 ? 'همه‌ی مراحل آزاد شد' : 'مرحله‌ای در انتظار نیست',
    },
  ] : [
    { label: 'گیرندگان', value: faDigits(n), unit: 'نفر', note: `${ins ? `${faDigits(units)} واحد · ` : ''}${pkg.sentAt ? 'ارسال ' + relTime(pkg.sentAt, now()) : 'ارسال نشده'}` },
    { label: 'دریافت‌شده', value: faDigits(acc.length), unit: 'نفر', note: acceptedToday ? `${faDigits(accPct)}٪ · +${faDigits(acceptedToday)} امروز` : `${faDigits(accPct)}٪ پذیرش`, trend: acceptedToday ? 'up' : undefined },
    { label: 'در انتظار پذیرش', value: faDigits(pend.length), unit: 'نفر', note: `${cmp(pendSum)} تومان · ${pkg.expiresAt ? 'مهلت تا ' + jDayMonth(pkg.expiresAt) : '۳۰ روز مهلت'}`, trend: isSent && pend.length ? 'warn' : undefined },
    { label: 'جمع بسته', value: total.value, unit: `${total.unit} تومان`.trim(), note: isDraft ? 'پیش‌نویس' : 'رزرو از حساب سازمان' },
  ];

  const recCols: Column<PackageRecipientInsight>[] = [
    {
      key: 'who', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (r) => (
        <Ident
          lead={<Ava letter={r.avatarLetter} id={r.employeeId} />}
          title={<Link href={routes.org.employee(r.employeeId)} style={{ color: 'inherit' }}>{r.name}</Link>}
          sub={<>{r.department} · <span className="num">{faDigits(r.employeeCode)}</span></>}
        />
      ),
    },
    {
      key: 'split', label: 'تخصیص انتخابی', width: '140px', col: true, render: (r) => r.split
        ? <><SplitBar s={r.split} /><span className="sm el" style={{ maxWidth: '100%' }}>طلا {faDigits(r.split.gold)}٪ · ثابت {faDigits(r.split.fixed)}٪ · ریال {faDigits(r.split.rial ?? 0)}٪</span></>
        : <span style={{ color: 'var(--text-disabled)' }}>—</span>,
    },
    {
      key: 'st', label: 'وضعیت', width: '112px', col: true, render: (r) => {
        const [l, t] = isDraft ? ['در انتظار ارسال', 'neutral' as Tone] : pkg.status === 'cancelled' ? ['ارسال نشد', 'neutral' as Tone] : RSTATUS[r.status];
        return <><Pill tone={t} dot>{l}</Pill>{r.acceptedAt && <span className="num sm" title="تاریخ پذیرش">{jDate(r.acceptedAt)}</span>}</>;
      },
    },
    ...(isSent ? [{
      key: 'act', label: '', width: '84px', align: 'end' as const, render: (r: PackageRecipientInsight) => (r.status !== 'pending' ? null
        : r.reminded ? <Pill tone="success">یادآوری شد</Pill>
        : <button type="button" className="nm-btn sm line" onClick={() => remindOne(r)} disabled={remind.isPending}>یادآوری</button>),
    }] : []),
  ];

  return (
    <>
      <PageHeading
        crumbs={crumbs}
        lead={<Tile d={I.pkg} tone={kt(rm.tone)} size="xl" />}
        title={pkg.title}
        sub={isMs ? <>{rm.label} · گیرنده: {firstName}</> : <>{rm.label} · {pkg.amountPerPerson ? <><span className="num">{money(pkg.amountPerPerson)}</span> تومان هر نفر</> : 'مبلغ تعیین نشده'}</>}
        pills={<><Pill tone={kt(sl.tone)} dot>{sl.text}</Pill><LockTag type={pkg.lockPolicy.type} long /></>}
      >
        {!isMs && isSent && pend.length > 0 && (
          <button type="button" className="nm-btn ghost" onClick={remindAll} disabled={remind.isPending || !unreminded.length}>
            <Icon d={I.mail} size={17} />{!ins || unreminded.length ? 'یادآوری به همه' : 'یادآوری ارسال شد'}
          </button>
        )}
        {isDraft && (
          <>
            <button type="button" className="nm-btn line danger" onClick={() => setConfirmCancel(true)}><Icon d={I.ban} size={17} />لغو پیش‌نویس</button>
            <Link href={routes.org.newSettings(pkg.id)} className="nm-btn"><Icon d={I.edit} size={17} />ادامه ویرایش</Link>
          </>
        )}
      </PageHeading>

      <StatStrip items={stats} />

      {pkg.status === 'cancelled' && <Note tone="mute" icon={I.ban}>این بسته لغو شده و برای کارکنان ارسال نمی‌شود.</Note>}

      {isMs ? (
        <MilestoneView
          pkg={pkg} ins={ins} firstName={firstName} relAmt={relAmt} lockAmt={lockAmt} steps={steps}
          onApprove={approve} onFix={askFix} onUndo={undoFix} busy={release.isPending || fix.isPending}
        />
      ) : (
        <div className="nm-grid side">
          <Card flush title="گیرندگان" count={n}>
            <Toolbar>
              <Tabs label="وضعیت گیرنده" value={tab} onChange={setTab} items={[
                { key: 'all', label: 'همه', count: n },
                { key: 'accepted', label: 'دریافت‌شده', count: acc.length },
                { key: 'pending', label: 'در انتظار', count: pend.length },
              ]} />
              <span className="grow" />
              <SearchField value={q} onChange={setQ} placeholder="جستجوی کارمند…" label="جستجوی گیرنده" width={200} />
            </Toolbar>
            <Table
              columns={recCols} rows={pg.rows} rowKey={(r) => r.employeeId} rowLabel={(r) => r.name}
              loading={insQ.isLoading} error={insQ.isError ? insQ.error : undefined} onRetry={() => insQ.refetch()}
              empty={<Empty icon={text ? I.search : I.users} title="گیرنده‌ای پیدا نشد" />} minWidth={560}
            />
            <TableFoot shown={pg.rows.length} total={filtered.length} unit="گیرنده" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
          </Card>
          <div className="nm-stack">
            <AllocationCard allocation={ins?.allocation} loading={insQ.isLoading} />
            <FactsCard pkg={pkg} allocation={ins?.allocation} />
            <Card title="روند بسته"><Timeline steps={steps} /></Card>
          </div>
        </div>
      )}

      <Confirm
        open={confirmCancel} onClose={() => setConfirmCancel(false)} danger busy={cancel.isPending} onConfirm={doCancel}
        title="لغو پیش‌نویس" confirmLabel={cancel.isPending ? 'در حال لغو…' : 'لغو پیش‌نویس'}
        body={<span className="mute">پیش‌نویس «{pkg.title}» برای {faDigits(n)} نفر لغو می‌شود و دیگر قابل ارسال نیست. ادامه می‌دهید؟</span>}
      />
    </>
  );
}

/** Three-part bar of a recipient's chosen split (gold · fixed income · rial) for a table cell. */
function SplitBar({ s }: { s: AllocationSplit }) {
  return (
    <span className="nm-meter thin" role="img" aria-label={`طلا ${faDigits(s.gold)}٪، درآمد ثابت ${faDigits(s.fixed)}٪، ریال ${faDigits(s.rial ?? 0)}٪`} style={{ display: 'flex', gap: 1, width: 104 }}>
      <i style={{ width: `${s.gold}%`, background: ASSETS[0].color }} />
      <i style={{ width: `${s.fixed}%`, background: ASSETS[1].color }} />
      <i style={{ width: `${s.rial ?? 0}%`, background: ASSETS[2].color }} />
    </span>
  );
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <List>
      {steps.map((s, i) => <ListRow key={s.label} lead={<StepMark state={s.state} n={i + 1} />} title={s.label} sub={s.sub} />)}
    </List>
  );
}

/** What the recipients who accepted chose (gold / fixed income / rial). */
function AllocationCard({ allocation, loading }: { allocation?: PackageInsights['allocation']; loading: boolean }) {
  const a = allocation ?? { gold: 0, fixed: 0, rial: 0 };
  const sum = a.gold + a.fixed + a.rial;
  return (
    <Card title="تخصیص کارکنان" actions={<Link href={routes.org.reports} className="nm-ib" aria-label="گزارش ترکیب تخصیص"><Icon d={I.reports} size={18} /></Link>}>
      {loading ? <SkeletonRows n={2} /> : sum ? (
        <Section title="جمع پذیرفته‌شده" action={<BigNum value={cmp(sum)} unit="تومان" />}>
          <Allocation items={ASSETS.map((x) => ({ label: x.label, value: a[x.key], color: x.color }))} fmt={cmp} />
        </Section>
      ) : <Empty title="هنوز سهمی پذیرفته نشده است" sub="پس از پذیرش هر گیرنده، ترکیب انتخابی او اینجا جمع می‌شود." />}
    </Card>
  );
}

function FactsCard({ pkg, allocation }: { pkg: OrgPackage; allocation?: PackageInsights['allocation'] }) {
  const lp = pkg.lockPolicy;
  const a = allocation ?? { gold: 0, fixed: 0, rial: 0 };
  const accepted = a.gold + a.fixed + a.rial;
  return (
    <Card title="مشخصات بسته">
      <KV rows={[
        ['مبلغ هر نفر', <span key="p" className="num">{pkg.amountPerPerson ? `${money(pkg.amountPerPerson)} تومان` : '—'}</span>],
        ['برداشت نقدی', pkg.cashAllowed ? 'مجاز' : 'غیرمجاز'],
        ['تخصیص', allocationText(pkg)],
        ['سیاست قفل', <span key="l" className="num">{lp.type === 'vesting' ? 'آزاد در ' + jDate(lp.releaseAt) : 'همه آزاد'}</span>],
        ['مهلت پذیرش', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : '۳۰ روز پس از ارسال'}</span>],
      ]} />
      {lp.type === 'vesting' && accepted > 0 && (
        <Section title="نزد کارکنان (پذیرفته‌شده)">
          <FreeLocked free={a.rial} locked={a.gold + a.fixed} fmt={cmp} />
        </Section>
      )}
      <Note tone="info">
        {lp.type === 'vesting' ? `بخش صندوقی هر کارمند پس از تأیید، تا ${jDate(lp.releaseAt)} قفل می‌ماند و بازده می‌گیرد.` : 'سهم هر کارمند پس از تأیید بلافاصله آزاد است و بازده می‌گیرد.'}
      </Note>
    </Card>
  );
}

function MilestoneView({ pkg, ins, firstName, relAmt, lockAmt, steps, onApprove, onFix, onUndo, busy }: {
  pkg: OrgPackage;
  ins?: PackageInsights;
  firstName: string; relAmt: number; lockAmt: number; steps: TimelineStep[];
  onApprove: (stepId: string, idx: number, pct: number) => void; onFix: (stepId: string, idx: number) => void; onUndo: (stepId: string) => void; busy: boolean;
}) {
  const ms = milestoneStats(pkg);
  const lp = pkg.lockPolicy;
  // a draft has no progress yet → show the planned steps as future steps
  const rows = ms.steps.length ? ms.steps : lp.type === 'milestone' ? lp.steps.map((s, i) => ({ ...s, id: `plan-${i}`, status: 'future' as const, releasedAt: undefined })) : [];
  const n = pkg.recipients.length;
  const single = n === 1 ? ins?.recipients[0] : undefined;
  const anyAccepted = pkg.recipients.some((r) => r.status === 'accepted');
  const sent = pkg.status === 'sent';
  const claim = ins?.claims[0];
  const progText = `${faDigits(ms.relN)} از ${faDigits(rows.length)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده`;
  const waiting = ms.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.status === 'pending_approval');
  const claimText = claim
    ? <>اعلام انجام توسط {claim.requesterName}: <span className="num">{relTime(claim.createdAt, now())}</span>{claim.note ? ` · ${claim.note}` : ''}</>
    : anyAccepted ? 'هنوز اعلام انجامی از طرف کارمند ثبت نشده است' : 'در انتظار پذیرش قرارداد توسط کارمند';
  const defs: [string, string][] = [
    ['دارایی', `صندوق طلا · با قیمت روز ${pkg.sentAt ? jDayMonth(pkg.sentAt) : '—'}`],
    ['ایجاد', `${jDayMonth(pkg.createdAt, true)} · ${n > 1 ? faDigits(n) + ' گیرنده' : 'یک گیرنده'}`],
    ['آزادسازی', 'با تأیید هر مرحله توسط سازمان'],
    ['پس از آزادسازی', 'قابل فروش و برداشت'],
  ];

  return (
    <div className="nm-grid side">
      <Card title="مراحل قرارداد" sub={progText} more={{ label: 'درخواست‌های تأیید مرحله', href: routes.org.requests }}>
        {!anyAccepted && sent && <Note tone="warn">کارمند هنوز قرارداد را در اپلیکیشن تأیید نکرده است؛ تأیید مراحل پس از پذیرش او فعال می‌شود.</Note>}

        {sent && waiting.map(({ s, i }) => (ins?.fixRequests.includes(s.id) ? (
          <Note key={s.id} tone="warn" action={<button type="button" className="nm-btn sm ghost" onClick={() => onUndo(s.id)} disabled={busy}>بازگردانی</button>}>
            درخواست اصلاح مرحله {faDigits(i + 1)} برای {firstName} ارسال شد · مرحله همچنان قفل است
          </Note>
        ) : (
          <Section key={s.id} title="در انتظار تأیید شما" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{money((pkg.total * s.sharePct) / 100)} تومان</span>}>
            <b style={{ fontSize: 14, fontWeight: 600 }}>مرحله {faDigits(i + 1)} · {s.title}</b>
            <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>{claimText}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="nm-btn" onClick={() => onApprove(s.id, i + 1, s.sharePct)} disabled={busy || !anyAccepted}>
                <Icon d={I.check} size={16} strokeWidth={2.2} />تأیید انجام تعهد و آزادسازی {faDigits(s.sharePct)}٪
              </button>
              <button type="button" className="nm-btn ghost" onClick={() => onFix(s.id, i + 1)} disabled={busy || !anyAccepted}>نیاز به اصلاح</button>
            </div>
          </Section>
        )))}

        <Section title={sent && waiting.length ? 'همه‌ی مراحل' : undefined}>
          <List>
            {rows.map((s, i) => {
              const released = s.status === 'released';
              const pending = s.status === 'pending_approval';
              const fixReq = pending && !!ins?.fixRequests.includes(s.id);
              const [label, tone]: [string, Tone] = released ? ['آزاد شده', 'success'] : pending ? (fixReq ? ['اصلاح درخواست شد', 'error'] : ['در انتظار تأیید سازمان', 'warning']) : ['آینده', 'neutral'];
              const when = released ? `آزاد شده ${s.releasedAt ? jDayMonth(s.releasedAt) : ''}` : s.dueDate ? `سررسید ${jDayMonth(s.dueDate)}` : 'بدون سررسید';
              return (
                <ListRow
                  key={s.id}
                  lead={<StepMark state={released ? 'done' : pending ? 'current' : 'pending'} n={i + 1} />}
                  title={s.title}
                  sub={`سهم ${faDigits(s.sharePct)}٪ · ${when}`}
                  trail={<><span className="num">{money((pkg.total * s.sharePct) / 100)}</span><Pill tone={tone}>{label}</Pill></>}
                />
              );
            })}
          </List>
        </Section>
        <span className="mute" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}><Icon d={I.flag} size={14} />مراحل بعدی پس از اعلام انجام تعهد توسط کارمند، برای تأیید شما فعال می‌شوند.</span>
      </Card>

      <div className="nm-stack">
        <Card title="مشخصات قرارداد" actions={<LockTag type="milestone" />}>
          {single ? (
            <List>
              <ListRow
                href={routes.org.employee(single.employeeId)}
                lead={<Ava letter={single.avatarLetter} id={single.employeeId} />}
                title={single.name}
                sub={<>گیرنده · واحد {single.department} · کد پرسنلی <span className="num">{faDigits(single.employeeCode)}</span></>}
                trail={<Icon d={I.chevL} size={16} className="mute" />}
              />
            </List>
          ) : ins ? (
            <>
              <List>
                {ins.recipients.slice(0, 4).map((r) => (
                  <ListRow key={r.employeeId} href={routes.org.employee(r.employeeId)} lead={<Ava letter={r.avatarLetter} id={r.employeeId} size="sm" />} title={r.name} sub={r.department} />
                ))}
              </List>
              {n > 4 && <span className="mute" style={{ fontSize: 12 }}>و {faDigits(n - 4)} نفر دیگر</span>}
            </>
          ) : <SkeletonRows n={1} />}
          <Section title="ارزش قرارداد در صندوق طلا" action={<BigNum value={cmp(pkg.total)} unit="تومان" />}>
            <FreeLocked free={relAmt} locked={lockAmt} />
          </Section>
          <KV rows={defs} />
          <Note tone="info">بخش قفل‌شده در دارایی {firstName} می‌ماند و بازده می‌گیرد، اما تا تأیید هر مرحله توسط سازمان قابل فروش یا برداشت نیست.</Note>
        </Card>
        <Card title="روند قرارداد"><Timeline steps={steps} /></Card>
      </div>
    </div>
  );
}
