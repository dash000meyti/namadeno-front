'use client';
/** /op/rules — kit settings page: general rules and lock types as settings groups, change history, sticky save bar. */
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useOpRules } from '@/api/op';
import { useRulesMeta, useSaveRules, type RuleChange } from '@/api/op-system-extra';
import type { LockType, PlatformRule } from '@/types/domain';
import { faDigits, jDate, money } from '@/lib/format';
import { HOURGLASS, LOCK_META } from '@/lib/locks';
import { errMsg } from '@/components/op/system/fmt';
import { IC } from '@/components/op/system/ui';
import {
  ActionBar, Card, Chips, Confirm, ErrorBlock, KV, List, ListRow, NumberInput, PageHeading, Pill, SettingRow, SettingsGroup,
  SkeletonCard, Switch, Tabs, Tile, type Tone,
} from '@/components/panel/kit';
import { LockTypeChip } from '@/components/ui/LockBar';
import { Icon } from '@/components/ui/Icon';

type Val = { enabled: boolean; value?: number | string };
type RowDef =
  | { kind: 'field'; id: string; label: string; sub: string; suffix: string; w: number; min?: number; max?: number; decimals?: boolean }
  | { kind: 'switch'; id: string; label: string; sub: string }
  | { kind: 'chips'; id: string; label: string; sub: string; options: string[] };
interface GroupDef { title: string; d: string; tone: Tone; rows: RowDef[] }

const DOCS = ['کارت ملی', 'سلفی', 'ویدیو'];
const GROUPS: GroupDef[] = [
  { title: 'بسته‌های دارایی', d: IC.inbox, tone: 'primary', rows: [
    { kind: 'field', id: 'r-pkg-min-amount', label: 'حداقل مبلغ بسته', sub: 'کمتر از این مبلغ ارسال نمی‌شود', suffix: 'تومان', w: 100, min: 0 },
    { kind: 'field', id: 'r-pkg-max-vesting', label: 'حداکثر مدت پس‌انداز بسته', sub: 'همچنین سقف کلی در «انواع رزرو دارایی»', suffix: 'ماه', w: 52, min: 1, max: 120 },
    { kind: 'switch', id: 'r-pkg-cfo-approval', label: 'نیاز به تأیید مدیر مالی', sub: 'برای بسته‌های بالای ۵۰۰ میلیون' },
  ] },
  { title: 'تسهیلات', d: IC.percent, tone: 'success', rows: [
    { kind: 'field', id: 'r-credit-min-score', label: 'حداقل امتیاز اعتباری', sub: 'برای وام و خرید اقساطی · بازه ۳۰۰ تا ۹۰۰', suffix: 'امتیاز', w: 60, min: 300, max: 900 },
    { kind: 'field', id: 'r-credit-max-ltv', label: 'حداکثر نسبت پشتوانه', sub: 'سهم قابل رزرو از بخش آزاد هر صندوق', suffix: '٪', w: 52, min: 0, max: 100 },
    { kind: 'field', id: 'r-credit-overdue', label: 'اقساط معوق مجاز', sub: 'پس از آن پشتوانه نقد می‌شود', suffix: 'قسط', w: 52, min: 0, max: 24 },
    { kind: 'switch', id: 'r-credit-auto-lock', label: 'رزرو خودکار پشتوانه', sub: 'هم‌زمان با تأیید وام یا خرید اقساطی' },
  ] },
  { title: 'برداشت نقدی', d: IC.wallet, tone: 'info', rows: [
    { kind: 'field', id: 'r-limit-withdraw-daily', label: 'سقف برداشت روزانه', sub: 'به ازای هر کاربر', suffix: 'تومان', w: 100, min: 0 },
    { kind: 'switch', id: 'r-withdraw-manual', label: 'نیاز به تأیید دستی', sub: 'برداشت‌های بالای ۲۰۰ میلیون تومان' },
  ] },
  { title: 'احراز هویت (KYC)', d: IC.id, tone: 'warning', rows: [
    { kind: 'chips', id: 'r-kyc-l1-docs', label: 'سطح ۱ — مشاهده', sub: 'مدارک لازم', options: DOCS },
    { kind: 'chips', id: 'r-kyc-l2-docs', label: 'سطح ۲ — برداشت', sub: 'مدارک لازم', options: DOCS },
    { kind: 'field', id: 'r-kyc-l2-withdraw-cap', label: 'سقف برداشت بدون تأیید دستی', sub: 'سطح ۲ · در هر روز', suffix: 'تومان', w: 100, min: 0 },
  ] },
];

