'use client';
/**
 * Organization panel — employees. Kit list page: summary (team assets with the free/locked split; three cells double as
 * quick filters) → list card (status tabs, department, search, selectable table, bulk actions) → employee inspector.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useOrgEmployees, useUpdateEmployee } from '@/api/org';
import { useBulkEmployeeStatus, useOrgPeopleFacts, type EmpFacts } from '@/api/org-people-extra';
import type { Employee } from '@/types/domain';
import {
  Ava, BulkBar, Card, Confirm, Empty, Ident, PageHeading, Pill, SearchField, Select, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar,
  usePaging, type Column, type Stat,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { EMP_STATUS, I, compactParts, errMsg } from '@/components/org/people/shared';
import { EMP_TONE, EmployeeInspector, SuspendNotice } from '@/components/org/people/EmployeeSidePanel';
import { useStartPackage } from '@/components/org/people/useStartPackage';
import { compactMoney, enDigits, faDigits, money, pct } from '@/lib/format';
import { routes } from '@/lib/routes';

type Tab = 'all' | Employee['status'];
type More = { locked: boolean; facility: boolean; pending: boolean };
const PAGE = 10;
const NO_MORE: More = { locked: false, facility: false, pending: false };
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'همه' }, { key: 'active', label: 'فعال' }, { key: 'invited', label: 'در انتظار' }, { key: 'inactive', label: 'تعلیق' },
];

/** Portfolio and locked value of an employee (HR facts when loaded, else the employee record). free = value − locked. */
function valueOf(e: Employee, x?: EmpFacts) {
  const portfolio = x?.portfolio ?? e.portfolioValue;
  const locked = x?.locked ?? e.lockedValue;
  return { portfolio, locked, free: Math.max(0, portfolio - locked) };
}

/** Totals for the summary strip over the employees in scope (the chosen department). */
function summarize(list: Employee[], f: Record<string, EmpFacts>) {
  const s = { total: 0, locked: 0, nLocked: 0, nFacility: 0, loan: 0, card: 0, nPending: 0, pending: 0 };
  for (const e of list) {
    const x = f[e.id];
    const v = valueOf(e, x);
    s.total += v.portfolio;
    s.locked += v.locked;
    if (v.locked) s.nLocked += 1;
    if (x && (x.loanActive || x.cardLimit)) s.nFacility += 1;
    s.loan += x?.loanActive ?? 0;
    s.card += x?.cardLimit ?? 0;
    if (x?.pendingPackages) { s.nPending += 1; s.pending += x.pendingPackages; }
  }
  return s;
}

