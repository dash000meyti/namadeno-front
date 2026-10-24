'use client';
/**
 * /op/requests — operator review queue for all organizations. Kit list page:
 * stats → list card (kind tabs, status / sort selects, search, table with quick approve / reject) → inspector
 * (requester, amount · SLA · risk, details, risk factors, manual review checklist, approve / reject with reason / refer to risk).
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApprovalRequest, RequestKind } from '@/types/domain';
import { useDecideOpRequest, useOpRequests, useOpUsers } from '@/api/op';
import { useEscalateRequest, useReopenRequest, useRequestMeta, useUpdateRequestChecks, type RequestMeta } from '@/api/op-system-extra';
import {
  Ava, Card, Chips, Dialog, Empty, Field, Ident, Inspector, KV, KeyStats, Legend, List, ListRow, Meter, Note, PageHeading, Pill,
  SearchField, Section, Select, StatStrip, Table, TableFoot, Tabs, Toolbar, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { IC } from '@/components/op/system/ui';
import { durFa, errMsg, hhmm, sameDay } from '@/components/op/system/fmt';
import { enDigits, faDigits, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

const KIND: Record<RequestKind, string> = {
  loan: 'وام', installment: 'خرید اقساطی', cash_withdrawal: 'برداشت', profile_change: 'KYC', credit_increase: 'افزایش اعتبار', milestone_release: 'دریافت مرحله',
};
type TabKey = 'all' | 'loan' | 'bnpl' | 'wd' | 'kyc' | 'other';
const TABS: { key: TabKey; label: string; kinds: RequestKind[] | null }[] = [
  { key: 'all', label: 'همه', kinds: null },
  { key: 'loan', label: 'وام', kinds: ['loan'] },
  { key: 'bnpl', label: 'خرید اقساطی', kinds: ['installment'] },
  { key: 'wd', label: 'برداشت', kinds: ['cash_withdrawal'] },
  { key: 'kyc', label: 'KYC', kinds: ['profile_change'] },
  { key: 'other', label: 'سایر', kinds: ['credit_increase'] },
];
const CHECKS: Record<RequestKind, string[]> = {
  loan: ['هویت با KYC تطابق دارد', 'بخش آزاد برای رزرو پشتوانه کافی است', 'سقف قرارداد سازمان رعایت شده', 'وام فعال همزمان ندارد', 'قسط کمتر از ۴۰٪ ورودی ماهانه'],
  installment: ['فروشگاه طرف قرارداد و فعال است', 'فاکتور کالا با مبلغ تطابق دارد', 'بخش آزاد برای رزرو اقساطی کافی است', 'سقف خرید اقساطی سازمان رعایت شده'],
  cash_withdrawal: ['شبای مقصد به نام کاربر است', 'مبلغ فقط از بخش آزاد است (نه رزروشده یا مسدود)', 'الگوی برداشت غیرعادی نیست', 'دستگاه و IP شناخته‌شده است'],
  profile_change: ['تصویر کارت ملی خوانا است', 'تطابق چهره بالای ۸۵٪', 'استعلام شاهکار موفق', 'کد پرسنلی در لیست سازمان است'],
  credit_increase: ['هویت با KYC تطابق دارد', 'بخش آزاد برای رزرو اعتبار کافی است', 'سقف قرارداد سازمان رعایت شده', 'سابقه بازپرداخت کارت سالم است'],
  milestone_release: ['تحویل مرحله توسط سازمان تأیید شده', 'مستندات تحویل پیوست شده', 'مبلغ با سهم مرحله در قرارداد تطابق دارد'],
};
const REASONS: [string, string][] = [
  ['مدارک ناقص', 'مدارک ارسالی شما کامل نیست. لطفاً از بخش حساب من مدارک را دوباره بارگذاری کنید.'],
  ['ریسک بالا', 'درخواست شما در بررسی امنیتی تأیید نشد. برای پیگیری با پشتیبانی تماس بگیرید.'],
  ['خارج از سقف قرارداد', 'مبلغ درخواست از سقف تعیین‌شده در قرارداد سازمان شما بیشتر است.'],
  ['سایر', ''],
];
type SortKey = 0 | 1 | 2;
const SORTS: { key: SortKey; label: string }[] = [{ key: 0, label: 'فوری‌ترین' }, { key: 1, label: 'پرریسک‌ترین' }, { key: 2, label: 'جدیدترین' }];
type StatusKey = 'all' | ApprovalRequest['status'];
const STATUSES: { key: StatusKey; label: string }[] = [{ key: 'all', label: 'همه' }, { key: 'pending', label: 'باز' }, { key: 'approved', label: 'تأییدشده' }, { key: 'rejected', label: 'ردشده' }];
const PAGE = 10;

const riskTone = (r: number): Tone => (r < 30 ? 'success' : r < 60 ? 'warning' : 'error');
const riskLevel = (r: number) => (r < 30 ? 'کم' : r < 60 ? 'متوسط' : 'زیاد');
function statusOf(r: ApprovalRequest, m?: RequestMeta): { label: string; tone: Tone } {
  if (r.status === 'approved') return { label: 'تأییدشده', tone: 'success' };
  if (r.status === 'rejected') return { label: 'ردشده', tone: 'error' };
  return (m?.riskScore ?? 0) >= 60 ? { label: 'بررسی دستی', tone: 'info' } : { label: 'در انتظار', tone: 'warning' };
}
/** Time left to the SLA deadline; `tone` marks the last 4 hours (warning) and the last hour or overdue (error). */
function slaOf(r: ApprovalRequest, m?: RequestMeta): { t: string; min: number; tone?: 'warning' | 'error'; closed?: boolean } {
  if (r.status !== 'pending' || !m) return { t: '—', min: Infinity, closed: true };
  const min = (new Date(m.slaDueAt).getTime() - now().getTime()) / 60000;
  if (min <= 0) return { t: 'گذشته', min, tone: 'error' };
  return { t: hhmm(min), min, tone: min < 60 ? 'error' : min < 240 ? 'warning' : undefined };
}
const slaColor = (s: ReturnType<typeof slaOf>) => (s.closed ? 'var(--text-disabled)' : s.tone ? `var(--${s.tone}-text)` : 'var(--text-secondary)');

