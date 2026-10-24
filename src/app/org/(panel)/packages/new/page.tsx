'use client';
/**
 * Send wizard, step 1 — pick the recipients. Kit wizard page: heading + steps → picker (mode tabs, unit, search,
 * table with checkboxes, pager) beside the selection summary → sticky action bar.
 */
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCreatePackage, useOrgEmployees, useOrgPackage, useUpdatePackage } from '@/api/org';
import {
  ActionBar, Ava, BigNum, Card, Empty, Ident, Legend, Note, Pill, SearchField, Select, Table, TableFoot, Tabs, Toolbar,
  usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { I, jParts, monthName } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
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
type Mode = 'all' | 'unit' | 'manual';
const MODES: { key: Mode; label: string }[] = [{ key: 'all', label: 'همه کارکنان' }, { key: 'unit', label: 'واحد' }, { key: 'manual', label: 'انتخاب دستی' }];
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

  const list = useMemo(() => emps ?? [], [emps]);
  const active = useMemo(() => list.filter((e) => e.status === 'active'), [list]);
  const depts = useMemo(() => Array.from(new Set(list.map((e) => e.department))), [list]);

  // initial selection: the draft's recipients, or every active employee
  useEffect(() => {
    if (inited || !emps || (draftId && draftLoading)) return;
    if (draft && draft.recipients.length) {
      setSelected(new Set(draft.recipients.map((r) => r.employeeId)));
      setMode(draft.recipients.length === active.length ? 'all' : 'manual');
    } else setSelected(new Set(active.map((e) => e.id)));
    setDept(depts[0] ?? '');
    setInited(true);
  }, [inited, emps, draft, draftId, draftLoading, active, depts]);

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

  const chosen = active.filter((e) => selected.has(e.id));
  const excluded = list.length - active.length;
  const byUnit = depts.map((d) => ({ label: d, count: chosen.filter((e) => e.department === d).length })).filter((u) => u.count > 0).sort((a, b) => b.count - a.count);
  const countNote = mode === 'all' ? `همه کارکنان فعال · ${faDigits(excluded)} نفر غیرفعال حذف شدند` : mode === 'unit' ? `واحد ${dept} · ${faDigits(chosen.length)} نفر` : 'انتخاب دستی از فهرست';

  const busy = create.isPending || update.isPending;
  const locked = !!draft && draft.status !== 'draft';
  const next = () => {
    if (!chosen.length) { setErr('حداقل یک کارمند فعال را انتخاب کنید.'); return; }
    const recipientIds = chosen.map((e) => e.id);
    const onError = (e: unknown) => toast(errMsg(e), 'error');
    if (draftId && draft) {
      update.mutate({ id: draftId, recipientIds }, { onSuccess: (p) => router.push(routes.org.newSettings(p.id)), onError });
    } else {
      const t = jParts(now());
      create.mutate(
        { recipientIds, title: `پاداش ${monthName(now().toISOString())} ${faDigits(t.y)}`, reason: 'bonus', amountPerPerson: 0, allocationMode: 'free', cashAllowed: true, lockPolicy: { type: 'none' } },
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

  return (
    <>
      <WizardHeader step={1} draftId={draft ? draftId : undefined} />

      {locked && (
        <Note tone="warn" action={<Link href={routes.org.package(draftId)} className="nm-btn sm ghost">مشاهده بسته</Link>}>این بسته قبلاً ارسال شده و قابل ویرایش نیست.</Note>
      )}

      <Card title="گیرندگان بسته" sub="کارکنان در وضعیت «تعلیق» یا «در انتظار فعال‌سازی» به‌صورت خودکار از فهرست خارج می‌شوند.">
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
          <SearchField value={q} onChange={setQ} placeholder="جستجوی نام یا کد پرسنلی…" label="جستجوی کارمند" width={240} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(e) => e.id} rowLabel={(e) => e.fullName} dimRow={(e) => e.status !== 'active'}
          loading={isLoading} error={isError ? error : undefined} onRetry={() => refetch()}
          empty={<Empty icon={I.search} title="کارمندی پیدا نشد" />} minWidth={720}
        />
        <TableFoot shown={pg.rows.length} total={visible.length} unit="کارمند" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      <ActionBar actions={(
        <button type="button" className="nm-btn" onClick={next} disabled={busy || locked || !inited}>
          {busy ? 'در حال ذخیره…' : 'مرحله بعد: تنظیمات بسته'}<Icon d={I.chevL} size={16} strokeWidth={2} />
        </button>
      )}>
        {err
          ? <span className="nm-help err" role="alert">{err}</span>
          : <span><b className="num" style={{ color: 'var(--text-primary)' }}>{faDigits(chosen.length)}</b> نفر انتخاب شده</span>}
      </ActionBar>
    </>
  );
}

export default function NewPackageRecipientsPage() {
  return <Suspense fallback={null}><RecipientsStep /></Suspense>;
}
