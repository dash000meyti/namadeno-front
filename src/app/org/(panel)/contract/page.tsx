'use client';
/** Design: org-contract.dc.html — contract facts, limits, allowed funds & lock policies, approval chain and panel users. */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { useOrgContract, useUpdateContract } from '@/api/org';
import { useFunds } from '@/api/app';
import { useApprovalChain, useUpdateApprovalChain } from '@/api/org-packages-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate } from '@/lib/format';
import type { Organization } from '@/types/domain';
import { AV, I, lockChip, soft, type Tone } from '@/components/org/packages/meta';
import { CardError, CardSkeleton, Dialog, Switch, errMsg, useFlash, useOrgCrumb } from '@/components/org/packages/ui';

const FUND_COLOR: Record<string, string> = { gold: '--warning-main', fixed: '--chart-3', equity: '--chart-1', mixed: '--chart-2', energy: '--chart-5' };
const COLLATERAL: Record<string, string> = { gold: 'قابل وثیقه تا ۷۰٪', fixed: 'قابل وثیقه تا ۹۰٪' };
const LOCK_RULES: Record<'none' | 'vesting' | 'milestone', string> = {
  none: 'برای مزایا، عیدی و بسته‌های نقدی',
  vesting: 'حداکثر ۱۲ ماه · پیش‌فرض ۳ ماه · فقط بخش صندوقی',
  milestone: 'حداکثر ۸ مرحله · هر مرحله حداقل ۵٪ · جمع ۱۰۰٪',
};
const ROLES: { key: string; label: string; tone: Tone }[] = [
  { key: 'hr', label: 'کارشناس HR', tone: 'info' },
  { key: 'fin', label: 'مدیر مالی', tone: 'success' },
  { key: 'view', label: 'مشاهده‌گر', tone: 'warning' },
];
const roleTone = (role: string): Tone => (role.includes('مالی') ? 'success' : role.includes('مدیر') ? 'primary' : role.includes('مشاهده') ? 'warning' : 'info');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function OrgContractPage() {
  const orgCrumb = useOrgCrumb();
  const { data: o, isLoading, isError, refetch } = useOrgContract();
  const { data: funds } = useFunds();
  const { data: chain } = useApprovalChain();
  const updateChain = useUpdateApprovalChain();
  const updateContract = useUpdateContract();
  const { flash, toast } = useFlash();
  const [chainOn, setChainOn] = useState<Record<string, boolean>>({});
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('hr');
  const [inviteErr, setInviteErr] = useState('');

  useEffect(() => {
    if (chain) setChainOn(Object.fromEntries(chain.items.map((c) => [c.id, c.enabled])));
  }, [chain]);

  if (isError) return (<><PageHeading title="تنظیمات قرارداد" crumbs={[orgCrumb, { label: 'تنظیمات قرارداد' }]} /><CardError onRetry={() => refetch()} /></>);
  if (isLoading || !o) {
    return (
      <>
        <PageHeading title="تنظیمات قرارداد" crumbs={[orgCrumb, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'تنظیمات قرارداد' }]} />
        <div style={{ display: 'flex', gap: 20 }}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}><CardSkeleton h={120} /><CardSkeleton h={96} /><CardSkeleton h={180} /></div><CardSkeleton h={420} style={{ width: 380, flex: 'none' }} /></div>
      </>
    );
  }

  const s = o.settings;
  const dirty = !!chain && chain.items.some((c) => !!chainOn[c.id] !== c.enabled);
  const facts = [
    { label: 'شماره قرارداد', value: o.contractNo, ltr: true },
    { label: 'تاریخ شروع', value: jDate(o.contractStart) },
    { label: 'پایان اعتبار', value: jDate(o.contractEnd) },
    { label: 'تمدید', value: 'خودکار · سالانه' },
  ];
  const tiles = [
    { label: 'سقف وام', value: s.loanEnabled ? `${faDigits(s.loanMaxPct)}٪ دارایی` : 'غیرفعال', d: I.percent, tone: 'primary' as Tone },
    { label: 'بازپرداخت', value: s.loanEnabled ? s.loanMonthsOptions.map((m) => faDigits(m)).join(' / ') + ' ماه' : '—', d: I.calendar, tone: 'info' as Tone },
    { label: 'اعتبار کارت', value: s.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال', d: I.credit, tone: 'success' as Tone },
    { label: 'برداشت نقدی بسته‌ها', value: s.cashWithdrawalAllowed ? 'مجاز · فقط بخش آزاد' : 'غیرمجاز', d: I.wallet, tone: 'warning' as Tone },
  ];
  const fundCards = (funds ?? [])
    .filter((f) => s.allowedFunds.includes(f.id) || f.status === 'coming_soon')
    .sort((a, b) => Number(s.allowedFunds.includes(b.id)) - Number(s.allowedFunds.includes(a.id)))
    .slice(0, 6);

  const saveChain = () => updateChain.mutate(chainOn, { onSuccess: () => flash('تنظیمات زنجیره تأیید ذخیره شد'), onError: (e) => flash(errMsg(e), 'error') });
  const toggleChain = (id: string, locked: boolean) => {
    if (locked) { flash('این مرحله طبق قرارداد الزامی است', 'error'); return; }
    setChainOn((c) => ({ ...c, [id]: !c[id] }));
  };
  const openInvite = () => { setName(''); setEmail(''); setRole('hr'); setInviteErr(''); setInvite(true); };
  const sendInvite = () => {
    if (name.trim().length < 3) { setInviteErr('نام و نام خانوادگی را وارد کنید.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setInviteErr('ایمیل سازمانی معتبر وارد کنید.'); return; }
    if (o.admins.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) { setInviteErr('این ایمیل قبلاً به پنل اضافه شده است.'); return; }
    const r = ROLES.find((x) => x.key === role)!;
    const admins: Organization['admins'] = [...o.admins, { id: 'oa-' + Date.now().toString(36), name: name.trim(), role: r.label, email: email.trim() }];
    updateContract.mutate({ admins }, {
      onSuccess: () => { setInvite(false); flash(`دعوت‌نامه برای ${name.trim()} ارسال شد`); },
      onError: (e) => setInviteErr(errMsg(e)),
    });
  };

  return (
    <>
      <PageHeading title="تنظیمات قرارداد" crumbs={[orgCrumb, { label: 'منابع انسانی', href: routes.org.dashboard }, { label: 'تنظیمات قرارداد' }]}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>آخرین تغییر: <span className="num">{jDate(chain?.updatedAt ?? o.contractStart)}</span> · توسط بهره‌بردار</span>
        <Link href={routes.org.requests} className="btn" style={{ border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', textDecoration: 'none' }}><Icon d={I.contract} size={18} />درخواست تغییر قرارداد</Link>
      </PageHeading>

      <div style={{ flex: '1 0 auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Right column: contract + limits + funds */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ minHeight: 120, flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <span style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--brand-gradient)', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={I.contract} size={26} strokeWidth={1.6} /></span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.2 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>قرارداد همکاری {o.name}</span>
                <span className="lbl" style={{ background: o.status === 'active' ? 'var(--soft-success)' : 'var(--soft-warning)', color: o.status === 'active' ? 'var(--success-text)' : 'var(--warning-text)' }}>{o.status === 'active' ? 'فعال' : o.status === 'onboarding' ? 'در حال راه‌اندازی' : 'تعلیق'}</span>
                <span className="lbl" style={{ background: 'var(--soft-default)', color: 'var(--default-text)' }}>فقط‌خواندنی</span>
              </span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {facts.map((f) => (
                  <span key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.25, paddingLeft: 16, borderLeft: '1px solid var(--divider)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f.label}</span>
                    <span className="num" dir={f.ltr ? 'ltr' : 'rtl'} style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'right' }}>{f.value}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            {tiles.map((k) => {
              const t = soft(k.tone);
              return (
                <div key={k.label} className="card" style={{ minHeight: 96, boxSizing: 'border-box', padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={k.d} size={16} /></span><span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.label}</span></span>
                  <span className="num cell" style={{ fontSize: 16, fontWeight: 500 }}>{k.value}</span>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>صندوق‌های مجاز برای بسته‌ها</h6>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>کارکنان فقط می‌توانند بین این صندوق‌ها تخصیص دهند</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {fundCards.map((f) => {
                const allowed = s.allowedFunds.includes(f.id);
                const soon = f.status === 'coming_soon';
                return (
                  <div key={f.id} style={{ boxSizing: 'border-box', padding: 12, borderRadius: 12, border: '1px solid var(--divider)', background: allowed ? 'transparent' : 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, opacity: allowed ? 1 : 0.7 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(${FUND_COLOR[f.kind] ?? '--chart-5'})`, flex: 'none' }} />
                      <span className="cell" style={{ fontSize: 13, fontWeight: 700 }}>{f.name}</span>
                      <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: allowed ? 'var(--soft-success)' : 'var(--soft-default)', color: allowed ? 'var(--success-text)' : 'var(--default-text)' }}>{allowed ? 'مجاز' : soon ? 'به‌زودی' : 'غیرمجاز'}</span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>نماد <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{f.symbol}</span> · {soon ? 'در انتظار راه‌اندازی بهره‌بردار' : COLLATERAL[f.id] ?? 'قابل وثیقه طبق قواعد بهره‌بردار'}</span>
                    <span style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}><Icon d={I.lock} size={14} /><span className="cell">{allowed ? 'قفل زمانی پیش‌فرض ۳ ماه' : 'در قرارداد فعلی تعریف نشده'}</span></span>
                  </div>
                );
              })}
              {!funds && [0, 1, 2].map((i) => <CardSkeleton key={i} h={96} />)}
            </div>
          </div>

          <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' }}>سیاست‌های قفل مجاز</h6>
              <span className="cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>از قرارداد بهره‌بردار · هنگام ارسال بسته قابل انتخاب</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(['none', 'vesting', 'milestone'] as const).map((k) => {
                const c = lockChip(k);
                const on = s.lockPolicies.includes(k);
                return (
                  <div key={k} style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, opacity: on ? 1 : 0.6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="lktype" style={{ background: c.bg, color: c.fg }}><Icon d={c.d} size={12} />{c.label}</span>
                      <span className="lbl" style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11, background: on ? 'var(--soft-success)' : 'var(--soft-default)', color: on ? 'var(--success-text)' : 'var(--default-text)' }}>{on ? 'مجاز' : 'غیرمجاز'}</span>
                    </span>
                    <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{LOCK_RULES[k]}</span>
                  </div>
                );
              })}
            </div>
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}><Icon d={I.info} size={14} style={{ marginTop: 2, flex: 'none' }} /><span>قفل وثیقه، اقساطی و مسدودی قانونی را نمادنو اعمال می‌کند. تغییر سیاست‌ها و سقف‌ها فقط با «درخواست تغییر قرارداد».</span></span>
          </div>
        </div>

        {/* Left column: approval chain + panel users */}
        <div style={{ width: 380, flex: 'none', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ flex: 'none', boxSizing: 'border-box', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>زنجیره تأیید</h6>
              <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-primary)', color: 'var(--primary-text)' }}>قابل ویرایش</span>
              {dirty && <button className="btn" onClick={saveChain} disabled={updateChain.isPending} style={{ marginRight: 'auto', height: 28, padding: '0 10px', fontSize: 12, background: 'var(--primary-main)', color: 'var(--primary-contrast)' }}>{updateChain.isPending ? '…' : 'ذخیره'}</button>}
            </div>
            {(chain?.items ?? []).map((c) => (
              <div key={c.id} style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px dashed var(--divider)' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}><span className="cell" style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</span><span className="cell" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.desc}</span></span>
                <Switch on={!!chainOn[c.id]} locked={c.locked} label={c.label} onToggle={() => toggleChain(c.id, c.locked)} />
              </div>
            ))}
            {!chain && [0, 1, 2, 3].map((i) => <div key={i} style={{ height: 44, borderBottom: '1px dashed var(--divider)', opacity: 0.5 }} />)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}><Icon d={I.shield} size={14} /><span>مرحله «تأیید مدیر مالی» طبق قرارداد الزامی است و قابل غیرفعال‌سازی نیست.</span></div>
          </div>

          <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 44, flex: 'none', boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--divider)' }}>
              <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>کاربران پنل</h6>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{faDigits(o.admins.length)} کاربر</span>
              <button className="btn" onClick={openInvite} style={{ marginRight: 'auto', height: 30, padding: '0 10px', fontSize: 12, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)' }}><Icon d={I.plus} size={15} strokeWidth={2} />افزودن کاربر</button>
            </div>
            {o.admins.map((u, i) => {
              const t = soft(roleTone(u.role));
              const av = AV[i % AV.length];
              return (
                <div key={u.id} style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: av[0], color: av[1], display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{u.name[0]}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span className="cell" style={{ fontWeight: 600 }}>{u.name}</span><span className="cell" dir="ltr" style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>{u.email}</span></span>
                  <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: t.bg, color: t.fg }}>{u.role}</span>
                </div>
              );
            })}
            <div style={{ minHeight: 36, flex: 'none', boxSizing: 'border-box', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}><Icon d={I.info} size={14} />«مدیر مالی» تأییدکنندهٔ نهایی بسته‌ها است و قابل حذف نیست.</div>
          </div>
        </div>
      </div>

      {invite && (
        <Dialog title="افزودن کاربر به پنل سازمان" onClose={() => setInvite(false)}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>لینک فعال‌سازی به ایمیل سازمانی کاربر ارسال می‌شود و ۴۸ ساعت اعتبار دارد.</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="flbl">نام و نام خانوادگی</span><span className="fld"><input type="text" value={name} onChange={(e) => { setName(e.target.value); setInviteErr(''); }} placeholder="مینا راد" aria-label="نام و نام خانوادگی" autoFocus /></span></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="flbl">ایمیل سازمانی</span><span className="fld"><Icon d={I.mail} size={18} style={{ color: 'var(--text-secondary)' }} /><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setInviteErr(''); }} placeholder="name@company.ir" aria-label="ایمیل" dir="ltr" style={{ textAlign: 'right' }} /></span></label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span className="flbl">نقش</span>
            <div role="radiogroup" aria-label="نقش" style={{ height: 40, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 4, boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-neutral)' }}>
              {ROLES.map((r) => {
                const on = role === r.key;
                return <button key={r.key} role="radio" aria-checked={on} onClick={() => setRole(r.key)} style={{ border: 0, borderRadius: 6, background: on ? 'var(--bg-paper)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: on ? 'var(--shadow-z1)' : 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{r.key === 'hr' ? 'منابع انسانی' : r.label}</button>;
              })}
            </div>
          </div>
          {inviteErr && <span role="alert" style={{ fontSize: 12, color: 'var(--error-text)' }}>{inviteErr}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
            <button className="btn" onClick={sendInvite} disabled={updateContract.isPending} style={{ background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)' }}>{updateContract.isPending ? 'در حال ارسال…' : 'ارسال دعوت'}</button>
            <button className="btn" onClick={() => setInvite(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>انصراف</button>
          </div>
        </Dialog>
      )}
      {toast}
    </>
  );
}
