'use client';
/**
 * Contract terms editor of an organization (design: op-organizations drawer).
 * Products follow the limits: loan is enabled when the loan cap > 0, card credit when the card % > 0,
 * BNPL with its switch. Saves through useUpdateOrganization (PATCH /op/organizations/:id, versioned).
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Fund, LockType, Organization } from '@/types/domain';
import { useUpdateOrganization } from '@/api/op';
import type { OrgContractExt, OrgPatch } from '@/api/op-core-extra';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { enDigits, faDigits, jDate, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { Check, ICON, LkType, NumField, Switch, ToggleChip, errMsg } from './ui';

export const CONTRACT_FUND_IDS = ['gold', 'fixed'];
export const fundDot = (id: string) => (id === 'gold' ? '--warning-main' : id === 'fixed' ? '--secondary-main' : '--grey-500');
export const fundMeta = (f: Fund) => (f.id === 'gold' ? f.symbol : f.effectiveYield ? `سود مؤثر ${faDigits(f.effectiveYield)}٪` : f.status === 'coming_soon' ? 'پیش‌نویس' : f.symbol);
/** Funds offered in contracts: gold & fixed income (package allocation) + funds coming soon. */
export const contractFunds = (funds: Fund[] | undefined) => (funds ?? []).filter((f) => CONTRACT_FUND_IDS.includes(f.id) || f.status === 'coming_soon');

interface Draft {
  loanPct: string; months: number[]; cardPct: string; perCap: string; bnpl: boolean; cash: boolean;
  vesting: boolean; vestMax: string; milestone: boolean; msMax: string; collateral: boolean; instLock: boolean; funds: string[];
}

function initial(o: Organization, e: OrgContractExt): Draft {
  return {
    loanPct: String(o.settings.loanEnabled ? o.settings.loanMaxPct : 0), months: [...o.settings.loanMonthsOptions].sort((a, b) => a - b),
    cardPct: String(o.settings.cardEnabled ? e.cardPct : 0), perCap: String(e.perPersonCap), bnpl: o.settings.installmentEnabled, cash: o.settings.cashWithdrawalAllowed,
    vesting: o.settings.lockPolicies.includes('vesting'), vestMax: String(e.vestingMaxMonths), milestone: o.settings.lockPolicies.includes('milestone'), msMax: String(e.milestoneMaxSteps),
    collateral: e.allowCollateral, instLock: e.allowInstallmentLock, funds: [...o.settings.allowedFunds],
  };
}

const num = (s: string) => {
  const v = Number(enDigits(s));
  return Number.isFinite(v) ? v : NaN;
};

