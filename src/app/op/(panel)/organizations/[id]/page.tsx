'use client';
/** Operator console — organization detail (design: op-organization): contract, employees, packages, credit, HR users. */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { LockType, OrgPackage, Organization } from '@/types/domain';
import { useOpFunds, useOpOrganization, useOpProducts, useOpUsers, useUpdateOrganization } from '@/api/op';
import { useInviteHrUser, useOrgContracts, useOrgCredit, type FacilityKind, type OrgPatch } from '@/api/op-core-extra';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ContractEditor, VersionList, contractFunds, fundDot, fundMeta } from '@/components/op/core/ContractEditor';
import { ICON, LkType, Modal, ModalTitle, ORG_STATUS, PRODUCT_META, PanelState, Switch, TILES, errMsg, fb, fm, orgProducts, pctFa, signedPct, smooth, splitPct } from '@/components/op/core/ui';
import { faDigits, jDate, jMonthYear, money, relTime } from '@/lib/format';
import { daysFromNow, now } from '@/lib/clock';
import { routes } from '@/lib/routes';

type Tab = 'contract' | 'staff' | 'packages' | 'credit' | 'hr';
const FAC_LABEL: Record<FacilityKind, { type: string; bg: string; fg: string; short: string }> = {
  loan: { type: 'وام', bg: 'var(--soft-info)', fg: 'var(--info-text)', short: 'وام' },
  bnpl: { type: 'خرید اقساطی', bg: 'var(--soft-success)', fg: 'var(--success-text)', short: 'اقساطی' },
  card: { type: 'اعتبار کارت', bg: 'var(--soft-primary)', fg: 'var(--primary-text)', short: 'کارت' },
};
const FAC_STATUS = {
  current: { label: 'جاری', bg: 'var(--soft-success)', fg: 'var(--success-text)' },
  late: { label: 'معوق', bg: 'var(--soft-error)', fg: 'var(--error-text)' },
  blocked: { label: 'مسدود', bg: 'var(--soft-error)', fg: 'var(--error-text)' },
  settled: { label: 'تسویه‌شده', bg: 'var(--soft-default)', fg: 'var(--default-text)' },
} as const;
const ASSET_SHORT: Record<string, string> = { rial: 'ریال', gold: 'طلا', fixed: 'درآمد ثابت', mixed: 'مختلط', equity: 'سهامی', silver: 'نقره' };

function pkgKind(p: OrgPackage): string {
  if (p.lockPolicy.type === 'vesting') return 'قفل زمانی تا ' + jDate(p.lockPolicy.releaseAt);
  if (p.lockPolicy.type === 'milestone') {
    const steps = p.milestoneProgress ?? [];
    return `آزادسازی مرحله‌ای · ${faDigits(steps.filter((s) => s.status === 'released').length)} از ${faDigits(steps.length || p.lockPolicy.steps.length)} مرحله`;
  }
  if (p.allocationMode === 'fixed' && p.fixedSplit) {
    const parts = [[p.fixedSplit.gold, 'طلا'], [p.fixedSplit.fixed, 'درآمد ثابت'], [p.fixedSplit.rial ?? 0, 'ریال']].filter(([v]) => (v as number) > 0);
    return parts.map(([v, l]) => `${faDigits(v as number)}٪ ${l}`).join(' · ');
  }
  return 'تخصیص آزاد';
}

function pkgStatus(p: OrgPackage) {
  if (p.status === 'draft') return { label: 'پیش‌نویس', bg: 'var(--soft-default)', fg: 'var(--default-text)' };
  if (p.status === 'cancelled') return { label: 'لغوشده', bg: 'var(--soft-error)', fg: 'var(--error-text)' };
  const pend = p.milestoneProgress?.findIndex((s) => s.status === 'pending_approval') ?? -1;
  if (pend >= 0) return { label: `مرحله ${faDigits(pend + 1)} در انتظار`, bg: 'var(--soft-warning)', fg: 'var(--warning-text)' };
  if (p.status === 'completed') return { label: 'تکمیل‌شده', bg: 'var(--soft-info)', fg: 'var(--info-text)' };
  return { label: 'ارسال‌شده', bg: 'var(--soft-success)', fg: 'var(--success-text)' };
}

