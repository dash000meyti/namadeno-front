'use client';
/**
 * Send wizard — confirmation: heading + all steps done → one calm card (summary, status, next actions). Three outcomes:
 *   sent              «بسته به {n} همکار ارسال شد» — funded from «آزاد» (or after Namadno approved its receipt)
 *   awaiting_payment  «بسته در صف تأیید واریز است» — the receipt (thumbnail, amount, description, state);
 *                     a rejected receipt shows the reason and «بارگذاری فیش تازه» (AnnounceDepositDialog with packageId).
 *   awaiting_stock    «بسته ثبت شد و در صف تأمین موجودی است» — paid from «آزاد» (its whole amount set aside), Namadno's fund
 *                     stock is short: sent automatically at the latest by `stockEta`; recipients are not notified until then.
 * Reads the package (GET /org/packages/:id) and its latest receipt (GET /org/account entries by packageId). There is no payment deadline.
 */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOrgEmployees, useOrgPackage } from '@/api/org';
import { useOrgAccount } from '@/api/org-money-extra';
import { BigNum, Card, Empty, ErrorBlock, KV, List, ListRow, Note, Pill, Section, SkeletonCard } from '@/components/panel/kit';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { AnnounceDepositDialog } from '@/components/org/money/AnnounceDepositDialog';
import { OM, entryState, latestReceiptFor } from '@/components/org/money/meta';
import { LockTag, WizardHeader } from '@/components/org/packages/Stepper';
import { I, allocationText, perPersonText, splitCompact } from '@/components/org/packages/meta';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDateTime, jDate, money } from '@/lib/format';

const CARD = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const;

