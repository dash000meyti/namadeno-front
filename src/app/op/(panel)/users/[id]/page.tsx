'use client';
/**
 * Operator console — user profile. Kit detail page: heading with avatar + status pills + actions → stats → tabs → cards.
 * Holdings with free/locked split, lock items (legal hold apply/remove), transactions, facilities, risk, audit log, notes.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AssetKind, Holding, Lock, LockType, PlatformUser, RiskAlert, Transaction } from '@/types/domain';
import { useApplyLegalHold, useOpUser, useRemoveLegalHold, useSetUserStatus } from '@/api/op';
import { useAddUserNote, useOpUserExtra, type Facility, type UserNote } from '@/api/op-core-extra';
import {
  Allocation, Ava, BigNum, Card, Chips, Dialog, Empty, ErrorBlock, Field, FreeLocked, KV, List, ListRow, Meter, Note, NumInput,
  PageHeading, Pill, Ring, Section, SkeletonCard, StatStrip, Table, Tabs, Tile, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ICON, LOCK_COL, errMsg, fm, pctFa } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, jDayMonth, money, relTime, signedMoney, time, units } from '@/lib/format';
import { now } from '@/lib/clock';
import { ASSET_META, HOURGLASS, LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Tab = 'assets' | 'locks' | 'tx' | 'credit' | 'risk' | 'log';
const KIND_ICON: Partial<Record<AssetKind, string>> = { rial: ICON.wallet, gold: ICON.gold, fixed: ICON.bond, equity: ICON.trend, mixed: ICON.funds, silver: ICON.gold, leverage: ICON.trend };
const KIND_TONE: Partial<Record<AssetKind, Tone>> = { rial: 'neutral', gold: 'warning', fixed: 'secondary', equity: 'primary', mixed: 'success', silver: 'neutral', leverage: 'error', project: 'info' };
const LH_REASONS = ['دستور مرجع قضایی', 'بررسی ریسک و تقلب', 'درخواست نهاد ناظر'];
const NOTE_TAGS: [UserNote['tag'], string][] = [['security', 'امنیت'], ['credit', 'اعتبار'], ['support', 'پشتیبانی']];
const SEVERITY: Record<RiskAlert['severity'], [string, Tone]> = { low: ['کم', 'warning'], medium: ['متوسط', 'warning'], high: ['زیاد', 'error'], critical: ['بحرانی', 'error'] };
const FAC_STATUS: Record<Facility['status'], [string, Tone]> = { current: ['جاری', 'success'], late: ['معوق', 'error'], blocked: ['متوقف', 'neutral'], settled: ['تسویه‌شده', 'neutral'] };

const band = (s: number) => (!s ? 'بدون امتیاز' : s >= 740 ? 'عالی' : s >= 670 ? 'خوب' : s >= 580 ? 'متوسط' : 'ضعیف');
const kycOf = (u: PlatformUser) => (u.flags.includes('kyc_rejected') ? 'rejected' : u.kycLevel < 2 ? 'pending' : 'ok');
const assetName = (k: AssetKind) => ASSET_META[k]?.name ?? k;

function txType(t: Transaction): [string, Tone] {
  switch (t.category) {
    case 'trade': return [t.amount < 0 ? 'خرید واحد' : 'فروش واحد', 'warning'];
    case 'inbox': return ['بسته سازمانی', 'primary'];
    case 'card': return ['کارت', 'info'];
    case 'loan': case 'installment': return ['قسط', 'neutral'];
    case 'rial': return t.amount < 0 ? ['برداشت', 'error'] : ['واریز', 'success'];
    case 'fund': return ['سود', 'success'];
    case 'lock': return t.lockEvent === 'released' ? ['آزادسازی', 'primary'] : ['رزرو', 'warning'];
    default: return ['سایر', 'neutral'];
  }
}

function lockBy(l: Lock, orgName: string): [string, string] {
  if (l.type === 'vesting' || l.type === 'milestone') return [orgName, 'سازمان'];
  if (l.type === 'legal') return ['بهره‌بردار', l.reference ? 'مرجع ' + faDigits(l.reference) : 'دستور مرجع'];
  if (l.type === 'installment') return ['سیستم', 'خرید اقساطی'];
  const src = l.sourceId ?? '';
  return ['سیستم', src.startsWith('card') ? 'اعتبار کارت نمادنو' : src ? 'وام ' + src.toUpperCase() : 'پشتوانه'];
}

export default function OpUserPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useOpUser(id);
  const extra = useOpUserExtra(id);
  const setStatus = useSetUserStatus();
  const applyHold = useApplyLegalHold();
  const removeHold = useRemoveLegalHold();
  const addNote = useAddUserNote();
  const [tab, setTab] = useState<Tab>('assets');
  const [modal, setModal] = useState<'' | 'note' | 'legal'>('');
  const [noteText, setNoteText] = useState('');
  const [noteTag, setNoteTag] = useState<UserNote['tag']>('security');
  const [lhKind, setLhKind] = useState<AssetKind | null>(null);
  const [lhAmount, setLhAmount] = useState('');
  const [lhRef, setLhRef] = useState('');
  const [lhReason, setLhReason] = useState(0);
  const [lhTried, setLhTried] = useState(false);
  const [lhErr, setLhErr] = useState('');

  const crumbs = [{ label: 'کاربران', href: routes.op.users }];
  if (q.isLoading) return <><PageHeading title="در حال بارگذاری…" crumbs={crumbs} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>;
  if (q.isError || !q.data?.user) return <><PageHeading title="پروفایل کاربر" crumbs={crumbs} /><ErrorBlock error={q.error} onRetry={() => q.refetch()} /></>;

  const { user, portfolio: pf, transactions, alerts } = q.data;
  const x = extra.data;
  const facilities = x?.facilities ?? [];
  const notes = x?.notes ?? [];
  const holdings: Holding[] = pf?.holdings.filter((h) => h.value > 0 || h.locks.length) ?? [];
  const total = pf?.total ?? user.portfolioValue;
  const locked = pf?.locked ?? user.lockedValue;
  const free = pf?.free ?? user.freeValue;
  const freePct = total ? (free / total) * 100 : 100;
  const lockRows = holdings.flatMap((h) => h.locks.map((l) => ({ l, h })));
  const legalOn = lockRows.some(({ l }) => l.type === 'legal') || user.flags.includes('legal_hold');
  const lockedHoldings = holdings.filter((h) => h.locked > 0).length;
  const kyc = kycOf(user);
  const blocked = user.status === 'suspended';
  const acct: [string, Tone] = blocked ? ['مسدود موقت', 'error'] : user.status === 'invited' ? ['دعوت‌شده', 'info'] : ['فعال', 'success'];
  const loanSum = facilities.filter((f) => f.kind === 'loan').reduce((s, f) => s + f.amount, 0);
  const cardSum = facilities.filter((f) => f.kind === 'card').reduce((s, f) => s + f.amount, 0);
  const bnplSum = facilities.filter((f) => f.kind === 'bnpl').reduce((s, f) => s + f.amount, 0);
  const loanPct = x?.contract?.loanMaxPct ?? 40;
  const cardPct = x?.contract?.cardPct ?? 25;
  const capacity = Math.floor((free * loanPct) / 100 / 10000) * 10000;
  const byType = (['collateral', 'vesting', 'milestone', 'installment', 'legal'] as LockType[]).map((t) => ({ t, amount: lockRows.filter(({ l }) => l.type === t).reduce((s, { l }) => s + l.amount, 0) })).filter((b) => b.amount > 0);
  const groups = [
    { label: 'صندوق طلا', color: 'var(--warning-main)', value: holdings.filter((h) => h.kind === 'gold').reduce((s, h) => s + h.value, 0) },
    { label: 'درآمد ثابت', color: 'var(--secondary-main)', value: holdings.filter((h) => h.kind === 'fixed').reduce((s, h) => s + h.value, 0) },
    { label: 'ریال', color: 'var(--grey-500)', value: holdings.filter((h) => h.kind === 'rial').reduce((s, h) => s + h.value, 0) },
    { label: 'سایر صندوق‌ها', color: 'var(--primary-main)', value: holdings.filter((h) => !['gold', 'fixed', 'rial'].includes(h.kind)).reduce((s, h) => s + h.value, 0) },
  ].filter((g) => g.value > 0);

  // legal-hold dialog
  const lhOptions = holdings.filter((h) => h.free > 0);
  const lhH = lhOptions.find((h) => h.kind === lhKind) ?? lhOptions.find((h) => h.kind === 'gold') ?? lhOptions[0];
  const lhAmt = Number(enDigits(lhAmount));
  const lhErrors = {
    amount: !(lhAmt > 0) ? 'مبلغ مسدودی را وارد کنید.' : lhH && lhAmt > lhH.free ? 'مبلغ از بخش آزاد این دارایی بیشتر است.' : '',
    ref: enDigits(lhRef).replace(/\D/g, '').length < 6 ? 'شماره مرجع / دستور الزامی است.' : '',
  };
  const openLegal = () => { setLhKind(null); setLhAmount(''); setLhRef(''); setLhReason(0); setLhTried(false); setLhErr(''); setModal('legal'); };
  const applyLegal = () => {
    setLhTried(true);
    if (!lhH || lhErrors.amount || lhErrors.ref) return;
    applyHold.mutate({ userId: user.id, holdingKind: lhH.kind as 'rial' | 'gold' | 'fixed', amount: lhAmt, reference: enDigits(lhRef).replace(/\D/g, ''), reason: LH_REASONS[lhReason] }, {
      onSuccess: () => { setModal(''); setTab('locks'); toast(`مسدودی قانونی ${money(lhAmt)} روی «${lhH.name}» اعمال شد`); },
      onError: (e) => setLhErr(errMsg(e)),
    });
  };
  const removeLegal = (l: Lock) => removeHold.mutate({ userId: user.id, lockId: l.id }, {
    onSuccess: () => toast(`رفع مسدودی قانونی · +${money(l.amount)} آزاد شد`),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const changeStatus = (status: PlatformUser['status']) => setStatus.mutate({ id: user.id, status }, {
    onSuccess: () => toast(status === 'suspended' ? `حساب ${user.fullName} به‌طور موقت مسدود شد` : 'مسدودی حساب برداشته شد'),
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const saveNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate({ userId: user.id, text: noteText.trim(), tag: noteTag }, {
      onSuccess: () => { setModal(''); setNoteText(''); toast('یادداشت ثبت شد'); },
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  const riskTone: Tone = user.riskScore < 40 ? 'success' : user.riskScore < 70 ? 'warning' : 'error';
  const riskLevel = user.riskScore < 40 ? 'کم' : user.riskScore < 70 ? 'متوسط' : 'زیاد';
  const loanF = facilities.find((f) => f.kind === 'loan');
  const coll = loanF?.collateral ? holdings.find((h) => h.kind === loanF.collateral!.holdingKind) : undefined;
  const flags: { title: string; sub: string; when: string; level: string; tone: Tone; d: string }[] = [
    ...alerts.map((a) => ({ title: a.title, sub: `${a.id}${a.amount ? ' · ' + money(a.amount) + ' تومان' : ''} · امتیاز ${faDigits(a.score)}`, when: relTime(a.createdAt, now()), level: SEVERITY[a.severity][0], tone: SEVERITY[a.severity][1], d: ICON.alert })),
    ...(x?.devices.newDevice ? [{ title: 'ورود از دستگاه جدید', sub: `${x.devices.city} · تأیید با OTP`, when: relTime(x.devices.lastLoginAt, now()), level: 'کم', tone: 'warning' as Tone, d: ICON.alert }] : []),
    ...(loanF && coll ? [{ title: 'نسبت پشتوانه', sub: `LTV ${pctFa((loanF.used / Math.max(1, coll.value)) * 100)} از سقف ۷۰٪ ${coll.name}`, when: 'لحظه‌ای', level: 'سالم', tone: 'success' as Tone, d: ICON.shield }] : []),
    ...(loanF ? [{ title: 'پرداخت اقساط', sub: `${faDigits(loanF.paidCount ?? 0)} قسط پرداخت‌شده${loanF.status === 'late' ? ' · دارای تأخیر' : ' · بدون تأخیر'}`, when: `${faDigits(loanF.paidCount ?? 0)} ماه`, level: loanF.status === 'late' ? 'منفی' : 'مثبت', tone: (loanF.status === 'late' ? 'error' : 'primary') as Tone, d: ICON.clock }] : []),
  ];

  // ── tables ──
  const holdCols: Column<Holding>[] = [
    {
      key: 'name', label: 'دارایی', width: 'minmax(0, 1.4fr)', render: (h) => {
        const nav = h.units ? h.value / h.units : 0;
        return <span className="nm-ident"><Tile d={KIND_ICON[h.kind] ?? ICON.funds} tone={KIND_TONE[h.kind] ?? 'neutral'} /><span className="nm-col"><b>{h.name}</b><small>{h.kind === 'rial' ? 'تومان' : `${units(h.units ?? 0, 1)} واحد · NAV ${money(nav)}`}</small></span></span>;
      },
    },
    { key: 'total', label: 'کل', width: '112px', render: (h) => <span className="num" style={{ fontWeight: 600 }}>{money(h.value)}</span> },
    { key: 'free', label: 'آزاد', width: '112px', render: (h) => <span className="num" style={{ color: h.free > 0 ? undefined : 'var(--text-disabled)' }}>{money(h.free)}</span> },
    { key: 'locked', label: 'رزرو', width: '112px', render: (h) => <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: h.locked ? undefined : 'var(--text-disabled)' }}>{h.locked > 0 && <Icon d={HOURGLASS} size={12} />}{h.locked ? money(h.locked) : '—'}</span> },
    { key: 'split', label: 'آزاد / رزرو', width: '104px', col: true, render: (h) => <><span style={{ width: '100%' }}><LockBar free={h.free} locked={h.locked} height={5} /></span><span className="sm el">{h.locked ? Array.from(new Set(h.locks.map((l) => LOCK_META[l.type].short))).join(' + ') : 'همه آزاد'}</span></> },
  ];
  type LockRow = { l: Lock; h: Holding };
  const lockCols: Column<LockRow>[] = [
    { key: 'type', label: 'نوع', width: '96px', render: ({ l }) => <LockTypeChip type={l.type} /> },
    { key: 'asset', label: 'دارایی', width: '128px', col: true, render: ({ l, h }) => { const nav = h.units ? h.value / h.units : 0; return <><b className="el" style={{ fontWeight: 600 }}>{h.name}</b><span className="sm">{h.kind === 'rial' || !nav ? 'تومان' : `${units(l.amount / nav)} واحد`}</span></>; } },
    { key: 'amount', label: 'مبلغ رزرو', width: '108px', render: ({ l }) => <span className="num" style={{ fontWeight: 600 }}>{money(l.amount)}</span> },
    { key: 'by', label: 'ایجادکننده', width: '112px', col: true, render: ({ l }) => { const [by, role] = lockBy(l, user.orgName); return <><b className="el" style={{ fontWeight: 600, fontSize: 12.5 }}>{by}</b><span className="sm el">{role}</span></>; } },
    {
      key: 'cond', label: 'شرط آزادسازی', width: 'minmax(0, 1.6fr)', col: true, render: ({ l }) => {
        const steps = l.steps ?? [];
        const rel = steps.filter((s) => s.status === 'released');
        return (
          <>
            <b className="el" style={{ fontWeight: 600, fontSize: 12.5, maxWidth: '100%' }}>{l.title}</b>
            <span className="sm el" style={{ maxWidth: '100%' }}>{l.condition}</span>
            {l.type === 'milestone' && steps.length > 0 && <span className="sm">{faDigits(rel.length)} از {faDigits(steps.length)} مرحله · {pctFa(rel.reduce((a, s) => a + s.sharePct, 0))} آزاد شده</span>}
          </>
        );
      },
    },
    { key: 'date', label: 'تاریخ', width: '84px', render: ({ l }) => <span className="num sm">{jDate(l.createdAt)}</span> },
    {
      key: 'act', label: '', width: '104px', align: 'end', render: ({ l }) => (
        <>
          {l.type === 'legal' && <button type="button" className="nm-btn sm line" disabled={removeHold.isPending} onClick={() => removeLegal(l)}>رفع مسدودی</button>}
          {l.type === 'milestone' && <Link href={routes.op.organization(user.orgId)} className="nm-btn sm text">قرارداد سازمان</Link>}
          {(l.type === 'collateral' || l.type === 'installment') && <button type="button" className="nm-btn sm text" onClick={() => setTab('credit')}>تسهیلات</button>}
        </>
      ),
    },
  ];
  const txCols: Column<Transaction>[] = [
    { key: 'title', label: 'تراکنش', width: 'minmax(0, 1.6fr)', col: true, render: (t) => <><b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{t.title}</b><span className="sm num ltr">{t.trackingCode}</span></> },
    { key: 'type', label: 'نوع', width: '108px', render: (t) => { const [l, tone] = txType(t); return <Pill tone={tone}>{l}</Pill>; } },
    { key: 'amount', label: 'مبلغ', width: '132px', render: (t) => <span className="num" style={{ fontWeight: 600, color: t.category === 'lock' ? undefined : t.amount > 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{t.category === 'lock' ? money(t.amount) : signedMoney(t.amount)}</span> },
    { key: 'at', label: 'تاریخ', width: '128px', render: (t) => <span className="num sm">{jDate(t.at)} {time(t.at)}</span> },
    { key: 'st', label: 'وضعیت', width: '104px', render: (t) => t.status === 'success' ? <Pill tone="success" dot>موفق</Pill> : t.status === 'pending' ? <Pill tone="warning" dot>در حال تسویه</Pill> : <Pill tone="error" dot>ناموفق</Pill> },
  ];

  const kycPill = kyc === 'ok' ? <Pill tone="success" icon={ICON.shield}>KYC تأیید · سطح {faDigits(user.kycLevel)}</Pill> : kyc === 'pending' ? <Pill tone="warning" icon={ICON.shield}>KYC در انتظار · سطح {faDigits(user.kycLevel)}</Pill> : <Pill tone="error" icon={ICON.shield}>KYC ردشده</Pill>;

  return (
    <>
      <PageHeading
        crumbs={crumbs}
        lead={<Ava letter={user.avatarLetter} id={user.id} size="xl" />}
        title={user.fullName}
        sub={<><Link href={routes.op.organization(user.orgId)}>{user.orgName}</Link> · کد پرسنلی <span className="num">{faDigits(user.employeeCode ?? '—')}</span>{x?.department ? ` · واحد ${x.department}` : ''} · عضو از <span className="num">{jDate(user.joinedAt)}</span></>}
        pills={<><Pill tone={acct[1]} dot>{acct[0]}</Pill>{kycPill}<Pill tone="primary">{user.creditScore ? `امتیاز ${faDigits(user.creditScore)} · ${band(user.creditScore)}` : 'بدون امتیاز اعتباری'}</Pill>{legalOn && <Pill tone="error" icon={ICON.lock}>مسدودی قانونی</Pill>}</>}
      >
        <button type="button" className="nm-btn ghost" onClick={() => setModal('note')}><Icon d={ICON.pen} size={16} />یادداشت{notes.length > 0 && <span className="nm-count" style={{ height: 18 }}>{faDigits(notes.length)}</span>}</button>
        {!blocked
          ? <button type="button" className="nm-btn line danger" disabled={setStatus.isPending} onClick={() => changeStatus('suspended')}><Icon d={ICON.ban} size={16} />مسدودسازی موقت</button>
          : <button type="button" className="nm-btn line ok" disabled={setStatus.isPending} onClick={() => changeStatus('active')}><Icon d={ICON.check} size={16} />رفع مسدودی</button>}
      </PageHeading>

      <StatStrip items={[
        { label: 'دارایی کل', value: fm(total), unit: 'میلیون تومان', note: `آزاد ${pctFa(freePct)} · رزرو ${pctFa(100 - freePct)}` },
        { label: 'دارایی آزاد', value: fm(free), unit: 'میلیون', note: 'قابل فروش و برداشت' },
        { label: 'رزروشده', value: fm(locked), unit: 'میلیون', note: pf ? `${faDigits(lockRows.length)} قلم در ${faDigits(lockedHoldings)} دارایی` : 'جزئیات در دسترس نیست' },
        { label: 'تسهیلات فعال', value: fm(loanSum + cardSum + bnplSum), unit: 'میلیون', note: [loanSum && `وام ${fm(loanSum)} م`, cardSum && `کارت ${fm(cardSum)} م`, bnplSum && `اقساطی ${fm(bnplSum)} م`].filter(Boolean).join(' · ') || 'بدون تسهیلات' },
      ]} />

      <Tabs label="بخش‌های پروفایل" size="lg" value={tab} onChange={setTab} items={[
        { key: 'assets', label: 'دارایی' },
        { key: 'locks', label: 'رزروها', count: lockRows.length, hot: legalOn },
        { key: 'tx', label: 'تراکنش‌ها', count: transactions.length },
        { key: 'credit', label: 'تسهیلات', count: facilities.length },
        { key: 'risk', label: 'ریسک', count: alerts.length || undefined, hot: alerts.length > 0 },
        { key: 'log', label: 'لاگ' },
      ]} />

      {tab === 'assets' && (
        <div className="nm-grid side">
          <Card flush title="دارایی‌ها" count={holdings.length} actions={lockRows.length > 0 && <button type="button" className="nm-more" onClick={() => setTab('locks')}>{faDigits(lockRows.length)} قلم رزرو<Icon d={ICON.chevL} size={14} /></button>}>
            <Table columns={holdCols} rows={holdings} rowKey={(h) => h.kind} empty={<Empty title="دارایی ثبت نشده" sub="جزئیات کیف پول‌های این کاربر در دسترس نیست؛ خلاصه از رکورد کاربر پلتفرم نمایش داده می‌شود." />} />
            <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 13 }}>جمع دارایی</b><BigNum value={money(total)} unit="تومان" style={{ marginRight: 'auto' }} /></div>
              <FreeLocked free={free} locked={locked} />
            </div>
          </Card>
          <div className="nm-stack">
            <Card title="ترکیب دارایی" actions={<Pill tone="warning">رزرو {pctFa(100 - freePct)}</Pill>}>
              {groups.length ? <Allocation items={groups} /> : <Empty title="دارایی ثبت نشده" />}
            </Card>
            <Card title="اعتبار و دسترسی">
              <KV rows={[
                ['امتیاز اعتباری', <span key="s" className="num">{user.creditScore ? `${faDigits(user.creditScore)} · ${band(user.creditScore)}` : '—'}</span>],
                ['سقف قرارداد سازمان', <span key="c" className="num">وام {pctFa(loanPct)} · کارت {pctFa(cardPct)}</span>],
                ['ظرفیت وام (از دارایی آزاد)', <span key="v" className="num">{money(capacity)}</span>],
                ['موبایل', <span key="m" className="num ltr">{faDigits(user.mobile.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))}</span>],
                ['کد ملی', <span key="n" className="num ltr">{faDigits(user.nationalId.slice(0, 3) + '•••••' + user.nationalId.slice(-2))}</span>],
                ['آخرین ورود', x ? `${relTime(x.devices.lastLoginAt, now())} · ${x.devices.city}` : relTime(user.lastActiveAt, now())],
                ['دستگاه‌ها', <span key="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{x ? `${faDigits(x.devices.count)} فعال` : '—'}{x?.devices.newDevice && <Pill tone="warning">دستگاه جدید</Pill>}</span>],
              ]} />
            </Card>
            <Card title="یادداشت‌های بهره‌بردار" count={notes.length || undefined} more={{ label: 'افزودن', onClick: () => setModal('note') }}>
              {notes.length ? (
                <List>{notes.slice(0, 3).map((n) => <ListRow key={n.id} title={<span style={{ fontWeight: 500, whiteSpace: 'normal' }}>{n.text}</span>} sub={`${n.by} · ${jDate(n.at)} · ${NOTE_TAGS.find(([k]) => k === n.tag)?.[1] ?? ''}`} />)}</List>
              ) : <span className="mute" style={{ fontSize: 12.5 }}>یادداشتی ثبت نشده است.</span>}
            </Card>
          </div>
        </div>
      )}

      {tab === 'locks' && (
        <Card flush title="اقلام رزرو" count={lockRows.length} sub="آزادسازی فقط با تحقق شرط یا دستور مرجع"
          actions={pf && <button type="button" className="nm-btn sm line danger" onClick={openLegal} disabled={!lhOptions.length}><Icon d={ICON.lock} size={15} />اعمال مسدودی قانونی</button>}>
          <Table columns={lockCols} rows={lockRows} rowKey={({ l }) => l.id} dimRow={() => false} minWidth={860}
            empty={<Empty icon={LOCK_META.none.d} tone="success" title={pf ? 'همه دارایی‌های این کاربر آزاد است' : 'جزئیات رزروها در دسترس نیست'} />} />
          {lockRows.length > 0 && (
            <div className="nm-tfoot">
              <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{faDigits(lockRows.length)} قلم · جمع {money(locked)}</b>
              <span className="nm-legend" style={{ marginRight: 'auto' }}>{byType.map((b) => <span key={b.t}><i style={{ background: `var(${LOCK_COL[b.t]})` }} />{LOCK_META[b.t].short}<b>{fm(b.amount)} م</b></span>)}</span>
            </div>
          )}
        </Card>
      )}

      {tab === 'tx' && (
        <Card flush title="تراکنش‌ها" count={transactions.length}>
          <Table columns={txCols} rows={transactions} rowKey={(t) => t.id} empty={<Empty title="تراکنشی ثبت نشده است" />} />
        </Card>
      )}

      {tab === 'credit' && (
        facilities.length ? (
          <div className="nm-grid c2">
            {facilities.map((f) => {
              const s = FAC_STATUS[f.status];
              const paid = f.paidCount ?? 0, tot = f.totalCount ?? 0;
              const card = f.kind === 'card';
              const reserve = card ? lockRows.find(({ l }) => l.type === 'collateral' && (l.sourceId ?? '').startsWith('card')) : undefined;
              const kind: [string, Tone, string] = f.kind === 'loan' ? ['وام', 'info', ICON.percent] : card ? ['اعتبار کارت', 'primary', ICON.card] : ['خرید اقساطی', 'success', ICON.bag];
              const pct = card ? (f.amount ? f.used / f.amount : 0) : tot ? paid / tot : 0;
              const rows: [string, string][] = card
                ? [['استفاده‌شده', money(f.used)], ['تسویه خودکار', f.nextDue ? `${jDayMonth(f.nextDue.at)} · کیف پول ریالی` : '—'], ['رزرو تسویه', reserve ? `${reserve.h.name} · ${money(reserve.l.amount)}` : '—']]
                : [['پرداخت‌شده', `${faDigits(paid)} از ${faDigits(tot)} · ${faDigits(tot - paid)} قسط مانده`], ['قسط بعدی', f.nextDue ? `${money(f.nextDue.amount)} · ${jDayMonth(f.nextDue.at)}` : `مانده ${money(f.used)}`], ['پشتوانه', f.collateral ? `${assetName(f.collateral.holdingKind)} · ${money(f.collateral.amount)}` : '—']];
              return (
                <Card key={f.id} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Tile d={kind[2]} tone={kind[1]} />{f.title}</span>} actions={<Pill tone={s[1]} dot>{s[0]}</Pill>}>
                  <BigNum value={money(f.amount)} unit={card ? `تومان سقف · ${pctFa(cardPct)} دارایی` : f.kind === 'loan' ? `تومان · ${faDigits(f.months ?? tot)} ماهه` : `تومان · ${faDigits(tot)} قسط`} />
                  <Meter value={pct} tone={kind[1]} />
                  <KV rows={rows.map(([k, v]) => [k, <span key={k} className="num">{v}</span>])} />
                </Card>
              );
            })}
          </div>
        ) : !extra.isLoading && <Card><Empty icon={ICON.card} title="تسهیلات فعالی ندارد" /></Card>
      )}

      {tab === 'risk' && (
        <div className="nm-grid side-s">
          <Card title="امتیاز ریسک">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <Ring value={user.riskScore / 100} size={128} color={`var(--${riskTone}-main)`} label={`امتیاز ریسک ${faDigits(user.riskScore)} از ۱۰۰`}>
                <span className="num" style={{ fontSize: 30, fontWeight: 600 }}>{faDigits(user.riskScore)}</span>
                <span className="mute" style={{ fontSize: 11.5 }}>{riskLevel} · از ۱۰۰</span>
              </Ring>
              <span className="mute" style={{ fontSize: 12 }}>آخرین محاسبه امروز ۰۶:۰۰</span>
            </div>
          </Card>
          <Card title="نشانه‌ها و هشدارها" count={flags.length || undefined} more={{ label: 'ریسک و تقلب', href: routes.op.risk }}>
            {flags.length ? (
              <List>{flags.map((fl, i) => <ListRow key={i} lead={<Tile d={fl.d} tone={fl.tone} />} title={fl.title} sub={fl.sub} trail={<><span className="num mute" style={{ fontSize: 12 }}>{fl.when}</span><Pill tone={fl.tone}>{fl.level}</Pill></>} />)}</List>
            ) : <Empty icon={ICON.shield} tone="success" title="نشانه پرخطری برای این کاربر ثبت نشده است" />}
          </Card>
        </div>
      )}

      {tab === 'log' && (
        <Card title="لاگ فعالیت" count={x?.logs.length}>
          {extra.isLoading ? <span className="mute">در حال بارگذاری…</span> : (
            <List>
              {(x?.logs ?? []).map((l) => (
                <ListRow key={l.id}
                  lead={<i style={{ width: 8, height: 8, borderRadius: '50%', background: l.tone === 'default' ? 'var(--grey-500)' : `var(--${l.tone}-main)`, flex: 'none', margin: '0 6px' }} />}
                  title={<span style={{ fontWeight: 500 }}>{l.text}</span>} sub={l.by}
                  trail={<span className="num mute" style={{ fontSize: 12 }}>{jDate(l.at)} {time(l.at)}</span>} />
              ))}
            </List>
          )}
        </Card>
      )}

      <Dialog open={modal === 'note'} onClose={() => setModal('')} title={`یادداشت داخلی — ${user.fullName}`} sub="فقط برای تیم بهره‌بردار"
        footer={<><button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button><button type="button" className="nm-btn" disabled={!noteText.trim() || addNote.isPending} onClick={saveNote}>ثبت یادداشت</button></>}>
        <Field label="متن یادداشت" htmlFor="note-text">
          <textarea id="note-text" className="nm-ta" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="مثلاً پیگیری ورود از دستگاه جدید — تماس تأیید شد" />
        </Field>
        <Field label="برچسب"><Chips label="برچسب یادداشت" value={noteTag} onChange={setNoteTag} options={NOTE_TAGS.map(([k, l]) => ({ key: k, label: l }))} /></Field>
      </Dialog>

      <Dialog open={modal === 'legal'} onClose={() => setModal('')} width={560} title={`اعمال مسدودی قانونی — ${user.fullName}`} icon={<Tile d={ICON.lock} tone="error" size="lg" />}
        footer={lhH && <><button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button><button type="button" className="nm-btn danger" disabled={applyHold.isPending} onClick={applyLegal}>{applyHold.isPending ? 'در حال اعمال…' : 'اعمال مسدودی'}</button></>}>
        {lhH ? (
          <>
            <Field label="دارایی">
              <Chips label="دارایی" value={lhH.kind} onChange={(k) => { setLhKind(k); setLhErr(''); }} options={lhOptions.map((h) => ({ key: h.kind, label: h.name }))} />
            </Field>
            <Section>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-neutral)' }}><FreeLocked free={lhH.free} locked={lhH.locked} /></div>
            </Section>
            <div className="nm-grid c2" style={{ gap: 12 }}>
              <Field label="مبلغ مسدودی (تومان)" htmlFor="lh-amount" error={lhTried && lhErrors.amount ? lhErrors.amount : undefined}
                help={<>حداکثر: کل بخش آزاد · <button type="button" className="nm-more" style={{ fontSize: 12 }} onClick={() => setLhAmount(String(Math.floor(lhH.free)))}>{money(lhH.free)}</button></>}>
                <NumInput id="lh-amount" label="مبلغ مسدودی" width={220} value={lhAmount ? money(Number(enDigits(lhAmount))) : ''} onChange={(v) => { setLhAmount(enDigits(v).replace(/\D/g, '').slice(0, 13)); setLhErr(''); }} placeholder="۱۰٬۰۰۰٬۰۰۰" invalid={lhTried && !!lhErrors.amount} />
              </Field>
              <Field label="شماره مرجع / دستور (الزامی)" htmlFor="lh-ref" error={lhTried && lhErrors.ref ? lhErrors.ref : undefined} help="بدون شماره مرجع قابل ثبت نیست">
                <NumInput id="lh-ref" label="شماره مرجع" width={220} ltr value={faDigits(lhRef)} onChange={(v) => { setLhRef(enDigits(v).replace(/\D/g, '').slice(0, 20)); setLhErr(''); }} placeholder="۱۴۰۵۰۰۹۸۴۵۲۱" invalid={lhTried && !!lhErrors.ref} />
              </Field>
            </div>
            <Field label="دلیل"><Chips label="دلیل مسدودی" value={lhReason} onChange={setLhReason} options={LH_REASONS.map((r, i) => ({ key: i, label: r }))} /></Field>
            <Note tone="err">مبلغ از بخش آزاد «{lhH.name}» کسر و مسدود می‌شود؛ تا رفع دستور مرجع قابل فروش یا برداشت نیست. کاربر اعلان «مسدودی قانونی» می‌بیند.</Note>
            {lhErr && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600 }}>{lhErr}</span>}
          </>
        ) : <span className="mute">این کاربر دارایی آزادی برای مسدودسازی ندارد.</span>}
      </Dialog>
    </>
  );
}
