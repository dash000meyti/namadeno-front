'use client';
/** Requests inbox with decision drawer (design: org-requests). */
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/app/Screen';
import { useDecideOrgRequest, useOrgMe } from '@/api/org';
import { useOrgPeopleRequests, useReopenOrgRequest, type RequestRow } from '@/api/org-people-extra';
import type { RequestKind } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDate, jDateTime, jDayMonth, money, pct } from '@/lib/format';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { Chip, Dialog, I, LockChip, MsSeg, REQ_KIND, avOf, downloadCsv, errMsg, tone, type ToneName } from '@/components/org/people/shared';
import './page.css';

type Tab = 'all' | RequestKind;
const TABS: { key: Tab; label: string; t: ToneName }[] = [
  { key: 'all', label: 'همه', t: 'default' },
  { key: 'loan', label: 'وام', t: 'primary' },
  { key: 'cash_withdrawal', label: 'برداشت نقدی', t: 'info' },
  { key: 'credit_increase', label: 'اعتبار', t: 'warning' },
  { key: 'milestone_release', label: 'تأیید مرحله', t: 'primary' },
];
const COLS = '124px 80px 92px 1fr 56px 88px';
const PER_PAGE = 8;

function statusOf(r: RequestRow): { label: string; t: ToneName } {
  if (r.status === 'approved') return { label: 'تأیید شد', t: 'success' };
  if (r.status === 'rejected') return { label: 'رد شد', t: 'error' };
  return r.checks.some((c) => !c.ok) ? { label: 'نیاز به بررسی', t: 'warning' } : { label: 'در انتظار', t: 'info' };
}
const msText = (r: RequestRow) => {
  const m = r.milestone;
  if (!m) return '';
  const rel = m.steps.filter((s) => s.status === 'released');
  return `${faDigits(rel.length)} از ${faDigits(m.stepCount)} مرحله · ${pct(rel.reduce((s, x) => s + x.sharePct, 0))} آزاد شده`;
};

