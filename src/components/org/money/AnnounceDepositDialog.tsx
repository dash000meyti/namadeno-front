'use client';
/**
 * «اعلام واریز» — the organization uploads the receipt («فیش واریز») of a bank transfer to Namadno's account.
 * Shows Namadno's bank account (bank, IBAN with copy, holder) and asks for the amount, the receipt (image or PDF, required)
 * and an optional description (e.g. the tracking number). The receipt stays «در انتظار تأیید» until Namadno reviews it:
 * approved → added to «آزاد» of the organization's rial account; rejected → a reason, and a new receipt can be uploaded.
 * `packageId` = a new receipt for a package waiting for payment («در انتظار تأیید واریز»); it is delivered after approval.
 * API: POST /org/account/deposits (useAnnounceDeposit, multipart) — 422 bad_amount (min 1,000,000) | missing_receipt | bad_receipt | bad_package.
 * Also exports NamadnoBank (the bank account block, reused by the review step of the send wizard).
 */
import { useState } from 'react';
import { ApiRequestError } from '@/api/client';
import { useAnnounceDeposit, useOrgAccount } from '@/api/org-money-extra';
import { Dialog, Field, KV, Note, NumInput, NumberInput, Section, Skel, Tile } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { faDigits, money } from '@/lib/format';
import { OM } from './meta';
import { ReceiptUpload } from './ReceiptUpload';

/** Smallest deposit Namadno accepts (Toman). */
export const MIN_DEPOSIT = 1_000_000;

/** «IR12 0120 …» in groups of four, Persian digits (shown LTR). */
export const ibanText = (iban: string) => {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  const cc = s.slice(0, 2);
  const groups = (s.slice(2).match(/.{1,4}/g) ?? []).join(' ');
  return `${cc}${faDigits(groups)}`;
};

/** Namadno's bank account for deposits (bank, IBAN with copy, holder) — from GET /org/account. */
export function NamadnoBank({ title = 'حساب نمادنو برای واریز' }: { title?: string }) {
  const acct = useOrgAccount();
  const toast = useToast();
  const bank = acct.data?.bank;
  const copy = async () => {
    if (!bank) return;
    try {
      await navigator.clipboard.writeText(bank.iban);
      toast('شماره‌ی شبا کپی شد');
    } catch {
      toast('کپی انجام نشد', 'error');
    }
  };
  return (
    <Section title={title}>
      {bank ? (
        <KV rows={[
          ['بانک', bank.name],
          ['شماره‌ی شبا', (
            <span key="iban" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="num ltr">{ibanText(bank.iban)}</span>
              <button type="button" className="nm-ib" aria-label="کپی شماره‌ی شبا" title="کپی شماره‌ی شبا" onClick={copy}><Icon name="copy" size={16} /></button>
            </span>
          )],
          ['صاحب حساب', bank.holder],
        ]} />
      ) : acct.isError ? (
        <Note tone="err">مشخصات حساب نمادنو دریافت نشد. <button type="button" className="nm-btn sm text" onClick={() => acct.refetch()}>تلاش دوباره</button></Note>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-hidden="true"><Skel w="60%" /><Skel w="80%" /><Skel w="50%" /></span>
      )}
    </Section>
  );
}

export function AnnounceDepositDialog({ open, onClose, amount, minAmount, packageId, packageTitle }: {
  open: boolean;
  onClose: () => void;
  /** Pre-filled amount (Toman), e.g. the amount of the rejected receipt. */
  amount?: number;
  /** A queued package's receipt must cover what «آزاد» did not (its `funding.toDeposit`). */
  minAmount?: number;
  /** A new receipt for this package (waiting in the queue). */
  packageId?: string;
  packageTitle?: string;
}) {
  if (!open) return null;
  return <DepositForm onClose={onClose} initial={amount} min={minAmount} packageId={packageId} packageTitle={packageTitle} />;
}

