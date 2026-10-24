'use client';
/**
 * Contract terms of an organization — one editor for the organizations inspector and the organization page.
 *   useContractDraft  draft + validation + save (useUpdateOrganization → PATCH /op/organizations/:id, versioned)
 *   ContractEditor    the draft as settings groups (render inside the inspector body or a page column)
 *   VersionList       contract versions, newest first
 * The host places the save action (Inspector footer or ActionBar) with `c.save`, `c.dirty`, `c.saving`.
 * Products follow the limits: loan is enabled when the loan cap > 0, card credit when the card % > 0, BNPL with its switch.
 */
import { useMemo, useState } from 'react';
import type { Fund, LockType, Organization } from '@/types/domain';
import { useUpdateOrganization } from '@/api/op';
import type { OrgContractExt, OrgPatch } from '@/api/op-core-extra';
import { Chips, List, ListRow, Note, NumberInput, Pill, SettingRow, SettingsGroup, Switch, Tile } from '@/components/panel/kit';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { enDigits, faDigits, jDate } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { ICON, errMsg } from './ui';

export const CONTRACT_FUND_IDS = ['gold', 'fixed'];
export const fundDot = (id: string) => (id === 'gold' ? '--warning-main' : id === 'fixed' ? '--secondary-main' : '--grey-500');
export const fundMeta = (f: Fund) => (f.id === 'gold' ? f.symbol : f.effectiveYield ? `سود مؤثر ${faDigits(f.effectiveYield)}٪` : f.status === 'coming_soon' ? 'پیش‌نویس' : f.symbol);
/** Funds offered in contracts: gold & fixed income (package allocation) + funds coming soon. */
export const contractFunds = (funds: Fund[] | undefined) => (funds ?? []).filter((f) => CONTRACT_FUND_IDS.includes(f.id) || f.status === 'coming_soon');
/** Repayment options of a standard contract; another set is pointed out next to the options. */
const DEFAULT_MONTHS = [3, 6, 12];

interface Draft {
  loanPct: string; months: number[]; cardPct: string; perCap: string; bnpl: boolean; cash: boolean;
  vesting: boolean; vestMax: string; milestone: boolean; msMax: string; collateral: boolean; instLock: boolean; funds: string[];
}
type NumKey = 'loanPct' | 'cardPct' | 'perCap' | 'vestMax' | 'msMax';
type ErrKey = NumKey | 'months' | 'funds';

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
/** Draft text → input value (an empty field stays empty). */
const shown = (s: string) => (s.trim() === '' ? NaN : num(s));

/** First problem of the draft (same order and messages as before), with the field it belongs to. */
function check(d: Draft): { key: ErrKey; msg: string } | null {
  const loan = num(d.loanPct), card = num(d.cardPct), cap = num(d.perCap), vest = num(d.vestMax), ms = num(d.msMax);
  if (!Number.isInteger(loan) || loan < 0 || loan > 70) return { key: 'loanPct', msg: 'سقف وام باید عددی بین ۰ تا ۷۰ درصد باشد.' };
  if (!Number.isInteger(card) || card < 0 || card > 50) return { key: 'cardPct', msg: 'اعتبار کارت باید عددی بین ۰ تا ۵۰ درصد باشد.' };
  if (!(cap > 0)) return { key: 'perCap', msg: 'سقف اعتبار هر نفر را وارد کنید.' };
  if (loan > 0 && d.months.length === 0) return { key: 'months', msg: 'حداقل یک گزینه بازپرداخت انتخاب کنید.' };
  if (d.vesting && (!Number.isInteger(vest) || vest < 1 || vest > 24)) return { key: 'vestMax', msg: 'حداکثر مدت پس‌انداز باید بین ۱ تا ۲۴ ماه باشد.' };
  if (d.milestone && (!Number.isInteger(ms) || ms < 2 || ms > 10)) return { key: 'msMax', msg: 'حداکثر مراحل باید بین ۲ تا ۱۰ باشد.' };
  if (d.funds.filter((f) => CONTRACT_FUND_IDS.includes(f)).length === 0) return { key: 'funds', msg: 'حداقل یک صندوق مجاز انتخاب کنید.' };
  return null;
}

/** Readable list of the changes — the version note of the save and the «unsaved changes» count. */
function describe(d: Draft, base: Draft): string[] {
  const loan = num(d.loanPct), card = num(d.cardPct), cap = num(d.perCap);
  const changes: string[] = [];
  if (loan !== num(base.loanPct)) changes.push(`سقف وام ${faDigits(num(base.loanPct))} → ${faDigits(loan)}٪`);
  if (JSON.stringify(d.months) !== JSON.stringify(base.months)) changes.push('گزینه‌های بازپرداخت ' + (d.months.map((m) => faDigits(m)).join(' · ') || '—') + ' ماه');
  if (card !== num(base.cardPct)) changes.push(`اعتبار کارت ${faDigits(num(base.cardPct))} → ${faDigits(card)}٪`);
  if (cap !== num(base.perCap)) changes.push(`سقف اعتبار هر نفر ${faDigits(Math.round(num(base.perCap) / 1e6))} → ${faDigits(Math.round(cap / 1e6))} میلیون`);
  if (d.bnpl !== base.bnpl) changes.push(d.bnpl ? 'فعال‌سازی خرید اقساطی' : 'غیرفعال‌سازی خرید اقساطی');
  if (d.vesting !== base.vesting || d.milestone !== base.milestone || d.collateral !== base.collateral || d.instLock !== base.instLock || d.vestMax !== base.vestMax || d.msMax !== base.msMax) changes.push('تغییر شیوه‌های دریافت و رزروها');
  if (JSON.stringify([...d.funds].sort()) !== JSON.stringify([...base.funds].sort())) changes.push('تغییر صندوق‌های مجاز');
  return changes;
}