export default function OrgEmployeesPage() {
  usePanelToast(); // shows a message flashed by the previous screen (e.g. after an Excel import)
  const show = useToast();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dept, setDept] = useState('all');
  const [tab, setTab] = useState<Tab>('all');
  const [more, setMore] = useState<More>(NO_MORE);
  const [selected, setSelected] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [suspendIds, setSuspendIds] = useState<string[] | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(enDigits(q.trim())), 300); return () => clearTimeout(t); }, [q]);

  const all = useOrgEmployees();
  const list = useOrgEmployees({ q: debounced || undefined, department: dept === 'all' ? undefined : dept });
  const facts = useOrgPeopleFacts();
  const update = useUpdateEmployee();
  const bulk = useBulkEmployeeStatus();
  const pkg = useStartPackage((e) => show(errMsg(e), 'error'));

  const everyone = all.data ?? [];
  const departments = [...new Set(everyone.map((e) => e.department))];
  const base = list.data ?? [];
  const f = facts.data ?? {};
  const counts: Record<Tab, number> = { all: base.length, active: 0, invited: 0, inactive: 0 };
  base.forEach((e) => { counts[e.status] += 1; });
  const rows = base.filter((e) => {
    if (tab !== 'all' && e.status !== tab) return false;
    const x = f[e.id];
    if (more.locked && !(x?.locked ?? e.lockedValue)) return false;
    if (more.facility && !(x && (x.loanActive || x.cardLimit))) return false;
    if (more.pending && !x?.pendingPackages) return false;
    return true;
  });
  const pg = usePaging(rows, PAGE, `${debounced}|${dept}|${tab}|${more.locked}|${more.facility}|${more.pending}`);
  const find = (id: string) => everyone.find((e) => e.id === id) ?? base.find((e) => e.id === id);
  const pickedEmp = picked ? find(picked) : undefined;
  const filtered = !!q.trim() || dept !== 'all' || tab !== 'all' || more.locked || more.facility || more.pending;
  const clearFilters = () => { setQ(''); setDept('all'); setTab('all'); setMore(NO_MORE); };
  const toggle = (k: keyof More) => setMore((m) => ({ ...m, [k]: !m[k] }));

  const setStatus = (e: Employee, status: Employee['status'], msg: string) =>
    update.mutate({ id: e.id, status }, { onSuccess: () => show(msg), onError: (err) => show(errMsg(err), 'error') });

  const doSuspend = () => {
    const ids = suspendIds ?? [];
    if (ids.length === 1) {
      const e = find(ids[0]);
      if (e) setStatus(e, 'inactive', `حساب ${e.fullName} تعلیق شد`);
    } else if (ids.length > 1) {
      bulk.mutate({ ids, status: 'inactive' }, { onSuccess: (r) => { show(`${faDigits(r.updated)} حساب تعلیق شد`); setSelected([]); }, onError: (err) => show(errMsg(err), 'error') });
    }
    setSuspendIds(null);
  };
  const suspendTarget = suspendIds?.length === 1 ? find(suspendIds[0]) : undefined;

  // summary over the chosen department (search is transient and does not change the totals)
  const sum = summarize(everyone.filter((e) => dept === 'all' || e.department === dept), f);
  const totalParts = compactParts(sum.total);
  const stats: Stat[] = [
    {
      label: dept === 'all' ? 'دارایی کارکنان' : `دارایی واحد ${dept}`, value: totalParts[0], unit: totalParts[1],
      note: sum.total ? `آزاد ${pct(((sum.total - sum.locked) / sum.total) * 100)} · قفل ${pct((sum.locked / sum.total) * 100)}` : 'هنوز دارایی ثبت نشده',
    },
    { label: 'دارای قفل', value: faDigits(sum.nLocked), unit: 'نفر', note: sum.locked ? `جمع قفل ${compactMoney(sum.locked)} تومان` : 'همه‌ی دارایی‌ها آزاد است', onClick: () => toggle('locked'), active: more.locked },
    { label: 'دارای وام یا اعتبار', value: faDigits(sum.nFacility), unit: 'نفر', note: sum.nFacility ? `وام ${compactMoney(sum.loan)} · سقف کارت ${compactMoney(sum.card)}` : 'بدون تسهیلات فعال', onClick: () => toggle('facility'), active: more.facility },
    {
      label: 'بسته در انتظار پذیرش', value: faDigits(sum.nPending), unit: 'نفر', note: sum.nPending ? `${faDigits(sum.pending)} بسته هنوز پذیرفته نشده` : 'همه‌ی بسته‌ها پذیرفته شده',
      trend: sum.nPending ? 'warn' : undefined, onClick: () => toggle('pending'), active: more.pending,
    },
  ];

  const columns: Column<Employee>[] = [
    {
      key: 'emp', label: 'کارمند', width: 'minmax(0, 1.6fr)',
      render: (e) => <Ident lead={<Ava letter={e.avatarLetter} id={e.id} />} title={e.fullName} sub={<>{e.department} · <span className="num">{faDigits(e.employeeCode)}</span></>} />,
    },
    {
      key: 'assets', label: 'دارایی (تومان)', width: '136px', col: true,
      render: (e) => { const v = valueOf(e, f[e.id]); return <><span className="num">{money(v.portfolio)}</span><span style={{ width: 100 }}><LockBar free={v.free} locked={v.locked} height={4} /></span></>; },
    },
    {
      key: 'locked', label: 'قفل‌شده (تومان)', width: '124px', col: true,
      render: (e) => {
        const v = valueOf(e, f[e.id]);
        return v.locked > 0
          ? <><span className="num">{money(v.locked)}</span><span className="sm num">{pct(v.portfolio ? (v.locked * 100) / v.portfolio : 0)} دارایی</span></>
          : <span className="sm">همه آزاد</span>;
      },
    },
    {
      key: 'pending', label: 'بسته در انتظار', width: '96px',
      render: (e) => { const n = f[e.id]?.pendingPackages ?? 0; return n ? <Pill tone="warning">{faDigits(n)} بسته</Pill> : <span style={{ color: 'var(--text-disabled)' }}>—</span>; },
    },
    {
      key: 'fac', label: 'وام/اعتبار', width: '76px',
      render: (e) => {
        const x = f[e.id];
        const loan = !!x?.loanActive;
        const card = !!x?.cardLimit;
        if (!loan && !card) return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
        return (
          <span style={{ display: 'flex', gap: 4 }}>
            {loan && <span title="وام فعال"><Tile d={I.percent} tone="info" size="sm" /></span>}
            {card && <span title="اعتبار کارت"><Tile d={I.credit} tone="primary" size="sm" /></span>}
          </span>
        );
      },
    },
    { key: 'st', label: 'وضعیت', width: '136px', render: (e) => <Pill tone={EMP_TONE[e.status]} dot>{EMP_STATUS[e.status].label}</Pill> },
  ];

  return (
    <>
      <PageHeading title="کارکنان" crumbs={[{ label: 'عملیات' }]} sub="کارکنان سازمان، دارایی آزاد و قفل‌شده، تسهیلات و بسته‌های دریافتی">
        <Link href={routes.org.employeeNew + '?tab=excel'} className="nm-btn ghost"><Icon d={I.upload} size={17} />ورود از اکسل</Link>
        <Link href={routes.org.employeeNew} className="nm-btn"><Icon d={I.plus} size={17} strokeWidth={2} />افزودن کارمند</Link>
      </PageHeading>

      <StatStrip loading={all.isLoading || facts.isLoading} items={stats} />

      <Card flush>
        <Toolbar>
          {selected.length > 0 ? (
            <BulkBar count={selected.length} onClear={() => setSelected([])}>
              <button type="button" className="nm-btn sm" disabled={pkg.pending} onClick={() => pkg.start(selected)}><Icon d={I.pkg} size={15} />ارسال بسته</button>
              <button type="button" className="nm-btn sm line danger" onClick={() => setSuspendIds(selected)}><Icon d={I.ban} size={15} />تعلیق</button>
            </BulkBar>
          ) : (
            <>
              <Tabs label="وضعیت کارمند" value={tab} onChange={setTab} items={TABS.map((t) => ({ ...t, count: counts[t.key] }))} />
              <span className="grow" />
              <Select label="واحد" prefix="واحد" value={dept} onChange={setDept} align="end"
                options={[{ key: 'all', label: 'همه واحدها', count: everyone.length }, ...departments.map((d) => ({ key: d, label: d, count: everyone.filter((e) => e.department === d).length }))]} />
              <SearchField value={q} onChange={setQ} placeholder="نام، کد پرسنلی یا کد ملی" label="جستجوی کارمند" width={220} />
            </>
          )}
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(e) => e.id} rowLabel={(e) => e.fullName}
          onRowClick={(e) => setPicked((s) => (s === e.id ? null : e.id))} selectedKey={picked}
          select={{ selected, onChange: setSelected, label: (e) => `انتخاب ${e.fullName}` }}
          loading={list.isLoading} error={list.isError ? list.error : undefined} onRetry={() => list.refetch()}
          empty={filtered
            ? <Empty icon={I.search} title="کارمندی با این مشخصات پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clearFilters}>پاک کردن فیلترها</button>} />
            : <Empty icon={I.user} title="هنوز کارمندی ثبت نشده است" sub="کارکنان را یکی‌یکی یا با فایل اکسل اضافه کنید." action={<Link href={routes.org.employeeNew} className="nm-btn sm">افزودن کارمند</Link>} />}
          minWidth={860}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="کارمند" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {pickedEmp && (
        <EmployeeInspector
          key={pickedEmp.id}
          emp={pickedEmp}
          facts={f[pickedEmp.id]}
          onClose={() => setPicked(null)}
          sending={pkg.pending}
          busy={update.isPending}
          onSendPackage={() => pkg.start([pickedEmp.id])}
          onSuspend={() => setSuspendIds([pickedEmp.id])}
          onReactivate={() => setStatus(pickedEmp, 'active', `تعلیق حساب ${pickedEmp.fullName} برداشته شد`)}
        />
      )}

      <Confirm
        open={!!suspendIds} onClose={() => setSuspendIds(null)} onConfirm={doSuspend} danger busy={update.isPending || bulk.isPending}
        title={suspendTarget ? `تعلیق حساب ${suspendTarget.fullName}؟` : `تعلیق حساب ${faDigits(suspendIds?.length ?? 0)} کارمند؟`}
        confirmLabel="تعلیق حساب"
        body={<SuspendNotice />}
      />
    </>
  );
}
