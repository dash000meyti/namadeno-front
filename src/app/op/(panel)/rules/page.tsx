'use client';
/** /op/rules — design: op-rules.dc.html (general rules, lock types, change history; save with confirmation). */
import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpRules } from '@/api/op';
import { useRulesMeta, useSaveRules, type RuleChange } from '@/api/op-system-extra';
import type { LockType, PlatformRule } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { errMsg } from '@/components/op/system/fmt';
import { Chip, Confirm, IC, Lbl, NumField, Seg, Sw, TONES, type ToneKey } from '@/components/op/system/ui';

type Val = { enabled: boolean; value?: number | string };
type RowDef =
  | { kind: 'field'; id: string; label: string; sub: string; suffix: string; w: number; min?: number; max?: number; decimals?: boolean }
  | { kind: 'switch'; id: string; label: string; sub: string }
  | { kind: 'chips'; id: string; label: string; sub: string; options: string[] };
interface GroupDef { title: string; badge: string; d: string; tone: ToneKey; rows: RowDef[] }

const DOCS = ['کارت ملی', 'سلفی', 'ویدیو'];
const COL_A: GroupDef[] = [
  { title: 'بسته‌های دارایی', badge: '۳ قانون', d: IC.inbox, tone: 'primary', rows: [
    { kind: 'field', id: 'r-pkg-min-amount', label: 'حداقل مبلغ بسته', sub: 'کمتر از این مبلغ ارسال نمی‌شود', suffix: 'تومان', w: 84, min: 0 },
    { kind: 'field', id: 'r-pkg-max-vesting', label: 'حداکثر قفل زمانی بسته', sub: 'همچنین سقف کلی در «انواع قفل دارایی»', suffix: 'ماه', w: 44, min: 1, max: 120 },
    { kind: 'switch', id: 'r-pkg-cfo-approval', label: 'نیاز به تأیید مدیر مالی', sub: 'برای بسته‌های بالای ۵۰۰ میلیون' },
  ] },
  { title: 'برداشت نقدی', badge: '۲ قانون', d: IC.wallet, tone: 'info', rows: [
    { kind: 'field', id: 'r-limit-withdraw-daily', label: 'سقف برداشت روزانه', sub: 'به ازای هر کاربر', suffix: 'تومان', w: 92, min: 0 },
    { kind: 'switch', id: 'r-withdraw-manual', label: 'نیاز به تأیید دستی', sub: 'برداشت‌های بالای ۲۰۰ میلیون تومان' },
  ] },
];
const COL_B: GroupDef[] = [
  { title: 'تسهیلات', badge: '۴ قانون', d: IC.percent, tone: 'success', rows: [
    { kind: 'field', id: 'r-credit-min-score', label: 'حداقل امتیاز اعتباری', sub: 'برای وام و خرید اقساطی · بازه ۳۰۰ تا ۹۰۰', suffix: 'امتیاز', w: 52, min: 300, max: 900 },
    { kind: 'field', id: 'r-credit-max-ltv', label: 'حداکثر نسبت وثیقه', sub: 'سهم قابل قفل از بخش آزاد هر صندوق', suffix: '٪', w: 44, min: 0, max: 100 },
    { kind: 'field', id: 'r-credit-overdue', label: 'اقساط معوق مجاز', sub: 'پس از آن وثیقه نقد می‌شود', suffix: 'قسط', w: 40, min: 0, max: 24 },
    { kind: 'switch', id: 'r-credit-auto-lock', label: 'قفل خودکار وثیقه', sub: 'هم‌زمان با تأیید وام یا خرید اقساطی' },
  ] },
  { title: 'احراز هویت (KYC)', badge: '۳ سطح', d: IC.id, tone: 'warning', rows: [
    { kind: 'chips', id: 'r-kyc-l1-docs', label: 'سطح ۱ — مشاهده', sub: 'مدارک لازم', options: DOCS },
    { kind: 'chips', id: 'r-kyc-l2-docs', label: 'سطح ۲ — برداشت', sub: 'مدارک لازم', options: DOCS },
    { kind: 'field', id: 'r-kyc-l2-withdraw-cap', label: 'سقف برداشت بدون تأیید دستی', sub: 'سطح ۲ · در هر روز', suffix: 'تومان', w: 84, min: 0 },
  ] },
];