function DepositForm({ onClose, initial, min: minPkg, packageId, packageTitle }: { onClose: () => void; initial?: number; min?: number; packageId?: string; packageTitle?: string }) {
  const announce = useAnnounceDeposit();
  const toast = useToast();
  const min = Math.max(MIN_DEPOSIT, Math.ceil(minPkg ?? 0));
  const start = Math.max(initial ?? 0, minPkg ?? 0);
  const [amount, setAmount] = useState<number>(start > 0 ? Math.ceil(start) : NaN);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<{ amount?: string; receipt?: string; form?: string }>({});
  const busy = announce.isPending;
  const forPkg = !!packageId;

  const submit = () => {
    const e: typeof errs = {};
    if (!(amount >= min)) e.amount = min > MIN_DEPOSIT ? `مبلغ فیش این بسته دست‌کم ${money(min)} تومان است.` : `مبلغ واریز حداقل ${faDigits(1)} میلیون تومان است.`;
    if (!receipt) e.receipt = 'تصویر یا فایل PDF فیش واریز را بارگذاری کنید.';
    setErrs(e);
    if (e.amount || e.receipt || !receipt) return;
    announce.mutate({ amount, receipt, note: note.trim() || undefined, packageId }, {
      onSuccess: () => {
        toast(forPkg ? 'فیش واریز ثبت شد؛ بسته پس از تأیید نمادنو ارسال می‌شود' : 'فیش واریز ثبت شد؛ پس از تأیید نمادنو به «آزاد» اضافه می‌شود');
        onClose();
      },
      onError: (err) => {
        const code = err instanceof ApiRequestError ? err.code : '';
        const msg = err instanceof Error ? err.message : 'خطا در ارتباط با سرور';
        if (code === 'bad_amount') setErrs({ amount: msg });
        else if (code === 'missing_receipt' || code === 'bad_receipt') setErrs({ receipt: msg });
        else if (code === 'bad_package') setErrs({ form: msg });
        else toast(msg, 'error');
      },
    });
  };

  return (
    <Dialog
      open onClose={onClose} width={500}
      title={forPkg ? 'بارگذاری فیش تازه' : 'اعلام واریز'}
      sub={forPkg
        ? <>برای بسته‌ی «{packageTitle ?? 'در انتظار واریز'}»: مبلغ را به حساب نمادنو واریز کنید و فیش آن را بارگذاری کنید.</>
        : 'مبلغ را به حساب نمادنو واریز کنید و فیش آن را اینجا بارگذاری کنید.'}
      icon={<Tile d={OM.bank} tone="primary" size="lg" />}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={submit} disabled={busy}>{busy ? 'در حال بارگذاری…' : 'ثبت فیش واریز'}</button>
        </>
      )}
    >
      <NamadnoBank />
      <Field label="مبلغ واریز" htmlFor="dep-amount" error={errs.amount} help={min > MIN_DEPOSIT ? `دست‌کم ${money(min)} تومان؛ باقی بسته از «آزاد» کنار گذاشته شده است` : `حداقل ${faDigits(1)} میلیون تومان${Number.isFinite(amount) && amount > 0 ? ` · ${money(amount)} تومان` : ''}`}>
        <NumberInput id="dep-amount" label="مبلغ واریز" value={amount} onChange={(v) => { setAmount(Number.isFinite(v) ? Math.max(0, Math.min(1e13, v)) : NaN); setErrs((x) => ({ ...x, amount: undefined })); }} suffix="تومان" full invalid={!!errs.amount} />
      </Field>
      <ReceiptUpload value={receipt} onChange={(f) => { setReceipt(f); setErrs((x) => ({ ...x, receipt: undefined })); }} error={errs.receipt} disabled={busy} />
      <Field label="توضیحات (اختیاری)" htmlFor="dep-note">
        <NumInput id="dep-note" label="توضیحات واریز" value={note} onChange={(v) => setNote(v.slice(0, 200))} text full placeholder="شماره پیگیری، نوع انتقال…" />
      </Field>
      {errs.form && <Note tone="err">{errs.form}</Note>}
      <Note tone="mute" icon={OM.clock}>
        {forPkg
          ? 'فیش تا بررسی نمادنو «در انتظار تأیید» می‌ماند؛ پس از تأیید، بسته برای همکاران ارسال می‌شود.'
          : 'فیش تا بررسی نمادنو «در انتظار تأیید» می‌ماند؛ پس از تأیید، مبلغ به «آزاد» حساب ریالی سازمان اضافه می‌شود.'}
      </Note>
    </Dialog>
  );
}
