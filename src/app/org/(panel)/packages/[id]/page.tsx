'use client';
/**
 * Organization — package detail. Kit detail page: heading (tile, status pills, actions) → key numbers → cards.
 * Regular package: recipients table (status tabs, search, remind) + accepted allocation, package facts and timeline.
 * Milestone contract: the current step (approve / «بازپس‌گیری» with a reason, or a note when it is released automatically),
 * all steps with their due date and «نیاز به تأیید» (editable until settled, saved at once), contract facts and timeline.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCancelPackage, useOrgMe, useOrgPackage, useReleaseMilestone } from '@/api/org';
import { usePackageInsights, useReclaimMilestone, useRemindPackage, useUpdateMilestoneStep, type PackageInsights, type PackageRecipientInsight } from '@/api/org-packages-extra';
import {
  Allocation, Ava, BigNum, Card, Confirm, Dialog, Empty, ErrorBlock, Field, FreeLocked, Ident, KV, List, ListRow, Note, PageHeading, Pill,
  SearchField, Section, SkeletonCard, SkeletonRows, StatStrip, Switch, Table, TableFoot, Tabs, Tile, Toolbar, usePaging,
  type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { DateInput } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, StepMark, type StepState } from '@/components/org/packages/Stepper';
import { I, allocationText, isAutoStep, milestoneStats, parseJalali, perPersonText, reasonMeta, splitCompact, statusLabel, type Tone as MetaTone } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, jDayMonth, money, relTime, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { AllocationSplit, MilestoneStep, OrgPackage } from '@/types/domain';

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
  // steps waiting for the organization (a current step without «نیاز به تأیید» is released at its due date)
  const pendSteps = ms.steps.filter((s) => s.status === 'pending_approval' && !isAutoStep(s));
  const dueText = (iso?: string) => (!iso ? 'بدون سررسید' : new Date(iso).getTime() <= now().getTime() ? `سررسید ${jDayMonth(iso)} گذشت` : `سررسید ${jDayMonth(iso)}`);
  const stepCount = ms.steps.length || (pkg.lockPolicy.type === 'milestone' ? pkg.lockPolicy.steps.length : 0);
  const relAmt = Math.round((pkg.total * ms.relPct) / 100);
  const backAmt = Math.round((pkg.total * ms.backPct) / 100); // reclaimed: back with the organization
  const lockAmt = pkg.total - relAmt - backAmt;
  const firstName = n === 1 ? pkg.recipients[0].name : `${faDigits(n)} گیرنده`;
  const total = splitCompact(pkg.total);
  const rel = splitCompact(relAmt);
  const lck = splitCompact(lockAmt);

  // ───── timeline ─────
  const steps: TimelineStep[] = isMs ? [
    { label: 'ایجاد قرارداد', sub: `${jDate(pkg.createdAt)} · ${admin}`, state: 'done' },
    { label: 'ارسال به کارمند', sub: pkg.sentAt ? `${jDate(pkg.sentAt)} · ${time(pkg.sentAt)}` : 'در انتظار ارسال', state: pkg.sentAt ? 'done' : 'current' },
    { label: 'پذیرش کارمند', sub: acc.length ? `${jDate(acc[0].acceptedAt ?? pkg.sentAt ?? pkg.createdAt)} · ${money(acc.reduce((s, r) => s + r.amount, 0))} تومان رزرو شد` : 'در انتظار پذیرش', state: acc.length === n && n ? 'done' : pkg.sentAt ? 'current' : 'pending' },
    { label: LOCK_META.milestone.label, sub: `${faDigits(ms.relN)} از ${faDigits(stepCount)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده${ms.backN ? ` · ${faDigits(ms.backN)} بازپس‌گرفته` : ''}`, state: ms.donePct >= 100 ? 'done' : acc.length ? 'current' : 'pending' },
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
  const doCancel = () => cancel.mutate(pkg.id, {
    onSuccess: () => { setConfirmCancel(false); toast(`پیش‌نویس «${pkg.title}» لغو شد`); router.push(routes.org.packages); },
    onError: (e) => { setConfirmCancel(false); toast(errMsg(e), 'error'); },
  });

  // ───── key numbers ─────
  const stats: Stat[] = isMs ? [
    { label: 'ارزش قرارداد', value: total.value, unit: `${total.unit} تومان`.trim(), note: `${faDigits(stepCount)} مرحله · صندوق طلا` },
    { label: 'آزادشده', value: rel.value, unit: `${rel.unit} تومان`.trim(), note: `${faDigits(ms.relPct)}٪ · ${faDigits(ms.relN)} مرحله`, trend: ms.relN ? 'up' : undefined },
    { label: 'رزروشده', value: lck.value, unit: `${lck.unit} تومان`.trim(), note: ms.backN ? `${faDigits(100 - ms.donePct)}٪ · بازپس‌گرفته ${cmp(backAmt)} تومان` : `${faDigits(100 - ms.donePct)}٪ · آزاد در سررسید مراحل` },
    {
      label: 'در انتظار تأیید شما', value: faDigits(pendSteps.length), unit: 'مرحله', trend: ms.waiting ? 'warn' : undefined,
      note: ms.waiting ? `${cmp((pkg.total * ms.waiting.sharePct) / 100)} تومان · ${dueText(ms.waiting.dueDate)}`
        : ms.pending ? `مرحله ${faDigits(ms.pendingIdx)} ${ms.pending.dueDate ? `در ${jDayMonth(ms.pending.dueDate)} ` : ''}خودکار آزاد می‌شود`
        : ms.donePct >= 100 ? (ms.backN ? 'همه‌ی مراحل تعیین تکلیف شد' : 'همه‌ی مراحل آزاد شد') : 'مرحله‌ای در انتظار نیست',
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
        sub={isMs ? <>{rm.label} · گیرنده: {firstName}</> : <>{rm.label} · {perPersonText(pkg, money) ? <><span className="num">{perPersonText(pkg, money)}</span> تومان هر نفر</> : 'مبلغ تعیین نشده'}</>}
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
          onApprove={approve} busy={release.isPending}
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
        ['مبلغ هر نفر', <span key="p" className="num">{perPersonText(pkg, money) ? `${perPersonText(pkg, money)} تومان` : '—'}</span>],
        ['تخصیص', allocationText(pkg)],
        ['شیوه‌ی دریافت', <span key="l" className="num">{lp.type === 'vesting' ? `${LOCK_META.vesting.label} تا ${jDate(lp.releaseAt)}` : LOCK_META.none.label}</span>],
        ['مهلت پذیرش', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : '۳۰ روز پس از ارسال'}</span>],
      ]} />
      {lp.type === 'vesting' && accepted > 0 && (
        <Section title="نزد کارکنان (پذیرفته‌شده)">
          <FreeLocked free={a.rial} locked={a.gold + a.fixed} fmt={cmp} />
        </Section>
      )}
      <Note tone="info">
        {lp.type === 'vesting' ? `بخش صندوقی هر کارمند پس از تأیید، تا ${jDate(lp.releaseAt)} به‌عنوان ${LOCK_META.vesting.label} در دارایی او می‌ماند، بازده می‌گیرد و در این تاریخ خودکار آزاد می‌شود.` : 'سهم هر کارمند پس از تأیید بلافاصله آزاد است و بازده می‌گیرد.'}
      </Note>
    </Card>
  );
}

/** Widths of the two editable columns of «همه‌ی مراحل» (the section title row labels them). */
const DUE_W = 136;
const AP_W = 76;
const timeOf = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);
/** A typed date is complete when day and month have two digits (or it came from the calendar). */
const fullDate = (text: string) => /^\d{4}\/\d{2}\/\d{2}$/.test(enDigits(text).trim());