const CREATORS: [string, string][] = [['system', 'سیستم'], ['org', 'سازمان'], ['operator', 'بهره‌بردار']];
type LimitDef = { kind: 'field'; id: string; label: string; suffix: string; w: number; min: number; max: number } | { kind: 'switch'; id: string; label: string };
const LOCK_TYPES: { type: LockType; cond: string; limits: LimitDef[] }[] = [
  { type: 'collateral', cond: 'آزاد با تسویه وام یا تسویه اعتبار کارت · LTV بالای سقف = فراخوان وثیقه', limits: [{ kind: 'field', id: 'r-lock-collateral-ltv', label: 'حداکثر نسبت وثیقه', suffix: '٪ آزاد', w: 36, min: 1, max: 100 }] },
  { type: 'vesting', cond: 'آزاد در تاریخ تعیین‌شده توسط سازمان؛ مثال: آزاد در ۱۴۰۵/۱۰/۱۵', limits: [{ kind: 'field', id: 'r-lock-vesting', label: 'حداکثر مدت قفل', suffix: 'ماه', w: 36, min: 1, max: 120 }] },
  { type: 'installment', cond: 'با پرداخت هر قسط، بخشی متناسب آزاد می‌شود', limits: [{ kind: 'field', id: 'r-lock-installment-share', label: 'حداکثر سهم از آزاد', suffix: '٪', w: 36, min: 1, max: 100 }] },
  { type: 'milestone', cond: 'با تأیید هر مرحله توسط سازمان آزاد می‌شود · جمع درصد مراحل باید ۱۰۰٪ باشد', limits: [{ kind: 'field', id: 'r-lock-milestone', label: 'حداکثر تعداد مراحل', suffix: 'مرحله', w: 32, min: 1, max: 20 }, { kind: 'field', id: 'r-lock-milestone-months', label: 'حداکثر مدت قرارداد', suffix: 'ماه', w: 32, min: 1, max: 120 }] },
  { type: 'legal', cond: 'تا رفع دستور مرجع / پایان بررسی ریسک · فقط در پنل بهره‌بردار', limits: [{ kind: 'switch', id: 'r-lock-legal-ref', label: 'شماره مرجع الزامی' }, { kind: 'switch', id: 'r-lock-legal-2nd', label: 'رفع با تأیید نفر دوم' }] },
];

