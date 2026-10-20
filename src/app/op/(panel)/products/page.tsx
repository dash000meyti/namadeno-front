'use client';
/** /op/products — design: op-products.dc.html (credit product cards, org overrides, edit drawer). Supports ?edit=<productId>. */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { Skeleton, ErrorState } from '@/components/app/Screen';
import { useToast } from '@/components/ui/Toast';
import { useOpOrganizations, useOpProducts } from '@/api/op';
import { useUpdateProductX, type OpProduct, type ProductMeta } from '@/api/op-system-extra';
import type { Organization } from '@/types/domain';
import { routes } from '@/lib/routes';
import { faDigits, jDate, money } from '@/lib/format';
import { errMsg } from '@/components/op/system/fmt';
import { BoxNum, CardHead, Chip, Drawer, FormError, IC, Lbl, Sw, TILE_TONES, TONES } from '@/components/op/system/ui';
import { PRODUCT_STATUS, PRODUCT_UI, orgsWith, paramRows } from '@/components/op/system/products';

export default function OpProductsPage() {
  return <Suspense fallback={<Skeleton h={48} />}><ProductsInner /></Suspense>;
}

function ProductsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const products = useOpProducts();
  const orgs = useOpOrganizations();
  const list = (products.data ?? []) as OpProduct[];
  const editId = sp.get('edit');
  const editing = list.find((p) => p.id === editId) ?? null;
  const openEdit = (id: string | null) => router.replace(id ? `${routes.op.products}?edit=${id}` : routes.op.products);

  return (
    <>
      <PageHeading title="محصولات اعتباری" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'محصول', href: routes.op.funds }, { label: 'محصولات اعتباری' }]}>
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="lbl" style={{ height: 22, padding: '0 8px', fontSize: 11, background: 'var(--contained-default)', color: 'var(--contained-default-text)', borderRadius: 6, position: 'relative' }}>
            به‌زودی<span style={{ position: 'absolute', left: -5, top: 7, width: 8, height: 8, background: 'var(--contained-default)', transform: 'rotate(45deg)' }} />
          </span>
          <button type="button" className="btnp" disabled title="به‌زودی" aria-disabled="true" style={{ opacity: 0.5, cursor: 'not-allowed', fontSize: 14 }}><Icon d={IC.plus} size={18} strokeWidth={2} />افزودن محصول</button>
        </span>
      </PageHeading>

      {products.isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={268} />)}</div>
      ) : products.isError ? (
        <ErrorState message={errMsg(products.error)} onRetry={() => products.refetch()} />
      ) : (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
          {list.map((p) => <ProductCard key={p.id} p={p} orgs={orgs.data} onEdit={() => openEdit(p.id)} />)}
        </div>
      )}

      <OverridesTable products={list} orgs={orgs.data} loading={orgs.isLoading} />

      {editing && <EditDrawer key={editing.id} p={editing} orgs={orgs.data} onClose={() => openEdit(null)} />}
    </>
  );
}

