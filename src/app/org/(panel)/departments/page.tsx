'use client';
/**
 * Organization panel — units (departments). Kit list page: stats → list card (search, table) → inspector.
 * Only the organization's «مدیر» (panelRole 'admin') can open it; «تأییدکننده» and «کارشناس» see a no-access state.
 * The mock enforces the same rule on every write (403 forbidden_role).
 * «سایر» is the default unit of every organization: it cannot be renamed or deleted; deleting another unit moves its colleagues there.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Employee, OrgDepartment } from '@/types/domain';
import { useOrgEmployees } from '@/api/org';
import { useAddDepartmentMembers, useCreateDepartment, useDeleteDepartment, useOrgDepartments, useOrgPanelRole, useUpdateDepartment } from '@/api/org-people-extra';
import {
  Ava, Card, Confirm, Dialog, Empty, Field, Ident, Inspector, KV, List, ListRow, PageHeading, Pill, SearchField, Section,
  SkeletonCard, StatStrip, Table, TableFoot, Tile, Toolbar, Who, type Column,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/org/people/shared';
import { faDigits, jDate } from '@/lib/format';
import { routes } from '@/lib/routes';
import { DEFAULT_UNIT } from '@/lib/org';

const I = {
  units: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  shield: 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM12 10v3M12 16h.01',
  chevD: 'M7 10l5 5 5-5',
  addUser: 'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 3 17.5V19M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M16 11h6',
};
const CRUMBS = [{ label: 'مدیریت' }];
const MEMBERS_SHOWN = 8;

export default function OrgDepartmentsPage() {
  const role = useOrgPanelRole();
  if (role === undefined) return <><PageHeading title="واحدها" crumbs={CRUMBS} /><SkeletonCard /></>;
  if (role !== 'admin') return <NoAccess />;
  return <Departments />;
}

function NoAccess() {
  return (
    <>
      <PageHeading title="واحدها" crumbs={CRUMBS} />
      <Card>
        <Empty
          icon={I.shield} tone="neutral"
          title="این بخش فقط برای مدیر سازمان است"
          sub="ساخت و ویرایش واحدها با دسترسی مدیر سازمان انجام می‌شود."
          action={<Link href={routes.org.employees} className="nm-btn ghost">بازگشت به کارکنان</Link>}
        />
      </Card>
    </>
  );
}

function Departments() {
  const toast = useToast();
  const list = useOrgDepartments();
  const emps = useOrgEmployees();
  const remove = useDeleteDepartment();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<OrgDepartment | 'new' | null>(null);
  const [del, setDel] = useState<OrgDepartment | null>(null);
  const [adding, setAdding] = useState<OrgDepartment | null>(null);

  const rows = useMemo(
    () => (list.data ?? []).slice().sort((a, b) => b.employees - a.employees || a.name.localeCompare(b.name, 'fa')),
    [list.data],
  );
  const term = q.trim();
  const shown = term ? rows.filter((d) => d.name.includes(term) || (d.head ?? '').includes(term)) : rows;
  const total = rows.reduce((s, d) => s + d.employees, 0);
  const biggest = rows[0];
  const noHead = rows.filter((d) => !d.head).length;
  const current = rows.find((d) => d.id === sel) ?? null;
  const members = current ? (emps.data ?? []).filter((e) => e.department === current.name) : [];
  const people = useMemo(() => [...new Set((emps.data ?? []).map((e) => e.fullName))].sort((a, b) => a.localeCompare(b, 'fa')), [emps.data]);

  const columns: Column<OrgDepartment>[] = [
    {
      key: 'name', label: 'واحد', width: 'minmax(0, 1.6fr)',
      render: (d) => <Ident lead={<Ava letter={d.name[0]} id={d.id} sq />} title={<>{d.name}{d.isDefault && <Pill style={{ marginRight: 6 }}>پیش‌فرض</Pill>}</>} sub={d.head ? `مسئول: ${d.head}` : 'بدون مسئول'} />,
    },
    { key: 'emp', label: 'همکاران', width: '130px', render: (d) => (d.employees ? <span className="num">{faDigits(d.employees)} نفر</span> : <Pill>بدون همکار</Pill>) },
    { key: 'created', label: 'تاریخ ایجاد', width: '130px', render: (d) => <span className="num">{jDate(d.createdAt)}</span> },
  ];

  const confirmDelete = () => {
    if (!del || remove.isPending) return;
    remove.mutate(del.id, {
      onSuccess: (r) => { toast(`واحد «${del.name}» حذف شد${r.moved ? ` · ${faDigits(r.moved)} همکار به «${DEFAULT_UNIT}» منتقل شد` : ''}`); setDel(null); setSel(null); },
      onError: (e) => { toast(errMsg(e), 'error'); setDel(null); },
    });
  };

  return (
    <>
      <PageHeading title="واحدها" crumbs={CRUMBS} sub="واحدهای سازمان، مسئول هر واحد و همکاران آن">
        <button type="button" className="nm-btn" onClick={() => setEdit('new')}><Icon d={I.plus} size={16} strokeWidth={2} />واحد جدید</button>
      </PageHeading>

      <StatStrip
        loading={list.isLoading}
        items={[
          { label: 'واحدها', value: faDigits(rows.length), note: 'در سازمان', icon: { d: I.units, tone: 'info' } },
          { label: 'همکاران', value: faDigits(total), unit: 'نفر', note: 'در همه‌ی واحدها' },
          { label: 'بزرگ‌ترین واحد', value: biggest?.name ?? '—', note: biggest ? `${faDigits(biggest.employees)} همکار` : '' },
          { label: 'بدون مسئول', value: faDigits(noHead), note: noHead ? 'مسئول تعیین نشده' : 'همه‌ی واحدها مسئول دارند', trend: noHead ? 'warn' : 'up' },
        ]}
      />

      <Card flush>
        <Toolbar>
          <SearchField value={q} onChange={setQ} placeholder="نام واحد یا مسئول" label="جستجوی واحد" />
        </Toolbar>
        <Table
          columns={columns} rows={shown} rowKey={(d) => d.id} rowLabel={(d) => d.name}
          onRowClick={(d) => setSel(d.id)} selectedKey={sel} chevron
          loading={list.isLoading} error={list.error} onRetry={() => list.refetch()}
          empty={term
            ? <Empty title="واحدی با این نام پیدا نشد" sub="عبارت دیگری را جستجو کنید." />
            : <Empty icon={I.units} title="هنوز واحدی ساخته نشده" action={<button type="button" className="nm-btn" onClick={() => setEdit('new')}>واحد جدید</button>} />}
        />
        <TableFoot shown={shown.length} total={rows.length} unit="واحد" />
      </Card>

      <Inspector
        open={!!current} onClose={() => setSel(null)} title="جزئیات واحد" label={`واحد ${current?.name ?? ''}`}
        footer={current && (
          <>
            {!current.isDefault && (
              <button type="button" className="nm-btn ghost" onClick={() => setDel(current)}><Icon d={I.trash} size={16} />حذف واحد</button>
            )}
            <button type="button" className="nm-btn" onClick={() => setEdit(current)}><Icon d={I.edit} size={16} />ویرایش</button>
          </>
        )}
      >
        {current && (
          <>
            <Who
              lead={<Ava letter={current.name[0]} id={current.id} sq size="xl" />}
              title={<>{current.name}{current.isDefault && <Pill style={{ marginRight: 6 }}>پیش‌فرض</Pill>}</>}
              sub={current.head ? `مسئول: ${current.head}` : 'بدون مسئول'}
              pills={<Pill tone={current.employees ? 'info' : 'neutral'}>{current.employees ? `${faDigits(current.employees)} همکار` : 'بدون همکار'}</Pill>}
            />
            <KV rows={[
              ['مسئول واحد', current.head ?? '—'],
              ['همکاران', <span key="n" className="num">{faDigits(current.employees)} نفر</span>],
              ['تاریخ ایجاد', <span key="d" className="num">{jDate(current.createdAt)}</span>],
            ]} />
            <Section
              title="همکاران این واحد"
              action={<button type="button" className="nm-btn sm ghost" onClick={() => setAdding(current)}><Icon d={I.addUser} size={15} />افزودن همکار</button>}
            >
              {members.length ? (
                <List>
                  {members.slice(0, MEMBERS_SHOWN).map((e) => (
                    <ListRow key={e.id} lead={<Ava letter={e.avatarLetter} id={e.id} size="sm" />} title={e.fullName} sub={e.jobTitle || 'کارمند'} href={routes.org.employee(e.id)} />
                  ))}
                </List>
              ) : (
                <Empty
                  icon={I.addUser} title="هنوز همکاری در این واحد نیست"
                  action={<button type="button" className="nm-btn" onClick={() => setAdding(current)}><Icon d={I.addUser} size={16} />افزودن همکار</button>}
                />
              )}
              {members.length > MEMBERS_SHOWN && <p className="nm-sub" style={{ marginTop: 8 }}>و {faDigits(members.length - MEMBERS_SHOWN)} همکار دیگر</p>}
            </Section>
          </>
        )}
      </Inspector>

      <DeptDialog
        key={edit === 'new' ? 'dept-new' : edit ? `dept-${edit.id}` : 'dept-closed'}
        target={edit} names={rows.map((d) => d.name)} people={people}
        onClose={() => setEdit(null)}
        onSaved={(d, created) => { setEdit(null); setSel(d.id); toast(created ? `واحد «${d.name}» ساخته شد` : 'تغییرات واحد ذخیره شد'); }}
      />

      <MembersDialog
        key={adding ? `members-${adding.id}` : 'members-closed'}
        dept={adding} employees={emps.data ?? []}
        onClose={() => setAdding(null)}
        onDone={(n, d) => { setAdding(null); toast(`${faDigits(n)} همکار به واحد «${d.name}» اضافه شد`); }}
      />

      <Confirm
        open={!!del} onClose={() => setDel(null)} danger busy={remove.isPending} onConfirm={confirmDelete}
        title={`حذف واحد «${del?.name ?? ''}»؟`} confirmLabel="حذف واحد"
        body={del?.employees ? `${faDigits(del.employees)} همکار این واحد به «${DEFAULT_UNIT}» منتقل ${del.employees === 1 ? 'می‌شود' : 'می‌شوند'}.` : 'این واحد از فهرست واحدهای سازمان حذف می‌شود.'}
      />
    </>
  );
}

/** Create / edit a unit: name (required, unique) and an optional head chosen from the organization's employees. */
function DeptDialog({ target, names, people, onClose, onSaved }: {
  target: OrgDepartment | 'new' | null; names: string[]; people: string[];
  onClose: () => void; onSaved: (d: OrgDepartment, created: boolean) => void;
}) {
  const isNew = target === 'new';
  const orig = target && target !== 'new' ? target : null;
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const [name, setName] = useState(orig?.name ?? '');
  const [head, setHead] = useState(orig?.head ?? '');
  const [tried, setTried] = useState(false);
  const [serverErr, setServerErr] = useState('');
  const busy = create.isPending || update.isPending;
  const heads = head && !people.includes(head) ? [head, ...people] : people;

  const clean = name.trim().replace(/\s+/g, ' ');
  const nameErr = clean.length < 2 ? 'نام واحد را وارد کنید.' : names.some((n) => n === clean && n !== orig?.name) ? 'واحدی با این نام وجود دارد.' : '';
  const shownErr = (tried && nameErr) || serverErr;

  const save = () => {
    setTried(true);
    setServerErr('');
    if (nameErr || busy) return;
    const opts = { onError: (e: unknown) => setServerErr(errMsg(e)) };
    if (isNew) create.mutate({ name: clean, head: head || undefined }, { ...opts, onSuccess: (d) => onSaved(d, true) });
    else if (orig) update.mutate({ id: orig.id, name: clean, head }, { ...opts, onSuccess: (d) => onSaved(d, false) });
  };

  return (
    <Dialog
      open={!!target} onClose={onClose} width={460}
      icon={<Tile d={isNew ? I.plus : I.edit} tone="info" size="lg" />}
      title={isNew ? 'واحد جدید' : `ویرایش واحد «${orig?.name ?? ''}»`}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={save} disabled={busy}>{busy ? 'در حال ذخیره…' : isNew ? 'ساخت واحد' : 'ذخیره'}</button>
        </>
      )}
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="nm-col" style={{ gap: 14 }}>
        <Field label="نام واحد" htmlFor="dep-name" error={shownErr || undefined} help={orig?.isDefault ? 'واحد پیش‌فرض سازمان؛ همکارانی که واحد ندارند اینجا قرار می‌گیرند' : undefined}>
          <span className={'nm-ctl' + (shownErr ? ' err' : '')} style={orig?.isDefault ? { background: 'var(--bg-neutral)' } : undefined}>
            <input id="dep-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setServerErr(''); }} placeholder="مثلاً حقوقی" maxLength={40} autoFocus={!orig?.isDefault} readOnly={orig?.isDefault} aria-invalid={!!shownErr} />
          </span>
        </Field>
        <Field label="مسئول واحد" htmlFor="dep-head" help="اختیاری">
          <span className="nm-ctl">
            <select id="dep-head" value={head} onChange={(e) => setHead(e.target.value)}>
              <option value="">بدون مسئول</option>
              {heads.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Icon d={I.chevD} size={18} />
          </span>
        </Field>
        {!isNew && orig && orig.employees > 0 && clean !== orig.name && !nameErr && (
          <p className="nm-sub" style={{ margin: 0 }}>واحد {faDigits(orig.employees)} همکار هم به «{clean}» تغییر می‌کند.</p>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Add colleagues to a unit: pick existing employees of other units (they move to this unit),
 * or start a new employee with this unit already chosen.
 */
function MembersDialog({ dept, employees, onClose, onDone }: {
  dept: OrgDepartment | null; employees: Employee[];
  onClose: () => void; onDone: (count: number, d: OrgDepartment) => void;
}) {
  const add = useAddDepartmentMembers();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const others = dept ? employees.filter((e) => e.department !== dept.name) : [];
  const term = q.trim();
  const shown = term ? others.filter((e) => e.fullName.includes(term) || e.department.includes(term) || faDigits(e.employeeCode).includes(faDigits(term)) || e.employeeCode.includes(term)) : others;
  const toggle = (id: string) => { setErr(''); setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };

  const save = () => {
    if (!dept || add.isPending) return;
    if (!picked.length) { setErr('دست‌کم یک همکار را انتخاب کنید.'); return; }
    add.mutate({ id: dept.id, employeeIds: picked }, { onSuccess: (d) => onDone(picked.length, d), onError: (e) => setErr(errMsg(e)) });
  };

  return (
    <Dialog
      open={!!dept} onClose={onClose} width={520}
      icon={<Tile d={I.addUser} tone="info" size="lg" />}
      title={`افزودن همکار به «${dept?.name ?? ''}»`}
      sub="همکارانی که انتخاب کنید از واحد فعلی‌شان به این واحد منتقل می‌شوند."
      footer={(
        <>
          {dept && <Link href={`${routes.org.employeeNew}?dept=${encodeURIComponent(dept.name)}`} className="nm-btn text" style={{ marginLeft: 'auto' }}>همکار جدید</Link>}
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn" onClick={save} disabled={add.isPending}>
            {add.isPending ? 'در حال افزودن…' : picked.length ? `افزودن ${faDigits(picked.length)} همکار` : 'افزودن'}
          </button>
        </>
      )}
    >
      <div className="nm-col" style={{ gap: 10 }}>
        <SearchField value={q} onChange={setQ} placeholder="نام، کد پرسنلی یا واحد" label="جستجوی همکار" width="100%" />
        {err && <p className="nm-help err" role="alert" style={{ margin: 0 }}>{err}</p>}
        <div style={{ maxHeight: 340, overflowY: 'auto', marginInline: -4, paddingInline: 4 }}>
          {shown.length ? (
            <List>
              {shown.map((e) => (
                <ListRow
                  key={e.id} onClick={() => toggle(e.id)} pressed={picked.includes(e.id)} label={`${e.fullName}، واحد ${e.department}`}
                  lead={<Ava letter={e.avatarLetter} id={e.id} size="sm" />}
                  title={e.fullName}
                  sub={<>واحد فعلی: {e.department} · <span className="num">{faDigits(e.employeeCode)}</span></>}
                />
              ))}
            </List>
          ) : (
            <Empty title={term ? 'همکاری با این مشخصات پیدا نشد' : 'همه‌ی همکاران در این واحد هستند'} />
          )}
        </div>
      </div>
    </Dialog>
  );
}
