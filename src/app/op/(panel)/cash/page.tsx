'use client';
/**
 * Operator console — cash («نقدینگی»): Namadno's bank account split into the two rial treasuries.
 *   «ریال»      users' rial wallets, organizations' free balances (and what they set aside for packages in the queue),
 *               cash tied in open buy orders, Namadno's free rial
 *   «ریال رزرو» money of sent packages waiting for recipients — always paid: a package «آزاد» does not cover waits in the
 *               queue («بسته در صف») until its receipt is approved; nothing is unfunded
 * Kit page: heading («ثبت واریز») → stats (bank, Namadno free rial, reserve, user wallets, organizations' free with
 * the receipts waiting for review) → bank balance trend (30/90 days, with «ریال رزرو») + how the balance splits by
 * owner → organizations' rial accounts (row → account inspector) → «فیش‌های واریز» (receipts the organizations upload:
 * در انتظار تأیید / تأییدشده / ردشده, «بررسی» → ReviewDepositDialog) → «گردش حساب بانکی» / «گردش ریالی» (filters,
 * search, pager). Any row opens the inspector. Receipts have no due date: they are approved or rejected.
 * Deep links: ?org=<orgId> filters the lists and opens that organization's account · ?id=<entry id> opens an entry ·
 * ?status=expected|done|rejected selects the receipts tab (any other value opens «در انتظار تأیید») ·
 * ?kind=<CashEntryKind>.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpOrganizations } from '@/api/op';
import {
  useCashEntries, useCashSummary, useRialMoves, useRialTreasury, type CashEntry, type CashEntryKind, type OrgRialAccount, type RialMove,
  type RialMoveKind,
} from '@/api/op-treasury-extra';
import {
  Allocation, Ava, Card, Empty, ErrorBlock, Ident, KV, Legend, LineChart, Note, PageHeading, Pill, SearchField, Select,
  SkeletonCard, StatStrip, Table, TableFoot, Tabs, Toolbar, usePaging, type Column, type Stat,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { CASH_KIND, ORG_RIAL, RIAL_MOVE, TI, amt, cashStatus } from '@/components/op/treasury/ui';
import { ORG_STATUS } from '@/components/op/core/ui';
import { CashInspector } from '@/components/op/cash/CashInspector';
import { RecordDepositDialog } from '@/components/op/cash/DepositDialogs';
import { OrgRialInspector } from '@/components/op/cash/OrgRialInspector';
import { ReviewDepositDialog, depositPurpose, receiptTime } from '@/components/op/cash/ReviewDepositDialog';
import { MoveEnds, RialMoveInspector } from '@/components/op/cash/rial';
import { ReceiptThumb } from '@/components/ui/Receipt';
import { scaled, signed } from '@/components/op/cash/money';
import { dec, downloadCsv, raw } from '@/components/op/system/fmt';
import { faDigits, jDate, jDayMonth, money, time } from '@/lib/format';
import { routes } from '@/lib/routes';

type DepTab = 'expected' | 'done' | 'rejected';
type AcctTab = 'all' | 'queued' | 'pending';
type Dir = 'all' | 'in' | 'out';
type View = 'bank' | 'rial';
type Sel = { t: 'entry'; e: CashEntry } | { t: 'org'; id: string } | { t: 'move'; m: RialMove } | null;
const KINDS = Object.keys(CASH_KIND) as CashEntryKind[];
const MOVE_KINDS = Object.keys(RIAL_MOVE) as RialMoveKind[];
const HEAD = { title: 'نقدینگی', crumbs: [{ label: 'خزانه' }], sub: 'حساب بانکی نمادنو: ریال، ریال رزرو، کیف پول کاربران و حساب ریالی سازمان‌ها' };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const Dash = () => <span style={{ color: 'var(--text-disabled)' }}>—</span>;
const B = (n: number) => n / 1e9;
/** ?status= → receipts tab (any other value, e.g. an old link, opens the pending tab). */
const depTabOf = (st: string | null): DepTab => (st === 'done' || st === 'approved' ? 'done' : st === 'rejected' ? 'rejected' : 'expected');

export default function OpCashPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><StatStrip loading items={[]} /><SkeletonCard h={300} /></>}>
      <CashInner />
    </Suspense>
  );
}

