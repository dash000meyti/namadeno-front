'use client';
/** Design: org-package-recipients.dc.html — wizard step 1: pick the recipients. */
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useCreatePackage, useOrgEmployees, useOrgPackage, useUpdatePackage } from '@/api/org';
import { routes } from '@/lib/routes';
import { faDigits, jMonthYear, money } from '@/lib/format';
import type { Employee } from '@/types/domain';
import { now } from '@/lib/clock';
import { AV, I, jParts, monthName, soft } from '@/components/org/packages/meta';
import { WizardHeader } from '@/components/org/packages/Stepper';
import { CardError, Chk, Notice, Pager, errMsg, useFlash } from '@/components/org/packages/ui';

const GRID = '36px minmax(0, 1fr) 84px 104px 84px 92px';
const PAGE = 8;
const UNIT_COLORS = ['--chart-1', '--chart-2', '--chart-3', '--warning-main', '--chart-4', '--chart-5', '--primary-light', '--grey-500'];
const STATUS: Record<Employee['status'], { s: string; tone: 'success' | 'warning' | 'error' }> = {
  active: { s: 'فعال', tone: 'success' },
  invited: { s: 'در انتظار', tone: 'warning' },
  inactive: { s: 'تعلیق', tone: 'error' },
};
type Mode = 'all' | 'unit' | 'manual';

