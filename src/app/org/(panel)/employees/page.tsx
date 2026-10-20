'use client';
/** Employees list + profile side panel (design: org-employees). */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/app/Screen';
import { useOrgEmployees, useOrgMe, useUpdateEmployee } from '@/api/org';
import { useBulkEmployeeStatus, useOrgPeopleFacts } from '@/api/org-people-extra';
import type { Employee } from '@/types/domain';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, money, pct } from '@/lib/format';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { Chip, Dialog, EMP_STATUS, I, MenuItem, Popover, avOf, errMsg, million, tone } from '@/components/org/people/shared';
import { EmployeeSidePanel } from '@/components/org/people/EmployeeSidePanel';
import { useStartPackage } from '@/components/org/people/useStartPackage';
import './page.css';

type Tab = 'all' | Employee['status'];
const COLS = '28px minmax(0, 1fr) 116px 66px 36px 56px 104px 28px';
const TABS: { key: Tab; label: string; t: [string, string] }[] = [
  { key: 'all', label: 'همه', t: ['var(--contained-default)', 'var(--contained-default-text)'] },
  { key: 'active', label: 'فعال', t: tone('success') },
  { key: 'invited', label: 'در انتظار', t: tone('warning') },
  { key: 'inactive', label: 'تعلیق', t: tone('error') },
];