export function ContractEditor({ org, ext, funds, monthsOptions, header, onHistory, onSaved }: {
  org: Organization; ext: OrgContractExt; funds: Fund[]; monthsOptions: number[];
  header?: (dirty: boolean) => ReactNode; onHistory?: () => void; onSaved?: () => void;
}) {
  const toast = useToast();
  const update = useUpdateOrganization();
  const base = useMemo(() => initial(org, ext), [org, ext]);
  const [d, setD] = useState<Draft>(base);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setError(''); };
  const options = Array.from(new Set([...monthsOptions, ...d.months])).sort((a, b) => a - b);

  const save = () => {
    const loan = num(d.loanPct), card = num(d.cardPct), cap = num(d.perCap), vest = num(d.vestMax), ms = num(d.msMax);
    let err = '';
    if (!Number.isInteger(loan) || loan < 0 || loan > 70) err = 'سقف وام باید عددی بین ۰ تا ۷۰ درصد باشد.';
    else if (!Number.isInteger(card) || card < 0 || card > 50) err = 'اعتبار کارت باید عددی بین ۰ تا ۵۰ درصد باشد.';
    else if (!(cap > 0)) err = 'سقف اعتبار هر نفر را وارد کنید.';
    else if (loan > 0 && d.months.length === 0) err = 'حداقل یک گزینه بازپرداخت انتخاب کنید.';
    else if (d.vesting && (!Number.isInteger(vest) || vest < 1 || vest > 24)) err = 'حداکثر قفل زمانی باید بین ۱ تا ۲۴ ماه باشد.';
    else if (d.milestone && (!Number.isInteger(ms) || ms < 2 || ms > 10)) err = 'حداکثر مراحل باید بین ۲ تا ۱۰ باشد.';
    else if (d.funds.filter((f) => CONTRACT_FUND_IDS.includes(f)).length === 0) err = 'حداقل یک صندوق مجاز انتخاب کنید.';
    if (err) { setError(err); return; }
    const changes: string[] = [];
    if (loan !== num(base.loanPct)) changes.push(`سقف وام ${faDigits(num(base.loanPct))} → ${faDigits(loan)}٪`);
    if (JSON.stringify(d.months) !== JSON.stringify(base.months)) changes.push('گزینه‌های بازپرداخت ' + (d.months.map((m) => faDigits(m)).join(' · ') || '—') + ' ماه');
    if (card !== num(base.cardPct)) changes.push(`اعتبار کارت ${faDigits(num(base.cardPct))} → ${faDigits(card)}٪`);
    if (cap !== num(base.perCap)) changes.push(`سقف اعتبار هر نفر ${faDigits(Math.round(num(base.perCap) / 1e6))} → ${faDigits(Math.round(cap / 1e6))} میلیون`);
    if (d.bnpl !== base.bnpl) changes.push(d.bnpl ? 'فعال‌سازی خرید اقساطی' : 'غیرفعال‌سازی خرید اقساطی');
    if (d.cash !== base.cash) changes.push(d.cash ? 'مجاز شدن برداشت نقدی' : 'غیرمجاز شدن برداشت نقدی');
    if (d.vesting !== base.vesting || d.milestone !== base.milestone || d.collateral !== base.collateral || d.instLock !== base.instLock || d.vestMax !== base.vestMax || d.msMax !== base.msMax) changes.push('تغییر سیاست‌های قفل');
    if (JSON.stringify([...d.funds].sort()) !== JSON.stringify([...base.funds].sort())) changes.push('تغییر صندوق‌های مجاز');
    const payload: OrgPatch = {
      id: org.id,
      settings: {
        ...org.settings,
        loanEnabled: loan > 0, loanMaxPct: loan, loanMonthsOptions: d.months, cardEnabled: card > 0, installmentEnabled: d.bnpl, cashWithdrawalAllowed: d.cash,
        lockPolicies: ['none', ...(d.vesting ? (['vesting'] as const) : []), ...(d.milestone ? (['milestone'] as const) : [])], allowedFunds: d.funds,
      },
      contract: { cardPct: card, perPersonCap: cap, vestingMaxMonths: vest, milestoneMaxSteps: ms, allowCollateral: d.collateral, allowInstallmentLock: d.bnpl && d.instLock },
      changeNote: changes.join('، ') || undefined,
    };
    update.mutate(payload, {
      onSuccess: () => { toast(`تغییرات قرارداد ذخیره شد · نسخه ${faDigits(ext.version + 1)}`); onSaved?.(); },
      onError: (e) => { setError(errMsg(e)); toast(errMsg(e), 'error'); },
    });
  };

  const policyRows: { t: LockType; meta: string; on: boolean; toggle?: () => void; field?: { value: string; set: (v: string) => void; suffix: string }; disabled?: boolean }[] = [
    { t: 'vesting', meta: 'تا تاریخ؛ حداکثر', on: d.vesting, toggle: () => set({ vesting: !d.vesting }), field: { value: faDigits(d.vestMax), set: (v) => set({ vestMax: enDigits(v) }), suffix: 'ماه' } },
    { t: 'milestone', meta: 'با تأیید مراحل؛ حداکثر', on: d.milestone, toggle: () => set({ milestone: !d.milestone }), field: { value: faDigits(d.msMax), set: (v) => set({ msMax: enDigits(v) }), suffix: 'مرحله' } },
    { t: 'collateral', meta: 'وثیقه وام و کارت از بخش آزاد', on: d.collateral, toggle: () => set({ collateral: !d.collateral }) },
    { t: 'installment', meta: d.bnpl ? 'هم‌زمان با خرید اقساطی' : 'نیازمند فعال بودن خرید اقساطی', on: d.bnpl && d.instLock, toggle: () => set({ instLock: !d.instLock }), disabled: !d.bnpl },
    { t: 'legal', meta: 'همیشه فعال · فقط بهره‌بردار', on: true, disabled: true },
  ];

  return (
    <>
      {header?.(dirty)}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="sec">محدودیت‌های تسهیلات</span>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor={`loan-cap-${org.id}`} style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>سقف وام (٪ دارایی آزاد)</label>
          <NumField id={`loan-cap-${org.id}`} value={faDigits(d.loanPct)} onChange={(v) => set({ loanPct: enDigits(v) })} suffix="٪" />
        </div>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>گزینه‌های بازپرداخت</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {options.map((m) => {
              const on = d.months.includes(m);
              return <ToggleChip key={m} on={on} onClick={() => set({ months: on ? d.months.filter((x) => x !== m) : [...d.months, m].sort((a, b) => a - b) })}>{faDigits(m)} ماه</ToggleChip>;
            })}
          </div>
        </div>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor={`card-cap-${org.id}`} style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>اعتبار کارت (٪ دارایی آزاد)</label>
          <NumField id={`card-cap-${org.id}`} value={faDigits(d.cardPct)} onChange={(v) => set({ cardPct: enDigits(v) })} suffix="٪" />
        </div>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label htmlFor={`per-cap-${org.id}`} style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>سقف اعتبار هر نفر</label>
          <NumField id={`per-cap-${org.id}`} value={d.perCap ? money(num(d.perCap) || 0) : ''} onChange={(v) => set({ perCap: enDigits(v).replace(/\D/g, '') })} suffix="تومان" width={96} />
        </div>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500 }}>خرید اقساطی</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>فروشگاه‌های طرف قرارداد</span></span>
          <Switch on={d.bnpl} onToggle={() => set({ bnpl: !d.bnpl })} label="خرید اقساطی" />
        </div>
        <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500 }}>برداشت نقدی</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>پیش‌فرض بسته‌های جدید</span></span>
          <Switch on={d.cash} onToggle={() => set({ cash: !d.cash })} label="برداشت نقدی" />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="sec">سیاست‌های قفل مجاز در قرارداد</span>
        {policyRows.map((p) => (
          <div key={p.t} style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Check on={p.on} onToggle={p.toggle} label={LOCK_META[p.t].label} disabled={p.disabled} dim={p.disabled} />
            <LkType type={p.t} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.meta}</span>
            {p.field && p.on && <NumField value={p.field.value} onChange={p.field.set} suffix={p.field.suffix} width={32} height={30} label={LOCK_META[p.t].label} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="sec">صندوق‌های مجاز</span>
        {contractFunds(funds).map((f) => {
          const soon = f.status === 'coming_soon';
          const on = d.funds.includes(f.id);
          return (
            <div key={f.id} style={{ height: 36, display: 'flex', alignItems: 'center', gap: 12, color: soon ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              <Check on={on} label={f.name} disabled={soon} dim={soon} onToggle={() => set({ funds: on ? d.funds.filter((x) => x !== f.id) : [...d.funds, f.id] })} />
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${fundDot(f.id)})`, flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{f.name}</span>
              {!soon && <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fundMeta(f)}</span>}
              {soon && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-default)', color: 'var(--default-text)' }}>به‌زودی</span>}
            </div>
          );
        })}
      </div>

      {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}><Icon d={ICON.alert} size={16} />{error}</div>}

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8 }}>
        <button type="button" onClick={save} disabled={update.isPending || !dirty} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 8, border: 0, background: 'var(--primary-main)', color: 'var(--primary-contrast)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: update.isPending || !dirty ? 'default' : 'pointer', boxShadow: 'var(--shadow-primary)', opacity: update.isPending || !dirty ? 0.6 : 1 }}>
          {update.isPending ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
        </button>
        {onHistory && (
          <button type="button" onClick={onHistory} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 12px', borderRadius: 8, border: 0, background: 'transparent', color: 'var(--primary-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Icon d={ICON.history} size={18} />تاریخچه نسخه‌ها
          </button>
        )}
      </div>
    </>
  );
}

/** Version history list (design: op-organizations history dialog). */
export function VersionList({ ext }: { ext: OrgContractExt }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {ext.versions.map((v, i) => (
        <div key={v.v + '-' + v.at} style={{ minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ICON.file} size={16} /></span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontWeight: 600 }}>نسخه {faDigits(v.v)}</span>{i === 0 && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-success)', color: 'var(--success-text)' }}>جاری</span>}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.note}</span>
          </span>
          <VersionMeta at={v.at} by={v.by} />
        </div>
      ))}
    </div>
  );
}

function VersionMeta({ at, by }: { at: string; by: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.35, fontSize: 12, color: 'var(--text-secondary)' }}>
      <JDate iso={at} />
      <span>{by}</span>
    </span>
  );
}

function JDate({ iso }: { iso: string }) {
  return <span className="num" dir="ltr">{jDate(iso)}</span>;
}
