'use client';
/** Operator console — users (design: op-users): KPI filters, searchable table with free/locked split, detail drawer. */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { AssetKind, PlatformUser } from '@/types/domain';
import { useOpUser, useOpUsers, useSetUserStatus } from '@/api/op';
import { useAddUserNote, useOpUserExtra, useResetUserPassword, useUsersMeta, type Facility, type UserMetaRow } from '@/api/op-core-extra';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ICON, LkType, Modal, PRODUCT_META, PanelState, TILES, errMsg, fm, pctFa } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Filt = 'all' | 'active' | 'kyc' | 'locked' | 'legal' | 'blocked';
const SERVER_FILTER: Partial<Record<Filt, string>> = { kyc: 'kyc', locked: 'locked', legal: 'legal' };
const GRID = 'minmax(0, 1fr) 104px 116px 132px 88px 76px 84px 72px';
const PAGE = 8;
const KYC = { ok: ['تأییدشده', 'var(--soft-success)', 'var(--success-text)'], pending: ['در انتظار', 'var(--soft-warning)', 'var(--warning-text)'], rejected: ['ردشده', 'var(--soft-error)', 'var(--error-text)'] } as const;
const STATUS: Record<PlatformUser['status'], [string, string, string]> = { active: ['فعال', 'var(--soft-success)', 'var(--success-text)'], invited: ['غیرفعال', 'var(--soft-default)', 'var(--default-text)'], suspended: ['مسدود', 'var(--soft-error)', 'var(--error-text)'] };
const FAC_KEY: Record<Facility['kind'], keyof typeof PRODUCT_META> = { card: 'card', loan: 'loan', bnpl: 'bnpl' };
const SPLIT: { kinds: AssetKind[] | null; name: string; col: string }[] = [
  { kinds: ['rial'], name: 'کیف پول ریالی', col: '--grey-600' },
  { kinds: ['gold'], name: 'صندوق طلا', col: '--warning-main' },
  { kinds: ['fixed'], name: 'صندوق درآمد ثابت', col: '--secondary-main' },
  { kinds: null, name: 'سایر صندوق‌ها', col: '--primary-main' },
];

const phone = (m: string) => faDigits(m.slice(0, 4) + ' ••• ' + m.slice(-4));
const scoreCol = (s: number) => (s >= 700 ? 'var(--success-main)' : s >= 550 ? 'var(--warning-main)' : 'var(--error-main)');

function facLine(f: Facility) {
  if (f.kind === 'card') return { name: f.status === 'blocked' ? 'اعتبار کارت (مسدود)' : 'اعتبار کارت', meta: `${fm(f.used)} از ${fm(f.amount)} میلیون`, pct: f.amount ? Math.round((f.used / f.amount) * 100) : 0 };
  const paid = f.paidCount ?? 0, total = f.totalCount ?? 0;
  if (f.kind === 'loan') return { name: `وام ${money(f.amount)} · ${faDigits(f.months ?? total)} ماهه`, meta: `${faDigits(paid)} از ${faDigits(total)} قسط · ${faDigits(total - paid)} مانده`, pct: total ? Math.round((paid / total) * 100) : 0 };
  return { name: f.title, meta: `${faDigits(paid)} از ${faDigits(total)} قسط`, pct: total ? Math.round((paid / total) * 100) : 0 };
}