function RecipientsStep() {
  const router = useRouter();
  const sp = useSearchParams();
  const draftId = sp.get('draft') ?? '';
  const { data: emps, isLoading, isError, refetch } = useOrgEmployees();
  const { data: draft, isLoading: draftLoading } = useOrgPackage(draftId);
  const create = useCreatePackage();
  const update = useUpdatePackage();
  const { flash, toast } = useFlash();

  const [mode, setMode] = useState<Mode>('all');
  const [dept, setDept] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
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
  const visible = list.filter((e) => !text || e.fullName.includes(text) || e.employeeCode.includes(text) || e.department.includes(text));
  const visibleActive = visible.filter((e) => e.status === 'active');
  const pageRows = visible.slice(page * PAGE, page * PAGE + PAGE);
  const nSel = visibleActive.filter((e) => selected.has(e.id)).length;
  const allChecked = visibleActive.length > 0 && nSel === visibleActive.length;
  const someChecked = nSel > 0 && !allChecked;

  const toggle = (e: Employee) => {
    if (e.status !== 'active') { flash(`${e.fullName} در وضعیت «${STATUS[e.status].s}» است و قابل انتخاب نیست`, 'error'); return; }
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
    const onError = (e: unknown) => flash(errMsg(e), 'error');
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

  return (
    <>
      <WizardHeader step={1} crumb="انتخاب گیرندگان" draftId={draft ? draftId : undefined} />

      {locked && (
        <Notice tone="warning" d={I.warn}>این بسته قبلاً ارسال شده و قابل ویرایش نیست. <Link href={routes.org.package(draftId)} style={{ fontWeight: 700 }}>مشاهده بسته</Link></Notice>
      )}

      <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Summary (right) */}
        <div className="card" style={{ width: 300, flex: 'none', boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 0 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>گیرندگان بسته</h6>
          <div style={{ boxSizing: 'border-box', padding: 14, borderRadius: 12, background: 'var(--soft-primary)', display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.2 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>انتخاب‌شده</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 28 }}>{faDigits(chosen.length)}</span><span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>نفر</span></span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{countNote}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {byUnit.map((u, i) => (
              <div key={u.label} style={{ height: 34, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(${UNIT_COLORS[i % UNIT_COLORS.length]})`, flex: 'none' }} />
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{u.label}</span>
                <span className="num" style={{ fontWeight: 500 }}>{faDigits(u.count)}</span>
              </div>
            ))}
            {!byUnit.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0' }}>هنوز کسی انتخاب نشده است.</span>}
          </div>
          <Notice tone="info">کارکنان در وضعیت «تعلیق» یا «در انتظار فعال‌سازی» به‌صورت خودکار از فهرست خارج می‌شوند.</Notice>
          {err && <Notice tone="error" d={I.warn}>{err}</Notice>}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" onClick={next} disabled={busy || locked || !inited} style={{ height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: busy || locked ? 0.7 : 1 }}>
              {busy ? 'در حال ذخیره…' : 'مرحله بعد: تنظیمات بسته'}<Icon d={I.chevL} size={18} strokeWidth={2} />
            </button>
            <Link href={routes.org.packages} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}>انصراف</Link>
          </div>
        </div>

        {/* Picker (left, wide) */}
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ minHeight: 60, flex: 'none', boxSizing: 'border-box', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)', flexWrap: 'wrap' }}>
            {([['all', 'همه کارکنان'], ['unit', 'واحد'], ['manual', 'انتخاب دستی']] as const).map(([k, label]) => {
              const on = mode === k;
              return (
                <button key={k} aria-pressed={on} onClick={() => pickMode(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 999, border: `1px solid ${on ? 'transparent' : 'var(--outline-border)'}`, background: on ? 'var(--soft-primary)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {on && <Icon d={I.check} size={14} strokeWidth={2.5} />}{label}
                </button>
              );
            })}
            {mode === 'unit' && (
              <span className="fld" style={{ height: 36, padding: '0 10px', width: 150 }}>
                <select value={dept} onChange={(e) => pickDept(e.target.value)} aria-label="انتخاب واحد" style={{ fontSize: 13 }}>
                  {depts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </span>
            )}
            <label style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8, height: 40, width: 240, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
              <Icon d={I.search} size={18} />
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="جستجوی نام یا کد پرسنلی…" aria-label="جستجوی کارمند" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--text-primary)' }} />
            </label>
          </div>
          <div className="th" style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 12px' }}>
            <button aria-label="انتخاب همه" aria-pressed={allChecked} onClick={toggleAll} style={{ border: 0, background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Chk on={allChecked} some={someChecked} /></button>
            <span className="cell">کارمند</span><span className="cell">واحد</span><span className="cell">دارایی کل</span><span className="cell">وضعیت</span><span className="cell">آخرین بسته</span>
          </div>
          {isLoading && [0, 1, 2, 3, 4].map((i) => <div key={i} style={{ height: 46, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
          {isError && <div style={{ padding: 16 }}><CardError onRetry={() => refetch()} /></div>}
          {!isLoading && !pageRows.length && !isError && <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>کارمندی پیدا نشد</div>}
          {pageRows.map((e) => {
            const on = selected.has(e.id) && e.status === 'active';
            const sd = STATUS[e.status];
            const st = soft(sd.tone);
            const av = AV[list.indexOf(e) % AV.length];
            return (
              <div key={e.id} style={{ height: 46, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 8, padding: '0 12px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: on ? 'var(--nav-active)' : 'transparent', opacity: e.status === 'active' ? 1 : 0.7 }}>
                <button aria-label={`انتخاب ${e.fullName}`} aria-pressed={on} onClick={() => toggle(e)} style={{ border: 0, background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: e.status === 'active' ? 'pointer' : 'not-allowed', height: 36 }}><Chk on={on} /></button>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: av[0], color: av[1], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{e.avatarLetter}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span className="cell" style={{ fontWeight: 600 }}>{e.fullName}</span><span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{faDigits(e.employeeCode)}</span></span>
                </span>
                <span className="cell" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{e.department}</span>
                <span className="num cell" style={{ fontWeight: 400 }}>{money(e.portfolioValue)}</span>
                <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: st.bg, color: st.fg }}>{sd.s}</span></span>
                <span className="num cell" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{e.lastPackageAt ? jMonthYear(e.lastPackageAt) : '—'}</span>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          <Pager page={page} pageSize={PAGE} total={visible.length} onPage={setPage} />
        </div>
      </div>
      {toast}
    </>
  );
}

export default function NewPackageRecipientsPage() {
  return <Suspense fallback={null}><RecipientsStep /></Suspense>;
}
