'use client';
/** Send wizard — confirmation after sending: heading + all steps done → one calm success card (summary, status, next actions). */
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOrgEmployees, useOrgPackage } from '@/api/org';
import { BigNum, Card, Empty, ErrorBlock, KV, Note, SkeletonCard } from '@/components/panel/kit';
import { LockTag, WizardHeader } from '@/components/org/packages/Stepper';
import { I, allocationText, splitCompact } from '@/components/org/packages/meta';
import { routes } from '@/lib/routes';
import { faDigits, jDateTime, jDate, money } from '@/lib/format';

const LOCK_D = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2';
const CARD = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const;

function SentStep() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const { data: pkg, isLoading, isError, error, refetch } = useOrgPackage(id);
  const { data: emps } = useOrgEmployees();

  const header = <WizardHeader step={4} hideCancel />;
  if (!id || isError) return (<>{header}<ErrorBlock error={error} message="بسته پیدا نشد" onRetry={id ? () => refetch() : undefined} /></>);
  if (isLoading || !pkg) return (<>{header}<div style={CARD}><SkeletonCard h={460} /></div></>);

  const n = pkg.recipients.length;
  const units = new Set(pkg.recipients.map((r) => emps?.find((e) => e.id === r.employeeId)?.department).filter(Boolean)).size;
  const total = splitCompact(pkg.total);
  const lp = pkg.lockPolicy;
  const sent = pkg.status !== 'draft';

  return (
    <>
      {header}
      <Card style={CARD}>
        <Empty
          icon={sent ? I.check : I.warn}
          tone={sent ? 'success' : 'warning'}
          title={sent ? 'بسته برای کارکنان ارسال شد' : 'این بسته هنوز ارسال نشده است'}
          sub={<>{pkg.title} · {faDigits(n)} نفر · {money(pkg.amountPerPerson)} تومان هر نفر · {sent ? 'در صندوق ورودی اپلیکیشن کارکنان قرار گرفت و منتظر تأیید آن‌هاست.' : 'برای ارسال، مرحله بررسی را تکمیل کنید.'}</>}
          action={<BigNum value={money(pkg.total)} unit="تومان" />}
        />
        <KV rows={[
          ['شماره پیگیری', <span key="id" className="num ltr">{pkg.id.toUpperCase()}</span>],
          ['گیرندگان', `${faDigits(n)} نفر${units ? ` · ${faDigits(units)} واحد` : ''}`],
          ['جمع کل', [total.value, total.unit, 'تومان'].filter(Boolean).join(' ')],
          ['تخصیص', allocationText(pkg)],
          ['سیاست قفل', <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={lp.type} /><span className="num">{lp.type === 'vesting' ? 'تا ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `${faDigits(lp.steps.length)} مرحله` : 'همه آزاد'}</span></span>],
          ['زمان ارسال', <span key="t" className="num">{pkg.sentAt ? jDateTime(pkg.sentAt) : '—'}</span>],
        ]} />
        <Note tone="mute" icon={lp.type === 'milestone' ? I.flag : LOCK_D}>
          {lp.type === 'vesting' && <>پس از تأیید هر کارمند، بخش صندوقی بسته‌اش تا <span className="num">{jDate(lp.releaseAt)}</span> قفل می‌شود؛ بخش ریالی آزاد است.</>}
          {lp.type === 'milestone' && <>پس از تأیید کارمند، مبلغ در صندوق طلای او قفل و با تأیید هر مرحله در صفحهٔ بسته آزاد می‌شود.</>}
          {lp.type === 'none' && <>کل بسته پس از تأیید کارمند آزاد است و قابل فروش{pkg.cashAllowed ? ' و برداشت' : ''} است.</>}
        </Note>
        {sent && (
          <Note tone="info">
            وضعیت فعلی: <b>در انتظار تأیید کارکنان</b> · اعلان برای {faDigits(n)} گیرنده ارسال شد.{pkg.expiresAt ? <> مهلت تأیید تا <span className="num">{jDate(pkg.expiresAt)}</span>.</> : null}
          </Note>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', paddingTop: 4 }}>
          <Link href={routes.org.packages} className="nm-btn">مشاهده بسته‌ها</Link>
          <Link href={sent ? routes.org.package(pkg.id) : routes.org.newReview(pkg.id)} className="nm-btn ghost">{sent ? 'جزئیات این بسته' : 'بررسی و ارسال'}</Link>
          <Link href={routes.org.dashboard} className="nm-btn text">داشبورد</Link>
        </div>
      </Card>
    </>
  );
}

export default function NewPackageSentPage() {
  return <Suspense fallback={null}><SentStep /></Suspense>;
}
