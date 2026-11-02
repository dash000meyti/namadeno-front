'use client';
/**
 * «فیش واریز» picker of the organization panel: the kit FileDrop (image or PDF, ≤ 5MB) → a local preview (an object URL,
 * revoked on change / unmount; image = the picture, PDF = name + size) with «تغییر فایل» and «حذف».
 * The optional description is a separate field of the form. Used by AnnounceDepositDialog and the review step of the send wizard.
 * The server checks the same rules (422 bad_receipt) — src/mocks/receipts.ts.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReceiptFile } from '@/api/op-treasury-extra';
import { Field, FileDrop } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ReceiptView } from '@/components/ui/Receipt';
import { faDigits } from '@/lib/format';

export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const TYPES = RECEIPT_ACCEPT.split(',');
const MAX_BYTES = 5 * 1024 * 1024;

/** Problem of a chosen file, or null. */
export function receiptProblem(f: File): string | null {
  if (!TYPES.includes(f.type)) return 'فیش باید تصویر (JPG، PNG یا WEBP) یا PDF باشد';
  if (f.size > MAX_BYTES) return `حجم فیش حداکثر ${faDigits(5)} مگابایت است`;
  return null;
}

export function ReceiptUpload({ value, onChange, error, label = 'فیش واریز', disabled }: {
  value: File | null;
  onChange: (file: File | null) => void;
  /** Error from the form or the server (e.g. «فیش واریز را بارگذاری کنید»). A local type / size problem wins. */
  error?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [url, setUrl] = useState<string | undefined>();
  const input = useRef<HTMLInputElement | null>(null);

  // local preview: one object URL per chosen file, revoked when the file changes or the picker unmounts
  useEffect(() => {
    if (!value) { setUrl(undefined); return; }
    const u = URL.createObjectURL(value);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [value]);

  const pick = (f: File) => {
    const p = receiptProblem(f);
    setProblem(p);
    if (!p) onChange(f);
  };
  const shown = problem ?? error;
  const local: ReceiptFile | undefined = value ? { id: 'local', name: value.name || 'receipt', type: value.type, size: value.size, url } : undefined;

  return (
    <Field label={label} error={shown}>
      {!local ? (
        <FileDrop
          onFile={pick}
          accept={RECEIPT_ACCEPT}
          title="تصویر یا فایل PDF فیش را اینجا رها کنید"
          hint={`JPG، PNG، WEBP یا PDF · حداکثر ${faDigits(5)} مگابایت`}
          pickLabel="انتخاب فیش"
        />
      ) : (
        <div role="group" aria-label={`${label}: ${local.name}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ReceiptView receipt={local} maxHeight={220} />
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={input} type="file" accept={RECEIPT_ACCEPT} hidden aria-label="انتخاب فیش دیگر"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }}
            />
            <button type="button" className="nm-btn sm ghost" disabled={disabled} onClick={() => input.current?.click()}>
              <Icon name="edit" size={15} />تغییر فایل
            </button>
            <button type="button" className="nm-btn sm ghost danger" disabled={disabled} onClick={() => { setProblem(null); onChange(null); }}>
              حذف
            </button>
          </span>
        </div>
      )}
    </Field>
  );
}
