'use client';
/**
 * Operator console — user profile (design: op-user): holdings with free/locked split, lock items (legal hold
 * apply/remove), transactions, facilities, risk, audit log, operator notes, suspend/activate.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { AssetKind, Holding, Lock, LockType, PlatformUser, RiskAlert, Transaction } from '@/types/domain';
import { useApplyLegalHold, useOpUser, useRemoveLegalHold, useSetUserStatus } from '@/api/op';
import { useAddUserNote, useOpUserExtra, type Facility, type UserNote } from '@/api/op-core-extra';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ICON, LOCK_COL, LkType, Modal, ModalTitle, PanelState, donut, errMsg, fm, pctFa } from '@/components/op/core/ui';
import { enDigits, faDigits, jDate, jDayMonth, money, relTime, signedMoney, time, units } from '@/lib/format';
import { now } from '@/lib/clock';
import { ASSET_META, LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Tab = 'assets' | 'locks' | 'tx' | 'credit' | 'risk' | 'log';
const KIND_ICON: Partial<Record<AssetKind, string>> = { rial: ICON.wallet, gold: ICON.gold, fixed: ICON.bond, equity: ICON.trend, mixed: ICON.funds, silver: ICON.gold, leverage: ICON.trend };
const LH_REASONS = ['دستور مرجع قضایی', 'بررسی ریسک و تقلب', 'درخواست نهاد ناظر'];
const NOTE_TAGS: [UserNote['tag'], string][] = [['security', 'امنیت'], ['credit', 'اعتبار'], ['support', 'پشتیبانی']];
const SEVERITY: Record<RiskAlert['severity'], [string, string, string]> = { low: ['کم', 'var(--soft-warning)', 'var(--warning-text)'], medium: ['متوسط', 'var(--soft-warning)', 'var(--warning-text)'], high: ['زیاد', 'var(--soft-error)', 'var(--error-text)'], critical: ['بحرانی', 'var(--soft-error)', 'var(--error-text)'] };
const FAC_STATUS: Record<Facility['status'], [string, string, string]> = { current: ['جاری', 'var(--soft-success)', 'var(--success-text)'], late: ['معوق', 'var(--soft-error)', 'var(--error-text)'], blocked: ['مسدود', 'var(--soft-error)', 'var(--error-text)'], settled: ['تسویه‌شده', 'var(--soft-default)', 'var(--default-text)'] };

const band = (s: number) => (!s ? 'بدون امتیاز' : s >= 740 ? 'عالی' : s >= 670 ? 'خوب' : s >= 580 ? 'متوسط' : 'ضعیف');
const kycOf = (u: PlatformUser) => (u.flags.includes('kyc_rejected') ? 'rejected' : u.kycLevel < 2 ? 'pending' : 'ok');
const assetName = (k: AssetKind) => ASSET_META[k]?.name ?? k;

function txType(t: Transaction): [string, string, string] {
  switch (t.category) {
    case 'trade': return [t.amount < 0 ? 'خرید واحد' : 'فروش واحد', 'var(--soft-warning)', 'var(--warning-text)'];
    case 'inbox': return ['بسته سازمانی', 'var(--soft-primary)', 'var(--primary-text)'];
    case 'card': return ['کارت', 'var(--soft-info)', 'var(--info-text)'];
    case 'loan': case 'installment': return ['قسط', 'var(--soft-default)', 'var(--default-text)'];
    case 'rial': return t.amount < 0 ? ['برداشت', 'var(--soft-error)', 'var(--error-text)'] : ['واریز', 'var(--soft-success)', 'var(--success-text)'];
    case 'fund': return ['سود', 'var(--soft-success)', 'var(--success-text)'];
    case 'lock': return t.lockEvent === 'released' ? ['آزادسازی', 'var(--soft-primary)', 'var(--primary-text)'] : ['قفل', 'var(--soft-warning)', 'var(--warning-text)'];
    default: return ['سایر', 'var(--soft-default)', 'var(--default-text)'];
  }
}

function lockBy(l: Lock, orgName: string): [string, string] {
  if (l.type === 'vesting' || l.type === 'milestone') return [orgName, 'سازمان'];
  if (l.type === 'legal') return ['بهره‌بردار', l.reference ? 'مرجع ' + faDigits(l.reference) : 'دستور مرجع'];
  if (l.type === 'installment') return ['سیستم', 'خرید اقساطی'];
  const src = l.sourceId ?? '';
  return ['سیستم', src.startsWith('card') ? 'اعتبار کارت نمادنو' : src ? 'وام ' + src.toUpperCase() : 'وثیقه'];
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

  const back = <Link href={routes.op.users} className="ibtn" aria-label="بازگشت به کاربران" style={{ background: 'var(--card-bg)', boxShadow: '0 0 0 1px var(--glass-edge)', color: 'var(--text-primary)', flex: 'none' }}><Icon d={ICON.chevR} size={20} /></Link>;
  if (q.isLoading) return <><div style={{ height: 48, display: 'flex', alignItems: 'center' }}>{back}</div><PanelState loading height={92} /><PanelState loading height={88} /><PanelState loading height={360} /></>;
  if (q.isError || !q.data?.user) return <><div style={{ height: 48, display: 'flex', alignItems: 'center' }}>{back}</div><PanelState error={q.error} onRetry={() => q.refetch()} /></>;

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
  const acct = blocked ? { label: 'مسدود موقت', bg: 'var(--soft-error)', fg: 'var(--error-text)' } : user.status === 'invited' ? { label: 'دعوت‌شده', bg: 'var(--soft-info)', fg: 'var(--info-text)' } : { label: 'فعال', bg: 'var(--soft-success)', fg: 'var(--success-text)' };
  const loanSum = facilities.filter((f) => f.kind === 'loan').reduce((s, f) => s + f.amount, 0);
  const cardSum = facilities.filter((f) => f.kind === 'card').reduce((s, f) => s + f.amount, 0);
  const bnplSum = facilities.filter((f) => f.kind === 'bnpl').reduce((s, f) => s + f.amount, 0);
  const loanPct = x?.contract?.loanMaxPct ?? 40;
  const cardPct = x?.contract?.cardPct ?? 25;
  const capacity = Math.floor((free * loanPct) / 100 / 10000) * 10000;
  const byType = (['collateral', 'vesting', 'milestone', 'installment', 'legal'] as LockType[]).map((t) => ({ t, amount: lockRows.filter(({ l }) => l.type === t).reduce((s, { l }) => s + l.amount, 0) })).filter((b) => b.amount > 0);

  // allocation (side card)
  const groups = [
    { name: 'صندوق طلا', col: '--warning-main', v: holdings.filter((h) => h.kind === 'gold').reduce((s, h) => s + h.value, 0) },
    { name: 'درآمد ثابت', col: '--secondary-main', v: holdings.filter((h) => h.kind === 'fixed').reduce((s, h) => s + h.value, 0) },
    { name: 'ریال', col: '--grey-500', v: holdings.filter((h) => h.kind === 'rial').reduce((s, h) => s + h.value, 0) },
    { name: 'سایر صندوق‌ها', col: '--primary-main', v: holdings.filter((h) => !['gold', 'fixed', 'rial'].includes(h.kind)).reduce((s, h) => s + h.value, 0) },
  ].filter((g) => g.v > 0);
  const segs = donut(groups.map((g) => g.v));

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

  const kpis = [
    { title: 'دارایی کل', value: fm(total), unit: 'میلیون تومان', note: `آزاد ${pctFa(freePct)} · قفل ${pctFa(100 - freePct)}`, d: ICON.wallet, bg: 'var(--soft-primary)', fg: 'var(--primary-text)' },
    { title: 'دارایی آزاد', value: fm(free), unit: 'میلیون', note: 'قابل فروش و برداشت', d: ICON.check, bg: 'var(--soft-success)', fg: 'var(--success-text)' },
    { title: 'قفل‌شده', value: fm(locked), unit: 'میلیون', note: pf ? `${faDigits(lockRows.length)} قلم در ${faDigits(lockedHoldings)} دارایی` : 'جزئیات در دسترس نیست', d: ICON.lock, bg: 'var(--soft-warning)', fg: 'var(--warning-text)' },
    { title: 'تسهیلات فعال', value: fm(loanSum + cardSum + bnplSum), unit: 'میلیون', note: [loanSum && `وام ${fm(loanSum)} م`, cardSum && `کارت ${fm(cardSum)} م`, bnplSum && `اقساطی ${fm(bnplSum)} م`].filter(Boolean).join(' · ') || 'بدون تسهیلات', d: ICON.percent, bg: 'var(--soft-info)', fg: 'var(--info-text)' },
  ];
  const tabs: [Tab, string, string, 'default' | 'error' | 'warning' | ''][] = [
    ['assets', 'دارایی', '', ''], ['locks', 'قفل‌ها', faDigits(lockRows.length), legalOn ? 'error' : 'default'], ['tx', 'تراکنش‌ها', faDigits(transactions.length), 'default'],
    ['credit', 'تسهیلات', faDigits(facilities.length), 'default'], ['risk', 'ریسک', alerts.length ? faDigits(alerts.length) : '', 'warning'], ['log', 'لاگ', '', ''],
  ];

  const riskCol = user.riskScore < 40 ? '--success-main' : user.riskScore < 70 ? '--warning-main' : '--error-main';
  const riskLevel = user.riskScore < 40 ? 'کم' : user.riskScore < 70 ? 'متوسط' : 'زیاد';
  const loanF = facilities.find((f) => f.kind === 'loan');
  const coll = loanF?.collateral ? holdings.find((h) => h.kind === loanF.collateral!.holdingKind) : undefined;
  const flags: { title: string; sub: string; when: string; level: string; d: string; bg: string; fg: string; href?: string }[] = [
    ...alerts.map((a) => ({ title: a.title, sub: `${a.id}${a.amount ? ' · ' + money(a.amount) + ' تومان' : ''} · امتیاز ${faDigits(a.score)}`, when: relTime(a.createdAt, now()), level: SEVERITY[a.severity][0], d: ICON.alert, bg: SEVERITY[a.severity][1], fg: SEVERITY[a.severity][2], href: routes.op.risk })),
    ...(x?.devices.newDevice ? [{ title: 'ورود از دستگاه جدید', sub: `${x.devices.city} · تأیید با OTP`, when: relTime(x.devices.lastLoginAt, now()), level: 'کم', d: ICON.alert, bg: 'var(--soft-warning)', fg: 'var(--warning-text)' }] : []),
    ...(loanF && coll ? [{ title: 'نسبت وثیقه', sub: `LTV ${pctFa((loanF.used / Math.max(1, coll.value)) * 100)} از سقف ۷۰٪ ${coll.name}`, when: 'لحظه‌ای', level: 'سالم', d: ICON.shield, bg: 'var(--soft-success)', fg: 'var(--success-text)' }] : []),
    ...(loanF ? [{ title: 'پرداخت اقساط', sub: `${faDigits(loanF.paidCount ?? 0)} قسط پرداخت‌شده${loanF.status === 'late' ? ' · دارای تأخیر' : ' · بدون تأخیر'}`, when: `${faDigits(loanF.paidCount ?? 0)} ماه`, level: loanF.status === 'late' ? 'منفی' : 'مثبت', d: ICON.clock, bg: loanF.status === 'late' ? 'var(--soft-error)' : 'var(--soft-primary)', fg: loanF.status === 'late' ? 'var(--error-text)' : 'var(--primary-text)' }] : []),
  ];

  return (
    <>
      <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        {back}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>{user.fullName}</h4>
            <span className="lbl" style={{ gap: 5, background: kyc === 'ok' ? 'var(--soft-success)' : kyc === 'pending' ? 'var(--soft-warning)' : 'var(--soft-error)', color: kyc === 'ok' ? 'var(--success-text)' : kyc === 'pending' ? 'var(--warning-text)' : 'var(--error-text)' }}><Icon d={ICON.shield} size={12} strokeWidth={2.4} />{kyc === 'ok' ? 'KYC تأیید' : kyc === 'pending' ? 'KYC در انتظار' : 'KYC ردشده'} · سطح {faDigits(user.kycLevel)}</span>
            <span className="lbl" style={{ background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{user.creditScore ? `امتیاز ${faDigits(user.creditScore)} · ${band(user.creditScore)}` : 'بدون امتیاز اعتباری'}</span>
            <span className="lbl" style={{ gap: 5, background: acct.bg, color: acct.fg }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{acct.label}</span>
            {legalOn && <span className="lbl" style={{ gap: 4, background: 'var(--soft-error)', color: 'var(--error-text)' }}><Icon d={ICON.lock} size={12} strokeWidth={2} />مسدودی قانونی</span>}
          </div>
          <nav aria-label="مسیر" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, lineHeight: 1.3 }}>
            <Link href={routes.op.overview} style={{ color: 'var(--text-primary)' }}>بهره‌بردار</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <Link href={routes.op.users} style={{ color: 'var(--text-primary)' }}>کاربران</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <span style={{ color: 'var(--text-disabled)' }}>{user.fullName}</span>
          </nav>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btno" onClick={() => setModal('note')}><Icon d={ICON.pen} size={16} />یادداشت{notes.length > 0 && <span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>{faDigits(notes.length)}</span>}</button>
          {!blocked
            ? <button type="button" className="btno" disabled={setStatus.isPending} onClick={() => changeStatus('suspended')} style={{ borderColor: 'var(--error-main)', color: 'var(--error-text)' }}><Icon d={ICON.ban} size={16} />مسدودسازی موقت</button>
            : <button type="button" className="btnp" disabled={setStatus.isPending} onClick={() => changeStatus('active')} style={{ background: 'var(--success-main)', color: 'var(--success-contrast)' }}><Icon d={ICON.check} size={16} strokeWidth={2.2} />رفع مسدودی</button>}
        </div>
      </div>

      <div className="card" style={{ minHeight: 92, flex: 'none', boxSizing: 'border-box', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, flex: 'none' }}>{user.avatarLetter}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3, width: 230, minWidth: 0, flex: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{user.fullName}</span>
          <Link href={routes.op.organization(user.orgId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{user.orgName[0]}</span>
            {user.orgName} · کد پرسنلی <span className="num" dir="ltr">{faDigits(user.employeeCode ?? '—')}</span><Icon d={ICON.chevL} size={14} style={{ color: 'var(--text-secondary)' }} />
          </Link>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{x?.department ? `واحد ${x.department} · ` : ''}عضو از <span className="num" dir="ltr">{jDate(user.joinedAt)}</span></span>
        </div>
        <span style={{ width: 1, height: 52, background: 'var(--divider)', flex: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '6px 28px', fontSize: 12, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--text-secondary)' }}>موبایل</span><span style={{ color: 'var(--text-secondary)' }}>کد ملی</span><span style={{ color: 'var(--text-secondary)' }}>آخرین ورود</span><span style={{ color: 'var(--text-secondary)' }}>دستگاه‌ها</span>
          <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{faDigits(user.mobile.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3'))}</span>
          <span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{faDigits(user.nationalId.slice(0, 3) + '•••••' + user.nationalId.slice(-2))}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{x ? `${relTime(x.devices.lastLoginAt, now())} · ${x.devices.city}` : relTime(user.lastActiveAt, now())}</span>
          <span style={{ fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{x ? `${faDigits(x.devices.count)} فعال` : '—'}{x?.devices.newDevice && <span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>دستگاه جدید</span>}</span>
        </div>
      </div>

      <div style={{ height: 88, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.title} className="card" style={{ boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, color: k.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={k.d} size={22} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k.title}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 22 }}>{k.value}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.unit}</span></span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.note}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: 'none', minHeight: 400, display: 'flex', gap: 20, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div role="tablist" style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--divider)' }}>
            {tabs.map(([k, l, c, tone]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                {l}{c && <span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: tone === 'error' ? 'var(--soft-error)' : tone === 'warning' ? 'var(--soft-warning)' : 'var(--soft-default)', color: tone === 'error' ? 'var(--error-text)' : tone === 'warning' ? 'var(--warning-text)' : 'var(--default-text)' }}>{c}</span>}
              </button>
            ))}
            {tab === 'locks' && pf && <button type="button" className="btno" onClick={openLegal} disabled={!lhOptions.length} style={{ marginRight: 'auto', height: 32, marginLeft: 4, borderColor: 'var(--error-main)', color: 'var(--error-text)' }}><Icon d={ICON.lock} size={16} />اعمال مسدودی قانونی</button>}
          </div>

          {tab === 'assets' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingBottom: 12 }}>
              <div className="th" style={{ height: 36, gridTemplateColumns: 'minmax(0, 1fr) 104px 104px 104px 92px' }}><span>دارایی</span><span>کل</span><span>آزاد</span><span>قفل</span><span>آزاد / قفل</span></div>
              {holdings.map((h) => {
                const meta = ASSET_META[h.kind];
                const nav = h.units ? h.value / h.units : 0;
                const types = Array.from(new Set(h.locks.map((l) => LOCK_META[l.type].short)));
                return (
                  <div key={h.kind} className="tr" style={{ height: 40, gridTemplateColumns: 'minmax(0, 1fr) 104px 104px 104px 92px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 30, height: 30, borderRadius: 8, background: meta?.soft ?? 'var(--soft-default)', color: meta?.fg ?? 'var(--default-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={KIND_ICON[h.kind] ?? ICON.funds} size={16} /></span>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.kind === 'rial' ? 'تومان' : `${units(h.units ?? 0, 1)} واحد · NAV ${money(nav)}`}</span>
                      </span>
                    </span>
                    <span className="num" style={{ fontWeight: 500 }}>{money(h.value)}</span>
                    <span className="num" style={{ color: h.free > 0 ? 'var(--text-primary)' : 'var(--text-disabled)' }}>{money(h.free)}</span>
                    <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: h.locked ? 'var(--text-primary)' : 'var(--text-disabled)' }}>{h.locked > 0 && <Icon d={ICON.lock} size={12} />}{h.locked ? money(h.locked) : '—'}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><LockBar free={h.free} locked={h.locked} /><span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.locked ? types.join(' + ') : 'همه آزاد'}</span></span>
                  </div>
                );
              })}
              {!pf && <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>جزئیات کیف پول‌های این کاربر در دسترس نیست؛ خلاصه از رکورد کاربر پلتفرم نمایش داده می‌شود.</div>}
              <div className="tr" style={{ height: 40, gridTemplateColumns: 'minmax(0, 1fr) 104px 104px 104px 92px', borderBottom: 0, background: 'var(--table-head)' }}>
                <span style={{ fontWeight: 700 }}>جمع دارایی</span>
                <span className="num" style={{ fontWeight: 700 }}>{money(total)}</span>
                <span className="num" style={{ fontWeight: 600 }}>{money(free)}</span>
                <span className="num" style={{ fontWeight: 600 }}>{money(locked)}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pctFa(freePct)} آزاد</span>
              </div>
              <div style={{ boxSizing: 'border-box', padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <LockBar free={free} locked={locked} />
                <div className="lkleg">
                  <span><span className="lkdot" />آزاد <b>{money(free)}</b></span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={ICON.lock} size={12} />قفل <b>{money(locked)}</b></span>
                  {lockRows.length > 0 && <button type="button" className="btnt" onClick={() => setTab('locks')} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}>جزئیات {faDigits(lockRows.length)} قلم قفل<Icon d={ICON.chevL} size={14} /></button>}
                </div>
              </div>
            </div>
          )}

          {tab === 'locks' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="th" style={{ height: 36, columnGap: 12, gridTemplateColumns: '96px 116px 100px 110px minmax(0, 1fr) 76px 96px' }}><span>نوع</span><span>دارایی</span><span>مبلغ قفل</span><span>ایجادکننده</span><span>شرط آزادسازی</span><span>تاریخ</span><span /></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {lockRows.map(({ l, h }) => {
                  const [by, byRole] = lockBy(l, user.orgName);
                  const nav = h.units ? h.value / h.units : 0;
                  const steps = l.steps ?? [];
                  const rel = steps.filter((s) => s.status === 'released');
                  return (
                    <div key={l.id} className="tr" style={{ minHeight: 46, paddingTop: 5, paddingBottom: 5, boxSizing: 'border-box', columnGap: 12, gridTemplateColumns: '96px 116px 100px 110px minmax(0, 1fr) 76px 96px', background: l.type === 'legal' ? 'rgb(var(--error-main-rgb) / .05)' : 'transparent' }}>
                      <span><LkType type={l.type} /></span>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h.kind === 'rial' || !nav ? 'تومان' : `${units(l.amount / nav)} واحد`}</span></span>
                      <span className="num" style={{ fontWeight: 500 }}>{money(l.amount)}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, fontSize: 12, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{by}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{byRole}</span></span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.35, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.condition}</span>
                        {l.type === 'milestone' && steps.length > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'inline-flex', gap: 3 }}>{steps.map((s) => <span key={s.id} className="lkstep" style={{ background: s.status === 'released' ? 'var(--primary-main)' : s.status === 'pending_approval' ? 'transparent' : 'var(--progress-track)', boxShadow: s.status === 'pending_approval' ? 'inset 0 0 0 1.5px var(--warning-main)' : 'none' }} />)}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{faDigits(rel.length)} از {faDigits(steps.length)} مرحله · {pctFa(rel.reduce((a, s) => a + s.sharePct, 0))} آزاد شده</span>
                          </span>
                        )}
                      </span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jDate(l.createdAt)}</span>
                      <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {l.type === 'legal' && <button type="button" className="btno" disabled={removeHold.isPending} onClick={() => removeLegal(l)} style={{ height: 30, padding: '0 10px', fontSize: 12 }}>رفع مسدودی</button>}
                        {l.type === 'milestone' && <Link href={routes.op.organization(user.orgId)} className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>قرارداد سازمان</Link>}
                        {(l.type === 'collateral' || l.type === 'installment') && <button type="button" className="lbl" onClick={() => setTab('credit')} style={{ height: 22, padding: '0 7px', fontSize: 11, border: 0, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--soft-default)', color: 'var(--default-text)' }}>تسهیلات</button>}
                      </span>
                    </div>
                  );
                })}
                {!lockRows.length && <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{pf ? 'همه دارایی‌های این کاربر آزاد است.' : 'جزئیات قفل‌ها در دسترس نیست.'}</div>}
              </div>
              <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-primary)' }}>{faDigits(lockRows.length)} قلم قفل · جمع {money(locked)}</span>
                {byType.map((b) => <span key={b.t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: `var(${LOCK_COL[b.t]})` }} />{LOCK_META[b.t].short} <b className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{fm(b.amount)} م</b></span>)}
                <span style={{ marginRight: 'auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>آزادسازی فقط با تحقق شرط یا دستور مرجع</span>
              </div>
            </div>
          )}

          {tab === 'tx' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="th" style={{ height: 36, gridTemplateColumns: 'minmax(0, 1fr) 100px 120px 120px 90px' }}><span>تراکنش</span><span>نوع</span><span>مبلغ</span><span>تاریخ</span><span>وضعیت</span></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {transactions.map((t) => {
                  const [ty, bg, fg] = txType(t);
                  const st = t.status === 'success' ? ['موفق', 'var(--soft-success)', 'var(--success-text)'] : t.status === 'pending' ? ['در حال تسویه', 'var(--soft-warning)', 'var(--warning-text)'] : ['ناموفق', 'var(--soft-error)', 'var(--error-text)'];
                  const isLock = t.category === 'lock';
                  return (
                    <div key={t.id} className="tr" style={{ height: 42, gridTemplateColumns: 'minmax(0, 1fr) 100px 120px 120px 90px' }}>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span><span className="num" dir="ltr" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{t.trackingCode}</span></span>
                      <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: bg, color: fg }}>{ty}</span></span>
                      <span className="num" style={{ fontWeight: 500, color: isLock ? 'var(--text-primary)' : t.amount > 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{isLock ? money(t.amount) : signedMoney(t.amount)}</span>
                      <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{jDate(t.at)} {time(t.at)}</span>
                      <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: st[1], color: st[2] }}>{st[0]}</span></span>
                    </div>
                  );
                })}
                {!transactions.length && <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>تراکنشی ثبت نشده است.</div>}
              </div>
            </div>
          )}

          {tab === 'credit' && (
            <div style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start', overflowY: 'auto' }}>
              {facilities.map((f) => {
                const s = FAC_STATUS[f.status];
                const paid = f.paidCount ?? 0, tot = f.totalCount ?? 0;
                const card = f.kind === 'card';
                const reserve = card ? lockRows.find(({ l }) => l.type === 'collateral' && (l.sourceId ?? '').startsWith('card')) : undefined;
                const t = f.kind === 'loan' ? ['وام', 'var(--soft-info)', 'var(--info-text)', '--primary-main'] : card ? ['اعتبار کارت', 'var(--soft-primary)', 'var(--primary-text)', '--info-main'] : ['خرید اقساطی', 'var(--soft-success)', 'var(--success-text)', '--success-main'];
                const pct = card ? (f.amount ? (f.used / f.amount) * 100 : 0) : tot ? (paid / tot) * 100 : 0;
                const rows: [string, string][] = card
                  ? [['استفاده‌شده', money(f.used)], ['تسویه خودکار', f.nextDue ? `${jDayMonth(f.nextDue.at)} · کیف پول ریالی` : '—'], ['رزرو قفل‌شده', reserve ? `${reserve.h.name} · ${money(reserve.l.amount)}` : '—']]
                  : [['پرداخت‌شده', `${faDigits(paid)} از ${faDigits(tot)} · ${faDigits(tot - paid)} قسط مانده`], ['قسط بعدی', f.nextDue ? `${money(f.nextDue.amount)} · ${jDayMonth(f.nextDue.at)}` : `مانده ${money(f.used)}`], ['وثیقه (قفل)', f.collateral ? `${assetName(f.collateral.holdingKind)} · ${money(f.collateral.amount)}` : '—']];
                return (
                  <div key={f.id} style={{ boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="lbl" style={{ background: t[1], color: t[2] }}>{t[0]}</span><span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span><span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: s[1], color: s[2] }}>{s[0]}</span></div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 22 }}>{money(f.amount)}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{card ? `تومان سقف · ${pctFa(cardPct)} دارایی` : f.kind === 'loan' ? `تومان · ${faDigits(f.months ?? tot)} ماهه` : `تومان · ${faDigits(tot)} قسط`}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${pct}%`, background: `var(${t[3]})` }} /></div>
                    {rows.map(([k, v]) => <div key={k} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="num" style={{ marginRight: 'auto', fontWeight: 500 }}>{v}</span></div>)}
                  </div>
                );
              })}
              {!extra.isLoading && !facilities.length && <div style={{ gridColumn: '1 / -1', padding: 24, borderRadius: 12, border: '1px dashed var(--outline-border)', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>تسهیلات فعالی ندارد.</div>}
            </div>
          )}

          {tab === 'risk' && (
            <div style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', padding: 16, display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignContent: 'start' }}>
              <div style={{ boxSizing: 'border-box', padding: 16, borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>امتیاز ریسک</span>
                <svg viewBox="0 0 120 120" width="104" height="104" role="img" aria-label={`امتیاز ریسک ${faDigits(user.riskScore)} از ۱۰۰`}>
                  <circle cx="60" cy="60" r="48" fill="none" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="10" />
                  <circle cx="60" cy="60" r="48" fill="none" style={{ stroke: `var(${riskCol})` }} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${Math.round((user.riskScore / 100) * 302)} 302`} transform="rotate(-90 60 60)" />
                  <text x="60" y="58" textAnchor="middle" fontSize="26" fontWeight="300" style={{ fill: 'var(--text-primary)', fontFamily: 'inherit' }}>{faDigits(user.riskScore)}</text>
                  <text x="60" y="76" textAnchor="middle" fontSize="11" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>{riskLevel} · از ۱۰۰</text>
                </svg>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>آخرین محاسبه امروز ۰۶:۰۰</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="sec">نشانه‌ها و هشدارها</span>
                {flags.map((fl, i) => (
                  <div key={i} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, borderBottom: '1px dashed var(--divider)' }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: fl.bg, color: fl.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={fl.d} size={15} /></span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fl.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fl.sub}</span></span>
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fl.when}</span>
                    <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: fl.bg, color: fl.fg }}>{fl.level}</span>
                  </div>
                ))}
                {!flags.length && <div style={{ height: 56, display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>نشانه پرخطری برای این کاربر ثبت نشده است.</div>}
                <Link href={routes.op.risk} style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>همهٔ رویدادها در ریسک و تقلب<Icon d={ICON.chevL} size={14} /></Link>
              </div>
            </div>
          )}

          {tab === 'log' && (
            <div style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', padding: '8px 16px 0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {(x?.logs ?? []).map((l) => (
                <div key={l.id} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, borderBottom: '1px dashed var(--divider)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.tone === 'default' ? 'var(--grey-500)' : `var(--${l.tone}-main)`, flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{l.by}</span>
                  <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', width: 120, textAlign: 'left', whiteSpace: 'nowrap' }}>{jDate(l.at)} {time(l.at)}</span>
                </div>
              ))}
              {extra.isLoading && <div style={{ height: 80, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>در حال بارگذاری…</div>}
            </div>
          )}
        </div>

        {tab !== 'locks' && (
          <div className="card" style={{ width: 300, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>ترکیب دارایی</h6>
              <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>قفل {pctFa(100 - freePct)}</span>
            </div>
            {groups.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <svg viewBox="0 0 120 120" width="112" height="112" role="img" aria-label={`ترکیب دارایی: ${groups.map((g) => g.name + ' ' + pctFa((g.v / total) * 100)).join('، ')}`} style={{ flex: 'none' }}>
                  <circle cx="60" cy="60" r="48" fill="none" style={{ stroke: 'var(--chart-grid)' }} strokeWidth="12" />
                  {groups.map((g, i) => <circle key={g.name} cx="60" cy="60" r="48" fill="none" style={{ stroke: `var(${g.col})` }} strokeWidth="12" strokeDasharray={segs[i].dash} strokeDashoffset={segs[i].off} transform="rotate(-90 60 60)" />)}
                  <text x="60" y="58" textAnchor="middle" fontSize="18" fontWeight="300" style={{ fill: 'var(--text-primary)', fontFamily: 'inherit' }}>{fm(total)}</text>
                  <text x="60" y="74" textAnchor="middle" fontSize="10" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>میلیون تومان</text>
                </svg>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {groups.map((g) => <div key={g.name} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${g.col})`, flex: 'none' }} /><span style={{ flex: 1, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{g.name}</span><span className="num" style={{ fontWeight: 500 }}>{pctFa((g.v / total) * 100)}</span></div>)}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px dashed var(--divider)', paddingTop: 6 }}>
              <span className="sec">اعتبار</span>
              <div className="kv" style={{ height: 32, fontSize: 12 }}><span className="k">امتیاز اعتباری</span><span className="v num" style={{ fontSize: 12, color: user.creditScore >= 700 ? 'var(--success-text)' : 'var(--text-primary)' }}>{user.creditScore ? `${faDigits(user.creditScore)} · ${band(user.creditScore)}` : '—'}</span></div>
              <div className="kv" style={{ height: 32, fontSize: 12 }}><span className="k">سقف قرارداد سازمان</span><span className="v num" style={{ fontSize: 12 }}>وام {pctFa(loanPct)} · کارت {pctFa(cardPct)}</span></div>
              <div className="kv" style={{ height: 32, fontSize: 12, borderBottom: 0 }}><span className="k">ظرفیت وام (از دارایی آزاد)</span><span className="v num" style={{ fontSize: 12 }}>{money(capacity)}</span></div>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="sec">یادداشت‌های بهره‌بردار</span>
              {notes.slice(0, 2).map((n) => (
                <div key={n.id} style={{ boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-neutral)', fontSize: 12, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>{n.text}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{n.by} · {jDate(n.at)} · {NOTE_TAGS.find(([k]) => k === n.tag)?.[1]}</span>
                </div>
              ))}
              {!notes.length && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>یادداشتی ثبت نشده است.</span>}
            </div>
          </div>
        )}
      </div>

      <Modal open={modal === 'note'} onClose={() => setModal('')} label={`یادداشت داخلی — ${user.fullName}`}>
        <ModalTitle title={`یادداشت داخلی — ${user.fullName}`} onClose={() => setModal('')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, lineHeight: 1.6 }}>
          <label htmlFor="note-text" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="fl">متن یادداشت (فقط برای تیم بهره‌بردار)</span><input id="note-text" className="fi" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="مثلاً پیگیری ورود از دستگاه جدید — تماس تأیید شد" /></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="fl">برچسب</span>
            {NOTE_TAGS.map(([k, l]) => <button key={k} type="button" className={'chip' + (noteTag === k ? ' on' : '')} aria-pressed={noteTag === k} onClick={() => setNoteTag(k)}>{l}</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnp" disabled={!noteText.trim() || addNote.isPending} onClick={saveNote} style={{ opacity: !noteText.trim() || addNote.isPending ? 0.6 : 1 }}>ثبت یادداشت</button>
          <button type="button" className="btno" onClick={() => setModal('')}>انصراف</button>
        </div>
      </Modal>

      <Modal open={modal === 'legal'} onClose={() => setModal('')} label={`اعمال مسدودی قانونی — ${user.fullName}`} width={540}>
        <ModalTitle title={`اعمال مسدودی قانونی — ${user.fullName}`} onClose={() => setModal('')} icon={<span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICON.lock} size={18} /></span>} />
        {lhH ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="fl">دارایی</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{lhOptions.map((h) => <button key={h.kind} type="button" className={'chip' + (lhH.kind === h.kind ? ' on' : '')} aria-pressed={lhH.kind === h.kind} onClick={() => { setLhKind(h.kind); setLhErr(''); }}>{h.name}</button>)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-neutral)' }}>
                <LockBar free={lhH.free} locked={lhH.locked} />
                <div className="lkleg"><span><span className="lkdot" />آزاد <b>{money(lhH.free)}</b></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={ICON.lock} size={12} />قفل <b>{money(lhH.locked)}</b></span><span style={{ marginRight: 'auto' }}>کل <b>{money(lhH.value)}</b></span></div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label htmlFor="lh-amount" className="fg"><span className="fl">مبلغ مسدودی (تومان)</span><input id="lh-amount" className="fi" inputMode="numeric" value={lhAmount ? money(Number(enDigits(lhAmount))) : ''} onChange={(e) => { setLhAmount(enDigits(e.target.value).replace(/\D/g, '').slice(0, 13)); setLhErr(''); }} placeholder="۱۰٬۰۰۰٬۰۰۰" style={lhTried && lhErrors.amount ? { borderColor: 'var(--error-main)' } : undefined} /><span style={{ fontSize: 11, color: lhTried && lhErrors.amount ? 'var(--error-text)' : 'var(--text-secondary)' }}>{lhTried && lhErrors.amount ? lhErrors.amount : <>حداکثر: کل بخش آزاد · <button type="button" onClick={() => setLhAmount(String(Math.floor(lhH.free)))} style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--primary-text)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>{money(lhH.free)}</button></>}</span></label>
              <label htmlFor="lh-ref" className="fg"><span className="fl">شماره مرجع / دستور (الزامی)</span><input id="lh-ref" className="fi" dir="ltr" inputMode="numeric" value={faDigits(lhRef)} onChange={(e) => { setLhRef(enDigits(e.target.value).replace(/\D/g, '').slice(0, 20)); setLhErr(''); }} placeholder="۱۴۰۵۰۰۹۸۴۵۲۱" style={lhTried && lhErrors.ref ? { borderColor: 'var(--error-main)' } : undefined} /><span style={{ fontSize: 11, color: lhTried && lhErrors.ref ? 'var(--error-text)' : 'var(--text-secondary)' }}>{lhTried && lhErrors.ref ? lhErrors.ref : 'بدون شماره مرجع قابل ثبت نیست'}</span></label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="fl">دلیل</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{LH_REASONS.map((r, i) => <button key={r} type="button" className={'chip' + (lhReason === i ? ' on' : '')} aria-pressed={lhReason === i} onClick={() => setLhReason(i)}>{r}</button>)}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, lineHeight: 1.6 }}>
              <Icon d={ICON.alert} size={16} style={{ marginTop: 2 }} />
              <span>مبلغ از بخش آزاد «{lhH.name}» کسر و قفل می‌شود؛ تا رفع دستور مرجع قابل فروش یا برداشت نیست. کاربر اعلان «مسدودی قانونی» می‌بیند.</span>
            </div>
            {lhErr && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600 }}>{lhErr}</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btnd" disabled={applyHold.isPending} onClick={applyLegal} style={{ opacity: applyHold.isPending ? 0.7 : 1 }}>{applyHold.isPending ? 'در حال اعمال…' : 'اعمال مسدودی'}</button>
              <button type="button" className="btno" onClick={() => setModal('')}>انصراف</button>
            </div>
          </>
        ) : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>این کاربر دارایی آزادی برای مسدودسازی ندارد.</span>}
      </Modal>
    </>
  );
}
