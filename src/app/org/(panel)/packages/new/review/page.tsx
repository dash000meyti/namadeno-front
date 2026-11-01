'use client';
/**
 * Send wizard, step 3 — review, rial account / budget check and send. Kit wizard page: heading + steps → package settings,
 * recipients (and «پرداخت» when needed) beside the approval card (chain, rial account, confirmation) → sticky action bar.
 * Money: when «آزاد» of the organization's rial account covers the total, the package is sent at once (useSendPackage).
 * Otherwise the «پرداخت» card collects the receipt («فیش واریز») for the shortfall: amount (pre-filled, min = the shortfall),
 * the file (required) and an optional description; «ارسال فیش و ثبت بسته» (useSendPackageWithReceipt) puts the package in
 * the queue («در انتظار تأیید واریز»): nothing reaches the recipients and nothing is blocked until Namadno approves the
 * receipt — only the part «آزاد» covers is set aside for it. There is no payment deadline.
 * A paid package whose fund parts Namadno's stock does not cover yet comes back `awaiting_stock` («در صف تأمین موجودی»):
 * a toast says when it goes out at the latest (`stockEta`), then the sent page shows it.
 * The annual budget cap («سقف بودجه‌ی سالانه», minus packages already in the queue) still blocks sending (over_budget).
 * The sent page reads the package and its receipt.
 */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiRequestError } from '@/api/client';