export default function OpRequestsPage() {
  const toast = useToast();
  const reqs = useOpRequests();
  const metaQ = useRequestMeta();
  const users = useOpUsers();
  const decide = useDecideOpRequest();
  const reopen = useReopenRequest();
  const [tab, setTab] = useState<TabKey>('all');
  const [status, setStatus] = useState<StatusKey>('all');
  const [sort, setSort] = useState<SortKey>(0);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);

  const all = useMemo(() => reqs.data ?? [], [reqs.data]);
  const meta = useMemo(() => metaQ.data ?? {}, [metaQ.data]);
  const userIds = useMemo(() => new Set((users.data ?? []).map((u) => u.id)), [users.data]);
  const kinds = (TABS.find((t) => t.key === tab) ?? TABS[0]).kinds;
  const inKinds = (r: ApprovalRequest, k: RequestKind[] | null) => !k || k.includes(r.kind);

  const inTab = useMemo(() => all.filter((r) => !kinds || kinds.includes(r.kind)), [all, kinds]);
  const rows = useMemo(() => {
    const text = q.trim();
    const needle = enDigits(text).toLowerCase();
    const list = inTab.filter((r) => (status === 'all' || r.status === status)
      && (!text || r.id.toLowerCase().includes(needle) || r.requesterName.includes(text) || r.orgName.includes(text)));
    return list.sort((a, b) => {
      if (sort === 0) return slaOf(a, meta[a.id]).min - slaOf(b, meta[b.id]).min || b.createdAt.localeCompare(a.createdAt);
      if (sort === 1) return (meta[b.id]?.riskScore ?? 0) - (meta[a.id]?.riskScore ?? 0);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [inTab, meta, status, q, sort]);
  const pg = usePaging(rows, PAGE, `${tab}|${status}|${sort}|${q}`);

  const pending = all.filter((r) => r.status === 'pending');
  const manual = pending.filter((r) => (meta[r.id]?.riskScore ?? 0) >= 60).length;
  const nearSla = pending.filter((r) => slaOf(r, meta[r.id]).min < 240).length;
  const decided = all.filter((r) => r.decidedAt);
  const avgMin = decided.length ? decided.reduce((s, r) => s + (new Date(r.decidedAt!).getTime() - new Date(r.createdAt).getTime()) / 60000, 0) / decided.length : 0;
  const today = (r: ApprovalRequest) => !!r.decidedAt && sameDay(r.decidedAt, now());
  const approvedToday = all.filter((r) => r.status === 'approved' && today(r)).length;
  const rejectedToday = all.filter((r) => r.status === 'rejected' && today(r)).length;

  const busyId = (decide.isPending ? decide.variables?.id : undefined) ?? (reopen.isPending ? reopen.variables?.id : undefined);
  const approve = (r: ApprovalRequest) => decide.mutate({ id: r.id, approve: true }, { onSuccess: () => toast(`درخواست ${r.id} تأیید شد`), onError: (e) => toast(errMsg(e), 'error') });
  const undo = (r: ApprovalRequest) => reopen.mutate({ id: r.id }, { onSuccess: () => toast(`درخواست ${r.id} به صف بررسی بازگشت`, 'info'), onError: (e) => toast(errMsg(e), 'error') });
  const selReq = all.find((r) => r.id === sel) ?? null;
  const rejReq = all.find((r) => r.id === rejectFor) ?? null;
  const filtered = tab !== 'all' || status !== 'all' || !!q;
  const clear = () => { setTab('all'); setStatus('all'); setQ(''); };

  const columns: Column<ApprovalRequest>[] = [
    { key: 'id', label: 'شناسه', width: '84px', render: (r) => <span className="num ltr sm">{r.id}</span> },
    { key: 'who', label: 'کاربر', width: 'minmax(0, 1.5fr)', render: (r) => <Ident lead={<Ava letter={r.requesterName[0]} id={r.requesterId} />} title={r.requesterName} sub={r.orgName} /> },
    { key: 'kind', label: 'نوع', width: '112px', render: (r) => <Pill>{KIND[r.kind]}</Pill> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '120px', render: (r) => (r.amount ? <span className="num">{money(r.amount)}</span> : <span style={{ color: 'var(--text-disabled)' }}>—</span>) },
    {
      key: 'sla', label: 'SLA', width: '84px', render: (r) => {
        const s = slaOf(r, meta[r.id]);
        return <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: slaColor(s), fontWeight: s.tone ? 600 : 500 }}><Icon d={IC.clock} size={14} /><span className="ltr">{s.t}</span></span>;
      },
    },
    {
      key: 'risk', label: 'امتیاز ریسک', width: '92px', col: true, render: (r) => {
        const v = meta[r.id]?.riskScore ?? 0;
        return <><span className="num">{faDigits(v)}</span><Meter value={v / 100} tone={riskTone(v)} width={60} thin label={`امتیاز ریسک ${faDigits(v)} از ۱۰۰`} /></>;
      },
    },
    { key: 'st', label: 'وضعیت', width: '104px', render: (r) => { const s = statusOf(r, meta[r.id]); return <Pill tone={s.tone} dot>{s.label}</Pill>; } },
    {
      key: 'act', label: '', width: '84px', align: 'end', render: (r) => {
        const busy = busyId === r.id;
        if (r.status === 'pending') {
          return (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button type="button" className="nm-ib tn tn-success" aria-label={`تأیید درخواست ${r.id}`} title="تأیید" disabled={busy} onClick={(e) => { e.stopPropagation(); approve(r); }}><Icon d={IC.check} size={16} strokeWidth={2.2} /></button>
              <button type="button" className="nm-ib tn tn-error" aria-label={`رد درخواست ${r.id}`} title="رد" disabled={busy} onClick={(e) => { e.stopPropagation(); setRejectFor(r.id); }}><Icon d={IC.x} size={16} strokeWidth={2.2} /></button>
            </span>
          );
        }
        return today(r)
          ? <button type="button" className="nm-btn sm text" disabled={busy} onClick={(e) => { e.stopPropagation(); undo(r); }}>بازگردانی</button>
          : <span className="sm">بسته شد</span>;
      },
    },
  ];

  return (
    <>
      <PageHeading title="درخواست‌ها" crumbs={[{ label: 'عملیات' }]} sub="صف بررسی درخواست‌های همه‌ی سازمان‌ها؛ تأیید یا رد با دلیل، پیش از پایان مهلت SLA">
        <Link href={routes.op.rules} className="nm-btn ghost"><Icon d={IC.rules} size={17} />قوانین تأیید خودکار</Link>
      </PageHeading>

      <StatStrip loading={reqs.isLoading} items={[
        { label: 'در انتظار بررسی', value: faDigits(pending.length), unit: 'درخواست', note: manual ? `${faDigits(manual)} نیازمند بررسی دستی` : undefined, onClick: () => setStatus((s) => (s === 'pending' ? 'all' : 'pending')), active: status === 'pending' },
        { label: 'میانگین زمان بررسی', value: decided.length ? durFa(avgMin) : '—', note: decided.length ? `بر پایه‌ی ${faDigits(decided.length)} تصمیم` : undefined },
        { label: 'نزدیک به نقض SLA', value: faDigits(nearSla), unit: 'درخواست', note: 'کمتر از ۴ ساعت تا پایان مهلت', trend: nearSla ? 'warn' : undefined },
        { label: 'تأییدشده امروز', value: faDigits(approvedToday), unit: 'درخواست', note: rejectedToday ? `${faDigits(rejectedToday)} ردشده امروز` : undefined, trend: approvedToday ? 'up' : undefined },
      ]} />

      <Card flush>
        <Toolbar>
          <Tabs label="نوع درخواست" value={tab} onChange={setTab}
            items={TABS.map((t) => ({ key: t.key, label: t.label, count: all.filter((r) => r.status === 'pending' && inKinds(r, t.kinds)).length }))} />
          <span className="grow" />
          <Select label="وضعیت درخواست" prefix="وضعیت" value={status} onChange={setStatus}
            options={STATUSES.map((s) => ({ key: s.key, label: s.label, count: s.key === 'all' ? inTab.length : inTab.filter((r) => r.status === s.key).length }))} />
          <Select label="مرتب‌سازی" prefix="ترتیب" value={sort} onChange={setSort} options={SORTS} />
          <SearchField value={q} onChange={setQ} placeholder="شناسه، نام یا سازمان" label="جستجوی درخواست" width={210} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(r) => r.id} rowLabel={(r) => `درخواست ${r.id} — ${r.requesterName}`}
          onRowClick={(r) => setSel((s) => (s === r.id ? null : r.id))} selectedKey={sel}
          loading={reqs.isLoading} error={reqs.isError ? reqs.error : undefined} onRetry={() => reqs.refetch()}
          empty={<Empty icon={IC.inbox} title="درخواستی با این فیلتر یافت نشد" action={filtered ? <button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button> : undefined} />}
          minWidth={940}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="درخواست" page={pg.page} pages={pg.pages} onPage={pg.setPage}>
          <Legend items={[{ label: 'کمتر از ۱ ساعت تا SLA', color: 'var(--error-main)' }, { label: 'کمتر از ۴ ساعت', color: 'var(--warning-main)' }]} />
        </TableFoot>
      </Card>

      {selReq && (
        <RequestInspector key={selReq.id} r={selReq} m={meta[selReq.id]} hasUser={userIds.has(selReq.requesterId)} undoBusy={busyId === selReq.id}
          onClose={() => setSel(null)} onReject={() => setRejectFor(selReq.id)} onUndo={() => undo(selReq)} />
      )}
      {rejReq && <RejectDialog key={rejReq.id} r={rejReq} onClose={() => setRejectFor(null)} />}
    </>
  );
}

