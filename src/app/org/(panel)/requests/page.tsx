'use client';
/**
 * Organization — requests (approval inbox). Kit list page: key numbers → list card (status tabs, type filter, search,
 * table, pager) → inspector with the employee, request details, contract-rule checks, milestone steps and the decision
 * (approve / reject or «needs changes», with a note) plus undo.
 * Deep links: `?id=RQ-…` opens that request (dashboard), `?type=loan` preselects the type filter (credit page).
 */
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Ava, BigNum, Card, Dialog, Empty, Field, Ident, Inspector, KV, KeyStats, List, ListRow, Meter, Note, PageHeading, Pill,
  SearchField, Section, Select, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Stat, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { useDecideOrgRequest } from '@/api/org';
import { useOrgPeopleRequests, useReopenOrgRequest, type RequestRow } from '@/api/org-people-extra';
import type { MilestoneStep, RequestKind } from '@/types/domain';
import { routes } from '@/lib/routes';
import { enDigits, faDigits, jDate, jDateTime, jDayMonth, money, pct } from '@/lib/format';
import { I, REQ_KIND, compactParts, downloadCsv, errMsg } from '@/components/org/people/shared';

type St = 'all' | 'pending' | 'approved' | 'rejected';
type Kind = 'all' | RequestKind;
type Milestone = NonNullable<RequestRow['milestone']>;
const PER_PAGE = 8;
/** Types always offered in the filter (deep links use them); the other kinds appear when such requests exist. */
const BASE_KINDS: RequestKind[] = ['loan', 'cash_withdrawal', 'credit_increase', 'milestone_release'];
const isKind = (v: string | null): v is RequestKind => !!v && Object.prototype.hasOwnProperty.call(REQ_KIND, v);
const CLOCK = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2';

function statusOf(r: RequestRow): { label: string; tone: Tone } {
  if (r.status === 'approved') return { label: 'تأیید شد', tone: 'success' };
  if (r.status === 'rejected') return { label: 'رد شد', tone: 'error' };
  return r.checks.some((c) => !c.ok) ? { label: 'نیاز به بررسی', tone: 'error' } : { label: 'در انتظار', tone: 'warning' };
}
const msText = (m: Milestone) => {
  const rel = m.steps.filter((s) => s.status === 'released');
  return `${faDigits(rel.length)} از ${faDigits(m.stepCount)} مرحله · ${pct(rel.reduce((s, x) => s + x.sharePct, 0))} آزاد شده`;
};
function decidedText(r: RequestRow) {
  const ms = r.kind === 'milestone_release';
  if (r.status === 'approved') return ms && r.milestone ? `مرحله ${faDigits(r.milestone.stepIndex)} تأیید شد · ${money(r.milestone.amount)} آزاد شد` : 'درخواست تأیید شد و به کارمند اطلاع داده شد';
  return ms ? 'درخواست اصلاح برای کارمند ارسال شد' : 'درخواست رد شد';
}

