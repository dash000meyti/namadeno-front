'use client';
/**
 * Send wizard, step 1 — pick the recipients. Kit wizard page: heading + steps → picker (mode tabs, unit, search,
 * table with checkboxes, pager) beside the selection summary → sticky action bar.
 * «ورود از اکسل» (button after the search): a file with national id + amount per row picks the recipients and fixes each person's amount
 * (sent as `recipientAmounts`; the settings step then shows the amount read-only). A national id that is not in the
 * employee list opens NewPersonDialog: add the person to the employees (then they stay in the file) or drop the row.
 * People waiting for activation are accepted from the file (they see the package after activating the app).
 */
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreatePackage, useOrgEmployees, useOrgPackage, useUpdatePackage } from '@/api/org';
import { useOrgDepartments } from '@/api/org-people-extra';
import {
  ActionBar, Ava, BigNum, Card, Empty, FileDrop, Ident, Legend, Note, Pill, SearchField, Select, Table, TableFoot, Tabs, Toolbar,
  usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { I, jParts, monthName } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { I as PI, downloadCsv } from '@/components/org/people/shared';
import { NewPersonDialog } from '@/components/org/packages/NewPersonDialog';
import { readSheet } from '@/components/org/people/sheet';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jMonthYear, money } from '@/lib/format';
import { now } from '@/lib/clock';
import type { Employee } from '@/types/domain';

const PAGE = 8;
const UNIT_COLORS = ['--chart-1', '--chart-2', '--chart-3', '--warning-main', '--chart-4', '--chart-5', '--primary-light', '--grey-500'];
const STATUS: Record<Employee['status'], [string, Tone]> = {
  active: ['فعال', 'success'],
  invited: ['در انتظار', 'warning'],
  inactive: ['تعلیق', 'error'],
};
type Mode = 'all' | 'unit' | 'manual' | 'file';
/** Tabs of the picker; «ورود از اکسل» is a button after the search (mode 'file'), like the employees page. */
const MODES: { key: Mode; label: string }[] = [{ key: 'all', label: 'همه کارکنان' }, { key: 'unit', label: 'واحد' }, { key: 'manual', label: 'انتخاب دستی' }];
/** One row of the amounts file: national id + amount, matched to an employee. */
interface FileRow { n: number; nid: string; amount: number; emp?: Employee; error: string; /** valid national id that is not in the employee list */ unknown: boolean }
const SAMPLE_AMOUNTS = [30_000_000, 25_000_000, 25_000_000, 20_000_000, 18_000_000, 15_000_000];
const toAmount = (s: string) => { const d = enDigits(s).replace(/[^\d]/g, ''); return d ? Number(d) : NaN; };
const CHECK = 'M5 12.5l4.5 4.5L19 7';
const MINUS = 'M6 12h12';

function RecipientsStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: emps, isLoading, isError, error, refetch } = useOrgEmployees();
  const { data: draft, isLoading: draftLoading } = useOrgPackage(draftId);
  const create = useCreatePackage();
  const update = useUpdatePackage();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('all');
  const [dept, setDept] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [inited, setInited] = useState(false);
  const [err, setErr] = useState('');
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [reading, setReading] = useState(false);
  // national ids missing from the employee list: dropped («حذف از لیست»), just added, opened by hand; auto = ask one by one
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const units = useOrgDepartments();

  const list = useMemo(() => emps ?? [], [emps]);
  const active = useMemo(() => list.filter((e) => e.status === 'active'), [list]);
  const depts = useMemo(() => Array.from(new Set(list.map((e) => e.department))), [list]);

  // initial selection: the draft's recipients, or every active employee
  useEffect(() => {
    if (inited || !emps || (draftId && draftLoading)) return;
    if (draft && draft.recipients.length && draft.amountSource === 'file') {
      // amounts came from a file: show the saved list as the loaded file
      const nid = (id: string) => list.find((e) => e.id === id)?.nationalId ?? '';
      setFile({ name: 'فهرست ذخیره‌شده در پیش‌نویس', rows: draft.recipients.map((r) => [nid(r.employeeId), String(r.amount)]) });
      setMode('file');
    } else if (draft && draft.recipients.length) {
      setSelected(new Set(draft.recipients.map((r) => r.employeeId)));
      setMode(draft.recipients.length === active.length ? 'all' : 'manual');
    } else setSelected(new Set(active.map((e) => e.id)));
    setDept(depts[0] ?? '');
    setInited(true);
  }, [inited, emps, draft, draftId, draftLoading, active, depts, list]);

  const pickMode = (m: Mode) => {
    setMode(m);
    setErr('');
    if (m === 'all') setSelected(new Set(active.map((e) => e.id)));
    if (m === 'unit') { const d = dept || depts[0] || ''; setDept(d); setSelected(new Set(active.filter((e) => e.department === d).map((e) => e.id))); }
  };
  const pickDept = (d: string) => { setDept(d); setSelected(new Set(active.filter((e) => e.department === d).map((e) => e.id))); };

  const text = q.trim();
  const code = enDigits(text);
  const visible = list.filter((e) => !text || e.fullName.includes(text) || e.employeeCode.includes(code) || e.department.includes(text));
  const pg = usePaging(visible, PAGE, text);
  const visibleActive = visible.filter((e) => e.status === 'active');
  const nSel = visibleActive.filter((e) => selected.has(e.id)).length;
  const allChecked = visibleActive.length > 0 && nSel === visibleActive.length;
  const someChecked = nSel > 0 && !allChecked;

  const toggle = (e: Employee) => {
    if (e.status !== 'active') { toast(`${e.fullName} در وضعیت «${STATUS[e.status][0]}» است و قابل انتخاب نیست`, 'error'); return; }
    const n = new Set(selected);
    if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
    setSelected(n); setMode('manual'); setErr('');
  };
  const toggleAll = () => {
    const n = new Set(selected);
    if (allChecked) visibleActive.forEach((e) => n.delete(e.id)); else visibleActive.forEach((e) => n.add(e.id));
    setSelected(n); setMode('manual'); setErr('');
  };

  // ── amounts file (national id, amount)
  const fileRows: FileRow[] = useMemo(() => {
    if (!file) return [];
    let rows = file.rows.filter((r) => r.some((c) => c.trim()));
    if (rows[0] && !/\d/.test(enDigits(rows[0][0] ?? ''))) rows = rows.slice(1); // header row
    const seen = new Set<string>();
    return rows.map((r, i) => {
      let nid = enDigits(r[0] ?? '').replace(/\D/g, '');
      if (/^\d{8,9}$/.test(nid)) nid = nid.padStart(10, '0'); // Excel drops leading zeros
      const amount = toAmount(r[1] ?? '');
      const emp = list.find((e) => e.nationalId === nid);
      let error = '';
      if (!/^\d{10}$/.test(nid)) error = 'کد ملی نامعتبر';
      else if (seen.has(nid)) error = 'کد ملی تکراری';
      else if (!emp) error = 'در فهرست کارکنان نیست';
      else if (emp.status === 'inactive') error = `کارمند ${STATUS.inactive[0]}`;
      else if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) error = 'مبلغ نامعتبر';
      seen.add(nid);
      return { n: i + 1, nid, amount, emp, error, unknown: /^\d{10}$/.test(nid) && !emp && error === 'در فهرست کارکنان نیست' };
    });
  }, [file, list]);
  const fileValid = fileRows.filter((r) => !r.error);
  const fileBad = fileRows.length - fileValid.length;
  const fileTotal = fileValid.reduce((s, r) => s + r.amount, 0);
  const fp = usePaging(fileRows, PAGE, file);
  const isFile = mode === 'file';
  const unknownRows = fileRows.filter((r) => r.unknown);
  const pending = unknownRows.filter((r) => !skipped.has(r.nid) && !added.has(r.nid));
  const asking = !isFile ? undefined : manual ? fileRows.find((r) => r.nid === manual && r.unknown) : auto ? pending[0] : undefined;
  const unitNames = useMemo(() => [...new Set([...(units.data ?? []).map((d) => d.name), ...depts])], [units.data, depts]);
  /** A new file: ask again about every missing national id. */
  const newFile = (next: { name: string; rows: string[][] } | null) => {
    setFile(next);
    setSkipped(new Set());
    setAdded(new Set());
    setManual(null);
    setAuto(true);
  };

  const loadFile = async (f: File) => {
    setFileErr('');
    setErr('');
    if (f.size > 5 * 1024 * 1024) { setFileErr('حجم فایل بیشتر از ۵ مگابایت است.'); return; }
    setReading(true);
    try {
      const rows = await readSheet(f);
      if (!rows.length) throw new Error('فایل خالی است.');
      if (rows.length > 1001) throw new Error('حداکثر ۱٬۰۰۰ ردیف در هر فایل مجاز است.');
      newFile({ name: f.name, rows });
    } catch (e) {
      newFile(null);
      setFileErr(errMsg(e));
    } finally {
      setReading(false);
    }
  };
  const loadSample = () => {
    setFileErr('');
    setErr('');
    const rows = active.slice(0, SAMPLE_AMOUNTS.length).map((e, i) => [e.nationalId, String(SAMPLE_AMOUNTS[i])]);
    newFile({ name: 'package-amounts-aban.xlsx', rows: [['کد ملی', 'مبلغ (تومان)'], ...rows, ['0099887766', '20000000']] });
  };
  const downloadTemplate = () => downloadCsv('namadno-package-amounts.csv', [['کد ملی', 'مبلغ (تومان)'], ...active.slice(0, 2).map((e) => [e.nationalId, '25000000'])]);

  const chosen = isFile ? fileValid.map((r) => r.emp!) : active.filter((e) => selected.has(e.id));
  const excluded = list.length - active.length;
  const byUnit = depts.map((d) => ({ label: d, count: chosen.filter((e) => e.department === d).length })).filter((u) => u.count > 0).sort((a, b) => b.count - a.count);
  const countNote = isFile
    ? (file ? `از فایل · جمع ${money(fileTotal)} تومان` : 'فایل کد ملی و مبلغ هر نفر را بارگذاری کنید')
    : mode === 'all' ? `همه کارکنان فعال · ${faDigits(excluded)} نفر غیرفعال حذف شدند` : mode === 'unit' ? `واحد ${dept} · ${faDigits(chosen.length)} نفر` : 'انتخاب دستی از فهرست';

  const busy = create.isPending || update.isPending;
  const locked = !!draft && draft.status !== 'draft';
  const next = () => {
    if (isFile && !file) { setErr('فایل کد ملی و مبلغ هر نفر را بارگذاری کنید.'); return; }
    if (!chosen.length) { setErr(isFile ? 'هیچ ردیف معتبری در فایل نیست.' : 'حداقل یک کارمند فعال را انتخاب کنید.'); return; }
    const recipientIds = chosen.map((e) => e.id);
    const recipientAmounts = isFile ? Object.fromEntries(fileValid.map((r) => [r.emp!.id, r.amount])) : undefined;
    const onError = (e: unknown) => toast(errMsg(e), 'error');
    if (draftId && draft) {
      update.mutate({ id: draftId, recipientIds, recipientAmounts }, { onSuccess: (p) => router.push(routes.org.newSettings(p.id)), onError });
    } else {
      const t = jParts(now());
      create.mutate(
        { recipientIds, recipientAmounts, title: `پاداش ${monthName(now().toISOString())} ${faDigits(t.y)}`, reason: 'bonus', amountPerPerson: 0, allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'none' } },
        { onSuccess: (p) => router.push(routes.org.newSettings(p.id)), onError },
      );
    }
  };

  const columns: Column<Employee>[] = [
    {
      key: 'sel', width: '18px',
      label: (
        <button type="button" className="nm-tsel" role="checkbox" aria-checked={allChecked ? 'true' : someChecked ? 'mixed' : 'false'} aria-label="انتخاب همه" onClick={toggleAll}>
          {(allChecked || someChecked) && <Icon d={allChecked ? CHECK : MINUS} size={12} strokeWidth={3} />}
        </button>
      ),
      render: (e) => {
        const on = selected.has(e.id) && e.status === 'active';
        return <button type="button" className="nm-tsel" role="checkbox" aria-checked={on} aria-label={`انتخاب ${e.fullName}`} onClick={() => toggle(e)}>{on && <Icon d={CHECK} size={12} strokeWidth={3} />}</button>;
      },
    },
    { key: 'who', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (e) => <Ident lead={<Ava letter={e.avatarLetter} id={e.id} />} title={e.fullName} sub={<span className="num">{faDigits(e.employeeCode)}</span>} /> },
    { key: 'dept', label: 'واحد', width: 'minmax(0, 0.8fr)', render: (e) => <span className="el mute">{e.department}</span> },
    { key: 'pf', label: 'دارایی کل', width: '120px', render: (e) => <span className="num">{money(e.portfolioValue)}</span> },
    { key: 'st', label: 'وضعیت', width: '88px', render: (e) => <Pill tone={STATUS[e.status][1]} dot>{STATUS[e.status][0]}</Pill> },
    { key: 'last', label: 'آخرین بسته', width: '96px', render: (e) => <span className="num sm">{e.lastPackageAt ? jMonthYear(e.lastPackageAt) : '—'}</span> },
  ];
  const fileCols: Column<FileRow>[] = [
    { key: 'n', label: 'ردیف', width: '48px', render: (r) => <span className="num mute">{faDigits(r.n)}</span> },
    { key: 'who', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (r) => (r.emp ? <Ident lead={<Ava letter={r.emp.avatarLetter} id={r.emp.id} />} title={r.emp.fullName} sub={r.emp.department} /> : <span className="mute">—</span>) },
    { key: 'nid', label: 'کد ملی', width: '120px', render: (r) => <span className="num" dir="ltr">{faDigits(r.nid || '—')}</span> },
    { key: 'amt', label: 'مبلغ (تومان)', width: '130px', render: (r) => <span className="num">{Number.isFinite(r.amount) ? money(r.amount) : '—'}</span> },
    {
      key: 'st', label: 'وضعیت', width: '160px', render: (r) => (r.error
        ? <Pill tone="error">{r.error}</Pill>
        : r.emp?.status === 'invited' ? <Pill tone="warning">در انتظار فعال‌سازی</Pill> : <Pill tone="success">معتبر</Pill>),
    },
    {
      key: 'act', label: '', width: '112px', render: (r) => (r.unknown
        ? <button type="button" className="nm-btn sm text" onClick={() => setManual(r.nid)}>افزودن به کارکنان</button>
        : null),
    },
  ];

  return (
    <>
      <WizardHeader step={1} draftId={draft ? draftId : undefined} />

      {locked && (
        <Note tone="warn" action={<Link href={routes.org.package(draftId)} className="nm-btn sm ghost">مشاهده بسته</Link>}>این بسته قبلاً ارسال شده و قابل ویرایش نیست.</Note>
      )}

      <Card title="گیرندگان بسته" sub={isFile ? 'همکاران «در انتظار فعال‌سازی» بسته را پس از فعال‌سازی حساب در اپ می‌بینند.' : 'کارکنان در وضعیت «تعلیق» یا «در انتظار فعال‌سازی» به‌صورت خودکار از فهرست خارج می‌شوند.'}>
        <div className="nm-grid c2" style={{ alignItems: 'center' }}>
          <div className="nm-col" style={{ gap: 6 }}>
            <BigNum value={faDigits(chosen.length)} unit="نفر انتخاب‌شده" />
            <span className="mute" style={{ fontSize: 12.5 }}>{countNote}</span>
          </div>
          {byUnit.length
            ? <Legend items={byUnit.map((u, i) => ({ label: u.label, value: faDigits(u.count), color: `var(${UNIT_COLORS[i % UNIT_COLORS.length]})` }))} />
            : <span className="mute" style={{ fontSize: 12.5 }}>هنوز کسی انتخاب نشده است.</span>}
        </div>
      </Card>

      <Card flush>
        <Toolbar>
          <Tabs label="نحوه انتخاب گیرندگان" value={mode} onChange={pickMode} items={MODES} />
          <span className="grow" />
          {mode === 'unit' && (
            <Select label="انتخاب واحد" prefix="واحد" value={dept} onChange={pickDept} align="end"
              options={depts.map((d) => ({ key: d, label: d, count: active.filter((e) => e.department === d).length }))} />
          )}
          {!isFile && <SearchField value={q} onChange={setQ} placeholder="جستجوی نام یا کد پرسنلی…" label="جستجوی کارمند" width={240} />}
          <button type="button" className="nm-btn ghost" aria-pressed={isFile} onClick={() => pickMode('file')}><Icon d={PI.upload} size={17} />ورود از اکسل</button>
        </Toolbar>
        {!isFile && (
          <>
            <Table
              columns={columns} rows={pg.rows} rowKey={(e) => e.id} rowLabel={(e) => e.fullName} dimRow={(e) => e.status !== 'active'}
              loading={isLoading} error={isError ? error : undefined} onRetry={() => refetch()}
              empty={<Empty icon={I.search} title="کارمندی پیدا نشد" />} minWidth={720}
            />
            <TableFoot shown={pg.rows.length} total={visible.length} unit="کارمند" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
          </>
        )}
      </Card>

      {/* Excel: the same file card + preview card as «افزودن کارمند ← ورود از اکسل» */}
      {isFile && (
        <>
          <Card title="فایل گیرندگان"
            actions={(
              <button type="button" className="nm-btn sm text" onClick={downloadTemplate}>
                <Icon d={PI.xls} size={15} />دانلود قالب اکسل
              </button>
            )}>
            <FileDrop onFile={(f) => void loadFile(f)} busy={reading} title="فایل اکسل را اینجا بکشید یا انتخاب کنید" hint="ستون‌ها: کد ملی، مبلغ هر نفر (تومان) · XLSX یا CSV · حداکثر ۵ مگابایت">
              <button type="button" className="nm-btn sm ghost" onClick={loadSample}>استفاده از فایل نمونه</button>
            </FileDrop>
          </Card>
          {fileErr && <Note tone="err">{fileErr}</Note>}
          {file && (
            <Card flush title="پیش‌نمایش ردیف‌ها" count={fileRows.length} sub={file.name}
              actions={(
                <>
                  <Pill tone="success">{faDigits(fileValid.length)} معتبر</Pill>
                  {fileBad > 0 && <Pill tone="error">{faDigits(fileBad)} خطا</Pill>}
                  <button type="button" className="nm-ib" aria-label="حذف فایل" onClick={() => { newFile(null); setErr(''); }}><Icon d={PI.x} size={16} /></button>
                </>
              )}>
              <Table
                columns={fileCols} rows={fp.rows} rowKey={(r) => String(r.n)} rowLabel={(r) => r.emp?.fullName ?? `ردیف ${faDigits(r.n)}`} dimRow={(r) => !!r.error} minWidth={640}
                empty={<Empty icon={PI.xls} title="ردیفی در فایل پیدا نشد" sub="ستون‌ها به ترتیب: کد ملی، مبلغ هر نفر (تومان)" />}
              />
              {fileRows.length > 0 && <TableFoot shown={fp.rows.length} total={fileRows.length} unit="ردیف" page={fp.page} pages={fp.pages} onPage={fp.setPage} />}
            </Card>
          )}
        </>
      )}

      {asking && (
        <NewPersonDialog
          key={asking.nid}
          row={asking}
          position={{ index: unknownRows.indexOf(asking) + 1, count: unknownRows.length }}
          existing={list} departments={unitNames}
          onAdded={(e) => { setAdded((x) => new Set(x).add(asking.nid)); setManual(null); toast(`${e.fullName} به کارکنان اضافه شد`); }}
          onSkip={() => { setSkipped((x) => new Set(x).add(asking.nid)); setManual(null); }}
          onClose={() => { setManual(null); setAuto(false); }}
        />
      )}

      <ActionBar actions={(
        <button type="button" className="nm-btn" onClick={next} disabled={busy || locked || !inited}>
          {busy ? 'در حال ذخیره…' : 'مرحله بعد: تنظیمات بسته'}<Icon d={I.chevL} size={16} strokeWidth={2} />
        </button>
      )}>
        {err
          ? <span className="nm-help err" role="alert">{err}</span>
          : <span><b className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(chosen.length)}</b> نفر انتخاب شده{isFile && file ? <> · جمع <b className="num" style={{ color: 'var(--text-primary)' }}>{money(fileTotal)}</b> تومان</> : null}</span>}
      </ActionBar>
    </>
  );
}

export default function NewPackageRecipientsPage() {
  return <Suspense fallback={null}><RecipientsStep /></Suspense>;
}