function RequestInspector({ r, m, hasUser, undoBusy, onClose, onReject, onUndo }: {
  r: ApprovalRequest; m?: RequestMeta; hasUser: boolean; undoBusy: boolean; onClose: () => void; onReject: () => void; onUndo: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const decide = useDecideOpRequest();
  const saveChecks = useUpdateRequestChecks();
  const escalate = useEscalateRequest();
  const list = CHECKS[r.kind];
  const [checks, setChecks] = useState<boolean[]>(() => list.map((_, i) => !!m?.checks[i]));
  useEffect(() => { if (m) setChecks(list.map((_, i) => !!m.checks[i])); }, [m, list]);
  const s = statusOf(r, m);
  const sla = slaOf(r, m);
  const risk = m?.riskScore ?? 0;
  const done = checks.filter(Boolean).length;
  const complete = done === list.length;
  const open = r.status === 'pending';
  const recent = !open && !!r.decidedAt && sameDay(r.decidedAt, now());

  const toggle = (i: number) => {
    const next = checks.map((c, j) => (j === i ? !c : c));
    setChecks(next);
    saveChecks.mutate({ id: r.id, checks: next }, { onError: (e) => { setChecks(checks); toast(errMsg(e), 'error'); } });
  };
  const approve = () => {
    if (!complete) return toast('پیش از تأیید، همه موارد بررسی دستی را علامت بزنید', 'error');
    decide.mutate({ id: r.id, approve: true }, { onSuccess: () => toast(`درخواست ${r.id} تأیید شد`), onError: (e) => toast(errMsg(e), 'error') });
  };
  const refer = () => escalate.mutate({ id: r.id }, {
    onSuccess: (a) => { toast(`درخواست ${r.id} با هشدار ${a.id} به کارشناس ریسک ارجاع شد`, 'info'); router.push(routes.op.risk); },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const referLabel = escalate.isPending ? 'در حال ارجاع…' : open ? 'ارجاع به ریسک' : 'ارجاع به کارشناس ریسک';

  const details: [ReactNode, ReactNode][] = [
    ['عنوان', <span key="t" title={r.title}>{r.title}</span>],
    ['ثبت', relTime(r.createdAt, now())],
    ...(m?.details ?? []).filter((x) => x.k !== 'عنوان' && x.k !== 'مبلغ').map((x): [ReactNode, ReactNode] => [x.k, <span key={x.k} className="num" title={faDigits(x.v)}>{faDigits(x.v)}</span>]),
  ];

  return (
    <Inspector
      open onClose={onClose} label="جزئیات درخواست" title={<>درخواست <span className="ltr">{r.id}</span></>}
      href={hasUser ? routes.op.user(r.requesterId) : undefined} hrefLabel="پروفایل کاربر"
      footer={open ? (
        <>
          <button type="button" className="nm-btn" onClick={approve} disabled={decide.isPending} aria-disabled={!complete || undefined} title={complete ? undefined : 'ابتدا همه موارد بررسی دستی را علامت بزنید'}>
            <Icon d={IC.check} size={17} strokeWidth={2} />تأیید
          </button>
          <button type="button" className="nm-btn line danger" onClick={onReject}>رد با دلیل</button>
          <button type="button" className="nm-btn ghost" onClick={refer} disabled={escalate.isPending} title="ارجاع به کارشناس ریسک">{referLabel}</button>
        </>
      ) : (
        <>
          {recent && <button type="button" className="nm-btn ghost" onClick={onUndo} disabled={undoBusy}><Icon d={IC.refresh} size={16} />بازگردانی به صف</button>}
          <button type="button" className="nm-btn line" onClick={refer} disabled={escalate.isPending}><Icon d={IC.risk} size={16} />{referLabel}</button>
        </>
      )}
    >
      <Who
        lead={<Ava letter={r.requesterName[0]} id={r.requesterId} size="lg" />}
        title={r.requesterName}
        sub={<>{r.orgName} · امتیاز اعتباری <span className="num">{m?.creditScore ? faDigits(m.creditScore) : '—'}</span></>}
        pills={<><Pill>{KIND[r.kind]}</Pill><Pill tone={s.tone} dot>{s.label}</Pill></>}
      />

      {!open && (
        <Note tone={r.status === 'approved' ? 'ok' : 'err'} icon={r.status === 'approved' ? IC.check : IC.x}>
          {r.status === 'approved' ? 'تأیید شد' : 'رد شد'} توسط {r.decidedBy ?? '—'}{r.decidedAt ? ` · ${relTime(r.decidedAt, now())}` : ''}
          {r.note && <><br /><span style={{ fontWeight: 500 }}>{r.note}</span></>}
        </Note>
      )}

      <KeyStats items={[
        ['مبلغ (تومان)', r.amount ? money(r.amount) : '—'],
        ['مهلت SLA', <span key="s" className="ltr" style={{ color: slaColor(sla) }}>{sla.t}</span>],
        ['امتیاز ریسک', <span key="r" style={{ color: `var(--${riskTone(risk)}-text)` }}>{faDigits(risk)} · {riskLevel(risk)}</span>],
      ]} />

      <Section title="جزئیات"><KV rows={details} /></Section>

      <Section title="عوامل ریسک">
        {m?.factors.length ? (
          <List>
            {m.factors.map((f) => (
              <ListRow key={f.t}
                lead={<i style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${f.tone}-main)`, flex: 'none', margin: '0 4px' }} />}
                title={<span style={{ fontWeight: 500 }}>{f.t}</span>} />
            ))}
          </List>
        ) : <span className="mute" style={{ fontSize: 12.5 }}>عامل ریسک قابل‌توجهی ثبت نشده است</span>}
      </Section>

      <Section title="بررسی دستی" action={<Pill tone={complete ? 'success' : 'warning'}>{faDigits(done)} از {faDigits(list.length)}</Pill>}>
        <List>
          {list.map((t, i) => (
            <div key={t} className="nm-li" style={{ minHeight: 46 }}>
              <button type="button" className="nm-check" aria-pressed={checks[i]} disabled={!open} onClick={() => toggle(i)}
                style={{ flex: 1, minHeight: 30, textAlign: 'right', lineHeight: 1.6, cursor: open ? undefined : 'default', color: checks[i] ? 'var(--text-secondary)' : undefined }}>
                <i>{checks[i] && <Icon d={IC.check} size={13} strokeWidth={3} />}</i>{t}
              </button>
            </div>
          ))}
        </List>
      </Section>
    </Inspector>
  );
}

function RejectDialog({ r, onClose }: { r: ApprovalRequest; onClose: () => void }) {
  const toast = useToast();
  const decide = useDecideOpRequest();
  const [rs, setRs] = useState(0);
  const [note, setNote] = useState(REASONS[0][1]);
  const [err, setErr] = useState('');
  const pick = (i: number) => { setRs(i); setNote(REASONS[i][1]); setErr(''); };
  const submit = () => {
    if (note.trim().length < 5) return setErr('توضیح رد درخواست را برای کاربر بنویسید.');
    decide.mutate({ id: r.id, approve: false, note: note.trim() }, {
      onSuccess: () => { toast(`درخواست ${r.id} رد شد و به کاربر اطلاع داده شد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <Dialog
      open onClose={onClose} width={520} label={`رد درخواست ${r.id}`}
      title={<>رد درخواست <span className="ltr">{r.id}</span></>}
      sub={`${KIND[r.kind]} · ${r.requesterName}${r.amount ? ` · ${money(r.amount)} تومان` : ''}`}
      footer={(
        <>
          <button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button>
          <button type="button" className="nm-btn danger" onClick={submit} disabled={decide.isPending}>{decide.isPending ? 'در حال ثبت…' : 'ثبت رد درخواست'}</button>
        </>
      )}
    >
      <Field label="دلیل اصلی">
        <Chips label="دلیل اصلی" value={rs} onChange={pick} options={REASONS.map(([l], i) => ({ key: i, label: l }))} />
      </Field>
      <Field label="توضیح برای کاربر" htmlFor="rj-note" error={err || undefined} help={`این متن در اعلان اپ برای ${r.requesterName} نمایش داده می‌شود.`}>
        <textarea id="rj-note" className="nm-ta" rows={4} value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} />
      </Field>
    </Dialog>
  );
}