function MilestoneView({ pkg, ins, firstName, relAmt, lockAmt, steps, onApprove, busy: approving }: {
  pkg: OrgPackage;
  ins?: PackageInsights;
  firstName: string; relAmt: number; lockAmt: number; steps: TimelineStep[];
  onApprove: (stepId: string, idx: number, pct: number) => void; busy: boolean;
}) {
  const ms = milestoneStats(pkg);
  const lp = pkg.lockPolicy;
  const upd = useUpdateMilestoneStep();
  const reclaim = useReclaimMilestone();
  const busy = approving || reclaim.isPending;
  const toast = useToast();
  /** «بازپس‌گیری» dialog: the step and the explanation for the employee (required). */
  const [back, setBack] = useState<{ s: MilestoneStep; i: number } | null>(null);
  const [backNote, setBackNote] = useState('');
  const [backErr, setBackErr] = useState('');
  /** Typed due dates not saved yet (step id → text) and their problem, shown under the step. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dueErr, setDueErr] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  // a draft has no progress yet → show the planned steps as future steps
  const rows: MilestoneStep[] = ms.steps.length ? ms.steps : lp.type === 'milestone' ? lp.steps.map((s, i) => ({ ...s, id: `plan-${i}`, status: 'future' as const, releasedAt: undefined })) : [];
  const n = pkg.recipients.length;
  const single = n === 1 ? ins?.recipients[0] : undefined;
  const anyAccepted = pkg.recipients.some((r) => r.status === 'accepted');
  const sent = pkg.status === 'sent';
  const editable = (sent || pkg.status === 'draft') && ms.steps.length > 0;
  const progText = `${faDigits(ms.relN)} از ${faDigits(rows.length)} مرحله · ${faDigits(ms.relPct)}٪ آزاد شده${ms.backN ? ` · ${faDigits(ms.backN)} بازپس‌گرفته` : ''}`;
  const waiting = ms.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.status === 'pending_approval');
  const nowT = now().getTime();
  const claimText = (s: MilestoneStep) => {
    const claim = ins?.claims.find((c) => c.stepId === s.id) ?? ins?.claims[0];
    if (claim?.trigger === 'due_date') return <>سررسید این مرحله <span className="num">{jDayMonth(claim.createdAt)}</span> رسید و درخواست تأیید آن در «درخواست‌ها» ثبت شد.</>;
    if (claim) return <>اعلام انجام توسط {claim.requesterName}: <span className="num">{relTime(claim.createdAt, now())}</span>{claim.note ? ` · ${claim.note}` : ''}</>;
    const due = s.dueDate ? <> · <span className="num">{timeOf(s.dueDate) <= nowT ? `سررسید ${jDayMonth(s.dueDate)} گذشت` : `سررسید ${jDayMonth(s.dueDate)}`}</span></> : null;
    return anyAccepted ? <>هنوز اعلام انجامی از طرف کارمند ثبت نشده است{due}</> : 'در انتظار پذیرش قرارداد توسط کارمند';
  };
  const defs: [string, string][] = [
    ['دارایی', `صندوق طلا · با قیمت روز ${pkg.sentAt ? jDayMonth(pkg.sentAt) : '—'}`],
    ['ایجاد', `${jDayMonth(pkg.createdAt, true)} · ${n > 1 ? faDigits(n) + ' گیرنده' : 'یک گیرنده'}`],
    ['آزادسازی', 'در سررسید هر مرحله · با تأیید شما یا خودکار'],
    ['پس از آزادسازی', 'قابل فروش و برداشت'],
  ];

  // ───── inline edits (saved at once) ─────
  const dropDraft = (id: string) => {
    setDrafts((d) => { const x = { ...d }; delete x[id]; return x; });
    setDueErr((d) => { const x = { ...d }; delete x[id]; return x; });
  };
  const save = (s: MilestoneStep, patch: { requiresApproval?: boolean; dueDate?: string }, msg: (after?: MilestoneStep) => string) => {
    setSaved(false);
    upd.mutate({ packageId: pkg.id, stepId: s.id, ...patch }, {
      onSuccess: (p) => { dropDraft(s.id); setSaved(true); toast(msg(p.milestoneProgress?.find((x) => x.id === s.id))); },
      onError: (e) => { dropDraft(s.id); toast(errMsg(e), 'error'); },
    });
  };
  const toggleApproval = (s: MilestoneStep, i: number, on: boolean) => save(s, { requiresApproval: on }, (after) => {
    const no = faDigits(i + 1);
    if (after?.status === 'released') return `مرحله ${no} آزاد شد · سررسید آن گذشته بود`;
    if (on) return timeOf(s.dueDate) <= nowT ? `مرحله ${no} در «درخواست‌ها» منتظر تأیید شماست` : `مرحله ${no} پس از تأیید شما آزاد می‌شود`;
    return `مرحله ${no} ${s.dueDate ? `در ${jDayMonth(s.dueDate)} ` : ''}خودکار آزاد می‌شود`;
  });
  /** Problem of a due date, or null. Bounds: not in the past, not before the previous step, not after the next one. */
  const dueProblem = (iso: string | null, i: number) => {
    if (!iso) return 'سررسید را به شکل ۱۴۰۵/۰۹/۲۰ وارد کنید';
    if (timeOf(iso) <= nowT) return 'سررسید باید امروز یا پس از آن باشد';
    const prev = rows[i - 1]?.dueDate;
    const next = rows[i + 1]?.dueDate;
    if (prev && timeOf(iso) < timeOf(prev)) return 'سررسید نمی‌تواند پیش از مرحله‌ی قبل باشد';
    if (next && timeOf(iso) > timeOf(next)) return 'سررسید نمی‌تواند پس از مرحله‌ی بعد باشد';
    return null;
  };
  /** Typing / calendar: saves a complete valid date at once. Blur: saves a valid date or puts the saved one back. */
  const editDue = (s: MilestoneStep, i: number, text: string, blur = false) => {
    if (!blur) setDrafts((d) => ({ ...d, [s.id]: text }));
    const iso = parseJalali(text);
    if (iso && s.dueDate && jDate(iso) === jDate(s.dueDate)) { dropDraft(s.id); return; }
    if (!blur && !fullDate(text)) { setDueErr((d) => { const x = { ...d }; delete x[s.id]; return x; }); return; }
    const problem = dueProblem(iso, i);
    if (problem) {
      if (blur) { dropDraft(s.id); toast(`${problem}؛ سررسید قبلی ماند`, 'error'); }
      else setDueErr((d) => ({ ...d, [s.id]: problem }));
      return;
    }
    save(s, { dueDate: iso! }, () => `سررسید مرحله ${faDigits(i + 1)}: ${jDayMonth(iso!, true)}`);
  };
  const saving = (s: MilestoneStep) => upd.isPending && upd.variables?.stepId === s.id;
  const stepAmt = (s: MilestoneStep) => Math.round((pkg.total * s.sharePct) / 100);
  const openBack = (s: MilestoneStep, i: number) => { setBackNote(''); setBackErr(''); setBack({ s, i }); };
  const doBack = () => {
    if (!back) return;
    const note = backNote.trim();
    if (note.length < 3) { setBackErr('توضیح برای کارمند را بنویسید'); return; }
    reclaim.mutate({ packageId: pkg.id, stepId: back.s.id, note }, {
      onSuccess: () => { toast(`مرحله‌ی ${faDigits(back.i + 1)} بازپس گرفته شد · ${money(stepAmt(back.s))} تومان به سازمان برگشت`); setBack(null); },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  return (
    <div className="nm-grid side">
      <Card
        title="مراحل قرارداد" sub={progText} more={{ label: 'درخواست‌های تأیید مرحله', href: routes.org.requests }}
        actions={editable ? <span className="mute" role="status" style={{ fontSize: 12 }}>{upd.isPending ? 'در حال ذخیره…' : saved ? 'ذخیره شد' : ''}</span> : undefined}
      >
        {!anyAccepted && sent && <Note tone="warn">کارمند هنوز قرارداد را در اپ نمادنو نپذیرفته است؛ آزادسازی مراحل پس از پذیرش او شروع می‌شود.</Note>}

        {sent && waiting.map(({ s, i }) => (isAutoStep(s) ? (
          <Section key={s.id} title="مرحله‌ی جاری" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{money((pkg.total * s.sharePct) / 100)} تومان</span>}>
            <b style={{ fontSize: 14, fontWeight: 600 }}>مرحله {faDigits(i + 1)} · {s.title}</b>
            <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              {s.dueDate ? <>این مرحله در <span className="num">{jDayMonth(s.dueDate, true)}</span> خودکار آزاد می‌شود.</> : 'سررسید این مرحله را مشخص کنید تا در آن تاریخ خودکار آزاد شود.'}
            </span>
          </Section>
        ) : (
          <Section key={s.id} title="در انتظار تأیید شما" action={<span className="num" style={{ color: 'var(--text-primary)' }}>{money((pkg.total * s.sharePct) / 100)} تومان</span>}>
            <b style={{ fontSize: 14, fontWeight: 600 }}>مرحله {faDigits(i + 1)} · {s.title}</b>
            <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>{claimText(s)}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="nm-btn" onClick={() => onApprove(s.id, i + 1, s.sharePct)} disabled={busy || !anyAccepted}>
                <Icon d={I.check} size={16} strokeWidth={2.2} />تأیید انجام تعهد و آزادسازی {faDigits(s.sharePct)}٪
              </button>
              <button type="button" className="nm-btn line danger" onClick={() => openBack(s, i)} disabled={busy || !anyAccepted}>بازپس‌گیری</button>
            </div>
          </Section>
        )))}

        <Section
          title="همه‌ی مراحل"
          action={(
            <span aria-hidden="true" style={{ display: 'inline-flex', gap: 6 }}>
              <span style={{ width: DUE_W }}>سررسید</span>
              <span style={{ width: AP_W, textAlign: 'center' }}>نیاز به تأیید</span>
            </span>
          )}
        >
          <List>
            {rows.map((s, i) => {
              const released = s.status === 'released';
              const reclaimed = s.status === 'reclaimed';
              const current = s.status === 'pending_approval';
              const auto = isAutoStep(s);
              const canEdit = editable && !released && !reclaimed && !s.id.startsWith('plan-');
              const busyRow = saving(s);
              const shownAp = busyRow && upd.variables?.requiresApproval !== undefined ? upd.variables.requiresApproval : !auto;
              const err = dueErr[s.id];
              const [state, color] = released ? [`آزاد شده ${s.releasedAt ? jDayMonth(s.releasedAt) : ''}`, 'var(--success-text)']
                : reclaimed ? [`${s.reclaimedAt ? jDayMonth(s.reclaimedAt) : ''}${s.reclaimNote ? ` · ${s.reclaimNote}` : ''}`, 'var(--text-secondary)']
                : !current ? ['', '']
                : auto ? ['خودکار در سررسید', 'var(--info-text)']
                : ['در انتظار تأیید شما', 'var(--warning-text)'];
              return (
                <ListRow
                  key={s.id}
                  lead={<StepMark state={released ? 'done' : current ? 'current' : 'pending'} n={i + 1} />}
                  title={reclaimed ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}><span className="nm-el">{s.title}</span><Pill tone="error">بازپس گرفته شد</Pill></span> : s.title}
                  sub={err ? <span style={{ color: 'var(--error-text)' }} role="alert">{err}</span> : (
                    <>
                      <span className="num">سهم {faDigits(s.sharePct)}٪ · {money((pkg.total * s.sharePct) / 100)} تومان</span>
                      {state && <> · <span style={{ color }}>{state}</span></>}
                    </>
                  )}
                  trail={(
                    <>
                      <span style={{ width: DUE_W, display: 'flex' }}>
                        {canEdit ? (
                          <DateInput
                            value={drafts[s.id] ?? (s.dueDate ? jDate(s.dueDate) : '')}
                            onChange={(v) => editDue(s, i, v)}
                            onBlur={() => { if (drafts[s.id] !== undefined) editDue(s, i, drafts[s.id], true); }}
                            min={rows[i - 1]?.dueDate && timeOf(rows[i - 1].dueDate) > nowT ? rows[i - 1].dueDate : now()}
                            max={rows[i + 1]?.dueDate}
                            label={`سررسید مرحله ${faDigits(i + 1)}`} placeholder="سررسید" invalid={!!err} disabled={busyRow} full
                          />
                        ) : <span className="num mute" style={{ paddingInline: 11 }}>{s.dueDate ? jDate(s.dueDate) : '—'}</span>}
                      </span>
                      <span style={{ width: AP_W, display: 'flex', justifyContent: 'center' }}>
                        <Switch on={shownAp} onChange={(v) => toggleApproval(s, i, v)} disabled={!canEdit || busyRow} label={`نیاز به تأیید مرحله ${faDigits(i + 1)}`} />
                      </span>
                    </>
                  )}
                />
              );
            })}
          </List>
        </Section>
        <span className="mute" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, lineHeight: 1.7 }}>
          <Icon d={I.flag} size={14} />هر مرحله در سررسید خود آزاد می‌شود: با «نیاز به تأیید» پس از تأیید شما در درخواست‌ها، بدون آن خودکار.
        </span>
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
          <Note tone="info">بخش رزروشده در دارایی {firstName} می‌ماند و بازده می‌گیرد؛ سهم هر مرحله در سررسید آن، با تأیید سازمان یا خودکار، آزاد و قابل فروش یا برداشت می‌شود.</Note>
        </Card>
        <Card title="روند قرارداد"><Timeline steps={steps} /></Card>
      </div>

      {back && (
        <Dialog
          open onClose={() => setBack(null)} title={`بازپس‌گیری مرحله‌ی ${faDigits(back.i + 1)}`}
          sub={`${back.s.title} · ${money(stepAmt(back.s))} تومان`}
          icon={<Tile d={I.ban} tone="error" size="lg" />}
          footer={(
            <>
              <button type="button" className="nm-btn ghost" onClick={() => setBack(null)}>انصراف</button>
              <button type="button" className="nm-btn danger" disabled={reclaim.isPending} onClick={doBack}>{reclaim.isPending ? 'در حال ثبت…' : 'بازپس‌گیری'}</button>
            </>
          )}
        >
          <span className="mute">سهم این مرحله (<span className="num">{money(stepAmt(back.s))}</span> تومان) از دارایی {firstName} برداشته می‌شود و به سازمان برمی‌گردد. این کار بازگشت ندارد.</span>
          <Field label="توضیح برای کارمند" htmlFor="ms-back-note" help="این توضیح در اعلان کارمند نمایش داده می‌شود." error={backErr || undefined}>
            <textarea
              id="ms-back-note" className="nm-ta" rows={3} value={backNote} autoFocus aria-label="توضیح برای کارمند" aria-invalid={!!backErr}
              onChange={(e) => { setBackNote(e.target.value); setBackErr(''); }}
              placeholder="مثلاً: این بخش از پروژه به زمان دیگری منتقل شد."
            />
          </Field>
        </Dialog>
      )}
    </div>
  );
}
