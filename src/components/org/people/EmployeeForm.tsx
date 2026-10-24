'use client';
/**
 * The «اطلاعات کارمند» form, shared by «افزودن کارمند» (employees/new) and the package wizard
 * (adding a person whose national id is in the amounts file but not in the employee list).
 * Same fields, the same rules and the same API input (`NewEmployeeInput` → POST /org/employees) everywhere.
 * Only the national id and the unit are required; the unit starts as «سایر» (DEFAULT_UNIT) and can never be empty.
 * An empty name is filled by the backend from the civil registry.
 */
import { useState } from 'react';
import type { Employee } from '@/types/domain';
import type { NewEmployeeInput } from '@/api/org-people-extra';
import { ApiRequestError } from '@/api/client';
import { Field } from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { DateInput } from '@/components/ui/DateInput';
import { enDigits, faDigits, jDate } from '@/lib/format';
import { now } from '@/lib/clock';
import { DEFAULT_UNIT } from '@/lib/org';
import { I, errMsg, jalaliToIsoAny } from './shared';

export const EMP_ROLES = ['کارمند', 'سرپرست', 'مدیر واحد'];
export const CARD_OPTS = [
  { value: 25, label: 'پیش‌فرض قرارداد · ۲۵٪ دارایی' },
  { value: 15, label: '۱۵٪ دارایی' },
  { value: 10, label: '۱۰٪ دارایی' },
  { value: 0, label: 'بدون اعتبار کارت' },
];