function SentStep() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const { data: pkg, isLoading, isError, error, refetch } = useOrgPackage(id);
  const { data: emps } = useOrgEmployees();
  const { data: acct } = useOrgAccount();
  const [renewOpen, setRenewOpen] = useState(false);

  const header = <WizardHeader step={4} hideCancel />;
  if (!id || isError) return (<>{header}<ErrorBlock error={error} message="بسته پیدا نشد" onRetry={id ? () => refetch() : undefined} /></>);
  if (isLoading || !pkg) return (<>{header}<div style={CARD}><SkeletonCard h={460} /></div></>);

  const n = pkg.recipients.length;
  const units = new Set(pkg.recipients.map((r) => emps?.find((e) => e.id === r.employeeId)?.department).filter(Boolean)).size;
  const total = splitCompact(pkg.total);
  const lp = pkg.lockPolicy;
  const awaiting = pkg.status === 'awaiting_payment';
  const stockWait = pkg.status === 'awaiting_stock';
  const sent = pkg.status === 'sent' || pkg.status === 'completed';
  const cancelled = pkg.status === 'cancelled';
  const rc = latestReceiptFor(acct?.entries, pkg.id);
  const rcState = rc ? entryState(rc) : undefined;
  const rejected = rc?.status === 'rejected';
  const perText = perPersonText(pkg, money) || '—';

  const head = awaiting ? {
    icon: OM.clock, tone: 'warning' as const,
    title: 'بسته در صف تأیید واریز است',
    sub: <>{pkg.title} · {faDigits(n)} همکار · {perText} تومان هر نفر · تا تأیید فیش توسط نمادنو ارسال نمی‌شود و چیزی بلاک نمی‌شود.</>,
  } : stockWait ? {
    icon: OM.clock, tone: 'info' as const,
    title: 'بسته ثبت شد و در صف تأمین موجودی است',
    sub: <>پرداخت از «آزاد» انجام شد؛ موجودی صندوق نمادنو در حال تأمین است و بسته {pkg.stockEta ? <>حداکثر تا <span className="num">{jDateTime(pkg.stockEta)}</span></> : 'پس از تأمین موجودی'} برای {faDigits(n)} همکار ارسال می‌شود. همکاران تا آن زمان باخبر نمی‌شوند.</>,
  } : sent ? {
    icon: I.check, tone: 'success' as const,
    title: `بسته به ${faDigits(n)} همکار ارسال شد`,
    sub: <>{pkg.title} · {perText} تومان هر نفر · در صندوق ورودی همکاران در اپ نمادنو قرار گرفت و منتظر پذیرش آن‌هاست.</>,
  } : cancelled ? {
    icon: I.ban, tone: 'neutral' as const,
    title: 'این بسته لغو شده است',
    sub: <>{pkg.title} · برای همکاران ارسال نمی‌شود.</>,
  } : {
    icon: I.warn, tone: 'warning' as const,
    title: 'این بسته هنوز ارسال نشده است',
    sub: <>{pkg.title} · {faDigits(n)} نفر · برای ارسال، مرحله بررسی را تکمیل کنید.</>,
  };

  return (
    <>
      {header}
      <Card style={CARD}>
        <Empty icon={head.icon} tone={head.tone} title={head.title} sub={head.sub} action={<BigNum value={money(pkg.total)} unit="تومان" />} />
        <KV rows={[
          ['شماره پیگیری', <span key="id" className="num ltr">{pkg.id.toUpperCase()}</span>],
          ['گیرندگان', `${faDigits(n)} نفر${units ? ` · ${faDigits(units)} واحد` : ''}`],
          ['جمع کل', [total.value, total.unit, 'تومان'].filter(Boolean).join(' ')],
          ['تخصیص', allocationText(pkg)],
          ['شیوه‌ی دریافت', <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={lp.type} /><span className="num">{lp.type === 'vesting' ? 'تا ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `${faDigits(lp.steps.length)} مرحله` : 'پس از پذیرش'}</span></span>],
          ...(awaiting
            ? [['زمان ثبت', <span key="t" className="num">{pkg.submittedAt ? jDateTime(pkg.submittedAt) : '—'}</span>] as [string, ReactNode]]
            : stockWait
            ? [
                ['زمان ثبت', <span key="t" className="num">{jDateTime(pkg.stockQueuedAt ?? pkg.submittedAt ?? pkg.createdAt)}</span>],
                ['ارسال', <span key="s" className="num">{pkg.stockEta ? `حداکثر تا ${jDateTime(pkg.stockEta)}` : 'پس از تأمین موجودی'}</span>],
              ] as [string, ReactNode][]
            : [['زمان ارسال', <span key="t" className="num">{pkg.sentAt ? jDateTime(pkg.sentAt) : '—'}</span>] as [string, ReactNode]]),
        ]} />

        {stockWait && (
          <Note tone="mute" icon={OM.clock}>
            کل مبلغ بسته (<span className="num">{money(pkg.funding?.fromFree ?? pkg.total)}</span> تومان) از «آزاد» حساب ریالی سازمان برای آن کنار گذاشته شد. با ارسال، تا دریافت همکاران بلاک می‌ماند؛ اگر بسته را لغو کنید به «آزاد» برمی‌گردد.
          </Note>
        )}

        {awaiting && (
          <Section title="فیش واریز" action={rcState && <Pill tone={rcState.tone} dot>{rc?.status === 'expected' ? 'در انتظار تأیید نمادنو' : rcState.label}</Pill>}>
            {rc ? (
              <List>
                <ListRow
                  lead={<ReceiptThumb receipt={rc.receipt} size={48} />}
                  title={<span className="num">{money(rc.amount)} تومان</span>}
                  sub={rc.note ? faDigits(rc.note) : 'بدون توضیحات'}
                  trail={<span className="num mute" style={{ fontSize: 12 }}>{jDate(rc.at)}</span>}
                />
              </List>
            ) : !acct ? <span className="mute" style={{ fontSize: 12.5 }}>در حال دریافت فیش…</span> : null}
            {rejected ? (
              <Note tone="err" action={<button type="button" className="nm-btn sm" onClick={() => setRenewOpen(true)}>بارگذاری فیش تازه</button>}>
                فیش رد شد{rc?.rejectReason ? `: ${rc.rejectReason}` : '.'}
              </Note>
            ) : (
              <Note tone="mute" icon={OM.clock}>
                نمادنو فیش را بررسی می‌کند؛ پس از تأیید، مبلغ به حساب ریالی اضافه و بسته برای همکاران ارسال می‌شود. همکاران تا آن زمان از این بسته باخبر نمی‌شوند.
                {pkg.funding && pkg.funding.fromFree > 0 ? <> <span className="num">{money(pkg.funding.fromFree)}</span> تومان از «آزاد» برای این بسته کنار گذاشته شده است.</> : null}
              </Note>
            )}
          </Section>
        )}

        <Note tone="mute" icon={LOCK_META[lp.type].d}>
          {lp.type === 'vesting' && <>پس از تأیید هر کارمند، بخش صندوقی بسته‌اش تا <span className="num">{jDate(lp.releaseAt)}</span> به‌عنوان {LOCK_META.vesting.label} در دارایی او رزرو می‌شود و بازده می‌گیرد؛ بخش ریالی از ابتدا آزاد است.</>}
          {lp.type === 'milestone' && <>پس از تأیید کارمند، مبلغ در صندوق طلای او رزرو می‌شود و سهم هر مرحله با تأیید شما در صفحهٔ بسته آزاد می‌شود.</>}
          {lp.type === 'none' && <>کل بسته پس از تأیید کارمند آزاد است و قابل فروش{pkg.cashAllowed ? ' و برداشت' : ''} است.</>}
        </Note>
        {sent && (
          <Note tone="ok">
            {rc?.status === 'done'
              ? <>فیش واریز (<span className="num">{money(rc.amount)}</span> تومان) تأیید شد و مبلغ بسته از «آزاد» حساب ریالی سازمان بلاک شد؛ تا دریافت همکاران بلاک می‌ماند.</>
              : <>کل مبلغ بسته (<span className="num">{money(pkg.total)}</span> تومان) از «آزاد» حساب ریالی سازمان بلاک شد و تا دریافت همکاران بلاک می‌ماند.</>}
          </Note>
        )}
        {sent && (
          <Note tone="info">
            وضعیت فعلی: <b>در انتظار تأیید کارکنان</b> · اعلان برای {faDigits(n)} گیرنده ارسال شد.{pkg.expiresAt ? <> مهلت تأیید تا <span className="num">{jDate(pkg.expiresAt)}</span>.</> : null}
          </Note>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', paddingTop: 4 }}>
          <Link href={routes.org.packages} className="nm-btn">مشاهده بسته‌ها</Link>
          <Link href={pkg.status === 'draft' ? routes.org.newReview(pkg.id) : routes.org.package(pkg.id)} className="nm-btn ghost">{pkg.status === 'draft' ? 'بررسی و ارسال' : 'جزئیات این بسته'}</Link>
          <Link href={routes.org.dashboard} className="nm-btn text">داشبورد</Link>
        </div>
      </Card>
      <AnnounceDepositDialog open={renewOpen} amount={rc?.amount} minAmount={pkg.funding?.toDeposit} packageId={pkg.id} packageTitle={pkg.title} onClose={() => setRenewOpen(false)} />
    </>
  );
}

export default function NewPackageSentPage() {
  return <Suspense fallback={null}><SentStep /></Suspense>;
}