function ProductCard({ p, orgs, onEdit }: { p: OpProduct; orgs?: Organization[]; onEdit: () => void }) {
  const ui = PRODUCT_UI[p.kind];
  const [bg, fg] = TONES[ui.tone];
  const st = PRODUCT_STATUS[p.status];
  return (
    <div className="card" style={{ boxSizing: 'border-box', minHeight: 268, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ui.d} size={20} /></span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ui.type}</span></span>
        <Lbl tone={st.tone}>{st.label}</Lbl>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {paramRows(p).map(([k, v]) => (
          <div key={k} style={{ height: 30, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, borderBottom: '1px dashed var(--divider)' }}><span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{k}</span><span className="num" style={{ marginRight: 'auto', fontWeight: 500, whiteSpace: 'nowrap' }}>{v}</span></div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-neutral)' }}>
        <LockTypeChip type={ui.lock} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ui.lockRule(p)}</span>
          <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ui.lockRelease}{p.meta?.autoLock === false ? ' · قفل خودکار خاموش' : ''}</span>
        </span>
      </div>
      <div style={{ marginTop: 'auto', height: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}><span className="num" style={{ fontSize: 16, color: 'var(--text-primary)' }}>{orgs ? faDigits(orgsWith(p.kind, orgs).length) : '—'}</span>سازمان فعال</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>· {money(p.activeContracts)} کاربر</span>
        <button type="button" className="btnt" onClick={onEdit} style={{ marginRight: 'auto', height: 32, padding: '0 10px' }}><Icon d={IC.pen} size={16} />ویرایش</button>
      </div>
    </div>
  );
}

interface OverrideRow { org: Organization; product: OpProduct; param: string; def: string; val: string; date: string }
const OCOLS = 'minmax(0, 1fr) 132px 168px 120px 128px 88px 32px';
function OverridesTable({ products, orgs, loading }: { products: OpProduct[]; orgs?: Organization[]; loading: boolean }) {
  const rows = useMemo<OverrideRow[]>(() => {
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
  }, [products, orgs]);
  return (
    <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardHead title="پارامترهای اختصاصی سازمان‌ها" badge={<Lbl>{faDigits(rows.length)} override</Lbl>}>
        <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>هر override فقط می‌تواند پیش‌فرض را محدودتر کند</span>
      </CardHead>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 860 }}>
          <div style={{ height: 36, display: 'grid', gridTemplateColumns: OCOLS, alignItems: 'center', padding: '0 20px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
            <span>سازمان</span><span>محصول</span><span>پارامتر</span><span>پیش‌فرض</span><span>مقدار اختصاصی</span><span>از تاریخ</span><span />
          </div>
          {loading && <div style={{ padding: 20 }}><Skeleton h={48} /></div>}
          {!loading && !rows.length && <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>همهٔ سازمان‌ها از پارامترهای پیش‌فرض استفاده می‌کنند</div>}
          {rows.map((r, i) => {
            const [bg, fg] = TONES[TILE_TONES[i % 5]];
            const [pbg, pfg] = TONES[PRODUCT_UI[r.product.kind].tone];
            return (
              <div key={r.org.id + r.param} style={{ height: 48, display: 'grid', gridTemplateColumns: OCOLS, alignItems: 'center', padding: '0 20px', borderBottom: '1px dashed var(--divider)', fontSize: 13 }}>
                <Link href={routes.op.organization(r.org.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: fg, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{r.org.logoLetter}</span>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.org.name}</span>
                </Link>
                <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: pbg, color: pfg }}>{PRODUCT_UI[r.product.kind].short}</span></span>
                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.param}</span>
                <span className="num" style={{ color: 'var(--text-secondary)' }}>{r.def}</span>
                <span className="num" style={{ fontWeight: 500 }}>{r.val}</span>
                <span className="num" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{jDate(r.date)}</span>
                <span style={{ display: 'grid', placeItems: 'center' }}><Link href={routes.op.organization(r.org.id)} className="ibtn" aria-label="مشاهده قرارداد سازمان" style={{ width: 28, height: 28 }}><Icon d={IC.chevL} size={18} /></Link></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type FieldKey = 'maxPctOfAssets' | 'rateMax' | keyof ProductMeta;
const FIELDS: Record<OpProduct['kind'], { key: FieldKey; label: string; suffix: string; decimals?: boolean; min: number; max: number }[]> = {
  card_credit: [
    { key: 'maxPctOfAssets', label: 'سقف نسبت به دارایی آزاد', suffix: '٪', min: 1, max: 100 },
    { key: 'settleDays', label: 'مهلت تسویه', suffix: 'روز', min: 1, max: 90 },
    { key: 'latePenaltyPct', label: 'نرخ جریمهٔ تأخیر', suffix: '٪ ماهانه', decimals: true, min: 0, max: 10 },
    { key: 'perPersonCap', label: 'حداکثر سقف هر نفر', suffix: 'تومان', min: 1_000_000, max: 10_000_000_000 },
    { key: 'minScore', label: 'حداقل امتیاز اعتباری', suffix: 'امتیاز', min: 300, max: 900 },
  ],
  loan: [
    { key: 'maxPctOfAssets', label: 'سقف وام نسبت به دارایی آزاد', suffix: '٪', min: 1, max: 100 },
    { key: 'rateMax', label: 'نرخ مؤثر سالانه', suffix: '٪', decimals: true, min: 0, max: 60 },
    { key: 'minScore', label: 'حداقل امتیاز اعتباری', suffix: 'امتیاز', min: 300, max: 900 },
    { key: 'liquidateAfter', label: 'نقد کردن وثیقه پس از', suffix: 'قسط معوق', min: 1, max: 12 },
  ],
  installment: [
    { key: 'lockRatioPct', label: 'نسبت قفل اقساطی به مبلغ خرید', suffix: '٪', min: 1, max: 100 },
    { key: 'feePct', label: 'کارمزد خرید', suffix: '٪', decimals: true, min: 0, max: 20 },
    { key: 'maxPurchase', label: 'حداکثر مبلغ هر خرید', suffix: 'تومان', min: 1_000_000, max: 10_000_000_000 },
    { key: 'codeValidityHours', label: 'اعتبار کد خرید', suffix: 'ساعت', min: 1, max: 720 },
  ],
};

function EditDrawer({ p, orgs, onClose }: { p: OpProduct; orgs?: Organization[]; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateProductX();
  const ui = PRODUCT_UI[p.kind];
  const [bg, fg] = TONES[ui.tone];
  const fields = FIELDS[p.kind];
  const initVals = () => Object.fromEntries(fields.map((f) => [f.key, Number(f.key === 'maxPctOfAssets' || f.key === 'rateMax' ? p[f.key] : (p.meta?.[f.key as keyof ProductMeta] ?? 0))])) as Record<string, number>;
  const [vals, setVals] = useState<Record<string, number>>(initVals);
  const [months, setMonths] = useState<number[]>(p.monthsOptions);
  const [active, setActive] = useState(p.status === 'active');
  const [autoLock, setAutoLock] = useState(p.meta?.autoLock !== false);
  const [err, setErr] = useState('');
  useEffect(() => { setErr(''); }, [vals, months]);
  const orgCount = orgs ? orgsWith(p.kind, orgs).length : 0;
  const invalid = (f: (typeof fields)[number]) => !(vals[f.key] >= f.min && vals[f.key] <= f.max);

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
    <Drawer open onClose={onClose} label={`ویرایش ${p.name}`}>
      <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={ui.d} size={20} /></span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><h6 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ویرایش — {p.name}</h6><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>پارامترهای پیش‌فرض برای سازمان‌های جدید</span></span>
        <button type="button" className="ibtn" aria-label="بستن" onClick={onClose} style={{ width: 32, height: 32 }}><Icon d={IC.x} size={18} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fields.map((f) => (
          <div key={f.key} className="fg"><label className="fl" htmlFor={'pf-' + f.key}>{f.label}</label>
            <BoxNum id={'pf-' + f.key} value={vals[f.key]} onChange={(n) => setVals({ ...vals, [f.key]: n })} suffix={f.suffix} decimals={f.decimals} invalid={invalid(f)} />
          </div>
        ))}
      </div>
      {ui.monthChoices.length > 0 && (
        <div className="fg"><span className="fl">{ui.monthsLabel}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {ui.monthChoices.map((m) => {
              const on = months.includes(m);
              return <Chip key={m} dir="ltr" on={on} onClick={() => setMonths(on ? months.filter((x) => x !== m) : [...months, m])} style={{ height: 30, minWidth: 44 }}>{faDigits(m)}</Chip>;
            })}
          </div>
        </div>
      )}
      <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500 }}>قفل خودکار هنگام تأیید · نوع «{ui.lock === 'installment' ? 'اقساطی' : 'وثیقه'}»</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ui.lockRule(p)}؛ {ui.lockRelease}</span></span>
        <Sw on={autoLock} onClick={() => setAutoLock(!autoLock)} label="قفل خودکار وثیقه" />
      </div>
      <div style={{ minHeight: 48, display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px dashed var(--divider)' }}>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}><span style={{ fontSize: 13, fontWeight: 500 }}>محصول فعال</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>غیرفعال‌سازی فقط روی درخواست‌های جدید اثر دارد</span></span>
        <Sw on={active} onClick={() => setActive(!active)} label="محصول فعال" />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, background: 'var(--soft-info)', color: 'var(--info-text)', fontSize: 12, fontWeight: 500, lineHeight: 1.5 }}>
        <Icon d={IC.info} size={18} style={{ flex: 'none', marginTop: 1 }} />
        <span>تغییر پیش‌فرض روی {faDigits(orgCount)} سازمان فعال اثر ندارد؛ قراردادهای موجود مقادیر خود را نگه می‌دارند.</span>
      </div>
      <FormError>{err}</FormError>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <button type="button" className="btnp" onClick={save} disabled={update.isPending} style={{ flex: 1, height: 40, boxShadow: 'var(--shadow-primary)', opacity: update.isPending ? 0.7 : 1 }}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره تغییرات'}</button>
        <button type="button" className="btno" onClick={onClose} style={{ height: 40 }}>انصراف</button>
      </div>
    </Drawer>
  );
}