import { useOrgContract, useOrgEmployees, useOrgMe, useOrgPackage, useSendPackage } from '@/api/org';
import { useOrgAccount, useSendPackageWithReceipt } from '@/api/org-money-extra';
import {
  ActionBar, Ava, BigNum, Card, ErrorBlock, Field, Ident, KV, List, ListRow, Note, NumInput, NumberInput, Pill, Section, SkeletonCard, Table, TableFoot,
  type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { LockTag, StepMark, WizardHeader, type StepState } from '@/components/org/packages/Stepper';
import { I, allocationText, perPersonText, splitCompact } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { MIN_DEPOSIT, NamadnoBank } from '@/components/org/money/AnnounceDepositDialog';
import { OM } from '@/components/org/money/meta';
import { ReceiptUpload } from '@/components/org/money/ReceiptUpload';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDateTime, jDayMonth, money, relTime } from '@/lib/format';
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
  const acctQ = useOrgAccount();
  const acct = acctQ.data;
  const { data: me } = useOrgMe();
  const { data: emps } = useOrgEmployees();
  const send = useSendPackage();
  const sendPaid = useSendPackageWithReceipt();
  const toast = useToast();
  const [ack, setAck] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [serverErr, setServerErr] = useState<{ code: string; message: string } | null>(null);
  // «پرداخت»: receipt for what «آزاد» does not cover (`payAmount` null = not edited → the shortfall)
  const [receipt, setReceipt] = useState<File | null>(null);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payNote, setPayNote] = useState('');
  const [payErr, setPayErr] = useState<{ amount?: string; receipt?: string }>({});
  // after a successful send the package is no longer a draft: keep a skeleton until the sent page opens
  const [leaving, setLeaving] = useState(false);

  if (!draftId) {
    return (
      <>
        <WizardHeader step={3} />
        <Note tone="warn" action={<Link href={routes.org.newRecipients()} className="nm-btn sm ghost">شروع ارسال جدید</Link>}>پیش‌نویسی انتخاب نشده است.</Note>
      </>
    );
  }
  if (isError) return (<><WizardHeader step={3} /><ErrorBlock error={error} message="پیش‌نویس پیدا نشد" onRetry={() => refetch()} /></>);
  if (isLoading || !pkg || leaving) return (<><WizardHeader step={3} draftId={draftId} /><div className="nm-grid side"><SkeletonCard h={480} /><SkeletonCard h={420} /></div></>);
  if (pkg.status !== 'draft') {
    return (
      <>
        <WizardHeader step={3} />
        <Note tone="info" action={<Link href={routes.org.package(pkg.id)} className="nm-btn sm ghost">مشاهده بسته</Link>}>
          {pkg.status === 'awaiting_payment' ? 'این بسته ثبت شده و در انتظار تأیید واریز است.'
            : pkg.status === 'awaiting_stock' ? 'این بسته ثبت شده و در صف تأمین موجودی نمادنو است.'
            : pkg.status === 'cancelled' ? 'این بسته لغو شده است.' : 'این بسته قبلاً ارسال شده است.'}
        </Note>
      </>
    );
  }

  const n = pkg.recipients.length;
  // annual budget cap (a yearly limit, not the account balance); packages in the queue will use it when delivered
  const remaining = contract ? contract.budgetYear - contract.budgetUsed - (acct?.queuedTotal ?? 0) : 0;
  const over = !!contract && pkg.total > remaining;
  const remainAfter = splitCompact(Math.max(0, remaining - pkg.total));
  const remainNow = splitCompact(remaining);
  // rial account: blocked from «آزاد»; whatever «آزاد» does not cover needs a deposit receipt («پرداخت»)
  const free = acct ? Math.max(0, acct.free) : 0;
  const fromFree = Math.min(pkg.total, free);
  const toDeposit = acct ? Math.max(0, pkg.total - free) : 0;
  const needReceipt = toDeposit > 0;
  const minPay = Math.max(MIN_DEPOSIT, Math.ceil(toDeposit));
  const pay = payAmount ?? minPay;
  const payBad = needReceipt && !(pay >= minPay);
  const freeNow = splitCompact(free);
  const cmp = (v: number) => { const c = splitCompact(v); return `${c.value} ${c.unit}`.trim(); };
  const lp = pkg.lockPolicy;
  const per = perPersonText(pkg, money);
  const missing = !pkg.total ? 'مبلغ هر نفر تعیین نشده است.' : !n ? 'هیچ گیرنده‌ای انتخاب نشده است.' : '';
  const busy = send.isPending || sendPaid.isPending;
  // the account decides the flow: wait for it (an error falls back to the plain send; the server asks for a receipt if needed)
  const acctKnown = !!acct || acctQ.isError;
  const canSend = ack && !over && !missing && !busy && acctKnown && (!needReceipt || (!!receipt && !payBad));
  const empOf = (id: string) => emps?.find((e) => e.id === id);
  const units = new Set(pkg.recipients.map((r) => empOf(r.employeeId)?.department).filter(Boolean)).size;
  const adminName = me?.admin.name ?? 'نیما رضایی';

  const chain: { label: string; sub: string; state: StepState; s: string; tone: Tone }[] = [
    { label: me?.admin.role ?? 'کارشناس', sub: `${adminName} · ${relTime(pkg.createdAt, now())}`, state: ack ? 'done' : 'current', s: ack ? 'تأیید شد' : 'در انتظار', tone: ack ? 'success' : 'warning' },
    needReceipt ? {
      label: 'تأیید فیش توسط نمادنو',
      sub: over ? 'بیش از سقف بودجه‌ی سالانه' : receipt ? `فیش ${cmp(pay)} تومان · پس از ثبت بررسی می‌شود` : `برای ${cmp(toDeposit)} تومان باقی‌مانده فیش واریز لازم است`,
      state: !ack ? 'pending' : 'current',
      s: over ? 'بیش از سقف' : receipt ? 'فیش آماده' : 'نیاز به فیش',
      tone: over ? 'error' : receipt ? 'info' : 'warning',
    } : {
      label: 'کنترل حساب ریالی و سقف بودجه',
      sub: over ? 'بیش از سقف بودجه‌ی سالانه' : !acct ? 'در حال بررسی حساب ریالی سازمان…' : `از «آزاد» ${cmp(fromFree)} تومان بلاک می‌شود`,
      state: !ack ? 'pending' : over ? 'current' : 'done',
      s: over ? 'بیش از سقف' : 'کافی',
      tone: over ? 'error' : 'success',
    },
    {
      label: 'ارسال به کارکنان',
      sub: needReceipt ? 'پس از تأیید فیش · صندوق ورودی و اعلان' : 'بلافاصله پس از تأیید شما · صندوق ورودی و اعلان',
      state: canSend && !needReceipt ? 'current' : 'pending',
      s: needReceipt ? 'پس از تأیید فیش' : 'آماده ارسال',
      tone: canSend && !needReceipt ? 'warning' : 'neutral',
    },
  ];

  const defs: [string, ReactNode][] = [
    ['عنوان', pkg.title],
    ['مبلغ هر نفر', <span key="a" className="num" style={per ? undefined : { color: 'var(--error-text)' }}>{per ? `${per} تومان` : '—'}</span>],
    ['نحوه مبلغ', pkg.amountSource === 'file' ? 'از فایل اکسل (برای هر نفر جدا)' : 'یکسان برای همه'],
    ['تخصیص دارایی', allocationText(pkg)],
    ['شیوه‌ی دریافت', <span key="l" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><LockTag type={lp.type} /><span className="num">{lp.type === 'vesting' ? 'آزاد در ' + jDate(lp.releaseAt) : lp.type === 'milestone' ? `${faDigits(lp.steps.length)} مرحله` : 'پس از پذیرش'}</span></span>],
    ['مهلت تأیید', <span key="e" className="num">{pkg.expiresAt ? jDate(pkg.expiresAt) : 'بدون مهلت'}</span>],
  ];

  const onError = (e: unknown) => {
    const code = e instanceof ApiRequestError ? e.code : 'error';
    if (code === 'bad_amount' && needReceipt) { setPayErr({ amount: errMsg(e) }); return; }
    if ((code === 'bad_receipt' || code === 'missing_receipt') && needReceipt) { setPayErr({ receipt: errMsg(e) }); return; }
    if (code === 'receipt_required') acctQ.refetch(); // «آزاد» changed meanwhile: the «پرداخت» card appears
    setServerErr({ code, message: errMsg(e) });
    toast(errMsg(e), 'error');
  };
  const confirm = () => {
    if (!canSend) return;
    setServerErr(null);
    setPayErr({});
    const done = {
      onSuccess: (p: OrgPackage) => {
        // paid, but Namadno's fund stock is short: it waits in the queue and goes out automatically
        if (p.status === 'awaiting_stock') toast(`بسته ثبت شد؛ پس از تأمین موجودی نمادنو${p.stockEta ? ` (حداکثر تا ${jDateTime(p.stockEta)})` : ''} ارسال می‌شود`, 'info');
        setLeaving(true);
        router.push(routes.org.newSent(p.id));
      },
      onError,
    };
    if (needReceipt && receipt) sendPaid.mutate({ packageId: pkg.id, amount: pay, receipt, note: payNote.trim() || undefined }, done);
    else send.mutate(pkg.id, done);
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

          {needReceipt && (
            <Card id="pk-pay" title="پرداخت" sub="فیش واریز برای مبلغ باقی‌مانده" actions={<Pill tone={receipt ? 'info' : 'warning'} dot>{receipt ? 'فیش انتخاب شد' : 'فیش لازم است'}</Pill>}>
              <Note tone="warn" icon={OM.deposit}>
                «آزاد» حساب ریالی <span className="num">{money(free)}</span> تومان است؛ برای <span className="num">{money(toDeposit)}</span> تومان باقی‌مانده فیش واریز لازم است.
              </Note>
              <NamadnoBank />
              <div className="nm-grid c2">
                <Field
                  label="مبلغ واریز" htmlFor="pay-amount"
                  error={payErr.amount ?? (payBad ? `مبلغ واریز دست‌کم ${money(minPay)} تومان است.` : undefined)}
                  help={`دست‌کم ${money(minPay)} تومان؛ بیشتر از آن به «آزاد» اضافه می‌شود`}
                >
                  <NumberInput
                    id="pay-amount" label="مبلغ واریز" value={pay} suffix="تومان" full invalid={payBad || !!payErr.amount}
                    onChange={(v) => { setPayAmount(Number.isFinite(v) ? Math.max(0, Math.min(1e13, v)) : NaN); setPayErr((x) => ({ ...x, amount: undefined })); }}
                  />
                </Field>
                <Field label="توضیحات (اختیاری)" htmlFor="pay-note">
                  <NumInput id="pay-note" label="توضیحات واریز" value={payNote} onChange={(v) => setPayNote(v.slice(0, 200))} text full placeholder="شماره پیگیری، نوع انتقال…" />
                </Field>
              </div>
              <ReceiptUpload value={receipt} onChange={(f) => { setReceipt(f); setPayErr((x) => ({ ...x, receipt: undefined })); }} error={payErr.receipt} disabled={busy} />
              <Note tone="mute" icon={OM.clock}>
                بسته پس از ثبت در صف «در انتظار تأیید واریز» می‌ماند: همکاران باخبر نمی‌شوند و چیزی بلاک نمی‌شود. با تأیید فیش توسط نمادنو، بسته برای آن‌ها ارسال می‌شود.
              </Note>
            </Card>
          )}
        </div>

        <Card title="تأیید و ارسال">
          <Section title="زنجیره تأیید">
            <List>
              {chain.map((c, i) => (
                <ListRow key={c.label} lead={<StepMark state={c.state} n={i + 1} />} title={c.label} sub={c.sub} trail={<Pill tone={c.tone}>{c.s}</Pill>} />
              ))}
            </List>
          </Section>
          <Section title="حساب ریالی سازمان" action={<span className="num">{acct ? `آزاد ${freeNow.value} ${freeNow.unit}`.trim() : '…'}</span>}>
            <BigNum value={money(pkg.total)} unit="تومان" />
            <span style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {!acct ? 'در حال دریافت حساب ریالی سازمان…'
                : needReceipt
                  ? <>تا تأیید فیش چیزی بلاک نمی‌شود{fromFree > 0 ? <>؛ <span className="num" style={{ color: 'var(--text-primary)' }}>{money(fromFree)}</span> تومان از «آزاد» برای این بسته کنار گذاشته می‌شود</> : null}. با تأیید فیش، مبلغ بسته بلاک و برای همکاران ارسال می‌شود.</>
                  : <>از «آزاد» <span className="num" style={{ color: 'var(--text-primary)' }}>{money(fromFree)}</span> تومان بلاک می‌شود و تا دریافت همکاران بلاک می‌ماند.</>}
            </span>
            {needReceipt && (
              <Note tone="warn" action={<a href="#pk-pay" className="nm-btn sm ghost">پرداخت</a>}>
                برای <span className="num">{money(toDeposit)}</span> تومان باقی‌مانده فیش واریز را در کارت «پرداخت» بارگذاری کنید؛ بسته پس از تأیید فیش ارسال می‌شود.
              </Note>
            )}
            {contract && (
              <span style={{ fontSize: 12, lineHeight: 1.6, color: over ? 'var(--error-text)' : 'var(--text-secondary)' }}>
                سقف بودجه‌ی سالانه: باقی‌مانده <span className="num">{`${remainNow.value} ${remainNow.unit}`.trim()} تومان</span>
                {over ? '؛ مبلغ بسته بیشتر است' : <> · پس از این بسته <span className="num" style={{ color: 'var(--text-primary)' }}>{`${remainAfter.value} ${remainAfter.unit}`.trim()} تومان</span></>}
              </span>
            )}
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
            <Icon d={I.send} size={16} />
            {needReceipt ? (sendPaid.isPending ? 'در حال ارسال فیش…' : 'ارسال فیش و ثبت بسته') : (send.isPending ? 'در حال ارسال…' : 'تأیید و ارسال به کارکنان')}
          </button>
        </>
      )}>
        <span><b className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(n)}</b> نفر · جمع <b className="num" style={{ color: 'var(--text-primary)' }}>{money(pkg.total)}</b> تومان</span>
        {over && <Pill tone="error" dot>بیش از سقف بودجه‌ی سالانه</Pill>}
        {!over && needReceipt && !receipt && <a href="#pk-pay" style={{ textDecoration: 'none' }}><Pill tone="warning" dot>فیش واریز برای {cmp(toDeposit)} تومان لازم است</Pill></a>}
        {!over && needReceipt && receipt && <Pill tone="info" dot>فیش {cmp(pay)} تومان · پس از تأیید نمادنو ارسال می‌شود</Pill>}
        {!ack && <Pill tone="warning" dot>تأیید اطلاعات بسته لازم است</Pill>}
      </ActionBar>
    </>
  );
}

export default function NewPackageReviewPage() {
  return <Suspense fallback={null}><ReviewStep /></Suspense>;
}
