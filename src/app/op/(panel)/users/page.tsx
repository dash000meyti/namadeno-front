'use client';
/**
 * Operator console — users. Kit list page: stats → list card (tabs, search, organization filter, table with the rial
 * wallet, assets and reservations) → inspector.
 * One Namadno account per person: a member with organization-panel access shows a «پنل · نقش» pill and a «پنل سازمان» row.
 * Identity: the app's three automated levels, read-only («سطح ۲ از ۳»); there is no KYC review or queue here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssetKind, PanelAccess, PlatformUser } from '@/types/domain';
import { useOpUser, useOpUsers, useSetUserStatus } from '@/api/op';
import { useAddUserNote, useOpUserExtra, useResetUserPassword, useUsersMeta, type Facility } from '@/api/op-core-extra';
import {
  Ava, BigNum, Card, Chips, Dialog, Empty, Field, FreeLocked, Inspector, KV, KeyStats, List, ListRow, Meter, PageHeading, Pill,
  SearchField, Section, Select, StatStrip, Table, TableFoot, Tabs, Tile, Toolbar, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ICON, PRODUCT_META, errMsg, fm, idLevel, pctFa } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, maskNationalId, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { LOCK_META } from '@/lib/locks';
import { roleLabel } from '@/lib/org';
import { routes } from '@/lib/routes';

// «مسدود» is one kind: the account is blocked or part of the assets is (the reason shows in the row and the profile)
type Filt = 'all' | 'active' | 'locked' | 'blocked';
const SERVER_FILTER: Partial<Record<Filt, string>> = { locked: 'locked', blocked: 'blocked' };
const PAGE = 8;
const STATUS: Record<PlatformUser['status'], [string, Tone]> = { active: ['فعال', 'success'], invited: ['غیرفعال', 'neutral'], suspended: ['مسدود', 'error'] };
const FAC_TONE: Record<Facility['kind'], Tone> = { card: 'primary', loan: 'info', bnpl: 'success' };
const SPLIT: { kinds: AssetKind[] | null; name: string; col: string }[] = [
  { kinds: ['rial'], name: 'کیف پول ریالی', col: '--grey-600' },
  { kinds: ['gold'], name: 'صندوق طلا', col: '--warning-main' },
  { kinds: ['fixed'], name: 'صندوق درآمد ثابت', col: '--secondary-main' },
  { kinds: null, name: 'سایر صندوق‌ها', col: '--primary-main' },
];
const REASONS = ['درخواست کاربر', 'مشکوک به تقلب', 'دستور سازمان'];

const phone = (m: string) => faDigits(m.slice(0, 4) + ' ••• ' + m.slice(-4));
const scoreTone = (s: number): Tone => (s >= 700 ? 'success' : s >= 550 ? 'warning' : 'error');

function facLine(f: Facility) {
  if (f.kind === 'card') return { name: f.status === 'blocked' ? 'اعتبار کارت (متوقف)' : 'اعتبار کارت', meta: `${fm(f.used)} از ${fm(f.amount)} میلیون`, pct: f.amount ? f.used / f.amount : 0 };
  const paid = f.paidCount ?? 0, total = f.totalCount ?? 0;
  if (f.kind === 'loan') return { name: `وام ${money(f.amount)} · ${faDigits(f.months ?? total)} ماهه`, meta: `${faDigits(paid)} از ${faDigits(total)} قسط · ${faDigits(total - paid)} مانده`, pct: total ? paid / total : 0 };
  return { name: f.title, meta: `${faDigits(paid)} از ${faDigits(total)} قسط`, pct: total ? paid / total : 0 };
}

export default function OpUsersPage() {
  const toast = useToast();
  const [filt, setFilt] = useState<Filt>('all');
  const [q, setQ] = useState('');
  const [org, setOrg] = useState<string>('all');
  const [sel, setSel] = useState<string | null>(null);
  const allQ = useOpUsers();
  const listQ = useOpUsers(SERVER_FILTER[filt] ? { filter: SERVER_FILTER[filt] } : {});
  const metaQ = useUsersMeta();

  const meta = useMemo(() => metaQ.data?.meta ?? {}, [metaQ.data]);
  const totals = metaQ.data?.totals;
  const everyone = useMemo(() => allQ.data ?? [], [allQ.data]);
  const orgs = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    everyone.forEach((u) => { const x = m.get(u.orgId) ?? { name: u.orgName, count: 0 }; x.count += 1; m.set(u.orgId, x); });
    return [...m.entries()];
  }, [everyone]);

  const needle = enDigits(q.trim());
  const rows = useMemo(() => (listQ.data ?? []).filter((u) => {
    if (org !== 'all' && u.orgId !== org) return false;
    if (filt === 'active' && u.status !== 'active') return false;
    if (needle && !(u.fullName.includes(q.trim()) || u.mobile.includes(needle) || u.nationalId.includes(needle) || (u.employeeCode ?? '').includes(needle))) return false;
    return true;
  }), [listQ.data, org, filt, needle, q]);
  const pg = usePaging(rows, PAGE, `${filt}|${org}|${q}`);
  const selUser = everyone.find((u) => u.id === sel) ?? (listQ.data ?? []).find((u) => u.id === sel);

  const exportCsv = () => {
    const head = ['شناسه', 'نام', 'موبایل', 'سازمان', 'کیف پول ریالی', 'رزرو کیف پول', 'کل دارایی', 'آزاد', 'رزروشده', 'امتیاز اعتباری', 'سطح احراز هویت', 'وضعیت'];
    const lines = rows.map((u) => [u.id, u.fullName, u.mobile, u.orgName, u.rialValue ?? 0, u.rialLocked ?? 0, u.portfolioValue, u.freeValue, u.lockedValue, u.creditScore, idLevel(u.kycLevel).short, STATUS[u.status][0]]);
    const csv = '﻿' + [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'namadno-users.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`فایل خروجی ${faDigits(rows.length)} کاربر آماده شد`);
    } catch { toast('ساخت فایل خروجی ممکن نشد', 'error'); }
  };

  const columns: Column<PlatformUser>[] = [
    { key: 'user', label: 'کاربر', width: 'minmax(0, 1.5fr)', render: (u) => <IdentCell u={u} /> },
    { key: 'org', label: 'سازمان', width: 'minmax(0, .9fr)', render: (u) => <span className="el mute">{u.orgName}</span> },
    {
      key: 'rial', label: 'کیف پول ریالی', width: '124px', col: true, render: (u) => (u.rialValue
        ? <><span className="num">{money(u.rialValue)}</span><span className="sm el">{u.rialLocked ? `رزرو ${money(u.rialLocked)}` : 'همه آزاد'}</span></>
        : <span style={{ color: 'var(--text-disabled)' }}>—</span>),
    },
    { key: 'free', label: 'دارایی آزاد', width: '124px', col: true, render: (u) => (<><span className="num">{money(u.freeValue)}</span><span style={{ width: 96 }}><LockBar free={u.freeValue} locked={u.lockedValue} height={4} /></span></>) },
    {
      key: 'locked', label: 'رزروشده', width: '124px', col: true, render: (u) => {
        const m = meta[u.id];
        const legal = u.flags.includes('legal_hold') || !!m?.lockTypes.includes('legal');
        // reservation types in one short line that stays inside the column: up to two by name, then «… و N نوع دیگر»
        const types = (m?.lockTypes ?? []).map((t) => LOCK_META[t].short);
        const all = types.join(' · ');
        const line = !u.lockedValue ? 'همه آزاد' : !types.length ? 'رزرو' : types.length <= 2 ? all : `${types[0]} و ${faDigits(types.length - 1)} نوع دیگر`;
        return (
          <>
            <span className="num" style={{ color: u.lockedValue ? undefined : 'var(--text-disabled)' }}>{u.lockedValue ? money(u.lockedValue) : '—'}</span>
            {legal ? <Pill tone="error" title="بخشی از دارایی به دستور مرجع مسدود است">مسدود</Pill> : <span className="sm el" style={{ maxWidth: '100%' }} title={u.lockedValue && types.length > 2 ? all : undefined}>{line}</span>}
          </>
        );
      },
    },
    { key: 'score', label: 'امتیاز اعتباری', width: '92px', col: true, render: (u) => u.creditScore ? (<><span className="num">{faDigits(u.creditScore)}</span><Meter value={(u.creditScore - 300) / 600} tone={scoreTone(u.creditScore)} width={64} thin /></>) : <span style={{ color: 'var(--text-disabled)' }}>—</span> },
    {
      key: 'fac', label: 'تسهیلات', width: '84px', render: (u) => {
        const f = meta[u.id]?.facilities ?? [];
        return f.length ? <span style={{ display: 'flex', gap: 4 }}>{f.map((k) => <span key={k} title={PRODUCT_META[k].name}><Tile d={PRODUCT_META[k].d} tone={FAC_TONE[k]} size="sm" /></span>)}</span> : <span style={{ color: 'var(--text-disabled)' }}>—</span>;
      },
    },
    { key: 'id', label: 'احراز هویت', width: '84px', col: true, render: (u) => { const k = idLevel(u.kycLevel); return <><span className="num">{k.short}</span><span className="sm">{k.sub}</span></>; } },
    { key: 'st', label: 'وضعیت', width: '72px', render: (u) => <Pill tone={STATUS[u.status][1]} dot>{STATUS[u.status][0]}</Pill> },
  ];

  const tabs: { key: Filt; label: string }[] = [
    { key: 'all', label: 'همه' }, { key: 'active', label: 'فعال' },
    { key: 'locked', label: 'دارای رزرو' }, { key: 'blocked', label: 'مسدود' },
  ];
  const clear = () => { setFilt('all'); setOrg('all'); setQ(''); };

  return (
    <>
      <PageHeading title="کاربران" crumbs={[{ label: 'مشتریان' }]} sub="همه‌ی کاربران نمادنو، دارایی آزاد و رزروشده و سطح احراز هویت">
        <button type="button" className="nm-btn ghost" onClick={exportCsv} disabled={!rows.length}><Icon d={ICON.download} size={17} />خروجی Excel</button>
      </PageHeading>

      <StatStrip loading={!totals} items={totals ? [
        { label: 'کاربران', value: money(totals.users), unit: 'نفر', note: `+${money(totals.newThisMonth)} این ماه`, trend: 'up' },
        { label: 'دارای دارایی رزروشده', value: money(totals.locked), unit: 'نفر', note: `${pctFa(totals.lockedPct)} کاربران` },
        { label: 'مسدود', value: money(totals.blocked), unit: 'کاربر', note: `حساب ${money(totals.suspended)} · بخشی از دارایی ${money(totals.legal)}` },
      ] : []} />

      <Card flush>
        <Toolbar>
          <Tabs label="وضعیت کاربر" value={filt} onChange={setFilt} items={tabs} />
          <span className="grow" />
          <Select label="سازمان" prefix="سازمان" icon={ICON.building} value={org} onChange={setOrg} align="end"
            options={[{ key: 'all', label: 'همه سازمان‌ها', count: everyone.length }, ...orgs.map(([id, o]) => ({ key: id, label: o.name, count: o.count }))]} />
          <SearchField value={q} onChange={setQ} placeholder="نام، موبایل یا کد ملی" label="جستجوی کاربر" width={220} />
        </Toolbar>
        <Table
          columns={columns} rows={pg.rows} rowKey={(u) => u.id} rowLabel={(u) => u.fullName}
          onRowClick={(u) => setSel((s) => (s === u.id ? null : u.id))} selectedKey={sel}
          loading={listQ.isLoading} error={listQ.isError ? listQ.error : undefined} onRetry={() => listQ.refetch()}
          empty={<Empty icon={ICON.search} title="کاربری با این فیلترها پیدا نشد" action={<button type="button" className="nm-btn sm ghost" onClick={clear}>پاک کردن فیلترها</button>} />}
          minWidth={1080}
        />
        <TableFoot shown={pg.rows.length} total={rows.length} unit="کاربر" page={pg.page} pages={pg.pages} onPage={pg.setPage} />
      </Card>

      {selUser && <UserInspector key={selUser.id} user={selUser} onClose={() => setSel(null)} />}
    </>
  );
}

function IdentCell({ u }: { u: PlatformUser }) {
  const a = u.panelAccess;
  return (
    <span className="nm-ident">
      <Ava letter={u.avatarLetter} id={u.id} />
      <span className="nm-col">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <b>{u.fullName}</b>
          {a && <Pill tone={a.status === 'invited' ? 'warning' : 'neutral'} title={`دسترسی پنل ${a.orgName}${a.status === 'invited' ? ' · در انتظار فعال‌سازی' : ''}`}>پنل · {roleLabel(a.panelRole)}</Pill>}
        </span>
        <small className="num ltr" style={{ textAlign: 'right' }}>{phone(u.mobile)}</small>
      </span>
    </span>
  );
}

/** «پنل سازمان» value: role and organization (link), or «ندارد». */
function PanelAccessValue({ a }: { a?: PanelAccess }) {
  if (!a) return <span className="mute">ندارد</span>;
  return <Link href={routes.op.organization(a.orgId)} className="nm-more">{roleLabel(a.panelRole)} · {a.orgName}{a.status === 'invited' ? ' · در انتظار فعال‌سازی' : ''}</Link>;
}

