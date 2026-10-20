'use client';
/** Employee profile (design: org-employee) — assets with free/locked split, packages, facilities, activity. */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, Skeleton } from '@/components/app/Screen';
import { useOrgEmployee, useOrgMe, useReleaseMilestone, useUpdateEmployee } from '@/api/org';
import { useOrgPeopleEmployee, type EmpActivity } from '@/api/org-people-extra';
import type { Holding, Lock, OrgPackage } from '@/types/domain';
import { routes } from '@/lib/routes';
import { now } from '@/lib/clock';
import { faDigits, jDate, jDayMonth, jMonthYear, money, pct, relTime, signedMoney, time } from '@/lib/format';
import { usePanelToast } from '@/components/org/people/PanelToast';
import { Chip, EMP_STATUS, FreeLockBar, FreeLockLegend, I, KIND_COLOR, LockChip, MsSeg, avOf, errMsg, tone, type ToneName } from '@/components/org/people/shared';
import { useStartPackage } from '@/components/org/people/useStartPackage';
import '../page.css';

type Tab = 'assets' | 'pkgs' | 'loans' | 'log';
const LOCK_COLS = '82px minmax(0, 1fr) 104px 104px';
const PKG_COLS = '1.4fr 110px 120px 90px 110px';
const ACT_ICON: Record<EmpActivity['kind'], { d: string; t: ToneName }> = {
  milestone: { d: I.flag, t: 'primary' }, login: { d: I.shield, t: 'default' }, loan: { d: I.percent, t: 'success' },
  lock: { d: I.lock, t: 'warning' }, package: { d: I.pkg, t: 'primary' }, installment: { d: I.lock, t: 'secondary' }, card: { d: I.credit, t: 'info' },
};

function lockCond(l: Lock, msText?: string) {
  if (l.type === 'milestone') return msText ?? l.condition;
  if (l.type === 'collateral' && l.totalCount) return `${l.condition} (${faDigits(l.totalCount)} قسط، ${faDigits(l.totalCount - (l.paidCount ?? 0))} مانده)`;
  if (l.type === 'installment' && l.totalCount) return `${l.condition} · ${faDigits(l.totalCount - (l.paidCount ?? 0))} قسط مانده`;
  return l.condition;
}
const mobileFmt = (m: string) => faDigits(`${m.slice(0, 4)} ${m.slice(4, 7)} ${m.slice(7)}`);

