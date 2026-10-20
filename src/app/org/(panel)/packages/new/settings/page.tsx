'use client';
/** Design: org-package.dc.html — wizard step 2: package settings (type, amount, lock policy, cash, allocation, expiry). */
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useOrgContract, useOrgPackage, useUpdatePackage, type NewPackage } from '@/api/org';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, money, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { LockPolicy, PackageReason } from '@/types/domain';
import { I, REASONS, jalaliAddMonths, lockChip, parseJalali, splitCompact } from '@/components/org/packages/meta';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { CardError, CardSkeleton, LockChip, Notice, Switch, errMsg, useFlash } from '@/components/org/packages/ui';

type PolType = LockPolicy['type'];
interface MsRow { key: number; title: string; pct: string; due: string }
type Split = { gold: string; fixed: string; rial: string };
const LKI = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2';
const MS_GRID = '24px minmax(0, 1fr) 72px 104px 132px 28px';
const VEST_QUICK: [number, string][] = [[3, '۳ ماه'], [6, '۶ ماه'], [12, '۱ سال']];
let rowKey = 1;
const defaultSteps = (): MsRow[] => [
  ['تحلیل نیازمندی‌ها', 20, 1], ['طراحی رابط کاربری', 20, 2], ['پیاده‌سازی نسخه اول', 30, 3], ['تست و تحویل', 20, 4], ['پشتیبانی یک‌ماهه', 10, 0],
].map(([title, pct, m]) => ({ key: rowKey++, title: String(title), pct: faDigits(String(pct)), due: m ? jalaliAddMonths(Number(m)) : '' }));
const num = (s: string) => { const n = Number(enDigits(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };

function Radio({ label, on, onClick, disabled, extra }: { label: string; on: boolean; onClick?: () => void; disabled?: boolean; extra?: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 13, opacity: disabled ? 0.55 : 1 }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? 'var(--primary-main)' : 'var(--grey-500)'}`, boxSizing: 'border-box', display: 'grid', placeItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? 'var(--primary-main)' : 'transparent' }} /></span>
      {label}{extra}
    </button>
  );
}
const FieldErr = ({ children }: { children?: string }) => (children ? <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)', lineHeight: '16px', padding: '2px 4px 0' }}>{children}</span> : null);

function SettingsStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: pkg, isLoading, isError, refetch } = useOrgPackage(draftId);
  const { data: contract } = useOrgContract();
  const update = useUpdatePackage();
  const globalToast = useToast();
  const { flash, toast } = useFlash();

  const [ready, setReady] = useState(false);
  const [reason, setReason] = useState<PackageReason>('bonus');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [pol, setPol] = useState<PolType>('vesting');
  const [vest, setVest] = useState('');
  const [msRows, setMsRows] = useState<MsRow[]>([]);
  const [cash, setCash] = useState(true);
  const [alloc, setAlloc] = useState<'free' | 'fixed'>('free');
  const [split, setSplit] = useState<Split>({ gold: '۵۰', fixed: '۳۰', rial: '۲۰' });
  const [message, setMessage] = useState('');
  const [expiry, setExpiry] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | undefined>();

  const settings = contract?.settings;
  const allowedPols = settings?.lockPolicies ?? ['none', 'vesting', 'milestone'];
  const cashAllowedByContract = settings?.cashWithdrawalAllowed ?? true;

  useEffect(() => {
    if (ready || !pkg) return;
    setReason(pkg.reason);
    setTitle(pkg.title);
    setAmount(pkg.amountPerPerson);
    const lp = pkg.lockPolicy;
    setPol(lp.type === 'none' && pkg.amountPerPerson === 0 && pkg.reason !== 'project_contract' ? 'vesting' : lp.type);
    setVest(lp.type === 'vesting' ? jDate(lp.releaseAt) : jalaliAddMonths(3));
    setMsRows(lp.type === 'milestone' ? lp.steps.map((s) => ({ key: rowKey++, title: s.title, pct: faDigits(String(s.sharePct)), due: s.dueDate ? jDate(s.dueDate) : '' })) : defaultSteps());
    setCash(pkg.cashAllowed);
    setAlloc(pkg.allocationMode);
    if (pkg.fixedSplit) setSplit({ gold: faDigits(String(pkg.fixedSplit.gold ?? 0)), fixed: faDigits(String(pkg.fixedSplit.fixed ?? 0)), rial: faDigits(String(pkg.fixedSplit.rial ?? 0)) });
    setMessage(pkg.message ?? '');
    setExpiry(pkg.expiresAt ? jDate(pkg.expiresAt) : jalaliAddMonths(1));
    setSavedAt(pkg.createdAt);
    setReady(true);
  }, [pkg, ready]);
  // the contract may forbid cash withdrawal → force it off
  useEffect(() => { if (ready && settings && !settings.cashWithdrawalAllowed) setCash(false); }, [ready, settings]);

  if (!draftId) {
    return (
      <>
        <WizardHeader step={2} crumb="تنظیمات بسته" />
        <Notice tone="warning" d={I.warn}>ابتدا گیرندگان بسته را انتخاب کنید. <Link href={routes.org.newRecipients()} style={{ fontWeight: 700 }}>انتخاب گیرندگان</Link></Notice>
      </>
    );
  }
  if (isError) return (<><WizardHeader step={2} crumb="تنظیمات بسته" draftId={draftId} /><CardError message="پیش‌نویس پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg || !ready) return (<><WizardHeader step={2} crumb="تنظیمات بسته" draftId={draftId} /><div style={{ display: 'flex', gap: 24 }}><CardSkeleton h={520} style={{ width: 320, flex: 'none' }} /><CardSkeleton h={520} style={{ flex: 1 }} /></div></>);
  if (pkg.status !== 'draft') {
    return (
      <>
        <WizardHeader step={2} crumb="تنظیمات بسته" />
        <Notice tone="warning" d={I.warn}>این بسته قبلاً ارسال شده و قابل ویرایش نیست. <Link href={routes.org.package(pkg.id)} style={{ fontWeight: 700 }}>مشاهده بسته</Link></Notice>
      </>
    );
  }

  const isMs = pol === 'milestone';
  const n = pkg.recipients.length;
  const total = amount * n;
  const remaining = contract ? contract.budgetYear - contract.budgetUsed : 0;
  const usePct = remaining > 0 ? (total * 100) / remaining : 0;
  const over = !!contract && total > remaining;
  const remainAfter = splitCompact(Math.max(0, remaining - total));
  const remainNow = splitCompact(remaining);
  const msTotal = msRows.reduce((s, r) => s + num(r.pct), 0);
  const msOk = msTotal === 100;
  const effAlloc: 'free' | 'fixed' = isMs ? 'fixed' : alloc;
  const sp_ = { gold: num(split.gold), fixed: num(split.fixed), rial: cash ? num(split.rial) : 0 };
  const splitSum = sp_.gold + sp_.fixed + sp_.rial;
  const chip = lockChip(pol);

  const pickReason = (r: PackageReason) => {
    setReason(r);
    if (r === 'project_contract' && allowedPols.includes('milestone')) setPol('milestone');
    else if (r !== 'project_contract' && pol === 'milestone') setPol(allowedPols.includes('vesting') ? 'vesting' : 'none');
  };
  const setRow = (i: number, patch: Partial<MsRow>) => setMsRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const validate = (strict: boolean) => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان بسته را وارد کنید.';
    if (strict && amount <= 0) e.amount = 'مبلغ هر نفر را وارد کنید.';
    if (pol === 'vesting') {
      const iso = parseJalali(vest);
      if (!iso) e.vest = 'تاریخ را به شکل ۱۴۰۵/۱۰/۱۵ وارد کنید.';
      else if (new Date(iso).getTime() <= now().getTime()) e.vest = 'تاریخ آزادسازی باید در آینده باشد.';
    }
    if (isMs) {
      if (!msRows.length) e.ms = 'حداقل یک مرحله تعریف کنید.';
      else if (msRows.some((r) => !r.title.trim())) e.ms = 'عنوان همه مراحل را وارد کنید.';
      else if (msRows.some((r) => num(r.pct) < 5)) e.ms = 'سهم هر مرحله حداقل ۵٪ است.';
      else if (!msOk) e.ms = 'جمع سهم مراحل باید دقیقاً ۱۰۰٪ باشد.';
      else if (msRows.some((r) => r.due.trim() && !parseJalali(r.due))) e.ms = 'سررسید مراحل را به شکل ۱۴۰۵/۰۹/۲۰ وارد کنید یا خالی بگذارید.';
    }
    if (effAlloc === 'fixed' && !isMs && splitSum !== 100) e.split = 'جمع تخصیص ثابت باید ۱۰۰٪ باشد.';
    if (strict && expiry.trim()) {
      const iso = parseJalali(expiry);
      if (!iso) e.expiry = 'تاریخ را به شکل ۱۴۰۵/۰۹/۱۵ وارد کنید.';
      else if (new Date(iso).getTime() <= now().getTime()) e.expiry = 'مهلت تأیید باید در آینده باشد.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const payload = (): NewPackage & { id: string } => {
    const lockPolicy: LockPolicy = pol === 'vesting'
      ? { type: 'vesting', releaseAt: parseJalali(vest)! }
      : pol === 'milestone'
        ? { type: 'milestone', steps: msRows.map((r) => ({ title: r.title.trim(), sharePct: num(r.pct), dueDate: r.due.trim() ? parseJalali(r.due) ?? undefined : undefined })) }
        : { type: 'none' };
    return {
      id: pkg.id, title: title.trim(), reason, amountPerPerson: amount, cashAllowed: cash, lockPolicy,
      allocationMode: effAlloc,
      fixedSplit: effAlloc === 'fixed' ? (isMs ? { gold: 100, fixed: 0 } : { gold: sp_.gold, fixed: sp_.fixed, ...(sp_.rial ? { rial: sp_.rial } : {}) }) : undefined,
      message: message.trim(),
      expiresAt: expiry.trim() ? parseJalali(expiry) ?? undefined : undefined,
    };
  };

  const goNext = () => {
    if (!validate(true)) { flash('موارد مشخص‌شده را اصلاح کنید', 'error'); return; }
    update.mutate(payload(), { onSuccess: () => router.push(routes.org.newReview(pkg.id)), onError: (e) => flash(errMsg(e), 'error') });
  };
  const saveDraft = () => {
    if (!validate(false)) { flash('موارد مشخص‌شده را اصلاح کنید', 'error'); return; }
    update.mutate(payload(), {
      onSuccess: () => { setSavedAt(now().toISOString()); globalToast('پیش‌نویس «' + title.trim() + '» ذخیره شد'); router.push(routes.org.packages); },
      onError: (e) => flash(errMsg(e), 'error'),
    });
  };

  const polValue = pol === 'none' ? '' : pol === 'vesting' ? 'تا ' + vest : faDigits(msRows.length) + ' مرحله';
  const lockNote = pol === 'none'
    ? 'کل بسته پس از تأیید کارمند آزاد است؛ تا تأیید، مبلغ از حساب سازمان رزرو می‌شود.'
    : pol === 'vesting'
      ? `پس از تأیید کارمند، بخش صندوقی بسته در دارایی او با نوع «قفل زمانی سازمان» تا ${vest} قفل می‌شود.`
      : `${money(amount)} تومان در صندوق طلای کارمند با نوع «آزادسازی مرحله‌ای» قفل و طی ${faDigits(msRows.length)} مرحله با تأیید سازمان آزاد می‌شود.`;
  const summary: { label: string; value: string; edit?: boolean; chip?: boolean }[] = [
    { label: 'گیرندگان', value: n === 1 ? `۱ نفر · ${pkg.recipients[0].name}` : `${faDigits(n)} نفر`, edit: true },
    { label: 'مبلغ هر نفر', value: amount ? `${money(amount)} تومان` : '—' },
    { label: 'برداشت نقدی', value: cash ? (pol === 'none' ? 'مجاز' : 'مجاز · فقط بخش آزاد') : 'غیرمجاز' },
    { label: 'سیاست قفل', value: polValue, chip: true },
  ];
  const composer: { key: keyof Split; label: string; color: string }[] = [
    { key: 'gold', label: 'طلا', color: '--warning-main' },
    { key: 'fixed', label: 'درآمد ثابت', color: '--chart-3' },
    ...(cash ? [{ key: 'rial' as const, label: 'ریال', color: '--chart-4' }] : []),
  ];
  const busy = update.isPending;

  return (
    <>
      <WizardHeader step={2} crumb="تنظیمات بسته" draftId={pkg.id} recipientsSub={`${faDigits(n)} نفر انتخاب شد`} badge={`مرحله ۲ از ۳ · پیش‌نویس · ذخیره‌شده ${savedAt ? time(savedAt) : ''}`} />

      <div style={{ flex: '1 0 auto', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Summary */}
        <div className="card" style={{ width: 320, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 0 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>خلاصه</h6>
            <span className="lbl" style={{ marginRight: 'auto', background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{REASONS.find((r) => r.key === reason)?.label}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {summary.map((m) => (
              <div key={m.label} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span className="num cell" style={{ marginRight: 'auto', fontWeight: 500 }}>{m.value}</span>
                {m.chip && <LockChip type={pol} />}
                {m.edit && <Link href={routes.org.newRecipients(pkg.id)} style={{ fontSize: 12, fontWeight: 600 }}>ویرایش</Link>}
              </div>
            ))}
          </div>
          <div style={{ boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, background: 'var(--soft-primary)', display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>جمع کل بسته‌ها</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 22 }}>{money(total)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <Icon d={I.building} size={16} style={{ color: 'var(--text-secondary)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>منبع: حساب سازمان</span>
              <span className="num" style={{ marginRight: 'auto', fontWeight: 500 }}>موجودی {remainNow.value} {remainNow.unit}</span>
            </div>
            <span dir="ltr" style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, Math.max(total ? 1 : 0, usePct))}%`, height: '100%', borderRadius: 3, background: over ? 'var(--error-main)' : 'var(--primary-main)' }} /></span>
            <span style={{ fontSize: 11, color: over ? 'var(--error-text)' : 'var(--text-secondary)', lineHeight: 1.3 }}>
              {over ? 'مبلغ بسته از موجودی سازمان بیشتر است' : usePct < 1 ? 'کمتر از ۱٪ موجودی' : `${faDigits(Math.round(usePct))}٪ موجودی مصرف می‌شود`} · باقی‌مانده: <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{remainAfter.value} {remainAfter.unit} تومان</span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: chip.bg, color: chip.fg, fontSize: 12, lineHeight: 1.5 }}>
            <Icon d={chip.d} size={18} style={{ marginTop: 1 }} />
            <span>{lockNote}</span>
          </div>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" onClick={goNext} disabled={busy} style={{ height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'در حال ذخیره…' : 'مرحله بعد: بررسی و ارسال'}<Icon d={I.chevL} size={18} strokeWidth={2} />
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={routes.org.newRecipients(pkg.id)} className="btn" style={{ flex: 1, height: 38, padding: '0 10px', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}><Icon d={I.chevR} size={16} />مرحله قبل</Link>
              <button className="btn" onClick={saveDraft} disabled={busy} style={{ flex: 1, height: 38, padding: '0 10px', border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}>ذخیره پیش‌نویس</button>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="card" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Package type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>تنظیمات بسته</h6><span className="flbl" style={{ marginRight: 'auto' }}>نوع بسته</span></div>
            <div role="radiogroup" aria-label="نوع بسته" style={{ height: 40, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4, padding: 4, boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-neutral)' }}>
              {REASONS.map((r) => {
                const on = reason === r.key;
                return <button key={r.key} role="radio" aria-checked={on} onClick={() => pickReason(r.key)} style={{ border: 0, borderRadius: 6, background: on ? 'var(--bg-paper)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: on ? 'var(--shadow-z1)' : 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>{r.label}</button>;
              })}
            </div>
          </div>

          {/* Title + amount */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span className="flbl">عنوان بسته</span>
              <span className="fld" style={errs.title ? { borderColor: 'var(--error-main)' } : undefined}><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان بسته" maxLength={80} /></span>
              <FieldErr>{errs.title}</FieldErr>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span className="flbl">مبلغ هر نفر</span>
              <span className="fld" style={errs.amount ? { borderColor: 'var(--error-main)' } : undefined}>
                <input className="num" type="text" inputMode="numeric" value={amount ? money(amount) : ''} placeholder="۰" onChange={(e) => setAmount(Math.min(1e12, num(e.target.value.replace(/[٬,]/g, ''))))} aria-label="مبلغ هر نفر" style={{ fontWeight: 500 }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', paddingRight: 8, borderRight: '1px solid var(--divider)' }}>تومان</span>
              </span>
              <FieldErr>{errs.amount}</FieldErr>
            </label>
          </div>

          {/* Amount mode */}
          <div role="radiogroup" aria-label="نحوه مبلغ" style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
            <span className="flbl">نحوه مبلغ:</span>
            <Radio label="یکسان برای همه" on />
            <Radio label="از فایل اکسل" on={false} disabled extra={<span className="lbl" style={{ height: 18, padding: '0 6px', fontSize: 10, background: 'var(--soft-default)', color: 'var(--default-text)' }}>به‌زودی</span>} />
          </div>

          {/* Lock policy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 8 }}><span className="flbl">سیاست قفل</span><span style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>مجاز طبق قرارداد سازمان</span><Link href={routes.org.contract} style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>قواعد</Link></div>
            <div role="radiogroup" aria-label="سیاست قفل" style={{ height: 44, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, padding: 4, boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-neutral)' }}>
              {([['none', 'بدون قفل', lockChip('none').d], ['vesting', 'قفل زمانی', LKI], ['milestone', 'آزادسازی مرحله‌ای', I.flag]] as const).map(([k, label, d]) => {
                const on = pol === k;
                const allowed = allowedPols.includes(k);
                return (
                  <button key={k} role="radio" aria-checked={on} disabled={!allowed} title={allowed ? undefined : 'در قرارداد سازمان مجاز نیست'} onClick={() => { setPol(k); setErrs({}); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 0, borderRadius: 6, background: on ? 'var(--bg-paper)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', boxShadow: on ? 'var(--shadow-z1)' : 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: allowed ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', opacity: allowed ? 1 : 0.45 }}>
                    <Icon d={d} size={16} />{label}
                  </button>
                );
              })}
            </div>
            {pol === 'none' && <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '0 4px' }}>کل بسته پس از تأیید کارمند آزاد است و می‌تواند به ریال فروخته یا برداشت شود.</span>}
            {pol === 'vesting' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <span className="flbl">آزاد در تاریخ</span>
                    <span className="fld" style={errs.vest ? { borderColor: 'var(--error-main)' } : undefined}>
                      <Icon d={I.calendar} size={18} style={{ color: 'var(--text-secondary)' }} />
                      <input className="num" type="text" value={vest} onChange={(e) => setVest(e.target.value)} placeholder="۱۴۰۵/۱۰/۱۵" aria-label="تاریخ آزادسازی" style={{ fontWeight: 500 }} />
                      <Icon d={I.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
                    </span>
                  </label>
                  <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {VEST_QUICK.map(([m, label]) => {
                      const on = vest === jalaliAddMonths(m);
                      return <button key={m} onClick={() => setVest(jalaliAddMonths(m))} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>;
                    })}
                  </div>
                </div>
                <FieldErr>{errs.vest}</FieldErr>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '0 4px' }}>بخش صندوقی بسته تا این تاریخ در دارایی کارمند قفل می‌ماند و بازده می‌گیرد؛ در این تاریخ خودکار آزاد می‌شود. بخش ریالی آزاد است.</span>
              </>
            )}
            {isMs && (
              <>
                <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden', flex: 'none' }}>
                  <div className="th" style={{ height: 32, display: 'grid', gridTemplateColumns: MS_GRID, alignItems: 'center', gap: 8, padding: '0 10px' }}>
                    <span /><span>عنوان مرحله / تعهد</span><span>سهم</span><span>مبلغ</span><span>سررسید (اختیاری)</span><span />
                  </div>
                  {msRows.map((m, i) => (
                    <div key={m.key} style={{ height: 44, display: 'grid', gridTemplateColumns: MS_GRID, alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{faDigits(i + 1)}</span>
                      <span className="fld" style={{ height: 32, padding: '0 10px', borderRadius: 6 }}><input type="text" value={m.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label={`عنوان مرحله ${faDigits(i + 1)}`} style={{ fontSize: 13 }} /></span>
                      <span className="fld" style={{ height: 32, padding: '0 8px', borderRadius: 6, gap: 2 }}><input className="num" type="text" inputMode="numeric" value={m.pct} onChange={(e) => setRow(i, { pct: faDigits(enDigits(e.target.value).replace(/\D/g, '').slice(0, 3)) })} aria-label={`سهم مرحله ${faDigits(i + 1)}`} style={{ fontSize: 13, fontWeight: 500, textAlign: 'center' }} /><span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>٪</span></span>
                      <span className="num" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{money((amount * num(m.pct)) / 100)}</span>
                      <span className="fld" style={{ height: 32, padding: '0 8px', borderRadius: 6, gap: 6 }}><Icon d={I.calendarS} size={14} style={{ color: 'var(--text-secondary)' }} /><input className="num" type="text" value={m.due} onChange={(e) => setRow(i, { due: e.target.value })} placeholder="بدون سررسید" aria-label={`سررسید مرحله ${faDigits(i + 1)}`} style={{ fontSize: 12 }} /></span>
                      <button className="ibtn" aria-label={`حذف مرحله ${faDigits(i + 1)}`} onClick={() => setMsRows((rows) => rows.filter((_, j) => j !== i))} style={{ width: 28, height: 28, color: 'var(--text-secondary)' }}><Icon d={I.trash} size={16} /></button>
                    </div>
                  ))}
                  <div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px' }}>
                    <button className="btn" disabled={msRows.length >= 8} onClick={() => setMsRows((rows) => [...rows, { key: rowKey++, title: 'مرحله جدید', pct: '۰', due: '' }])} style={{ height: 32, padding: '0 10px', fontSize: 13, background: 'transparent', color: 'var(--primary-text)', opacity: msRows.length >= 8 ? 0.5 : 1 }}><Icon d={I.plus} size={16} strokeWidth={2} />افزودن مرحله</button>
                    <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>جمع سهم مراحل</span>
                    <span className="lbl" style={{ height: 24, background: msOk ? 'var(--soft-success)' : 'var(--soft-error)', color: msOk ? 'var(--success-text)' : 'var(--error-text)' }}>{msOk ? '۱۰۰٪ · درست' : `${faDigits(msTotal)}٪ · باید ۱۰۰٪ باشد`}</span>
                  </div>
                </div>
                <FieldErr>{errs.ms}</FieldErr>
                <Notice tone="primary" d={I.flag}>جمع سهم‌ها باید دقیقاً ۱۰۰٪ باشد. هر مرحله پس از انجام تعهد توسط کارمند و <b>تأیید سازمان</b> آزاد می‌شود؛ تا آن زمان دارایی در حساب کارمند قفل است ولی بازده می‌گیرد.</Notice>
              </>
            )}
          </div>

          {/* Cash withdrawal switch */}
          <div style={{ minHeight: 48, flex: 'none', boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, border: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25, padding: '6px 0' }}><span style={{ fontSize: 13, fontWeight: 600 }}>برداشت نقدی</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cashAllowedByContract ? 'کارمند می‌تواند بخش ریالی را به کارت بانکی خود برداشت کند' : 'در قرارداد سازمان مجاز نیست'}</span></span>
            <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: cash ? 'var(--soft-success)' : 'var(--soft-default)', color: cash ? 'var(--success-text)' : 'var(--default-text)' }}>{cash ? 'فعال' : 'غیرفعال'}</span>
            <Switch on={cash} label="برداشت نقدی" disabled={!cashAllowedByContract && !cash} onToggle={() => setCash((c) => !c)} />
          </div>

          {/* Allocation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div role="radiogroup" aria-label="تخصیص دارایی" style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 20, fontSize: 13 }}>
              <span className="flbl" style={{ whiteSpace: 'nowrap' }}>تخصیص دارایی:</span>
              <Radio label="انتخاب آزاد کارمند" on={effAlloc === 'free'} disabled={isMs} onClick={() => setAlloc('free')} />
              <Radio label="تخصیص ثابت" on={effAlloc === 'fixed'} disabled={isMs} onClick={() => setAlloc('fixed')} />
              <span style={{ marginRight: 'auto', minWidth: 0, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMs ? 'در قرارداد مرحله‌ای ثابت است' : effAlloc === 'free' ? 'کارمند هنگام دریافت بین طلا، درآمد ثابت و ریال انتخاب می‌کند' : 'سهم هر دارایی را تعیین کنید'}</span>
            </div>
            {!isMs ? (
              <div style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 8, opacity: effAlloc === 'free' ? 0.6 : 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {composer.map((cp) => {
                    const v = num(split[cp.key]);
                    return (
                      <div key={cp.key} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${cp.color})`, flex: 'none' }} />
                        <span style={{ width: 72, fontWeight: 600 }}>{cp.label}</span>
                        <span dir="ltr" style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--divider)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, v)}%`, height: '100%', background: `var(${cp.color})` }} /></span>
                        <span className="fld" style={{ width: 64, height: 26, padding: '0 8px', borderRadius: 6, fontSize: 12 }}>
                          <input className="num" type="text" inputMode="numeric" value={split[cp.key]} disabled={effAlloc === 'free'} onChange={(e) => setSplit((s) => ({ ...s, [cp.key]: faDigits(enDigits(e.target.value).replace(/\D/g, '').slice(0, 3)) }))} aria-label={cp.label} style={{ fontSize: 12, textAlign: 'center', fontWeight: 500 }} />
                          <span style={{ color: 'var(--text-secondary)' }}>٪</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span dir="ltr" style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
                  {composer.map((cp) => <span key={cp.key} style={{ width: `${Math.min(100, num(split[cp.key]))}%`, background: `var(${cp.color})` }} />)}
                </span>
                {effAlloc === 'fixed' && <span style={{ fontSize: 11, color: splitSum === 100 ? 'var(--success-text)' : 'var(--error-text)' }}>جمع: {faDigits(splitSum)}٪{splitSum === 100 ? ' · درست' : ' · باید ۱۰۰٪ باشد'}</span>}
              </div>
            ) : (
              <div style={{ height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 10, background: 'var(--bg-neutral)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--warning-main)', flex: 'none' }} />
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>۱۰۰٪ صندوق طلا</span>
                <span className="cell" style={{ color: 'var(--text-secondary)' }}>کل مبلغ به واحد صندوق طلا تبدیل و به نام کارمند ثبت می‌شود</span>
              </div>
            )}
            <FieldErr>{errs.split}</FieldErr>
          </div>

          {/* Expiry + message (design: send date row) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span className="flbl">مهلت تأیید کارمند</span>
              <span className="fld" style={errs.expiry ? { borderColor: 'var(--error-main)' } : undefined}><Icon d={I.calendar} size={18} style={{ color: 'var(--text-secondary)' }} /><input className="num" type="text" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="۱۴۰۵/۰۹/۱۵" aria-label="مهلت تأیید کارمند" style={{ fontWeight: 500 }} /></span>
              {errs.expiry ? <FieldErr>{errs.expiry}</FieldErr> : <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: '16px', padding: '0 4px' }}>پس از تأیید شما بلافاصله به صندوق ورودی کارکنان ارسال می‌شود</span>}
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span className="flbl">پیام به کارکنان (اختیاری)</span>
              <span className="fld"><input type="text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={160} placeholder="مثلاً: با سپاس از تلاش‌های شما" aria-label="پیام به کارکنان" /></span>
            </label>
          </div>
          {over && <Notice tone="error" d={I.warn}>جمع بسته ({money(total)} تومان) از موجودی باقی‌ماندهٔ سازمان بیشتر است؛ مبلغ یا تعداد گیرندگان را کاهش دهید.</Notice>}
        </div>
      </div>
      {toast}
    </>
  );
}

export default function NewPackageSettingsPage() {
  return <Suspense fallback={null}><SettingsStep /></Suspense>;
}
