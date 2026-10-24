'use client';
/**
 * Package wizard, amounts file: a national id that is not in the employee list.
 * Either add the person to the employees (same form as «افزودن کارمند», national id from the file, read-only)
 * or drop the row from the list («حذف از لیست»).
 */
import { useState } from 'react';
import type { Employee } from '@/types/domain';
import { useCreateEmployee } from '@/api/org';
import { Dialog, Tile } from '@/components/panel/kit';
import { CheckRow } from '@/components/ui/AuthLayout';
import { useToast } from '@/components/ui/Toast';
import { EmployeeFields, newEmpForm, toEmployeeInput, useEmpForm } from '@/components/org/people/EmployeeForm';
import { I, errMsg } from '@/components/org/people/shared';
import { faDigits, money } from '@/lib/format';

export function NewPersonDialog({ row, position, existing, departments, onAdded, onSkip, onClose }: {
  /** The file row: row number, national id and amount. */
  row: { n: number; nid: string; amount: number };
  /** «۱ از ۲» when several national ids are missing. */
  position?: { index: number; count: number };
  existing: Employee[];
  departments: string[];
  onAdded: (e: Employee) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const create = useCreateEmployee();
  const toast = useToast();
  const [sms, setSms] = useState(true);
  const f = useEmpForm(newEmpForm({ nationalId: row.nid }), existing);

  const save = () => {
    const ok = f.check();
    if (!ok || create.isPending) return;
    create.mutate(toEmployeeInput(f.form, sms), {
      onSuccess: (e) => onAdded(e),
      onError: (err) => { f.serverError(err); toast(errMsg(err), 'error'); },
    });
  };

  return (
    <Dialog
      open onClose={onClose} width={680}
      icon={<Tile d={I.user} tone="warning" size="lg" />}
      title="این کد ملی در فهرست کارکنان شما نیست"
      sub={(
        <>
          ردیف {faDigits(row.n)} فایل · کد ملی <span className="num" dir="ltr">{faDigits(row.nid)}</span>
          {Number.isFinite(row.amount) && <> · مبلغ <span className="num">{money(row.amount)}</span> تومان</>}
          {position && position.count > 1 && <> · {faDigits(position.index)} از {faDigits(position.count)}</>}
        </>
      )}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onSkip} style={{ marginLeft: 'auto' }}>حذف از لیست</button>
          <button type="button" className="nm-btn" onClick={save} disabled={create.isPending}>{create.isPending ? 'در حال ثبت…' : 'افزودن به کارکنان'}</button>
        </>
      )}
    >
      <div className="nm-col" style={{ gap: 14 }}>
        <EmployeeFields f={f} departments={departments} onSubmit={save} idPrefix="np" className="nm-grid c2" lockNationalId />
        <CheckRow checked={sms} onToggle={() => setSms((x) => !x)} label="ارسال کد فعال‌سازی با پیامک" />
      </div>
    </Dialog>
  );
}
