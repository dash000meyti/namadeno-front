'use client';
/**
 * Organization — contract settings (read-mostly). Kit settings page: heading (contract, status, validity and
 * «درخواست تغییر قرارداد») → settings groups: contract · credit terms · allowed receive policies (شیوه‌های دریافت) | allowed funds ·
 * approval chain (editable, saved through the action bar) · panel users: members of the organization who sign in with their own
 * Namadno account (national ID + password); the administrator gives, changes and removes access with PanelAccessDialog.
 * Read-only values sit as plain text in the control slot; limits change only through the operator.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ActionBar, Ava, ErrorBlock, Note, PageHeading, Pill, SettingRow, SettingsGroup, SkeletonCard,
  SkeletonRows, Switch, Tile, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { useOrgContract, useOrgEmployees } from '@/api/org';
import { useFunds } from '@/api/app';
import { useApprovalChain, useUpdateApprovalChain } from '@/api/org-packages-extra';
import { useOrgPanelRole } from '@/api/org-people-extra';
import { HOURGLASS, LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';
import { faDigits, jDate, maskNationalId } from '@/lib/format';
import { FEATURES } from '@/lib/features';
import { I } from '@/components/org/packages/meta';
import { errMsg } from '@/components/org/packages/ui';
import { PanelAccessDialog } from '@/components/org/people/PanelAccessDialog';

const FUND_COLOR: Record<string, string> = { gold: '--warning-main', fixed: '--chart-3', equity: '--chart-1', mixed: '--chart-2', energy: '--chart-5' };
const COLLATERAL: Record<string, string> = { gold: 'پشتوانه‌ی وام تا ۷۰٪', fixed: 'پشتوانه‌ی وام تا ۹۰٪' };
const LOCK_RULES: Record<'none' | 'vesting' | 'milestone', string> = {
  none: 'برای مزایا، عیدی و بسته‌های نقدی',
  // the contract only allows the policy; the organization sets the date or the steps of each package
  vesting: 'تاریخ آزادسازی را هنگام ارسال هر بسته تعیین می‌کنید · فقط بخش صندوقی',
  milestone: 'مراحل و سهم هر مرحله را هنگام ارسال هر بسته تعیین می‌کنید · جمع ۱۰۰٪',
};
const roleTone = (role: string): Tone => (role === 'مدیر' ? 'primary' : role === 'تأییدکننده' ? 'success' : 'info');
/** A settings row that is a button (panel users, for the administrator). */
const ROW_BTN: CSSProperties = { width: '100%', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'right', cursor: 'pointer' };
const CRUMBS = [{ label: 'مدیریت' }];