const CREATORS: [string, string][] = [['system', 'سیستم'], ['org', 'سازمان'], ['operator', 'بهره‌بردار']];
type LimitDef = { kind: 'field'; id: string; label: string; suffix: string; w: number; min: number; max: number } | { kind: 'switch'; id: string; label: string };
const LOCK_TYPES: { type: LockType; cond: string; limits: LimitDef[] }[] = [
  { type: 'collateral', cond: 'آزاد با تسویه وام یا تسویه اعتبار کارت · LTV بالای سقف = درخواست تکمیل پشتوانه', limits: [{ kind: 'field', id: 'r-lock-collateral-ltv', label: 'حداکثر نسبت پشتوانه', suffix: '٪ آزاد', w: 48, min: 1, max: 100 }] },
  { type: 'vesting', cond: 'آزاد در تاریخ تعیین‌شده توسط سازمان؛ مثال: آزاد در ۱۴۰۵/۱۰/۱۵', limits: [{ kind: 'field', id: 'r-lock-vesting', label: 'حداکثر مدت پس‌انداز', suffix: 'ماه', w: 48, min: 1, max: 120 }] },
  { type: 'installment', cond: 'با پرداخت هر قسط، بخشی متناسب آزاد می‌شود', limits: [{ kind: 'field', id: 'r-lock-installment-share', label: 'حداکثر سهم از آزاد', suffix: '٪', w: 48, min: 1, max: 100 }] },
  { type: 'milestone', cond: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود · جمع درصد مراحل باید ۱۰۰٪ باشد', limits: [{ kind: 'field', id: 'r-lock-milestone', label: 'حداکثر تعداد مراحل', suffix: 'مرحله', w: 48, min: 1, max: 20 }, { kind: 'field', id: 'r-lock-milestone-months', label: 'حداکثر مدت قرارداد', suffix: 'ماه', w: 48, min: 1, max: 120 }] },
  { type: 'legal', cond: 'تا رفع دستور مرجع / پایان بررسی ریسک · فقط در پنل بهره‌بردار', limits: [{ kind: 'switch', id: 'r-lock-legal-ref', label: 'شماره مرجع الزامی' }, { kind: 'switch', id: 'r-lock-legal-2nd', label: 'رفع با تأیید نفر دوم' }] },
];

const dotOf = (text: string, group: string) => (text.startsWith('فعال‌سازی') ? '--success-main' : text.startsWith('غیرفعال') ? '--error-main' : group === 'برداشت' ? '--info-main' : group === 'KYC' || group === 'رزرو دارایی' ? '--warning-main' : group === 'ریسک' ? '--error-main' : '--primary-main');
const valText = (v: unknown) => (typeof v === 'number' ? money(v) : faDigits(String(v ?? '—')));

export default function OpRulesPage() {
  const toast = useToast();
  const rules = useOpRules();
  const meta = useRulesMeta();
  const save = useSaveRules();
  const [view, setView] = useState<'general' | 'locks'>('general');
  const [edits, setEdits] = useState<Record<string, Val>>({});
  const [confirm, setConfirm] = useState(false);
  const [histAll, setHistAll] = useState(false);

  const byId = useMemo(() => Object.fromEntries((rules.data ?? []).map((r) => [r.id, r])) as Record<string, PlatformRule>, [rules.data]);
  useEffect(() => { setEdits({}); }, [rules.data]);
  const get = (id: string): Val => edits[id] ?? { enabled: byId[id]?.enabled ?? false, value: byId[id]?.value };
  const put = (id: string, v: Partial<Val>) => setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? { enabled: byId[id]?.enabled ?? false, value: byId[id]?.value }), ...v } }));

  const changes: (RuleChange & { rule: PlatformRule })[] = useMemo(() => Object.entries(edits).flatMap(([id, v]) => {
    const r = byId[id];
    if (!r) return [];
    const c: RuleChange & { rule: PlatformRule } = { id, rule: r };
    if (v.enabled !== r.enabled) c.enabled = v.enabled;
    if (v.value !== r.value) c.value = v.value;
    return c.enabled === undefined && c.value === undefined ? [] : [c];
  }), [edits, byId]);

  const fieldDefs = useMemo(() => [
    ...GROUPS.flatMap((g) => g.rows).filter((r): r is Extract<RowDef, { kind: 'field' }> => r.kind === 'field'),
    ...LOCK_TYPES.flatMap((t) => t.limits).filter((l): l is Extract<LimitDef, { kind: 'field' }> => l.kind === 'field'),
    { id: 'r-lock-total-cap', label: 'سقف مجموع رزرو هر کاربر', min: 1, max: 100 },
  ], []);
  const invalidId = (id: string) => {
    const d = fieldDefs.find((f) => f.id === id);
    const v = Number(get(id).value);
    return !!d && byId[id] !== undefined && !(Number.isFinite(v) && v >= (d.min ?? 0) && (d.max === undefined || v <= d.max));
  };

  const onSave = () => {
    if (!changes.length) return toast('تغییری برای ذخیره وجود ندارد', 'info');
    const bad = fieldDefs.find((f) => invalidId(f.id));
    if (bad) return toast(`مقدار «${bad.label}» معتبر نیست${bad.max !== undefined ? ` (بازه ${money(bad.min ?? 0)} تا ${money(bad.max)})` : ''}`, 'error');
    const missingCreator = LOCK_TYPES.find((t) => get(`r-lock-${t.type}`).enabled && !String(get(`r-lock-${t.type}-by`).value ?? '').split(',').filter(Boolean).length && byId[`r-lock-${t.type}-by`]);
    if (missingCreator) return toast(`برای «${LOCK_META[missingCreator.type].label}» دست‌کم یک ایجادکننده انتخاب کنید`, 'error');
    setConfirm(true);
  };
  const doSave = () => save.mutate({ changes: changes.map(({ id, enabled, value }) => ({ id, enabled, value })) }, {
    onSuccess: (r) => { setConfirm(false); setEdits({}); toast(`قوانین سراسری ذخیره شد — نسخهٔ ${faDigits(r.version)}`); },
    onError: (e) => { setConfirm(false); toast(errMsg(e), 'error'); },
  });
  const resetAll = () => {
    const defs = meta.data?.defaults;
    if (!defs) return;
    const next: Record<string, Val> = {};
    for (const [id, v] of Object.entries(defs)) if (byId[id]) next[id] = { enabled: v.enabled, value: v.value };
    setEdits(next);
    toast('مقادیر پیش‌فرض بارگذاری شد؛ برای اعمال، ذخیره کنید', 'info');
  };

  const sw = (id: string, label: string, disabled?: boolean) => <Switch on={get(id).enabled} onChange={(on) => put(id, { enabled: on })} label={label} disabled={disabled} />;
  const num = (id: string, label: string, suffix: string, w: number, disabled?: boolean) => (
    <NumberInput value={Number(get(id).value ?? NaN)} onChange={(n) => put(id, { value: n })} width={w} suffix={suffix} label={label} invalid={invalidId(id)} disabled={disabled} />
  );
  const chipsOf = (r: Extract<RowDef, { kind: 'chips' }>) => {
    const arr = String(get(r.id).value ?? '').split(',').map((x) => x === '1');
    const on = r.options.map((_, i) => i).filter((i) => arr[i]);
    return <Chips label={r.label} value={on} onChange={(i) => { const n = r.options.map((_, j) => (j === i ? !arr[j] : !!arr[j])); put(r.id, { value: n.map((b) => (b ? '1' : '0')).join(',') }); }} options={r.options.map((o, i) => ({ key: i, label: o }))} />;
  };

  const enabledN = LOCK_TYPES.filter((t) => get(`r-lock-${t.type}`).enabled).length;
  const history = meta.data?.history ?? [];

  return (
    <>
      <PageHeading title="قوانین و محدودیت‌ها" crumbs={[{ label: 'محصول' }]} sub="قوانین سراسری برای همه‌ی سازمان‌ها؛ تغییرات فقط روی درخواست‌ها و قراردادهای جدید اعمال می‌شود">
        <Pill tone="primary">سراسری — همهٔ سازمان‌ها</Pill>
        <span className="mute" style={{ fontSize: 12.5 }}>نسخهٔ قوانین <span className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{meta.data ? faDigits(meta.data.version) : '—'}</span></span>
      </PageHeading>

      <Tabs label="نمای قوانین" size="lg" value={view} onChange={setView} items={[{ key: 'general', label: 'قوانین عمومی' }, { key: 'locks', label: 'انواع رزرو دارایی', count: enabledN }]} />

      {rules.isLoading ? <SkeletonCard h={420} /> : rules.isError ? <ErrorBlock error={rules.error} message={errMsg(rules.error)} onRetry={() => rules.refetch()} /> : (
        <>
          {view === 'general' ? (
            <div className="nm-grid side">
              <div className="nm-grid c2">
                {[0, 1].map((col) => (
                  <div key={col} className="nm-stack">
                    {GROUPS.filter((_, i) => i % 2 === col).map((g) => (
                      <SettingsGroup key={g.title} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={g.d} tone={g.tone} size="sm" />{g.title}</span>}>
                        {g.rows.filter((r) => byId[r.id]).map((r) => (
                          <SettingRow key={r.id} label={r.label} desc={r.sub} stack={r.kind === 'chips'}>
                            {r.kind === 'field' && num(r.id, r.label, r.suffix, r.w)}
                            {r.kind === 'switch' && sw(r.id, r.label)}
                            {r.kind === 'chips' && chipsOf(r)}
                          </SettingRow>
                        ))}
                      </SettingsGroup>
                    ))}
                  </div>
                ))}
              </div>
              <Card title="تاریخچه تغییرات" count={history.length || undefined} more={history.length > 4 ? { label: histAll ? 'کمتر' : 'همه', onClick: () => setHistAll(!histAll) } : undefined}>
                {meta.isLoading ? <SkeletonCard h={160} /> : history.length ? (
                  <List>
                    {(histAll ? history : history.slice(0, 4)).map((h) => (
                      <ListRow key={h.id}
                        lead={<i style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${dotOf(h.text, h.group)})`, flex: 'none', alignSelf: 'flex-start', marginTop: 8 }} />}
                        title={<span style={{ fontWeight: 500, whiteSpace: 'normal', fontSize: 13 }}>{h.text}</span>}
                        sub={<>{h.by} · <span className="num">{jDate(h.at)}</span></>}
                        trail={<Pill>{h.group}</Pill>} />
                    ))}
                  </List>
                ) : <span className="mute" style={{ fontSize: 12.5 }}>تغییری ثبت نشده است</span>}
              </Card>
            </div>
          ) : (
            <div className="nm-stack">
              <div className="nm-grid c2">
                {LOCK_TYPES.map((t) => {
                  const m = LOCK_META[t.type];
                  const on = get(`r-lock-${t.type}`).enabled;
                  const byKey = `r-lock-${t.type}-by`;
                  const by = String(get(byKey).value ?? '').split(',').filter(Boolean);
                  return (
                    <SettingsGroup key={t.type} title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><LockTypeChip type={t.type} />{m.label}</span>} action={sw(`r-lock-${t.type}`, `فعال بودن ${m.label}`)}>
                      <div style={{ opacity: on ? 1 : 0.5, transition: 'opacity .2s' }}>
                        <SettingRow label="شرط آزادسازی" desc={t.cond} />
                        {byId[byKey] && (
                          <SettingRow label="چه کسی ایجاد می‌کند">
                            <Chips label={`ایجادکننده ${m.label}`} value={by} disabled={!on} onChange={(k) => put(byKey, { value: (by.includes(k) ? by.filter((x) => x !== k) : [...by, k]).join(',') })} options={CREATORS.map(([k, l]) => ({ key: k, label: l }))} />
                          </SettingRow>
                        )}
                        {t.limits.map((l) => (
                          <SettingRow key={l.id} label={l.label}>
                            {l.kind === 'field' ? num(l.id, l.label, l.suffix, l.w, !on) : sw(l.id, l.label, !on)}
                          </SettingRow>
                        ))}
                      </div>
                    </SettingsGroup>
                  );
                })}
                <SettingsGroup title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Tile d={HOURGLASS} tone="neutral" size="sm" />همه‌ی رزروها</span>} footer="رزرو مالکیت را تغییر نمی‌دهد؛ سود و NAV ادامه دارد و فروش و برداشت پس از آزادسازی ممکن است.">
                  <SettingRow label="سقف مجموع رزرو هر کاربر" desc="سهم کل دارایی که می‌تواند هم‌زمان رزرو باشد">{num('r-lock-total-cap', 'سقف مجموع رزرو هر کاربر', '٪ کل دارایی', 52)}</SettingRow>
                  <SettingRow label="اعلان آزادسازی رزرو به کاربر">{sw('r-lock-notify-release', 'اعلان آزادسازی')}</SettingRow>
                </SettingsGroup>
              </div>
            </div>
          )}

          <ActionBar actions={(
            <>
              <button type="button" className="nm-btn text" onClick={resetAll} disabled={!meta.data}>بازنشانی به پیش‌فرض</button>
              {changes.length > 0 && <button type="button" className="nm-btn ghost" onClick={() => setEdits({})}>لغو تغییرات</button>}
              <button type="button" className="nm-btn" onClick={onSave} disabled={save.isPending}><Icon d={IC.check} size={16} strokeWidth={2.2} />ذخیره قوانین</button>
            </>
          )}>
            {changes.length > 0 ? <Pill tone="warning" dot>{faDigits(changes.length)} تغییر ذخیره‌نشده</Pill> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon d={IC.info} size={16} />تغییرات فقط روی درخواست‌ها و قراردادهای جدید اعمال می‌شود</span>}
          </ActionBar>
        </>
      )}

      <Confirm open={confirm} onClose={() => setConfirm(false)} busy={save.isPending} onConfirm={doSave} title="ذخیره قوانین سراسری" confirmLabel={`ذخیره ${faDigits(changes.length)} تغییر`}
        body={(
          <>
            <span>این تغییرات برای همهٔ سازمان‌ها اعمال می‌شود و نسخهٔ جدید قوانین ثبت خواهد شد:</span>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              <KV rows={changes.map((c) => [c.rule.title, <span key={c.id} className="num">{c.enabled !== undefined ? (c.enabled ? 'فعال' : 'غیرفعال') : typeof c.value === 'number' ? `${valText(c.rule.value)} ← ${valText(c.value)}` : 'به‌روزرسانی'}</span>])} />
            </div>
          </>
        )} />
    </>
  );
}