const dotOf = (text: string, group: string) => (text.startsWith('فعال‌سازی') ? '--success-main' : text.startsWith('غیرفعال') ? '--error-main' : group === 'برداشت' ? '--info-main' : group === 'KYC' || group === 'قفل دارایی' ? '--warning-main' : group === 'ریسک' ? '--error-main' : '--primary-main');
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
    ...[...COL_A, ...COL_B].flatMap((g) => g.rows).filter((r): r is Extract<RowDef, { kind: 'field' }> => r.kind === 'field'),
    ...LOCK_TYPES.flatMap((t) => t.limits).filter((l): l is Extract<LimitDef, { kind: 'field' }> => l.kind === 'field'),
    { id: 'r-lock-total-cap', label: 'سقف مجموع قفل هر کاربر', min: 1, max: 100 },
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

  const sw = (id: string, label: string) => <Sw on={get(id).enabled} onClick={() => put(id, { enabled: !get(id).enabled })} label={label} />;
  const numField = (id: string, label: string, suffix: string, w: number, h = 32, decimals?: boolean) => (
    <NumField value={Number(get(id).value ?? NaN)} onChange={(n) => put(id, { value: n })} w={w} h={h} suffix={suffix} label={label} decimals={decimals} invalid={invalidId(id)} />
  );

  const renderRow = (r: RowDef) => {
    if (!byId[r.id]) return null;
    return (
      <div key={r.id} style={{ minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
        </span>
        {r.kind === 'field' && numField(r.id, r.label, r.suffix, r.w)}
        {r.kind === 'switch' && sw(r.id, r.label)}
        {r.kind === 'chips' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {r.options.map((o, i) => {
              const arr = String(get(r.id).value ?? '').split(',').map((x) => x === '1');
              const on = !!arr[i];
              return <Chip key={o} on={on} onClick={() => { const n = r.options.map((_, j) => (j === i ? !on : !!arr[j])); put(r.id, { value: n.map((b) => (b ? '1' : '0')).join(',') }); }} style={{ height: 26, padding: '0 8px' }}>{o}</Chip>;
            })}
          </span>
        )}
      </div>
    );
  };
  const group = (g: GroupDef) => {
    const [bg, fg] = TONES[g.tone];
    return (
      <div key={g.title} className="card" style={{ boxSizing: 'border-box', padding: '0 16px', display: 'flex', flexDirection: 'column', flex: 'none' }}>
        <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={g.d} size={18} /></span>
          <h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{g.title}</h6>
          <Lbl style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11 }}>{g.badge}</Lbl>
        </div>
        {g.rows.map(renderRow)}
      </div>
    );
  };

  const enabledN = LOCK_TYPES.filter((t) => get(`r-lock-${t.type}`).enabled).length;
  const history = meta.data?.history ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 'none' }}>
      <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <PageHeading title="قوانین و محدودیت‌ها" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'محصول', href: routes.op.funds }, { label: 'قوانین و محدودیت‌ها' }]} />
        <Seg label="نمای قوانین" value={view} onChange={setView} items={[{ key: 'general', label: 'قوانین عمومی' }, { key: 'locks', label: <>انواع قفل دارایی<Lbl tone="primary" style={{ height: 18, padding: '0 5px', fontSize: 10 }}>جدید</Lbl></> }]} />
        <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lbl tone="primary">سراسری — همهٔ سازمان‌ها</Lbl>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>نسخهٔ قوانین <span className="num" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{meta.data ? faDigits(meta.data.version) : '—'}</span></span>
        </div>
      </div>

      {rules.isLoading ? <Skeleton h={420} /> : rules.isError ? <ErrorState message={errMsg(rules.error)} onRetry={() => rules.refetch()} /> : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {view === 'general' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{COL_A.map(group)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{COL_B.map(group)}</div>
              </div>
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ minHeight: 56, flex: 'none', boxSizing: 'border-box', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--soft-warning)', color: 'var(--warning-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={IC.lock} size={18} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}><h6 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>انواع قفل دارایی</h6><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>قفل مالکیت را تغییر نمی‌دهد؛ سود و NAV ادامه دارد ولی فروش و برداشت تا آزادسازی ممکن نیست</span></span>
                  <Lbl style={{ marginRight: 'auto', height: 20, padding: '0 6px', fontSize: 11 }}>{faDigits(enabledN)} از ۵ نوع فعال</Lbl>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <div style={{ minWidth: 760 }}>
                    <div className="th" style={{ height: 34, columnGap: 12, gridTemplateColumns: 'minmax(0, 1fr) 52px 232px 252px' }}><span>نوع قفل / شرط آزادسازی</span><span>فعال</span><span>چه کسی ایجاد می‌کند</span><span>محدودیت‌ها</span></div>
                    {LOCK_TYPES.map((t) => {
                      const m = LOCK_META[t.type];
                      const on = get(`r-lock-${t.type}`).enabled;
                      const byKey = `r-lock-${t.type}-by`;
                      const by = String(get(byKey).value ?? '').split(',').filter(Boolean);
                      return (
                        <div key={t.type} className="tr" style={{ minHeight: 64, paddingTop: 8, paddingBottom: 8, boxSizing: 'border-box', columnGap: 12, gridTemplateColumns: 'minmax(0, 1fr) 52px 232px 252px', opacity: on ? 1 : 0.55 }}>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span className="lktype" style={{ background: m.bg, color: m.fg }}><Icon d={m.d} size={12} strokeWidth={2} />{m.short}</span><span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{m.label}</span></span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.cond}</span>
                          </span>
                          <span>{sw(`r-lock-${t.type}`, `فعال بودن ${m.label}`)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {CREATORS.map(([k, l]) => {
                              const c = by.includes(k);
                              return (
                                <Chip key={k} on={c} onClick={() => put(byKey, { value: (c ? by.filter((x) => x !== k) : [...by, k]).join(',') })} style={{ height: 26, padding: '0 8px', minWidth: 0 }}>
                                  {c && <Icon d={IC.check} size={12} strokeWidth={2.4} />}{l}
                                </Chip>
                              );
                            })}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {t.limits.map((l) => (
                              <span key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{l.label}</span>
                                {l.kind === 'field' ? numField(l.id, l.label, l.suffix, l.w, 30) : sw(l.id, l.label)}
                              </span>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ minHeight: 52, flex: 'none', boxSizing: 'border-box', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', borderTop: '1px solid var(--divider)', background: 'var(--table-head)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>سقف مجموع قفل هر کاربر{numField('r-lock-total-cap', 'سقف مجموع قفل هر کاربر', '٪ کل دارایی', 40, 30)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>اعلان آزادسازی قفل به کاربر{sw('r-lock-notify-release', 'اعلان آزادسازی')}</span>
                </div>
              </div>
            )}

            <div className="glass" style={{ position: 'sticky', bottom: 0, zIndex: 3, minHeight: 56, flex: 'none', boxSizing: 'border-box', borderRadius: 12, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btnp" onClick={onSave} disabled={save.isPending} style={{ boxShadow: 'var(--shadow-primary)', opacity: save.isPending ? 0.7 : 1 }}><Icon d={IC.check} size={16} strokeWidth={2.2} />ذخیره قوانین</button>
              <button type="button" className="btnt" onClick={resetAll} disabled={!meta.data}>بازنشانی به پیش‌فرض</button>
              {changes.length > 0 && (
                <>
                  <Lbl tone="warning">{faDigits(changes.length)} تغییر ذخیره‌نشده</Lbl>
                  <button type="button" className="btnt" onClick={() => setEdits({})} style={{ color: 'var(--text-secondary)' }}>لغو تغییرات</button>
                </>
              )}
              <span style={{ marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}><Icon d={IC.info} size={16} />تغییرات فقط روی درخواست‌ها و قراردادهای جدید اعمال می‌شود</span>
            </div>
          </div>

          {view === 'general' && (
            <div className="card" style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <h6 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>تاریخچه تغییرات</h6>
                {history.length > 4 && <button type="button" className="btnt" onClick={() => setHistAll(!histAll)} style={{ marginRight: 'auto', height: 28, padding: '0 8px', fontSize: 12 }}>{histAll ? 'کمتر' : 'همه'}</button>}
              </div>
              <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
                {meta.isLoading && <Skeleton h={160} />}
                {(histAll ? history : history.slice(0, 4)).map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: '1px dashed var(--divider)' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 'none', paddingTop: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${dotOf(h.text, h.group)})` }} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.35 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lbl style={{ height: 18, padding: '0 5px', fontSize: 10 }}>{h.group}</Lbl><span className="num" style={{ marginRight: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>{jDate(h.at)}</span></span>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{h.text}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{h.by}</span>
                    </span>
                  </div>
                ))}
                {!meta.isLoading && !history.length && <span style={{ padding: '12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>تغییری ثبت نشده است</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <Confirm open={confirm} onClose={() => setConfirm(false)} busy={save.isPending} onConfirm={doSave} title="ذخیره قوانین سراسری" confirmLabel={`ذخیره ${faDigits(changes.length)} تغییر`}
        body={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span>این تغییرات برای همهٔ سازمان‌ها اعمال می‌شود و نسخهٔ جدید قوانین ثبت خواهد شد:</span>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 240, overflowY: 'auto' }}>
              {changes.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, borderBottom: '1px dashed var(--divider)', fontSize: 12, color: 'var(--text-primary)' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{c.rule.title}</span>
                  <span className="num" style={{ whiteSpace: 'nowrap' }}>
                    {c.enabled !== undefined ? (c.enabled ? 'فعال' : 'غیرفعال') : typeof c.value === 'number' ? `${valText(c.rule.value)} → ${valText(c.value)}` : 'به‌روزرسانی'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )} />
    </div>
  );
}
