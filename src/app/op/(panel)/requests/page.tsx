'use client';
/** /op/requests — design: op-requests.dc.html (all organizations; kind tabs, status filter, search, sort, detail panel, approve / reject with note). */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useDecideOpRequest, useOpRequests, useOpUsers } from '@/api/op';
import { useEscalateRequest, useReopenRequest, useRequestMeta, useUpdateRequestChecks, type RequestMeta } from '@/api/op-system-extra';
import type { ApprovalRequest, RequestKind } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { durFa, errMsg, hhmm, sameDay } from '@/components/op/system/fmt';
import { Chip, DlgHead, Drawer, FormError, IC, Lbl, Modal, Seg, TILE_TONES, TONES, type ToneKey } from '@/components/op/system/ui';

const KIND: Record<RequestKind, { label: string; tone: ToneKey }> = {
  loan: { label: 'وام', tone: 'info' },
  installment: { label: 'خرید اقساطی', tone: 'success' },
  cash_withdrawal: { label: 'برداشت', tone: 'primary' },
  profile_change: { label: 'KYC', tone: 'default' },
  credit_increase: { label: 'افزایش اعتبار', tone: 'warning' },
  milestone_release: { label: 'آزادسازی مرحله', tone: 'secondary' },
};
const TABS: { key: string; label: string; kinds: RequestKind[] | null }[] = [
  { key: 'all', label: 'همه', kinds: null },
  { key: 'loan', label: 'وام', kinds: ['loan'] },
  { key: 'bnpl', label: 'خرید اقساطی', kinds: ['installment'] },
  { key: 'wd', label: 'برداشت', kinds: ['cash_withdrawal'] },
  { key: 'kyc', label: 'KYC', kinds: ['profile_change'] },
  { key: 'other', label: 'سایر', kinds: ['credit_increase', 'milestone_release'] },
];
const CHECKS: Record<RequestKind, string[]> = {
  loan: ['هویت با KYC تطابق دارد', 'بخش آزاد برای قفل وثیقه کافی است', 'سقف قرارداد سازمان رعایت شده', 'وام فعال همزمان ندارد', 'قسط کمتر از ۴۰٪ ورودی ماهانه'],
  installment: ['فروشگاه طرف قرارداد و فعال است', 'فاکتور کالا با مبلغ تطابق دارد', 'بخش آزاد برای قفل اقساطی کافی است', 'سقف خرید اقساطی سازمان رعایت شده'],
  cash_withdrawal: ['شبای مقصد به نام کاربر است', 'مبلغ فقط از بخش آزاد است (بدون قفل یا مسدودی)', 'الگوی برداشت غیرعادی نیست', 'دستگاه و IP شناخته‌شده است'],
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
const SORTS = [{ key: 0, label: 'فوری‌ترین' }, { key: 1, label: 'پرریسک‌ترین' }, { key: 2, label: 'جدیدترین' }];
const STATUSES = [{ key: 'all', label: 'همه' }, { key: 'pending', label: 'باز' }, { key: 'approved', label: 'تأییدشده' }, { key: 'rejected', label: 'ردشده' }];
const COLS = '84px minmax(0, 1fr) 100px 128px 96px 104px 96px 80px';

const riskCol = (r: number) => (r < 30 ? 'var(--success-main)' : r < 60 ? 'var(--warning-main)' : 'var(--error-main)');
function statusOf(r: ApprovalRequest, m?: RequestMeta): { label: string; tone: ToneKey } {
  if (r.status === 'approved') return { label: 'تأییدشده', tone: 'success' };
  if (r.status === 'rejected') return { label: 'ردشده', tone: 'error' };
  return (m?.riskScore ?? 0) >= 60 ? { label: 'بررسی دستی', tone: 'info' } : { label: 'در انتظار', tone: 'warning' };
}
function slaOf(r: ApprovalRequest, m?: RequestMeta) {
  if (r.status !== 'pending' || !m) return { t: '—', min: Infinity, fg: 'var(--text-disabled)', bar: 'var(--grey-400)', pct: 100, note: 'بسته شد' };
  const min = (new Date(m.slaDueAt).getTime() - now().getTime()) / 60000;
  if (min <= 0) return { t: 'گذشته', min, fg: 'var(--error-text)', bar: 'var(--error-main)', pct: 100, note: 'مهلت SLA تمام شده' };
  return { t: hhmm(min), min, fg: min < 60 ? 'var(--error-text)' : min < 240 ? 'var(--warning-text)' : 'var(--text-secondary)', bar: min < 60 ? 'var(--error-main)' : min < 240 ? 'var(--warning-main)' : 'var(--success-main)', pct: Math.max(4, Math.min(100, Math.round((min / 1440) * 100))), note: 'ساعت مانده' };
}

export default function OpRequestsPage() {
  const toast = useToast();
  const reqs = useOpRequests();
  const metaQ = useRequestMeta();
  const users = useOpUsers();
  const decide = useDecideOpRequest();
  const reopen = useReopenRequest();
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState(0);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);

  const all = reqs.data ?? [];
  const meta = metaQ.data ?? {};
  const userIds = useMemo(() => new Set((users.data ?? []).map((u) => u.id)), [users.data]);
  const tabDef = TABS.find((t) => t.key === tab) ?? TABS[0];
  const inTab = (r: ApprovalRequest, t = tabDef) => !t.kinds || t.kinds.includes(r.kind);

  const rows = useMemo(() => {
    const text = q.trim();
    const list = all.filter((r) => inTab(r) && (status === 'all' || r.status === status) && (!text || r.id.toLowerCase().includes(text.toLowerCase()) || r.requesterName.includes(text) || r.orgName.includes(text)));
    return list.sort((a, b) => {
      if (sort === 0) return slaOf(a, meta[a.id]).min - slaOf(b, meta[b.id]).min || b.createdAt.localeCompare(a.createdAt);
      if (sort === 1) return (meta[b.id]?.riskScore ?? 0) - (meta[a.id]?.riskScore ?? 0);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [all, meta, tab, status, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabTotal = all.filter((r) => inTab(r) && (status === 'all' || r.status === status)).length;

  const pending = all.filter((r) => r.status === 'pending');
  const nearSla = pending.filter((r) => slaOf(r, meta[r.id]).min < 240).length;
  const decided = all.filter((r) => r.decidedAt);
  const avgMin = decided.length ? decided.reduce((s, r) => s + (new Date(r.decidedAt!).getTime() - new Date(r.createdAt).getTime()) / 60000, 0) / decided.length : 0;
  const approvedToday = all.filter((r) => r.status === 'approved' && r.decidedAt && sameDay(r.decidedAt, now())).length;
  const stats: { title: string; value: string; d: string; tone: ToneKey }[] = [
    { title: 'در انتظار بررسی', value: faDigits(pending.length), d: IC.inbox, tone: 'warning' },
    { title: 'نزدیک به نقض SLA', value: faDigits(nearSla), d: IC.clock, tone: 'error' },
    { title: 'میانگین زمان بررسی', value: decided.length ? durFa(avgMin) : '—', d: IC.check, tone: 'info' },
    { title: 'تأییدشده امروز', value: faDigits(approvedToday), d: IC.check, tone: 'success' },
  ];

  const approve = (r: ApprovalRequest) => decide.mutate({ id: r.id, approve: true }, { onSuccess: () => toast(`درخواست ${r.id} تأیید شد`), onError: (e) => toast(errMsg(e), 'error') });
  const undo = (r: ApprovalRequest) => reopen.mutate({ id: r.id }, { onSuccess: () => toast(`درخواست ${r.id} به صف بررسی بازگشت`, 'info'), onError: (e) => toast(errMsg(e), 'error') });
  const selReq = all.find((r) => r.id === sel) ?? null;
  const rejReq = all.find((r) => r.id === rejectFor) ?? null;

  return (
    <>
      <PageHeading title="درخواست‌ها" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'عملیات', href: routes.op.overview }, { label: 'درخواست‌ها' }]}>
        <Link href={routes.op.rules} className="btno"><Icon d={IC.rules} size={18} />قوانین تأیید خودکار</Link>
      </PageHeading>

      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 20 }}>
        {stats.map((s) => (
          <div key={s.title} className="card" style={{ boxSizing: 'border-box', height: 84, padding: '0 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: TONES[s.tone][0], color: TONES[s.tone][1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={s.d} size={20} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{s.title}</span><span className="num" style={{ fontSize: 22, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{reqs.isLoading ? '—' : s.value}</span></span>
          </div>
        ))}
      </div>

      <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div role="tablist" style={{ height: 48, flex: 'none', display: 'flex', alignItems: 'stretch', gap: 28, padding: '0 20px', boxShadow: 'inset 0 -2px 0 var(--divider)', overflowX: 'auto' }}>
          {TABS.map((t) => {
            const on = t.key === tab;
            const count = all.filter((r) => r.status === 'pending' && inTab(r, t)).length;
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', boxShadow: `inset 0 -2px 0 ${on ? 'var(--text-primary)' : 'transparent'}`, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {t.label}<span className="lbl" style={{ height: 22, padding: '0 7px', background: on ? 'var(--contained-default)' : 'var(--soft-default)', color: on ? 'var(--contained-default-text)' : 'var(--default-text)' }}>{faDigits(count)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 'none', boxSizing: 'border-box', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="rq-search" style={{ width: 260, display: 'flex', alignItems: 'center', gap: 8, height: 38, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', color: 'var(--text-secondary)', cursor: 'text' }}>
            <Icon d={IC.search} size={18} />
            <input id="rq-search" value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="شناسه درخواست یا نام کاربر" style={{ flex: 1, minWidth: 0, height: 36, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 0 }} />
          </label>
          <Seg label="وضعیت" items={STATUSES} value={status} onChange={setStatus} track="var(--bg-neutral)" />
          <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>مرتب‌سازی</span>
          <Seg label="مرتب‌سازی" items={SORTS} value={sort} onChange={setSort} track="var(--bg-neutral)" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 860 }}>
            <div style={{ height: 38, display: 'grid', gridTemplateColumns: COLS, gap: 8, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
              <span>شناسه</span><span>کاربر</span><span>نوع</span><span>مبلغ (تومان)</span><span>SLA</span><span>امتیاز ریسک</span><span>وضعیت</span><span>اقدام</span>
            </div>
            {reqs.isLoading && <div style={{ padding: 20 }}><Skeleton h={180} /></div>}
            {reqs.isError && <div style={{ padding: 20 }}><ErrorState message={errMsg(reqs.error)} onRetry={() => reqs.refetch()} /></div>}
            {rows.map((r, i) => {
              const m = meta[r.id];
              const k = KIND[r.kind];
              const s = statusOf(r, m);
              const sla = slaOf(r, m);
              const risk = m?.riskScore ?? 0;
              const [abg, afg] = TONES[TILE_TONES[i % 6]];
              const recent = r.status !== 'pending' && !!r.decidedAt && sameDay(r.decidedAt, now());
              const busy = (decide.isPending && decide.variables?.id === r.id) || (reopen.isPending && reopen.variables?.id === r.id);
              return (
                <div key={r.id} role="button" tabIndex={0} aria-pressed={sel === r.id} onClick={() => setSel(r.id)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(r.id); } }}
                  className="hov" style={{ minHeight: 60, display: 'grid', gridTemplateColumns: COLS, gap: 8, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: sel === r.id ? 'var(--nav-active)' : undefined }}>
                  <span className="num" dir="ltr" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right' }}>{r.id}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: abg, color: afg, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{r.requesterName[0]}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.requesterName}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.orgName}</span></span>
                  </span>
                  <span><Lbl tone={k.tone}>{k.label}</Lbl></span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 400 }}>{r.amount ? money(r.amount) : '—'}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: sla.fg, fontWeight: 600 }}><Icon d={IC.clock} size={16} /><span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 600 }}>{sla.t}</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 56, height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden', flex: 'none' }}><span style={{ display: 'block', height: '100%', width: `${risk}%`, background: riskCol(risk), borderRadius: 3 }} /></span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{faDigits(risk)}</span>
                  </span>
                  <span><Lbl tone={s.tone}>{s.label}</Lbl></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e: React.MouseEvent) => e.stopPropagation()} onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}>
                    {r.status === 'pending' ? (
                      <>
                        <button type="button" aria-label={`تأیید درخواست ${r.id}`} title="تأیید" disabled={busy} onClick={() => approve(r)} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: busy ? 0.5 : 1 }}><Icon d={IC.check} size={16} strokeWidth={2.2} /></button>
                        <button type="button" aria-label={`رد درخواست ${r.id}`} title="رد" disabled={busy} onClick={() => setRejectFor(r.id)} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: 'var(--soft-error)', color: 'var(--error-text)', display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0, opacity: busy ? 0.5 : 1 }}><Icon d={IC.x} size={16} strokeWidth={2.2} /></button>
                      </>
                    ) : recent ? (
                      <button type="button" disabled={busy} onClick={() => undo(r)} style={{ height: 30, padding: '0 8px', borderRadius: 8, border: 0, background: 'transparent', color: 'var(--primary-text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>بازگردانی</button>
                    ) : <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>بسته شد</span>}
                  </span>
                </div>
              );
            })}
            {!reqs.isLoading && !rows.length && <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>درخواستی با این فیلتر یافت نشد</div>}
          </div>
        </div>
        <div style={{ minHeight: 52, flex: 'none', boxSizing: 'border-box', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>نمایش <span className="num">{faDigits(rows.length)}</span> درخواست از <span className="num">{faDigits(tabTotal)}</span></span>
          <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--error-main)' }} />کمتر از ۱ ساعت تا SLA<span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning-main)', marginRight: 10 }} />کمتر از ۴ ساعت</span>
        </div>
      </div>

      {selReq && <DetailPanel key={selReq.id} r={selReq} m={meta[selReq.id]} hasUser={userIds.has(selReq.requesterId)} onClose={() => setSel(null)} onReject={() => setRejectFor(selReq.id)} onUndo={() => undo(selReq)} />}
      {rejReq && <RejectDialog key={rejReq.id} r={rejReq} onClose={() => setRejectFor(null)} />}
    </>
  );
}

