'use client';
/**
 * «بررسی فیش واریز» — the operator reviews an organization's deposit receipt («فیش واریز»):
 *   تأیید و افزودن به حساب  the amount lands in the organization's rial account («آزاد» rises); a package waiting in the
 *                            queue for this receipt (`awaiting_payment`) goes out to its employees right away — until
 *                            then nothing of it was delivered or blocked. When the fund stock cannot cover it yet, it
 *                            waits in «صف تأمین» (`awaiting_stock`, `stockQueued` in the response) and is sent by `eta`
 *   رد فیش                  a required reason, shown to the organization (it uploads a new receipt)
 * A receipt that is no longer pending (approved / rejected) opens read-only with its review state.
 * Used by the cash page (table, inspectors), the organization page and the command center's action queue.
 */
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { CashEntry } from '@/api/op-treasury-extra';
import { useConfirmDeposit, useRejectDeposit } from '@/api/op-treasury-extra';
import { ApiRequestError } from '@/api/client';
import { Ava, Dialog, Field, KV, Note, Pill, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptView } from '@/components/ui/Receipt';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { faDigits, jDateTime, money } from '@/lib/format';

/** What a deposit is for: the package title («بسته‌ی رفاهی آبان») or «شارژ حساب». */
export function depositPurpose(e: Pick<CashEntry, 'title' | 'packageId'>): string {
  const m = /«(.+)»/.exec(e.title);
  if (m) return m[1];
  if (!e.title || /شارژ حساب/.test(e.title)) return 'شارژ حساب';
  return e.title;
}

/** When the organization sent the receipt (pending / rejected) or when it was approved. */
export function receiptTime(e: CashEntry): { label: string; at: string } {
  if (e.status === 'done') return { label: 'زمان تأیید', at: e.receivedAt ?? e.at };
  return { label: 'زمان ارسال', at: e.at };
}