export default function OpUsersPage() {
  const toast = useToast();
  const [filt, setFilt] = useState<Filt>('all');
  const [q, setQ] = useState('');
  const [org, setOrg] = useState<string>('all');
  const [orgOpen, setOrgOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const allQ = useOpUsers();
  const listQ = useOpUsers(SERVER_FILTER[filt] ? { filter: SERVER_FILTER[filt] } : {});
  const metaQ = useUsersMeta();
  const orgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!orgOpen) return;
    const onDown = (e: Event) => { if (orgRef.current && !orgRef.current.contains(e.target as Node)) setOrgOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [orgOpen]);

  const meta = metaQ.data?.meta ?? {};
  const totals = metaQ.data?.totals;
  const everyone = useMemo(() => allQ.data ?? [], [allQ.data]);
  const orgs = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    everyone.forEach((u) => { const x = m.get(u.orgId) ?? { name: u.orgName, count: 0 }; x.count += 1; m.set(u.orgId, x); });
    return [...m.entries()];
  }, [everyone]);

  const needle = enDigits(q.trim());
  const rows = (listQ.data ?? []).filter((u) => {
    if (org !== 'all' && u.orgId !== org) return false;
    if (filt === 'active' && u.status !== 'active') return false;
    if (filt === 'blocked' && u.status !== 'suspended') return false;
    if (filt === 'kyc' && meta[u.id]?.kyc === 'rejected') return false;
    if (needle && !(u.fullName.includes(q.trim()) || u.mobile.includes(needle) || u.nationalId.includes(needle) || (u.employeeCode ?? '').includes(needle))) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const selUser = everyone.find((u) => u.id === sel) ?? (listQ.data ?? []).find((u) => u.id === sel);

  const pick = (f: Filt) => { setFilt(f); setPage(1); };
  const clear = () => { setFilt('all'); setOrg('all'); setQ(''); setPage(1); };

  const exportCsv = () => {
    const head = ['شناسه', 'نام', 'موبایل', 'سازمان', 'کل دارایی', 'آزاد', 'قفل‌شده', 'امتیاز اعتباری', 'KYC', 'وضعیت'];
    const lines = rows.map((u) => [u.id, u.fullName, u.mobile, u.orgName, u.portfolioValue, u.freeValue, u.lockedValue, u.creditScore, KYC[meta[u.id]?.kyc ?? 'ok'][0], STATUS[u.status][0]]);
    const csv = '﻿' + [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'namadno-users.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`فایل خروجی ${faDigits(rows.length)} کاربر آماده شد`);
    } catch { toast('ساخت فایل خروجی ممکن نشد', 'error'); }
  };

  const kpis: { k: Filt; title: string; value: string; note: string; d: string; tile: [string, string] }[] = [
    { k: 'all', title: 'کاربران', value: totals ? money(totals.users) : '…', note: totals ? `+${money(totals.newThisMonth)} این ماه` : '', d: ICON.users, tile: TILES[0] },
    { k: 'locked', title: 'دارای دارایی قفل', value: totals ? money(totals.locked) : '…', note: totals ? `${pctFa(totals.lockedPct)} کاربران` : '', d: ICON.lock, tile: TILES[3] },
    { k: 'kyc', title: 'KYC در انتظار', value: totals ? money(totals.kycPending) : '…', note: totals ? `میانگین ${faDigits(totals.kycAvgDays, true)} روز` : '', d: ICON.id, tile: TILES[1] },
    { k: 'legal', title: 'مسدودی قانونی', value: totals ? money(totals.legal) : '…', note: totals ? `${money(totals.suspended)} حساب مسدود موقت` : '', d: ICON.lock, tile: TILES[5] },
  ];
  const chips: [Filt, string][] = [['all', 'همه'], ['active', 'فعال'], ['kyc', 'KYC در انتظار'], ['locked', 'دارای قفل'], ['legal', 'مسدودی قانونی'], ['blocked', 'مسدود']];

  return (
    <>
      <PageHeading title="کاربران" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'عملیات', href: routes.op.overview }, { label: 'کاربران' }]}>
        <button type="button" className="btno" onClick={exportCsv} disabled={!rows.length}><Icon d={ICON.download} size={18} />خروجی Excel</button>
      </PageHeading>

      <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {kpis.map((k) => {
          const on = filt === k.k && k.k !== 'all';
          return (
            <button key={k.k} type="button" onClick={() => pick(k.k)} aria-pressed={on} className="card" style={{ boxSizing: 'border-box', height: 96, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'inherit', color: 'inherit', textAlign: 'right', cursor: 'pointer', outline: on ? '2px solid var(--primary-main)' : 0 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, background: k.tile[0], color: k.tile[1], display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={k.d} size={22} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{k.title}</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', minWidth: 0 }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{k.value}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.note}</span></span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
        <div style={{ flex: 'none', boxSizing: 'border-box', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="u-search" style={{ width: 240, display: 'flex', alignItems: 'center', gap: 8, height: 38, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', color: 'var(--text-secondary)', cursor: 'text' }}>
            <Icon d={ICON.search} size={18} />
            <input id="u-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="نام، موبایل یا کد ملی" style={{ flex: 1, minWidth: 0, height: 36, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 0 }} />
          </label>
          <div style={{ position: 'relative' }} ref={orgRef}>
            <button type="button" aria-haspopup="listbox" aria-expanded={orgOpen} onClick={() => setOrgOpen((x) => !x)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 38, padding: '0 10px 0 12px', borderRadius: 8, border: `1px solid ${orgOpen ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Icon d={ICON.building} size={18} style={{ color: 'var(--text-secondary)' }} />سازمان: {org === 'all' ? 'همه' : orgs.find(([id]) => id === org)?.[1].name ?? '—'}<Icon d={ICON.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {orgOpen && (
              <div className="glass" role="listbox" style={{ position: 'absolute', top: 44, right: 0, width: 220, zIndex: 10, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, boxShadow: 'var(--shadow-dropdown)', background: 'var(--bg-paper)' }}>
                {[['all', { name: 'همه سازمان‌ها', count: everyone.length }] as const, ...orgs].map(([id, o]) => {
                  const on = id === org;
                  return (
                    <button key={id} type="button" role="option" aria-selected={on} onClick={() => { setOrg(id); setOrgOpen(false); setPage(1); }} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', border: 0, borderRadius: 8, background: on ? 'var(--nav-active)' : 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'right' }}>
                      <span style={{ flex: 1 }}>{o.name}</span><span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(o.count)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto', flexWrap: 'wrap' }}>
            {chips.map(([k, l]) => {
              const on = filt === k;
              const legal = k === 'legal' && !on;
              return <button key={k} type="button" aria-pressed={on} onClick={() => pick(k)} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? 'var(--contained-default)' : legal ? 'rgb(var(--error-main-rgb) / .48)' : 'var(--outline-border)'}`, background: on ? 'var(--contained-default)' : 'transparent', color: on ? 'var(--contained-default-text)' : legal ? 'var(--error-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>;
            })}
          </div>
        </div>
        <div style={{ height: 38, flex: 'none', display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '0 16px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
          <span>کاربر</span><span>سازمان</span><span>آزاد (تومان)</span><span>قفل‌شده (تومان)</span><span>امتیاز اعتباری</span><span>تسهیلات</span><span>KYC</span><span>وضعیت</span>
        </div>
        {listQ.isLoading && <div style={{ height: 160, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>در حال بارگذاری…</div>}
        {listQ.isError && <PanelState error={listQ.error} onRetry={() => listQ.refetch()} />}
        {shown.map((u, i) => {
          const m: UserMetaRow | undefined = meta[u.id];
          const on = sel === u.id;
          const legal = u.flags.includes('legal_hold') || !!m?.lockTypes.includes('legal');
          const k = KYC[m?.kyc ?? (u.kycLevel < 2 ? 'pending' : 'ok')];
          const s = STATUS[u.status];
          const tile = TILES[((cur - 1) * PAGE + i) % 6];
          return (
            <div key={u.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => setSel(u.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(u.id); } }} className="hov" style={{ minHeight: 60, flex: 'none', display: 'grid', gridTemplateColumns: GRID, gap: 8, alignItems: 'center', padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 13, cursor: 'pointer', background: on ? 'var(--nav-active)' : undefined }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: tile[0], color: tile[1], display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>{u.avatarLetter}</span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullName}</span><span className="num" dir="ltr" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}>{phone(u.mobile)}</span></span>
              </span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>{u.orgName}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 400 }}>{money(u.freeValue)}</span>
                <span style={{ width: 96 }}><LockBar free={u.freeValue} locked={u.lockedValue} height={5} /></span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, lineHeight: 1.3 }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 4, color: u.lockedValue ? 'var(--text-primary)' : 'var(--text-disabled)' }}>{u.lockedValue > 0 && <Icon d={ICON.lock} size={12} />}{u.lockedValue ? money(u.lockedValue) : '—'}</span>
                {legal
                  ? <span className="lktype" style={{ height: 18, padding: '0 6px', fontSize: 10, alignSelf: 'flex-start', background: 'var(--soft-error)', color: 'var(--error-text)' }}>مسدودی قانونی</span>
                  : <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.lockedValue ? (m?.lockTypes.map((t) => LOCK_META[t].short).join(' · ') || 'قفل') : 'همه آزاد'}</span>}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="num" style={{ fontSize: 13, fontWeight: 500, color: u.creditScore ? 'var(--text-primary)' : 'var(--text-disabled)' }}>{u.creditScore ? faDigits(u.creditScore) : '—'}</span>
                <span style={{ width: 64, height: 4, borderRadius: 2, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${u.creditScore ? Math.max(0, Math.round((u.creditScore - 300) / 6)) : 0}%`, background: scoreCol(u.creditScore), borderRadius: 2 }} /></span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {(m?.facilities ?? []).map((f) => { const p = PRODUCT_META[FAC_KEY[f]]; return <span key={f} title={p.name} aria-label={p.name} style={{ width: 26, height: 26, borderRadius: '50%', background: p.bg, color: p.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={p.d} size={14} strokeWidth={1.8} /></span>; })}
                {!m?.facilities.length && <span style={{ color: 'var(--text-disabled)' }}>—</span>}
              </span>
              <span><span className="lbl" style={{ background: k[1], color: k[2] }}>{k[0]}</span></span>
              <span><span className="lbl" style={{ background: s[1], color: s[2] }}>{s[0]}</span></span>
            </div>
          );
        })}
        {!listQ.isLoading && !listQ.isError && !rows.length && (
          <div style={{ height: 160, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-secondary)', fontSize: 13 }}>
            <Icon d={ICON.search} size={32} />
            <span>کاربری با این فیلترها پیدا نشد.</span>
            <button type="button" className="btnt" onClick={clear}>پاک کردن فیلترها</button>
          </div>
        )}
        <div style={{ height: 52, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>نمایش <span className="num">{faDigits(shown.length)}</span> مورد از {totals ? money(totals.users) : faDigits(everyone.length)} کاربر</span>
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" className="ibtn" aria-label="صفحه قبل" disabled={cur <= 1} onClick={() => setPage(Math.max(1, cur - 1))} style={{ width: 32, height: 32, opacity: cur <= 1 ? 0.4 : 1 }}><Icon d={ICON.chevR} size={16} /></button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, border: 0, background: p === cur ? 'var(--soft-primary)' : 'transparent', color: p === cur ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{faDigits(p)}</button>
            ))}
            <button type="button" className="ibtn" aria-label="صفحه بعد" disabled={cur >= pages} onClick={() => setPage(Math.min(pages, cur + 1))} style={{ width: 32, height: 32, opacity: cur >= pages ? 0.4 : 1 }}><Icon d={ICON.chevL} size={16} /></button>
          </div>
        </div>
      </div>

      {selUser && <UserDrawer key={selUser.id} user={selUser} meta={meta[selUser.id]} tile={TILES[Math.max(0, rows.indexOf(selUser)) % 6]} onClose={() => setSel(null)} />}
    </>
  );
}

function UserDrawer({ user, meta, tile, onClose }: { user: PlatformUser; meta?: UserMetaRow; tile: [string, string]; onClose: () => void }) {
  const toast = useToast();
  const detail = useOpUser(user.id);
  const extra = useOpUserExtra(user.id);
  const setStatus = useSetUserStatus();
  const reset = useResetUserPassword();
  const addNote = useAddUserNote();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !blockOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, blockOpen]);

  const pf = detail.data?.portfolio;
  const total = pf?.total ?? user.portfolioValue;
  const locked = pf?.locked ?? user.lockedValue;
  const free = pf?.free ?? user.freeValue;
  const k = KYC[meta?.kyc ?? (user.kycLevel < 2 ? 'pending' : 'ok')];
  const s = STATUS[user.status];
  const blocked = user.status === 'suspended';
  const split = pf ? SPLIT.map((x) => ({ ...x, value: pf.holdings.filter((h) => (x.kinds ? x.kinds.includes(h.kind) : !['rial', 'gold', 'fixed'].includes(h.kind))).reduce((a, h) => a + h.value, 0) })).filter((x) => x.kinds || x.value > 0) : [];
  const locks = pf ? pf.holdings.flatMap((h) => h.locks.map((l) => ({ l, h: h.name }))) : [];
  const facs = extra.data?.facilities ?? [];
  const REASONS = ['درخواست کاربر', 'مشکوک به تقلب', 'دستور سازمان'];

  const confirmBlock = () => setStatus.mutate({ id: user.id, status: 'suspended' }, {
    onSuccess: () => {
      addNote.mutate({ userId: user.id, tag: 'security', text: `مسدودسازی حساب — ${REASONS[reason]}${note.trim() ? ' · ' + note.trim() : ''}` });
      setBlockOpen(false); setNote('');
      toast(`حساب ${user.fullName} مسدود شد و کارت نمادنو غیرفعال شد`);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const unblock = () => setStatus.mutate({ id: user.id, status: 'active' }, { onSuccess: () => toast(`مسدودی حساب ${user.fullName} برداشته شد`), onError: (e) => toast(errMsg(e), 'error') });
  const resetPass = () => reset.mutate({ userId: user.id }, { onSuccess: () => toast(`لینک بازنشانی رمز برای ${user.fullName} پیامک شد`), onError: (e) => toast(errMsg(e), 'error') });

  return (
    <>
      <aside className="glass" aria-label="جزئیات کاربر" style={{ position: 'fixed', top: 72, bottom: 0, left: 0, width: 380, maxWidth: '100vw', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--glass-edge)', boxShadow: 'var(--shadow-dropdown)', padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', zIndex: 8, background: 'var(--glass-bg)' }}>
        <div style={{ height: 32, flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>جزئیات کاربر</h6>
          <Link href={routes.op.user(user.id)} className="btnt" style={{ marginRight: 'auto', height: 32, padding: '0 8px' }}>پروفایل کامل<Icon d={ICON.ext} size={16} /></Link>
          <button type="button" className="ibtn" aria-label="بستن پنل" onClick={onClose} style={{ width: 32, height: 32 }}><Icon d={ICON.x} size={18} /></button>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: tile[0], color: tile[1], display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700, flex: 'none', boxShadow: blocked ? '0 0 0 3px var(--soft-error)' : '0 0 0 3px var(--soft-primary)' }}>{user.avatarLetter}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.35 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{user.fullName}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.orgName} · کد پرسنلی <span className="num">{faDigits(user.employeeCode ?? '—')}</span></span>
            <span style={{ display: 'flex', gap: 6 }}><span className="lbl" style={{ background: k[1], color: k[2] }}>KYC: {k[0]}</span><span className="lbl" style={{ background: s[1], color: s[2] }}>{s[0]}</span></span>
          </span>
        </div>
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['عضویت از', jDate(user.joinedAt)], ['آخرین ورود', relTime(user.lastActiveAt, now())], ['امتیاز اعتباری', user.creditScore ? faDigits(user.creditScore) : '—']].map(([a, b]) => (
            <div key={a} style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{a}</span>
              <span className="num" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="sec">دارایی‌ها</span><span className="num" style={{ marginRight: 'auto', fontSize: 18 }}>{money(total)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span></div>
          <LockBar free={free} locked={locked} height={8} />
          <div className="lkleg">
            <span><span className="lkdot" />آزاد <b>{money(free)}</b></span>
            {locked > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={ICON.lock} size={12} />قفل <b>{money(locked)}</b></span> : <span>همه آزاد</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {split.map((x) => (
              <div key={x.name} style={{ height: 28, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${x.col})`, flex: 'none' }} />
                <span style={{ flex: 1 }}>{x.name}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pctFa(total ? (x.value / total) * 100 : 0)}</span>
                <span className="num" style={{ fontSize: 13, width: 104, textAlign: 'left' }}>{money(x.value)}</span>
              </div>
            ))}
            {detail.isLoading && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>در حال بارگذاری جزئیات…</span>}
          </div>
          {locks.length > 0 && (
            <>
              <span className="sec" style={{ marginTop: 4 }}>اقلام قفل</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {locks.map(({ l, h }) => (
                  <div key={l.id} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', boxSizing: 'border-box', borderBottom: '1px dashed var(--divider)' }}>
                    <LkType type={l.type} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}><span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.condition}</span></span>
                    <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>{money(l.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="sec">تسهیلات فعال</span>
          {facs.map((f) => {
            const p = PRODUCT_META[FAC_KEY[f.kind]];
            const line = facLine(f);
            return (
              <div key={f.id} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: p.bg, color: p.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={p.d} size={16} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{line.name}</span><span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{line.meta}</span></span>
                  <span className="num" style={{ fontSize: 12, fontWeight: 600 }}>{pctFa(line.pct)}</span>
                </div>
                <span style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${line.pct}%`, background: 'var(--primary-main)', borderRadius: 3 }} /></span>
              </div>
            );
          })}
          {!extra.isLoading && !facs.length && <div style={{ padding: 14, borderRadius: 12, border: '1px dashed var(--outline-border)', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>تسهیلات فعالی ندارد.</div>}
        </div>
        <div style={{ marginTop: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
          {!blocked
            ? <button type="button" onClick={() => setBlockOpen(true)} className="btno" style={{ flex: 1, height: 40, color: 'var(--error-text)', borderColor: 'rgb(var(--error-main-rgb) / .48)' }}><Icon d={ICON.ban} size={18} />مسدودسازی</button>
            : <button type="button" onClick={unblock} disabled={setStatus.isPending} className="btno" style={{ flex: 1, height: 40, color: 'var(--success-text)', borderColor: 'rgb(var(--success-main-rgb) / .48)' }}><Icon d={ICON.unlock} size={18} />رفع مسدودی</button>}
          <button type="button" onClick={resetPass} disabled={reset.isPending} className="btno" style={{ flex: 1, height: 40 }}><Icon d={ICON.key} size={18} />بازنشانی رمز</button>
        </div>
      </aside>

      <Modal open={blockOpen} onClose={() => setBlockOpen(false)} label={`مسدودسازی حساب ${user.fullName}`} width={520} radius={24} padding={24} gap={18}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}><h6 style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.4 }}>مسدودسازی حساب {user.fullName}؟</h6><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>این اقدام در گزارش ممیزی ثبت می‌شود.</span></div>
          <button type="button" className="ibtn" aria-label="بستن" onClick={() => setBlockOpen(false)} style={{ width: 36, height: 36, flex: 'none' }}><Icon d={ICON.x} size={18} /></button>
        </div>
        <span style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>با مسدودسازی، کاربر نمی‌تواند وارد اپ شود، کارت نمادنو غیرفعال می‌شود و سفارش‌های باز خرید و فروش لغو می‌شوند. دارایی‌ها و اقساط بدون تغییر باقی می‌مانند.</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="fl">دلیل مسدودسازی</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REASONS.map((l, i) => <button key={l} type="button" aria-pressed={reason === i} onClick={() => setReason(i)} style={{ height: 32, padding: '0 12px', borderRadius: 999, border: `1px solid ${reason === i ? 'var(--primary-main)' : 'var(--outline-border)'}`, background: reason === i ? 'var(--soft-primary)' : 'transparent', color: reason === i ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>)}
          </div>
          <label className="fl" htmlFor="blk-note">توضیحات برای سوابق</label>
          <textarea id="blk-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره تیکت پشتیبانی" style={{ boxSizing: 'border-box', width: '100%', border: '1px solid var(--outline-border)', borderRadius: 8, background: 'var(--bg-paper)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px', resize: 'none', outline: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnd" onClick={confirmBlock} disabled={setStatus.isPending} style={{ height: 40, opacity: setStatus.isPending ? 0.7 : 1 }}>مسدودسازی حساب</button>
          <button type="button" className="btno" onClick={() => setBlockOpen(false)} style={{ height: 40 }}>انصراف</button>
        </div>
      </Modal>
    </>
  );
}
