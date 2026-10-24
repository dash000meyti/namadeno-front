'use client';
/**
 * /op/products — kit page: stats → products table → inspector with the product's default parameters (save in its footer)
 * → organization overrides table (rows open the organization contract). Supports ?edit=<productId> (opens the inspector).
 */
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOpOrganizations, useOpProducts } from '@/api/op';
import { useUpdateProductX, type OpProduct, type ProductMeta } from '@/api/op-system-extra';
import type { Organization } from '@/types/domain';
import {
  Ava, Card, Chips, Empty, Ident, Inspector, KeyStats, Note, NumberInput, PageHeading, Pill, SettingRow, SettingsGroup, StatStrip,
  Switch, Table, TableFoot, Tile, Who, usePaging, type Column, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { useToast } from '@/components/ui/Toast';
import { bn, errMsg } from '@/components/op/system/fmt';
import { IC, type ToneKey } from '@/components/op/system/ui';
import { PRODUCT_STATUS, PRODUCT_UI, orgsWith, paramChips } from '@/components/op/system/products';
import { faDigits, jDate, money } from '@/lib/format';
import { routes } from '@/lib/routes';

/** Legacy tone key → kit tone. */
const kt = (t: ToneKey): Tone => (t === 'default' ? 'neutral' : t);
const HEAD = { title: 'محصولات اعتباری', crumbs: [{ label: 'محصول' }], sub: 'پارامترهای پیش‌فرض برای سازمان‌های جدید اعمال می‌شود؛ هر قرارداد می‌تواند آن‌ها را محدودتر کند' };

export default function OpProductsPage() {
  return (
    <Suspense fallback={<><PageHeading {...HEAD} /><StatStrip loading items={[]} /></>}>
      <ProductsInner />
    </Suspense>
  );
}

interface OverrideRow { org: Organization; product: OpProduct; param: string; def: string; val: string; date: string }

/** Organization contracts that narrow a product default (loan: LTV cap, longest repayment term). */
function overrideRows(products: OpProduct[], orgs?: Organization[]): OverrideRow[] {
  const out: OverrideRow[] = [];
  const loan = products.find((p) => p.kind === 'loan');
  if (!loan || !orgs) return out;
  const maxM = Math.max(...loan.monthsOptions);
  for (const o of orgs) {
    if (!o.settings.loanEnabled) continue;
    if (o.settings.loanMaxPct < loan.maxPctOfAssets) out.push({ org: o, product: loan, param: 'سقف LTV', def: `${faDigits(loan.maxPctOfAssets)}٪`, val: `${faDigits(o.settings.loanMaxPct)}٪`, date: o.contractStart });
    const om = Math.max(...o.settings.loanMonthsOptions);
    if (om < maxM) out.push({ org: o, product: loan, param: 'حداکثر مدت بازپرداخت', def: `${faDigits(maxM)} ماه`, val: `${faDigits(om)} ماه`, date: o.contractStart });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function ProductsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const products = useOpProducts();
  const orgs = useOpOrganizations();
  const list = useMemo(() => (products.data ?? []) as OpProduct[], [products.data]);
  const overrides = useMemo(() => overrideRows(list, orgs.data), [list, orgs.data]);
  const ov = usePaging(overrides, 8);
  const editId = sp.get('edit');
  const sel = list.find((p) => p.id === editId) ?? null;
  const open = (id: string | null) => router.replace(id ? `${routes.op.products}?edit=${id}` : routes.op.products, { scroll: false });

  const orgList = orgs.data ?? [];
  const usingOrgs = new Set(list.flatMap((p) => orgsWith(p.kind, orgList).map((o) => o.id))).size;
  const contracted = orgList.filter((o) => o.status !== 'suspended').length;
  const contracts = list.reduce((s, p) => s + p.activeContracts, 0);
  const ovOrgs = new Set(overrides.map((r) => r.org.id)).size;

  const cols: Column<OpProduct>[] = [
    { key: 'p', label: 'محصول', width: 'minmax(0, 1.4fr)', render: (p) => <Ident lead={<Tile d={PRODUCT_UI[p.kind].d} tone={kt(PRODUCT_UI[p.kind].tone)} />} title={p.name} sub={PRODUCT_UI[p.kind].type} /> },
    { key: 'params', label: 'پارامترهای پیش‌فرض', width: 'minmax(0, 1.3fr)', render: (p) => <span className="el mute">{paramChips(p).join(' · ')}</span> },
    { key: 'lock', label: 'نوع رزرو', width: '92px', render: (p) => <LockTypeChip type={PRODUCT_UI[p.kind].lock} /> },
    { key: 'orgs', label: 'سازمان‌ها', width: '76px', render: (p) => <span className="num">{orgs.data ? faDigits(orgsWith(p.kind, orgs.data).length) : '—'}</span> },
    { key: 'users', label: 'قرارداد فعال', width: '92px', render: (p) => <span className="num">{money(p.activeContracts)}</span> },
    { key: 'st', label: 'وضعیت', width: '88px', render: (p) => <Pill tone={kt(PRODUCT_STATUS[p.status].tone)} dot>{PRODUCT_STATUS[p.status].label}</Pill> },
  ];
  const ovCols: Column<OverrideRow>[] = [
    { key: 'org', label: 'سازمان', width: 'minmax(0, 1.4fr)', render: (r) => <Ident lead={<Ava letter={r.org.logoLetter} id={r.org.id} sq />} title={r.org.name} /> },
    { key: 'prod', label: 'محصول', width: '104px', render: (r) => <Pill tone={kt(PRODUCT_UI[r.product.kind].tone)}>{PRODUCT_UI[r.product.kind].short}</Pill> },
    { key: 'param', label: 'پارامتر', width: 'minmax(0, 1fr)', render: (r) => <span className="el mute">{r.param}</span> },
    { key: 'def', label: 'پیش‌فرض', width: '92px', render: (r) => <span className="num mute">{r.def}</span> },
    { key: 'val', label: 'مقدار اختصاصی', width: '104px', render: (r) => <span className="num" style={{ fontWeight: 600 }}>{r.val}</span> },
    { key: 'date', label: 'از تاریخ', width: '92px', render: (r) => <span className="num sm">{jDate(r.date)}</span> },
  ];

  return (
    <>
      <PageHeading {...HEAD}>
        <Pill>به‌زودی</Pill>
        <button type="button" className="nm-btn" disabled title="به‌زودی" aria-disabled="true"><Icon d={IC.plus} size={17} strokeWidth={2} />افزودن محصول</button>
      </PageHeading>

      {!products.isError && (
        <StatStrip loading={products.isLoading || orgs.isLoading} items={[
          { label: 'محصولات فعال', value: faDigits(list.filter((p) => p.status === 'active').length), unit: 'محصول', note: `از ${faDigits(list.length)} محصول اعتباری` },
          { label: 'سازمان‌های استفاده‌کننده', value: faDigits(usingOrgs), unit: 'سازمان', note: `از ${faDigits(contracted)} سازمان طرف قرارداد` },
          { label: 'قراردادهای فعال', value: money(contracts), unit: 'قرارداد', note: 'در همه‌ی محصولات' },
          { label: 'پارامترهای اختصاصی', value: faDigits(overrides.length), unit: 'مورد', note: `در ${faDigits(ovOrgs)} سازمان` },
        ]} />
      )}

      <Card flush title="محصولات" count={list.length || undefined}>
        <Table
          columns={cols} rows={list} rowKey={(p) => p.id} rowLabel={(p) => p.name}
          onRowClick={(p) => open(sel?.id === p.id ? null : p.id)} selectedKey={sel?.id ?? null}
          loading={products.isLoading} error={products.isError ? products.error : undefined} onRetry={() => products.refetch()}
          empty={<Empty icon={IC.card} title="محصولی تعریف نشده است" />}
          minWidth={820}
        />
      </Card>

      <Card flush title="پارامترهای اختصاصی سازمان‌ها" count={overrides.length || undefined} sub="هر پارامتر اختصاصی فقط می‌تواند پیش‌فرض را محدودتر کند">
        <Table
          columns={ovCols} rows={ov.rows} rowKey={(r) => r.org.id + r.param}
          rowHref={(r) => routes.op.organization(r.org.id)} rowLabel={(r) => `مشاهده قرارداد سازمان ${r.org.name}`} chevron
          loading={orgs.isLoading || products.isLoading} error={orgs.isError ? orgs.error : undefined} onRetry={() => orgs.refetch()}
          empty={<Empty icon={IC.building} title="همهٔ سازمان‌ها از پارامترهای پیش‌فرض استفاده می‌کنند" />}
          minWidth={820}
        />
        {overrides.length > 0 && <TableFoot shown={ov.rows.length} total={overrides.length} unit="پارامتر" page={ov.page} pages={ov.pages} onPage={ov.setPage} />}
      </Card>

      {sel && <ProductInspector key={sel.id} p={sel} orgs={orgs.data} onClose={() => open(null)} />}
    </>
  );
}

type FieldKey = 'maxPctOfAssets' | 'rateMax' | keyof ProductMeta;
interface FieldDef { key: FieldKey; label: string; suffix: string; w: number; decimals?: boolean; min: number; max: number }
const FIELDS: Record<OpProduct['kind'], FieldDef[]> = {
  card_credit: [
    { key: 'maxPctOfAssets', label: 'سقف نسبت به دارایی آزاد', suffix: '٪', w: 52, min: 1, max: 100 },
    { key: 'settleDays', label: 'مهلت تسویه', suffix: 'روز', w: 52, min: 1, max: 90 },
    { key: 'latePenaltyPct', label: 'نرخ جریمهٔ تأخیر', suffix: '٪ ماهانه', w: 52, decimals: true, min: 0, max: 10 },
    { key: 'perPersonCap', label: 'حداکثر سقف هر نفر', suffix: 'تومان', w: 108, min: 1_000_000, max: 10_000_000_000 },
    { key: 'minScore', label: 'حداقل امتیاز اعتباری', suffix: 'امتیاز', w: 56, min: 300, max: 900 },
  ],
  loan: [
    { key: 'maxPctOfAssets', label: 'سقف وام نسبت به دارایی آزاد', suffix: '٪', w: 52, min: 1, max: 100 },
    { key: 'rateMax', label: 'نرخ مؤثر سالانه', suffix: '٪', w: 52, decimals: true, min: 0, max: 60 },
    { key: 'minScore', label: 'حداقل امتیاز اعتباری', suffix: 'امتیاز', w: 56, min: 300, max: 900 },
    { key: 'liquidateAfter', label: 'نقد کردن پشتوانه پس از', suffix: 'قسط معوق', w: 44, min: 1, max: 12 },
  ],
  installment: [
    { key: 'lockRatioPct', label: 'نسبت رزرو اقساطی به مبلغ خرید', suffix: '٪', w: 52, min: 1, max: 100 },
    { key: 'feePct', label: 'کارمزد خرید', suffix: '٪', w: 52, decimals: true, min: 0, max: 20 },
    { key: 'maxPurchase', label: 'حداکثر مبلغ هر خرید', suffix: 'تومان', w: 108, min: 1_000_000, max: 10_000_000_000 },
    { key: 'codeValidityHours', label: 'اعتبار کد خرید', suffix: 'ساعت', w: 52, min: 1, max: 720 },
  ],
};

/** Default parameters of one product (same fields, ranges and payload as before; saved from the inspector footer). */
function ProductInspector({ p, orgs, onClose }: { p: OpProduct; orgs?: Organization[]; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateProductX();
  const ui = PRODUCT_UI[p.kind];
  const st = PRODUCT_STATUS[p.status];
  const fields = FIELDS[p.kind];
  const init = useMemo(() => ({
    vals: Object.fromEntries(fields.map((f) => [f.key, Number(f.key === 'maxPctOfAssets' || f.key === 'rateMax' ? p[f.key] : (p.meta?.[f.key as keyof ProductMeta] ?? 0))])) as Record<string, number>,
    months: p.monthsOptions,
    active: p.status === 'active',
    autoLock: p.meta?.autoLock !== false,
  }), [p, fields]);
  const [vals, setVals] = useState<Record<string, number>>(init.vals);
  const [months, setMonths] = useState<number[]>(init.months);
  const [active, setActive] = useState(init.active);
  const [autoLock, setAutoLock] = useState(init.autoLock);
  const [err, setErr] = useState('');
  const orgCount = orgs ? orgsWith(p.kind, orgs).length : 0;
  const invalid = (f: FieldDef) => !(vals[f.key] >= f.min && vals[f.key] <= f.max);
  const sameMonths = [...months].sort((a, b) => a - b).join() === [...init.months].sort((a, b) => a - b).join();
  const dirty = fields.some((f) => !Object.is(vals[f.key], init.vals[f.key])) || !sameMonths || active !== init.active || autoLock !== init.autoLock;

  const setVal = (k: string, n: number) => { setVals((v) => ({ ...v, [k]: n })); setErr(''); };
  const toggleMonth = (m: number) => { setMonths((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m])); setErr(''); };
  const reset = () => { setVals(init.vals); setMonths(init.months); setActive(init.active); setAutoLock(init.autoLock); setErr(''); };

  const save = () => {
    const bad = fields.find(invalid);
    if (bad) return setErr(`«${bad.label}» باید بین ${money(bad.min)} تا ${money(bad.max)} ${bad.suffix} باشد.`);
    if (ui.monthChoices.length && !months.length) return setErr('دست‌کم یک گزینهٔ مدت را انتخاب کنید.');
    const meta: Partial<ProductMeta> = { autoLock };
    const top: { maxPctOfAssets?: number; rateMax?: number; rateMin?: number } = {};
    for (const f of fields) {
      if (f.key === 'maxPctOfAssets') top.maxPctOfAssets = vals[f.key];
      else if (f.key === 'rateMax') { top.rateMax = vals[f.key]; top.rateMin = Math.min(p.rateMin, vals[f.key]); }
      else (meta as Record<string, number | boolean>)[f.key] = vals[f.key];
    }
    update.mutate({ id: p.id, ...top, monthsOptions: ui.monthChoices.length ? [...months].sort((a, b) => a - b) : p.monthsOptions, status: active ? 'active' : 'paused', meta }, {
      onSuccess: () => { toast(`پارامترهای «${p.name}» ذخیره شد`); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };

  return (
    <Inspector
      open onClose={onClose} title="پارامترهای محصول" label={`ویرایش ${p.name}`}
      footer={(
        <>
          {dirty && <button type="button" className="nm-btn ghost" onClick={reset}>لغو تغییرات</button>}
          <button type="button" className="nm-btn" onClick={save} disabled={update.isPending}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</button>
        </>
      )}
    >
      <Who lead={<Tile d={ui.d} tone={kt(ui.tone)} size="xl" />} title={p.name} sub={ui.type}
        pills={<><Pill tone={kt(st.tone)} dot>{st.label}</Pill><LockTypeChip type={ui.lock} /></>} />
      <KeyStats items={[['سازمان‌ها', orgs ? faDigits(orgCount) : '—'], ['قرارداد فعال', money(p.activeContracts)], ['مانده تسهیلات', `${bn(p.outstanding)} میلیارد`]]} />

      <SettingsGroup title="پارامترهای پیش‌فرض">
        {fields.map((f) => (
          <SettingRow key={f.key} label={f.label} htmlFor={'pf-' + f.key}>
            <NumberInput id={'pf-' + f.key} value={vals[f.key]} onChange={(n) => setVal(f.key, n)} suffix={f.suffix} width={f.w} decimals={f.decimals} invalid={invalid(f)} />
          </SettingRow>
        ))}
        {ui.monthChoices.length > 0 && (
          <SettingRow label={ui.monthsLabel} stack>
            <Chips label={ui.monthsLabel} value={months} onChange={toggleMonth} options={ui.monthChoices.map((m) => ({ key: m, label: faDigits(m) }))} />
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title="رزرو و وضعیت">
        <SettingRow label={`رزرو خودکار هنگام تأیید · نوع «${ui.lock === 'installment' ? 'اقساطی' : 'پشتوانه'}»`} desc={`${ui.lockRule(p)}؛ ${ui.lockRelease}`}>
          <Switch on={autoLock} onChange={setAutoLock} label="رزرو خودکار هنگام تأیید" />
        </SettingRow>
        <SettingRow label="محصول فعال" desc="غیرفعال‌سازی فقط روی درخواست‌های جدید اثر دارد">
          <Switch on={active} onChange={setActive} label="محصول فعال" />
        </SettingRow>
      </SettingsGroup>

      <Note tone="info">تغییر پیش‌فرض روی {faDigits(orgCount)} سازمان فعال اثر ندارد؛ قراردادهای موجود مقادیر خود را نگه می‌دارند.</Note>
      {err && <Note tone="err">{err}</Note>}
    </Inspector>
  );
}