function UserInspector({ user, onClose }: { user: PlatformUser; onClose: () => void }) {
  const toast = useToast();
  const detail = useOpUser(user.id);
  const extra = useOpUserExtra(user.id);
  const setStatus = useSetUserStatus();
  const reset = useResetUserPassword();
  const addNote = useAddUserNote();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState(0);
  const [note, setNote] = useState('');

  const pf = detail.data?.portfolio;
  const total = pf?.total ?? user.portfolioValue;
  const locked = pf?.locked ?? user.lockedValue;
  const free = pf?.free ?? user.freeValue;
  const k = idLevel(user.kycLevel);
  const s = STATUS[user.status];
  const blocked = user.status === 'suspended';
  const split = pf ? SPLIT.map((x) => ({ ...x, value: pf.holdings.filter((h) => (x.kinds ? x.kinds.includes(h.kind) : !['rial', 'gold', 'fixed'].includes(h.kind))).reduce((a, h) => a + h.value, 0) })).filter((x) => x.kinds || x.value > 0) : [];
  // rial wallet: from the portfolio when loaded, else from the list row
  const rialH = pf?.holdings.find((h) => h.kind === 'rial');
  const rialValue = rialH?.value ?? user.rialValue ?? 0;
  const rialLocked = rialH?.locked ?? user.rialLocked ?? 0;
  const rialSub = rialLocked > 0 ? `آزاد ${money(Math.max(0, rialValue - rialLocked))} · رزرو ${money(rialLocked)}` : 'همه آزاد';
  const locks = pf ? pf.holdings.flatMap((h) => h.locks.map((l) => ({ l, h: h.name }))) : [];
  const facs = extra.data?.facilities ?? [];

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
      <Inspector
        open onClose={onClose} title="جزئیات کاربر" label={`جزئیات کاربر ${user.fullName}`} href={routes.op.user(user.id)} hrefLabel="پروفایل کامل"
        footer={(
          <>
            {!blocked
              ? <button type="button" className="nm-btn line danger" onClick={() => setBlockOpen(true)}><Icon d={ICON.ban} size={17} />مسدودسازی</button>
              : <button type="button" className="nm-btn line ok" onClick={unblock} disabled={setStatus.isPending}><Icon d={ICON.unlock} size={17} />رفع مسدودی</button>}
            <button type="button" className="nm-btn ghost" onClick={resetPass} disabled={reset.isPending}><Icon d={ICON.key} size={17} />بازنشانی رمز</button>
          </>
        )}
      >
        <Who
          lead={<Ava letter={user.avatarLetter} id={user.id} size="lg" />}
          title={user.fullName}
          sub={<>{user.orgName} · کد پرسنلی <span className="num">{faDigits(user.employeeCode ?? '—')}</span></>}
          pills={<><Pill tone={s[1]} dot>{s[0]}</Pill><Pill tone={k.tone} icon={ICON.shield} title={k.sub}>{k.label}</Pill></>}
        />
        <KeyStats items={[['عضویت از', jDate(user.joinedAt)], ['آخرین ورود', relTime(user.lastActiveAt, now())], ['امتیاز اعتباری', user.creditScore ? faDigits(user.creditScore) : '—']]} />

        <Section title="دارایی‌ها" action={<BigNum value={money(total)} unit="تومان" />}>
          <FreeLocked free={free} locked={locked} />
          <List>
            {(split.length ? split : SPLIT.slice(0, 1).map((x) => ({ ...x, value: rialValue }))).map((x) => (
              <ListRow key={x.name}
                lead={<span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${x.col})`, flex: 'none', margin: '0 4px' }} />}
                title={x.name}
                sub={x.kinds?.includes('rial') ? rialSub : undefined}
                trail={<><span className="num mute" style={{ fontSize: 12 }}>{pctFa(total ? (x.value / total) * 100 : 0)}</span><span className="num" style={{ width: 104, textAlign: 'left' }}>{money(x.value)}</span></>}
              />
            ))}
          </List>
          {detail.isLoading && <span className="mute" style={{ fontSize: 12 }}>در حال بارگذاری جزئیات…</span>}
        </Section>

        {locks.length > 0 && (
          <Section title="اقلام رزرو">
            <List>
              {locks.map(({ l, h }) => <ListRow key={l.id} lead={<LockTypeChip type={l.type} />} title={h} sub={l.condition} trail={<span className="num">{money(l.amount)}</span>} />)}
            </List>
          </Section>
        )}

        <Section title="اعتبار و دسترسی">
          <KV rows={[
            ['کد ملی', <span key="n" className="num ltr">{maskNationalId(user.nationalId)}</span>],
            ['پنل سازمان', <PanelAccessValue key="p" a={detail.data?.user.panelAccess ?? user.panelAccess} />],
          ]} />
        </Section>

        <Section title="تسهیلات فعال">
          {facs.length ? (
            <List>
              {facs.map((f) => {
                const p = PRODUCT_META[f.kind];
                const line = facLine(f);
                return <ListRow key={f.id} lead={<Tile d={p.d} tone={FAC_TONE[f.kind]} />} title={line.name} sub={line.meta} subLtr={false} trail={<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><span className="num" style={{ fontSize: 12, fontWeight: 600 }}>{pctFa(line.pct * 100)}</span><Meter value={line.pct} width={56} thin /></span>} />;
              })}
            </List>
          ) : !extra.isLoading && <Empty title="تسهیلات فعالی ندارد" />}
        </Section>
      </Inspector>

      <Dialog
        open={blockOpen} onClose={() => setBlockOpen(false)} width={520}
        title={`مسدودسازی حساب ${user.fullName}؟`} sub="این اقدام در گزارش ممیزی ثبت می‌شود."
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setBlockOpen(false)}>انصراف</button>
            <button type="button" className="nm-btn danger" onClick={confirmBlock} disabled={setStatus.isPending}>مسدودسازی حساب</button>
          </>
        )}
      >
        <span className="mute">با مسدودسازی، کاربر نمی‌تواند وارد اپ شود و کارت نمادنو غیرفعال می‌شود. دارایی‌ها، اقساط و موارد پرداخت‌شده‌ی او در صف تأمین بدون تغییر باقی می‌مانند.</span>
        <Field label="دلیل مسدودسازی">
          <Chips label="دلیل مسدودسازی" value={reason} onChange={setReason} options={REASONS.map((l, i) => ({ key: i, label: l }))} />
        </Field>
        <Field label="توضیحات برای سوابق" htmlFor="blk-note">
          <textarea id="blk-note" className="nm-ta" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً شماره تیکت پشتیبانی" />
        </Field>
      </Dialog>
    </>
  );
}