/**
 * Draft of the contract terms with validation and the save mutation.
 * Mount it in a component keyed by the organization id, so switching organizations starts a fresh draft.
 */
export function useContractDraft(org: Organization, ext: OrgContractExt, onSaved?: () => void) {
  const toast = useToast();
  const update = useUpdateOrganization();
  const base = useMemo(() => initial(org, ext), [org, ext]);
  const [d, setD] = useState<Draft>(base);
  const [error, setError] = useState<{ key: ErrKey | null; msg: string } | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const changes = dirty ? describe(d, base) : [];
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setError(null); };
  const setNum = (k: NumKey, n: number) => { const p: Partial<Draft> = {}; p[k] = Number.isFinite(n) ? String(n) : ''; set(p); };
  const reset = () => { setD(base); setError(null); };

  const save = () => {
    const bad = check(d);
    if (bad) { setError(bad); toast(bad.msg, 'error'); return; }
    const loan = num(d.loanPct), card = num(d.cardPct), cap = num(d.perCap), vest = num(d.vestMax), ms = num(d.msMax);
    const payload: OrgPatch = {
      id: org.id,
      settings: {
        ...org.settings,
        loanEnabled: loan > 0, loanMaxPct: loan, loanMonthsOptions: d.months, cardEnabled: card > 0, installmentEnabled: d.bnpl, cashWithdrawalAllowed: d.cash,
        lockPolicies: ['none', ...(d.vesting ? (['vesting'] as const) : []), ...(d.milestone ? (['milestone'] as const) : [])], allowedFunds: d.funds,
      },
      contract: { cardPct: card, perPersonCap: cap, vestingMaxMonths: vest, milestoneMaxSteps: ms, allowCollateral: d.collateral, allowInstallmentLock: d.bnpl && d.instLock },
      changeNote: describe(d, base).join('، ') || undefined,
    };
    update.mutate(payload, {
      onSuccess: () => { toast(`تغییرات قرارداد ذخیره شد · نسخه ${faDigits(ext.version + 1)}`); onSaved?.(); },
      onError: (e) => { setError({ key: null, msg: errMsg(e) }); toast(errMsg(e), 'error'); },
    });
  };

  return { org, ext, d, set, setNum, dirty, changes, error, save, reset, saving: update.isPending };
}
export type ContractDraft = ReturnType<typeof useContractDraft>;