export function ReviewDepositDialog({ entry: e, orgLetter, onClose, onDone }: {
  entry: CashEntry;
  orgLetter?: string;
  onClose: () => void;
  /** After an approval or a rejection, with the updated entry. */
  onDone?: (e: CashEntry) => void;
}) {
  const toast = useToast();
  const approve = useConfirmDeposit();
  const reject = useRejectDeposit();
  const [mode, setMode] = useState<'review' | 'reject'>('review');
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [err, setErr] = useState('');
  const pending = e.status === 'expected';
  const st = cashStatus(e);
  const org = e.orgName ?? 'سازمان';
  const busy = approve.isPending || reject.isPending;
  const when = receiptTime(e);

  const fail = (x: unknown) => {
    if (x instanceof ApiRequestError && x.code === 'missing_reason') { setReasonErr(x.message); return; }
    setErr(errMsg(x));
  };
  const doApprove = () => {
    setErr('');
    approve.mutate({ id: e.id }, {
      onSuccess: (r) => {
        const pkg = r.deliveredPackage;
        const waits = r.stockQueued;
        // paid, but the fund stock is short: the package waits in the queue and is sent automatically once Namadno buys
        toast(waits
          ? `فیش ${r.orgName ?? org} تأیید شد · «${waits.title}» در صف تأمین موجودی است و تا ${jDateTime(waits.eta)} ارسال می‌شود`
          : `فیش ${r.orgName ?? org} تأیید شد · ${amt(r.amount)} تومان به حساب ریالی سازمان اضافه شد${pkg ? ` · «${pkg.title}» برای ${faDigits(pkg.recipients)} همکار ارسال شد` : ''}`);
        onDone?.(r);
        onClose();
      },
      onError: fail,
    });
  };
  const doReject = () => {
    setErr('');
    const why = reason.trim();
    if (why.length < 5) { setReasonErr('دلیل رد را بنویسید؛ برای سازمان نمایش داده می‌شود.'); return; }
    reject.mutate({ id: e.id, reason: why }, {
      onSuccess: (r) => { toast(`فیش ${r.orgName ?? org} رد شد`); onDone?.(r); onClose(); },
      onError: fail,
    });
  };

  const pkg = e.forPackage;
  const rows: [ReactNode, ReactNode][] = [
    ['سازمان', org],
    ['بابت', pkg ? <span key="p">{pkg.title} <span className="mute">· بسته برای <span className="num">{faDigits(pkg.recipients)}</span> همکار</span></span> : depositPurpose(e)],
    ['مبلغ', <span key="a" className="num" style={{ fontWeight: 600 }}>{money(e.amount)} تومان</span>],
    ['توضیحات سازمان', e.note ? <span key="n" style={{ whiteSpace: 'pre-line' }}>{e.note}</span> : <span key="n" className="mute">ندارد</span>],
    ['ارسال‌کننده', e.submittedBy ?? '—'],
    [when.label, <span key="t" className="num">{jDateTime(when.at)}</span>],
  ];
  if (e.status === 'done' && e.by) rows.push(['تأییدکننده', e.by]);
  if (e.status === 'rejected') {
    if (e.rejectedAt) rows.push(['زمان رد', <span key="r" className="num">{jDateTime(e.rejectedAt)}</span>]);
    if (e.by) rows.push(['ردکننده', e.by]);
  }
  if (e.ref) rows.push(['مرجع بانکی', <span key="f" className="ltr num">{e.ref}</span>]);

  const footer = !pending ? (
    <button type="button" className="nm-btn ghost" onClick={onClose}>بستن</button>
  ) : mode === 'reject' ? (
    <>
      <button type="button" className="nm-btn ghost" onClick={() => { setMode('review'); setReasonErr(''); setErr(''); }} disabled={busy}>بازگشت</button>
      <button type="button" className="nm-btn danger" onClick={doReject} disabled={busy}>{reject.isPending ? 'در حال ثبت…' : 'ثبت رد'}</button>
    </>
  ) : (
    <>
      <button type="button" className="nm-btn line danger" onClick={() => { setMode('reject'); setErr(''); }} disabled={busy}>رد فیش</button>
      <button type="button" className="nm-btn" onClick={doApprove} disabled={busy}>
        <Icon d={TI.check} size={16} strokeWidth={2.2} />{approve.isPending ? 'در حال ثبت…' : 'تأیید و افزودن به حساب'}
      </button>
    </>
  );

  return (
    <Dialog
      open onClose={onClose} width={720} title={pending ? 'بررسی فیش واریز' : 'فیش واریز'}
      sub={<>{org} · <span className="num">{amt(e.amount)}</span> تومان</>}
      icon={e.orgId ? <Ava letter={orgLetter ?? org[0]} id={e.orgId} sq size="lg" /> : <Tile d={TI.deposit} tone="warning" size="lg" />}
      footer={footer}
    >
      <div className="nm-grid c2" style={{ gap: 18 }}>
        <ReceiptView receipt={e.receipt} maxHeight={440} />
        <div className="nm-stack" style={{ gap: 14 }}>
          <span><Pill tone={st.tone} dot>{st.label}</Pill></span>
          <KV rows={rows} />
          {pending && pkg?.status === 'queued' && mode === 'review' && (
            <Note tone="info" icon={TI.team}>
              «{pkg.title}» در صف است و هنوز به همکاران نرسیده. مبلغ کل <span className="num">{amt(pkg.total)}</span>
              {pkg.fromFree > 0 ? <> · از آزاد سازمان <span className="num">{amt(pkg.fromFree)}</span></> : null}
              {' '}· با این فیش <span className="num">{amt(e.amount)}</span> تومان. با تأیید، بسته برای {faDigits(pkg.recipients)} همکار ارسال می‌شود.
            </Note>
          )}
          {pending && e.packageId && pkg?.status !== 'queued' && mode === 'review' && (
            <Note tone="mute">بسته‌ی این فیش دیگر در صف نیست؛ با تأیید، فقط مبلغ به حساب آزاد سازمان اضافه می‌شود.</Note>
          )}
          {pending && !e.packageId && mode === 'review' && (
            <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              با تأیید، مبلغ به حساب آزاد {org} اضافه می‌شود. پیش از تأیید، مبلغ و نام واریزکننده را با صورت‌حساب بانک تطبیق دهید.
            </span>
          )}
          {e.status === 'done' && (
            <Note tone="ok">این فیش تأیید شده و مبلغ آن به حساب ریالی {org} اضافه شده است{pkg?.status === 'sent' ? `؛ «${pkg.title}» برای همکاران ارسال شد` : ''}.</Note>
          )}
          {e.status === 'rejected' && (
            <Note tone="err">
              این فیش رد شده است{e.rejectReason ? <>: {e.rejectReason}</> : '.'} {pkg?.status === 'queued' ? 'بسته در صف می‌ماند تا سازمان فیش تازه بارگذاری کند.' : 'سازمان می‌تواند فیش تازه بارگذاری کند.'}
            </Note>
          )}
          {e.status === 'cancelled' && <Note tone="mute">این فیش با فیش تازه‌ی سازمان جایگزین شده است.</Note>}
          {pending && mode === 'reject' && (
            <Field label="دلیل رد" htmlFor={`rcp-reason-${e.id}`} help="برای سازمان نمایش داده می‌شود تا فیش درست را بارگذاری کند." error={reasonErr || undefined}>
              <textarea
                id={`rcp-reason-${e.id}`} className={'nm-ta' + (reasonErr ? ' err' : '')} rows={3} value={reason} autoFocus maxLength={280}
                aria-invalid={!!reasonErr} placeholder="مثلاً: مبلغ فیش با مبلغ بسته یکی نیست"
                onChange={(x) => { setReason(x.target.value); setReasonErr(''); }}
              />
            </Field>
          )}
          {err && <Note tone="err">{err}</Note>}
        </div>
      </div>
    </Dialog>
  );
}