function Requests() {
  const sp = useSearchParams();
  const me = useOrgMe();
  const q = useOrgPeopleRequests();
  const decide = useDecideOrgRequest();
  const reopen = useReopenOrgRequest();
  const { show, node: toast } = usePanelToast();
  const initialType = sp.get('type');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialType) ? (initialType as Tab) : 'all');
  const [picked, setPicked] = useState<string | null>(sp.get('id'));
  const [page, setPage] = useState(0);
  const [dlg, setDlg] = useState<{ r: RequestRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');

  useEffect(() => { setPage(0); }, [tab]);

  const items = q.data?.items ?? [];
  const rows = tab === 'all' ? items : items.filter((r) => r.kind === tab);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * PER_PAGE, cur * PER_PAGE + PER_PAGE);
  const sel = items.find((r) => r.id === picked) ?? visible[0] ?? items[0];
  const pendingN = items.filter((r) => r.status === 'pending').length;
  const count = (k: Tab) => (k === 'all' ? items.length : items.filter((r) => r.kind === k).length);

  // keep the picked request visible when it is deep-linked
  useEffect(() => {
    if (!picked || !q.data) return;
    const idx = rows.findIndex((r) => r.id === picked);
    if (idx >= 0) setPage(Math.floor(idx / PER_PAGE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const open = (r: RequestRow, approve: boolean) => { setNote(''); setNoteErr(''); setDlg({ r, approve }); };
  const confirm = () => {
    if (!dlg) return;
    const { r, approve } = dlg;
    const text = note.trim();
    if (!approve && text.length < 3) { setNoteErr(r.kind === 'milestone_release' ? 'موارد نیازمند اصلاح را بنویسید' : 'دلیل رد را بنویسید'); return; }
    const ms = r.kind === 'milestone_release';
    decide.mutate({ id: r.id, approve, note: text || undefined }, {
      onSuccess: () => {
        setDlg(null);
        if (approve && ms && r.milestone) show(`مرحله ${faDigits(r.milestone.stepIndex)} تأیید شد · ${money(r.milestone.amount)} تومان آزاد شد · ${r.requesterName}`);
        else if (approve) show(`درخواست ${r.requesterName} تأیید شد`);
        else show(ms ? `درخواست اصلاح برای ${r.requesterName} ارسال شد` : `درخواست ${r.requesterName} رد شد`, 'info');
      },
      onError: (e) => show(errMsg(e), 'error'),
    });
  };
  const undo = (r: RequestRow) => reopen.mutate(r.id, { onSuccess: () => show(`تصمیم درخواست ${r.requesterName} بازگردانی شد`, 'info'), onError: (e) => show(errMsg(e), 'error') });

  const exportList = () => {
    downloadCsv('namadno-requests.csv', [
      ['شناسه', 'کارمند', 'واحد', 'نوع', 'عنوان', 'مبلغ (تومان)', 'منبع / قفل', 'تاریخ', 'وضعیت', 'توضیح'],
      ...rows.map((r) => [r.id, r.requesterName, r.employee?.department ?? '', REQ_KIND[r.kind].label, r.title, r.amount ?? '', r.source, jDate(r.createdAt), statusOf(r).label, r.note ?? '']),
    ]);
    show('خروجی اکسل درخواست‌ها آماده شد');
  };

  const decidedText = (r: RequestRow) => {
    const ms = r.kind === 'milestone_release';
    if (r.status === 'approved') return ms && r.milestone ? `مرحله ${faDigits(r.milestone.stepIndex)} تأیید شد · ${money(r.milestone.amount)} آزاد شد` : 'درخواست تأیید شد و به کارمند اطلاع داده شد';
    return ms ? 'درخواست اصلاح برای کارمند ارسال شد' : 'درخواست رد شد';
  };

  return (
    <div className="pg-oreq" style={{ margin: -24, flex: '1 0 0', minHeight: 640, display: 'flex', flexDirection: 'row' }}>
      <section style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        <PageHeading title="درخواست‌ها" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'درخواست‌ها' }]}>
          {q.data?.avgResponseDays != null && <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>میانگین زمان پاسخ: {faDigits(String(q.data.avgResponseDays), true)} روز</span>}
          <button className="btn" onClick={exportList} disabled={!rows.length} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}><Icon d={I.download} size={18} />خروجی</button>
        </PageHeading>

        <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)', overflowX: 'auto' }}>
            {TABS.map((t) => {
              const on = tab === t.key;
              const [lbg, lfg] = on ? ['var(--contained-default)', 'var(--contained-default-text)'] : tone(t.t);
              return (
                <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={on} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 10px', borderRadius: 8, border: 0, background: on ? 'var(--action-selected)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {t.label}<span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: lbg, color: lfg }}>{faDigits(count(t.key))}</span>
                </button>
              );
            })}
            <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', paddingRight: 8 }}>{faDigits(pendingN)} در انتظار تصمیم</span>
          </div>
          <div className="th" style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 8, padding: '0 14px' }}>
            <span className="cell">کارمند</span><span className="cell">نوع</span><span className="cell">مبلغ</span><span className="cell">منبع / قفل</span><span className="cell">تاریخ</span><span className="cell">وضعیت</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {q.isError && <div style={{ padding: 16 }}><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></div>}
            {q.isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} style={{ height: 56, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
            {!q.isLoading && !rows.length && !q.isError && <div style={{ padding: '48px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>درخواستی در این دسته وجود ندارد.</div>}
            {visible.map((r) => {
              const [avBg, avFg] = avOf(r.requesterId);
              const k = REQ_KIND[r.kind];
              const st = statusOf(r);
              const on = sel?.id === r.id;
              return (
                <div key={r.id} role="row" aria-selected={on} tabIndex={0} onClick={() => setPicked(r.id)} onKeyDown={(e) => { if (e.key === 'Enter') setPicked(r.id); }} className="rq-row" style={{ height: 56, display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: on ? 'var(--nav-active)' : undefined, cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{r.requesterName[0]}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span className="cell" style={{ fontWeight: 600 }}>{r.requesterName}</span><span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.employee?.department ?? r.orgName}</span></span>
                  </span>
                  <span><Chip t={k.tone}>{k.label}</Chip></span>
                  <span className="num cell" style={{ fontWeight: 500 }}>{r.amount ? money(r.amount) : '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: r.sourceColor, flex: 'none' }} /><span className="cell" style={{ fontSize: 12 }}>{r.source}</span></span>
                  <span className="num cell" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{jDayMonth(r.createdAt)}</span>
                  <span><Chip t={st.t}>{st.label}</Chip></span>
                </div>
              );
            })}
          </div>
          <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)' }}>
            <span className="num" style={{ fontWeight: 400, whiteSpace: 'nowrap' }}>{rows.length ? `${faDigits(cur * PER_PAGE + 1)}–${faDigits(cur * PER_PAGE + visible.length)} از ${faDigits(rows.length)}` : '۰ از ۰'}</span>
            <button className="ibtn" aria-label="صفحه قبل" disabled={cur === 0} onClick={() => setPage(cur - 1)} style={{ marginRight: 'auto', width: 32, height: 32, color: cur > 0 ? 'var(--text-primary)' : undefined }}><Icon d={I.chevR} size={18} /></button>
            <button className="ibtn" aria-label="صفحه بعد" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} style={{ width: 32, height: 32, color: cur < pages - 1 ? 'var(--text-primary)' : undefined }}><Icon d={I.chevL} size={18} /></button>
          </div>
        </div>
      </section>

      {/* Request drawer */}
      <aside className="glass" aria-label="جزئیات درخواست" style={{ width: 340, flex: 'none', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--divider)', boxShadow: 'none', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        {!sel ? (
          <span style={{ margin: 'auto', fontSize: 13, color: 'var(--text-secondary)' }}>{q.isLoading ? 'در حال دریافت…' : 'درخواستی انتخاب نشده است.'}</span>
        ) : (() => {
          const st = statusOf(sel);
          const [avBg, avFg] = avOf(sel.requesterId);
          const ms = sel.kind === 'milestone_release';
          const busy = decide.isPending || reopen.isPending;
          const reversible = sel.status !== 'pending' && !(ms && sel.status === 'approved');
          return (
            <>
              <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>جزئیات درخواست</h6>
                <span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sel.id}</span>
                <Chip t={st.t} style={{ marginRight: 'auto' }}>{st.label}</Chip>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3, flex: 'none' }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{REQ_KIND[sel.kind].title} — {sel.requesterName}</span>
                {sel.amount ? <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 26, lineHeight: 1.1 }}>{money(sel.amount)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span></span> : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sel.title}</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--bg-neutral)', flex: 'none' }}>
                <span style={{ width: 44, height: 44, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 700, flex: 'none' }}>{sel.requesterName[0]}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{sel.requesterName}</span>
                  {sel.employee && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>واحد {sel.employee.department} · کد پرسنلی <span className="num" style={{ fontWeight: 400 }}>{faDigits(sel.employee.code)}</span></span>}
                  {sel.employee && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>دارایی کل <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(sel.employee.portfolio)}</span> · آزاد <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{money(sel.employee.free)}</span> · امتیاز <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{sel.employee.score ? faDigits(sel.employee.score) : '—'}</span></span>}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
                {sel.details.map((d) => (
                  <div key={d.label} style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px dashed var(--divider)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.label}</span>
                    <span className="num cell" style={{ marginRight: 'auto', fontWeight: 500, textAlign: 'left' }} title={d.value}>{d.value}</span>
                  </div>
                ))}
              </div>

              {ms && sel.milestone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--divider)', flex: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LockChip type="milestone" /><Link href={routes.org.package(sel.milestone.packageId)} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>مشاهده قرارداد</Link></div>
                  <MsSeg steps={sel.milestone.steps} label={msText(sel)} />
                  <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{msText(sel)}</span>
                </div>
              )}

              {!!sel.checks.length && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{ms ? 'پیش‌نیازهای آزادسازی' : 'بررسی قوانین قرارداد'}</span>
                  {sel.checks.map((c) => (
                    <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 10px', borderRadius: 10, background: c.ok ? 'var(--bg-neutral)' : 'var(--soft-error)' }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', background: c.ok ? 'var(--success-main)' : 'var(--error-main)', color: c.ok ? 'var(--success-contrast)' : 'var(--error-contrast)', flex: 'none' }}><Icon d={c.ok ? I.check : I.x} size={12} strokeWidth={3} /></span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {sel.note && (
                <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-neutral)', flex: 'none' }}>
                  <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>توضیح: </b>{sel.note}
                </div>
              )}

              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
                {sel.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={busy} onClick={() => open(sel, true)} style={{ flex: 1, height: 40, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)' }}><Icon d={I.check} size={18} strokeWidth={2.2} />{ms && sel.milestone ? `تأیید و آزادسازی ${pct(sel.milestone.sharePct)}` : 'تأیید'}</button>
                    <button className="btn" disabled={busy} onClick={() => open(sel, false)} style={{ flex: 1, height: 40, border: '1px solid var(--error-main)', background: 'transparent', color: 'var(--error-text)' }}><Icon d={I.x} size={18} strokeWidth={2.2} />{ms ? 'نیاز به اصلاح' : 'رد'}</button>
                  </div>
                ) : (
                  <>
                    <div style={{ minHeight: 40, borderRadius: 8, background: tone(st.t)[0], color: tone(st.t)[1], display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '0 8px', textAlign: 'center' }}>
                      <Icon d={sel.status === 'approved' ? I.check : I.x} size={18} strokeWidth={2.2} />{decidedText(sel)}
                    </div>
                    {sel.decidedAt && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                        {sel.decidedBy ? `${sel.decidedBy} · ` : ''}{jDateTime(sel.decidedAt)}
                        {reversible && <button onClick={() => undo(sel)} disabled={busy} style={{ marginRight: 'auto', border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={I.undo} size={14} />بازگردانی تصمیم</button>}
                      </span>
                    )}
                  </>
                )}
                <Link href={routes.org.employee(sel.requesterId)} className="btn" style={{ height: 40, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}><Icon d={I.user} size={18} />مشاهده پروفایل</Link>
              </div>
            </>
          );
        })()}
      </aside>

      {dlg && (() => {
        const { r, approve } = dlg;
        const ms = r.kind === 'milestone_release';
        const failed = r.checks.filter((c) => !c.ok);
        const title = approve ? (ms ? 'تأیید و آزادسازی مرحله' : 'تأیید درخواست') : ms ? 'درخواست اصلاح' : 'رد درخواست';
        return (
          <Dialog label={title} title={title} onClose={() => setDlg(null)}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {REQ_KIND[r.kind].title} {r.requesterName}{r.amount ? ` · ${money(r.amount)} تومان` : ''}.
              {approve && ms && r.milestone ? ` با تأیید، ${money(r.milestone.amount)} تومان از قفل مرحله‌ای ${r.milestone.holdingName} کارمند آزاد می‌شود و قابل فروش یا برداشت خواهد بود.` : ''}
              {approve && !ms ? ' نتیجه برای کارمند در اپ اعلان می‌شود.' : ''}
              {!approve ? (ms ? ' مبلغ مرحله قفل می‌ماند و کارمند باید گزارش را اصلاح و دوباره ارسال کند.' : ' کارمند از رد درخواست و دلیل آن مطلع می‌شود.') : ''}
            </span>
            {approve && !!failed.length && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft-warning)', color: 'var(--warning-text)', fontSize: 12, lineHeight: 1.5 }}>
                <Icon d={I.warn} size={18} style={{ marginTop: 1 }} />
                <span>این درخواست با {faDigits(failed.length)} مورد از قوانین قرارداد مغایرت دارد: {failed.map((c) => c.label).join('، ')}.</span>
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="flbl">{approve ? 'یادداشت (اختیاری)' : ms ? 'موارد نیازمند اصلاح' : 'دلیل رد'}</span>
              <span className="fld" style={{ height: 'auto', padding: '8px 12px', alignItems: 'flex-start', borderColor: noteErr ? 'var(--error-main)' : undefined }}>
                <textarea value={note} onChange={(e) => { setNote(e.target.value); setNoteErr(''); }} rows={3} autoFocus aria-label="یادداشت تصمیم" aria-invalid={!!noteErr} placeholder={approve ? 'مثلاً: تأیید طبق صورت‌جلسه پروژه' : 'توضیح برای کارمند…'} style={{ resize: 'vertical', minHeight: 64, lineHeight: 1.6 }} />
              </span>
              {noteErr && <span role="alert" style={{ fontSize: 11, color: 'var(--error-text)' }}>{noteErr}</span>}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
              <button className="btn" disabled={decide.isPending} onClick={confirm} style={{ background: approve ? 'var(--primary-main)' : 'var(--error-main)', color: approve ? 'var(--primary-contrast)' : 'var(--error-contrast)', opacity: decide.isPending ? 0.7 : 1 }}>
                {decide.isPending ? 'در حال ثبت…' : approve ? (ms && r.milestone ? `تأیید و آزادسازی ${pct(r.milestone.sharePct)}` : 'تأیید درخواست') : ms ? 'ارسال درخواست اصلاح' : 'رد درخواست'}
              </button>
              <button className="btn" onClick={() => setDlg(null)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>انصراف</button>
            </div>
          </Dialog>
        );
      })()}
      {toast}
    </div>
  );
}

export default function OrgRequestsPage() {
  return (
    <Suspense fallback={null}>
      <Requests />
    </Suspense>
  );
}