function CashInner() {
  const toast = useToast();
  const sp = useSearchParams();
  const router = useRouter();
  const linkId = sp.get('id');
  const linkOrg = sp.get('org');
  const linkStatus = sp.get('status');
  const linkKind = sp.get('kind') as CashEntryKind | null;

  const [range, setRange] = useState<30 | 90>(30);
  const [org, setOrg] = useState<string>(linkOrg ?? 'all');
  const [depTab, setDepTab] = useState<DepTab>(depTabOf(linkStatus));
  const [acctTab, setAcctTab] = useState<AcctTab>('all');
  const [acctQ, setAcctQ] = useState('');
  const [view, setView] = useState<View>('bank');
  const [kind, setKind] = useState<CashEntryKind | 'all'>(linkKind && KINDS.includes(linkKind) ? linkKind : 'all');
  const [moveKind, setMoveKind] = useState<RialMoveKind | 'all'>('all');
  const [dir, setDir] = useState<Dir>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Sel>(!linkId && linkOrg ? { t: 'org', id: linkOrg } : null);
  const [selId, setSelId] = useState<string | null>(linkId);
  const [review, setReview] = useState<CashEntry | null>(null);
  const [record, setRecord] = useState<{ key: number; orgId?: string; keep?: boolean } | null>(null);

  const sumQ = useCashSummary(30);
  const rialQ = useRialTreasury(30);
  const chartQ = useRialTreasury(range);
  const orgsQ = useOpOrganizations();
  const expQ = useCashEntries({ kind: 'org_deposit', status: 'expected' });
  const doneQ = useCashEntries({ kind: 'org_deposit', status: 'done' });
  const rejQ = useCashEntries({ kind: 'org_deposit', status: 'rejected' });
  const ledgerQ = useCashEntries({ kind, status: 'done', orgId: org === 'all' ? undefined : org });
  const movesQ = useRialMoves({ kind: moveKind, orgId: org === 'all' ? undefined : org, limit: 100 });

  const orgs = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const expected = useMemo(() => expQ.data ?? [], [expQ.data]);
  // approved receipts (deposits the operator recorded without a receipt stay in the bank ledger)
  const approved = useMemo(() => (doneQ.data ?? []).filter((e) => !!e.receipt), [doneQ.data]);
  const rejected = useMemo(() => rejQ.data ?? [], [rejQ.data]);
  const ledger = useMemo(() => ledgerQ.data ?? [], [ledgerQ.data]);
  const moves = useMemo(() => movesQ.data ?? [], [movesQ.data]);
  const accounts = useMemo(() => [...(rialQ.data?.byOrg ?? [])].sort((a, b) => (b.blocked + b.free) - (a.blocked + a.free) || b.pending - a.pending), [rialQ.data]);

  // links while the page stays open (action queue, activity, organization pages)
  useEffect(() => { if (linkId) setSelId(linkId); }, [linkId]);
  useEffect(() => {
    if (!linkOrg) return;
    setOrg(linkOrg);
    if (!linkId) setSel({ t: 'org', id: linkOrg });
  }, [linkOrg, linkId]);
  useEffect(() => { if (linkStatus) setDepTab(depTabOf(linkStatus)); }, [linkStatus]);
  // resolve a linked entry once its list has loaded
  useEffect(() => {
    if (!selId) return;
    const hit = expected.find((e) => e.id === selId) ?? rejected.find((e) => e.id === selId)
      ?? (doneQ.data ?? []).find((e) => e.id === selId) ?? ledger.find((e) => e.id === selId);
    if (hit) { setSel({ t: 'entry', e: hit }); setSelId(null); }
  }, [selId, expected, rejected, doneQ.data, ledger]);

  // the inspector follows fresh data (e.g. after an approval the receipt moves from pending to approved)
  const findEntry = (id: string) => expected.find((e) => e.id === id) ?? rejected.find((e) => e.id === id)
    ?? (doneQ.data ?? []).find((e) => e.id === id) ?? ledger.find((e) => e.id === id);
  const liveEntry = sel?.t === 'entry' ? (findEntry(sel.e.id) ?? sel.e) : null;
  const liveAcct = sel?.t === 'org' ? accounts.find((a) => a.orgId === sel.id) : undefined;
  const liveMove = sel?.t === 'move' ? sel.m : null;

  // ── organizations' rial accounts ──
  const queuedAccts = accounts.filter((a) => a.queuedCount > 0);
  const pendingAccts = accounts.filter((a) => a.pending > 0);
  const acctNeedle = acctQ.trim();
  const acctRows = (acctTab === 'queued' ? queuedAccts : acctTab === 'pending' ? pendingAccts : accounts).filter((a) => !acctNeedle || a.orgName.includes(acctNeedle));
  const acctPg = usePaging(acctRows, 8, `${acctTab}|${acctNeedle}`);

  // ── deposit receipts ──
  const byOrg = (e: CashEntry) => org === 'all' || e.orgId === org;
  const expOrg = expected.filter(byOrg);
  const doneOrg = approved.filter(byOrg);
  const rejOrg = rejected.filter(byOrg);
  const depRows = depTab === 'done' ? doneOrg : depTab === 'rejected' ? rejOrg : expOrg;
  const depQ = depTab === 'done' ? doneQ : depTab === 'rejected' ? rejQ : expQ;
  const depPg = usePaging(depRows, 6, `${depTab}|${org}`);

  // ── bank ledger ──
  const needle = q.trim();
  const ledgerRows = useMemo(() => ledger.filter((e) => (dir === 'all' || (dir === 'in' ? e.amount > 0 : e.amount < 0))
    && (!needle || e.title.includes(needle) || (e.orgName ?? '').includes(needle) || (e.ref ?? '').includes(needle) || (e.by ?? '').includes(needle))), [ledger, dir, needle]);
  const ledPg = usePaging(ledgerRows, 12, `${dir}|${kind}|${org}|${needle}`);
  const inSum = sum(ledgerRows.filter((e) => e.amount > 0).map((e) => e.amount));
  const outSum = sum(ledgerRows.filter((e) => e.amount < 0).map((e) => e.amount));

  // ── rial moves ──
  const moveRows = useMemo(() => moves.filter((m) => !needle || m.title.includes(needle) || m.from.includes(needle) || m.to.includes(needle)
    || (m.ref ?? '').includes(needle) || (m.orgName ?? '').includes(needle) || (m.userName ?? '').includes(needle)), [moves, needle]);
  const movePg = usePaging(moveRows, 12, `${moveKind}|${org}|${needle}`);

  const orgOptions = useMemo(() => [{ key: 'all', label: 'همه سازمان‌ها' }, ...orgs.map((o) => ({ key: o.id, label: o.name }))], [orgs]);
  const pickEntry = (e: CashEntry) => setSel((s) => (s?.t === 'entry' && s.e.id === e.id ? null : { t: 'entry', e }));
  const pickAcct = (a: OrgRialAccount) => setSel((s) => (s?.t === 'org' && s.id === a.orgId ? null : { t: 'org', id: a.orgId }));
  const pickMove = (m: RialMove) => setSel((s) => (s?.t === 'move' && s.m.id === m.id ? null : { t: 'move', m }));
  const closeInspector = () => {
    setSel(null);
    // drop the deep link (the organization filter stays) so it does not reopen the inspector
    if (linkId || linkOrg) router.replace(routes.op.cash, { scroll: false });
  };
  const reviewed = (e: CashEntry) => { if (sel?.t === 'entry' && sel.e.id === e.id) setSel({ t: 'entry', e }); };
  const orgName = org !== 'all' ? orgById.get(org)?.name : undefined;
  const letter = (id?: string, name?: string) => orgById.get(id ?? '')?.logoLetter ?? (name ?? '؟')[0];

  const exportCsv = () => {
    if (view === 'rial') {
      if (!moveRows.length) return;
      downloadCsv(`namadno-rial-moves${org !== 'all' ? '-' + org : ''}`, [
        ['تاریخ', 'ساعت', 'نوع', 'شرح', 'از', 'به', 'مبلغ (تومان)', 'سازمان', 'کاربر', 'مرجع'],
        ...moveRows.map((m) => [jDate(m.at), time(m.at), RIAL_MOVE[m.kind].label, m.title, m.from, m.to, raw(m.amount), m.orgName ?? '', m.userName ?? '', m.ref ?? m.packageId ?? '']),
      ]);
      toast(`فایل ${faDigits(moveRows.length)} ردیف گردش ریالی آماده شد`);
      return;
    }
    if (!ledgerRows.length) return;
    downloadCsv(`namadno-cash${org !== 'all' ? '-' + org : ''}`, [
      ['تاریخ', 'ساعت', 'نوع', 'شرح', 'سازمان', 'مبلغ (تومان)', 'مانده (تومان)', 'مرجع', 'ثبت‌کننده'],
      ...ledgerRows.map((e) => [jDate(e.at), time(e.at), CASH_KIND[e.kind].label, e.title, e.orgName ?? '', raw(e.amount), e.balanceAfter != null ? raw(e.balanceAfter) : '', e.ref ?? '', e.by ?? '']),
    ]);
    toast(`فایل ${faDigits(ledgerRows.length)} ردیف گردش حساب آماده شد`);
  };

  // ── chart: bank balance, Namadno free rial and «ریال رزرو» ──
  const hist = chartQ.data?.history ?? [];
  const bank = hist.map((h) => B(h.bank));
  const avl = hist.map((h) => B(h.available));
  const res = hist.map((h) => B(h.reserve));
  const lo = Math.min(0, ...avl, ...bank, ...res);
  const yMin = lo < 0 ? -Math.ceil(-lo / 10) * 10 : 0;
  const s = sumQ.data;
  const rt = rialQ.data;
  const h30 = s?.history ?? [];
  const change = h30.length > 1 ? h30[h30.length - 1].balance - h30[0].balance : 0;
  const target = rt?.main.target;

  // Namadno's free rial is never negative: users' sales it cannot pay wait in the queue → «نیاز به تأمین ریال»
  const need = rt?.main.needValue ?? 0;
  const freeNote = (): Pick<Stat, 'note' | 'trend'> => {
    if (!s) return {};
    if (need > 0) return { note: `نیاز به تأمین ریال ${amt(need)}`, trend: 'down' };
    if (target && s.available < target.minFreeValue) return { note: `زیر حداقل ${amt(target.minFreeValue)}`, trend: 'warn' };
    if (target?.maxFreeValue && s.available > target.maxFreeValue) return { note: `بالاتر از سقف ${amt(target.maxFreeValue)}` };
    return { note: target ? 'در محدوده‌ی هدف' : 'قابل استفاده برای صدور', trend: target ? 'up' : undefined };
  };

  const acctCols: Column<OrgRialAccount>[] = [
    {
      key: 'org', label: 'سازمان', width: 'minmax(0, 1.5fr)',
      render: (a) => <Ident lead={<Ava letter={letter(a.orgId, a.orgName)} id={a.orgId} sq />} title={a.orgName} sub={ORG_STATUS[a.status].label} />,
    },
    { key: 'free', label: ORG_RIAL.free.label, width: '112px', render: (a) => (a.free > 0 ? <span className="num">{amt(a.free)}</span> : <Dash />) },
    { key: 'blocked', label: ORG_RIAL.blocked.label, width: '112px', render: (a) => (a.blocked > 0 ? <span className="num">{amt(a.blocked)}</span> : <Dash />) },
    {
      // packages waiting for their receipt approval: nothing delivered or blocked; what «آزاد» covered is set aside
      key: 'queued', label: ORG_RIAL.queued.label, width: '132px', col: true,
      render: (a) => (a.queuedCount > 0
        ? <><span className="num" title={a.setAside > 0 ? `کنار گذاشته از آزاد ${amt(a.setAside)} تومان` : undefined}>{amt(a.queuedTotal)}</span><span className="sm">{faDigits(a.queuedCount)} بسته · تا تأیید فیش</span></>
        : <Dash />),
    },
    {
      key: 'pending', label: ORG_RIAL.pending.label, width: '124px', col: true,
      render: (a) => (a.pending > 0 ? <><span className="num">{amt(a.pending)}</span><span className="sm">{faDigits(a.pendingCount)} فیش</span></> : <Dash />),
    },
    { key: 'bal', label: 'مانده', width: '112px', align: 'end', render: (a) => <span className="num mute">{amt(a.balance)}</span> },
  ];

  const depCols: Column<CashEntry>[] = [
    {
      key: 'org', label: 'سازمان', width: 'minmax(0, 1.2fr)',
      render: (e) => <Ident lead={<Ava letter={letter(e.orgId, e.orgName)} id={e.orgId ?? e.id} sq />} title={e.orgName ?? '—'} sub={e.submittedBy} />,
    },
    {
      key: 'for', label: 'بابت', width: 'minmax(0, 1fr)', col: true,
      render: (e) => (
        <>
          <span className="el" style={{ maxWidth: '100%' }}>{depositPurpose(e)}</span>
          <span className="sm">{e.forPackage
            ? (e.forPackage.status === 'queued' ? `بسته در صف · ${faDigits(e.forPackage.recipients)} همکار` : `بسته · ${faDigits(e.forPackage.recipients)} همکار`)
            : e.packageId || /«/.test(e.title) ? 'بسته' : 'شارژ حساب آزاد سازمان'}</span>
        </>
      ),
    },
    { key: 'amount', label: 'مبلغ (تومان)', width: '132px', render: (e) => <span className="num" style={{ fontWeight: 600 }}>{money(e.amount)}</span> },
    { key: 'rcp', label: 'فیش', width: '56px', render: (e) => <ReceiptThumb receipt={e.receipt} size={36} /> },
    {
      key: 'note', label: 'توضیحات', width: 'minmax(0, 1.1fr)', col: true,
      render: (e) => (e.status === 'rejected' && e.rejectReason
        ? <><span className="sm el" style={{ maxWidth: '100%', color: 'var(--error-text)' }} title={e.rejectReason}>رد: {e.rejectReason}</span>{e.note && <span className="sm el" style={{ maxWidth: '100%' }}>{e.note}</span>}</>
        : e.note ? <span className="sm el" style={{ maxWidth: '100%' }} title={e.note}>{e.note}</span> : <Dash />),
    },
    {
      key: 'at', label: depTab === 'done' ? 'زمان تأیید' : 'زمان ارسال', width: '104px', col: true,
      render: (e) => { const w = receiptTime(e); return <><span className="num">{jDate(w.at)}</span><span className="sm num">{time(w.at)}</span></>; },
    },
    { key: 'st', label: 'وضعیت', width: '112px', render: (e) => { const c = cashStatus(e); return <Pill tone={c.tone} dot>{c.label}</Pill>; } },
    {
      key: 'act', label: <span className="sr-only">اقدام</span>, width: '88px', align: 'end',
      render: (e) => (
        <button
          type="button" className={e.status === 'expected' ? 'nm-btn sm line' : 'nm-btn sm ghost'}
          aria-label={`${e.status === 'expected' ? 'بررسی' : 'مشاهده‌ی'} فیش ${e.orgName ?? ''} · ${depositPurpose(e)}`}
          onClick={(ev) => { ev.stopPropagation(); setReview(e); }}
        >
          {e.status === 'expected' ? 'بررسی' : 'مشاهده'}
        </button>
      ),
    },
  ];

  const ledCols: Column<CashEntry>[] = [
    { key: 'at', label: 'تاریخ', width: '96px', col: true, render: (e) => <><span className="num">{jDate(e.at)}</span><span className="sm num">{time(e.at)}</span></> },
    { key: 'kind', label: 'نوع', width: '120px', render: (e) => <Pill tone={CASH_KIND[e.kind].tone}>{CASH_KIND[e.kind].label}</Pill> },
    {
      key: 'title', label: 'شرح', width: 'minmax(0, 1.6fr)', col: true,
      render: (e) => {
        const meta = [e.orgName, e.ref && `مرجع ${e.ref}`, e.by].filter(Boolean).join(' · ');
        return <><span className="el" style={{ maxWidth: '100%' }}>{e.title}</span>{meta && <span className="sm el" style={{ maxWidth: '100%' }}>{meta}</span>}</>;
      },
    },
    {
      key: 'amount', label: 'مبلغ (تومان)', width: '150px', align: 'end',
      render: (e) => <span className="num" style={e.amount > 0 ? { color: 'var(--success-text)', fontWeight: 600 } : { fontWeight: 600 }}>{signed(e.amount)}</span>,
    },
    { key: 'bal', label: 'مانده (تومان)', width: '150px', align: 'end', render: (e) => <span className="num mute">{e.balanceAfter != null ? money(e.balanceAfter) : '—'}</span> },
  ];

  const moveCols: Column<RialMove>[] = [
    { key: 'at', label: 'زمان', width: '96px', col: true, render: (m) => <><span className="num">{jDate(m.at)}</span><span className="sm num">{time(m.at)}</span></> },
    { key: 'kind', label: 'نوع', width: '150px', render: (m) => <Pill tone={RIAL_MOVE[m.kind].tone} icon={RIAL_MOVE[m.kind].d}>{RIAL_MOVE[m.kind].label}</Pill> },
    {
      key: 'ends', label: 'از ← به', width: 'minmax(0, 1.8fr)', col: true,
      render: (m) => <><MoveEnds m={m} /><span className="sm el" style={{ maxWidth: '100%' }}>{m.title}</span></>,
    },
    { key: 'amount', label: 'مبلغ (تومان)', width: '140px', align: 'end', render: (m) => <span className="num" style={{ fontWeight: 600 }}>{money(m.amount)}</span> },
    {
      key: 'ref', label: 'مرجع', width: '120px',
      render: (m) => (m.ref || m.packageId ? <span className="sm num ltr el" style={{ textAlign: 'right' }}>{m.ref ?? m.packageId}</span> : <Dash />),
    },
  ];

  const viewTabs = <Tabs label="نوع گردش" value={view} onChange={setView} items={[{ key: 'bank', label: 'حساب بانکی' }, { key: 'rial', label: 'گردش ریالی' }]} />;

  return (
    <>
      <PageHeading {...HEAD}>
        <button type="button" className="nm-btn ghost" onClick={exportCsv} disabled={view === 'rial' ? !moveRows.length : !ledgerRows.length}><Icon d={TI.download} size={17} />خروجی گردش</button>
        <button type="button" className="nm-btn" onClick={() => setRecord({ key: Date.now(), orgId: org !== 'all' ? org : undefined })}><Icon d={TI.plus} size={17} strokeWidth={2} />ثبت واریز</button>
      </PageHeading>

      {sumQ.isError ? <ErrorBlock error={sumQ.error} onRetry={() => sumQ.refetch()} /> : (
        <StatStrip loading={!s} items={s ? [
          {
            label: 'موجودی حساب بانکی', ...scaled(s.balance),
            note: change ? `${change > 0 ? '+' : '−'}${amt(Math.abs(change))} در ۳۰ روز` : 'بدون تغییر در ۳۰ روز', trend: change > 0 ? 'up' : undefined,
          },
          { label: 'ریال آزاد نمادنو', ...scaled(Math.max(0, s.available)), ...freeNote(), href: need > 0 ? `${routes.op.funds}?state=need_buy` : routes.op.planning },
          {
            label: 'ریال رزرو', ...scaled(s.reserve),
            note: queuedAccts.length ? `بسته در صف ${faDigits(sum(queuedAccts.map((a) => a.queuedCount)))} · ${amt(sum(queuedAccts.map((a) => a.queuedTotal)))}` : 'بسته‌های ارسالی تا دریافت گیرندگان',
            onClick: () => setAcctTab((t) => (t === 'queued' ? 'all' : 'queued')), active: acctTab === 'queued',
          },
          {
            label: 'کیف پول کاربران', ...scaled(s.userWallets),
            note: rt && rt.main.usersReserved > 0 ? `رزرو ${amt(rt.main.usersReserved)} · مال کاربران` : 'مال کاربران',
          },
          {
            // organizations' rial accounts: free balance, with the receipts waiting for review (five items at most per the Panel kit)
            label: 'حساب آزاد سازمان‌ها', ...scaled(s.orgFree),
            note: s.expectedCount ? `فیش در انتظار تأیید ${faDigits(s.expectedCount)} · ${amt(s.expectedDeposits)}` : 'فیشی در انتظار تأیید نیست',
            trend: s.expectedCount ? 'warn' : undefined,
            onClick: () => setAcctTab((t) => (t === 'pending' ? 'all' : 'pending')), active: acctTab === 'pending',
          },
        ] : []} />
      )}

      <div className="nm-grid side">
        <Card
          title="موجودی حساب بانکی" sub="میلیارد تومان"
          actions={<Tabs label="بازه‌ی نمودار" value={range} onChange={setRange} items={[{ key: 30, label: '۳۰ روز' }, { key: 90, label: '۹۰ روز' }]} />}
        >
          {chartQ.isError ? <ErrorBlock error={chartQ.error} flat onRetry={() => chartQ.refetch()} />
            : !chartQ.data ? <SkeletonCard h={240} />
            : (
              <>
                <LineChart
                  labels={hist.map((h) => jDayMonth(h.t))} min={yMin} fmt={(n) => dec(n, 0)} height={260}
                  label={`موجودی حساب بانکی ${faDigits(range)} روز اخیر: از ${amt(hist[0]?.bank ?? 0)} به ${amt(hist[hist.length - 1]?.bank ?? 0)} تومان`}
                  series={[
                    { name: 'موجودی حساب بانکی (میلیارد تومان)', color: 'var(--chart-1)', values: bank, area: true },
                    { name: 'ریال آزاد نمادنو (میلیارد تومان)', color: 'var(--chart-3)', values: avl, dashed: true },
                    { name: 'ریال رزرو (میلیارد تومان)', color: 'var(--secondary-main)', values: res },
                  ]}
                />
                <Legend items={[
                  { label: 'موجودی حساب بانکی', color: 'var(--chart-1)', value: amt(chartQ.data.bank) },
                  { label: 'ریال آزاد نمادنو', color: 'var(--chart-3)', value: amt(chartQ.data.main.available) },
                  { label: 'ریال رزرو', color: 'var(--secondary-main)', value: amt(chartQ.data.reserve.held) },
                ]} />
              </>
            )}
        </Card>

        <Card title="ترکیب مانده" sub="امروز · بر اساس صاحب پول">
          {!s ? <SkeletonCard h={240} /> : (
            <>
              <Allocation compact items={[
                { label: 'کیف پول کاربران', value: s.userWallets, color: 'var(--grey-500)' },
                { label: 'حساب آزاد سازمان‌ها', value: s.orgFree, color: 'var(--success-main)' },
                ...(s.orgSetAside > 0 ? [{ label: 'کنار گذاشته برای بسته‌های در صف', value: s.orgSetAside, color: 'var(--info-main)' }] : []),
                { label: 'سفارش‌های باز', value: s.tiedInOrders, color: 'var(--primary-main)' },
                { label: 'ریال رزرو', value: s.reserve, color: 'var(--secondary-main)' },
                { label: 'ریال آزاد نمادنو', value: Math.max(0, s.available), color: 'var(--chart-3)' },
              ]} />
              <KV rows={[
                ['کیف پول کاربران', <span key="w" className="num">{money(s.userWallets)}</span>],
                ['حساب آزاد سازمان‌ها', <span key="o" className="num">{money(s.orgFree)}</span>],
                ...(s.orgSetAside > 0 ? [['کنار گذاشته برای بسته‌های در صف', <span key="q" className="num">{money(s.orgSetAside)}</span>] as [ReactNode, ReactNode]] : []),
                ['در سفارش‌های باز', <span key="t" className="num">{money(s.tiedInOrders)}</span>],
                ['ریال رزرو', <span key="r" className="num">{money(s.reserve)}</span>],
                ['ریال آزاد نمادنو', <span key="a" className="num">{money(Math.max(0, s.available))}</span>],
                [<b key="k">موجودی حساب بانکی</b>, <b key="b" className="num">{money(s.balance)}</b>],
              ]} />
              {need > 0 && rt
                ? (
                  <Note tone="err" icon={TI.wallet} action={<Link href={`${routes.op.funds}?state=need_buy`} className="nm-btn sm text">صف تأمین</Link>}>
                    {faDigits(rt.main.queuedCount)} فروش کاربر در صف واریز است؛ نیاز به تأمین ریال {amt(need)} تومان. با تسویه‌ی ابطال، فروش‌ها خودکار پرداخت می‌شوند.
                  </Note>
                )
                : <span className="mute" style={{ fontSize: 12 }}>همه‌ی مبالغ به تومان. فیش‌های در انتظار تأیید جزو موجودی نیستند. ریال آزاد نمادنو سقف سفارش‌های صدور تازه است.</span>}
            </>
          )}
        </Card>
      </div>

      <Card flush title="حساب ریالی سازمان‌ها" count={accounts.length || undefined} sub="آزاد، بلاک‌شده در ریال رزرو و بسته‌هایی که تا تأیید فیش در صف می‌مانند">
        <Toolbar>
          <Tabs label="وضعیت حساب سازمان" value={acctTab} onChange={setAcctTab} items={[
            { key: 'all', label: 'همه', count: accounts.length },
            { key: 'pending', label: ORG_RIAL.pending.label, count: pendingAccts.length, hot: true },
            { key: 'queued', label: ORG_RIAL.queued.label, count: queuedAccts.length },
          ]} />
          <span className="grow" />
          <SearchField value={acctQ} onChange={setAcctQ} placeholder="نام سازمان" label="جستجوی حساب سازمان" width={200} />
        </Toolbar>
        <Table
          columns={acctCols} rows={acctPg.rows} rowKey={(a) => a.orgId} rowLabel={(a) => `حساب ریالی ${a.orgName}`}
          onRowClick={pickAcct} selectedKey={sel?.t === 'org' ? sel.id : null}
          loading={rialQ.isLoading} error={rialQ.isError ? rialQ.error : undefined} onRetry={() => rialQ.refetch()}
          empty={(
            <Empty
              icon={TI.org} tone={acctTab === 'all' ? undefined : 'success'}
              title={acctTab === 'queued' ? 'بسته‌ای در صف تأیید فیش نیست' : acctTab === 'pending' ? 'فیشی در انتظار تأیید نیست' : 'حسابی پیدا نشد'}
              action={acctNeedle ? <button type="button" className="nm-btn sm ghost" onClick={() => setAcctQ('')}>پاک کردن جستجو</button> : undefined}
            />
          )}
          minWidth={820}
        />
        <TableFoot shown={acctPg.rows.length} total={acctRows.length} unit="سازمان" page={acctPg.page} pages={acctPg.pages} onPage={acctPg.setPage}>
          {acctRows.length > 0 && (
            <span className="num">
              آزاد <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(acctRows.map((a) => a.free)))}</b>
              {' '}· بلاک <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(acctRows.map((a) => a.blocked)))}</b>
              {sum(acctRows.map((a) => a.queuedTotal)) > 0 && <> · در صف <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(acctRows.map((a) => a.queuedTotal)))}</b></>}
              {' '}تومان
            </span>
          )}
        </TableFoot>
      </Card>

      <Card flush title="فیش‌های واریز" count={expOrg.length || undefined} sub={orgName ?? 'بارگذاری‌شده از پنل سازمان‌ها؛ با تأیید، مبلغ به حساب آزاد سازمان اضافه می‌شود'}>
        <Toolbar>
          <Tabs label="وضعیت فیش" value={depTab} onChange={setDepTab} items={[
            { key: 'expected', label: 'در انتظار تأیید', count: expOrg.length, hot: true },
            { key: 'done', label: 'تأییدشده', count: doneOrg.length },
            { key: 'rejected', label: 'ردشده', count: rejOrg.length },
          ]} />
          <span className="grow" />
          <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={setOrg} align="end" options={orgOptions} />
        </Toolbar>
        <Table
          columns={depCols} rows={depPg.rows} rowKey={(e) => e.id} rowLabel={(e) => `فیش ${e.orgName ?? ''} · ${depositPurpose(e)} · ${cashStatus(e).label}`}
          onRowClick={pickEntry} selectedKey={liveEntry?.id ?? null}
          loading={depQ.isLoading} error={depQ.isError ? depQ.error : undefined} onRetry={() => depQ.refetch()}
          empty={(
            <Empty
              icon={TI.deposit} tone={depTab === 'expected' ? 'success' : undefined}
              title={depTab === 'done' ? 'فیش تأییدشده‌ای نیست' : depTab === 'rejected' ? 'فیش ردشده‌ای نیست' : 'فیشی در انتظار تأیید نیست'}
              sub={orgName ? `برای ${orgName}` : depTab === 'expected' ? 'فیش‌هایی که سازمان‌ها از پنل خود بارگذاری می‌کنند این‌جا بررسی می‌شوند.' : undefined}
            />
          )}
          minWidth={940}
        />
        <TableFoot shown={depPg.rows.length} total={depRows.length} unit="فیش" page={depPg.page} pages={depPg.pages} onPage={depPg.setPage}>
          {depRows.length > 0 && <span className="num">جمع <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(depRows.map((e) => e.amount)))}</b> تومان</span>}
        </TableFoot>
      </Card>

      {view === 'bank' ? (
        <Card flush title="گردش حساب بانکی" sub={orgName} actions={viewTabs}>
          <Toolbar>
            <Tabs label="جهت گردش" value={dir} onChange={setDir} items={[
              { key: 'all', label: 'همه', count: ledger.length },
              { key: 'in', label: 'ورودی', count: ledger.filter((e) => e.amount > 0).length },
              { key: 'out', label: 'خروجی', count: ledger.filter((e) => e.amount < 0).length },
            ]} />
            <span className="grow" />
            <Select label="نوع ردیف" prefix="نوع" value={kind} onChange={setKind} align="end"
              options={[{ key: 'all', label: 'همه' }, ...KINDS.map((k) => ({ key: k, label: CASH_KIND[k].label }))]} />
            <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={setOrg} align="end" options={orgOptions} />
            <SearchField value={q} onChange={setQ} placeholder="شرح، سازمان یا مرجع" label="جستجوی گردش حساب" width={200} />
          </Toolbar>
          <Table
            columns={ledCols} rows={ledPg.rows} rowKey={(e) => e.id} rowLabel={(e) => `${e.title} · ${signed(e.amount)} تومان`}
            onRowClick={pickEntry} selectedKey={liveEntry?.id ?? null}
            loading={ledgerQ.isLoading} error={ledgerQ.isError ? ledgerQ.error : undefined} onRetry={() => ledgerQ.refetch()}
            empty={(
              <Empty
                icon={TI.cash} title="ردیفی با این فیلترها نیست"
                action={(needle || dir !== 'all' || kind !== 'all' || org !== 'all') ? <button type="button" className="nm-btn sm ghost" onClick={() => { setQ(''); setDir('all'); setKind('all'); setOrg('all'); }}>پاک کردن فیلترها</button> : undefined}
              />
            )}
            minWidth={820}
          />
          <TableFoot shown={ledPg.rows.length} total={ledgerRows.length} unit="ردیف" page={ledPg.page} pages={ledPg.pages} onPage={ledPg.setPage}>
            {ledgerRows.length > 0 && (
              <span className="num">
                ورودی <b style={{ color: 'var(--success-text)', fontWeight: 600 }}>+{amt(inSum)}</b> · خروجی <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(outSum)}</b> تومان
              </span>
            )}
          </TableFoot>
        </Card>
      ) : (
        <Card flush title="گردش ریالی" sub={orgName ?? 'میان ریال، ریال رزرو، کیف پول کاربران و حساب سازمان‌ها'} actions={viewTabs}>
          <Toolbar>
            <span className="grow" />
            <Select label="نوع گردش ریالی" prefix="نوع" value={moveKind} onChange={setMoveKind} align="end"
              options={[{ key: 'all', label: 'همه' }, ...MOVE_KINDS.map((k) => ({ key: k, label: RIAL_MOVE[k].label }))]} />
            <Select label="سازمان" prefix="سازمان" icon={TI.org} value={org} onChange={setOrg} align="end" options={orgOptions} />
            <SearchField value={q} onChange={setQ} placeholder="شرح، حساب یا مرجع" label="جستجوی گردش ریالی" width={200} />
          </Toolbar>
          <Table
            columns={moveCols} rows={movePg.rows} rowKey={(m) => m.id} rowLabel={(m) => `${RIAL_MOVE[m.kind].label} · ${m.title} · ${money(m.amount)} تومان`}
            onRowClick={pickMove} selectedKey={liveMove?.id ?? null}
            loading={movesQ.isLoading} error={movesQ.isError ? movesQ.error : undefined} onRetry={() => movesQ.refetch()}
            empty={(
              <Empty
                icon={TI.wallet} title="گردش ریالی با این فیلترها نیست"
                action={(needle || moveKind !== 'all' || org !== 'all') ? <button type="button" className="nm-btn sm ghost" onClick={() => { setQ(''); setMoveKind('all'); setOrg('all'); }}>پاک کردن فیلترها</button> : undefined}
              />
            )}
            minWidth={820}
          />
          <TableFoot shown={movePg.rows.length} total={moveRows.length} unit="ردیف" page={movePg.page} pages={movePg.pages} onPage={movePg.setPage}>
            {moveRows.length > 0 && <span className="num">جمع <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(sum(moveRows.map((m) => m.amount)))}</b> تومان · {faDigits(moves.length)} ردیف اخیر</span>}
          </TableFoot>
        </Card>
      )}

      {liveEntry && <CashInspector key={`insp-${liveEntry.id}`} entry={liveEntry} orgLetter={orgById.get(liveEntry.orgId ?? '')?.logoLetter} onReview={setReview} onClose={closeInspector} />}
      {liveAcct && (
        <OrgRialInspector
          key={`acct-${liveAcct.orgId}`} account={liveAcct} orgLetter={orgById.get(liveAcct.orgId)?.logoLetter} onClose={closeInspector}
          onReview={setReview} onRecord={(id) => setRecord({ key: Date.now(), orgId: id, keep: true })}
          onEntry={(e) => setSel({ t: 'entry', e })} onMove={(m) => setSel({ t: 'move', m })}
        />
      )}
      {liveMove && <RialMoveInspector key={`move-${liveMove.id}`} m={liveMove} orgLetter={orgById.get(liveMove.orgId ?? '')?.logoLetter} onClose={closeInspector} />}
      {review && (
        <ReviewDepositDialog
          key={`review-${review.id}`} entry={review} orgLetter={orgById.get(review.orgId ?? '')?.logoLetter}
          onClose={() => setReview(null)} onDone={reviewed}
        />
      )}
      {record && (
        <RecordDepositDialog
          key={`record-${record.key}`} orgs={orgs} expected={expected} orgId={record.orgId}
          onClose={() => setRecord(null)} onDone={(e) => { if (!record.keep) setSel({ t: 'entry', e }); }}
        />
      )}
    </>
  );
}