function Requests() {
  const sp = useSearchParams();
  const idParam = sp.get('id');
  const typeParam = sp.get('type');
  const toast = useToast();
  const q = useOrgPeopleRequests();
  const decide = useDecideOrgRequest();
  const reopen = useReopenOrgRequest();
  const [st, setSt] = useState<St>('all');
  const [kind, setKind] = useState<Kind>(isKind(typeParam) ? typeParam : 'all');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<string | null>(idParam);
  const [dlg, setDlg] = useState<{ r: RequestRow; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');

  // follow deep links while the page stays mounted (e.g. a dashboard link to another request)
  useEffect(() => { if (idParam) setSel(idParam); }, [idParam]);
  useEffect(() => { setKind(isKind(typeParam) ? typeParam : 'all'); }, [typeParam]);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const needle = search.trim();
  const rows = useMemo(() => {
    const latin = enDigits(needle).toLowerCase();
    return items.filter((r) => {
      if (st !== 'all' && r.status !== st) return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (!needle) return true;
      return r.requesterName.includes(needle) || (r.employee?.department ?? '').includes(needle) || r.id.toLowerCase().includes(latin) || (r.employee?.code ?? '').includes(latin);
    });
  }, [items, st, kind, needle]);
  const pg = usePaging(rows, PER_PAGE, `${st}|${kind}|${needle}`);
  const { setPage } = pg;

  // a deep-linked request: show the page of the list that contains it (once)
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    if (!idParam || !q.data || jumped.current === idParam) return;
    const idx = rows.findIndex((r) => r.id === idParam);
    if (idx < 0) return;
    jumped.current = idParam;
    setPage(Math.floor(idx / PER_PAGE) + 1);
  }, [idParam, q.data, rows, setPage]);

  const selected = sel ? items.find((r) => r.id === sel) : undefined;
  const busy = decide.isPending || reopen.isPending;

  // counts: status tabs within the chosen type, type options within the chosen status
  const countSt = (s: St) => items.filter((r) => (kind === 'all' || r.kind === kind) && (s === 'all' || r.status === s)).length;
  const countKind = (k: Kind) => items.filter((r) => (st === 'all' || r.status === st) && (k === 'all' || r.kind === k)).length;
  const kinds = [...BASE_KINDS, ...(Object.keys(REQ_KIND) as RequestKind[]).filter((k) => !BASE_KINDS.includes(k) && (k === kind || items.some((r) => r.kind === k)))];

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
        if (approve && ms && r.milestone) toast(`مرحله ${faDigits(r.milestone.stepIndex)} تأیید شد · ${money(r.milestone.amount)} تومان آزاد شد · ${r.requesterName}`);
        else if (approve) toast(`درخواست ${r.requesterName} تأیید شد`);
        else toast(ms ? `درخواست اصلاح برای ${r.requesterName} ارسال شد` : `درخواست ${r.requesterName} رد شد`, 'info');
      },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };
  const undo = (r: RequestRow) => reopen.mutate(r.id, { onSuccess: () => toast(`تصمیم درخواست ${r.requesterName} بازگردانی شد`, 'info'), onError: (e) => toast(errMsg(e), 'error') });

  const exportList = () => {
    downloadCsv('namadno-requests.csv', [
      ['شناسه', 'کارمند', 'واحد', 'نوع', 'عنوان', 'مبلغ (تومان)', 'منبع / قفل', 'تاریخ', 'وضعیت', 'توضیح'],
      ...rows.map((r) => [r.id, r.requesterName, r.employee?.department ?? '', REQ_KIND[r.kind].label, r.title, r.amount ?? '', r.source, jDate(r.createdAt), statusOf(r).label, r.note ?? '']),
    ]);
    toast('خروجی اکسل درخواست‌ها آماده شد');
  };

  // key numbers
  const stats: Stat[] = (() => {
    if (!q.data) return [];
    const pending = items.filter((r) => r.status === 'pending');
    const review = pending.filter((r) => r.checks.some((c) => !c.ok)).length;
    const msN = pending.filter((r) => r.kind === 'milestone_release').length;
    const withAmount = pending.filter((r) => r.amount);
    const [amtV, amtU] = compactParts(withAmount.reduce((s, r) => s + (r.amount ?? 0), 0));
    const decided = items.length - pending.length;
    const avg = q.data.avgResponseDays;
    return [
      { label: 'در انتظار تصمیم', value: faDigits(pending.length), unit: 'درخواست', note: !pending.length ? 'همه‌ی درخواست‌ها بررسی شده‌اند' : msN ? `شامل ${faDigits(msN)} مرحله‌ی قرارداد` : 'تأیید یا رد از همین صفحه', trend: pending.length ? 'warn' : undefined },
      { label: 'نیاز به بررسی', value: faDigits(review), unit: 'درخواست', note: review ? 'مغایرت با قوانین قرارداد' : 'بدون مغایرت با قوانین', trend: review ? 'warn' : undefined },
      { label: 'مبلغ در انتظار', value: amtV, unit: amtU, note: `${faDigits(withAmount.length)} درخواست مالی` },
      { label: 'میانگین زمان پاسخ', value: avg != null ? faDigits(String(avg), true) : '—', unit: avg != null ? 'روز' : undefined, note: decided ? `${faDigits(decided)} درخواست بررسی‌شده` : 'هنوز تصمیمی ثبت نشده' },
    ];
  })();

  const columns: Column<RequestRow>[] = [
    { key: 'who', label: 'کارمند', width: 'minmax(0, 1.3fr)', render: (r) => <Ident lead={<Ava letter={r.requesterName[0]} id={r.requesterId} />} title={r.requesterName} sub={r.employee?.department ?? r.orgName} /> },
    { key: 'kind', label: 'نوع', width: '104px', render: (r) => <span className="el">{REQ_KIND[r.kind].label}</span> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '120px', render: (r) => (r.amount ? <span className="num">{money(r.amount)}</span> : <span style={{ color: 'var(--text-disabled)' }}>—</span>) },
    {
      key: 'src', label: 'منبع / قفل', width: 'minmax(0, 1.2fr)', render: (r) => (
        <>
          <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, background: r.sourceColor, flex: 'none' }} />
          <span className="el mute" style={{ fontSize: 12.5 }}>{r.source}</span>
        </>
      ),
    },
    { key: 'date', label: 'تاریخ', width: '72px', render: (r) => <span className="num sm">{jDayMonth(r.createdAt)}</span> },
    { key: 'st', label: 'وضعیت', width: '104px', render: (r) => { const s = statusOf(r); return <Pill tone={s.tone} dot>{s.label}</Pill>; } },
  ];

  const filtered = st !== 'all' || kind !== 'all' || !!needle;
  const clear = () => { setSt('all'); setKind('all'); setSearch(''); };

  return (
    <>
      <PageHeading title="درخواست‌ها" crumbs={[{ label: 'عملیات' }]} sub="درخواست‌های وام، برداشت نقدی، اعتبار و مراحل قرارداد کارکنان">
        <button type="button" className="nm-btn ghost" onClick={exportList} disabled={!rows.length}><Icon d={I.download} size={17} />خروجی Excel</button>
      </PageHeading>

      <StatStrip loading={!q.data} items={stats} />

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت درخواست" value={st} onChange={setSt} items={[
            { key: 'all', label: 'همه', count: countSt('all') },
            { key: 'pending', label: 'در انتظار', count: countSt('pending'), hot: true },
            { key: 'approved', label: 'تأییدشده', count: countSt('approved') },
            { key: 'rejected', label: 'ردشده', count: countSt('rejected') },
          ]} />
          <span className="grow" />
          <Select label="نوع درخواست" prefix="نوع" value={kind} onChange={setKind} align="end"
            options={[{ key: 'all', label: 'همه‌ی انواع', count: countKind('all') }, ...kinds.map((k) => ({ key: k as Kind, label: REQ_KIND[k].label, count: countKind(k) }))]} />
          <SearchField value={search} onChange={setSearch} placeholder="نام، واحد یا شناسه" label="جستجوی درخواست" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(r) => r.id} rowLabel={(r) => `${REQ_KIND[r.kind].title} ${r.requesterName}`}
          onRowClick={(r) => setSel((s) => (s === r.id ? null : r.id))} selectedKey={sel}
          loading={q.isLoading} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()}
          empty={filtered
            ? <Empty icon={I.search} title="درخواستی با این فیلترها پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />
            : <Empty icon={I.inbox} title="درخواستی ثبت نشده است" sub="درخواست‌های تازه‌ی کارکنان اینجا نمایش داده می‌شود." />}
          minWidth={880}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="درخواست" page={pg.page} pages={pg.pages} onPage={setPage} />
      </Card>

      {selected && <RequestInspector key={selected.id} r={selected} busy={busy} onClose={() => setSel(null)} onDecide={open} onUndo={undo} />}

      {dlg && (() => {
        const { r, approve } = dlg;
        const ms = r.kind === 'milestone_release';
        const failed = r.checks.filter((c) => !c.ok);
        const title = approve ? (ms ? 'تأیید و آزادسازی مرحله' : 'تأیید درخواست') : ms ? 'درخواست اصلاح' : 'رد درخواست';
        const effect = approve
          ? (ms && r.milestone ? `با تأیید، ${money(r.milestone.amount)} تومان از قفل مرحله‌ای ${r.milestone.holdingName} کارمند آزاد می‌شود و قابل فروش یا برداشت خواهد بود.` : 'نتیجه برای کارمند در اپ اعلان می‌شود.')
          : (ms ? 'مبلغ مرحله قفل می‌ماند و کارمند باید گزارش را اصلاح و دوباره ارسال کند.' : 'کارمند از رد درخواست و دلیل آن مطلع می‌شود.');
        return (
          <Dialog
            open onClose={() => setDlg(null)} title={title}
            sub={`${REQ_KIND[r.kind].title} ${r.requesterName}${r.amount ? ` · ${money(r.amount)} تومان` : ''}`}
            icon={<Tile d={approve ? I.check : ms ? I.warn : I.x} tone={approve ? 'success' : ms ? 'warning' : 'error'} size="lg" />}
            footer={(
              <>
                <button type="button" className="nm-btn ghost" onClick={() => setDlg(null)}>انصراف</button>
                <button type="button" className={approve ? 'nm-btn' : 'nm-btn danger'} disabled={decide.isPending} onClick={confirm}>
                  {decide.isPending ? 'در حال ثبت…' : approve ? (ms && r.milestone ? `تأیید و آزادسازی ${pct(r.milestone.sharePct)}` : 'تأیید درخواست') : ms ? 'ارسال درخواست اصلاح' : 'رد درخواست'}
                </button>
              </>
            )}
          >
            <span className="mute">{effect}</span>
            {approve && failed.length > 0 && <Note tone="warn">این درخواست با {faDigits(failed.length)} مورد از قوانین قرارداد مغایرت دارد: {failed.map((c) => c.label).join('، ')}.</Note>}
            <Field label={approve ? 'یادداشت (اختیاری)' : ms ? 'موارد نیازمند اصلاح' : 'دلیل رد'} htmlFor="rq-note" error={noteErr || undefined}>
              <textarea
                id="rq-note" className="nm-ta" rows={3} value={note} autoFocus aria-label="یادداشت تصمیم" aria-invalid={!!noteErr}
                onChange={(e) => { setNote(e.target.value); setNoteErr(''); }}
                placeholder={approve ? 'مثلاً: تأیید طبق صورت‌جلسه پروژه' : 'توضیح برای کارمند…'}
                style={noteErr ? { borderColor: 'var(--error-main)' } : undefined}
              />
            </Field>
          </Dialog>
        );
      })()}
    </>
  );
}

