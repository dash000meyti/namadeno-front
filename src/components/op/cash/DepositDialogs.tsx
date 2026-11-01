'use client';
/**
 * «ثبت واریز» — the operator records an organization deposit seen on the bank statement without a receipt from the
 * organization (organization, amount, reference, note). Receipts the organizations upload («فیش واریز») are reviewed
 * in ReviewDepositDialog instead.
 * A recorded deposit goes to the organization's rial account (its «آزاد»)
 * (into «ریال رزرو»), the rest stays in the organization's free balance.
 */
import { useState } from 'react';
import { useRecordDeposit, type CashEntry } from '@/api/op-treasury-extra';
import { Dialog, Field, Note, NumInput, NumberInput, Select, Tile } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { TI, amt } from '@/components/op/treasury/ui';
import { faDigits, money } from '@/lib/format';

const REF_RE = /^[A-Za-z0-9۰-۹\-/ ]{4,32}$/;

export function RecordDepositDialog({ orgs, expected, orgId, onClose, onDone }: {
  orgs: { id: string; name: string }[];
  /** Receipts waiting for review, to point at «بررسی فیش» when the money matches one of them. */
  expected: CashEntry[];
  orgId?: string;
  onClose: () => void;
  onDone?: (e: CashEntry) => void;
}) {
  const toast = useToast();
  const record = useRecordDeposit();
  const [org, setOrg] = useState(orgId ?? '');
  const [amount, setAmount] = useState<number>(NaN);
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<{ key: 'org' | 'amount' | 'ref' | null; msg: string } | null>(null);
  const pending = expected.filter((e) => e.orgId === org);

  const submit = () => {
    if (!org) { setErr({ key: 'org', msg: 'سازمان را انتخاب کنید.' }); return; }
    if (!Number.isFinite(amount) || amount < 1_000_000) { setErr({ key: 'amount', msg: 'مبلغ واریز حداقل ۱ میلیون تومان است.' }); return; }
    if (!REF_RE.test(ref.trim())) { setErr({ key: 'ref', msg: 'شماره‌ی مرجع بانکی را وارد کنید (۴ تا ۳۲ نویسه).' }); return; }
    record.mutate({ orgId: org, amount: Math.round(amount), ref: ref.trim(), note: note.trim() || undefined }, {
      onSuccess: (e) => { toast(`واریز ${money(e.amount)} تومان ${e.orgName ?? ''} ثبت شد`.replace(/ +/g, ' ').trim()); onDone?.(e); onClose(); },
      onError: (e) => setErr({ key: null, msg: errMsg(e) }),
    });
  };

  return (
    <Dialog
      open onClose={onClose} width={520} title="ثبت واریز" sub="واریز سازمان به حساب ریالی آن نزد نمادنو"
      icon={<Tile d={TI.deposit} tone="success" size="lg" />}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={submit} disabled={record.isPending}>{record.isPending ? 'در حال ثبت…' : 'ثبت واریز'}</button>
        </>
      )}
    >
      <Field label="سازمان" error={err?.key === 'org' ? err.msg : undefined}>
        <Select label="سازمان" value={org} onChange={(v) => { setOrg(v); setErr(null); }}
          options={[{ key: '', label: 'انتخاب سازمان' }, ...orgs.map((o) => ({ key: o.id, label: o.name }))]} />
      </Field>
      {pending.length > 0 && (
        <Note tone="info">
          این سازمان {faDigits(pending.length)} فیش در انتظار تأیید به مبلغ {amt(pending.reduce((a, e) => a + e.amount, 0))} تومان دارد.
          اگر این واریز بابت یکی از آن‌هاست، همان فیش را بررسی و تأیید کنید تا دو بار ثبت نشود.
        </Note>
      )}
      <div className="nm-grid c2" style={{ gap: 12 }}>
        <Field label="مبلغ" htmlFor="dep-amount" error={err?.key === 'amount' ? err.msg : undefined}>
          <NumberInput id="dep-amount" label="مبلغ واریز" value={amount} onChange={(n) => { setAmount(n); setErr(null); }} suffix="تومان" full invalid={err?.key === 'amount'} />
        </Field>
        <Field label="شماره‌ی مرجع بانکی" htmlFor="dep-ref" error={err?.key === 'ref' ? err.msg : undefined}>
          <NumInput id="dep-ref" label="شماره‌ی مرجع بانکی" value={ref} onChange={(v) => { setRef(v); setErr(null); }} text ltr full placeholder="مثلاً 140508151234" invalid={err?.key === 'ref'} />
        </Field>
      </div>
      <Field label="شرح" htmlFor="dep-note" help="اختیاری · در گردش حساب نمایش داده می‌شود">
        <NumInput id="dep-note" label="شرح واریز" value={note} onChange={setNote} text full placeholder="مثلاً: پیش‌پرداخت بسته‌های یلدا" />
      </Field>
      <span className="mute" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        مبلغ به حساب آزاد سازمان اضافه می‌شود. بسته‌های در صف فقط با تأیید فیش خودشان ارسال می‌شوند.
      </span>
      {err?.key === null && <Note tone="err">{err.msg}</Note>}
    </Dialog>
  );
}