export const digits = (s: string) => enDigits(s).replace(/[\s-]/g, '');
export const fmtMobile = (m: string) => (m.length === 11 ? faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`) : faDigits(m));
/** «۱۴۰۵/۰۸/۰۱» → ISO date, or null. */
export function parseJalaliDate(s: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(digits(s));
  if (!m) return null;
  return jalaliToIsoAny(+m[1], +m[2], +m[3]);
}

export interface EmpForm { fullName: string; employeeCode: string; nationalId: string; mobile: string; department: string; joinedAt: string; role: string; email: string; cardPct: number }
export type EmpErrors = Partial<Record<keyof EmpForm, string>>;

export const newEmpForm = (p: Partial<EmpForm> = {}): EmpForm => ({
  fullName: '', employeeCode: '', nationalId: '', mobile: '', joinedAt: jDate(now()), role: 'کارمند', email: '', cardPct: 25, ...p,
  department: p.department?.trim() || DEFAULT_UNIT,
});

export function validateEmp(form: EmpForm, existing: Employee[]): EmpErrors {
  const e: EmpErrors = {};
  const name = form.fullName.trim();
  const code = digits(form.employeeCode);
  const nid = digits(form.nationalId);
  const mob = digits(form.mobile);
  // required: national id + unit. Everything else is checked only when filled in.
  if (name && (name.length < 3 || /\d/.test(enDigits(name)))) e.fullName = 'نام معتبر نیست';
  if (code && !/^\d{3,8}$/.test(code)) e.employeeCode = 'کد پرسنلی باید عددی باشد';
  else if (existing.some((x) => x.employeeCode === code)) e.employeeCode = 'این کد پرسنلی قبلاً ثبت شده است';
  if (!nid) e.nationalId = 'کد ملی را وارد کنید';
  else if (!/^\d{10}$/.test(nid)) e.nationalId = 'کد ملی باید ۱۰ رقم باشد';
  else if (existing.some((x) => x.nationalId === nid)) e.nationalId = 'کارمندی با این کد ملی وجود دارد';
  if (mob && !/^09\d{9}$/.test(mob)) e.mobile = 'شماره موبایل معتبر نیست';
  if (!form.department.trim()) e.department = 'واحد را انتخاب کنید';
  if (form.joinedAt.trim()) {
    const iso = parseJalaliDate(form.joinedAt);
    if (!iso) e.joinedAt = 'تاریخ را به شکل ۱۴۰۵/۰۸/۰۱ وارد کنید';
    else if (new Date(iso).getTime() - now().getTime() > 90 * 86400000) e.joinedAt = 'تاریخ شروع حداکثر ۹۰ روز آینده است';
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'ایمیل معتبر نیست';
  return e;
}

export function toEmployeeInput(form: EmpForm, sendSms: boolean): NewEmployeeInput {
  return {
    fullName: form.fullName.trim() || undefined, employeeCode: digits(form.employeeCode) || undefined, nationalId: digits(form.nationalId), mobile: digits(form.mobile) || undefined,
    department: form.department.trim() || DEFAULT_UNIT, jobTitle: form.role === 'کارمند' ? '' : form.role, joinedAt: parseJalaliDate(form.joinedAt) ?? undefined,
    email: form.email.trim() || undefined, role: form.role, cardLimitPct: form.cardPct, sendSms,
  };
}

const SERVER_FIELD: Record<string, keyof EmpForm> = { duplicate: 'nationalId', bad_national_id: 'nationalId', duplicate_code: 'employeeCode', bad_mobile: 'mobile' };

/** Form state: values, errors (shown after blur or a submit attempt) and server errors mapped onto fields. */
export function useEmpForm(initial: EmpForm, existing: Employee[]) {
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [blurred, setBlurred] = useState<Partial<Record<keyof EmpForm, boolean>>>({});
  const [serverErr, setServerErr] = useState<EmpErrors>({});
  const errors: EmpErrors = { ...validateEmp(form, existing), ...serverErr };
  const errOf = (k: keyof EmpForm) => (submitted || blurred[k] ? errors[k] : undefined);
  const set = <K extends keyof EmpForm>(k: K, v: EmpForm[K]) => { setForm((f) => ({ ...f, [k]: v })); setServerErr((s) => ({ ...s, [k]: undefined })); };
  const blur = (k: keyof EmpForm) => () => setBlurred((b) => ({ ...b, [k]: true }));
  /** Shows every error; true when the form can be submitted. */
  const check = () => { setSubmitted(true); return !Object.values(errors).some(Boolean); };
  /** Puts an API error (duplicate national id / code, bad mobile) under its field. */
  const serverError = (err: unknown) => {
    const k = SERVER_FIELD[err instanceof ApiRequestError ? err.code : ''];
    if (k) setServerErr({ [k]: errMsg(err) });
  };
  return { form, set, errors, errOf, blur, check, submitted, serverError };
}
export type EmpFormState = ReturnType<typeof useEmpForm>;

/** The fields grid. `lockNationalId` shows the national id read-only (it comes from a file). */
export function EmployeeFields({ f, departments, onSubmit, idPrefix = 'ne', className = 'nm-grid c3', lockNationalId }: {
  f: EmpFormState; departments: string[]; onSubmit: () => void; idPrefix?: string; className?: string; lockNationalId?: boolean;
}) {
  const { form, set, errOf, blur } = f;
  const id = (s: string) => `${idPrefix}-${s}`;
  const ctl = (k: keyof EmpForm) => 'nm-ctl' + (errOf(k) ? ' err' : '');
  const ltr = { textAlign: 'right' } as const;
  // the unit list always offers the default unit «سایر» (last)
  const units = [...departments.filter((d) => d !== DEFAULT_UNIT), DEFAULT_UNIT];
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={className}>
      <Field label="نام و نام خانوادگی" htmlFor={id('name')} error={errOf('fullName')} help="اگر خالی بماند، از ثبت احوال گرفته می‌شود">
        <span className={ctl('fullName')}><input id={id('name')} type="text" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} placeholder="مینا راد" aria-label="نام و نام خانوادگی" aria-invalid={!!errOf('fullName')} /></span>
      </Field>
      <Field label="کد پرسنلی" htmlFor={id('code')} error={errOf('employeeCode')}>
        <span className={ctl('employeeCode')}><input id={id('code')} type="text" inputMode="numeric" value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} onBlur={blur('employeeCode')} placeholder="۱۰۸۸" aria-label="کد پرسنلی" aria-invalid={!!errOf('employeeCode')} className="num" /></span>
      </Field>
      <Field label="کد ملی *" htmlFor={id('nid')} error={errOf('nationalId')}>
        <span className={ctl('nationalId')} style={lockNationalId ? { background: 'var(--bg-neutral)' } : undefined}>
          <input id={id('nid')} type="text" inputMode="numeric" maxLength={12} value={lockNationalId ? faDigits(form.nationalId) : form.nationalId} readOnly={lockNationalId} onChange={(e) => set('nationalId', e.target.value)} onBlur={blur('nationalId')} placeholder="۰۰۱۲۳۴۵۶۷۸" aria-label="کد ملی" aria-invalid={!!errOf('nationalId')} dir="ltr" style={ltr} className="num" />
        </span>
      </Field>
      <Field label="موبایل" htmlFor={id('mobile')} error={errOf('mobile')}>
        <span className={ctl('mobile')}><input id={id('mobile')} type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} onBlur={blur('mobile')} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" aria-label="موبایل" aria-invalid={!!errOf('mobile')} dir="ltr" style={ltr} className="num" /></span>
      </Field>
      <Field label="واحد *" htmlFor={id('dept')} error={errOf('department')}>
        <span className={ctl('department')}>
          <select id={id('dept')} value={form.department} onChange={(e) => set('department', e.target.value)} aria-label="واحد" aria-invalid={!!errOf('department')}>
            {units.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Icon d={I.chevD} size={18} />
        </span>
      </Field>
      <Field label="تاریخ شروع همکاری" htmlFor={id('date')} error={errOf('joinedAt')}>
        <DateInput
          variant="ctl" id={id('date')} label="تاریخ شروع همکاری" value={form.joinedAt} onChange={(v) => set('joinedAt', v)} onBlur={blur('joinedAt')}
          invalid={!!errOf('joinedAt')} max={new Date(now().getTime() + 90 * 86400000)} clearable placeholder="۱۴۰۵/۰۸/۰۱"
        />
      </Field>
      <Field label="نقش" htmlFor={id('role')}>
        <span className="nm-ctl">
          <select id={id('role')} value={form.role} onChange={(e) => set('role', e.target.value)} aria-label="نقش">
            {EMP_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Icon d={I.chevD} size={18} />
        </span>
      </Field>
      <Field label="ایمیل سازمانی" htmlFor={id('email')} error={errOf('email')}>
        <span className={ctl('email')}><input id={id('email')} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} placeholder="m.rad@arman.co" aria-label="ایمیل سازمانی" aria-invalid={!!errOf('email')} dir="ltr" style={ltr} /></span>
      </Field>
      <Field label="سقف اعتبار کارت" htmlFor={id('card')} help="پس از فعال‌سازی و طبق قرارداد سازمان">
        <span className="nm-ctl">
          <select id={id('card')} value={form.cardPct} onChange={(e) => set('cardPct', Number(e.target.value))} aria-label="سقف اعتبار کارت">
            {CARD_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Icon d={I.chevD} size={18} />
        </span>
      </Field>
      <button type="submit" hidden aria-hidden="true" />
    </form>
  );
}
