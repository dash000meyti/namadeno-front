'use client';
/** Design: org-package-sent.dc.html — confirmation after sending a package. */
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useOrgEmployees, useOrgPackage } from '@/api/org';
import { routes } from '@/lib/routes';
import { faDigits, jDateTime, jDate, money } from '@/lib/format';
import { I, allocationText, splitCompact } from '@/components/org/packages/meta';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { CardError, CardSkeleton, LockChip } from '@/components/org/packages/ui';

function SentStep() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const { data: pkg, isLoading, isError, refetch } = useOrgPackage(id);
  const { data: emps } = useOrgEmployees();

  const header = <WizardHeader step={4} crumb="ارسال شد" badge="ارسال شد" badgeTone="success" hideCancel />;
  if (!id || isError) return (<>{header}<CardError message="بسته پیدا نشد" onRetry={id ? () => refetch() : undefined} /></>);
  if (isLoading || !pkg) return (<>{header}<div style={{ display: 'grid', placeItems: 'center' }}><CardSkeleton h={460} style={{ width: 600, maxWidth: '100%' }} /></div></>);

  const n = pkg.recipients.length;
  const units = new Set(pkg.recipients.map((r) => emps?.find((e) => e.id === r.employeeId)?.department).filter(Boolean)).size;
  const total = splitCompact(pkg.total);
  const lp = pkg.lockPolicy;
  const appUsers = pkg.recipients.length;
  const facts = [
    { label: 'شماره پیگیری', value: pkg.id.toUpperCase(), ltr: true },
    { label: 'گیرندگان', value: `${faDigits(n)} نفر${units ? ` · ${faDigits(units)} واحد` : ''}` },
    { label: 'جمع کل', value: `${total.value} ${total.unit} تومان` },
    { label: 'تخصیص', value: allocationText(pkg) },
    { label: 'سیاست قفل', value: lp.type === 'vesting' ? 'قفل زمانی · تا ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `مرحله‌ای · ${faDigits(lp.steps.length)} مرحله` : 'بدون قفل' },
    { label: 'زمان ارسال', value: pkg.sentAt ? jDateTime(pkg.sentAt) : '—' },
  ];
  const sent = pkg.status !== 'draft';

  return (
    <>
      {header}
      <div style={{ flex: '1 0 auto', display: 'grid', placeItems: 'center' }}>
        <div className="card" style={{ width: 600, maxWidth: '100%', boxSizing: 'border-box', padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <span style={{ width: 60, height: 60, borderRadius: '50%', background: sent ? 'var(--soft-success)' : 'var(--soft-warning)', color: sent ? 'var(--success-text)' : 'var(--warning-text)', display: 'grid', placeItems: 'center' }}><Icon d={sent ? I.check : I.warn} size={36} strokeWidth={2} /></span>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>{sent ? 'بسته برای کارکنان ارسال شد' : 'این بسته هنوز ارسال نشده است'}</h2>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 30, lineHeight: 1.1 }}>{money(pkg.total)}</span><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>تومان</span></span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {pkg.title} · {faDigits(n)} نفر · {money(pkg.amountPerPerson)} تومان هر نفر · {sent ? 'در صندوق ورودی اپلیکیشن کارکنان قرار گرفت و منتظر تأیید آن‌هاست.' : 'برای ارسال، مرحله بررسی را تکمیل کنید.'}
          </span>
          <div style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 8px', textAlign: 'right' }}>
            {facts.map((f) => (
              <span key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3, minWidth: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{f.label}</span>
                <span className="num" dir={f.ltr ? 'ltr' : undefined} style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }} title={f.value}>{f.value}</span>
              </span>
            ))}
          </div>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--divider)', fontSize: 12, lineHeight: 1.6, textAlign: 'right' }}>
            <LockChip type={lp.type} />
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
              {lp.type === 'vesting' && <>پس از تأیید هر کارمند، بخش صندوقی بسته‌اش تا <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{jDate(lp.releaseAt)}</span> قفل می‌شود؛ بخش ریالی آزاد است.</>}
              {lp.type === 'milestone' && <>پس از تأیید کارمند، مبلغ در صندوق طلای او قفل و با تأیید هر مرحله در صفحهٔ بسته آزاد می‌شود.</>}
              {lp.type === 'none' && <>کل بسته پس از تأیید کارمند آزاد است و قابل فروش{pkg.cashAllowed ? ' و برداشت' : ''} است.</>}
            </span>
          </div>
          {sent && (
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5, textAlign: 'right' }}>
              <Icon d={I.info} size={18} />
              <span>وضعیت فعلی: <b>در انتظار تأیید کارکنان</b> · اعلان برای {faDigits(appUsers)} گیرنده ارسال شد.{pkg.expiresAt ? <> مهلت تأیید تا <span className="num">{jDate(pkg.expiresAt)}</span>.</> : null}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href={routes.org.packages} className="btn" style={{ height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none' }}>مشاهده بسته‌ها</Link>
            <Link href={sent ? routes.org.package(pkg.id) : routes.org.newReview(pkg.id)} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>{sent ? 'جزئیات این بسته' : 'بررسی و ارسال'}</Link>
            <Link href={routes.org.dashboard} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>داشبورد</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function NewPackageSentPage() {
  return <Suspense fallback={null}><SentStep /></Suspense>;
}
