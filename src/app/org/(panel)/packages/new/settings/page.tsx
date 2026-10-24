'use client';
/**
 * Send wizard, step 2 — package settings (type, amount, lock policy, cash, allocation, expiry, message).
 * Kit wizard page: heading + steps → settings groups beside the live summary → sticky action bar.
 */
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrgContract, useOrgPackage, useUpdatePackage, type NewPackage } from '@/api/org';
import {
  ActionBar, Ava, BigNum, Card, Chips, Empty, ErrorBlock, KV, Meter, Note, NumInput, NumberInput, Pill, Section, SettingRow,
  SettingsGroup, SkeletonCard, Switch, Table, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, WizardHeader } from '@/components/org/packages/Stepper';
import { I, REASONS, jalaliAddMonths, lockChip, parseJalali, splitCompact } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, money, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { LockPolicy, PackageReason } from '@/types/domain';

type PolType = LockPolicy['type'];
interface MsRow { key: number; title: string; pct: string; due: string }
type Split = { gold: string; fixed: string; rial: string };
const LKI = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2';
const VEST_QUICK: [number, string][] = [[3, '۳ ماه'], [6, '۶ ماه'], [12, '۱ سال']];
const POLS: [PolType, string, string][] = [['none', 'بدون قفل', lockChip('none').d], ['vesting', 'قفل زمانی', LKI], ['milestone', 'آزادسازی مرحله‌ای', I.flag]];
let rowKey = 1;
const defaultSteps = (): MsRow[] => [
  ['تحلیل نیازمندی‌ها', 20, 1], ['طراحی رابط کاربری', 20, 2], ['پیاده‌سازی نسخه اول', 30, 3], ['تست و تحویل', 20, 4], ['پشتیبانی یک‌ماهه', 10, 0],
].map(([title, pct, m]) => ({ key: rowKey++, title: String(title), pct: faDigits(String(pct)), due: m ? jalaliAddMonths(Number(m)) : '' }));
const num = (s: string) => { const n = Number(enDigits(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
/** Field error (red) instead of the row's help text. */
const errOr = (err?: string, help?: ReactNode) => (err ? <span className="nm-help err" role="alert">{err}</span> : help);

function SettingsStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: pkg, isLoading, isError, error, refetch } = useOrgPackage(draftId);
  const { data: contract } = useOrgContract();
  const update = useUpdatePackage();
  const toast = useToast();

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
        <WizardHeader step={2} />
        <Note tone="warn" action={<Link href={routes.org.newRecipients()} className="nm-btn sm ghost">انتخاب گیرندگان</Link>}>ابتدا گیرندگان بسته را انتخاب کنید.</Note>
      </>
    );
  }
  if (isError) return (<><WizardHeader step={2} draftId={draftId} /><ErrorBlock error={error} message="پیش‌نویس پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg || !ready) return (<><WizardHeader step={2} draftId={draftId} /><div className="nm-grid side"><SkeletonCard h={520} /><SkeletonCard h={420} /></div></>);
  if (pkg.status !== 'draft') {
    return (
      <>
        <WizardHeader step={2} />
        <Note tone="warn" action={<Link href={routes.org.package(pkg.id)} className="nm-btn sm ghost">مشاهده بسته</Link>}>این بسته قبلاً ارسال شده و قابل ویرایش نیست.</Note>
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
    if (!validate(true)) { toast('موارد مشخص‌شده را اصلاح کنید', 'error'); return; }
    update.mutate(payload(), { onSuccess: () => router.push(routes.org.newReview(pkg.id)), onError: (e) => toast(errMsg(e), 'error') });
  };
  const saveDraft = () => {
    if (!validate(false)) { toast('موارد مشخص‌شده را اصلاح کنید', 'error'); return; }
    update.mutate(payload(), {
      onSuccess: () => { setSavedAt(now().toISOString()); toast('پیش‌نویس «' + title.trim() + '» ذخیره شد'); router.push(routes.org.packages); },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  const polValue = pol === 'none' ? '' : pol === 'vesting' ? 'تا ' + vest : faDigits(msRows.length) + ' مرحله';
  const lockNote = pol === 'none'
    ? 'کل بسته پس از تأیید کارمند آزاد است؛ تا تأیید، مبلغ از حساب سازمان رزرو می‌شود.'
    : pol === 'vesting'
      ? `پس از تأیید کارمند، بخش صندوقی بسته در دارایی او با نوع «قفل زمانی سازمان» تا ${vest} قفل می‌شود.`
      : `${money(amount)} تومان در صندوق طلای کارمند با نوع «آزادسازی مرحله‌ای» قفل و طی ${faDigits(msRows.length)} مرحله با تأیید سازمان آزاد می‌شود.`;
  const polHelp = pol === 'none'
    ? 'کل بسته پس از تأیید کارمند آزاد است و می‌تواند به ریال فروخته یا برداشت شود.'
    : pol === 'vesting'
      ? 'بخش صندوقی بسته تا این تاریخ در دارایی کارمند قفل می‌ماند و بازده می‌گیرد؛ در این تاریخ خودکار آزاد می‌شود. بخش ریالی آزاد است.'
      : 'جمع سهم‌ها باید دقیقاً ۱۰۰٪ باشد. هر مرحله پس از انجام تعهد توسط کارمند و تأیید سازمان آزاد می‌شود؛ تا آن زمان دارایی در حساب کارمند قفل است ولی بازده می‌گیرد.';
  const allocHelp = isMs ? 'در قرارداد مرحله‌ای ثابت است' : effAlloc === 'free' ? 'کارمند هنگام دریافت بین طلا، درآمد ثابت و ریال انتخاب می‌کند' : 'سهم هر دارایی را تعیین کنید';
  const composer: { key: keyof Split; label: string; tone: Tone }[] = [
    { key: 'gold', label: 'طلا', tone: 'warning' },
    { key: 'fixed', label: 'درآمد ثابت', tone: 'secondary' },
    ...(cash ? [{ key: 'rial' as const, label: 'ریال', tone: 'neutral' as Tone }] : []),
  ];
  const quick = VEST_QUICK.find(([m]) => vest === jalaliAddMonths(m))?.[0] ?? -1;
  const busy = update.isPending;

  const msCols: Column<MsRow>[] = [
    { key: 'n', label: '', width: '28px', render: (_, i) => <Ava letter={faDigits(i + 1)} tone="primary" size="sm" /> },
    {
      key: 'title', label: 'عنوان مرحله / تعهد', width: 'minmax(0, 1fr)', render: (m, i) => (
        <span className="nm-in" style={{ width: '100%' }}>
          <input type="text" value={m.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label={`عنوان مرحله ${faDigits(i + 1)}`} />
        </span>
      ),
    },
    { key: 'pct', label: 'سهم', width: '76px', render: (m, i) => <NumInput value={m.pct} onChange={(v) => setRow(i, { pct: faDigits(enDigits(v).replace(/\D/g, '').slice(0, 3)) })} suffix="٪" width={36} label={`سهم مرحله ${faDigits(i + 1)}`} /> },
    { key: 'amt', label: 'مبلغ (تومان)', width: '96px', render: (m) => <span className="num">{money((amount * num(m.pct)) / 100)}</span> },
    { key: 'due', label: 'سررسید (اختیاری)', width: '116px', render: (m, i) => <NumInput text value={m.due} onChange={(v) => setRow(i, { due: v })} placeholder="بدون سررسید" width={104} label={`سررسید مرحله ${faDigits(i + 1)}`} /> },
    {
      key: 'del', label: '', width: '34px', render: (_, i) => (
        <button type="button" className="nm-ib" aria-label={`حذف مرحله ${faDigits(i + 1)}`} onClick={() => setMsRows((rows) => rows.filter((_r, j) => j !== i))}><Icon d={I.trash} size={16} /></button>
      ),
    },
  ];

  return (
    <>
      <WizardHeader step={2} draftId={pkg.id} recipientsSub={`${faDigits(n)} نفر انتخاب شد`} sub={<>پیش‌نویس · ذخیره‌شده <span className="num">{savedAt ? time(savedAt) : ''}</span></>} />

      <div className="nm-grid side">
        <div className="nm-stack">
          <SettingsGroup title="بسته">
            <SettingRow label="نوع بسته" stack>
              <Chips label="نوع بسته" value={reason} onChange={pickReason} options={REASONS.map((r) => ({ key: r.key, label: r.label }))} />
            </SettingRow>
            <SettingRow label="عنوان بسته" htmlFor="pk-title" desc={errOr(errs.title)}>
              <span className={'nm-in' + (errs.title ? ' err' : '')} style={{ width: 280 }}>
                <input id="pk-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان بسته" aria-invalid={!!errs.title || undefined} maxLength={80} />
              </span>
            </SettingRow>
            <SettingRow label="مبلغ هر نفر" htmlFor="pk-amount" desc={errOr(errs.amount, `جمع برای ${faDigits(n)} نفر: ${money(total)} تومان`)}>
              <NumberInput id="pk-amount" label="مبلغ هر نفر" value={amount || NaN} onChange={(v) => setAmount(Number.isFinite(v) ? Math.max(0, Math.min(1e12, v)) : 0)} suffix="تومان" width={150} invalid={!!errs.amount} />
            </SettingRow>
            <SettingRow label="نحوه مبلغ" desc="بارگذاری مبلغ هر نفر از فایل اکسل به‌زودی فعال می‌شود">
              <div className="nm-chips" role="group" aria-label="نحوه مبلغ">
                <button type="button" className="nm-chip" aria-pressed="true">یکسان برای همه</button>
                <button type="button" className="nm-chip" aria-pressed="false" disabled>از فایل اکسل · به‌زودی</button>
              </div>
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="سیاست قفل" action={<Link href={routes.org.contract} className="nm-more">قواعد قرارداد<Icon d={I.chevL} size={14} /></Link>} footer={polHelp}>
            <SettingRow label="نوع قفل" desc="مجاز طبق قرارداد سازمان" stack>
              <div className="nm-chips" role="group" aria-label="سیاست قفل">
                {POLS.map(([k, label, d]) => {
                  const allowed = allowedPols.includes(k);
                  return (
                    <button key={k} type="button" className="nm-chip" aria-pressed={pol === k} disabled={!allowed} title={allowed ? undefined : 'در قرارداد سازمان مجاز نیست'} onClick={() => { setPol(k); setErrs({}); }}>
                      <Icon d={d} size={15} />{label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
            {pol === 'vesting' && (
              <SettingRow label="آزاد در تاریخ" htmlFor="pk-vest" desc={errOr(errs.vest)} stack>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <NumInput id="pk-vest" text value={vest} onChange={setVest} placeholder="۱۴۰۵/۱۰/۱۵" label="تاریخ آزادسازی" width={130} invalid={!!errs.vest} />
                  <Chips label="مدت قفل" value={quick} onChange={(m) => setVest(jalaliAddMonths(m))} options={VEST_QUICK.map(([m, l]) => ({ key: m, label: l }))} />
                </span>
              </SettingRow>
            )}
          </SettingsGroup>

          {isMs && (
            <Card flush title="مراحل قرارداد" count={msRows.length}
              actions={<Pill tone={msOk ? 'success' : 'error'}>{msOk ? '۱۰۰٪ · درست' : `${faDigits(msTotal)}٪ · باید ۱۰۰٪ باشد`}</Pill>}>
              <Table columns={msCols} rows={msRows} rowKey={(m) => String(m.key)} minWidth={560} empty={<Empty icon={I.flag} title="مرحله‌ای تعریف نشده است" />} />
              <div className="nm-tfoot">
                <button type="button" className="nm-btn sm text" disabled={msRows.length >= 8} onClick={() => setMsRows((rows) => [...rows, { key: rowKey++, title: 'مرحله جدید', pct: '۰', due: '' }])}>
                  <Icon d={I.plus} size={16} strokeWidth={2} />افزودن مرحله
                </button>
                {errs.ms && <span className="nm-help err" role="alert" style={{ marginRight: 'auto' }}>{errs.ms}</span>}
              </div>
            </Card>
          )}

          <SettingsGroup title="برداشت و تخصیص">
            <SettingRow label="برداشت نقدی" desc={cashAllowedByContract ? 'کارمند می‌تواند بخش ریالی را به کارت بانکی خود برداشت کند' : 'در قرارداد سازمان مجاز نیست'}>
              <Switch on={cash} onChange={setCash} label="برداشت نقدی" disabled={!cashAllowedByContract && !cash} />
            </SettingRow>
            <SettingRow label="تخصیص دارایی" desc={allocHelp} stack>
              <Chips label="تخصیص دارایی" value={effAlloc} onChange={setAlloc} disabled={isMs} options={[{ key: 'free', label: 'انتخاب آزاد کارمند' }, { key: 'fixed', label: 'تخصیص ثابت' }]} />
            </SettingRow>
            {isMs && <SettingRow label="۱۰۰٪ صندوق طلا" desc="کل مبلغ به واحد صندوق طلا تبدیل و به نام کارمند ثبت می‌شود" />}
            {!isMs && effAlloc === 'fixed' && (
              <>
                {composer.map((cp) => {
                  const v = num(split[cp.key]);
                  return (
                    <SettingRow key={cp.key} label={cp.label}>
                      <Meter value={v / 100} tone={cp.tone} width={120} label={`${cp.label} ${faDigits(v)}٪`} />
                      <NumInput value={split[cp.key]} onChange={(val) => setSplit((s) => ({ ...s, [cp.key]: faDigits(enDigits(val).replace(/\D/g, '').slice(0, 3)) }))} suffix="٪" width={44} label={cp.label} />
                    </SettingRow>
                  );
                })}
                <SettingRow label="جمع تخصیص" desc={errOr(errs.split)}>
                  <Pill tone={splitSum === 100 ? 'success' : 'error'}>{faDigits(splitSum)}٪{splitSum === 100 ? ' · درست' : ' · باید ۱۰۰٪ باشد'}</Pill>
                </SettingRow>
              </>
            )}
          </SettingsGroup>

          <SettingsGroup title="ارسال">
            <SettingRow label="مهلت تأیید کارمند" htmlFor="pk-expiry" desc={errOr(errs.expiry, 'پس از تأیید شما بلافاصله به صندوق ورودی کارکنان ارسال می‌شود')}>
              <NumInput id="pk-expiry" text value={expiry} onChange={setExpiry} placeholder="۱۴۰۵/۰۹/۱۵" label="مهلت تأیید کارمند" width={130} invalid={!!errs.expiry} />
            </SettingRow>
            <SettingRow label="پیام به کارکنان" htmlFor="pk-msg" desc="اختیاری">
              <span className="nm-in" style={{ width: 280 }}>
                <input id="pk-msg" type="text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={160} placeholder="مثلاً: با سپاس از تلاش‌های شما" aria-label="پیام به کارکنان" />
              </span>
            </SettingRow>
          </SettingsGroup>

          {over && <Note tone="err">جمع بسته ({money(total)} تومان) از موجودی باقی‌ماندهٔ سازمان بیشتر است؛ مبلغ یا تعداد گیرندگان را کاهش دهید.</Note>}
        </div>

        <Card title="خلاصه" actions={<Pill>{REASONS.find((r) => r.key === reason)?.label}</Pill>}>
          <KV rows={[
            ['گیرندگان', (
              <span key="r" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="num">{n === 1 ? `۱ نفر · ${pkg.recipients[0].name}` : `${faDigits(n)} نفر`}</span>
                <Link href={routes.org.newRecipients(pkg.id)} className="nm-more">ویرایش</Link>
              </span>
            )],
            ['مبلغ هر نفر', <span key="a" className="num">{amount ? `${money(amount)} تومان` : '—'}</span>],
            ['برداشت نقدی', cash ? (pol === 'none' ? 'مجاز' : 'مجاز · فقط بخش آزاد') : 'غیرمجاز'],
            ['سیاست قفل', <span key="p" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={pol} />{polValue && <span className="num">{polValue}</span>}</span>],
          ]} />
          <Section title="جمع کل بسته‌ها"><BigNum value={money(total)} unit="تومان" /></Section>
          <Section title="منبع: حساب سازمان" action={<span className="num">موجودی {remainNow.value} {remainNow.unit}</span>}>
            <Meter value={Math.min(100, Math.max(total ? 1 : 0, usePct)) / 100} tone={over ? 'error' : 'primary'} label={`${faDigits(Math.round(usePct))}٪ موجودی`} />
            <span style={{ fontSize: 12, lineHeight: 1.6, color: over ? 'var(--error-text)' : 'var(--text-secondary)' }}>
              {over ? 'مبلغ بسته از موجودی سازمان بیشتر است' : usePct < 1 ? 'کمتر از ۱٪ موجودی' : `${faDigits(Math.round(usePct))}٪ موجودی مصرف می‌شود`} · باقی‌مانده: <span className="num" style={{ color: 'var(--text-primary)' }}>{remainAfter.value} {remainAfter.unit} تومان</span>
            </span>
          </Section>
          <Note tone="info" icon={chip.d}>{lockNote}</Note>
        </Card>
      </div>

      <ActionBar actions={(
        <>
          <Link href={routes.org.newRecipients(pkg.id)} className="nm-btn text"><Icon d={I.chevR} size={16} />مرحله قبل</Link>
          <button type="button" className="nm-btn ghost" onClick={saveDraft} disabled={busy}>ذخیره پیش‌نویس</button>
          <button type="button" className="nm-btn" onClick={goNext} disabled={busy}>
            {busy ? 'در حال ذخیره…' : 'مرحله بعد: بررسی و ارسال'}<Icon d={I.chevL} size={16} strokeWidth={2} />
          </button>
        </>
      )}>
        <span><b className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(n)}</b> نفر · جمع <b className="num" style={{ color: 'var(--text-primary)' }}>{money(total)}</b> تومان</span>
        {over && <Pill tone="error" dot>بیش از موجودی سازمان</Pill>}
      </ActionBar>
    </>
  );
}

export default function NewPackageSettingsPage() {
  return <Suspense fallback={null}><SettingsStep /></Suspense>;
}