/** The contract terms as settings groups: facility limits, allowed receive policies + reserves, allowed funds. */
export function ContractEditor({ c, funds, monthsOptions }: { c: ContractDraft; funds: Fund[]; monthsOptions: number[] }) {
  const { d, set, setNum, org } = c;
  const bad = (k: ErrKey) => c.error?.key === k;
  const options = Array.from(new Set([...monthsOptions, ...d.months])).sort((a, b) => a - b);
  const offDefault = d.months.join(',') !== DEFAULT_MONTHS.join(',');
  // Receive policies («شیوه‌ی دریافت»: free / vesting / milestone) vs. reserves managed by Namadno (collateral / installment / legal).
  const policies: { t: LockType | 'none'; receive?: boolean; desc: string; on: boolean; toggle?: () => void; disabled?: boolean; max?: { key: 'vestMax' | 'msMax'; suffix: string; label: string } }[] = [
    { t: 'none', receive: true, desc: 'همیشه مجاز · کل مبلغ بلافاصله آزاد', on: true, disabled: true },
    { t: 'vesting', receive: true, desc: 'آزاد در تاریخ مشخص؛ حداکثر مدت پس‌انداز', on: d.vesting, toggle: () => set({ vesting: !d.vesting }), max: { key: 'vestMax', suffix: 'ماه', label: 'حداکثر مدت پس‌انداز' } },
    { t: 'milestone', receive: true, desc: 'دریافت با تأیید هر مرحله؛ حداکثر تعداد مراحل', on: d.milestone, toggle: () => set({ milestone: !d.milestone }), max: { key: 'msMax', suffix: 'مرحله', label: 'حداکثر تعداد مراحل' } },
    { t: 'collateral', desc: 'پشتوانه‌ی وام و کارت از بخش آزاد', on: d.collateral, toggle: () => set({ collateral: !d.collateral }) },
    { t: 'installment', desc: d.bnpl ? 'هم‌زمان با خرید اقساطی' : 'نیازمند فعال بودن خرید اقساطی', on: d.bnpl && d.instLock, toggle: () => set({ instLock: !d.instLock }), disabled: !d.bnpl },
    { t: 'legal', desc: 'همیشه فعال · فقط بهره‌بردار', on: true, disabled: true },
  ];

  return (
    <>
      <SettingsGroup title="محدودیت‌های تسهیلات">
        <SettingRow label="سقف وام" desc="درصد دارایی آزاد کارمند · ۰ یعنی وام غیرفعال" htmlFor={`loan-cap-${org.id}`}>
          <NumberInput id={`loan-cap-${org.id}`} label="سقف وام (٪ دارایی آزاد)" value={shown(d.loanPct)} onChange={(n) => setNum('loanPct', n)} suffix="٪" width={52} decimals invalid={bad('loanPct')} />
        </SettingRow>
        <SettingRow label="گزینه‌های بازپرداخت" desc={offDefault ? `متفاوت با پیش‌فرض (${DEFAULT_MONTHS.map((m) => faDigits(m)).join(' · ')} ماه)` : 'کارمند یکی از این مدت‌ها را انتخاب می‌کند'} stack>
          <Chips label="گزینه‌های بازپرداخت" value={d.months} onChange={(m) => set({ months: d.months.includes(m) ? d.months.filter((x) => x !== m) : [...d.months, m].sort((a, b) => a - b) })} options={options.map((m) => ({ key: m, label: `${faDigits(m)} ماه` }))} />
        </SettingRow>
        <SettingRow label="اعتبار کارت" desc="درصد دارایی آزاد کارمند · ۰ یعنی غیرفعال" htmlFor={`card-cap-${org.id}`}>
          <NumberInput id={`card-cap-${org.id}`} label="اعتبار کارت (٪ دارایی آزاد)" value={shown(d.cardPct)} onChange={(n) => setNum('cardPct', n)} suffix="٪" width={52} decimals invalid={bad('cardPct')} />
        </SettingRow>
        <SettingRow label="سقف اعتبار هر نفر" htmlFor={`per-cap-${org.id}`}>
          <NumberInput id={`per-cap-${org.id}`} label="سقف اعتبار هر نفر" value={shown(d.perCap)} onChange={(n) => setNum('perCap', Number.isFinite(n) ? Math.round(Math.abs(n)) : NaN)} suffix="تومان" width={112} invalid={bad('perCap')} />
        </SettingRow>
        <SettingRow label="خرید اقساطی" desc="فروشگاه‌های طرف قرارداد"><Switch on={d.bnpl} onChange={(v) => set({ bnpl: v })} label="خرید اقساطی" /></SettingRow>
      </SettingsGroup>

      {([
        [true, 'شیوه‌های دریافت مجاز در قرارداد', 'سازمان هنگام ارسال بسته یکی از این شیوه‌ها را انتخاب می‌کند.'],
        [false, 'رزروهای مجاز در قرارداد', 'این رزروها را نمادنو مدیریت می‌کند؛ دارایی رزروشده مال کارمند می‌ماند و سود می‌گیرد.'],
      ] as const).map(([receive, title, footer]) => (
        <SettingsGroup key={title} title={title} footer={footer}>
          {policies.filter((p) => !!p.receive === receive).map((p) => {
            const mx = p.max;
            return (
              <SettingRow key={p.t} label={<LockTypeChip type={p.t} long />} desc={p.desc}>
                {mx && p.on && <NumberInput label={mx.label} value={shown(d[mx.key])} onChange={(n) => setNum(mx.key, n)} suffix={mx.suffix} width={40} decimals invalid={bad(mx.key)} />}
                <Switch on={p.on} onChange={() => p.toggle?.()} label={LOCK_META[p.t].label} disabled={p.disabled} />
              </SettingRow>
            );
          })}
        </SettingsGroup>
      ))}

      <SettingsGroup title="صندوق‌های مجاز">
        {contractFunds(funds).map((f) => {
          const soon = f.status === 'coming_soon';
          const on = d.funds.includes(f.id);
          return (
            <SettingRow key={f.id} label={f.name} desc={soon ? undefined : fundMeta(f)}>
              {soon ? <Pill>به‌زودی</Pill> : <Switch on={on} onChange={() => set({ funds: on ? d.funds.filter((x) => x !== f.id) : [...d.funds, f.id] })} label={f.name} />}
            </SettingRow>
          );
        })}
      </SettingsGroup>

      {c.error && <Note tone="err">{c.error.msg}</Note>}
    </>
  );
}

/** Contract versions, newest first (the first one is current). */
export function VersionList({ ext, limit }: { ext: OrgContractExt; limit?: number }) {
  return (
    <List>
      {ext.versions.slice(0, limit).map((v, i) => (
        <ListRow
          key={v.v + '-' + v.at}
          lead={<Tile d={ICON.file} tone={i === 0 ? 'primary' : 'neutral'} />}
          title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>نسخه {faDigits(v.v)}{i === 0 && <Pill tone="success">جاری</Pill>}</span>}
          sub={v.note}
          trail={<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 12, color: 'var(--text-secondary)' }}><span className="num">{jDate(v.at)}</span><span>{v.by}</span></span>}
        />
      ))}
    </List>
  );
}