function AumChart({ hist }: { hist: number[] }) {
  const vals = hist.map((v) => v / 1e9);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const span = Math.max(vmax - vmin, vmax * 0.1, 1);
  const raw = span / 3;
  const e = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * e).find((s) => s >= raw) ?? 10 * e;
  const lo = Math.max(0, Math.floor(vmin / step) * step - step);
  const hi = lo + 4 * step;
  const y = (v: number) => Math.round((140 - ((v - lo) / (hi - lo)) * 128) * 10) / 10;
  const pts = vals.map((v, i) => [Math.round((28 + (i * 232) / 11) * 10) / 10, y(v)] as [number, number]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  const grid = [0, 1, 2, 3].map((i) => ({ v: hi - i * step, y: y(hi - i * step) }));
  const months = [11, 7, 3, 0].map((k) => daysFromNow(-30 * k));
  const labels = months.map((d, i) => (i === 0 || i === 3 ? jMonthYear(d) : jMonthYear(d).split(' ')[0]));
  return (
    <div dir="ltr" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
      <svg viewBox="0 0 260 150" width="100%" height="150" role="img" aria-label={`روند AUM دوازده ماه: از ${fb(hist[0])} به ${fb(hist[11])} میلیارد`} style={{ display: 'block', overflow: 'visible' }}>
        <defs><linearGradient id="g-aum-org" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.26 }} /><stop offset="1" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0 }} /></linearGradient></defs>
        {grid.map((g) => (
          <g key={g.v}>
            <line x1="28" x2="260" y1={g.y} y2={g.y} style={{ stroke: 'var(--chart-grid)' }} strokeWidth="1" strokeDasharray="3 4" />
            <text x="22" y={g.y + 3} textAnchor="end" fontSize="10" style={{ fill: 'var(--text-secondary)', fontFamily: 'inherit' }}>{faDigits(String(Math.round(g.v * 10) / 10), true)}</text>
          </g>
        ))}
        <path d={`${line} L${last[0]} 140 L28 140 Z`} fill="url(#g-aum-org)" />
        <path d={line} fill="none" style={{ stroke: 'var(--chart-1)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="4" style={{ fill: 'var(--chart-1)', stroke: 'var(--bg-paper)' }} strokeWidth="2" />
      </svg>
      <div style={{ height: 14, paddingLeft: 28, display: 'flex', justifyContent: 'space-between', fontSize: 10, lineHeight: '14px', color: 'var(--text-secondary)' }}>
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

export default function OpOrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const q = useOpOrganization(id);
  const contracts = useOrgContracts();
  const credit = useOrgCredit(id);
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const usersQ = useOpUsers();
  const update = useUpdateOrganization();
  const invite = useInviteHrUser();
  const [tab, setTab] = useState<Tab>('contract');
  const [modal, setModal] = useState<'' | 'suspend' | 'edit' | 'history' | 'invite'>('');
  const [reason, setReason] = useState('عدم تسویه صورت‌حساب مهر ۱۴۰۵');
  const [inv, setInv] = useState({ name: '', email: '', role: 'کارشناس HR' });
  const [invErr, setInvErr] = useState('');

  const backBtn = (
    <Link href={routes.op.organizations} className="ibtn" aria-label="بازگشت به سازمان‌ها" style={{ background: 'var(--card-bg)', boxShadow: '0 0 0 1px var(--glass-edge)', color: 'var(--text-primary)', flex: 'none' }}><Icon d={ICON.chevR} size={20} /></Link>
  );

  if (q.isLoading || contracts.isLoading) {
    return <><div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12 }}>{backBtn}</div><PanelState loading height={96} /><PanelState loading height={88} /><PanelState loading height={360} /></>;
  }
  const ext = contracts.data?.[id];
  if (q.isError || !q.data || !ext) {
    return <><div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 12 }}>{backBtn}</div><PanelState error={q.error ?? contracts.error} onRetry={() => { q.refetch(); contracts.refetch(); }} /></>;
  }

  const { organization: org, employees, packages } = q.data;
  const st = ORG_STATUS[org.status];
  const prods = orgProducts(org);
  const sp = splitPct(ext.aum, ext.locked);
  const typeCount = Object.values(ext.lockByType).filter((v) => (v ?? 0) > 0).length;
  const lastVer = ext.versions[0];
  const daysLeft = Math.ceil((new Date(org.contractEnd).getTime() - now().getTime()) / 86400000);
  const hrHead = ext.hrUsers[0]?.name ?? org.admins[0]?.name ?? '—';
  const creditRows = credit.data ?? [];
  const platform = new Map((usersQ.data ?? []).map((u) => [u.id, u]));
  const monthsOptions = products.data?.find((p) => p.kind === 'loan')?.monthsOptions ?? [3, 6, 12, 18];
  const growth12 = ext.aumHistory[0] > 0 ? ((ext.aumHistory[11] - ext.aumHistory[0]) / ext.aumHistory[0]) * 100 : 0;
  const sentPkgs = packages.filter((p) => p.status !== 'draft');
  const yearTotal = sentPkgs.filter((p) => p.sentAt && new Date(p.sentAt).getTime() > now().getTime() - 365 * 86400000).reduce((s, p) => s + p.total, 0);
  const recips = sentPkgs.flatMap((p) => p.recipients);
  const acceptRate = recips.length ? (recips.filter((r) => r.status === 'accepted').length / recips.length) * 100 : 0;

  const setStatus = (status: Organization['status'], msg: string) => update.mutate({ id: org.id, status }, {
    onSuccess: () => { setModal(''); toast(msg); },
    onError: (e) => toast(errMsg(e), 'error'),
  });
  const toggleFinance = () => {
    const payload: OrgPatch = { id: org.id, contract: { financeApproval: !ext.financeApproval }, changeNote: ext.financeApproval ? 'حذف تأیید مدیر مالی از زنجیره' : 'افزودن تأیید مدیر مالی به زنجیره' };
    update.mutate(payload, {
      onSuccess: () => toast(ext.financeApproval ? 'تأیید مدیر مالی از زنجیره حذف شد' : 'تأیید مدیر مالی به زنجیره اضافه شد'),
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };
  const sendInvite = () => {
    if (!inv.name.trim()) { setInvErr('نام کاربر را وارد کنید.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email.trim())) { setInvErr('ایمیل معتبر وارد کنید.'); return; }
    invite.mutate({ orgId: org.id, name: inv.name.trim(), email: inv.email.trim(), role: inv.role }, {
      onSuccess: () => { setModal(''); setInv({ name: '', email: '', role: 'کارشناس HR' }); toast('دعوت‌نامه کاربر HR ارسال شد'); },
      onError: (e) => setInvErr(errMsg(e)),
    });
  };

  const kpis = [
    { title: 'کارکنان', value: faDigits(org.employees), unit: 'نفر', note: ext.newEmployeesMonth ? `+${faDigits(ext.newEmployeesMonth)} در این ماه` : 'بدون تغییر در این ماه', nc: ext.newEmployeesMonth ? 'var(--success-text)' : 'var(--text-secondary)', d: ICON.users, bg: 'var(--soft-primary)', fg: 'var(--primary-text)' },
    { title: 'AUM سازمان', value: fb(ext.aum), unit: 'میلیارد تومان', note: `${signedPct(ext.growthPct)} نسبت به ماه قبل`, nc: ext.growthPct > 0 ? 'var(--success-text)' : 'var(--text-secondary)', d: ICON.funds, bg: 'var(--soft-success)', fg: 'var(--success-text)' },
    { title: 'وام‌های فعال', value: faDigits(ext.credit.activeLoans), unit: 'وام', note: `مانده ${fb(ext.credit.outstanding)} میلیارد · ${faDigits(ext.credit.overdue)} معوق`, nc: 'var(--text-secondary)', d: ICON.percent, bg: 'var(--soft-info)', fg: 'var(--info-text)' },
    { title: 'دارایی قفل‌شده کارکنان', value: fb(ext.locked), unit: 'میلیارد', note: `${faDigits(typeCount)} نوع قفل · ${pctFa(sp.lockedPct)} از AUM`, nc: 'var(--text-secondary)', d: ICON.lock, bg: 'var(--soft-warning)', fg: 'var(--warning-text)' },
  ];

  const tabs: [Tab, string, string][] = [
    ['contract', 'قرارداد', ''], ['staff', 'کارکنان', faDigits(org.employees)], ['packages', 'بسته‌ها', faDigits(packages.length)],
    ['credit', 'تسهیلات', faDigits(ext.credit.activeLoans)], ['hr', 'کاربران HR', faDigits(ext.hrUsers.length)],
  ];

  const defMonths = '3,6,12';
  const limits = [
    { k: 'سقف وام (٪ دارایی آزاد)', v: org.settings.loanEnabled ? pctFa(org.settings.loanMaxPct) : 'غیرفعال' },
    { k: 'گزینه‌های بازپرداخت', v: org.settings.loanMonthsOptions.length ? org.settings.loanMonthsOptions.map((m) => faDigits(m)).join(' · ') + ' ماه' : '—', diff: [...org.settings.loanMonthsOptions].sort((a, b) => a - b).join(',') !== defMonths, def: '۳ · ۶ · ۱۲' },
    { k: 'اعتبار کارت (٪ دارایی آزاد)', v: org.settings.cardEnabled ? pctFa(ext.cardPct) : 'غیرفعال' },
    { k: 'سقف اعتبار هر نفر', v: money(ext.perPersonCap) + ' تومان' },
    { k: 'برداشت نقدی بسته‌ها', v: org.settings.cashWithdrawalAllowed ? 'مجاز (پیش‌فرض)' : 'غیرمجاز' },
  ];
  const okL = { state: 'مجاز', bg: 'var(--soft-success)', fg: 'var(--success-text)' };
  const noL = { state: 'غیرمجاز', bg: 'var(--soft-default)', fg: 'var(--default-text)' };
  const policies: { t: LockType; meta: string; on: boolean }[] = [
    { t: 'vesting', meta: `تا تاریخ · حداکثر ${faDigits(ext.vestingMaxMonths)} ماه`, on: org.settings.lockPolicies.includes('vesting') },
    { t: 'milestone', meta: `تا ${faDigits(ext.milestoneMaxSteps)} مرحله · تأیید مرحله توسط HR`, on: org.settings.lockPolicies.includes('milestone') },
    { t: 'collateral', meta: `وام ${pctFa(org.settings.loanEnabled ? org.settings.loanMaxPct : 0)} · کارت ${pctFa(org.settings.cardEnabled ? ext.cardPct : 0)} از بخش آزاد`, on: ext.allowCollateral },
    { t: 'installment', meta: 'هم‌زمان با خرید اقساطی', on: org.settings.installmentEnabled && ext.allowInstallmentLock },
  ];
  const chain = [
    { n: '۱', label: 'مدیر منابع انسانی', bg: 'var(--success-main)', fg: '#FFFFFF' },
    { n: '۲', label: ext.financeApproval ? 'مدیر مالی سازمان' : 'مدیر مالی (غیرفعال)', bg: ext.financeApproval ? 'var(--primary-main)' : 'var(--step-pending)', fg: ext.financeApproval ? '#FFFFFF' : 'var(--step-pending-text)' },
    { n: '۳', label: 'ارسال به کارکنان', bg: 'var(--step-pending)', fg: 'var(--step-pending-text)' },
  ];
  const facText = (uid: string) => creditRows.filter((r) => r.userId === uid).map((r) => `${FAC_LABEL[r.kind].short} ${fm(r.kind === 'card' ? r.remain : r.amount)} م`).join(' · ') || '—';

  return (
    <>
      <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
        {backBtn}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h4 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>{org.name}</h4><span className="lbl" style={{ background: st.bg, color: st.fg }}>{st.label}</span></div>
          <nav aria-label="مسیر" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, lineHeight: 1.3 }}>
            <Link href={routes.op.overview} style={{ color: 'var(--text-primary)' }}>بهره‌بردار</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <Link href={routes.op.organizations} style={{ color: 'var(--text-primary)' }}>سازمان‌ها و قراردادها</Link>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
            <span style={{ color: 'var(--text-disabled)' }}>{org.name}</span>
          </nav>
        </div>
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {org.status === 'active' && <button type="button" className="btno" onClick={() => setModal('suspend')} style={{ borderColor: 'var(--error-main)', color: 'var(--error-text)' }}><Icon d={ICON.pause} size={16} />تعلیق</button>}
          {org.status === 'suspended' && <button type="button" className="btno" disabled={update.isPending} onClick={() => setStatus('active', `تعلیق ${org.name} برداشته شد`)} style={{ borderColor: 'var(--success-main)', color: 'var(--success-text)' }}><Icon d={ICON.play} size={16} />رفع تعلیق</button>}
          {org.status === 'onboarding' && <button type="button" className="btno" disabled={update.isPending} onClick={() => setStatus('active', `قرارداد ${org.name} فعال شد`)} style={{ borderColor: 'var(--success-main)', color: 'var(--success-text)' }}><Icon d={ICON.check} size={16} />فعال‌سازی قرارداد</button>}
          <button type="button" className="btnp" onClick={() => setModal('edit')}><Icon d={ICON.pen} size={16} />ویرایش قرارداد</button>
        </div>
      </div>

      <div className="card" style={{ minHeight: 96, flex: 'none', boxSizing: 'border-box', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, flex: 'none' }}>{org.logoLetter}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.3, minWidth: 0, width: 220, flex: 'none' }}>
          <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org.name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>کد قرارداد <span className="num" dir="ltr">{org.contractNo}</span> · {org.industry || '—'} · {ext.city}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            {prods.map((k) => { const p = PRODUCT_META[k]; return <span key={k} className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, gap: 4, background: p.bg, color: p.fg }}><Icon d={p.d} size={12} strokeWidth={1.8} />{p.name}</span>; })}
            {!prods.length && <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>بدون محصول فعال</span>}
          </span>
        </div>
        <span style={{ width: 1, height: 56, background: 'var(--divider)', flex: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '6px 28px', fontSize: 12, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--text-secondary)' }}>شروع قرارداد</span><span style={{ color: 'var(--text-secondary)' }}>پایان / تمدید</span><span style={{ color: 'var(--text-secondary)' }}>نسخه قرارداد</span>
          <span className="num" dir="ltr" style={{ fontSize: 14, fontWeight: 500, textAlign: 'right' }}>{jDate(org.contractStart)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="num" dir="ltr" style={{ fontSize: 14, fontWeight: 500 }}>{jDate(org.contractEnd)}</span><span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: daysLeft < 60 ? 'var(--soft-warning)' : 'var(--soft-default)', color: daysLeft < 60 ? 'var(--warning-text)' : 'var(--default-text)' }}>{daysLeft >= 0 ? `${faDigits(daysLeft)} روز` : 'منقضی'}</span></span>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>نسخه {faDigits(ext.version)} {lastVer && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {jDate(lastVer.at)}</span>} <button type="button" className="btnt" onClick={() => setModal('history')} style={{ height: 22, padding: '0 6px', fontSize: 11 }}>تاریخچه</button></span>
          <span style={{ color: 'var(--text-secondary)' }}>مدیر HR</span><span style={{ color: 'var(--text-secondary)' }}>ایمیل</span><span style={{ color: 'var(--text-secondary)' }}>مدیر حساب (نمادنو)</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{hrHead}</span>
          <span className="num" dir="ltr" style={{ fontSize: 12, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ext.hrEmail || '—'}</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{ext.accountManager}</span>
        </div>
      </div>

      <div style={{ height: 88, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
        {kpis.map((k) => (
          <div key={k.title} className="card" style={{ boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: k.bg, color: k.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={k.d} size={22} /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{k.title}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}><span className="num" style={{ fontSize: 22 }}>{k.value}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.unit}</span></span>
              <span style={{ fontSize: 11, color: k.nc, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.note}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: 'none', minHeight: 380, display: 'flex', gap: 20, alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div role="tablist" style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 8px', display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid var(--divider)' }}>
            {tabs.map(([k, l, c]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
                {l}{c && <span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: 'var(--soft-default)', color: 'var(--default-text)' }}>{c}</span>}
              </button>
            ))}
          </div>

          {tab === 'contract' && (
            <div style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', padding: '12px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="sec">محدودیت‌های تسهیلات</span>
                {limits.map((l) => (
                  <div key={l.k} className="kv" style={{ height: 34 }}>
                    <span className="k">{l.k}</span>
                    <span className="v num" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{l.v}{l.diff && <span className="lbl" style={{ height: 18, padding: '0 5px', fontSize: 10, background: 'var(--soft-info)', color: 'var(--info-text)' }}>متفاوت با پیش‌فرض {l.def}</span>}</span>
                  </div>
                ))}
                <span className="sec" style={{ marginTop: 6 }}>سیاست‌های قفل مجاز</span>
                {policies.map((p) => {
                  const s = p.on ? okL : noL;
                  return (
                    <div key={p.t} className="kv" style={{ height: 30, gap: 8 }}>
                      <LkType type={p.t} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{p.meta}</span>
                      <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: s.bg, color: s.fg }}>{s.state}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span className="sec">صندوق‌های مجاز</span>
                  {contractFunds(fundsQ.data).map((f) => {
                    const soon = f.status === 'coming_soon';
                    const on = org.settings.allowedFunds.includes(f.id);
                    const s = soon ? { state: 'به‌زودی', bg: 'var(--soft-default)', fg: 'var(--default-text)' } : on ? okL : noL;
                    return (
                      <div key={f.id} className="kv" style={{ height: 34 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${fundDot(f.id)})`, flex: 'none' }} />
                        <span style={{ fontWeight: 500, color: soon ? 'var(--text-disabled)' : 'var(--text-primary)' }}>{f.name}</span>
                        <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fundMeta(f)}</span>
                        <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: s.bg, color: s.fg }}>{s.state}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="sec">زنجیره تأیید بسته‌ها</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                    {chain.map((c, i) => (
                      <span key={c.n} style={{ display: 'contents' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}><span style={{ width: 20, height: 20, borderRadius: '50%', background: c.bg, color: c.fg, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700 }}>{c.n}</span>{c.label}</span>
                        {i < chain.length - 1 && <span style={{ flex: 1, height: 2, background: 'var(--divider)', minWidth: 12 }} />}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    <span>نیاز به تأیید مدیر مالی سازمان</span>
                    <Switch on={ext.financeApproval} onToggle={toggleFinance} disabled={update.isPending} label="نیاز به تأیید مدیر مالی" style={{ marginRight: 'auto' }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'staff' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="th" style={{ height: 36, columnGap: 8, gridTemplateColumns: 'minmax(0, 1fr) 64px 128px 136px 112px 16px' }}><span>کارمند</span><span>واحد</span><span>دارایی / قفل</span><span>تسهیلات</span><span>وضعیت</span><span /></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {employees.map((e, i) => {
                  const pu = platform.get(e.id);
                  const total = pu ? pu.portfolioValue : e.portfolioValue;
                  const locked = pu ? pu.lockedValue : e.lockedValue;
                  const s = e.status === 'active' ? { l: 'فعال', bg: 'var(--soft-success)', fg: 'var(--success-text)' } : e.status === 'invited' ? { l: 'در انتظار فعال‌سازی', bg: 'var(--soft-warning)', fg: 'var(--warning-text)' } : { l: 'غیرفعال', bg: 'var(--soft-default)', fg: 'var(--default-text)' };
                  const inner = (
                    <>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 30, height: 30, borderRadius: '50%', background: TILES[i % 5][0], color: TILES[i % 5][1], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{e.avatarLetter}</span>
                        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.fullName}</span><span className="num" dir="ltr" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{faDigits(e.employeeCode)}</span></span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.department}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><span className="num">{fm(total)} م</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{locked ? `قفل ${fm(locked)} م` : 'همه آزاد'}</span></span>
                        <span style={{ width: 96 }}><LockBar free={Math.max(0, total - locked)} locked={locked} height={4} /></span>
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{facText(e.id)}</span>
                      <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: s.bg, color: s.fg }}>{s.l}</span></span>
                      <span style={{ display: 'grid', placeItems: 'center' }}>{pu && <Icon d={ICON.chevL} size={16} style={{ color: 'var(--text-disabled)' }} />}</span>
                    </>
                  );
                  const style = { height: 46, columnGap: 8, gridTemplateColumns: 'minmax(0, 1fr) 64px 128px 136px 112px 16px' };
                  return pu
                    ? <Link key={e.id} href={routes.op.user(e.id)} className="tr hov" style={style}>{inner}</Link>
                    : <div key={e.id} className="tr" style={style}>{inner}</div>;
                })}
                {!employees.length && <div style={{ height: 96, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>هنوز کارمندی برای این سازمان ثبت نشده است.</div>}
              </div>
              <div style={{ height: 36, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}>
                نمایش {faDigits(employees.length)} از {faDigits(org.employees)} کارمند · <Link href={routes.op.users} style={{ marginRight: 6, fontWeight: 600 }}>همه در «کاربران»</Link>
              </div>
            </div>
          )}

          {tab === 'packages' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="th" style={{ height: 36, gridTemplateColumns: 'minmax(0, 1fr) 72px 120px 150px 92px 110px' }}><span>عنوان بسته</span><span>گیرندگان</span><span>مبلغ کل</span><span>تأیید کارکنان</span><span>تاریخ</span><span>وضعیت</span></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {packages.map((p) => {
                  const s = pkgStatus(p);
                  const accepted = p.recipients.filter((r) => r.status === 'accepted').length;
                  const ms = p.lockPolicy.type === 'milestone' && p.milestoneProgress;
                  const msPct = ms ? p.milestoneProgress!.filter((x) => x.status === 'released').reduce((a, x) => a + x.sharePct, 0) : 0;
                  const pct = p.status === 'draft' ? 0 : ms ? msPct : p.recipients.length ? (accepted / p.recipients.length) * 100 : 0;
                  return (
                    <div key={p.id} className="tr" style={{ height: 48, gridTemplateColumns: 'minmax(0, 1fr) 72px 120px 150px 92px 110px' }}>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pkgKind(p)}</span></span>
                      <span className="num">{faDigits(p.recipients.length)}</span>
                      <span className="num">{p.status === 'draft' ? '—' : p.total >= 1e9 ? fb(p.total, 2) + ' میلیارد' : fm(p.total) + ' میلیون'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
                        <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--progress-track)', overflow: 'hidden', display: 'flex' }}><span style={{ width: `${pct}%`, background: 'var(--success-main)' }} /></span>
                        <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.status === 'draft' ? '—' : ms ? `${pctFa(msPct)} آزاد` : `${faDigits(accepted)}/${faDigits(p.recipients.length)}`}</span>
                      </span>
                      <span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>{p.sentAt ? jDate(p.sentAt) : '—'}</span>
                      <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: s.bg, color: s.fg }}>{s.label}</span></span>
                    </div>
                  );
                })}
                {!packages.length && <div style={{ height: 96, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>هنوز بسته‌ای ارسال نشده است.</div>}
              </div>
              <div style={{ height: 36, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', borderTop: '1px solid var(--divider)' }}>
                جمع ۱۲ ماه: <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fb(yearTotal, 2)} میلیارد تومان</span> · نرخ تأیید <span className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{pctFa(acceptRate)}</span>
              </div>
            </div>
          )}

          {tab === 'credit' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 56, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--divider)' }}>
                {[['وام‌های فعال', faDigits(ext.credit.activeLoans)], ['مانده کل', fb(ext.credit.outstanding) + ' میلیارد'], ['اعتبار کارت فعال', faDigits(ext.credit.cardHolders) + ' نفر'], ['اقساط معوق', faDigits(ext.credit.overdue)]].map(([k, v]) => (
                  <span key={k} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, gap: 2 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k}</span><span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{v}</span></span>
                ))}
              </div>
              <div className="th" style={{ height: 32, gridTemplateColumns: 'minmax(0, 1fr) 96px 110px 110px 130px 84px' }}><span>کارمند</span><span>نوع</span><span>مبلغ</span><span>مانده</span><span>وثیقه</span><span>وضعیت</span></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {credit.isLoading && <div style={{ height: 84, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>در حال بارگذاری…</div>}
                {creditRows.map((r, i) => {
                  const t = FAC_LABEL[r.kind];
                  const s = FAC_STATUS[r.status];
                  return (
                    <Link key={r.userId + r.kind + i} href={routes.op.user(r.userId)} className="tr hov" style={{ height: 42, gridTemplateColumns: 'minmax(0, 1fr) 96px 110px 110px 130px 84px' }}>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                      <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: t.bg, color: t.fg }}>{t.type}</span></span>
                      <span className="num">{money(r.amount)}</span>
                      <span className="num" style={{ color: 'var(--text-secondary)' }}>{money(r.remain)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.collateral ? `قفل ${ASSET_SHORT[r.collateral.holdingKind] ?? r.collateral.holdingKind} · ${fm(r.collateral.amount)} م` : '—'}</span>
                      <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: s.bg, color: s.fg }}>{s.label}</span></span>
                    </Link>
                  );
                })}
                {!credit.isLoading && !creditRows.length && <div style={{ height: 84, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>تسهیلات فعالی برای کاربران ثبت‌شده این سازمان نیست.</div>}
              </div>
            </div>
          )}

          {tab === 'hr' && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="th" style={{ height: 36, gridTemplateColumns: 'minmax(0, 1fr) 150px 130px 100px 96px' }}><span>کاربر</span><span>نقش</span><span>آخرین ورود</span><span>۲FA</span><span>وضعیت</span></div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {ext.hrUsers.map((h, i) => (
                  <div key={h.id} className="tr" style={{ height: 48, gridTemplateColumns: 'minmax(0, 1fr) 150px 130px 100px 96px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: TILES[i % 5][0], color: TILES[i % 5][1], display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{h.name[0]}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{h.name}</span><span className="num" dir="ltr" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.email}</span></span>
                    </span>
                    <span style={{ fontSize: 12 }}>{h.role}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.lastLoginAt ? relTime(h.lastLoginAt, now()) : '—'}</span>
                    <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: h.twoFA ? 'var(--soft-success)' : 'var(--soft-warning)', color: h.twoFA ? 'var(--success-text)' : 'var(--warning-text)' }}>{h.twoFA ? 'فعال' : 'غیرفعال'}</span></span>
                    <span><span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: h.status === 'active' ? 'var(--soft-success)' : 'var(--soft-info)', color: h.status === 'active' ? 'var(--success-text)' : 'var(--info-text)' }}>{h.status === 'active' ? 'فعال' : 'دعوت‌شده'}</span></span>
                  </div>
                ))}
                {!ext.hrUsers.length && <div style={{ height: 84, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>هنوز کاربر HR اضافه نشده است.</div>}
              </div>
              <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)' }}>
                <button type="button" className="btnt" onClick={() => { setInvErr(''); setModal('invite'); }} style={{ height: 32 }}><Icon d={ICON.plus} size={16} />دعوت کاربر HR</button>
                <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>دعوت‌نامه با لینک یک‌بارمصرف ۴۸ ساعته ارسال می‌شود</span>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ width: 300, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>AUM — ۱۲ ماه</h6>
            {ext.aum > 0 && <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', background: growth12 >= 0 ? 'var(--soft-success)' : 'var(--soft-error)', color: growth12 >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{growth12 >= 0 ? '+' : '−'}{pctFa(Math.abs(growth12))}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 26, lineHeight: 1.1 }}>{fb(ext.aum)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>میلیارد تومان</span></div>
          {ext.aum > 0 ? (
            <>
              <LockBar free={sp.free} locked={ext.locked} />
              <div className="lkleg"><span><span className="lkdot" />آزاد <b>{fb(sp.free)}</b></span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={ICON.lock} size={12} />قفل <b>{fb(ext.locked)}</b></span><span style={{ marginRight: 'auto' }}>میلیارد</span></div>
              <AumChart hist={ext.aumHistory} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px dashed var(--divider)', paddingTop: 8 }}>
                {[{ name: 'صندوق طلا', pct: ext.aumMix.gold, col: '--warning-main' }, { name: 'درآمد ثابت', pct: ext.aumMix.fixed, col: '--secondary-main' }, { name: 'ریال', pct: ext.aumMix.rial, col: '--grey-500' }].map((m) => (
                  <div key={m.name} style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${m.col})`, flex: 'none' }} /><span style={{ flex: 1, color: 'var(--text-secondary)' }}>{m.name}</span><span className="num" style={{ fontWeight: 500 }}>{pctFa(m.pct)}</span></div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)', padding: '24px 0' }}>هنوز دارایی‌ای برای کارکنان این سازمان ثبت نشده است.<br />پس از فعال‌سازی قرارداد و ارسال اولین بسته نمایش داده می‌شود.</div>
          )}
        </div>
      </div>

      <Modal open={modal === 'suspend'} onClose={() => setModal('')} label={`تعلیق سازمان — ${org.name}`}>
        <ModalTitle title={`تعلیق سازمان — ${org.name}`} onClose={() => setModal('')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 500 }}>
            <Icon d={ICON.alert} size={18} style={{ flex: 'none', marginTop: 1 }} />
            <span>با تعلیق، ارسال بسته جدید و صدور تسهیلات برای {faDigits(org.employees)} کارمند متوقف می‌شود. دارایی کارکنان و اقساط جاری دست‌نخورده می‌ماند.</span>
          </div>
          <label htmlFor="org-susp-note" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="fl">دلیل تعلیق (برای سازمان ارسال می‌شود)</span><input id="org-susp-note" className="fi" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          {!reason.trim() && <span style={{ fontSize: 12, color: 'var(--error-text)' }}>دلیل تعلیق الزامی است.</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnd" disabled={!reason.trim() || update.isPending} onClick={() => setStatus('suspended', `سازمان ${org.name} تعلیق شد`)} style={{ opacity: !reason.trim() || update.isPending ? 0.6 : 1 }}>تعلیق سازمان</button>
          <button type="button" className="btno" onClick={() => setModal('')}>انصراف</button>
        </div>
      </Modal>

      <Modal open={modal === 'edit'} onClose={() => setModal('')} label={`ویرایش قرارداد — ${org.name}`} width={440}>
        {fundsQ.data ? (
          <ContractEditor
            key={org.id + ':' + ext.version}
            org={org}
            ext={ext}
            funds={fundsQ.data}
            monthsOptions={monthsOptions}
            onHistory={() => setModal('history')}
            onSaved={() => setModal('')}
            header={(dirty) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ModalTitle title={`ویرایش قرارداد — ${org.name}`} onClose={() => setModal('')} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>نسخه فعلی {faDigits(ext.version)} · ذخیره، نسخه {faDigits(ext.version + 1)} را می‌سازد</span>
                  {dirty && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>ذخیره‌نشده</span>}
                </div>
              </div>
            )}
          />
        ) : <PanelState loading height={300} />}
      </Modal>

      <Modal open={modal === 'history'} onClose={() => setModal('')} label="تاریخچه نسخه‌های قرارداد" width={540} radius={24} padding={24}>
        <ModalTitle title={`تاریخچه نسخه‌های قرارداد — ${org.name}`} onClose={() => setModal('')} />
        <VersionList ext={ext} />
        <div><button type="button" className="btno" onClick={() => setModal('')}>بستن</button></div>
      </Modal>

      <Modal open={modal === 'invite'} onClose={() => setModal('')} label="دعوت کاربر HR">
        <ModalTitle title={`دعوت کاربر HR — ${org.name}`} onClose={() => setModal('')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="fg" htmlFor="hr-name"><span className="fl">نام و نام خانوادگی</span><input id="hr-name" className="fi" value={inv.name} onChange={(e) => { setInv({ ...inv, name: e.target.value }); setInvErr(''); }} /></label>
          <label className="fg" htmlFor="hr-email"><span className="fl">ایمیل سازمانی</span><input id="hr-email" className="fi" dir="ltr" value={inv.email} onChange={(e) => { setInv({ ...inv, email: e.target.value }); setInvErr(''); }} /></label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="fl">نقش</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['مدیر منابع انسانی', 'مدیر مالی (تأییدکننده)', 'کارشناس HR'].map((r) => <button key={r} type="button" className={'chip' + (inv.role === r ? ' on' : '')} aria-pressed={inv.role === r} onClick={() => setInv({ ...inv, role: r })}>{r}</button>)}
          </div>
        </div>
        {invErr && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)', fontWeight: 600 }}>{invErr}</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btnp" disabled={invite.isPending} onClick={sendInvite}>{invite.isPending ? 'در حال ارسال…' : 'ارسال دعوت‌نامه'}</button>
          <button type="button" className="btno" onClick={() => setModal('')}>انصراف</button>
        </div>
      </Modal>
    </>
  );
}
