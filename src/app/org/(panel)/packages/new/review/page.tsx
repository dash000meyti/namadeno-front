'use client';
/** Design: org-package-review.dc.html — wizard step 3: review, budget check and send. */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { ApiRequestError } from '@/api/client';
import { useOrgContract, useOrgEmployees, useOrgMe, useOrgPackage, useSendPackage } from '@/api/org';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { AV, I, allocationText, reasonMeta, soft, splitCompact } from '@/components/org/packages/meta';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { CardError, CardSkeleton, Chk, LockChip, Notice, errMsg, useFlash } from '@/components/org/packages/ui';

const GRID = '1.4fr 110px 130px 130px';
const SHOW = 6;

function ReviewStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: pkg, isLoading, isError, refetch } = useOrgPackage(draftId);
  const { data: contract } = useOrgContract();
  const { data: me } = useOrgMe();
  const { data: emps } = useOrgEmployees();
  const send = useSendPackage();
  const { flash, toast } = useFlash();
  const [ack, setAck] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [serverErr, setServerErr] = useState<{ code: string; message: string } | null>(null);

  if (!draftId) return (<><WizardHeader step={3} crumb="بررسی و ارسال" /><Notice tone="warning" d={I.warn}>پیش‌نویسی انتخاب نشده است. <Link href={routes.org.newRecipients()} style={{ fontWeight: 700 }}>شروع ارسال جدید</Link></Notice></>);
  if (isError) return (<><WizardHeader step={3} crumb="بررسی و ارسال" /><CardError message="پیش‌نویس پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg) return (<><WizardHeader step={3} crumb="بررسی و ارسال" draftId={draftId} /><div style={{ display: 'flex', gap: 20 }}><CardSkeleton h={480} style={{ width: 320, flex: 'none' }} /><CardSkeleton h={480} style={{ flex: 1 }} /></div></>);
  if (pkg.status !== 'draft') {
    return (<><WizardHeader step={3} crumb="بررسی و ارسال" /><Notice tone="info">این بسته قبلاً ارسال شده است. <Link href={routes.org.package(pkg.id)} style={{ fontWeight: 700 }}>مشاهده بسته</Link></Notice></>);
  }

  const n = pkg.recipients.length;
  const remaining = contract ? contract.budgetYear - contract.budgetUsed : 0;
  const over = !!contract && pkg.total > remaining;
  const remainAfter = splitCompact(Math.max(0, remaining - pkg.total));
  const remainNow = splitCompact(remaining);
  const lp = pkg.lockPolicy;
  const missing = !pkg.amountPerPerson ? 'مبلغ هر نفر تعیین نشده است.' : !n ? 'هیچ گیرنده‌ای انتخاب نشده است.' : '';
  const canSend = ack && !over && !missing && !send.isPending;
  const empOf = (id: string) => emps?.find((e) => e.id === id);
  const units = new Set(pkg.recipients.map((r) => empOf(r.employeeId)?.department).filter(Boolean)).size;
  const rm = reasonMeta(pkg.reason);
  const adminName = me?.admin.name ?? 'نیما رضایی';

  const chain = [
    { label: 'مدیر منابع انسانی', sub: `${adminName} · ${relTime(pkg.createdAt, now())}`, state: ack ? 'done' : 'current', s: ack ? 'تأیید شد' : 'در انتظار', tone: ack ? 'success' : 'warning' },
    { label: 'کنترل بودجه سازمان', sub: over ? 'کسری موجودی حساب سازمان' : `موجودی ${remainNow.value} ${remainNow.unit} تومان`, state: !ack ? 'pending' : over ? 'current' : 'done', s: over ? 'کسری بودجه' : 'کافی', tone: over ? 'error' : 'success' },
    { label: 'ارسال به کارکنان', sub: 'بلافاصله پس از تأیید شما · صندوق ورودی و اعلان', state: canSend ? 'current' : 'pending', s: 'آماده ارسال', tone: canSend ? 'warning' : 'default' },
  ] as const;

  const defs: { label: string; value: string; c?: string; chip?: boolean }[] = [
    { label: 'نوع بسته', value: rm.label }, { label: 'عنوان', value: pkg.title },
    { label: 'مبلغ هر نفر', value: pkg.amountPerPerson ? `${money(pkg.amountPerPerson)} تومان` : '—', c: pkg.amountPerPerson ? undefined : 'var(--error-text)' }, { label: 'نحوه مبلغ', value: 'یکسان برای همه' },
    { label: 'برداشت نقدی', value: pkg.cashAllowed ? 'مجاز' : 'غیرمجاز', c: pkg.cashAllowed ? 'var(--success-text)' : 'var(--text-secondary)' }, { label: 'تخصیص دارایی', value: allocationText(pkg) },
    { label: 'سیاست قفل', value: lp.type === 'vesting' ? 'آزاد در ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `${faDigits(lp.steps.length)} مرحله` : 'همه آزاد', chip: true },
    { label: 'مهلت تأیید', value: pkg.expiresAt ? jDate(pkg.expiresAt) : 'بدون مهلت' },
  ];

  const confirm = () => {
    if (!canSend) return;
    setServerErr(null);
    send.mutate(pkg.id, {
      onSuccess: (p) => router.push(routes.org.newSent(p.id)),
      onError: (e) => {
        const code = e instanceof ApiRequestError ? e.code : 'error';
        setServerErr({ code, message: errMsg(e) });
        flash(errMsg(e), 'error');
      },
    });
  };

  const list = showAll ? pkg.recipients : pkg.recipients.slice(0, SHOW);
  const lockText = lp.type === 'vesting'
    ? <>پس از تأیید هر کارمند، بخش صندوقی بسته‌اش (طلا و درآمد ثابت) در دارایی او با نوع <b>«قفل زمانی سازمان»</b> تا <span className="num" style={{ fontWeight: 500 }}>{jDate(lp.releaseAt)}</span> قفل می‌شود و سپس خودکار آزاد می‌شود. بخش ریالی از ابتدا آزاد است.</>
    : lp.type === 'milestone'
      ? <>پس از تأیید کارمند، کل مبلغ در صندوق طلای او با نوع <b>«آزادسازی مرحله‌ای»</b> قفل می‌شود و طی {faDigits(lp.steps.length)} مرحله ({lp.steps.map((s) => faDigits(s.sharePct) + '٪').join('، ')}) با تأیید سازمان آزاد می‌شود.</>
      : <>بسته پس از تأیید کارمند بلافاصله <b>آزاد</b> است و می‌تواند فروخته{pkg.cashAllowed ? ' یا برداشت' : ''} شود.</>;
  const lockTone = lp.type === 'vesting' ? 'warning' : lp.type === 'milestone' ? 'primary' : 'success';

  return (
    <>
      <WizardHeader step={3} crumb="بررسی و ارسال" draftId={pkg.id} recipientsSub={`${faDigits(n)} نفر`} />

      <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Approval + action (right) */}
        <div className="card" style={{ width: 320, flex: 'none', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>زنجیره تأیید</h6>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {chain.map((c, i) => {
              const d = c.state === 'done';
              const cur = c.state === 'current';
              const t = soft(c.tone);
              return (
                <div key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 56 }}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', background: d || cur ? 'var(--primary-main)' : 'var(--step-pending)', color: d || cur ? '#FFFFFF' : 'var(--step-pending-text)', fontSize: 12, fontWeight: 700, boxShadow: cur ? '0 0 0 4px var(--soft-primary)' : 'none' }}>
                      {d ? <Icon d={I.check} size={16} strokeWidth={2.2} /> : <span>{faDigits(i + 1)}</span>}
                    </span>
                    {i < chain.length - 1 && <span style={{ flex: 1, width: 2, margin: '4px 0', background: d ? 'var(--primary-main)' : 'var(--divider)' }} />}
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3, paddingTop: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: cur ? 700 : 600, color: cur ? 'var(--primary-text)' : d ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.sub}</span>
                  </span>
                  <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: t.bg, color: t.fg, marginTop: 4 }}>{c.s}</span>
                </div>
              );
            })}
          </div>
          <div style={{ boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, background: over ? 'var(--soft-error)' : 'var(--soft-primary)', display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>منبع و موجودی</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 22 }}>{money(pkg.total)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span></span>
            <span style={{ fontSize: 11, color: over ? 'var(--error-text)' : 'var(--text-secondary)', lineHeight: 1.5 }}>
              {over ? `از موجودی حساب سازمان (${remainNow.value} ${remainNow.unit}) بیشتر است` : `از حساب سازمان (موجودی ${remainNow.value} ${remainNow.unit}) رزرو می‌شود · باقی‌مانده ${remainAfter.value} ${remainAfter.unit}`}
            </span>
          </div>
          <button aria-pressed={ack} onClick={() => setAck(!ack)} style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'right' }}>
            <Chk on={ack} />اطلاعات بسته را بررسی کردم و درست است
          </button>
          {missing && <Notice tone="error" d={I.warn}>{missing} <Link href={routes.org.newSettings(pkg.id)} style={{ fontWeight: 700 }}>ویرایش</Link></Notice>}
          {serverErr && (
            <Notice tone="error" d={I.warn}>
              {serverErr.message}
              {serverErr.code === 'over_budget' && <> <Link href={routes.org.newSettings(pkg.id)} style={{ fontWeight: 700 }}>کاهش مبلغ</Link> یا <Link href={routes.org.newRecipients(pkg.id)} style={{ fontWeight: 700 }}>گیرندگان</Link></>}
            </Notice>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" onClick={confirm} disabled={!canSend} style={{ height: 40, background: canSend ? 'var(--primary-main)' : 'var(--action-disabled-bg, var(--step-pending))', color: canSend ? 'var(--primary-contrast)' : 'var(--text-disabled)', boxShadow: canSend ? 'var(--shadow-primary)' : 'none', cursor: canSend ? 'pointer' : 'not-allowed' }}>
              <Icon d={I.send} size={18} />{send.isPending ? 'در حال ارسال…' : 'تأیید و ارسال به کارکنان'}
            </button>
            <Link href={routes.org.newSettings(pkg.id)} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}><Icon d={I.chevR} size={18} />مرحله قبل</Link>
          </div>
        </div>

        {/* Review (left, wide) */}
        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>تنظیمات بسته</h6>
            <span className="lbl" style={{ background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{rm.label}</span>
            <Link href={routes.org.newSettings(pkg.id)} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={I.edit} size={16} />ویرایش</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            {defs.map((d) => (
              <div key={d.label} style={{ height: 38, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 13, minWidth: 0 }}>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.label}</span>
                <span className="num cell" style={{ marginRight: 'auto', fontWeight: 500, color: d.c ?? 'var(--text-primary)' }}>{d.value}</span>
                {d.chip && <LockChip type={lp.type} />}
              </div>
            ))}
          </div>
          {pkg.message && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>پیام به کارکنان: <span style={{ color: 'var(--text-primary)' }}>«{pkg.message}»</span></div>}
          <Notice tone={lockTone} d={lp.type === 'milestone' ? I.flag : 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2'} style={{ flex: 'none' }}>{lockText}</Notice>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>گیرندگان</h6>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(n)} نفر · {faDigits(units)} واحد</span>
            <Link href={routes.org.newRecipients(pkg.id)} style={{ marginRight: 'auto', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={I.edit} size={16} />ویرایش</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
            <div className="th" style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 12px' }}>
              <span className="cell">کارمند</span><span className="cell">واحد</span><span className="cell">مبلغ بسته</span><span className="cell">تخصیص</span>
            </div>
            {list.map((r, i) => {
              const e = empOf(r.employeeId);
              const av = AV[i % AV.length];
              return (
                <div key={r.employeeId} style={{ height: 40, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: av[0], color: av[1], display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>{r.name[0]}</span>
                    <span className="cell" style={{ fontWeight: 600 }}>{r.name}</span>
                    {e && <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{faDigits(e.employeeCode)}</span>}
                  </span>
                  <span className="cell" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{e?.department ?? '—'}</span>
                  <span className="num cell" style={{ fontWeight: 500 }}>{money(r.amount)}</span>
                  <span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{allocationText(pkg)}</span>
                </div>
              );
            })}
            {n > SHOW && (
              <button onClick={() => setShowAll(!showAll)} style={{ minHeight: 32, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 12, color: 'var(--text-secondary)', border: 0, background: 'transparent', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'right' }}>
                {showAll ? 'نمایش کمتر' : <>و <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)', padding: '0 4px' }}>{faDigits(n - SHOW)}</span> نفر دیگر · نمایش همه</>}
              </button>
            )}
          </div>
        </div>
      </div>
      {toast}
    </>
  );
}

export default function NewPackageReviewPage() {
  return <Suspense fallback={null}><ReviewStep /></Suspense>;
}