function DetailPanel({ r, m, hasUser, onClose, onReject, onUndo }: { r: ApprovalRequest; m?: RequestMeta; hasUser: boolean; onClose: () => void; onReject: () => void; onUndo: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const decide = useDecideOpRequest();
  const saveChecks = useUpdateRequestChecks();
  const escalate = useEscalateRequest();
  const list = CHECKS[r.kind];
  const [checks, setChecks] = useState<boolean[]>(() => list.map((_, i) => !!m?.checks[i]));
  useEffect(() => { if (m) setChecks(list.map((_, i) => !!m.checks[i])); }, [m]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = KIND[r.kind];
  const s = statusOf(r, m);
  const sla = slaOf(r, m);
  const risk = m?.riskScore ?? 0;
  const done = checks.filter(Boolean).length;
  const complete = done === list.length;
  const open = r.status === 'pending';
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
  const userCard = (
    <>
      <span style={{ width: 44, height: 44, borderRadius: '50%', background: TONES[k.tone][0], color: TONES[k.tone][1], display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, flex: 'none' }}>{r.requesterName[0]}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}><span style={{ fontSize: 14, fontWeight: 700 }}>{r.requesterName}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.orgName} · امتیاز اعتباری <span className="num">{m?.creditScore ? faDigits(m.creditScore) : '—'}</span></span></span>
    </>
  );
  const cardStyle: React.CSSProperties = { flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--bg-neutral)', color: 'inherit', textDecoration: 'none' };
  return (
    <Drawer open overlay={false} onClose={onClose} width={400} label="جزئیات درخواست" padding="20px">
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>درخواست <span dir="ltr">{r.id}</span></h6><Lbl tone={k.tone}>{k.label}</Lbl></span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ثبت: {relTime(r.createdAt, now())}</span>
        </span>
        <button type="button" className="ibtn" aria-label="بستن پنل" onClick={onClose} style={{ marginRight: 'auto', width: 32, height: 32 }}><Icon d={IC.x} size={18} /></button>
      </div>
      {!open && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: TONES[s.tone][0], color: TONES[s.tone][1], fontSize: 13, fontWeight: 600 }}>
          <Icon d={r.status === 'approved' ? IC.check : IC.x} size={18} strokeWidth={2} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{r.status === 'approved' ? 'تأیید شد' : 'رد شد'} توسط {r.decidedBy ?? '—'} · {r.decidedAt ? relTime(r.decidedAt, now()) : ''}</span>
            {r.note && <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.9 }}>{r.note}</span>}
          </span>
          {r.decidedAt && sameDay(r.decidedAt, now()) && <button type="button" onClick={onUndo} style={{ height: 28, padding: '0 8px', borderRadius: 8, border: 0, background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>بازگردانی</button>}
        </div>
      )}
      {hasUser ? <Link href={routes.op.user(r.requesterId)} style={cardStyle}>{userCard}<Icon d={IC.chevL} size={18} style={{ color: 'var(--text-secondary)' }} /></Link> : <div style={cardStyle}>{userCard}</div>}
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
        <span className="sec">جزئیات</span>
        {[{ k: 'عنوان', v: r.title }, { k: 'مبلغ', v: r.amount ? money(r.amount) + ' تومان' : '—' }, ...(m?.details ?? []).filter((x) => x.k !== 'عنوان')].map((x) => (
          <div key={x.k} style={{ minHeight: 34, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)', flex: 'none' }}>{x.k}</span>
            <span className="num" style={{ marginRight: 'auto', fontWeight: 600, fontSize: 13, textAlign: 'left' }}>{faDigits(x.v)}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>امتیاز ریسک</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 24, lineHeight: 1, color: riskCol(risk) }}>{faDigits(risk)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>از ۱۰۰ · {risk < 30 ? 'کم' : risk < 60 ? 'متوسط' : 'زیاد'}</span></span>
          <span style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${risk}%`, background: riskCol(risk), borderRadius: 3 }} /></span>
        </div>
        <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>مهلت SLA</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" dir="ltr" style={{ fontSize: 24, lineHeight: 1, color: sla.fg }}>{sla.t}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sla.note}</span></span>
          <span style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${sla.pct}%`, background: sla.bar, borderRadius: 3 }} /></span>
        </div>
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="sec">عوامل ریسک</span>
        {(m?.factors ?? []).map((f) => (
          <div key={f.t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minHeight: 26 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--${f.tone}-main)`, flex: 'none' }} /><span style={{ flex: 1 }}>{f.t}</span>
          </div>
        ))}
        {!m?.factors.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>عامل ریسک قابل‌توجهی ثبت نشده است</span>}
      </div>
      <div style={{ flex: 'none', padding: 14, borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14, fontWeight: 700 }}>بررسی دستی</span><Lbl tone={complete ? 'success' : 'warning'} style={{ marginRight: 'auto' }}>{faDigits(done)} از {faDigits(list.length)}</Lbl></div>
        {list.map((t, i) => (
          <button key={t} type="button" aria-pressed={checks[i]} disabled={!open} onClick={() => toggle(i)} style={{ minHeight: 36, display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, cursor: open ? 'pointer' : 'default', textAlign: 'right' }}>
            <span className={checks[i] ? 'ck on' : 'ck'}>{checks[i] && <Icon d={IC.check} size={14} strokeWidth={3} />}</span>
            <span style={{ flex: 1, color: checks[i] ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{t}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'auto', flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {open && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btnp" onClick={approve} disabled={decide.isPending} style={{ flex: 1, height: 40, fontSize: 14, opacity: complete && !decide.isPending ? 1 : 0.6 }}><Icon d={IC.check} size={18} strokeWidth={2} />تأیید</button>
            <button type="button" className="btno" onClick={onReject} style={{ flex: 1, height: 40, fontSize: 14, color: 'var(--error-text)', borderColor: 'rgb(var(--error-main-rgb) / .48)' }}>رد با دلیل</button>
          </div>
        )}
        <button type="button" className="btnt" onClick={refer} disabled={escalate.isPending} style={{ alignSelf: 'center' }}><Icon d={IC.risk} size={16} />{escalate.isPending ? 'در حال ارجاع…' : 'ارجاع به کارشناس ریسک'}</button>
      </div>
    </Drawer>
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
    <Modal open onClose={onClose} width={520} radius={24} padding={24} label={`رد درخواست ${r.id}`}>
      <DlgHead title={<>رد درخواست <span dir="ltr">{r.id}</span></>} onClose={onClose} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="fl">دلیل اصلی</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {REASONS.map(([l], i) => <Chip key={l} on={rs === i} onClick={() => pick(i)} style={{ height: 32, padding: '0 12px', borderRadius: 999 }}>{l}</Chip>)}
        </div>
        <label className="fl" htmlFor="rj-note">توضیح برای کاربر</label>
        <textarea id="rj-note" rows={4} value={note} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { setNote(e.target.value); setErr(''); }} style={{ boxSizing: 'border-box', width: '100%', border: '1px solid var(--outline-border)', borderRadius: 8, background: 'var(--bg-paper)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7, padding: '10px 12px', resize: 'none', outline: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>این متن در اعلان اپ برای {r.requesterName} نمایش داده می‌شود.</span>
      </div>
      <FormError>{err}</FormError>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btnd" onClick={submit} disabled={decide.isPending} style={{ height: 40, opacity: decide.isPending ? 0.7 : 1 }}>{decide.isPending ? 'در حال ثبت…' : 'ثبت رد درخواست'}</button>
        <button type="button" className="btno" onClick={onClose} style={{ height: 40 }}>انصراف</button>
      </div>
    </Modal>
  );
}
