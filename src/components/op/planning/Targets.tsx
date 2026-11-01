'use client';
/**
 * /op/planning — «اهداف» tab: treasury targets as kit settings groups with a sticky save bar.
 *   stock    per active fund: minimum free stock (Toman), target coverage days, maximum (above it a redemption is suggested)
 *   aum      total managed assets by a date · orgs / users growth by a date
 *   mix      asset mix in percent (gold, fixed, other …); must sum to 100 (the server answers 422 bad_mix otherwise)
 * Only changed sections are sent (TargetsPatch); edits reset when the saved targets come back.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  useTreasurySummary, useTreasuryTargets, useUpdateTargets, type StockTarget, type TargetProgress, type TargetsPatch,
  type TreasuryPosition, type TreasuryTargets,
} from '@/api/op-treasury-extra';
import {
  ActionBar, Allocation, Card, ErrorBlock, Meter, Note, NumberInput, Pill, Section, SettingRow, SettingsGroup, Skel, SkeletonCard, Tile,
  type Tone,
} from '@/components/panel/kit';
import { DateInput } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { STOCK_STATE, TI, amt, daysText, fundUi } from '@/components/op/treasury/ui';
import { errMsg, pctT } from '@/components/op/system/fmt';
import { enDigits, faDigits, jDate, jDayMonth, money } from '@/lib/format';
import { now } from '@/lib/clock';
import { formatJalali, jalaliToIsoAny, parseJalaliText } from '@/lib/jalali';
import { neededText, tm } from './shared';

interface StockDraft { min: number; days: number; max: number }
interface Goal { value: number; by: string }
interface Edits { stock: Record<string, Partial<StockDraft>>; aum?: Partial<Goal>; orgs?: Partial<Goal>; users?: Partial<Goal>; mix?: Record<string, number> }
type GoalKey = 'aum' | 'orgs' | 'users';

/** Toman → billions for the inputs (two decimals); NaN stays NaN. */
const toB = (v: number) => (Number.isFinite(v) ? Math.round(v / 1e7) / 100 : NaN);
const fromB = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) * 1e7 : NaN);
const same = (a: number, b: number) => Object.is(a, b);
const normDate = (t: string) => { const p = parseJalaliText(t); return p ? formatJalali(p) : t.trim(); };
const isoOf = (t: string) => { const p = parseJalaliText(t); return p ? jalaliToIsoAny(p.y, p.m, p.d) : null; };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const stockInit = (t: TreasuryTargets, fundId: string): StockDraft => {
  const s = t.stock.find((x) => x.fundId === fundId);
  return s ? { min: s.minFreeValue, days: s.targetDays, max: s.maxFreeValue ?? NaN } : { min: NaN, days: NaN, max: NaN };
};
const goalInit = (t: TreasuryTargets, k: GoalKey): Goal => ({ value: t[k].value, by: jDate(t[k].by) });

