'use client';
/**
 * Organization panel — add employee. Kit form page: mode tabs (single form · Excel/CSV import) → form or import cards
 * next to «what happens next» → sticky action bar. Validation, the sheet reader and the import rules are unchanged.
 */
import Link from 'next/link';
import { Suspense, useMemo, useRef, useState, type DragEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreateEmployee, useOrgEmployees } from '@/api/org';
import { useImportEmployees, type ImportRow, type NewEmployeeInput } from '@/api/org-people-extra';
import { ApiRequestError } from '@/api/client';
import {
  ActionBar, Card, Empty, Field, List, ListRow, Note, PageHeading, Pill, SettingRow, SettingsGroup, Switch, Table, TableFoot, Tabs, Tile,
  usePaging, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { flashToast } from '@/components/org/people/PanelToast';
import { I, downloadCsv, errMsg, jalaliToIsoAny } from '@/components/org/people/shared';
import { readSheet } from '@/components/org/people/sheet';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import { enDigits, faDigits, jDate } from '@/lib/format';
import '../page.css';

const DEPTS = ['فنی', 'فروش', 'مالی', 'عملیات', 'منابع انسانی', 'پشتیبانی'];
const ROLES = ['کارمند', 'سرپرست', 'مدیر واحد'];
const CARD_OPTS = [
  { value: 25, label: 'پیش‌فرض قرارداد · ۲۵٪ دارایی' },
  { value: 15, label: '۱۵٪ دارایی' },
  { value: 10, label: '۱۰٪ دارایی' },
  { value: 0, label: 'بدون اعتبار کارت' },
];
const SAMPLE: string[][] = [
  ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01'],
  ['کامران زارع', '1089', '0023456789', '09131112222', 'فنی', '1405/08/01'],
  ['شیدا کاظمی', '1090', '0012345678', '09123334444', 'فروش', '1405/08/05'],
  ['پویا نیک‌نام', '1091', '0045678901', '091255', 'مالی', '1405/08/05'],
  ['الهام صادقی', '1092', '0056789012', '09356667777', 'منابع انسانی', '1405/08/10'],
];
const PREVIEW_PAGE = 10;

const digits = (s: string) => enDigits(s).replace(/[\s-]/g, '');
const fmtMobile = (m: string) => (m.length === 11 ? faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`) : faDigits(m));
function parseJalali(s: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(digits(s));
  if (!m) return null;
  return jalaliToIsoAny(+m[1], +m[2], +m[3]);
}

interface Form { fullName: string; employeeCode: string; nationalId: string; mobile: string; department: string; joinedAt: string; role: string; email: string; cardPct: number }
type Errors = Partial<Record<keyof Form, string>>;
interface PreviewRow { n: number; name: string; code: string; nid: string; mob: string; unit: string; date: string; error: string }

const PREVIEW_COLS: Column<PreviewRow>[] = [
  { key: 'n', label: '#', width: '36px', render: (p) => <span className="num mute">{faDigits(p.n)}</span> },
  { key: 'name', label: 'نام', width: 'minmax(0, 1.3fr)', render: (p) => <b className="el" style={{ fontWeight: 600 }}>{p.name || '—'}</b> },
  { key: 'code', label: 'کد پرسنلی', width: '84px', render: (p) => <span className="num">{faDigits(p.code)}</span> },
  { key: 'nid', label: 'کد ملی', width: '112px', render: (p) => <span className="num ltr">{faDigits(p.nid)}</span> },
  { key: 'mob', label: 'موبایل', width: '120px', render: (p) => <span className="num ltr">{fmtMobile(p.mob)}</span> },
  { key: 'unit', label: 'واحد', width: '100px', render: (p) => <span className="sm el">{p.unit}</span> },
  { key: 'check', label: 'اعتبارسنجی', width: '128px', render: (p) => <Pill tone={p.error ? 'error' : 'success'}>{p.error || 'معتبر'}</Pill> },
];

function NewEmployee() {
  const sp = useSearchParams();
  const router = useRouter();
  const emps = useOrgEmployees();
  const create = useCreateEmployee();
  const importer = useImportEmployees();
  const show = useToast();
  const [tab, setTab] = useState<'single' | 'excel'>(sp.get('tab') === 'excel' ? 'excel' : 'single');
  const [sms, setSms] = useState(true);
  const [form, setForm] = useState<Form>({ fullName: '', employeeCode: '', nationalId: '', mobile: '', department: '', joinedAt: jDate(now()), role: 'کارمند', email: '', cardPct: 25 });
  const [submitted, setSubmitted] = useState(false);
  const [blurred, setBlurred] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [serverErr, setServerErr] = useState<Errors>({});
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const existing = useMemo(() => emps.data ?? [], [emps.data]);
  const departments = useMemo(() => [...new Set([...DEPTS, ...existing.map((e) => e.department)])], [existing]);

  // ── single form validation
  const errors: Errors = (() => {
    const e: Errors = {};
    const name = form.fullName.trim();
    const code = digits(form.employeeCode);
    const nid = digits(form.nationalId);
    const mob = digits(form.mobile);
    if (!name) e.fullName = 'نام و نام خانوادگی را وارد کنید';
    else if (name.length < 3 || /\d/.test(enDigits(name))) e.fullName = 'نام معتبر نیست';
    if (!code) e.employeeCode = 'کد پرسنلی را وارد کنید';
    else if (!/^\d{3,8}$/.test(code)) e.employeeCode = 'کد پرسنلی باید عددی باشد';
    else if (existing.some((x) => x.employeeCode === code)) e.employeeCode = 'این کد پرسنلی قبلاً ثبت شده است';
    if (!nid) e.nationalId = 'کد ملی را وارد کنید';
    else if (!/^\d{10}$/.test(nid)) e.nationalId = 'کد ملی باید ۱۰ رقم باشد';
    else if (existing.some((x) => x.nationalId === nid)) e.nationalId = 'کارمندی با این کد ملی وجود دارد';
    if (!mob) e.mobile = 'شماره موبایل را وارد کنید';
    else if (!/^09\d{9}$/.test(mob)) e.mobile = 'شماره موبایل معتبر نیست';
    if (!form.department) e.department = 'واحد را انتخاب کنید';
    const iso = parseJalali(form.joinedAt);
    if (!iso) e.joinedAt = 'تاریخ را به شکل ۱۴۰۵/۰۸/۰۱ وارد کنید';
    else if (new Date(iso).getTime() - now().getTime() > 90 * 86400000) e.joinedAt = 'تاریخ شروع حداکثر ۹۰ روز آینده است';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'ایمیل معتبر نیست';
    return { ...e, ...serverErr };
  })();
  const errOf = (k: keyof Form) => (submitted || blurred[k] ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setServerErr((s) => ({ ...s, [k]: undefined })); };

  const submitSingle = () => {
    setSubmitted(true);
    const has = Object.values(errors).some(Boolean);
    if (has || create.isPending) { if (has) show('لطفاً خطاهای فرم را برطرف کنید', 'error'); return; }
    const input: NewEmployeeInput = {
      fullName: form.fullName.trim(), employeeCode: digits(form.employeeCode), nationalId: digits(form.nationalId), mobile: digits(form.mobile),
      department: form.department, jobTitle: form.role === 'کارمند' ? '' : form.role, joinedAt: parseJalali(form.joinedAt) ?? undefined,
      email: form.email.trim() || undefined, role: form.role, cardLimitPct: form.cardPct, sendSms: sms,
    };
    create.mutate(input, {
      onSuccess: (e) => {
        flashToast(`${e.fullName} ثبت شد${sms ? ` · کد فعال‌سازی به ${fmtMobile(e.mobile)} پیامک شد` : ''}`);
        router.push(routes.org.employee(e.id));
      },
      onError: (err) => {
        const code = err instanceof ApiRequestError ? err.code : '';
        const map: Record<string, keyof Form> = { duplicate: 'nationalId', bad_national_id: 'nationalId', duplicate_code: 'employeeCode', bad_mobile: 'mobile' };
        if (map[code]) setServerErr({ [map[code]]: errMsg(err) });
        show(errMsg(err), 'error');
      },
    });
  };

  // ── excel rows validation
  const preview: PreviewRow[] = useMemo(() => {
    if (!file) return [];
    let rows = file.rows;
    if (rows[0] && rows[0].some((c) => /نام|name|کد/i.test(c)) && !/^\d/.test(digits(rows[0][1] ?? ''))) rows = rows.slice(1);
    const seenNid = new Set<string>();
    const seenCode = new Set<string>();
    return rows.map((r, i) => {
      const name = (r[0] ?? '').trim();
      const code = digits(r[1] ?? '');
      let nid = digits(r[2] ?? '');
      if (/^\d{8,9}$/.test(nid)) nid = nid.padStart(10, '0'); // Excel drops leading zeros
      let mob = digits(r[3] ?? '');
      if (/^9\d{9}$/.test(mob)) mob = '0' + mob;
      const unit = (r[4] ?? '').trim();
      const date = (r[5] ?? '').trim();
      let error = '';
      if (!name) error = 'نام خالی';
      else if (!/^\d{3,8}$/.test(code)) error = 'کد پرسنلی نامعتبر';
      else if (existing.some((x) => x.employeeCode === code) || seenCode.has(code)) error = 'کد پرسنلی تکراری';
      else if (!/^\d{10}$/.test(nid)) error = 'کد ملی نامعتبر';
      else if (existing.some((x) => x.nationalId === nid) || seenNid.has(nid)) error = 'کد ملی تکراری';
      else if (!/^09\d{9}$/.test(mob)) error = 'موبایل نامعتبر';
      else if (date && !parseJalali(date)) error = 'تاریخ نامعتبر';
      seenNid.add(nid);
      seenCode.add(code);
      return { n: i + 1, name, code, nid, mob, unit: unit || 'عمومی', date, error };
    });
  }, [file, existing]);
  const valid = preview.filter((p) => !p.error);
  const invalidN = preview.length - valid.length;
  const pp = usePaging(preview, PREVIEW_PAGE, file);

  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    setFileErr('');
    if (f.size > 5 * 1024 * 1024) { setFileErr('حجم فایل بیشتر از ۵ مگابایت است.'); return; }
    setReading(true);
    try {
      const rows = await readSheet(f);
      if (!rows.length) throw new Error('فایل خالی است.');
      if (rows.length > 1001) throw new Error('حداکثر ۱٬۰۰۰ ردیف در هر فایل مجاز است.');
      setFile({ name: f.name, rows });
    } catch (e) {
      setFile(null);
      setFileErr(errMsg(e));
    } finally {
      setReading(false);
    }
  };

  const submitExcel = () => {
    if (!valid.length || importer.isPending) return;
    const rows: ImportRow[] = valid.map((p) => ({ fullName: p.name, employeeCode: p.code, nationalId: p.nid, mobile: p.mob, department: p.unit, joinedAt: p.date ? parseJalali(p.date) ?? undefined : undefined }));
    importer.mutate({ rows, sendSms: sms }, {
      onSuccess: (r) => {
        if (r.created.length) {
          flashToast(`${faDigits(r.created.length)} کارمند ثبت شد${r.errors.length ? ` · ${faDigits(r.errors.length)} ردیف خطا داشت` : ''}${sms ? ' · کدهای فعال‌سازی پیامک شد' : ''}`);
          router.push(routes.org.employees);
        } else show(r.errors[0]?.message ?? 'هیچ ردیفی ثبت نشد', 'error');
      },
      onError: (e) => show(errMsg(e), 'error'),
    });
  };

  const single = tab === 'single';
  const firstName = form.fullName.trim() || 'کارمند';
  const flow = [
    { d: single ? I.user : I.xls, label: single ? 'ثبت اطلاعات' : 'بارگذاری و اعتبارسنجی فایل', sub: single ? 'توسط منابع انسانی · همین صفحه' : file ? `${faDigits(preview.length)} ردیف · ${faDigits(valid.length)} معتبر · ${faDigits(invalidN)} خطا` : 'هنوز فایلی بارگذاری نشده' },
    { d: I.mail, label: 'پیامک کد فعال‌سازی', sub: sms ? 'کد ۶ رقمی · اعتبار ۷۲ ساعت' : 'بعداً از پروفایل کارمند ارسال می‌شود' },
    { d: I.shield, label: 'فعال‌سازی و احراز هویت در اپ', sub: 'کد پرسنلی + کد فعال‌سازی · KYC' },
    { d: I.check, label: 'حساب فعال', sub: 'دریافت بسته‌ها، اعتبار و تسهیلات طبق قرارداد' },
  ];
  const busy = create.isPending || importer.isPending;
  const errCount = Object.values(errors).filter(Boolean).length;
  const mob = digits(form.mobile);

  const ctl = (k: keyof Form) => 'nm-ctl' + (errOf(k) ? ' err' : '');
  const blur = (k: keyof Form) => () => setBlurred((b) => ({ ...b, [k]: true }));
  const ltr = { textAlign: 'right' } as const;

  const smsGroup = (
    <SettingsGroup>
      <SettingRow
        label="ارسال کد فعال‌سازی"
        desc={single
          ? (sms ? `بلافاصله پس از ثبت، کد ۶ رقمی به ${mob ? fmtMobile(mob) : 'موبایل کارمند'} پیامک می‌شود` : 'کد بعداً از پروفایل کارمند ارسال می‌شود')
          : (sms ? 'بلافاصله پس از ثبت، کد ۶ رقمی به موبایل هر کارمند پیامک می‌شود' : 'کدها بعداً از پروفایل هر کارمند ارسال می‌شود')}
      >
        <Switch on={sms} onChange={setSms} label="ارسال کد فعال‌سازی" />
      </SettingRow>
    </SettingsGroup>
  );

  return (
    <>
      <PageHeading title="افزودن کارمند" crumbs={[{ label: 'کارکنان', href: routes.org.employees }]} sub="یک کارمند را ثبت کنید یا فهرست کارکنان را از فایل اکسل وارد کنید" />

      <Tabs label="روش افزودن" size="lg" value={tab} onChange={setTab} items={[{ key: 'single', label: 'افزودن تکی' }, { key: 'excel', label: 'ورود از اکسل' }]} />

      <div className="nm-grid side">
        <div className="nm-stack">
          {single ? (
            <>
              <Card title="اطلاعات کارمند" sub="همه فیلدها به‌جز ایمیل الزامی است" className="emp-form">
                <form noValidate onSubmit={(e) => { e.preventDefault(); submitSingle(); }} className="nm-grid c3">
                  <Field label="نام و نام خانوادگی" htmlFor="ne-name" error={errOf('fullName')}>
                    <span className={ctl('fullName')}><input id="ne-name" type="text" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} placeholder="مینا راد" aria-label="نام و نام خانوادگی" aria-invalid={!!errOf('fullName')} /></span>
                  </Field>
                  <Field label="کد پرسنلی" htmlFor="ne-code" error={errOf('employeeCode')}>
                    <span className={ctl('employeeCode')}><input id="ne-code" type="text" inputMode="numeric" value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} onBlur={blur('employeeCode')} placeholder="۱۰۸۸" aria-label="کد پرسنلی" aria-invalid={!!errOf('employeeCode')} className="num" /></span>
                  </Field>
                  <Field label="کد ملی" htmlFor="ne-nid" error={errOf('nationalId')}>
                    <span className={ctl('nationalId')}><input id="ne-nid" type="text" inputMode="numeric" maxLength={12} value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} onBlur={blur('nationalId')} placeholder="۰۰۱۲۳۴۵۶۷۸" aria-label="کد ملی" aria-invalid={!!errOf('nationalId')} dir="ltr" style={ltr} className="num" /></span>
                  </Field>
                  <Field label="موبایل" htmlFor="ne-mobile" error={errOf('mobile')}>
                    <span className={ctl('mobile')}><input id="ne-mobile" type="tel" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} onBlur={blur('mobile')} placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰" aria-label="موبایل" aria-invalid={!!errOf('mobile')} dir="ltr" style={ltr} className="num" /></span>
                  </Field>
                  <Field label="واحد" htmlFor="ne-dept" error={errOf('department')}>
                    <span className={ctl('department')}>
                      <select id="ne-dept" value={form.department} onChange={(e) => set('department', e.target.value)} aria-label="واحد" aria-invalid={!!errOf('department')}>
                        <option value="">انتخاب واحد</option>
                        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <Icon d={I.chevD} size={18} />
                    </span>
                  </Field>
                  <Field label="تاریخ شروع همکاری" htmlFor="ne-date" error={errOf('joinedAt')}>
                    <span className={ctl('joinedAt')}><input id="ne-date" type="text" value={form.joinedAt} onChange={(e) => set('joinedAt', e.target.value)} onBlur={blur('joinedAt')} aria-label="تاریخ شروع همکاری" aria-invalid={!!errOf('joinedAt')} className="num" /><Icon d={I.calendar} size={18} /></span>
                  </Field>
                  <Field label="نقش" htmlFor="ne-role">
                    <span className="nm-ctl">
                      <select id="ne-role" value={form.role} onChange={(e) => set('role', e.target.value)} aria-label="نقش">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Icon d={I.chevD} size={18} />
                    </span>
                  </Field>
                  <Field label="ایمیل سازمانی (اختیاری)" htmlFor="ne-email" error={errOf('email')}>
                    <span className={ctl('email')}><input id="ne-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} placeholder="m.rad@arman.co" aria-label="ایمیل سازمانی (اختیاری)" aria-invalid={!!errOf('email')} dir="ltr" style={ltr} /></span>
                  </Field>
                  <Field label="سقف اعتبار کارت" htmlFor="ne-card" help="پس از فعال‌سازی و طبق قرارداد سازمان">
                    <span className="nm-ctl">
                      <select id="ne-card" value={form.cardPct} onChange={(e) => set('cardPct', Number(e.target.value))} aria-label="سقف اعتبار کارت">
                        {CARD_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <Icon d={I.chevD} size={18} />
                    </span>
                  </Field>
                  <button type="submit" hidden aria-hidden="true" />
                </form>
              </Card>
              {smsGroup}
            </>
          ) : (
            <>
              <Card title="فایل کارکنان" className="emp-import"
                actions={(
                  <button type="button" className="nm-btn sm text" onClick={() => downloadCsv('namadno-employees.csv', [['نام', 'کد پرسنلی', 'کد ملی', 'موبایل', 'واحد', 'تاریخ شروع'], ['مینا راد', '1088', '0012345679', '09120000000', 'عملیات', '1405/08/01']])}>
                    <Icon d={I.xls} size={15} />دانلود قالب اکسل
                  </button>
                )}>
                <div
                  className={'emp-drop' + (drag ? ' on' : '')}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(false); void loadFile(e.dataTransfer.files[0]); }}
                >
                  <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
                  <Tile d={I.upload} tone="primary" size="xl" />
                  <b>{reading ? 'در حال خواندن فایل…' : 'فایل اکسل را اینجا بکشید یا انتخاب کنید'}</b>
                  <span className="mute">XLSX یا CSV · حداکثر ۵ مگابایت · تا ۱٬۰۰۰ ردیف در هر فایل</span>
                  <span className="act" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="nm-btn sm" aria-label="انتخاب فایل اکسل" disabled={reading} onClick={() => inputRef.current?.click()}><Icon d={I.upload} size={15} />انتخاب فایل</button>
                    <button type="button" className="nm-btn sm ghost" onClick={() => { setFileErr(''); setFile({ name: 'employees-mehr.xlsx', rows: SAMPLE }); }}>استفاده از فایل نمونه</button>
                  </span>
                </div>
              </Card>
              {fileErr && <Note tone="err">{fileErr}</Note>}
              {file && (
                <Card flush title="پیش‌نمایش ردیف‌ها" count={preview.length} sub={file.name}
                  actions={(
                    <>
                      <Pill tone="success">{faDigits(valid.length)} معتبر</Pill>
                      {invalidN > 0 && <Pill tone="error">{faDigits(invalidN)} خطا</Pill>}
                      <button type="button" className="nm-ib" aria-label="حذف فایل" onClick={() => setFile(null)}><Icon d={I.x} size={16} /></button>
                    </>
                  )}>
                  <Table columns={PREVIEW_COLS} rows={pp.rows} rowKey={(p) => String(p.n)} rowLabel={(p) => p.name || `ردیف ${faDigits(p.n)}`} minWidth={720}
                    empty={<Empty icon={I.xls} title="ردیفی برای ثبت در فایل پیدا نشد" sub="ستون‌ها به ترتیب: نام، کد پرسنلی، کد ملی، موبایل، واحد، تاریخ شروع" />} />
                  {preview.length > 0 && <TableFoot shown={pp.rows.length} total={preview.length} unit="ردیف" page={pp.page} pages={pp.pages} onPage={pp.setPage} />}
                </Card>
              )}
              {smsGroup}
            </>
          )}
        </div>

        <Card title={single ? 'پس از ثبت چه می‌شود؟' : 'پس از بارگذاری چه می‌شود؟'}>
          <Note tone="info" icon={I.mail}>
            {single
              ? (sms ? `پس از ثبت، کد فعال‌سازی برای ${firstName} پیامک می‌شود و حساب تا احراز هویت در اپ در وضعیت «در انتظار فعال‌سازی» می‌ماند.` : `حساب ${firstName} در وضعیت «در انتظار فعال‌سازی» ثبت می‌شود؛ کد فعال‌سازی را بعداً از پروفایل کارمند ارسال کنید.`)
              : `ردیف‌های معتبر ثبت می‌شوند${sms ? ' و برای هر نفر کد فعال‌سازی پیامک می‌شود' : ''}؛ ردیف‌های خطادار برای اصلاح علامت می‌خورند.`}
          </Note>
          <List>
            {flow.map((s, i) => (
              <ListRow key={s.label} lead={<Tile d={s.d} tone={i === 0 ? 'primary' : 'neutral'} />} title={s.label} sub={<span className="num" style={{ whiteSpace: 'normal' }}>{s.sub}</span>} />
            ))}
          </List>
          <span className="mute" style={{ fontSize: 12, lineHeight: 1.7 }}>سقف اعتبار کارت و دسترسی به تسهیلات پس از فعال‌سازی و طبق قرارداد سازمان (تا ۲۵٪ دارایی) محاسبه می‌شود.</span>
        </Card>
      </div>

      <ActionBar actions={(
        <>
          <Link href={routes.org.employees} className="nm-btn ghost">انصراف</Link>
          <button type="button" className="nm-btn" disabled={busy || (!single && !valid.length)} onClick={single ? submitSingle : submitExcel}>
            <Icon d={I.check} size={16} strokeWidth={2.2} />{busy ? 'در حال ثبت…' : single ? 'ثبت کارمند' : `ثبت ${faDigits(valid.length)} کارمند معتبر`}
          </button>
        </>
      )}>
        {single
          ? (submitted && errCount > 0 ? <Pill tone="error" dot>{faDigits(errCount)} فیلد نیاز به اصلاح دارد</Pill> : <span>حساب {firstName} در وضعیت «در انتظار فعال‌سازی» ثبت می‌شود</span>)
          : (file ? (invalidN > 0 ? <span>ردیف‌های خطادار ثبت نمی‌شوند؛ آن‌ها را در فایل اصلاح و دوباره بارگذاری کنید</span> : <span>همه‌ی ردیف‌های فایل معتبرند</span>) : <span>هنوز فایلی بارگذاری نشده</span>)}
      </ActionBar>
    </>
  );
}

export default function NewEmployeePage() {
  return (
    <Suspense fallback={null}>
      <NewEmployee />
    </Suspense>
  );
}
