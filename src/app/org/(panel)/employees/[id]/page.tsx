'use client';
/**
 * Organization panel — employee profile. Kit detail page: heading with avatar + status pills + actions → key numbers → tabs →
 * cards: assets (holdings with the free/locked split, active locks, milestone contract, account), packages, facilities, activity.
 */
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useOrgEmployee, useReleaseMilestone, useUpdateEmployee } from '@/api/org';
import { useOrgPeopleEmployee, type EmpActivity } from '@/api/org-people-extra';
import type { AllocationSplit, AssetKind, Holding, Lock, OrgPackage } from '@/types/domain';
import {
  Ava, BigNum, Card, Confirm, Empty, ErrorBlock, FreeLocked, Ident, KV, List, ListRow, Meter, Note, PageHeading, Pill, Section, SkeletonCard,
  StatStrip, Table, Tabs, Tile, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LockBar, LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { EMP_STATUS, I, MsSeg, errMsg, million } from '@/components/org/people/shared';
import { EMP_TONE, SuspendNotice } from '@/components/org/people/EmployeeSidePanel';
import { useStartPackage } from '@/components/org/people/useStartPackage';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import { faDigits, jDate, jDayMonth, jMonthYear, money, pct, relTime, signedMoney, time } from '@/lib/format';

type Tab = 'assets' | 'pkgs' | 'loans' | 'log';
const ACT_ICON: Record<EmpActivity['kind'], { d: string; tone: Tone }> = {
  milestone: { d: I.flag, tone: 'primary' }, login: { d: I.shield, tone: 'neutral' }, loan: { d: I.percent, tone: 'info' },
  lock: { d: I.lock, tone: 'warning' }, package: { d: I.pkg, tone: 'primary' }, installment: { d: I.lock, tone: 'secondary' }, card: { d: I.credit, tone: 'primary' },
};
const KIND: Partial<Record<AssetKind, [IconName, Tone]>> = {
  rial: ['banknote', 'neutral'], gold: ['gold', 'warning'], silver: ['gold', 'neutral'], fixed: ['chart', 'secondary'], equity: ['trend', 'primary'], mixed: ['pie', 'success'],
};

function lockCond(l: Lock, msText?: string) {
  if (l.type === 'milestone') return msText ?? l.condition;
  if (l.type === 'collateral' && l.totalCount) return `${l.condition} (${faDigits(l.totalCount)} قسط، ${faDigits(l.totalCount - (l.paidCount ?? 0))} مانده)`;
  if (l.type === 'installment' && l.totalCount) return `${l.condition} · ${faDigits(l.totalCount - (l.paidCount ?? 0))} قسط مانده`;
  return l.condition;
}
const mobileFmt = (m: string) => faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`);
const splitText = (s: AllocationSplit) => [s.gold && `طلا ${pct(s.gold)}`, s.fixed && `درآمد ثابت ${pct(s.fixed)}`, s.rial && `ریال ${pct(s.rial)}`].filter(Boolean).join(' · ');
const dash = <span style={{ color: 'var(--text-disabled)' }}>—</span>;

export default function OrgEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const core = useOrgEmployee(id);
  const extra = useOrgPeopleEmployee(id);
  const update = useUpdateEmployee();
  const release = useReleaseMilestone();
  usePanelToast(); // shows a message flashed by the previous screen (e.g. after adding this employee)
  const show = useToast();
  const pkgStart = useStartPackage((e) => show(errMsg(e), 'error'));
  const [tab, setTab] = useState<Tab>('assets');
  const [released, setReleased] = useState<{ idx: number; amount: number } | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const emp = core.data?.employee;
  const x = extra.data;
  const holdings: Holding[] = core.data?.holdings ?? x?.holdings ?? [];
  const loans = core.data?.loans?.length ? core.data.loans : x?.loans ?? [];
  const packages = useMemo(() => (core.data?.packages ?? []).filter((p) => p.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')), [core.data]);
  const msPkg: OrgPackage | undefined = packages.find((p) => p.lockPolicy.type === 'milestone' && p.milestoneProgress?.length);

  const crumbs = [{ label: 'کارکنان', href: routes.org.employees }];
  if (core.isError) return <><PageHeading title="پروفایل کارمند" crumbs={crumbs} /><ErrorBlock error={core.error} message={errMsg(core.error)} onRetry={() => core.refetch()} /></>;
  if (!emp) return <><PageHeading title="در حال بارگذاری…" crumbs={crumbs} /><StatStrip loading items={[]} /><SkeletonCard h={360} /></>;

  const inactive = emp.status === 'inactive';
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const lockedTotal = holdings.reduce((s, h) => s + h.locked, 0);
  const freeTotal = Math.max(0, total - lockedTotal);
  const locks = holdings.flatMap((h) => h.locks.map((l) => ({ l, h })));
  const lockHoldingsN = holdings.filter((h) => h.locked > 0).length;
  const kyc = x?.facts.kycLevel ?? 0;
  const kycPill: [string, Tone] = kyc === 3 ? ['KYC تأیید‌شده', 'success'] : kyc ? [`KYC سطح ${faDigits(kyc)}`, 'info'] : ['KYC انجام نشده', 'neutral'];
  const score = x?.facts.score ?? 0;

  // milestone contract
  const steps = msPkg?.milestoneProgress ?? [];
  const relSteps = steps.filter((s) => s.status === 'released');
  const relPct = relSteps.reduce((s, m) => s + m.sharePct, 0);
  const pending = steps.find((s) => s.status === 'pending_approval');
  const pendingIdx = pending ? steps.indexOf(pending) + 1 : 0;
  const msRecipient = msPkg?.recipients.find((r) => r.employeeId === emp.id);
  const msTotal = msRecipient?.amount ?? msPkg?.amountPerPerson ?? 0;
  const msLock = locks.find(({ l }) => l.type === 'milestone' && l.sourceId === msPkg?.id);
  const msHolding = msLock?.h.name ?? (msPkg?.fixedSplit && msPkg.fixedSplit.fixed > msPkg.fixedSplit.gold ? 'صندوق درآمد ثابت' : 'صندوق طلا');
  const msProgText = `${faDigits(relSteps.length)} از ${faDigits(steps.length)} مرحله · ${pct(relPct)} آزاد شده`;

  const approveMs = () => {
    if (!msPkg || !pending) return;
    const amount = Math.round((msTotal * pending.sharePct) / 100);
    const idx = pendingIdx;
    release.mutate({ packageId: msPkg.id, stepId: pending.id }, {
      onSuccess: () => { setReleased({ idx, amount }); show(`مرحله ${faDigits(idx)} تأیید شد · ${money(amount)} تومان در ${msHolding} ${emp.fullName.split(' ')[0]} آزاد شد`); },
      onError: (e) => show(errMsg(e), 'error'),
    });
  };
  const setStatus = (status: 'active' | 'inactive') =>
    update.mutate({ id: emp.id, status }, {
      onSuccess: () => show(status === 'inactive' ? `حساب ${emp.fullName} تعلیق شد · دارایی‌ها دست‌نخورده می‌ماند` : `تعلیق حساب ${emp.fullName} برداشته شد`),
      onError: (e) => show(errMsg(e), 'error'),
    });

  const loan = loans.find((l) => l.status === 'active');
  const card = x?.card;
  const pkgSum = packages.reduce((s, p) => s + (p.recipients.find((r) => r.employeeId === emp.id)?.amount ?? 0), 0);
  const pkgPending = packages.filter((p) => p.recipients.some((r) => r.employeeId === emp.id && r.status === 'pending')).length;
  const today = x?.todayChange ?? 0;

  // ── tables ──
  const holdCols: Column<Holding>[] = [
    {
      key: 'name', label: 'دارایی', width: 'minmax(0, 1.4fr)', render: (h) => {
        const [ic, tone] = KIND[h.kind] ?? (['assets', 'info'] as [IconName, Tone]);
        return <Ident lead={<Tile name={ic} tone={tone} />} title={h.name} />;
      },
    },
    { key: 'total', label: 'کل', width: '112px', render: (h) => <span className="num" style={{ fontWeight: 600 }}>{money(h.value)}</span> },
    { key: 'free', label: 'آزاد', width: '112px', render: (h) => <span className="num" style={{ color: h.free > 0 ? undefined : 'var(--text-disabled)' }}>{money(h.free)}</span> },
    { key: 'locked', label: 'قفل', width: '112px', render: (h) => (h.locked > 0 ? <span className="num" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon d={I.lock} size={12} />{money(h.locked)}</span> : dash) },
    {
      key: 'split', label: 'آزاد / قفل', width: '104px', col: true,
      render: (h) => <><span style={{ width: '100%' }}><LockBar free={h.free} locked={h.locked} height={5} /></span><span className="sm el">{h.locked ? Array.from(new Set(h.locks.map((l) => LOCK_META[l.type].short))).join(' + ') : 'همه آزاد'}</span></>,
    },
  ];
  type LockRow = { l: Lock; h: Holding };
  const lockCols: Column<LockRow>[] = [
    { key: 'type', label: 'نوع', width: '96px', render: ({ l }) => <LockTypeChip type={l.type} /> },
    {
      key: 'cond', label: 'عنوان · شرط آزادسازی', width: 'minmax(0, 1.6fr)', col: true, render: ({ l }) => {
        const isMs = l.type === 'milestone';
        const ls = isMs ? (l.sourceId === msPkg?.id ? steps : l.steps ?? []) : [];
        const lr = ls.filter((s) => s.status === 'released');
        return (
          <>
            <b className="el" style={{ fontWeight: 600, maxWidth: '100%' }}>{l.title}</b>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
              {isMs && ls.length > 0 && <MsSeg steps={ls} width={56} height={4} />}
              <span className="sm el num">{lockCond(l, isMs && ls.length ? `${faDigits(lr.length)} از ${faDigits(ls.length)} مرحله · ${pct(lr.reduce((s, m) => s + m.sharePct, 0))} آزاد شده` : undefined)}</span>
            </span>
          </>
        );
      },
    },
    { key: 'src', label: 'منبع', width: '128px', render: ({ h }) => <span className="sm el">{h.name}</span> },
    { key: 'amount', label: 'مبلغ قفل', width: '112px', render: ({ l }) => <span className="num" style={{ fontWeight: 600 }}>{money(l.amount)}</span> },
  ];
  const pkgCols: Column<OrgPackage>[] = [
    { key: 'title', label: 'عنوان', width: 'minmax(0, 1.4fr)', render: (p) => <Ident lead={<Tile d={I.pkg} tone={p.reason === 'welfare' ? 'info' : 'primary'} />} title={p.title} /> },
    { key: 'amount', label: 'مبلغ (تومان)', width: '120px', render: (p) => <span className="num" style={{ fontWeight: 600 }}>{money(p.recipients.find((r) => r.employeeId === emp.id)?.amount ?? p.amountPerPerson)}</span> },
    {
      key: 'split', label: 'تخصیص', width: 'minmax(0, 1fr)', render: (p) => {
        const s = x?.packageSplits[p.id];
        const t = s ? splitText(s) : '';
        return t ? <span className="sm el num">{t}</span> : <span className="sm" style={{ color: 'var(--text-disabled)' }}>هنوز تخصیص نیافته</span>;
      },
    },
    { key: 'date', label: 'تاریخ', width: '92px', render: (p) => <span className="num sm">{jDate(p.sentAt!)}</span> },
    {
      key: 'st', label: 'وضعیت · قفل', width: '120px', render: (p) => {
        const r = p.recipients.find((y) => y.employeeId === emp.id);
        if (r?.status === 'accepted' && p.lockPolicy.type !== 'none') return <LockTypeChip type={p.lockPolicy.type} />;
        return r?.status === 'pending' ? <Pill tone="warning" dot>در انتظار تأیید</Pill> : r?.status === 'expired' ? <Pill dot>منقضی</Pill> : <Pill tone="success" dot>دریافت‌شده</Pill>;
      },
    },
  ];

  // ── facilities ──
  const loanCard = loan ? (() => {
    const paid = loan.installments.filter((i) => i.status === 'paid').length;
    const unpaid = loan.installments.filter((i) => i.status !== 'paid');
    const overdue = unpaid.filter((i) => i.status === 'overdue').length;
    const next = unpaid[0];
    const remaining = unpaid.reduce((s, i) => s + i.amount, 0);
    const colHolding = holdings.find((h) => h.kind === loan.collateral.holdingKind)?.name ?? loan.collateral.holdingKind;
    return (
      <Card title="وام فعال" actions={<Pill tone={overdue ? 'error' : 'success'} dot>{overdue ? `${faDigits(overdue)} قسط معوق` : 'به‌موقع'}</Pill>} more={{ label: 'فهرست تسهیلات', href: routes.org.credit }}>
        <BigNum value={money(loan.principal)} unit={`تومان · ${faDigits(loan.months)} ماهه · نرخ ${pct(loan.ratePct)}`} />
        <Meter value={loan.months ? paid / loan.months : 0} label={`${faDigits(paid)} از ${faDigits(loan.months)} قسط پرداخت شده`} />
        <KV rows={[
          ['قسط ماهانه', <span key="m" className="num">{money(loan.monthlyPayment)} تومان</span>],
          ['پرداخت‌شده', <span key="p" className="num">{faDigits(paid)} از {faDigits(loan.months)} قسط</span>],
          ['قسط بعدی', <span key="n" className="num" style={{ color: next ? (overdue ? 'var(--error-text)' : 'var(--warning-text)') : undefined }}>{next ? jDayMonth(next.dueDate, true) : '—'}</span>],
          ['مانده بدهی', <span key="r" className="num">{money(remaining)} تومان</span>],
        ]} />
        <Note tone="info" icon={I.lock}>وثیقه اعتبار و وام: {money(loan.collateral.amount)} تومان از {colHolding} قفل است · آزاد با تسویه وام ({faDigits(unpaid.length)} قسط مانده).</Note>
      </Card>
    );
  })() : (
    <Card title="وام فعال" actions={<Pill>ندارد</Pill>} more={{ label: 'فهرست تسهیلات', href: routes.org.credit }}>
      <span className="mute" style={{ fontSize: 13, lineHeight: 1.7 }}>این کارمند وام فعالی ندارد.</span>
      <Note tone="info">سقف وام قابل درخواست: {money(Math.round(freeTotal * 0.4))} تومان (۴۰٪ دارایی آزاد · قفل‌ها در ظرفیت وثیقه حساب نمی‌شوند).</Note>
    </Card>
  );
  const cardCard = card ? (() => {
    const rialRes = locks.find(({ l }) => l.type === 'collateral' && l.holdingKind === 'rial');
    const st: [string, Tone] = card.status === 'active' ? ['فعال', 'success'] : card.status === 'frozen' ? ['مسدود موقت', 'warning'] : ['مسدود', 'error'];
    return (
      <Card title="اعتبار کارت نمادنو" actions={<Pill tone={st[1]} dot>{st[0]}</Pill>} more={{ label: 'قواعد قرارداد', href: routes.org.contract }}>
        <BigNum value={money(card.creditLimit)} unit={`تومان سقف · استفاده‌شده ${money(card.creditUsed)}`} />
        <Meter value={card.creditLimit ? card.creditUsed / card.creditLimit : 0} tone="success" label={`${pct(card.creditLimit ? (card.creditUsed / card.creditLimit) * 100 : 0)} سقف استفاده شده`} />
        <KV rows={[
          ['سقف اعتبار', <span key="l" className="num">{money(card.creditLimit)} تومان</span>],
          ['استفاده‌شده', <span key="u" className="num">{money(card.creditUsed)} تومان</span>],
          ['تسویه بعدی', <span key="d" className="num" style={{ color: 'var(--warning-text)' }}>{jDayMonth(card.statementDue, true)}</span>],
          ['اقساط معوق', <span key="o" className="num" style={{ color: card.overdue ? 'var(--error-text)' : 'var(--success-text)' }}>{faDigits(card.overdue)} مورد</span>],
        ]} />
        <Note tone="info">{rialRes ? `${money(rialRes.l.amount)} تومان از کیف پول ریالی برای تسویه صورت‌حساب رزرو و قفل است (وثیقه) · آزاد با تسویه صورت‌حساب.` : 'سقف اعتبار کارت طبق قرارداد سازمان تا ۲۵٪ دارایی آزاد کارمند تعیین می‌شود.'}</Note>
      </Card>
    );
  })() : (
    <Card title="اعتبار کارت نمادنو" actions={<Pill>غیرفعال</Pill>} more={{ label: 'قواعد قرارداد', href: routes.org.contract }}>
      <span className="mute" style={{ fontSize: 13, lineHeight: 1.7 }}>کارمند هنوز کارت اعتباری نمادنو را فعال نکرده است. سقف قابل تخصیص: {money(Math.round(freeTotal * 0.25))} تومان (۲۵٪ دارایی آزاد).</span>
    </Card>
  );

  return (
    <>
      <PageHeading
        crumbs={crumbs}
        lead={<Ava letter={emp.avatarLetter} id={emp.id} size="xl" />}
        title={emp.fullName}
        sub={<>واحد {emp.department}{emp.jobTitle ? ` · ${emp.jobTitle}` : ''} · کد پرسنلی <span className="num">{faDigits(emp.employeeCode)}</span> · عضو از {jMonthYear(emp.joinedAt)}</>}
        pills={<><Pill tone={EMP_TONE[emp.status]} dot>{EMP_STATUS[emp.status].label}</Pill><Pill tone={kycPill[1]}>{kycPill[0]}</Pill>{score > 0 && <Pill tone="primary">امتیاز اعتباری {faDigits(score)}</Pill>}</>}
      >
        {!inactive
          ? <button type="button" className="nm-btn line danger" disabled={update.isPending} onClick={() => setConfirmSuspend(true)}><Icon d={I.ban} size={16} />تعلیق</button>
          : <button type="button" className="nm-btn line ok" disabled={update.isPending} onClick={() => setStatus('active')}><Icon d={I.check} size={16} />رفع تعلیق</button>}
        <button type="button" className="nm-btn" disabled={pkgStart.pending || inactive} onClick={() => pkgStart.start([emp.id])}><Icon d={I.pkg} size={16} />ارسال بسته</button>
      </PageHeading>

      <StatStrip items={[
        { label: 'دارایی کل', value: million(total), unit: 'میلیون تومان', note: x && total ? `امروز ${signedMoney(today)}` : undefined, trend: today > 0 ? 'up' : today < 0 ? 'down' : undefined },
        { label: 'دارایی آزاد', value: million(freeTotal), unit: 'میلیون', note: 'قابل فروش و برداشت' },
        { label: 'قفل‌شده', value: million(lockedTotal), unit: 'میلیون', note: locks.length ? `${faDigits(locks.length)} قفل در ${faDigits(lockHoldingsN)} دارایی` : 'بدون قفل فعال' },
        {
          label: 'تسهیلات فعال', value: million((loan?.principal ?? 0) + (card?.creditLimit ?? 0)), unit: 'میلیون',
          note: [loan && `وام ${million(loan.principal)} م`, card && `کارت ${million(card.creditLimit)} م`].filter(Boolean).join(' · ') || 'بدون تسهیلات',
        },
      ]} />

      <Tabs label="بخش‌های پروفایل" size="lg" value={tab} onChange={setTab} items={[
        { key: 'assets', label: 'دارایی', count: holdings.length },
        { key: 'pkgs', label: 'بسته‌ها', count: packages.length },
        { key: 'loans', label: 'تسهیلات', count: (loan ? 1 : 0) + (card ? 1 : 0) },
        { key: 'log', label: 'فعالیت', count: x?.activity.length ?? 0 },
      ]} />

      {tab === 'assets' && (
        <div className="nm-grid side">
          <div className="nm-stack">
            <Card flush title="دارایی‌ها" count={holdings.length || undefined}>
              <Table columns={holdCols} rows={holdings} rowKey={(h) => h.kind} loading={!holdings.length && extra.isLoading}
                empty={<Empty title={emp.status === 'invited' ? 'کارمند هنوز حساب خود را فعال نکرده و دارایی ندارد' : 'دارایی‌ای ثبت نشده است'} />} />
              {holdings.length > 0 && (
                <div style={{ padding: '14px 20px 18px', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 13 }}>جمع دارایی</b><BigNum value={money(total)} unit="تومان" style={{ marginRight: 'auto' }} /></div>
                  <FreeLocked free={freeTotal} locked={lockedTotal} />
                </div>
              )}
            </Card>
            {holdings.length > 0 && (
              <Card flush title="قفل‌های فعال" count={locks.length || undefined} sub={locks.length ? `${money(lockedTotal)} تومان` : undefined}>
                <Table columns={lockCols} rows={locks} rowKey={({ l }) => l.id} minWidth={620}
                  empty={<Empty icon={I.lock} tone="success" title="همه دارایی این کارمند آزاد است" />} />
              </Card>
            )}
          </div>

          <div className="nm-stack">
            {msPkg && (
              <Card title="آزادسازی مرحله‌ای" more={{ label: 'جزئیات قرارداد', href: routes.org.package(msPkg.id) }}>
                <Ident lead={<Tile d={I.flag} tone="primary" />} title={msPkg.title} sub={<span className="num">کل {money(msTotal)} تومان · {msHolding}</span>} />
                <Section>
                  <MsSeg steps={steps} label={msProgText} />
                  <span className="mute num" style={{ fontSize: 12 }}>{msProgText}</span>
                </Section>
                <List>
                  {steps.map((m) => {
                    const rel = m.status === 'released';
                    const pend = m.status === 'pending_approval';
                    return <ListRow key={m.id} title={m.title} sub={<span className="num">{pct(m.sharePct)} قرارداد</span>} trail={<Pill tone={rel ? 'success' : pend ? 'warning' : 'neutral'}>{rel ? 'آزاد شده' : pend ? 'در انتظار تأیید' : 'آینده'}</Pill>} />;
                  })}
                </List>
                {released && <div role="status"><Note tone="ok">مرحله {faDigits(released.idx)} تأیید شد · {money(released.amount)} تومان آزاد شد</Note></div>}
                {pending && (
                  <button type="button" className="nm-btn block" disabled={release.isPending} onClick={approveMs}>
                    <Icon d={I.check} size={16} strokeWidth={2.2} />{release.isPending ? 'در حال آزادسازی…' : `تأیید انجام تعهد و آزادسازی ${pct(pending.sharePct)}`}
                  </button>
                )}
              </Card>
            )}
            <Card title="حساب و تماس">
              <KV rows={[
                ['موبایل', <span key="m" className="num ltr">{mobileFmt(emp.mobile)}</span>],
                ['ایمیل', <span key="e" className="ltr">{x?.email || '—'}</span>],
                ['آخرین فعالیت', <span key="a" className="num">{x?.lastActiveAt ? relTime(x.lastActiveAt, now()) : 'هنوز وارد اپ نشده'}</span>],
              ]} />
            </Card>
          </div>
        </div>
      )}

      {tab === 'pkgs' && (
        <Card flush title="بسته‌های دریافتی" count={packages.length || undefined}
          sub={packages.length ? `${money(pkgSum)} تومان · ${faDigits(pkgPending)} در انتظار تأیید` : undefined}
          actions={<button type="button" className="nm-btn sm text" disabled={pkgStart.pending || inactive} onClick={() => pkgStart.start([emp.id])}><Icon d={I.plus} size={15} />ارسال بسته جدید</button>}>
          <Table columns={pkgCols} rows={packages} rowKey={(p) => p.id} rowHref={(p) => routes.org.package(p.id)} rowLabel={(p) => p.title} chevron minWidth={720}
            empty={<Empty icon={I.pkg} title="هنوز بسته‌ای برای این کارمند ارسال نشده است" />} />
        </Card>
      )}

      {tab === 'loans' && <div className="nm-grid c2 stretch">{loanCard}{cardCard}</div>}

      {tab === 'log' && (
        <Card title="فعالیت اخیر" count={x?.activity.length || undefined} more={{ label: 'گزارش کامل', href: routes.org.reports }}>
          {!x?.activity.length ? (
            extra.isLoading ? <span className="mute" style={{ fontSize: 12.5 }}>در حال دریافت…</span> : <Empty icon={I.inbox} title="فعالیتی ثبت نشده است" />
          ) : (
            <List>
              {x.activity.map((g) => (
                <ListRow key={g.id} lead={<Tile d={ACT_ICON[g.kind].d} tone={ACT_ICON[g.kind].tone} />} title={g.title} sub={<span className="num">{g.meta}</span>}
                  trail={<span className="num mute" style={{ fontSize: 12 }}>{jDate(g.at)} · {time(g.at)}</span>} />
              ))}
            </List>
          )}
        </Card>
      )}

      <Confirm
        open={confirmSuspend} onClose={() => setConfirmSuspend(false)} danger busy={update.isPending}
        title={`تعلیق حساب ${emp.fullName}؟`} confirmLabel="تعلیق حساب"
        onConfirm={() => { setConfirmSuspend(false); setStatus('inactive'); }}
        body={<SuspendNotice />}
      />
    </>
  );
}