export function TargetsView({ positions, progress }: { positions: TreasuryPosition[]; progress?: TargetProgress[] }) {
  const toast = useToast();
  const targets = useTreasuryTargets();
  const summary = useTreasurySummary(30);
  const save = useUpdateTargets();
  const [edits, setEdits] = useState<Edits>({ stock: {} });
  useEffect(() => { setEdits({ stock: {} }); }, [targets.data]);

  const funds = useMemo(() => positions.filter((p) => p.status === 'active'), [positions]);
  const t = targets.data;
  const prog = (k: string) => progress?.find((p) => p.key === k);

  if (targets.isLoading) return <><SkeletonCard h={380} /><SkeletonCard h={260} /></>;
  if (targets.isError || !t) return <ErrorBlock error={targets.error} message={errMsg(targets.error)} onRetry={() => targets.refetch()} />;

  // ── current values (saved + edits)
  const stockOf = (fid: string): StockDraft => ({ ...stockInit(t, fid), ...edits.stock[fid] });
  const goalOf = (k: GoalKey): Goal => ({ ...goalInit(t, k), ...edits[k] });
  const order = (k: string) => { const i = positions.findIndex((p) => p.fundId === k); return i < 0 ? 999 : i; };
  const mixKeys = [...Object.keys(t.mix).filter((k) => k !== 'other').sort((a, b) => order(a) - order(b)), ...('other' in t.mix ? ['other'] : [])];
  const mixOf = (k: string) => edits.mix?.[k] ?? t.mix[k];
  const setStock = (fid: string, v: Partial<StockDraft>) => setEdits((e) => ({ ...e, stock: { ...e.stock, [fid]: { ...e.stock[fid], ...v } } }));
  const setGoal = (k: GoalKey, v: Partial<Goal>) => setEdits((e) => ({ ...e, [k]: { ...e[k], ...v } }));
  const setMix = (k: string, n: number) => setEdits((e) => ({ ...e, mix: { ...e.mix, [k]: n } }));

  // ── dirty state
  const stockChanged = funds.filter((p) => { const a = stockOf(p.fundId), b = stockInit(t, p.fundId); return !same(a.min, b.min) || !same(a.days, b.days) || !same(a.max, b.max); });
  const goalChanged = (k: GoalKey) => { const a = goalOf(k), b = goalInit(t, k); return !same(a.value, b.value) || normDate(a.by) !== normDate(b.by); };
  const mixChanged = mixKeys.some((k) => !same(mixOf(k), t.mix[k]));
  const goalsChanged = (['aum', 'orgs', 'users'] as GoalKey[]).filter(goalChanged);
  const changes = stockChanged.length + goalsChanged.length + (mixChanged ? 1 : 0);

  // ── validation
  const stockErr = (fid: string): string | null => {
    const s = stockOf(fid);
    const had = t.stock.some((x) => x.fundId === fid);
    if (!had && [s.min, s.days, s.max].every(Number.isNaN)) return null;
    if (!(s.min >= 0)) return 'حداقل موجودی را وارد کنید.';
    if (!(Number.isInteger(s.days) && s.days >= 1 && s.days <= 365)) return 'روزهای پوشش باید عددی بین ۱ تا ۳۶۵ باشد.';
    if (!Number.isNaN(s.max) && !(s.max > s.min)) return 'سقف موجودی باید از حداقل بیشتر باشد.';
    return null;
  };
  const goalErr = (k: GoalKey): { value?: string; by?: string } => {
    const g = goalOf(k);
    const iso = isoOf(g.by);
    return {
      value: !(g.value > 0) ? 'مقدار هدف را وارد کنید.' : undefined,
      by: !iso ? 'تاریخ معتبر نیست.' : iso <= now().toISOString() ? 'تاریخ هدف باید در آینده باشد.' : undefined,
    };
  };
  const mixSum = Math.round(sum(mixKeys.map((k) => (Number.isFinite(mixOf(k)) ? mixOf(k) : 0))) * 10) / 10;
  const mixBad = mixKeys.some((k) => !(mixOf(k) >= 0 && mixOf(k) <= 100)) || Math.abs(mixSum - 100) > 0.05;
  const invalid = funds.some((p) => stockErr(p.fundId)) || (['aum', 'orgs', 'users'] as GoalKey[]).some((k) => { const e = goalErr(k); return e.value || e.by; }) || mixBad;

  const onSave = () => {
    if (!changes || invalid) return;
    const patch: TargetsPatch = {};
    if (stockChanged.length) {
      patch.stock = stockChanged.map((p): StockTarget => {
        const s = stockOf(p.fundId);
        return { fundId: p.fundId, minFreeValue: s.min, targetDays: s.days, maxFreeValue: Number.isNaN(s.max) ? undefined : s.max };
      });
    }
    for (const k of goalsChanged) { const g = goalOf(k); patch[k] = { value: g.value, by: isoOf(g.by)! }; }
    if (mixChanged) patch.mix = Object.fromEntries(mixKeys.map((k) => [k, mixOf(k)]));
    save.mutate(patch, {
      onSuccess: () => toast(changes === 1 ? 'هدف خزانه ذخیره شد' : `${faDigits(changes)} هدف خزانه ذخیره شد`),
      onError: (e) => toast(errMsg(e), 'error'),
    });
  };

  // ── current mix (from the summary): funds with their own key, the rest under 'other'
  const curMix = (k: string) => {
    const m = summary.data?.mix;
    if (!m) return undefined;
    return k === 'other' ? sum(m.filter((x) => !(x.fundId in t.mix)).map((x) => x.pct)) : m.find((x) => x.fundId === k)?.pct ?? 0;
  };
  const nameOf = (k: string) => (k === 'other' ? 'سایر صندوق‌ها' : positions.find((p) => p.fundId === k)?.name ?? k);
  const mixCol = (k: string) => (k === 'other' ? 'var(--grey-400)' : fundUi(k).col);
  const errText = (s?: string | null) => (s ? <span style={{ color: 'var(--error-text)', fontWeight: 600 }}>{s}</span> : null);
  const label = (txt: string) => <span className="mute" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{txt}</span>;
  const titleWith = (d: string, tone: Tone, txt: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={d} tone={tone} size="sm" />{txt}</span>;

  const goalRow = (k: GoalKey, opts: { title: string; d: string; tone: Tone; unit: string; billions?: boolean; current?: number }) => {
    const g = goalOf(k);
    const e = goalErr(k);
    const p = prog(k);
    const cur = p?.current ?? opts.current;
    const target = g.value;
    const pctNow = cur != null && target > 0 ? Math.min(1, cur / target) : 0;
    const curText = cur == null ? '' : opts.billions ? `اکنون ${tm(cur)}` : `اکنون ${money(cur)} ${opts.unit}`;
    const need = p ? neededText(p) : null;
    return (
      <SettingRow
        key={k} lead={<Tile d={opts.d} tone={opts.tone} />} label={opts.title}
        desc={(
          <>
            {errText(e.value || e.by) ?? <>{curText}{need ? ` · ${need}` : ''}{p && <> · <span style={{ color: `var(--${p.onTrack ? 'success' : 'warning'}-text)`, fontWeight: 600 }}>{p.onTrack ? 'در مسیر' : 'نیاز به توجه'}</span></>}</>}
            {cur != null && <span style={{ display: 'block', marginTop: 6, maxWidth: 260 }}><Meter value={pctNow} tone={p && !p.onTrack ? 'warning' : 'success'} thin label={`${opts.title}: ${faDigits(Math.round(pctNow * 100))}٪ هدف`} /></span>}
          </>
        )}
      >
        <NumberInput
          value={opts.billions ? toB(g.value) : g.value} onChange={(n) => setGoal(k, { value: opts.billions ? fromB(n) : Number.isFinite(n) ? Math.round(n) : NaN })}
          suffix={opts.billions ? 'میلیارد تومان' : opts.unit} width={opts.billions ? 72 : 64} decimals={opts.billions} label={`هدف ${opts.title}`} invalid={!!e.value}
        />
        {label('تا')}
        <DateInput value={g.by} onChange={(v) => setGoal(k, { by: faDigits(enDigits(v).replace(/[^\d/]/g, '').slice(0, 10)) })} min={now()} label={`تاریخ هدف ${opts.title}`} invalid={!!e.by} width={96} />
      </SettingRow>
    );
  };

  return (
    <>
      <SettingsGroup
        title={titleWith(TI.stock, 'success', 'موجودی صندوق‌ها')}
        action={<span className="mute" style={{ fontSize: 12, fontWeight: 500 }}>حداقل و سقف موجودی آزاد، و روزهای پوششی که باید همیشه آماده باشد</span>}
        footer="موجودی آزاد هر صندوق باید بالاتر از بیشترِ «حداقل موجودی» و «تقاضای خالص روزانه × روزهای پوشش» بماند؛ کمتر از آن صدور و بالاتر از سقف، ابطال پیشنهاد می‌شود."
      >
        {funds.map((p) => {
          const u = fundUi(p.fundId);
          const s = stockOf(p.fundId);
          const err = stockErr(p.fundId);
          const st = STOCK_STATE[p.state];
          const eff = Number.isFinite(s.min) && Number.isFinite(s.days) ? Math.max(s.min, Math.max(0, p.demandPerDay) * s.days) : NaN;
          const hint = (
            <>
              آزاد {amt(p.availableValue)} · پوشش {daysText(p.coverageDays)} · تقاضای روزانه {amt(Math.max(0, p.demandPerDay))}
              {Number.isFinite(eff) && <> · حداقل مؤثر <b className="num" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{amt(eff)}</b></>}
            </>
          );
          return (
            <SettingRow
              key={p.fundId} lead={<Tile d={u.d} tone={u.tone} />}
              label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{p.name}<Pill tone={st.tone} dot>{st.label}</Pill>{!t.stock.some((x) => x.fundId === p.fundId) && <Pill>بدون هدف</Pill>}</span>}
              desc={errText(err) ?? hint}
            >
              {label('حداقل')}
              <NumberInput value={toB(s.min)} onChange={(n) => setStock(p.fundId, { min: fromB(n) })} suffix="میلیارد" width={56} decimals label={`حداقل موجودی ${p.name} (میلیارد تومان)`} invalid={!!err && !(s.min >= 0)} />
              {label('پوشش')}
              <NumberInput value={s.days} onChange={(n) => setStock(p.fundId, { days: Number.isFinite(n) ? Math.round(n) : NaN })} suffix="روز" width={40} label={`روزهای پوشش هدف ${p.name}`} invalid={!!err && !(s.days >= 1 && s.days <= 365)} />
              {label('سقف')}
              <NumberInput value={toB(s.max)} onChange={(n) => setStock(p.fundId, { max: fromB(n) })} suffix="میلیارد" width={56} decimals label={`سقف موجودی ${p.name} (میلیارد تومان، اختیاری)`} invalid={!!err && !Number.isNaN(s.max) && !(s.max > s.min)} />
            </SettingRow>
          );
        })}
      </SettingsGroup>

      <SettingsGroup title={titleWith(TI.target, 'primary', 'اهداف رشد')} footer="دارایی تحت مدیریت = جمع ارزش واحدهای همه‌ی صندوق‌های خزانه. تاریخ هر هدف باید در آینده باشد.">
        {goalRow('aum', { title: 'دارایی تحت مدیریت', d: TI.stock, tone: 'primary', unit: 'تومان', billions: true, current: summary.data?.totals.heldValue })}
        {goalRow('orgs', { title: 'سازمان‌های فعال', d: TI.org, tone: 'secondary', unit: 'سازمان', current: summary.data?.growth.activeOrgs })}
        {goalRow('users', { title: 'کاربران', d: TI.user, tone: 'info', unit: 'کاربر', current: summary.data?.growth.users })}
      </SettingsGroup>

      <div className="nm-grid c2">
        <div className="nm-stack">
          <SettingsGroup title={titleWith(TI.plan, 'warning', 'ترکیب دارایی')} footer="سهم هر صندوق از دارایی تحت مدیریت؛ «سایر صندوق‌ها» همه‌ی صندوق‌های دیگر با هم است.">
            {mixKeys.map((k) => {
              const c = curMix(k);
              const v = mixOf(k);
              const u = k === 'other' ? { d: TI.stock, tone: 'neutral' as Tone } : fundUi(k);
              const gap = c != null && Number.isFinite(v) ? c - v : 0;
              return (
                <SettingRow key={k} lead={<Tile d={u.d} tone={u.tone} />} label={nameOf(k)}
                  desc={c != null ? <>اکنون {pctT(c)}{Math.abs(gap) >= 0.5 && <> · {pctT(Math.abs(gap))} {gap > 0 ? 'بیشتر' : 'کمتر'} از هدف</>}</> : 'در حال بارگذاری…'}>
                  <NumberInput value={v} onChange={(n) => setMix(k, n)} suffix="٪" width={48} decimals label={`سهم هدف ${nameOf(k)}`} invalid={!(v >= 0 && v <= 100)} />
                </SettingRow>
              );
            })}
            <SettingRow label="جمع">
              <b className="num" style={{ fontSize: 14, fontWeight: 600, color: mixBad ? 'var(--error-text)' : 'var(--success-text)' }}>{pctT(mixSum)}</b>
            </SettingRow>
          </SettingsGroup>
          {mixBad && <Note tone="err">جمع ترکیب دارایی باید ۱۰۰٪ باشد؛ اکنون {pctT(mixSum)} است.</Note>}
        </div>
        <Card title="ترکیب فعلی و هدف" sub="سهم از دارایی تحت مدیریت">
          {mixKeys.every((k) => curMix(k) != null) ? (
            <>
              <Section title="اکنون">
                <Allocation compact items={mixKeys.map((k) => ({ label: nameOf(k), value: curMix(k) ?? 0, color: mixCol(k) }))} />
              </Section>
              <Section title={mixChanged ? 'هدف (ذخیره‌نشده)' : 'هدف'}>
                <Allocation compact items={mixKeys.map((k) => ({ label: nameOf(k), value: Number.isFinite(mixOf(k)) ? Math.max(0, mixOf(k)) : 0, color: mixCol(k) }))} />
              </Section>
            </>
          ) : <Skel h={80} />}
        </Card>
      </div>

      <ActionBar actions={(
        <>
          {changes > 0 && <button type="button" className="nm-btn ghost" onClick={() => setEdits({ stock: {} })} disabled={save.isPending}>بازگردانی</button>}
          <button type="button" className="nm-btn" onClick={onSave} disabled={!changes || invalid || save.isPending}>
            <Icon d={TI.check} size={16} strokeWidth={2.2} />{save.isPending ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </>
      )}>
        {changes > 0
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><Pill tone="warning" dot>{faDigits(changes)} تغییر ذخیره‌نشده</Pill>{invalid && <span style={{ color: 'var(--error-text)', fontWeight: 600 }}>برای ذخیره، خطاها را برطرف کنید</span>}</span>
          : <span>آخرین به‌روزرسانی: {t.updatedBy} · <span className="num">{jDayMonth(t.updatedAt, true)}</span></span>}
      </ActionBar>
    </>
  );
}