export default function OrgEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const me = useOrgMe();
  const core = useOrgEmployee(id);
  const extra = useOrgPeopleEmployee(id);
  const update = useUpdateEmployee();
  const release = useReleaseMilestone();
  const { show, node: toast } = usePanelToast();
  const pkgStart = useStartPackage((e) => show(errMsg(e), 'error'));
  const [tab, setTab] = useState<Tab>('assets');
  const [released, setReleased] = useState<{ idx: number; amount: number } | null>(null);

  const emp = core.data?.employee;
  const x = extra.data;
  const holdings: Holding[] = core.data?.holdings ?? x?.holdings ?? [];
  const loans = core.data?.loans?.length ? core.data.loans : x?.loans ?? [];
  const packages = useMemo(() => (core.data?.packages ?? []).filter((p) => p.sentAt).sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? '')), [core.data]);
  const msPkg: OrgPackage | undefined = packages.find((p) => p.lockPolicy.type === 'milestone' && p.milestoneProgress?.length);

  if (core.isError) {
    return (
      <>
        <PageHeading title="پروفایل کارمند" crumbs={[{ label: 'کارکنان', href: routes.org.employees }, { label: 'پروفایل' }]} />
        <ErrorState message={errMsg(core.error)} onRetry={() => core.refetch()} />
      </>
    );
  }
  if (!emp) {
    return (
      <>
        <PageHeading title="پروفایل کارمند" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'کارکنان', href: routes.org.employees }, { label: '…' }]} />
        <Skeleton h={96} /><Skeleton h={40} r={8} /><Skeleton h={300} />
      </>
    );
  }

  const st = EMP_STATUS[emp.status];
  const [avBg, avFg] = avOf(emp.id);
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const lockedTotal = holdings.reduce((s, h) => s + h.locked, 0);
  const freeTotal = Math.max(0, total - lockedTotal);
  const locks = holdings.flatMap((h) => h.locks.map((l) => ({ l, h })));
  const kyc = x?.facts.kycLevel ?? 0;
  const kycChip: [string, ToneName] = kyc === 3 ? ['KYC تأیید‌شده', 'success'] : kyc ? [`KYC سطح ${faDigits(kyc)}`, 'info'] : ['KYC انجام نشده', 'default'];
  const score = x?.facts.score ?? 0;

  // milestone
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
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'assets', label: 'دارایی', count: holdings.length },
    { key: 'pkgs', label: 'بسته‌ها', count: packages.length },
    { key: 'loans', label: 'تسهیلات', count: (loan ? 1 : 0) + (card ? 1 : 0) },
    { key: 'log', label: 'فعالیت', count: x?.activity.length ?? 0 },
  ];
  const pkgSum = packages.reduce((s, p) => s + (p.recipients.find((r) => r.employeeId === emp.id)?.amount ?? 0), 0);
  const pkgPending = packages.filter((p) => p.recipients.some((r) => r.employeeId === emp.id && r.status === 'pending')).length;
  const lockHoldingsN = holdings.filter((h) => h.locked > 0).length;

  return (
    <div className="pg-emp" style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '1 0 auto' }}>
      <PageHeading title="پروفایل کارمند" crumbs={[{ label: me.data?.organization.name ?? 'سازمان', href: routes.org.dashboard }, { label: 'کارکنان', href: routes.org.employees }, { label: emp.fullName }]}>
        <button className="btn" disabled={pkgStart.pending || emp.status === 'inactive'} onClick={() => pkgStart.start([emp.id])} style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: emp.status === 'inactive' ? 0.6 : 1 }}><Icon d={I.pkg} size={18} />ارسال بسته</button>
        {emp.status !== 'inactive'
          ? <button className="btn" disabled={update.isPending} onClick={() => setStatus('inactive')} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--error-text)' }}><Icon d={I.ban} size={18} />تعلیق</button>
          : <button className="btn" disabled={update.isPending} onClick={() => setStatus('active')} style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}><Icon d={I.check} size={18} />رفع تعلیق</button>}
        <Link href={routes.org.employees} className="btn" style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0 10px', textDecoration: 'none' }}><Icon d={I.chevR} size={16} />کارکنان</Link>
      </PageHeading>

      {/* Profile header */}
      <div className="card" style={{ minHeight: 96, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 60, height: 60, borderRadius: '50%', background: avBg, color: avFg, display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 700, flex: 'none', boxShadow: '0 0 0 3px var(--bg-paper)' }}>{emp.avatarLetter}</span>
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.25 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{emp.fullName}</span>
            <Chip t={st.tone}>{st.label}</Chip>
            <Chip t={kycChip[1]}>{kycChip[0]}</Chip>
            {score > 0 && <Chip t="primary">امتیاز اعتباری {faDigits(score)}</Chip>}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>واحد {emp.department}{emp.jobTitle ? ` · ${emp.jobTitle}` : ''} · کد پرسنلی <span className="num" style={{ fontWeight: 400 }}>{faDigits(emp.employeeCode)}</span> · عضو از {jMonthYear(emp.joinedAt)}</span>
        </div>
        <div style={{ display: 'flex', gap: 20, flex: 'none' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>موبایل</span><span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{mobileFmt(emp.mobile)}</span></span>
          <span style={{ width: 1, background: 'var(--divider)' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ایمیل</span><span className="num" dir="ltr" style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{x?.email || '—'}</span></span>
          <span style={{ width: 1, background: 'var(--divider)' }} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>آخرین فعالیت</span><span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{x?.lastActiveAt ? relTime(x.lastActiveAt, now()) : 'هنوز وارد اپ نشده'}</span></span>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" style={{ height: 40, flex: 'none', display: 'flex', alignItems: 'center', gap: 4, borderBottom: '1px solid var(--divider)' }}>
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', border: 0, borderBottom: `2px solid ${on ? 'var(--primary-main)' : 'transparent'}`, background: 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t.label}<span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>{faDigits(t.count)}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: assets */}
      {tab === 'assets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!holdings.length ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
              {extra.isLoading ? 'در حال دریافت…' : emp.status === 'invited' ? 'کارمند هنوز حساب خود را فعال نکرده و دارایی ندارد.' : 'دارایی‌ای ثبت نشده است.'}
            </div>
          ) : (
            <>
              <div className="card" style={{ minHeight: 144, flex: 'none', boxSizing: 'border-box', padding: '14px 18px', display: 'flex', gap: 18 }}>
                <div style={{ width: 250, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>دارایی کل</span><span className="num" style={{ marginRight: 'auto', fontSize: 22, lineHeight: 1.1 }}>{money(total)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان</span></div>
                  <FreeLockBar free={freeTotal} locked={lockedTotal} />
                  <FreeLockLegend free={freeTotal} locked={lockedTotal} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {locks.length ? `${faDigits(locks.length)} قفل فعال در ${faDigits(lockHoldingsN)} دارایی` : 'بدون قفل فعال'} · امروز <span className="num" style={{ color: (x?.todayChange ?? 0) >= 0 ? 'var(--success-text)' : 'var(--error-text)', fontWeight: 500 }}>{signedMoney(x?.todayChange ?? 0)}</span>
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: 'minmax(56px, 1fr)', gap: 8 }}>
                  {holdings.map((h) => (
                    <div key={h.kind} style={{ boxSizing: 'border-box', padding: '6px 10px', borderRadius: 10, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: KIND_COLOR[h.kind] ?? 'var(--grey-500)', flex: 'none' }} /><span className="cell" style={{ fontSize: 12, fontWeight: 600 }}>{h.name}</span><span className="num" style={{ marginRight: 'auto', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(h.value)}</span></span>
                      <FreeLockBar free={h.free} locked={h.locked} height={4} />
                      <FreeLockLegend free={h.free} locked={h.locked} size={10} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                <div className="card" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ height: 38, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)' }}>
                    <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>قفل‌های فعال</h6>
                    <span className="num cell" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{faDigits(locks.length)} مورد · {money(lockedTotal)} تومان</span>
                  </div>
                  <div className="th" style={{ height: 26, flex: 'none', display: 'grid', gridTemplateColumns: LOCK_COLS, alignItems: 'center', gap: 8, padding: '0 16px' }}>
                    <span>نوع</span><span>عنوان · شرط آزادسازی</span><span>منبع</span><span>مبلغ قفل</span>
                  </div>
                  {!locks.length && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>همه دارایی این کارمند آزاد است.</div>}
                  {locks.map(({ l, h }) => {
                    const isMs = l.type === 'milestone';
                    const lsteps = isMs ? (l.sourceId === msPkg?.id ? steps : l.steps ?? []) : [];
                    return (
                      <div key={l.id} style={{ minHeight: 36, flex: 'none', display: 'grid', gridTemplateColumns: LOCK_COLS, alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 12, background: isMs ? 'rgb(var(--primary-main-rgb) / .05)' : undefined }}>
                        <span><LockChip type={l.type} /></span>
                        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, minWidth: 0 }}>
                          <span className="cell" style={{ fontWeight: 600 }}>{l.title}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            {isMs && !!lsteps.length && <MsSeg steps={lsteps} width={56} height={4} />}
                            <span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{lockCond(l, isMs && lsteps.length ? `${faDigits(lsteps.filter((s) => s.status === 'released').length)} از ${faDigits(lsteps.length)} مرحله · ${pct(lsteps.filter((s) => s.status === 'released').reduce((s, m) => s + m.sharePct, 0))} آزاد شده` : undefined)}</span>
                          </span>
                        </span>
                        <span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.name}</span>
                        <span className="num" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{money(l.amount)}</span>
                      </div>
                    );
                  })}
                </div>

                {msPkg && (
                  <div className="card" style={{ width: 330, flex: 'none', boxSizing: 'border-box', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h6 className="cell" style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{msPkg.title}</h6>
                      <span style={{ marginRight: 'auto' }} /><LockChip type="milestone" />
                    </div>
                    <MsSeg steps={steps} label={msProgText} />
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{msProgText} · کل {money(msTotal)} در {msHolding}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {steps.map((m) => {
                        const rel = m.status === 'released';
                        const pend = m.status === 'pending_approval';
                        return (
                          <div key={m.id} style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', boxSizing: 'border-box', background: rel ? 'var(--primary-main)' : pend ? 'transparent' : 'var(--progress-track)', boxShadow: pend ? 'inset 0 0 0 1.5px var(--warning-main)' : 'none' }} />
                            <span className="cell" style={{ flex: 1, fontWeight: pend ? 700 : 500, color: rel || pend ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.title}</span>
                            <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, whiteSpace: 'nowrap' }}>{pct(m.sharePct)}</span>
                            <span style={{ width: 66, textAlign: 'left', fontSize: 11, color: rel ? 'var(--success-text)' : pend ? 'var(--warning-text)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{rel ? 'آزاد شده' : pend ? 'در انتظار تأیید' : 'آینده'}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {released && (
                        <div role="status" style={{ minHeight: 36, borderRadius: 8, background: 'var(--soft-success)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '0 8px' }}>
                          <Icon d={I.check} size={16} strokeWidth={2.2} />مرحله {faDigits(released.idx)} تأیید شد · {money(released.amount)} آزاد شد
                        </div>
                      )}
                      {pending && (
                        <button className="btn" disabled={release.isPending} onClick={approveMs} style={{ height: 36, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', opacity: release.isPending ? 0.7 : 1 }}>
                          <Icon d={I.check} size={16} strokeWidth={2.2} />{release.isPending ? 'در حال آزادسازی…' : `تأیید انجام تعهد و آزادسازی ${pct(pending.sharePct)}`}
                        </button>
                      )}
                      <Link href={routes.org.package(msPkg.id)} style={{ height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>جزئیات قرارداد و مراحل<Icon d={I.chevL} size={14} /></Link>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: packages */}
      {tab === 'pkgs' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)' }}>
            <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>همه بسته‌های دریافتی</h6>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(packages.length)} بسته · {money(pkgSum)} تومان · {faDigits(pkgPending)} در انتظار تأیید</span>
            <button onClick={() => pkgStart.start([emp.id])} disabled={pkgStart.pending || emp.status === 'inactive'} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', color: 'var(--primary-text)', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}><Icon d={I.plus} size={14} />ارسال بسته جدید</button>
          </div>
          <div className="th" style={{ height: 32, flex: 'none', display: 'grid', gridTemplateColumns: PKG_COLS, alignItems: 'center', gap: 8, padding: '0 16px' }}>
            <span className="cell">عنوان</span><span className="cell">مبلغ</span><span className="cell">تخصیص</span><span className="cell">تاریخ</span><span className="cell">وضعیت · قفل</span>
          </div>
          {!packages.length && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>هنوز بسته‌ای برای این کارمند ارسال نشده است.</div>}
          {packages.map((p) => {
            const r = p.recipients.find((y) => y.employeeId === emp.id);
            const split = x?.packageSplits[p.id];
            const accepted = r?.status === 'accepted';
            const chip = accepted && p.lockPolicy.type !== 'none';
            const s = r?.status === 'pending' ? { label: 'در انتظار تأیید', t: 'warning' as const } : r?.status === 'expired' ? { label: 'منقضی', t: 'default' as const } : { label: 'دریافت‌شده', t: 'success' as const };
            return (
              <Link key={p.id} href={routes.org.package(p.id)} className="row-a" style={{ height: 48, flex: 'none', display: 'grid', gridTemplateColumns: PKG_COLS, alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.reason === 'welfare' ? 'var(--info-main)' : 'var(--primary-main)', flex: 'none' }} /><span className="cell" style={{ fontWeight: 600 }}>{p.title}</span></span>
                <span className="num cell" style={{ fontWeight: 500 }}>{money(r?.amount ?? p.amountPerPerson)} تومان</span>
                <span style={{ display: 'flex', alignItems: 'center' }} title={split ? `طلا ${pct(split.gold)} · درآمد ثابت ${pct(split.fixed)} · ریال ${pct(split.rial ?? 0)}` : 'تخصیص هنوز انجام نشده'}>
                  <span dir="ltr" style={{ display: 'flex', width: 72, height: 6, borderRadius: 3, overflow: 'hidden', gap: 1, background: split ? undefined : 'var(--progress-track)' }}>
                    {split && <><span style={{ width: `${split.gold}%`, background: 'var(--warning-main)' }} /><span style={{ width: `${split.fixed}%`, background: 'var(--chart-3)' }} /><span style={{ width: `${split.rial ?? 0}%`, background: 'var(--chart-4)' }} /></>}
                  </span>
                </span>
                <span className="num cell" style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>{jDate(p.sentAt!)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>{chip ? <LockChip type={p.lockPolicy.type} /> : <Chip t={s.t} style={{ padding: '0 6px' }}>{s.label}</Chip>}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* TAB: facilities */}
      {tab === 'loans' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
          <div className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loan ? (() => {
              const paid = loan.installments.filter((i) => i.status === 'paid').length;
              const unpaid = loan.installments.filter((i) => i.status !== 'paid');
              const overdue = unpaid.filter((i) => i.status === 'overdue').length;
              const next = unpaid[0];
              const remaining = unpaid.reduce((s, i) => s + i.amount, 0);
              const colHolding = holdings.find((h) => h.kind === loan.collateral.holdingKind)?.name ?? loan.collateral.holdingKind;
              const rows = [
                { label: 'قسط ماهانه', value: `${money(loan.monthlyPayment)} تومان`, c: 'var(--text-primary)' },
                { label: 'پرداخت‌شده', value: `${faDigits(paid)} از ${faDigits(loan.months)} قسط`, c: 'var(--text-primary)' },
                { label: 'قسط بعدی', value: next ? jDayMonth(next.dueDate, true) : '—', c: overdue ? 'var(--error-text)' : 'var(--warning-text)' },
                { label: 'مانده بدهی', value: `${money(remaining)} تومان`, c: 'var(--text-primary)' },
              ];
              return (
                <>
                  <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>وام فعال</h6><Chip t={overdue ? 'error' : 'success'} style={{ height: 20 }}>{overdue ? `${faDigits(overdue)} قسط معوق` : 'به‌موقع'}</Chip><Link href={routes.org.credit} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>فهرست تسهیلات</Link></div>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{money(loan.principal)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان · {faDigits(loan.months)} ماهه · نرخ {pct(loan.ratePct)}</span></span>
                  <span dir="ltr" style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.round((paid / loan.months) * 100)}%`, height: '100%', borderRadius: 4, background: 'var(--primary-main)' }} /></span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
                    {rows.map((l) => <span key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.label}</span><span className="num" style={{ fontWeight: 500, color: l.c }}>{l.value}</span></span>)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5 }}>
                    <Icon d={I.lock} size={18} style={{ marginTop: 1 }} />
                    <span>وثیقه اعتبار و وام: {money(loan.collateral.amount)} تومان از {colHolding} قفل است · آزاد با تسویه وام ({faDigits(unpaid.length)} قسط مانده).</span>
                  </div>
                </>
              );
            })() : (
              <>
                <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>وام فعال</h6><Chip t="default" style={{ height: 20 }}>ندارد</Chip><Link href={routes.org.credit} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>فهرست تسهیلات</Link></div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>این کارمند وام فعالی ندارد.</span>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5 }}>
                  <Icon d={I.info} size={18} style={{ marginTop: 1 }} />
                  <span>سقف وام قابل درخواست: {money(Math.round(freeTotal * 0.4))} تومان (۴۰٪ دارایی آزاد · قفل‌ها در ظرفیت وثیقه حساب نمی‌شوند).</span>
                </div>
              </>
            )}
          </div>

          <div className="card" style={{ boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {card ? (() => {
              const rialRes = locks.find(({ l }) => l.type === 'collateral' && l.holdingKind === 'rial');
              const usedPct = card.creditLimit ? Math.round((card.creditUsed / card.creditLimit) * 100) : 0;
              const rows = [
                { label: 'سقف اعتبار', value: `${money(card.creditLimit)} تومان`, c: 'var(--text-primary)' },
                { label: 'استفاده‌شده', value: `${money(card.creditUsed)} تومان`, c: 'var(--text-primary)' },
                { label: 'تسویه بعدی', value: jDayMonth(card.statementDue, true), c: 'var(--warning-text)' },
                { label: 'اقساط معوق', value: `${faDigits(card.overdue)} مورد`, c: card.overdue ? 'var(--error-text)' : 'var(--success-text)' },
              ];
              return (
                <>
                  <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>اعتبار کارت نمادنو</h6><Chip t={card.status === 'active' ? 'primary' : 'error'} style={{ height: 20 }}>{card.status === 'active' ? 'فعال' : card.status === 'frozen' ? 'مسدود موقت' : 'مسدود'}</Chip><Link href={routes.org.contract} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>قواعد قرارداد</Link></div>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="num" style={{ fontSize: 24, lineHeight: 1.1 }}>{money(card.creditLimit)}</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>تومان سقف · استفاده‌شده {money(card.creditUsed)}</span></span>
                  <span dir="ltr" style={{ display: 'block', height: 8, borderRadius: 4, background: 'var(--progress-track)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${usedPct}%`, height: '100%', borderRadius: 4, background: 'var(--success-main)' }} /></span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12 }}>
                    {rows.map((l) => <span key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{l.label}</span><span className="num" style={{ fontWeight: 500, color: l.c }}>{l.value}</span></span>)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, lineHeight: 1.5 }}>
                    <Icon d={I.info} size={18} style={{ marginTop: 1 }} />
                    <span>{rialRes ? `${money(rialRes.l.amount)} تومان از کیف پول ریالی برای تسویه صورت‌حساب رزرو و قفل است (وثیقه) · آزاد با تسویه صورت‌حساب.` : 'سقف اعتبار کارت طبق قرارداد سازمان تا ۲۵٪ دارایی آزاد کارمند تعیین می‌شود.'}</span>
                  </div>
                </>
              );
            })() : (
              <>
                <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8 }}><h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>اعتبار کارت نمادنو</h6><Chip t="default" style={{ height: 20 }}>غیرفعال</Chip><Link href={routes.org.contract} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600 }}>قواعد قرارداد</Link></div>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>کارمند هنوز کارت اعتباری نمادنو را فعال نکرده است. سقف قابل تخصیص: {money(Math.round(freeTotal * 0.25))} تومان (۲۵٪ دارایی آزاد).</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB: activity */}
      {tab === 'log' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)' }}>
            <h6 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>فعالیت اخیر</h6>
            <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(x?.activity.length ?? 0)} رویداد</span>
            <Link href={routes.org.reports} style={{ marginRight: 'auto', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>گزارش کامل<Icon d={I.chevL} size={14} /></Link>
          </div>
          {!x?.activity.length && <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{extra.isLoading ? 'در حال دریافت…' : 'فعالیتی ثبت نشده است.'}</div>}
          {x?.activity.map((g) => {
            const ic = ACT_ICON[g.kind];
            const [bg, fg] = tone(ic.t);
            return (
              <div key={g.id} style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ic.d} size={16} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span className="cell" style={{ fontWeight: 600 }}>{g.title}</span><span className="num cell" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>{g.meta}</span></span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontWeight: 400 }}>{jDate(g.at)} · {time(g.at)}</span>
              </div>
            );
          })}
        </div>
      )}
      {toast}
    </div>
  );
}
