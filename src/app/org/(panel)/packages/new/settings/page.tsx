'use client';
/**
 * Send wizard, step 2 — package settings (title, amount, receive policy, allocation, expiry, message).
 * Cash withdrawal is not asked: the free («آزاد») part is withdrawable whenever the contract allows cash (`cashAllowed` follows the contract).
 * The package type is not asked: it follows the receive policy (milestone → project contract, otherwise bonus).
 * When step 1 loaded amounts from a file (`amountSource: 'file'`), the amount per person is read-only here.
 * Milestone steps: every step has a required due date («سررسید») and «نیاز به تأیید» (on = released after the
 * organization approves it in «درخواست‌ها»; off = released automatically at the due date). All dates use DateInput.
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
import { DateInput } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, WizardHeader } from '@/components/org/packages/Stepper';
import { I, jalaliAddMonths, lockChip, parseJalali, perPersonText, splitCompact } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, money, time } from '@/lib/format';
import { now } from '@/lib/clock';
import type { LockPolicy, PackageReason } from '@/types/domain';

type PolType = LockPolicy['type'];
/** One milestone row: `due` = Jalali text of the date field, `approval` = «نیاز به تأیید». */
interface MsRow { key: number; title: string; pct: string; due: string; approval: boolean }
type Split = { gold: string; fixed: string; rial: string };
const VEST_QUICK: [number, string][] = [[3, '۳ ماه'], [6, '۶ ماه'], [12, '۱ سال']];
/** Receive policies («شیوه‌ی دریافت») offered in the wizard: label + icon from LOCK_META (customer wording, docs/WORDING.md). */
const POLS: [PolType, string, string][] = (['none', 'vesting', 'milestone'] as const).map((k): [PolType, string, string] => [k, LOCK_META[k].label, LOCK_META[k].d]);
let rowKey = 1;
const defaultSteps = (): MsRow[] => [
  ['تحلیل نیازمندی‌ها', 20, 1], ['طراحی رابط کاربری', 20, 2], ['پیاده‌سازی نسخه اول', 30, 3], ['تست و تحویل', 20, 4], ['پشتیبانی یک‌ماهه', 10, 5],
].map(([title, pct, m]) => ({ key: rowKey++, title: String(title), pct: faDigits(String(pct)), due: jalaliAddMonths(Number(m)), approval: true }));
const num = (s: string) => { const n = Number(enDigits(s).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const timeOf = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);
/** Due date of a new step: a month after the last step (or a month from today). */
const nextDue = (rows: MsRow[]) => {
  const last = parseJalali(rows[rows.length - 1]?.due ?? '');
  return jalaliAddMonths(1, last ? new Date(last) : now());
};
/** Due-date problems of the milestone rows: the first message and the keys of the rows to mark. */
function dueProblems(rows: MsRow[]): { msg?: string; keys: number[] } {
  const isos = rows.map((r) => parseJalali(r.due));
  const t = now().getTime();
  const kind = rows.map((r, i): 0 | 1 | 2 | 3 | 4 => {
    if (!r.due.trim()) return 1;
    if (!isos[i]) return 2;
    if (timeOf(isos[i]) <= t) return 3;
    if (i > 0 && isos[i - 1] && timeOf(isos[i]) < timeOf(isos[i - 1])) return 4;
    return 0;
  });
  const keys = rows.filter((_, i) => kind[i]).map((r) => r.key);
  const msg = kind.includes(1) ? 'سررسید همه‌ی مراحل را وارد کنید.'
    : kind.includes(2) ? 'سررسید مراحل را به شکل ۱۴۰۵/۰۹/۲۰ وارد کنید.'
    : kind.includes(3) ? 'سررسید مراحل باید در آینده باشد.'
    : kind.includes(4) ? 'سررسید هر مرحله باید هم‌زمان یا پس از مرحله‌ی قبل باشد.' : undefined;
  return { msg, keys };
}
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
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [pol, setPol] = useState<PolType>('vesting');
  const [vest, setVest] = useState('');
  const [msRows, setMsRows] = useState<MsRow[]>([]);
  const [alloc, setAlloc] = useState<'free' | 'fixed'>('free');
  const [split, setSplit] = useState<Split>({ gold: '۵۰', fixed: '۳۰', rial: '۲۰' });
  const [message, setMessage] = useState('');
  const [expiry, setExpiry] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  /** Milestone rows whose due date is marked as wrong. */
  const [badDue, setBadDue] = useState<number[]>([]);
  const [savedAt, setSavedAt] = useState<string | undefined>();

  const settings = contract?.settings;
  const allowedPols = settings?.lockPolicies ?? ['none', 'vesting', 'milestone'];
  /** Withdrawal of the free part follows the contract; there is no separate switch. */
  const cash = settings?.cashWithdrawalAllowed ?? true;

  useEffect(() => {
    if (ready || !pkg) return;
    setTitle(pkg.title);
    setAmount(pkg.amountPerPerson);
    const lp = pkg.lockPolicy;
    setPol(lp.type === 'none' && pkg.amountPerPerson === 0 && pkg.reason !== 'project_contract' ? 'vesting' : lp.type);
    setVest(lp.type === 'vesting' ? jDate(lp.releaseAt) : jalaliAddMonths(3));
    setMsRows(lp.type === 'milestone'
      ? lp.steps.map((s) => ({ key: rowKey++, title: s.title, pct: faDigits(String(s.sharePct)), due: s.dueDate ? jDate(s.dueDate) : '', approval: s.requiresApproval !== false }))
      : defaultSteps());
    setAlloc(pkg.allocationMode);
    if (pkg.fixedSplit) setSplit({ gold: faDigits(String(pkg.fixedSplit.gold ?? 0)), fixed: faDigits(String(pkg.fixedSplit.fixed ?? 0)), rial: faDigits(String(pkg.fixedSplit.rial ?? 0)) });
    setMessage(pkg.message ?? '');
    setExpiry(pkg.expiresAt ? jDate(pkg.expiresAt) : jalaliAddMonths(1));
    setSavedAt(pkg.createdAt);
    setReady(true);
  }, [pkg, ready]);

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
  const fromFile = pkg.amountSource === 'file';
  const fileTotal = pkg.recipients.reduce((s, r) => s + r.amount, 0);
  const total = fromFile ? fileTotal : amount * n;
  /** Amount of one person (for milestone amounts); unknown when a file gives different amounts. */
  const one = fromFile ? (n === 1 ? pkg.recipients[0].amount : NaN) : amount;
  const fileRange = fromFile ? perPersonText(pkg, money) : '';
  // package type follows the receive policy (no separate question)
  const reason: PackageReason = isMs ? 'project_contract' : pkg.reason === 'project_contract' ? 'bonus' : pkg.reason;
  const remaining = contract ? contract.budgetYear - contract.budgetUsed : 0;
  const usePct = remaining > 0 ? (total * 100) / remaining : 0;
  const over = !!contract && total > remaining;
  const remainAfter = splitCompact(Math.max(0, remaining - total));
  const remainNow = splitCompact(remaining);
  const msTotal = msRows.reduce((s, r) => s + num(r.pct), 0);
  /** Steps released automatically at their due date. */
  const msAuto = msRows.filter((r) => !r.approval).length;
  const msOk = msTotal === 100;
  const effAlloc: 'free' | 'fixed' = isMs ? 'fixed' : alloc;
  const sp_ = { gold: num(split.gold), fixed: num(split.fixed), rial: cash ? num(split.rial) : 0 };
  const splitSum = sp_.gold + sp_.fixed + sp_.rial;
  const chip = lockChip(pol);

  const setRow = (i: number, patch: Partial<MsRow>) => {
    if (patch.due !== undefined) setBadDue((keys) => keys.filter((k) => k !== msRows[i]?.key));
    setMsRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const validate = (strict: boolean) => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان بسته را وارد کنید.';
    if (strict && !fromFile && amount <= 0) e.amount = 'مبلغ هر نفر را وارد کنید.';
    if (pol === 'vesting') {
      const iso = parseJalali(vest);
      if (!iso) e.vest = 'تاریخ را به شکل ۱۴۰۵/۱۰/۱۵ وارد کنید.';
      else if (new Date(iso).getTime() <= now().getTime()) e.vest = 'تاریخ آزادسازی باید در آینده باشد.';
    }
    let bad: number[] = [];
    if (isMs) {
      const due = dueProblems(msRows);
      bad = due.keys;
      if (!msRows.length) e.ms = 'حداقل یک مرحله تعریف کنید.';
      else if (msRows.some((r) => !r.title.trim())) e.ms = 'عنوان همه مراحل را وارد کنید.';
      else if (msRows.some((r) => num(r.pct) < 5)) e.ms = 'سهم هر مرحله حداقل ۵٪ است.';
      else if (!msOk) e.ms = 'جمع سهم مراحل باید دقیقاً ۱۰۰٪ باشد.';
      else if (due.msg) e.ms = due.msg;
    }
    setBadDue(bad);
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
        ? { type: 'milestone', steps: msRows.map((r) => ({ title: r.title.trim(), sharePct: num(r.pct), dueDate: parseJalali(r.due) ?? undefined, requiresApproval: r.approval })) }
        : { type: 'none' };
    return {
      id: pkg.id, title: title.trim(), reason, ...(fromFile ? {} : { amountPerPerson: amount }), cashAllowed: cash, lockPolicy,
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
      ? `پس از تأیید کارمند، بخش صندوقی بسته به‌عنوان «${LOCK_META.vesting.label}» تا ${vest} در دارایی او رزرو می‌شود و بازده می‌گیرد.`
      : `${Number.isFinite(one) ? `${money(one)} تومان` : 'مبلغ هر نفر'} به‌عنوان «${LOCK_META.milestone.label}» در صندوق طلای کارمند رزرو می‌شود و طی ${faDigits(msRows.length)} مرحله آزاد می‌شود${msAuto ? `؛ ${msAuto === msRows.length ? 'همه‌ی مراحل' : faDigits(msAuto) + ' مرحله'} خودکار در سررسید` : ''}.`;
  const polHelp = pol === 'none'
    ? 'کل بسته پس از تأیید کارمند آزاد است؛ کارمند می‌تواند آن را به ریال بفروشد یا برداشت کند.'
    : pol === 'vesting'
      ? 'بخش صندوقی بسته تا این تاریخ به‌عنوان پس‌انداز در دارایی کارمند می‌ماند و بازده می‌گیرد؛ در این تاریخ خودکار آزاد می‌شود. بخش ریالی از ابتدا آزاد است.'
      : 'جمع سهم‌ها باید دقیقاً ۱۰۰٪ باشد. هر مرحله در سررسید خود آزاد می‌شود: با «نیاز به تأیید»، پس از تأیید شما در درخواست‌ها؛ بدون آن، خودکار. تا آن زمان سهم در دارایی کارمند رزرو است و بازده می‌گیرد.';
  const allocHelp = isMs ? `در ${LOCK_META.milestone.label} تخصیص ثابت است` : effAlloc === 'free' ? 'کارمند هنگام دریافت بین طلا، درآمد ثابت و ریال انتخاب می‌کند' : 'سهم هر دارایی را تعیین کنید';
  const composer: { key: keyof Split; label: string; tone: Tone }[] = [
    { key: 'gold', label: 'طلا', tone: 'warning' },
    { key: 'fixed', label: 'درآمد ثابت', tone: 'secondary' },
    ...(cash ? [{ key: 'rial' as const, label: 'ریال', tone: 'neutral' as Tone }] : []),
  ];
  const quick = VEST_QUICK.find(([m]) => vest === jalaliAddMonths(m))?.[0] ?? -1;
  const busy = update.isPending;

  // fits the content column at 1280px: the amount sits under the title, the due date field is compact
  const msCols: Column<MsRow>[] = [
    { key: 'n', label: '', width: '28px', render: (_, i) => <Ava letter={faDigits(i + 1)} tone="primary" size="sm" /> },
    {
      key: 'title', label: 'عنوان مرحله / تعهد', width: 'minmax(0, 1fr)', col: true, render: (m, i) => (
        <>
          <span className="nm-in" style={{ width: '100%' }}>
            <input type="text" value={m.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label={`عنوان مرحله ${faDigits(i + 1)}`} />
          </span>
          <span className="sm num">{Number.isFinite(one) ? `${money((one * num(m.pct)) / 100)} تومان` : 'مبلغ طبق فایل'}</span>
        </>
      ),
    },
    { key: 'pct', label: 'سهم', width: '68px', render: (m, i) => <NumInput value={m.pct} onChange={(v) => setRow(i, { pct: faDigits(enDigits(v).replace(/\D/g, '').slice(0, 3)) })} suffix="٪" width={36} label={`سهم مرحله ${faDigits(i + 1)}`} /> },
    {
      key: 'due', label: 'سررسید', width: '126px', render: (m, i) => (
        <DateInput value={m.due} onChange={(v) => setRow(i, { due: v })} min={now()} width={86} label={`سررسید مرحله ${faDigits(i + 1)}`} invalid={badDue.includes(m.key)} />
      ),
    },
    {
      key: 'ap', label: 'نیاز به تأیید', width: '66px', align: 'center', render: (m, i) => (
        <Switch on={m.approval} onChange={(v) => setRow(i, { approval: v })} label={`نیاز به تأیید مرحله ${faDigits(i + 1)}`} />
      ),
    },
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
            <SettingRow label="عنوان بسته" htmlFor="pk-title" desc={errOr(errs.title)}>
              <span className={'nm-in' + (errs.title ? ' err' : '')} style={{ width: 280 }}>
                <input id="pk-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان بسته" aria-invalid={!!errs.title || undefined} maxLength={80} />
              </span>
            </SettingRow>
            {fromFile ? (
              <SettingRow
                label="مبلغ هر نفر"
                desc={<>از فایل اکسل · جمع برای {faDigits(n)} نفر: <span className="num">{money(total)}</span> تومان · <Link href={routes.org.newRecipients(pkg.id)} className="nm-more">تغییر فایل</Link></>}
              >
                <span className="nm-in" aria-disabled="true" style={{ minWidth: 150, justifyContent: 'space-between', gap: 8, background: 'var(--bg-neutral)', color: 'var(--text-secondary)' }}>
                  <span className="num" style={{ color: 'var(--text-primary)' }}>{fileRange || '—'}</span>
                  <span style={{ fontSize: 12 }}>تومان</span>
                </span>
              </SettingRow>
            ) : (
              <SettingRow label="مبلغ هر نفر" htmlFor="pk-amount" desc={errOr(errs.amount, `جمع برای ${faDigits(n)} نفر: ${money(total)} تومان`)}>
                <NumberInput id="pk-amount" label="مبلغ هر نفر" value={amount || NaN} onChange={(v) => setAmount(Number.isFinite(v) ? Math.max(0, Math.min(1e12, v)) : 0)} suffix="تومان" width={150} invalid={!!errs.amount} />
              </SettingRow>
            )}
          </SettingsGroup>

          <SettingsGroup title="شیوه‌ی دریافت" action={<Link href={routes.org.contract} className="nm-more">قواعد قرارداد<Icon d={I.chevL} size={14} /></Link>} footer={polHelp}>
            <SettingRow label="گزینه‌ها" desc="مجاز طبق قرارداد سازمان" stack>
              <div className="nm-chips" role="group" aria-label="شیوه‌ی دریافت">
                {POLS.map(([k, label, d]) => {
                  const allowed = allowedPols.includes(k);
                  return (
                    <button key={k} type="button" className="nm-chip" aria-pressed={pol === k} disabled={!allowed} title={allowed ? undefined : 'در قرارداد فعلی سازمان فعال نیست'} onClick={() => { setPol(k); setErrs({}); }}>
                      <Icon d={d} size={15} />{label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
            {pol === 'vesting' && (
              <SettingRow label="آزاد در تاریخ" htmlFor="pk-vest" desc={errOr(errs.vest)} stack>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <DateInput id="pk-vest" value={vest} onChange={setVest} min={now()} placeholder="۱۴۰۵/۱۰/۱۵" label="تاریخ آزادسازی" width={100} invalid={!!errs.vest} />
                  <Chips label="مدت پس‌انداز" value={quick} onChange={(m) => setVest(jalaliAddMonths(m))} options={VEST_QUICK.map(([m, l]) => ({ key: m, label: l }))} />
                </span>
              </SettingRow>
            )}
          </SettingsGroup>

          {isMs && (
            <Card flush title="مراحل قرارداد" count={msRows.length}
              actions={<Pill tone={msOk ? 'success' : 'error'}>{msOk ? '۱۰۰٪ · درست' : `${faDigits(msTotal)}٪ · باید ۱۰۰٪ باشد`}</Pill>}>
              <Table columns={msCols} rows={msRows} rowKey={(m) => String(m.key)} minWidth={540} empty={<Empty icon={I.flag} title="مرحله‌ای تعریف نشده است" />} />
              <div className="nm-tfoot">
                <button type="button" className="nm-btn sm text" disabled={msRows.length >= 8} onClick={() => setMsRows((rows) => [...rows, { key: rowKey++, title: 'مرحله جدید', pct: '۰', due: nextDue(rows), approval: true }])}>
                  <Icon d={I.plus} size={16} strokeWidth={2} />افزودن مرحله
                </button>
                {errs.ms && <span className="nm-help err" role="alert" style={{ marginRight: 'auto' }}>{errs.ms}</span>}
              </div>
            </Card>
          )}

          <SettingsGroup title="تخصیص">
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
              <DateInput id="pk-expiry" value={expiry} onChange={setExpiry} min={now()} clearable placeholder="۱۴۰۵/۰۹/۱۵" label="مهلت تأیید کارمند" width={100} invalid={!!errs.expiry} />
            </SettingRow>
            <SettingRow label="پیام به کارکنان" htmlFor="pk-msg" desc="اختیاری">
              <span className="nm-in" style={{ width: 280 }}>
                <input id="pk-msg" type="text" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={160} placeholder="مثلاً: با سپاس از تلاش‌های شما" aria-label="پیام به کارکنان" />
              </span>
            </SettingRow>
          </SettingsGroup>

          {over && <Note tone="err">جمع بسته ({money(total)} تومان) از موجودی باقی‌ماندهٔ سازمان بیشتر است؛ مبلغ یا تعداد گیرندگان را کاهش دهید.</Note>}
        </div>

        <Card title="خلاصه">
          <KV rows={[
            ['گیرندگان', (
              <span key="r" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span className="num">{n === 1 ? `۱ نفر · ${pkg.recipients[0].name}` : `${faDigits(n)} نفر`}</span>
                <Link href={routes.org.newRecipients(pkg.id)} className="nm-more">ویرایش</Link>
              </span>
            )],
            ['مبلغ هر نفر', <span key="a" className="num">{fromFile ? (fileRange ? `${fileRange} تومان` : '—') : amount ? `${money(amount)} تومان` : '—'}</span>],
            ['شیوه‌ی دریافت', <span key="p" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={pol} />{polValue && <span className="num">{polValue}</span>}</span>],
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