function stepState(s: MilestoneStep, current: boolean): { lead: ReactNode; sub: string } {
  if (s.status === 'released') return { lead: <Tile d={I.check} tone="success" size="sm" />, sub: `آزاد شده${s.releasedAt ? ` · ${jDayMonth(s.releasedAt)}` : ''}` };
  if (s.status === 'pending_approval') return { lead: <Tile d={CLOCK} tone="warning" size="sm" />, sub: current ? 'در انتظار تأیید · همین درخواست' : 'در انتظار تأیید' };
  return { lead: <Tile d={I.lock} tone="neutral" size="sm" />, sub: `قفل${s.dueDate ? ` · سررسید ${jDayMonth(s.dueDate)}` : ''}` };
}

function RequestInspector({ r, busy, onClose, onDecide, onUndo }: { r: RequestRow; busy: boolean; onClose: () => void; onDecide: (r: RequestRow, approve: boolean) => void; onUndo: (r: RequestRow) => void }) {
  const st = statusOf(r);
  const k = REQ_KIND[r.kind];
  const ms = r.kind === 'milestone_release';
  const m = r.milestone;
  const failed = r.checks.filter((c) => !c.ok);
  const reversible = r.status !== 'pending' && !(ms && r.status === 'approved');
  const relPct = m ? m.steps.filter((s) => s.status === 'released').reduce((a, s) => a + s.sharePct, 0) : 0;

  const footer = r.status === 'pending' ? (
    <>
      <button type="button" className="nm-btn line danger" disabled={busy} onClick={() => onDecide(r, false)}><Icon d={I.x} size={17} strokeWidth={2.2} />{ms ? 'نیاز به اصلاح' : 'رد'}</button>
      <button type="button" className="nm-btn" disabled={busy} onClick={() => onDecide(r, true)}><Icon d={I.check} size={17} strokeWidth={2.2} />{ms && m ? `تأیید و آزادسازی ${pct(m.sharePct)}` : 'تأیید'}</button>
    </>
  ) : reversible ? (
    <button type="button" className="nm-btn ghost" disabled={busy} onClick={() => onUndo(r)}><Icon d={I.undo} size={17} />بازگردانی تصمیم</button>
  ) : undefined;

  return (
    <Inspector
      open onClose={onClose} title={<>درخواست <span className="num ltr">{r.id}</span></>} label={`جزئیات درخواست ${r.requesterName}`}
      href={routes.org.employee(r.requesterId)} hrefLabel="مشاهده پروفایل" footer={footer}
    >
      <Who
        lead={<Ava letter={r.requesterName[0]} id={r.requesterId} size="lg" />}
        title={r.requesterName}
        sub={r.employee ? <>واحد {r.employee.department} · کد پرسنلی <span className="num">{faDigits(r.employee.code)}</span></> : r.orgName}
        pills={<><Pill tone={st.tone} dot>{st.label}</Pill><Pill>{k.label}</Pill></>}
      />
      {r.employee && <KeyStats items={[['دارایی کل', money(r.employee.portfolio)], ['دارایی آزاد', money(r.employee.free)], ['امتیاز اعتباری', r.employee.score ? faDigits(r.employee.score) : '—']]} />}

      <Section title={k.title} action={r.amount ? <BigNum value={money(r.amount)} unit="تومان" /> : undefined}>
        <KV rows={[
          ...(r.amount ? [] : [['موضوع', <span key="t" title={r.title}>{r.title}</span>] as [ReactNode, ReactNode]]),
          ['تاریخ ثبت', <span key="d" className="num">{jDateTime(r.createdAt)}</span>],
          ['منبع / قفل', <span key="s" title={r.source}>{r.source}</span>],
          ...r.details.map((d) => [d.label, <span key={d.label} className="num" title={d.value}>{d.value}</span>] as [ReactNode, ReactNode]),
        ]} />
      </Section>

      {ms && m && (
        <Section title="مراحل قرارداد" action={<Link href={routes.org.package(m.packageId)} className="nm-more">مشاهده قرارداد<Icon d={I.chevL} size={14} /></Link>}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LockTypeChip type="milestone" />
            <span className="num mute" style={{ fontSize: 12.5 }}>{msText(m)}</span>
          </div>
          <Meter value={relPct / 100} thin label={msText(m)} />
          <List>
            {m.steps.map((s, i) => {
              const x = stepState(s, r.status === 'pending' && i + 1 === m.stepIndex);
              return <ListRow key={s.id} lead={x.lead} title={s.title} sub={x.sub} trail={<span className="num mute">{pct(s.sharePct)}</span>} />;
            })}
          </List>
        </Section>
      )}

      {r.checks.length > 0 && (
        <Section title={ms ? 'پیش‌نیازهای آزادسازی' : 'بررسی قوانین قرارداد'} action={failed.length > 0 ? <Pill tone="error">{faDigits(failed.length)} مغایرت</Pill> : undefined}>
          <List>
            {r.checks.map((c) => (
              <ListRow key={c.label}
                lead={<Tile d={c.ok ? I.check : I.x} tone={c.ok ? 'success' : 'error'} size="sm" />}
                title={c.label}
                trail={<span className="num mute" style={{ fontSize: 12.5 }}>{c.value}</span>}
              />
            ))}
          </List>
        </Section>
      )}

      {r.note && <Note tone="mute"><b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>توضیح: </b>{r.note}</Note>}

      {r.status !== 'pending' && (
        <Note tone={r.status === 'approved' ? 'ok' : 'mute'} icon={r.status === 'approved' ? I.check : I.x}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <b style={{ fontWeight: 600 }}>{decidedText(r)}</b>
            {r.decidedAt && <span className="num" style={{ fontSize: 12 }}>{r.decidedBy ? `${r.decidedBy} · ` : ''}{jDateTime(r.decidedAt)}</span>}
          </span>
        </Note>
      )}
    </Inspector>
  );
}

export default function OrgRequestsPage() {
  return (
    <Suspense fallback={null}>
      <Requests />
    </Suspense>
  );
}
