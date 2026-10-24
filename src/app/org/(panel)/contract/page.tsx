'use client';
/**
 * Organization — contract settings (read-mostly). Kit settings page: heading (contract, status, validity and
 * «درخواست تغییر قرارداد») → settings groups: contract · credit limits · allowed lock policies | allowed funds ·
 * approval chain (editable, saved through the action bar) · panel users (invite dialog).
 * Read-only values sit as plain text in the control slot; limits change only through the operator.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  ActionBar, Ava, Chips, Dialog, ErrorBlock, Field, Note, PageHeading, Pill, SettingRow, SettingsGroup, SkeletonCard,
  SkeletonRows, Switch, Tile, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { useOrgContract, useUpdateContract } from '@/api/org';
import { useFunds } from '@/api/app';
import { useApprovalChain, useUpdateApprovalChain } from '@/api/org-packages-extra';
import { routes } from '@/lib/routes';
import { faDigits, jDate } from '@/lib/format';
import type { Organization } from '@/types/domain';
import { I } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';

const FUND_COLOR: Record<string, string> = { gold: '--warning-main', fixed: '--chart-3', equity: '--chart-1', mixed: '--chart-2', energy: '--chart-5' };
const COLLATERAL: Record<string, string> = { gold: 'قابل وثیقه تا ۷۰٪', fixed: 'قابل وثیقه تا ۹۰٪' };
const LOCK_RULES: Record<'none' | 'vesting' | 'milestone', string> = {
  none: 'برای مزایا، عیدی و بسته‌های نقدی',
  vesting: 'حداکثر ۱۲ ماه · پیش‌فرض ۳ ماه · فقط بخش صندوقی',
  milestone: 'حداکثر ۸ مرحله · هر مرحله حداقل ۵٪ · جمع ۱۰۰٪',
};
const ROLES: { key: string; label: string; pick: string }[] = [
  { key: 'hr', label: 'کارشناس HR', pick: 'منابع انسانی' },
  { key: 'fin', label: 'مدیر مالی', pick: 'مدیر مالی' },
  { key: 'view', label: 'مشاهده‌گر', pick: 'مشاهده‌گر' },
];
const roleTone = (role: string): Tone => (role.includes('مالی') ? 'success' : role.includes('مدیر') ? 'primary' : role.includes('مشاهده') ? 'neutral' : 'info');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRUMBS = [{ label: 'مدیریت' }];

/** Group title with a small category tile (same pattern as the operator rules page). */
const groupTitle = (d: string, tone: Tone, label: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={d} tone={tone} size="sm" />{label}</span>;
/** Read-only value in the control slot of a settings row. */
const val = (v: ReactNode) => <span className="num" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{v}</span>;

/** Settings row with a leading mark (fund dot, avatar) — the kit SettingRow has no lead slot. */
function LeadRow({ lead, label, desc, dim, children }: { lead: ReactNode; label: ReactNode; desc?: ReactNode; dim?: boolean; children?: ReactNode }) {
  return (
    <div className="nm-set-row" style={dim ? { opacity: 0.6 } : undefined}>
      {lead}
      <div className="l"><b>{label}</b>{desc != null && <small>{desc}</small>}</div>
      {children != null && <div className="c">{children}</div>}
    </div>
  );
}

export default function OrgContractPage() {
  const toast = useToast();
  const { data: o, isLoading, isError, error, refetch } = useOrgContract();
  const { data: funds } = useFunds();
  const { data: chain } = useApprovalChain();
  const updateChain = useUpdateApprovalChain();
  const updateContract = useUpdateContract();
  const [chainOn, setChainOn] = useState<Record<string, boolean>>({});
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('hr');
  const [inviteErr, setInviteErr] = useState<{ field: 'name' | 'email' | 'form'; msg: string } | null>(null);

  useEffect(() => {
    if (chain) setChainOn(Object.fromEntries(chain.items.map((c) => [c.id, c.enabled])));
  }, [chain]);

  if (isError) return <><PageHeading title="تنظیمات قرارداد" crumbs={CRUMBS} /><ErrorBlock error={error} message={errMsg(error)} onRetry={() => refetch()} /></>;
  if (isLoading || !o) {
    return (
      <>
        <PageHeading title="تنظیمات قرارداد" crumbs={CRUMBS} />
        <div className="nm-grid c2">
          <div className="nm-stack"><SkeletonCard h={250} /><SkeletonCard h={250} /></div>
          <div className="nm-stack"><SkeletonCard h={300} /><SkeletonCard h={250} /></div>
        </div>
      </>
    );
  }

  const s = o.settings;
  const changed = chain ? chain.items.filter((c) => !!chainOn[c.id] !== c.enabled).length : 0;
  const fundRows = (funds ?? [])
    .filter((f) => s.allowedFunds.includes(f.id) || f.status === 'coming_soon')
    .sort((a, b) => Number(s.allowedFunds.includes(b.id)) - Number(s.allowedFunds.includes(a.id)))
    .slice(0, 6);
  const status: [string, Tone] = o.status === 'active' ? ['فعال', 'success'] : o.status === 'onboarding' ? ['در حال راه‌اندازی', 'warning'] : ['تعلیق', 'warning'];

  const saveChain = () => updateChain.mutate(chainOn, { onSuccess: () => toast('تنظیمات زنجیره تأیید ذخیره شد'), onError: (e) => toast(errMsg(e), 'error') });
  const resetChain = () => { if (chain) setChainOn(Object.fromEntries(chain.items.map((c) => [c.id, c.enabled]))); };
  // steps required by the contract are shown as disabled switches with a «الزامی» pill
  const toggleChain = (id: string) => setChainOn((c) => ({ ...c, [id]: !c[id] }));

  const openInvite = () => { setName(''); setEmail(''); setRole('hr'); setInviteErr(null); setInvite(true); };
  const sendInvite = () => {
    if (updateContract.isPending) return;
    if (name.trim().length < 3) { setInviteErr({ field: 'name', msg: 'نام و نام خانوادگی را وارد کنید.' }); return; }
    if (!EMAIL_RE.test(email.trim())) { setInviteErr({ field: 'email', msg: 'ایمیل سازمانی معتبر وارد کنید.' }); return; }
    if (o.admins.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) { setInviteErr({ field: 'email', msg: 'این ایمیل قبلاً به پنل اضافه شده است.' }); return; }
    const r = ROLES.find((x) => x.key === role)!;
    const admins: Organization['admins'] = [...o.admins, { id: 'oa-' + Date.now().toString(36), name: name.trim(), role: r.label, email: email.trim() }];
    updateContract.mutate({ admins }, {
      onSuccess: () => { setInvite(false); toast(`دعوت‌نامه برای ${name.trim()} ارسال شد`); },
      onError: (e) => setInviteErr({ field: 'form', msg: errMsg(e) }),
    });
  };
  const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') sendInvite(); };

  return (
    <>
      <PageHeading
        title="تنظیمات قرارداد" crumbs={CRUMBS}
        sub={<>قرارداد همکاری {o.name} · <span className="ltr">{o.contractNo}</span> · اعتبار تا <span className="num">{jDate(o.contractEnd)}</span> · تمدید خودکار</>}
        pills={<Pill tone={status[1]} dot>{status[0]}</Pill>}
      >
        <Link href={routes.org.requests} className="nm-btn ghost"><Icon d={I.contract} size={17} />درخواست تغییر قرارداد</Link>
      </PageHeading>

      <div className="nm-grid c2">
        <div className="nm-stack">
          <SettingsGroup
            title={groupTitle(I.contract, 'neutral', 'قرارداد')} action={<Pill>فقط‌خواندنی</Pill>}
            footer={<>آخرین تغییر <span className="num">{jDate(chain?.updatedAt ?? o.contractStart)}</span> · توسط بهره‌بردار</>}
          >
            <SettingRow label="شماره قرارداد">{val(<span className="ltr">{o.contractNo}</span>)}</SettingRow>
            <SettingRow label="تاریخ شروع">{val(jDate(o.contractStart))}</SettingRow>
            <SettingRow label="پایان اعتبار">{val(jDate(o.contractEnd))}</SettingRow>
            <SettingRow label="تمدید">{val('خودکار · سالانه')}</SettingRow>
          </SettingsGroup>

          <SettingsGroup title={groupTitle(I.percent, 'success', 'محدودیت‌های تسهیلات')}>
            <SettingRow label="سقف وام">{val(s.loanEnabled ? `${faDigits(s.loanMaxPct)}٪ دارایی` : 'غیرفعال')}</SettingRow>
            <SettingRow label="دوره‌های بازپرداخت">{val(s.loanEnabled ? `${s.loanMonthsOptions.map((m) => faDigits(m)).join(' / ')} ماه` : '—')}</SettingRow>
            <SettingRow label="اعتبار کارت">{val(s.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال')}</SettingRow>
            <SettingRow label="برداشت نقدی بسته‌ها">{val(s.cashWithdrawalAllowed ? 'مجاز · فقط بخش آزاد' : 'غیرمجاز')}</SettingRow>
          </SettingsGroup>

          <SettingsGroup title={groupTitle(I.lock, 'info', 'سیاست‌های قفل مجاز')} footer="از قرارداد بهره‌بردار · هنگام ارسال بسته قابل انتخاب">
            {(['none', 'vesting', 'milestone'] as const).map((k) => {
              const on = s.lockPolicies.includes(k);
              return (
                <SettingRow key={k} label={<LockTypeChip type={k} long />} desc={LOCK_RULES[k]}>
                  <Pill tone={on ? 'success' : 'neutral'}>{on ? 'مجاز' : 'غیرمجاز'}</Pill>
                </SettingRow>
              );
            })}
          </SettingsGroup>

          <Note tone="mute">قفل وثیقه، اقساطی و مسدودی قانونی را نمادنو اعمال می‌کند. سقف‌ها و سیاست‌های قرارداد فقط از طریق بهره‌بردار و با «درخواست تغییر قرارداد» تغییر می‌کنند.</Note>
        </div>

        <div className="nm-stack">
          <SettingsGroup title={groupTitle(I.coin, 'warning', 'صندوق‌های مجاز')} footer="کارکنان فقط می‌توانند بین این صندوق‌ها تخصیص دهند.">
            {!funds ? <SkeletonRows n={3} /> : fundRows.length ? fundRows.map((f) => {
              const allowed = s.allowedFunds.includes(f.id);
              const soon = f.status === 'coming_soon';
              return (
                <LeadRow
                  key={f.id} dim={!allowed}
                  lead={<i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: `var(${FUND_COLOR[f.kind] ?? '--chart-5'})`, flex: 'none' }} />}
                  label={f.name}
                  desc={<>نماد <span className="num">{f.symbol}</span> · {soon ? 'در انتظار راه‌اندازی بهره‌بردار' : COLLATERAL[f.id] ?? 'قابل وثیقه طبق قواعد بهره‌بردار'} · {allowed ? 'قفل زمانی پیش‌فرض ۳ ماه' : 'در قرارداد فعلی تعریف نشده'}</>}
                >
                  <Pill tone={allowed ? 'success' : soon ? 'info' : 'neutral'}>{allowed ? 'مجاز' : soon ? 'به‌زودی' : 'غیرمجاز'}</Pill>
                </LeadRow>
              );
            }) : <SettingRow label="صندوقی در قرارداد تعریف نشده است" />}
          </SettingsGroup>

          <SettingsGroup title={groupTitle(I.shield, 'primary', 'زنجیره تأیید')} footer="مرحله «تأیید مدیر مالی» طبق قرارداد الزامی است و قابل غیرفعال‌سازی نیست.">
            {!chain ? <SkeletonRows n={4} /> : chain.items.map((c) => (
              <SettingRow key={c.id} label={c.label} desc={c.desc}>
                {c.locked && <Pill icon={I.lock}>الزامی</Pill>}
                <Switch on={!!chainOn[c.id]} disabled={c.locked} label={c.label} onChange={() => toggleChain(c.id)} />
              </SettingRow>
            ))}
          </SettingsGroup>

          <SettingsGroup
            title={groupTitle(I.users, 'secondary', 'کاربران پنل')}
            action={<button type="button" className="nm-btn sm ghost" onClick={openInvite}><Icon d={I.plus} size={15} strokeWidth={2} />افزودن کاربر</button>}
            footer="«مدیر مالی» تأییدکنندهٔ نهایی بسته‌ها است و قابل حذف نیست."
          >
            {o.admins.map((u) => (
              <LeadRow key={u.id} lead={<Ava letter={u.name[0]} id={u.id} />} label={u.name} desc={<span className="ltr" style={{ display: 'block', textAlign: 'right' }}>{u.email}</span>}>
                <Pill tone={roleTone(u.role)}>{u.role}</Pill>
              </LeadRow>
            ))}
          </SettingsGroup>
        </div>
      </div>

      {changed > 0 && (
        <ActionBar actions={(
          <>
            <button type="button" className="nm-btn ghost" onClick={resetChain} disabled={updateChain.isPending}>لغو تغییرات</button>
            <button type="button" className="nm-btn" onClick={saveChain} disabled={updateChain.isPending}><Icon d={I.check} size={16} strokeWidth={2.2} />{updateChain.isPending ? 'در حال ذخیره…' : 'ذخیره زنجیره تأیید'}</button>
          </>
        )}>
          <Pill tone="warning" dot>{faDigits(changed)} تغییر ذخیره‌نشده در زنجیره تأیید</Pill>
        </ActionBar>
      )}

      <Dialog
        open={invite} onClose={() => setInvite(false)} title="افزودن کاربر به پنل سازمان"
        sub="لینک فعال‌سازی به ایمیل سازمانی کاربر ارسال می‌شود و ۴۸ ساعت اعتبار دارد."
        footer={(
          <>
            <button type="button" className="nm-btn ghost" onClick={() => setInvite(false)}>انصراف</button>
            <button type="button" className="nm-btn" onClick={sendInvite} disabled={updateContract.isPending}>{updateContract.isPending ? 'در حال ارسال…' : 'ارسال دعوت'}</button>
          </>
        )}
      >
        <div className="nm-grid c2" style={{ gap: 12 }}>
          <Field label="نام و نام خانوادگی" htmlFor="inv-name" error={inviteErr?.field === 'name' ? inviteErr.msg : undefined}>
            <span className={inviteErr?.field === 'name' ? 'nm-in err' : 'nm-in'} style={{ width: '100%' }}>
              <input id="inv-name" type="text" value={name} autoFocus placeholder="مینا راد" aria-label="نام و نام خانوادگی" onKeyDown={onEnter}
                onChange={(e) => { setName(e.target.value); setInviteErr(null); }} />
            </span>
          </Field>
          <Field label="ایمیل سازمانی" htmlFor="inv-email" error={inviteErr?.field === 'email' ? inviteErr.msg : undefined}>
            <span className={inviteErr?.field === 'email' ? 'nm-in err' : 'nm-in'} style={{ width: '100%' }}>
              <input id="inv-email" type="email" dir="ltr" value={email} placeholder="name@company.ir" aria-label="ایمیل" style={{ textAlign: 'right' }} onKeyDown={onEnter}
                onChange={(e) => { setEmail(e.target.value); setInviteErr(null); }} />
            </span>
          </Field>
        </div>
        <Field label="نقش">
          <Chips label="نقش" value={role} onChange={setRole} options={ROLES.map((r) => ({ key: r.key, label: r.pick }))} />
        </Field>
        {inviteErr?.field === 'form' && <Note tone="err">{inviteErr.msg}</Note>}
      </Dialog>
    </>
  );
}