/** Group title with a small category tile (same pattern as the operator rules page). */
const groupTitle = (d: string, tone: Tone, label: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={d} tone={tone} size="sm" />{label}</span>;
/** Read-only value in the control slot of a settings row. */
const val = (v: ReactNode) => <span className="num" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{v}</span>;

/** Settings row with a leading mark (fund dot, avatar). With `onClick` the whole row is a button (opens a dialog). */
function LeadRow({ lead, label, desc, dim, children, onClick, aria }: { lead: ReactNode; label: ReactNode; desc?: ReactNode; dim?: boolean; children?: ReactNode; onClick?: () => void; aria?: string }) {
  const inner = (
    <>
      {lead}
      <div className="l"><b>{label}</b>{desc != null && <small>{desc}</small>}</div>
      {children != null && <div className="c">{children}</div>}
    </>
  );
  if (onClick) return <button type="button" className="nm-set-row" style={ROW_BTN} onClick={onClick} aria-label={aria}>{inner}</button>;
  return <div className="nm-set-row" style={dim ? { opacity: 0.6 } : undefined}>{inner}</div>;
}

export default function OrgContractPage() {
  const toast = useToast();
  const { data: o, isLoading, isError, error, refetch } = useOrgContract();
  const { data: funds } = useFunds();
  const { data: chain } = useApprovalChain();
  const updateChain = useUpdateApprovalChain();
  const { data: employees } = useOrgEmployees();
  // only the organization's administrator gives, changes or removes panel access
  const isAdmin = useOrgPanelRole() === 'admin';
  const [chainOn, setChainOn] = useState<Record<string, boolean>>({});
  // panel access dialog: `{}` = add a member, `{ id }` = change that member's access
  const [access, setAccess] = useState<{ id?: string } | null>(null);

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

          {FEATURES.orgCredit && <SettingsGroup title={groupTitle(I.percent, 'success', 'شرایط تسهیلات')}>
            <SettingRow label="سقف وام">{val(s.loanEnabled ? `${faDigits(s.loanMaxPct)}٪ دارایی` : 'غیرفعال')}</SettingRow>
            <SettingRow label="دوره‌های بازپرداخت">{val(s.loanEnabled ? `${s.loanMonthsOptions.map((m) => faDigits(m)).join(' / ')} ماه` : '—')}</SettingRow>
            <SettingRow label="اعتبار کارت">{val(s.cardEnabled ? 'تا ۲۵٪ دارایی' : 'غیرفعال')}</SettingRow>
          </SettingsGroup>}

          <SettingsGroup title={groupTitle(HOURGLASS, 'info', 'شیوه‌های دریافت مجاز')} footer="از قرارداد بهره‌بردار · هنگام ارسال بسته قابل انتخاب">
            {(['none', 'vesting', 'milestone'] as const).map((k) => {
              const on = s.lockPolicies.includes(k);
              return (
                <SettingRow key={k} label={<LockTypeChip type={k} long />} desc={LOCK_RULES[k]}>
                  <Pill tone={on ? 'success' : 'neutral'}>{on ? 'مجاز' : 'تعریف نشده'}</Pill>
                </SettingRow>
              );
            })}
          </SettingsGroup>

          <Note tone="mute">{LOCK_META.collateral.label}، {LOCK_META.installment.label} و {LOCK_META.legal.label} را نمادنو مدیریت می‌کند. برای تغییر سقف‌ها و سیاست‌های قرارداد، «درخواست تغییر قرارداد» بفرستید تا بهره‌بردار آن را بررسی و اعمال کند.</Note>
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
                  desc={<>نماد <span className="num">{f.symbol}</span> · {soon ? 'در انتظار راه‌اندازی بهره‌بردار' : COLLATERAL[f.id] ?? 'پشتوانه‌ی وام طبق قواعد بهره‌بردار'} · {allowed ? `${LOCK_META.vesting.short} پیش‌فرض ۳ ماه` : 'در قرارداد فعلی تعریف نشده'}</>}
                >
                  <Pill tone={allowed ? 'success' : soon ? 'info' : 'neutral'}>{allowed ? 'مجاز' : soon ? 'به‌زودی' : 'غیرفعال'}</Pill>
                </LeadRow>
              );
            }) : <SettingRow label="صندوقی در قرارداد تعریف نشده است" />}
          </SettingsGroup>

          <SettingsGroup title={groupTitle(I.shield, 'primary', 'زنجیره تأیید')} footer="تأیید نهایی «تأییدکننده» طبق قرارداد الزامی است و قابل غیرفعال‌سازی نیست.">
            {!chain ? <SkeletonRows n={4} /> : chain.items.map((c) => (
              <SettingRow key={c.id} label={c.label} desc={c.desc}>
                {c.locked && <Pill icon={I.lock}>الزامی</Pill>}
                <Switch on={!!chainOn[c.id]} disabled={c.locked} label={c.label} onChange={() => toggleChain(c.id)} />
              </SettingRow>
            ))}
          </SettingsGroup>

          <SettingsGroup
            title={groupTitle(I.users, 'secondary', 'کاربران پنل')}
            action={isAdmin ? <button type="button" className="nm-btn sm ghost" onClick={() => setAccess({})}><Icon d={I.plus} size={15} strokeWidth={2} />افزودن کاربر</button> : undefined}
            footer={<>همه با حساب نمادنوی خود (کد ملی و رمز، همان حساب اپ) وارد می‌شوند.{!isAdmin && ' دسترسی‌ها را فقط مدیر سازمان تغییر می‌دهد.'}</>}
          >
            {o.admins.map((u) => {
              const unit = employees?.find((e) => e.id === u.id)?.department;
              return (
                <LeadRow
                  key={u.id} lead={<Ava letter={u.name[0]} id={u.id} />} label={u.name}
                  desc={<>{unit ? `${unit} · ` : ''}کد ملی <span className="num ltr">{maskNationalId(u.nationalId)}</span></>}
                  onClick={isAdmin ? () => setAccess({ id: u.id }) : undefined} aria={isAdmin ? `تغییر دسترسی پنل ${u.name}` : undefined}
                >
                  {u.status === 'invited' && <Pill tone="warning" dot>در انتظار فعال‌سازی</Pill>}
                  <Pill tone={roleTone(u.role)}>{u.role}</Pill>
                  {isAdmin && <Icon d={I.chevL} size={16} style={{ color: 'var(--text-disabled)' }} />}
                </LeadRow>
              );
            })}
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

      <PanelAccessDialog open={!!access} memberId={access?.id} onClose={() => setAccess(null)} />
    </>
  );
}