export default function OrgEmployeesPage() {
  const { show, node: toast } = usePanelToast();
  const me = useOrgMe();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [dept, setDept] = useState('all');
  const [tab, setTab] = useState<Tab>('all');
  const [more, setMore] = useState({ locked: false, facility: false, pending: false });
  const [menu, setMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(7);
  const [suspendIds, setSuspendIds] = useState<string[] | null>(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(enDigits(q.trim())), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(0); }, [debounced, dept, tab, more, perPage]);

  const all = useOrgEmployees();
  const list = useOrgEmployees({ q: debounced || undefined, department: dept === 'all' ? undefined : dept });
  const facts = useOrgPeopleFacts();
  const update = useUpdateEmployee();
  const bulk = useBulkEmployeeStatus();
  const pkg = useStartPackage((e) => show(errMsg(e), 'error'));

  const departments = useMemo(() => [...new Set((all.data ?? []).map((e) => e.department))], [all.data]);
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
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * perPage, cur * perPage + perPage);
  const pickedEmp = (picked && base.find((e) => e.id === picked)) || visible[0] || base[0];
  const moreCount = Object.values(more).filter(Boolean).length;
  const allOnPage = visible.length > 0 && visible.every((e) => selected.includes(e.id));

  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const togglePage = () => setSelected((s) => (allOnPage ? s.filter((id) => !visible.some((e) => e.id === id)) : [...new Set([...s, ...visible.map((e) => e.id)])]));

  const setStatus = (e: Employee, status: Employee['status'], msg: string) =>
    update.mutate({ id: e.id, status }, { onSuccess: () => show(msg), onError: (err) => show(errMsg(err), 'error') });

  const doSuspend = () => {
    const ids = suspendIds ?? [];
    if (ids.length === 1) {
      const e = base.find((x) => x.id === ids[0]);
      if (e) setStatus(e, 'inactive', `حساب ${e.fullName} تعلیق شد`);
    } else if (ids.length > 1) {
      bulk.mutate({ ids, status: 'inactive' }, { onSuccess: (r) => { show(`${faDigits(r.updated)} حساب تعلیق شد`); setSelected([]); }, onError: (err) => show(errMsg(err), 'error') });
    }
    setSuspendIds(null);
  };
  const suspendTarget = suspendIds?.length === 1 ? base.find((e) => e.id === suspendIds[0]) : undefined;

  const filterBtn = (label: string, value: string, open: boolean, onClick: () => void) => (
    <button onClick={onClick} aria-haspopup="menu" aria-expanded={open} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, width: 128, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'right' }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}><span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span></span>
      <Icon d={I.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
    </button>
  );

  return (
    <div className="pg-emps" style={{ margin: -24, flex: '1 0 0', minHeight: 640, display: 'flex', flexDirection: 'row' }}>
      <section style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        <PageHeading title="کارکنان" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'کارکنان' }]}>
          <Link href={routes.org.employeeNew + '?tab=excel'} className="btn" style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>
            <Icon d={I.download} size={18} />ورود از اکسل
          </Link>
          <Link href={routes.org.employeeNew} className="btn" style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', textDecoration: 'none' }}>
            <Icon d={I.plus} size={18} strokeWidth={2} />افزودن کارمند
          </Link>
        </PageHeading>

        {/* Toolbar */}
        <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, height: 44, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
            <Icon d={I.search} size={18} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام یا کد پرسنلی…" aria-label="جستجوی کارمند" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)' }} />
            {list.isFetching && debounced && <span style={{ fontSize: 11 }}>…</span>}
          </label>
          <Popover open={menu === 'dept'} onOpenChange={(o) => setMenu(o ? 'dept' : null)} width={180} trigger={filterBtn('واحد', dept === 'all' ? 'همه واحدها' : dept, menu === 'dept', () => setMenu(menu === 'dept' ? null : 'dept'))}>
            <MenuItem on={dept === 'all'} onClick={() => { setDept('all'); setMenu(null); }}>همه واحدها</MenuItem>
            {departments.map((d) => <MenuItem key={d} on={dept === d} onClick={() => { setDept(d); setMenu(null); }}>{d}</MenuItem>)}
          </Popover>
          <Popover open={menu === 'status'} onOpenChange={(o) => setMenu(o ? 'status' : null)} width={180} trigger={filterBtn('وضعیت', TABS.find((t) => t.key === tab)!.label, menu === 'status', () => setMenu(menu === 'status' ? null : 'status'))}>
            {TABS.map((t) => <MenuItem key={t.key} on={tab === t.key} onClick={() => { setTab(t.key); setMenu(null); }}>{t.key === 'all' ? 'همه' : EMP_STATUS[t.key].label}</MenuItem>)}
          </Popover>
          <Popover open={menu === 'more'} onOpenChange={(o) => setMenu(o ? 'more' : null)} width={240} align="end" trigger={
            <button className="ibtn" aria-label="فیلترهای بیشتر" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')} style={{ position: 'relative', width: 44, height: 44, borderRadius: 8, border: `1px solid ${moreCount ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'var(--card-bg)', color: moreCount ? 'var(--primary-text)' : undefined }}>
              <Icon d={I.filters} size={20} />
              {!!moreCount && <span style={{ position: 'absolute', top: -6, left: -6, minWidth: 18, height: 18, borderRadius: 9, background: 'var(--primary-main)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{faDigits(moreCount)}</span>}
            </button>
          }>
            <MenuItem on={more.locked} onClick={() => setMore((m) => ({ ...m, locked: !m.locked }))}>فقط دارای دارایی قفل‌شده</MenuItem>
            <MenuItem on={more.facility} onClick={() => setMore((m) => ({ ...m, facility: !m.facility }))}>فقط دارای وام یا اعتبار</MenuItem>
            <MenuItem on={more.pending} onClick={() => setMore((m) => ({ ...m, pending: !m.pending }))}>فقط دارای بسته در انتظار</MenuItem>
            {!!moreCount && <MenuItem onClick={() => setMore({ locked: false, facility: false, pending: false })}>پاک کردن فیلترها</MenuItem>}
          </Popover>
        </div>

        {/* Table card */}
        <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--divider)' }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              const [lbg, lfg] = on ? t.t : t.key === 'all' ? tone('default') : t.t;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 8, border: 0, background: on ? 'var(--action-selected)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>
                  {t.label}<span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: lbg, color: lfg }}>{faDigits(counts[t.key])}</span>
                </button>
              );
            })}
            <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {faDigits(selected.length)} انتخاب‌شده
              {!!selected.length && (
                <>
                  <button className="btn" disabled={pkg.pending} onClick={() => pkg.start(selected)} style={{ height: 28, padding: '0 10px', fontSize: 12, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}><Icon d={I.pkg} size={14} />ارسال بسته</button>
                  <button className="btn" onClick={() => setSuspendIds(selected)} style={{ height: 28, padding: '0 10px', fontSize: 12, background: 'transparent', color: 'var(--error-text)' }}><Icon d={I.ban} size={14} />تعلیق</button>
                  <button className="ibtn" aria-label="لغو انتخاب" onClick={() => setSelected([])} style={{ width: 28, height: 28 }}><Icon d={I.x} size={14} /></button>
                </>
              )}
            </span>
          </div>
          <div style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 12px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 11, fontWeight: 700 }}>
            <span style={{ display: 'grid', placeItems: 'center' }}>
              <button aria-label="انتخاب همه ردیف‌های صفحه" aria-pressed={allOnPage} onClick={togglePage} className={'chk' + (allOnPage ? ' on' : '')} style={{ width: 16, height: 16, padding: 0, cursor: 'pointer', background: allOnPage ? undefined : 'transparent' }}>{allOnPage && <Icon d={I.check} size={12} strokeWidth={3} />}</button>
            </span>
            <span className="cell" style={{ paddingRight: 6 }}>کارمند</span><span className="cell">دارایی · آزاد/قفل</span><span className="cell">قفل‌شده</span><span className="cell">بسته‌ها</span><span className="cell">وام/اعتبار</span><span className="cell">وضعیت</span><span />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {list.isError && <div style={{ padding: 16 }}><ErrorState message={errMsg(list.error)} onRetry={() => list.refetch()} /></div>}
            {list.isLoading && Array.from({ length: perPage }, (_, i) => <div key={i} style={{ height: 48, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
            {!list.isLoading && !rows.length && !list.isError && (
              <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>کارمندی با این مشخصات پیدا نشد.</div>
            )}
            {visible.map((e, idx) => {
              const x = f[e.id];
              const portfolio = x?.portfolio ?? e.portfolioValue;
              const locked = x?.locked ?? e.lockedValue;
              const free = Math.max(0, portfolio - locked);
              const freePct = portfolio ? Math.round((free * 1000) / portfolio) / 10 : 100;
              const isPicked = pickedEmp?.id === e.id;
              const isSel = selected.includes(e.id);
              const [avBg, avFg] = avOf(e.id);
              const st = EMP_STATUS[e.status];
              const hasLoan = !!x?.loanActive;
              const hasCard = !!x?.cardLimit;
              return (
                <div key={e.id} role="row" aria-selected={isPicked} onClick={() => setPicked(e.id)} className="emp-row" style={{ height: 48, display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 12px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: isPicked ? 'var(--nav-active)' : undefined, cursor: 'pointer' }}>
                  <span style={{ display: 'grid', placeItems: 'center' }}>
                    <button aria-label={`انتخاب ${e.fullName}`} aria-pressed={isSel} onClick={(ev) => { ev.stopPropagation(); toggleSel(e.id); }} style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? 'var(--primary-main)' : 'var(--grey-500)'}`, background: isSel ? 'var(--primary-main)' : 'transparent', color: '#FFFFFF', boxSizing: 'border-box', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer' }}>
                      {isSel && <Icon d={I.check} size={12} strokeWidth={3} />}
                    </button>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingRight: 6 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{e.avatarLetter}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span className="cell" style={{ fontWeight: 600 }}>{e.fullName}</span><span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{e.department} · {faDigits(e.employeeCode)}</span></span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, paddingLeft: 12 }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 400, whiteSpace: 'nowrap' }}>{money(portfolio)}</span>
                    <div className="lkbar" role="img" aria-label={`آزاد ${money(free)} · قفل ${money(locked)}`} style={{ height: 4 }}>
                      {(free > 0 || !portfolio) && <span className="f" style={{ width: locked ? `${freePct}%` : '100%' }} />}
                      {locked > 0 && <span className="l" style={{ flex: 1 }} />}
                    </div>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
                    {locked > 0 ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}><Icon d={I.lock} size={11} style={{ color: 'var(--text-secondary)' }} /><span className="num" style={{ fontWeight: 500 }}>{million(locked)}</span></span>
                        <span className="num" style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400, whiteSpace: 'nowrap' }}>میلیون · {pct(portfolio ? (locked * 100) / portfolio : 0)}</span>
                      </>
                    ) : <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>همه آزاد</span>}
                  </span>
                  <span><Chip t={x?.pendingPackages ? 'warning' : 'default'}>{faDigits(x?.pendingPackages ?? 0)}</Chip></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {hasLoan || hasCard ? (
                      <>
                        <span title="وام" style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: hasLoan ? 'var(--soft-primary)' : 'transparent', color: hasLoan ? 'var(--primary-text)' : 'var(--text-disabled)' }}><Icon d={I.percent} size={14} /></span>
                        <span title="اعتبار کارت" style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: hasCard ? 'var(--soft-success)' : 'transparent', color: hasCard ? 'var(--success-text)' : 'var(--text-disabled)' }}><Icon d={I.credit} size={14} /></span>
                      </>
                    ) : <span style={{ color: 'var(--text-disabled)', paddingRight: 8 }}>—</span>}
                  </span>
                  <span><Chip t={st.tone} style={{ padding: '0 6px' }}>{st.label}</Chip></span>
                  <span style={{ display: 'grid', placeItems: 'center' }} onClick={(ev) => ev.stopPropagation()}>
                    <Popover open={menu === 'row-' + e.id} onOpenChange={(o) => setMenu(o ? 'row-' + e.id : null)} width={180} align="end" up={idx >= 3 && idx >= visible.length - 3} trigger={
                      <button className="ibtn" aria-label={`عملیات ${e.fullName}`} aria-haspopup="menu" onClick={() => setMenu(menu === 'row-' + e.id ? null : 'row-' + e.id)} style={{ width: 28, height: 28 }}><Icon d={I.kebab} size={18} strokeWidth={2.2} /></button>
                    }>
                      <Link href={routes.org.employee(e.id)} className="trow" style={{ display: 'flex', alignItems: 'center', minHeight: 36, padding: '0 10px', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)' }}>مشاهده پروفایل</Link>
                      <MenuItem disabled={e.status === 'inactive' || pkg.pending} onClick={() => { setMenu(null); pkg.start([e.id]); }}>ارسال بسته</MenuItem>
                      {e.status === 'inactive'
                        ? <MenuItem onClick={() => { setMenu(null); setStatus(e, 'active', `تعلیق حساب ${e.fullName} برداشته شد`); }}>رفع تعلیق</MenuItem>
                        : <MenuItem danger onClick={() => { setMenu(null); setSuspendIds([e.id]); }}>تعلیق حساب</MenuItem>}
                    </Popover>
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ whiteSpace: 'nowrap' }}>ردیف در صفحه:</span>
            <Popover open={menu === 'per'} onOpenChange={(o) => setMenu(o ? 'per' : null)} width={96} up trigger={
              <button onClick={() => setMenu(menu === 'per' ? null : 'per')} aria-haspopup="menu" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 8px', borderRadius: 6, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer' }}>{faDigits(perPage)}<Icon d={I.chevD} size={14} /></button>
            }>
              {[7, 10, 20].map((n) => <MenuItem key={n} on={perPage === n} onClick={() => { setPerPage(n); setMenu(null); }}>{faDigits(n)}</MenuItem>)}
            </Popover>
            <span className="num" style={{ marginRight: 'auto', fontWeight: 400, whiteSpace: 'nowrap' }}>{rows.length ? `${faDigits(cur * perPage + 1)}–${faDigits(cur * perPage + visible.length)} از ${faDigits(rows.length)}` : '۰ از ۰'}</span>
            <button className="ibtn" aria-label="صفحه قبل" disabled={cur === 0} onClick={() => setPage(cur - 1)} style={{ width: 32, height: 32, color: cur > 0 ? 'var(--text-primary)' : undefined }}><Icon d={I.chevR} size={18} /></button>
            <button className="ibtn" aria-label="صفحه بعد" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} style={{ width: 32, height: 32, color: cur < pages - 1 ? 'var(--text-primary)' : undefined }}><Icon d={I.chevL} size={18} /></button>
          </div>
        </div>
      </section>

      {pickedEmp ? (
        <EmployeeSidePanel
          key={pickedEmp.id}
          emp={pickedEmp}
          facts={f[pickedEmp.id]}
          sending={pkg.pending}
          onSendPackage={() => pkg.start([pickedEmp.id])}
          onSuspend={() => setSuspendIds([pickedEmp.id])}
          onReactivate={() => setStatus(pickedEmp, 'active', `تعلیق حساب ${pickedEmp.fullName} برداشته شد`)}
        />
      ) : (
        <aside className="glass" style={{ width: 360, flex: 'none', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--divider)', boxShadow: 'none', padding: 20 }} />
      )}

      {suspendIds && (
        <Dialog label={suspendTarget ? `تعلیق حساب ${suspendTarget.fullName}` : 'تعلیق حساب کارکنان'} title={suspendTarget ? `تعلیق حساب ${suspendTarget.fullName}` : `تعلیق حساب ${faDigits(suspendIds.length)} کارمند`} onClose={() => setSuspendIds(null)}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>با تعلیق، دسترسی کارمند به اپ محدود می‌شود، بسته‌های تأیید‌نشده به حساب سازمان بازمی‌گردند و درخواست‌های وام و اعتبار جدید مسدود می‌شوند. دارایی‌های فعلی او دست‌نخورده می‌ماند.</span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, lineHeight: 1.5 }}>
            <Icon d={I.warn} size={18} style={{ marginTop: 1 }} />
            <span>تسهیلات فعال کارمند طبق قرارداد ادامه می‌یابد؛ در صورت ۲ قسط معوق، وثیقه نقد می‌شود.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
            <button className="btn" onClick={doSuspend} style={{ background: 'var(--error-main)', color: 'var(--error-contrast)' }}>تعلیق حساب</button>
            <button className="btn" onClick={() => setSuspendIds(null)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>انصراف</button>
          </div>
        </Dialog>
      )}
      {toast}
    </div>
  );
}
