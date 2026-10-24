'use client';
/**
 * Send wizard, step 3 — review, budget check and send. Kit wizard page: heading + steps → package settings
 * and recipients beside the approval card (chain, balance, confirmation) → sticky action bar with «تأیید و ارسال».
 */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError } from '@/api/client';
import { useOrgContract, useOrgEmployees, useOrgMe, useOrgPackage, useSendPackage } from '@/api/org';
import {
  ActionBar, Ava, BigNum, Card, ErrorBlock, Ident, KV, List, ListRow, Note, Pill, Section, SkeletonCard, Table, TableFoot,
  type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, StepMark, WizardHeader, type StepState } from '@/components/org/packages/Stepper';
import { I, allocationText, perPersonText, splitCompact } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDayMonth, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import type { OrgPackage } from '@/types/domain';

const SHOW = 6;
type Recipient = OrgPackage['recipients'][number];

function ReviewStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: pkg, isLoading, isError, error, refetch } = useOrgPackage(draftId);
  const { data: contract } = useOrgContract();
  const { data: me } = useOrgMe();
  const { data: emps } = useOrgEmployees();
  const send = useSendPackage();
  const toast = useToast();
  const [ack, setAck] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [serverErr, setServerErr] = useState<{ code: string; message: string } | null>(null);

  if (!draftId) {
    return (
      <>
        <WizardHeader step={3} />
        <Note tone="warn" action={<Link href={routes.org.newRecipients()} className="nm-btn sm ghost">شروع ارسال جدید</Link>}>پیش‌نویسی انتخاب نشده است.</Note>
      </>
    );
  }
  if (isError) return (<><WizardHeader step={3} /><ErrorBlock error={error} message="پیش‌نویس پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg) return (<><WizardHeader step={3} draftId={draftId} /><div className="nm-grid side"><SkeletonCard h={480} /><SkeletonCard h={420} /></div></>);
  if (pkg.status !== 'draft') {
    return (
      <>
        <WizardHeader step={3} />
        <Note tone="info" action={<Link href={routes.org.package(pkg.id)} className="nm-btn sm ghost">مشاهده بسته</Link>}>این بسته قبلاً ارسال شده است.</Note>
      </>
    );
  }

  const n = pkg.recipients.length;
  const remaining = contract ? contract.budgetYear - contract.budgetUsed : 0;
  const over = !!contract && pkg.total > remaining;
  const remainAfter = splitCompact(Math.max(0, remaining - pkg.total));
  const remainNow = splitCompact(remaining);
  const lp = pkg.lockPolicy;
  const per = perPersonText(pkg, money);
  const missing = !pkg.total ? 'مبلغ هر نفر تعیین نشده است.' : !n ? 'هیچ گیرنده‌ای انتخاب نشده است.' : '';
  const canSend = ack && !over && !missing && !send.isPending;
  const empOf = (id: string) => emps?.find((e) => e.id === id);
  const units = new Set(pkg.recipients.map((r) => empOf(r.employeeId)?.department).filter(Boolean)).size;
  const adminName = me?.admin.name ?? 'نیما رضایی';

  const chain: { label: string; sub: string; state: StepState; s: string; tone: Tone }[] = [
    { label: me?.admin.role ?? 'کارشناس', sub: `${adminName} · ${relTime(pkg.createdAt, now())}`, state: ack ? 'done' : 'current', s: ack ? 'تأیید شد' : 'در انتظار', tone: ack ? 'success' : 'warning' },
    { label: 'کنترل بودجه سازمان', sub: over ? 'کسری موجودی حساب سازمان' : `موجودی ${remainNow.value} ${remainNow.unit} تومان`, state: !ack ? 'pending' : over ? 'current' : 'done', s: over ? 'کسری بودجه' : 'کافی', tone: over ? 'error' : 'success' },
    { label: 'ارسال به کارکنان', sub: 'بلافاصله پس از تأیید شما · صندوق ورودی و اعلان', state: canSend ? 'current' : 'pending', s: 'آماده ارسال', tone: canSend ? 'warning' : 'neutral' },
  ];

  const defs: [string, ReactNode][] = [
    ['عنوان', pkg.title],
    ['مبلغ هر نفر', <span key="a" className="num" style={per ? undefined : { color: 'var(--error-text)' }}>{per ? `${per} تومان` : '—'}</span>],
    ['نحوه مبلغ', pkg.amountSource === 'file' ? 'از فایل اکسل (برای هر نفر جدا)' : 'یکسان برای همه'],
    ['تخصیص دارایی', allocationText(pkg)],
    ['شیوه‌ی دریافت', <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={lp.type} /><span className="num">{lp.type === 'vesting' ? 'آزاد در ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `${faDigits(lp.steps.length)} مرحله` : 'پس از پذیرش'}</span></span>],
    ['مهلت تأیید', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : 'بدون مهلت'}</span>],
  ];

  const confirm = () => {
    if (!canSend) return;
    setServerErr(null);
    send.mutate(pkg.id, {
      onSuccess: (p) => router.push(routes.org.newSent(p.id)),
      onError: (e) => {
        const code = e instanceof ApiRequestError ? e.code : 'error';
        setServerErr({ code, message: errMsg(e) });
        toast(errMsg(e), 'error');
      },
    });
  };

  const list = showAll ? pkg.recipients : pkg.recipients.slice(0, SHOW);
  /** Milestone steps released automatically at their due date («نیاز به تأیید» off). */
  const msAuto = lp.type === 'milestone' ? lp.steps.filter((s) => s.requiresApproval === false).length : 0;
  const lockText = lp.type === 'vesting'
    ? <>پس از تأیید هر کارمند، بخش صندوقی بسته‌اش (طلا و درآمد ثابت) به‌عنوان <b>«{LOCK_META.vesting.label}»</b> تا <span className="num">{jDate(lp.releaseAt)}</span> در دارایی او رزرو می‌شود، بازده می‌گیرد و سپس خودکار آزاد می‌شود. بخش ریالی از ابتدا آزاد است.</>
    : lp.type === 'milestone'
      ? <>پس از تأیید کارمند، کل مبلغ به‌عنوان <b>«{LOCK_META.milestone.label}»</b> در صندوق طلای او رزرو می‌شود و طی {faDigits(lp.steps.length)} مرحله ({lp.steps.map((s) => `${faDigits(s.sharePct)}٪${s.dueDate ? ' تا ' + jDayMonth(s.dueDate) : ''}`).join('، ')})، در سررسید هر مرحله آزاد می‌شود{msAuto ? `؛ ${msAuto === lp.steps.length ? 'همه‌ی مراحل' : faDigits(msAuto) + ' مرحله'} خودکار و بقیه با تأیید شما` : ' با تأیید شما'}.</>
      : <>بسته پس از تأیید کارمند بلافاصله <b>آزاد</b> است و کارمند می‌تواند آن را بفروشد{pkg.cashAllowed ? ' یا برداشت کند' : ''}.</>;
  const lockTone = lp.type === 'none' ? 'ok' : 'info';

  const columns: Column<Recipient>[] = [
    {
      key: 'who', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (r) => {
        const e = empOf(r.employeeId);
        return <Ident lead={<Ava letter={r.name[0]} id={r.employeeId} size="sm" />} title={r.name} sub={e ? <span className="num">{faDigits(e.employeeCode)}</span> : undefined} />;
      },
    },
    { key: 'dept', label: 'واحد', width: 'minmax(0, 1fr)', render: (r) => <span className="el mute">{empOf(r.employeeId)?.department ?? '—'}</span> },
    { key: 'amount', label: 'مبلغ بسته (تومان)', width: '132px', align: 'end', render: (r) => <span className="num" style={{ fontWeight: 600 }}>{money(r.amount)}</span> },
  ];

  return (
    <>
      <WizardHeader step={3} draftId={pkg.id} recipientsSub={`${faDigits(n)} نفر`} />

      <div className="nm-grid side">
        <div className="nm-stack">
          <Card title="تنظیمات بسته" more={{ label: 'ویرایش', href: routes.org.newSettings(pkg.id) }}>
            <KV rows={defs} />
            {pkg.message && <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>پیام به کارکنان: <span style={{ color: 'var(--text-primary)' }}>«{pkg.message}»</span></span>}
            <Note tone={lockTone} icon={LOCK_META[lp.type].d}>{lockText}</Note>
          </Card>

          <Card flush title="گیرندگان" count={n} sub={units ? `${faDigits(units)} واحد` : undefined} more={{ label: 'ویرایش', href: routes.org.newRecipients(pkg.id) }}>
            <Table columns={columns} rows={list} rowKey={(r) => r.employeeId} rowLabel={(r) => r.name} />
            <TableFoot shown={list.length} total={n} unit="نفر">
              {n > SHOW && (
                <button type="button" className="nm-more" style={{ marginRight: 'auto' }} onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'نمایش کمتر' : <>نمایش همه · <span className="num">{faDigits(n - SHOW)}</span> نفر دیگر</>}
                </button>
              )}
            </TableFoot>
          </Card>
        </div>

        <Card title="تأیید و ارسال">
          <Section title="زنجیره تأیید">
            <List>
              {chain.map((c, i) => (
                <ListRow key={c.label} lead={<StepMark state={c.state} n={i + 1} />} title={c.label} sub={c.sub} trail={<Pill tone={c.tone}>{c.s}</Pill>} />
              ))}
            </List>
          </Section>
          <Section title="منبع و موجودی">
            <BigNum value={money(pkg.total)} unit="تومان" />
            <span style={{ fontSize: 12.5, lineHeight: 1.7, color: over ? 'var(--error-text)' : 'var(--text-secondary)' }}>
              {over ? `از موجودی حساب سازمان (${remainNow.value} ${remainNow.unit}) بیشتر است` : `از حساب سازمان (موجودی ${remainNow.value} ${remainNow.unit}) رزرو می‌شود · باقی‌مانده ${remainAfter.value} ${remainAfter.unit}`}
            </span>
          </Section>
          <button type="button" className="nm-check" aria-pressed={ack} onClick={() => setAck(!ack)}>
            <i>{ack && <Icon d={I.check} size={13} strokeWidth={3} />}</i>اطلاعات بسته را بررسی کردم و درست است
          </button>
          {missing && <Note tone="err" action={<Link href={routes.org.newSettings(pkg.id)} className="nm-btn sm ghost">ویرایش</Link>}>{missing}</Note>}
          {serverErr && (
            <Note tone="err">
              {serverErr.message}
              {serverErr.code === 'over_budget' && <> <Link href={routes.org.newSettings(pkg.id)}>کاهش مبلغ</Link> یا <Link href={routes.org.newRecipients(pkg.id)}>گیرندگان</Link></>}
            </Note>
          )}
        </Card>
      </div>

      <ActionBar actions={(
        <>
          <Link href={routes.org.newSettings(pkg.id)} className="nm-btn text"><Icon d={I.chevR} size={16} />مرحله قبل</Link>
          <button type="button" className="nm-btn" onClick={confirm} disabled={!canSend}>
            <Icon d={I.send} size={16} />{send.isPending ? 'در حال ارسال…' : 'تأیید و ارسال به کارکنان'}
          </button>
        </>
      )}>
        <span><b className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(n)}</b> نفر · جمع <b className="num" style={{ color: 'var(--text-primary)' }}>{money(pkg.total)}</b> تومان</span>
        {over && <Pill tone="error" dot>کسری بودجه</Pill>}
        {!ack && <Pill tone="warning" dot>تأیید اطلاعات بسته لازم است</Pill>}
      </ActionBar>
    </>
  );
}

export default function NewPackageReviewPage() {
  return <Suspense fallback={null}><ReviewStep /></Suspense>;
}
