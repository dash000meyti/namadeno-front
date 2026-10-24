'use client';
/** Fund pieces shared by the operator fund list (inspector) and the fund page: NAV chart and the edit dialog. */
import { useState } from 'react';
import { useUpdateFundX, type OpFund } from '@/api/op-system-extra';
import { Chips, Dialog, Field, LineChart, Note, NumInput } from '@/components/panel/kit';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/op/system/fmt';
import { CATEGORIES, CATEGORY_LABEL } from '@/components/op/system/funds';
import { jDayMonth, money } from '@/lib/format';

/** Rounded lower bound for a NAV axis, so small moves stay visible instead of flattening against zero. */
export function axisMin(vals: number[]) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || hi * 0.02 || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span)));
  return Math.max(0, Math.floor((lo - span * 0.2) / step) * step);
}

/** NAV line chart (big NAVs read in thousands of Toman). */
export function NavChart({ points, height, label }: { points: { t: string; v: number }[]; height: number; label: string }) {
  const vals = points.map((p) => p.v);
  const big = Math.max(...vals) >= 1e6;
  return (
    <LineChart label={label} height={height} min={axisMin(vals)} labels={points.map((p) => jDayMonth(p.t))}
      fmt={(n) => money(big ? Math.round(n / 1000) : n)}
      series={[{ name: 'NAV', color: 'var(--chart-1)', values: vals, area: true }]} />
  );
}

/** Edit name, symbol, category, manager and the short description shown in the app. */
export function FundEditDialog({ f, onClose }: { f: OpFund; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateFundX();
  const [d, setD] = useState({ name: f.name, symbol: f.symbol, category: f.category, manager: f.meta?.manager ?? '', description: f.description });
  const [tried, setTried] = useState(false);
  const [err, setErr] = useState('');
  const errors = {
    name: !d.name.trim() ? 'نام صندوق الزامی است.' : '',
    symbol: !d.symbol.trim() ? 'نماد بورسی الزامی است.' : '',
    description: d.description.trim().length < 5 ? 'توضیح کوتاه را کامل‌تر بنویسید.' : '',
  };
  const shown = (k: keyof typeof errors) => (tried && errors[k] ? errors[k] : undefined);
  const set = (patch: Partial<typeof d>) => { setD((x) => ({ ...x, ...patch })); setErr(''); };
  const save = () => {
    setTried(true);
    if (errors.name || errors.symbol || errors.description) return;
    setErr('');
    update.mutate({ id: f.id, name: d.name.trim(), symbol: d.symbol.trim(), category: d.category, description: d.description.trim(), meta: { manager: d.manager.trim() } }, {
      onSuccess: () => { toast('اطلاعات صندوق ذخیره شد'); onClose(); },
      onError: (e) => setErr(errMsg(e)),
    });
  };
  return (
    <Dialog open onClose={onClose} width={560} title={`ویرایش ${f.name}`}
      footer={<><button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button><button type="button" className="nm-btn" onClick={save} disabled={update.isPending}>{update.isPending ? 'در حال ذخیره…' : 'ذخیره'}</button></>}>
      <div className="nm-grid c2" style={{ gap: 12 }}>
        <Field label="نام صندوق" htmlFor="e-name" error={shown('name')}><NumInput text full id="e-name" value={d.name} onChange={(v) => set({ name: v })} invalid={!!shown('name')} /></Field>
        <Field label="نماد بورسی" htmlFor="e-sym" error={shown('symbol')}><NumInput text full id="e-sym" value={d.symbol} onChange={(v) => set({ symbol: v })} invalid={!!shown('symbol')} /></Field>
      </div>
      <Field label="نوع">
        <Chips label="نوع صندوق" value={d.category} onChange={(c) => set({ category: c })} options={CATEGORIES.map((c) => ({ key: c, label: `ETF ${CATEGORY_LABEL[c]}` }))} />
      </Field>
      <Field label="مدیر صندوق" htmlFor="e-mgr"><NumInput text full id="e-mgr" value={d.manager} onChange={(v) => set({ manager: v })} /></Field>
      <Field label="توضیح کوتاه (نمایش در اپ)" htmlFor="e-desc" error={shown('description')}>
        <NumInput text full id="e-desc" value={d.description} onChange={(v) => set({ description: v })} invalid={!!shown('description')} />
      </Field>
      {err && <Note tone="err">{err}</Note>}
    </Dialog>
  );
}
