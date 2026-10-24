'use client';
/**
 * Operator console — organization page. Kit detail page: heading (logo, status, products, actions) → key numbers → sections:
 * overview (AUM trend, contract facts), contract (terms editor + approval chain + versions, sticky save bar),
 * staff (row → inspector), packages, credit (row → user profile), HR users (invite). Suspend / invite in dialogs.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { Employee, OrgPackage, Organization, PlatformUser } from '@/types/domain';
import { useOpFunds, useOpOrganization, useOpProducts, useOpUsers, useUpdateOrganization, type OpOrganizationDetail } from '@/api/op';
import { useInviteHrUser, useOrgContracts, useOrgCredit, type FacilityKind, type HrUser, type OrgContractExt, type OrgCreditRow, type OrgPatch } from '@/api/op-core-extra';
import {
  ActionBar, Allocation, Ava, BigNum, Card, Chips, Dialog, Empty, ErrorBlock, Field, FreeLocked, Ident, Inspector, KV, KeyStats, LineChart,
  List, ListRow, Meter, Note, PageHeading, Pill, Section, SettingRow, SettingsGroup, SkeletonCard, StatStrip, Switch, Table, TableFoot,
  Tabs, Tile, Who, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { ContractEditor, VersionList, useContractDraft } from '@/components/op/core/ContractEditor';
import { ICON, ORG_STATUS, PRODUCT_META, errMsg, fb, fm, orgProducts, pctFa, signedPct, splitPct } from '@/components/op/core/ui';
import { faDigits, jDate, jMonthYear, money, relTime } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';

type Tab = 'overview' | 'contract' | 'staff' | 'packages' | 'credit' | 'hr';
const DAY = 86400000;
const ORG_TONE: Record<Organization['status'], Tone> = { active: 'success', onboarding: 'info', suspended: 'error' };
const FAC_LABEL: Record<FacilityKind, string> = { loan: 'وام', bnpl: 'خرید اقساطی', card: 'اعتبار کارت' };
const FAC_SHORT: Record<FacilityKind, string> = { loan: 'وام', bnpl: 'اقساطی', card: 'کارت' };
const FAC_TONE: Record<FacilityKind, Tone> = { loan: 'info', bnpl: 'success', card: 'primary' };
const FAC_STATUS: Record<OrgCreditRow['status'], [string, Tone]> = { current: ['جاری', 'success'], late: ['معوق', 'error'], blocked: ['متوقف', 'neutral'], settled: ['تسویه‌شده', 'neutral'] };
const EMP_STATUS: Record<Employee['status'], [string, Tone]> = { active: ['فعال', 'success'], invited: ['در انتظار فعال‌سازی', 'warning'], inactive: ['غیرفعال', 'neutral'] };
const ASSET_SHORT: Record<string, string> = { rial: 'ریال', gold: 'طلا', fixed: 'درآمد ثابت', mixed: 'مختلط', equity: 'سهامی', silver: 'نقره' };
const HR_ROLES = ['مدیر منابع انسانی', 'مدیر مالی (تأییدکننده)', 'کارشناس HR'];
const bn = (n: number) => `${fb(n)} میلیارد`;
const b1 = (v: number) => faDigits(String(Math.round(v * 10) / 10), true);

function pkgKind(p: OrgPackage): string {
  if (p.lockPolicy.type === 'vesting') return 'پس‌انداز تا ' + jDate(p.lockPolicy.releaseAt);
  if (p.lockPolicy.type === 'milestone') {
    const steps = p.milestoneProgress ?? [];
    return `دریافت مرحله‌ای · ${faDigits(steps.filter((s) => s.status === 'released').length)} از ${faDigits(steps.length || p.lockPolicy.steps.length)} مرحله`;
  }
  if (p.allocationMode === 'fixed' && p.fixedSplit) {
    const parts = [[p.fixedSplit.gold, 'طلا'], [p.fixedSplit.fixed, 'درآمد ثابت'], [p.fixedSplit.rial ?? 0, 'ریال']].filter(([v]) => (v as number) > 0);
    return parts.map(([v, l]) => `${faDigits(v as number)}٪ ${l}`).join(' · ');
  }
  return 'تخصیص آزاد';
}

function pkgStatus(p: OrgPackage): [string, Tone] {
  if (p.status === 'draft') return ['پیش‌نویس', 'neutral'];
  if (p.status === 'cancelled') return ['لغوشده', 'error'];
  const pend = p.milestoneProgress?.findIndex((s) => s.status === 'pending_approval') ?? -1;
  if (pend >= 0) return [`مرحله ${faDigits(pend + 1)} در انتظار`, 'warning'];
  if (p.status === 'completed') return ['تکمیل‌شده', 'info'];
  return ['ارسال‌شده', 'success'];
}

export default function OpOrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const q = useOpOrganization(id);
  const contracts = useOrgContracts();
  const crumbs = [{ label: 'سازمان‌ها و قراردادها', href: routes.op.organizations }];

  if (q.isLoading || contracts.isLoading) return <><PageHeading title="در حال بارگذاری…" crumbs={crumbs} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>;
  const ext = contracts.data?.[id];
  if (q.isError || !q.data || !ext) {
    const err = q.error ?? contracts.error;
    return (
      <>
        <PageHeading title="سازمان" crumbs={crumbs} />
        <ErrorBlock error={err} message={err ? errMsg(err) : 'اطلاعات قرارداد این سازمان پیدا نشد'} onRetry={() => { q.refetch(); contracts.refetch(); }} />
      </>
    );
  }
  return <OrgView key={id} detail={q.data} ext={ext} />;
}

function OrgView({ detail, ext }: { detail: OpOrganizationDetail; ext: OrgContractExt }) {
  const toast = useToast();
  const { organization: org, employees, packages } = detail;
  const credit = useOrgCredit(org.id);
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const usersQ = useOpUsers();
  const update = useUpdateOrganization();
  const invite = useInviteHrUser();
  const c = useContractDraft(org, ext);
  const [tab, setTab] = useState<Tab>('overview');
  const [empId, setEmpId] = useState<string | null>(null);
  const [modal, setModal] = useState<'' | 'suspend' | 'invite'>('');
  const [reason, setReason] = useState('عدم تسویه صورت‌حساب مهر ۱۴۰۵');
  const [inv, setInv] = useState({ name: '', email: '', role: 'کارشناس HR' });
  const [invErr, setInvErr] = useState('');

  const prods = orgProducts(org);
  const sp = splitPct(ext.aum, ext.locked);
  const typeCount = Object.values(ext.lockByType).filter((v) => (v ?? 0) > 0).length;
  const lastVer = ext.versions[0];
  const daysLeft = Math.ceil((new Date(org.contractEnd).getTime() - now().getTime()) / DAY);
  const hrHead = ext.hrUsers[0]?.name ?? org.admins[0]?.name ?? '—';
  const creditRows = (credit.data ?? []).map((r, i) => ({ ...r, key: `${r.userId}-${r.kind}-${i}` }));
  const platform = new Map((usersQ.data ?? []).map((u) => [u.id, u]));
  const monthsOptions = products.data?.find((p) => p.kind === 'loan')?.monthsOptions ?? [3, 6, 12, 18];
  const growth12 = ext.aumHistory[0] > 0 ? ((ext.aumHistory[11] - ext.aumHistory[0]) / ext.aumHistory[0]) * 100 : 0;
  const sentPkgs = packages.filter((p) => p.status !== 'draft');
  const yearTotal = sentPkgs.filter((p) => p.sentAt && new Date(p.sentAt).getTime() > now().getTime() - 365 * DAY).reduce((s, p) => s + p.total, 0);
  const recips = sentPkgs.flatMap((p) => p.recipients);
  const acceptRate = recips.length ? (recips.filter((r) => r.status === 'accepted').length / recips.length) * 100 : 0;
  const unsaved = c.dirty ? Math.max(1, c.changes.length) : 0;
  const selEmp = employees.find((e) => e.id === empId);

  // AUM trend: 12 monthly values (oldest first), y axis starts below the lowest value
  const hist = ext.aumHistory.map((v) => v / 1e9);
  const months = hist.map((_, i) => jMonthYear(new Date(now().getTime() - 30 * (hist.length - 1 - i) * DAY)));
  const vmin = Math.min(...hist), vmax = Math.max(...hist);
  const span = Math.max(vmax - vmin, vmax * 0.1, 1);
  const yMin = Math.max(0, Math.floor((vmin - span * 0.5) / 5) * 5);

  const pick = (t: Tab) => { setTab(t); setEmpId(null); };
  const assetsOf = (e: Employee) => {
    const pu = platform.get(e.id);
    return { total: pu ? pu.portfolioValue : e.portfolioValue, locked: pu ? pu.lockedValue : e.lockedValue };
  };
  const facText = (uid: string) => creditRows.filter((r) => r.userId === uid).map((r) => `${FAC_SHORT[r.kind]} ${fm(r.kind === 'card' ? r.remain : r.amount)} م`).join(' · ') || '—';

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
  const openInvite = () => { setInvErr(''); setModal('invite'); };
  const sendInvite = () => {
    if (!inv.name.trim()) { setInvErr('نام کاربر را وارد کنید.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.email.trim())) { setInvErr('ایمیل معتبر وارد کنید.'); return; }
    invite.mutate({ orgId: org.id, name: inv.name.trim(), email: inv.email.trim(), role: inv.role }, {
      onSuccess: () => { setModal(''); setInv({ name: '', email: '', role: 'کارشناس HR' }); toast('دعوت‌نامه کاربر HR ارسال شد'); },
      onError: (e) => setInvErr(errMsg(e)),
    });
  };

  // ── tables ──
  const staffCols: Column<Employee>[] = [
    { key: 'emp', label: 'کارمند', width: 'minmax(0, 1.4fr)', render: (e) => <Ident lead={<Ava letter={e.avatarLetter} id={e.id} />} title={e.fullName} sub={faDigits(e.employeeCode)} subLtr /> },
    { key: 'dept', label: 'واحد', width: '96px', render: (e) => <span className="el mute">{e.department}</span> },
    {
      key: 'assets', label: 'دارایی / رزرو', width: '150px', col: true, render: (e) => {
        const { total, locked } = assetsOf(e);
        return (
          <>
            <span className="num">{fm(total)} م <span className="sm">{locked ? `· رزرو ${fm(locked)} م` : '· همه آزاد'}</span></span>
            <span style={{ width: 110 }}><LockBar free={Math.max(0, total - locked)} locked={locked} height={4} /></span>
          </>
        );
      },
    },
    { key: 'fac', label: 'تسهیلات', render: (e) => <span className="el sm">{facText(e.id)}</span> },
    { key: 'st', label: 'وضعیت', width: '128px', render: (e) => { const s = EMP_STATUS[e.status]; return <Pill tone={s[1]} dot>{s[0]}</Pill>; } },
  ];
  const pkgCols: Column<OrgPackage>[] = [
    { key: 'title', label: 'عنوان بسته', width: 'minmax(0, 1.6fr)', col: true, render: (p) => <><b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{p.title}</b><span className="sm el" style={{ maxWidth: '100%' }}>{pkgKind(p)}</span></> },
    { key: 'n', label: 'گیرندگان', width: '72px', render: (p) => <span className="num">{faDigits(p.recipients.length)}</span> },
    { key: 'total', label: 'مبلغ کل', width: '116px', render: (p) => <span className="num">{p.status === 'draft' ? '—' : p.total >= 1e9 ? fb(p.total, 2) + ' میلیارد' : fm(p.total) + ' میلیون'}</span> },
    {
      key: 'acc', label: 'تأیید کارکنان', width: '140px', col: true, render: (p) => {
        const accepted = p.recipients.filter((r) => r.status === 'accepted').length;
        const ms = p.lockPolicy.type === 'milestone' && p.milestoneProgress;
        const msPct = ms ? p.milestoneProgress!.filter((s) => s.status === 'released').reduce((a, s) => a + s.sharePct, 0) : 0;
        const pct = p.status === 'draft' ? 0 : ms ? msPct : p.recipients.length ? (accepted / p.recipients.length) * 100 : 0;
        return (
          <>
            <Meter value={pct / 100} tone="success" width={110} thin />
            <span className="sm num">{p.status === 'draft' ? '—' : ms ? `${pctFa(msPct)} آزاد` : `${faDigits(accepted)} از ${faDigits(p.recipients.length)}`}</span>
          </>
        );
      },
    },
    { key: 'at', label: 'تاریخ', width: '92px', render: (p) => <span className="num sm">{p.sentAt ? jDate(p.sentAt) : '—'}</span> },
    { key: 'st', label: 'وضعیت', width: '132px', render: (p) => { const [l, t] = pkgStatus(p); return <Pill tone={t} dot>{l}</Pill>; } },
  ];
  type CreditRow = OrgCreditRow & { key: string };
  const creditCols: Column<CreditRow>[] = [
    { key: 'who', label: 'کارمند', width: 'minmax(0, 1.2fr)', render: (r) => <Ident lead={<Ava letter={r.name[0]} id={r.userId} size="sm" />} title={r.name} /> },
    { key: 'kind', label: 'نوع', width: '104px', render: (r) => <Pill tone={FAC_TONE[r.kind]}>{FAC_LABEL[r.kind]}</Pill> },
    { key: 'amount', label: 'مبلغ', width: '112px', render: (r) => <span className="num">{money(r.amount)}</span> },
    { key: 'remain', label: 'مانده', width: '112px', render: (r) => <span className="num mute">{money(r.remain)}</span> },
    { key: 'coll', label: 'پشتوانه', width: 'minmax(0, 1fr)', render: (r) => <span className="sm el">{r.collateral ? `${ASSET_SHORT[r.collateral.holdingKind] ?? r.collateral.holdingKind} · ${fm(r.collateral.amount)} م` : '—'}</span> },
    { key: 'st', label: 'وضعیت', width: '88px', render: (r) => <Pill tone={FAC_STATUS[r.status][1]} dot>{FAC_STATUS[r.status][0]}</Pill> },
  ];
  const hrCols: Column<HrUser>[] = [
    { key: 'u', label: 'کاربر', width: 'minmax(0, 1.4fr)', render: (h) => <Ident lead={<Ava letter={h.name[0]} id={h.id} />} title={h.name} sub={h.email} subLtr /> },
    { key: 'role', label: 'نقش', width: '160px', render: (h) => <span className="el">{h.role}</span> },
    { key: 'last', label: 'آخرین ورود', width: '120px', render: (h) => <span className="sm">{h.lastLoginAt ? relTime(h.lastLoginAt, now()) : '—'}</span> },
    { key: 'tfa', label: 'ورود دومرحله‌ای', width: '112px', render: (h) => <Pill tone={h.twoFA ? 'success' : 'warning'}>{h.twoFA ? 'فعال' : 'غیرفعال'}</Pill> },
    { key: 'st', label: 'وضعیت', width: '96px', render: (h) => <Pill tone={h.status === 'active' ? 'success' : 'info'} dot>{h.status === 'active' ? 'فعال' : 'دعوت‌شده'}</Pill> },
  ];

  return (
    <>
      <PageHeading
        crumbs={[{ label: 'سازمان‌ها و قراردادها', href: routes.op.organizations }]}
        lead={<Ava letter={org.logoLetter} id={org.id} sq size="xl" />}
        title={org.name}
        sub={<>کد قرارداد <span className="ltr">{org.contractNo}</span> · {org.industry || '—'} · {ext.city}</>}
        pills={<><Pill tone={ORG_TONE[org.status]} dot>{ORG_STATUS[org.status].label}</Pill>{prods.length ? prods.map((k) => <Pill key={k} icon={PRODUCT_META[k].d}>{PRODUCT_META[k].name}</Pill>) : <Pill>بدون محصول فعال</Pill>}</>}
      >
        {org.status === 'active' && <button type="button" className="nm-btn line danger" onClick={() => setModal('suspend')}><Icon d={ICON.pause} size={16} />تعلیق</button>}
        {org.status === 'suspended' && <button type="button" className="nm-btn line ok" disabled={update.isPending} onClick={() => setStatus('active', `تعلیق ${org.name} برداشته شد`)}><Icon d={ICON.play} size={16} />رفع تعلیق</button>}
        {org.status === 'onboarding' && <button type="button" className="nm-btn line ok" disabled={update.isPending} onClick={() => setStatus('active', `قرارداد ${org.name} فعال شد`)}><Icon d={ICON.check} size={16} />فعال‌سازی قرارداد</button>}
        {tab !== 'contract' && <button type="button" className="nm-btn" onClick={() => pick('contract')}><Icon d={ICON.pen} size={16} />ویرایش قرارداد</button>}
      </PageHeading>

      <StatStrip items={[
        { label: 'کارکنان', value: faDigits(org.employees), unit: 'نفر', note: ext.newEmployeesMonth ? `+${faDigits(ext.newEmployeesMonth)} در این ماه` : 'بدون تغییر در این ماه', trend: ext.newEmployeesMonth ? 'up' : undefined },
        { label: 'AUM سازمان', value: fb(ext.aum), unit: 'میلیارد تومان', note: `${signedPct(ext.growthPct)} نسبت به ماه قبل`, trend: ext.growthPct > 0 ? 'up' : undefined },
        { label: 'وام‌های فعال', value: faDigits(ext.credit.activeLoans), unit: 'وام', note: `مانده ${bn(ext.credit.outstanding)} · ${faDigits(ext.credit.overdue)} معوق` },
        { label: 'دارایی رزروشده کارکنان', value: fb(ext.locked), unit: 'میلیارد', note: `${faDigits(typeCount)} نوع رزرو · ${pctFa(sp.lockedPct)} از AUM` },
      ]} />

      <Tabs label="بخش‌های سازمان" size="lg" value={tab} onChange={pick} items={[
        { key: 'overview', label: 'نمای کلی' },
        { key: 'contract', label: 'قرارداد', count: unsaved || undefined, hot: true },
        { key: 'staff', label: 'کارکنان', count: org.employees },
        { key: 'packages', label: 'بسته‌ها', count: packages.length },
        { key: 'credit', label: 'تسهیلات', count: ext.credit.activeLoans },
        { key: 'hr', label: 'کاربران HR', count: ext.hrUsers.length },
      ]} />

      {tab === 'overview' && (
        <div className="nm-grid side">
          <Card title="AUM — ۱۲ ماه" actions={ext.aum > 0 ? <Pill tone={growth12 >= 0 ? 'success' : 'error'}>{growth12 >= 0 ? '+' : '−'}{pctFa(Math.abs(growth12))}</Pill> : undefined}>
            {ext.aum > 0 ? (
              <>
                <FreeLocked free={sp.free} locked={ext.locked} fmt={bn} />
                <LineChart labels={months} min={yMin} fmt={b1} height={200}
                  label={`روند AUM دوازده ماه: از ${fb(ext.aumHistory[0])} به ${fb(ext.aumHistory[11])} میلیارد`}
                  series={[{ name: 'AUM (میلیارد تومان)', color: 'var(--chart-1)', values: hist, area: true }]} />
                <Allocation compact items={[
                  { label: 'صندوق طلا', value: ext.aumMix.gold, color: 'var(--warning-main)' },
                  { label: 'درآمد ثابت', value: ext.aumMix.fixed, color: 'var(--chart-3)' },
                  { label: 'ریال', value: ext.aumMix.rial, color: 'var(--chart-4)' },
                ]} />
              </>
            ) : <Empty icon={ICON.funds} title="هنوز دارایی‌ای برای کارکنان این سازمان ثبت نشده است" sub="پس از فعال‌سازی قرارداد و ارسال اولین بسته نمایش داده می‌شود." />}
          </Card>

          <Card title="اطلاعات قرارداد">
            <KV rows={[
              ['شروع قرارداد', <span key="s" className="num">{jDate(org.contractStart)}</span>],
              ['پایان / تمدید', <span key="e" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="num">{jDate(org.contractEnd)}</span><Pill tone={daysLeft < 60 ? 'warning' : 'neutral'}>{daysLeft >= 0 ? `${faDigits(daysLeft)} روز` : 'منقضی'}</Pill></span>],
              ['نسخه قرارداد', <span key="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>نسخه {faDigits(ext.version)}{lastVer && <span className="num mute">· {jDate(lastVer.at)}</span>}<button type="button" className="nm-more" onClick={() => pick('contract')}>تاریخچه</button></span>],
              ['مدیر HR', hrHead],
              ['ایمیل HR', <span key="m" className="ltr">{ext.hrEmail || '—'}</span>],
              ['مدیر حساب (نمادنو)', ext.accountManager],
            ]} />
          </Card>
        </div>
      )}

      {tab === 'contract' && (
        <>
          <div className="nm-grid side">
            <div className="nm-stack">
              {fundsQ.data ? <ContractEditor c={c} funds={fundsQ.data} monthsOptions={monthsOptions} />
                : fundsQ.isError ? <ErrorBlock error={fundsQ.error} message={errMsg(fundsQ.error)} onRetry={() => fundsQ.refetch()} />
                : <SkeletonCard h={420} />}
            </div>
            <div className="nm-stack">
              <SettingsGroup title="زنجیره تأیید بسته‌ها" footer="تغییر این گزینه بلافاصله ذخیره می‌شود و نسخه‌ی تازه‌ای از قرارداد می‌سازد.">
                <SettingRow label="۱ · مدیر منابع انسانی" desc="تأیید اول هر بسته" />
                <SettingRow label="۲ · مدیر مالی سازمان" desc="نیاز به تأیید مدیر مالی سازمان">
                  <Switch on={ext.financeApproval} onChange={toggleFinance} disabled={update.isPending} label="نیاز به تأیید مدیر مالی" />
                </SettingRow>
                <SettingRow label="۳ · ارسال به کارکنان" desc="پس از آخرین تأیید" />
              </SettingsGroup>
              <Card title="تاریخچه نسخه‌ها" count={ext.versions.length}>
                <VersionList ext={ext} />
              </Card>
            </div>
          </div>
          <ActionBar actions={(
            <>
              {c.dirty && <button type="button" className="nm-btn ghost" onClick={c.reset} disabled={c.saving}>لغو تغییرات</button>}
              <button type="button" className="nm-btn" onClick={c.save} disabled={c.saving || !c.dirty}><Icon d={ICON.check} size={16} strokeWidth={2.2} />{c.saving ? 'در حال ذخیره…' : 'ذخیره قرارداد'}</button>
            </>
          )}>
            {c.dirty
              ? <Pill tone="warning" dot>{faDigits(unsaved)} تغییر ذخیره‌نشده</Pill>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon d={ICON.info} size={16} />نسخه فعلی {faDigits(ext.version)} · ذخیره، نسخه {faDigits(ext.version + 1)} را می‌سازد</span>}
          </ActionBar>
        </>
      )}

      {tab === 'staff' && (
        <Card flush title="کارکنان" count={employees.length}>
          <Table
            columns={staffCols} rows={employees} rowKey={(e) => e.id} rowLabel={(e) => e.fullName}
            onRowClick={(e) => setEmpId((s) => (s === e.id ? null : e.id))} selectedKey={empId}
            empty={<Empty icon={ICON.users} title="هنوز کارمندی برای این سازمان ثبت نشده است" />} minWidth={760}
          />
          <TableFoot shown={employees.length} total={org.employees} unit="کارمند">
            <Link href={routes.op.users} className="nm-more">همه در «کاربران»</Link>
          </TableFoot>
        </Card>
      )}

      {tab === 'packages' && (
        <Card flush title="بسته‌ها" count={packages.length}>
          <Table columns={pkgCols} rows={packages} rowKey={(p) => p.id} empty={<Empty icon={ICON.inbox} title="هنوز بسته‌ای ارسال نشده است" />} minWidth={780} />
          {packages.length > 0 && (
            <div className="nm-tfoot">
              <span>جمع ۱۲ ماه <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fb(yearTotal, 2)} میلیارد تومان</b> · نرخ تأیید <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pctFa(acceptRate)}</b></span>
            </div>
          )}
        </Card>
      )}

      {tab === 'credit' && (
        <Card flush title="تسهیلات کارکنان" count={creditRows.length || undefined}>
          <Table
            columns={creditCols} rows={creditRows} rowKey={(r) => r.key} rowLabel={(r) => r.name} rowHref={(r) => routes.op.user(r.userId)}
            loading={credit.isLoading} error={credit.isError ? credit.error : undefined} onRetry={() => credit.refetch()}
            empty={<Empty icon={ICON.card} title="تسهیلات فعالی برای کاربران ثبت‌شده این سازمان نیست" />} minWidth={780}
          />
          <div className="nm-tfoot">
            <span>
              کل سازمان: <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{faDigits(ext.credit.activeLoans)}</b> وام فعال · مانده <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bn(ext.credit.outstanding)}</b>
              {' '}· اعتبار کارت فعال <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{faDigits(ext.credit.cardHolders)} نفر</b> · اقساط معوق <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{faDigits(ext.credit.overdue)}</b>
            </span>
          </div>
        </Card>
      )}

      {tab === 'hr' && (
        <Card flush title="کاربران HR" count={ext.hrUsers.length} actions={<button type="button" className="nm-btn sm ghost" onClick={openInvite}><Icon d={ICON.plus} size={15} strokeWidth={2} />دعوت کاربر HR</button>}>
          <Table columns={hrCols} rows={ext.hrUsers} rowKey={(h) => h.id} empty={<Empty icon={ICON.users} title="هنوز کاربر HR اضافه نشده است" />} minWidth={680} />
          <div className="nm-tfoot">دعوت‌نامه با لینک یک‌بارمصرف ۴۸ ساعته ارسال می‌شود</div>
        </Card>
      )}

      {tab === 'staff' && selEmp && (
        <StaffInspector key={selEmp.id} e={selEmp} pu={platform.get(selEmp.id)} rows={creditRows.filter((r) => r.userId === selEmp.id)} onClose={() => setEmpId(null)} />
      )}

      <Dialog
        open={modal === 'suspend'} onClose={() => setModal('')} title={`تعلیق سازمان — ${org.name}`} icon={<Tile d={ICON.pause} tone="error" size="lg" />}
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button>
            <button type="button" className="nm-btn danger" disabled={!reason.trim() || update.isPending} onClick={() => setStatus('suspended', `سازمان ${org.name} تعلیق شد`)}>تعلیق سازمان</button>
          </>
        )}
      >
        <Note tone="warn">با تعلیق، ارسال بسته جدید و صدور تسهیلات برای {faDigits(org.employees)} کارمند متوقف می‌شود. دارایی کارکنان و اقساط جاری دست‌نخورده می‌ماند.</Note>
        <Field label="دلیل تعلیق (برای سازمان ارسال می‌شود)" htmlFor="org-susp-note" error={!reason.trim() ? 'دلیل تعلیق الزامی است.' : undefined}>
          <div className={'nm-ctl' + (!reason.trim() ? ' err' : '')}><input id="org-susp-note" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </Field>
      </Dialog>

      <Dialog
        open={modal === 'invite'} onClose={() => setModal('')} width={520} title={`دعوت کاربر HR — ${org.name}`} sub="دعوت‌نامه با لینک یک‌بارمصرف ۴۸ ساعته ارسال می‌شود"
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setModal('')}>انصراف</button>
            <button type="button" className="nm-btn" disabled={invite.isPending} onClick={sendInvite}>{invite.isPending ? 'در حال ارسال…' : 'ارسال دعوت‌نامه'}</button>
          </>
        )}
      >
        <div className="nm-grid c2" style={{ gap: 12 }}>
          <Field label="نام و نام خانوادگی" htmlFor="hr-name">
            <div className="nm-ctl"><input id="hr-name" value={inv.name} onChange={(e) => { setInv({ ...inv, name: e.target.value }); setInvErr(''); }} /></div>
          </Field>
          <Field label="ایمیل سازمانی" htmlFor="hr-email">
            <div className="nm-ctl"><input id="hr-email" dir="ltr" value={inv.email} onChange={(e) => { setInv({ ...inv, email: e.target.value }); setInvErr(''); }} /></div>
          </Field>
        </div>
        <Field label="نقش">
          <Chips label="نقش کاربر HR" value={inv.role} onChange={(r) => setInv({ ...inv, role: r })} options={HR_ROLES.map((r) => ({ key: r, label: r }))} />
        </Field>
        {invErr && <Note tone="err">{invErr}</Note>}
      </Dialog>
    </>
  );
}

/** Employee of the organization: assets (free / locked) and facilities; «پروفایل کامل» when the person has a platform account. */
function StaffInspector({ e, pu, rows, onClose }: { e: Employee; pu?: PlatformUser; rows: OrgCreditRow[]; onClose: () => void }) {
  const total = pu ? pu.portfolioValue : e.portfolioValue;
  const locked = pu ? pu.lockedValue : e.lockedValue;
  const s = EMP_STATUS[e.status];
  return (
    <Inspector open onClose={onClose} title="جزئیات کارمند" label={`جزئیات ${e.fullName}`} href={pu ? routes.op.user(e.id) : undefined} hrefLabel="پروفایل کامل">
      <Who lead={<Ava letter={e.avatarLetter} id={e.id} size="lg" />} title={e.fullName} sub={`${e.jobTitle} · واحد ${e.department}`} pills={<Pill tone={s[1]} dot>{s[0]}</Pill>} />
      <KeyStats items={[['کد پرسنلی', faDigits(e.employeeCode)], ['عضویت از', jDate(e.joinedAt)], ['دریافتی از سازمان', `${fm(e.totalReceived)} م`]]} />
      <Section title="دارایی" action={<BigNum value={money(total)} unit="تومان" />}>
        <FreeLocked free={Math.max(0, total - locked)} locked={locked} />
      </Section>
      <Section title="تسهیلات">
        {rows.length ? (
          <List>
            {rows.map((r, i) => (
              <ListRow key={r.kind + i}
                lead={<Tile d={PRODUCT_META[r.kind].d} tone={FAC_TONE[r.kind]} />}
                title={FAC_LABEL[r.kind]}
                sub={`مبلغ ${money(r.amount)} · مانده ${money(r.remain)}`}
                trail={<Pill tone={FAC_STATUS[r.status][1]}>{FAC_STATUS[r.status][0]}</Pill>}
              />
            ))}
          </List>
        ) : <Empty title="تسهیلات فعالی ثبت نشده است" />}
      </Section>
    </Inspector>
  );
}
