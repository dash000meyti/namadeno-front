'use client';
/** Data helpers shared by the org panel screens: icon paths, status meta, number/date helpers, CSV, the milestone bar. UI comes from the Panel kit. */
import { faDigits, money } from '@/lib/format';
import { jParts, jalaliToIsoAny } from '@/lib/jalali';
import type { Employee, MilestoneStep, RequestKind } from '@/types/domain';
import { ApiRequestError } from '@/api/client';

export const I = {
  pkg: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M7 10l5 5 5-5',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  kebab: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M5.6 5.6l12.8 12.8',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  percent: 'M19 5L5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2',
  credit: 'M3 6h18v12H3zM3 10h18M7 15h3',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6zM9 12l2 2 4-4',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H15',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  undo: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
  mail: 'M3 6h18v12H3zM3 6l9 7 9-7',
  file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5',
  xls: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5M9 12l6 6M15 12l-6 6',
  filters: 'M4 6h16M7 12h10M10 18h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  wallet: 'M3 7h18v12H3zM3 7l2-3h12l2 3M15 12h3',
};

export type ToneName = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'default' | 'secondary';

/** Employee status → design label/tone. */
export const EMP_STATUS: Record<Employee['status'], { label: string; tone: ToneName }> = {
  active: { label: 'فعال', tone: 'success' },
  invited: { label: 'در انتظار فعال‌سازی', tone: 'warning' },
  inactive: { label: 'تعلیق', tone: 'error' },
};

export const REQ_KIND: Record<RequestKind, { label: string; title: string; tone: ToneName }> = {
  loan: { label: 'وام', title: 'درخواست وام', tone: 'primary' },
  cash_withdrawal: { label: 'برداشت نقدی', title: 'درخواست برداشت نقدی', tone: 'info' },
  credit_increase: { label: 'اعتبار', title: 'درخواست افزایش اعتبار کارت', tone: 'warning' },
  milestone_release: { label: 'تأیید مرحله', title: 'تأیید مرحله قرارداد', tone: 'primary' },
  installment: { label: 'اقساطی', title: 'درخواست خرید اقساطی', tone: 'secondary' },
  profile_change: { label: 'تغییر اطلاعات', title: 'درخواست تغییر اطلاعات', tone: 'default' },
};


/** Fund/wallet colors used by the charts. */
export const KIND_COLOR: Record<string, string> = {
  rial: 'var(--chart-4)', gold: 'var(--warning-main)', fixed: 'var(--chart-3)', equity: 'var(--primary-main)', mixed: 'var(--success-main)', silver: 'var(--grey-500)',
};

/** Splits a Toman amount into a short number and its unit: 1.86e10 → ['۱۸٫۶', 'میلیارد تومان']. */
export function compactParts(n: number): [string, string] {
  const abs = Math.abs(n);
  const f = (v: number) => (n < 0 ? '−' : '') + faDigits(String(Math.round(v * 10) / 10), true);
  if (abs >= 1e9) return [f(abs / 1e9), 'میلیارد تومان'];
  if (abs >= 1e6) return [f(abs / 1e6), 'میلیون تومان'];
  return [money(n), 'تومان'];
}
/** Jalali helpers now live in src/lib/jalali.ts (shared with the app's date picker). */
export { jParts, jalaliToIsoAny };

/** Million with one decimal: 30_000_000 → «۳۰» */
export const million = (n: number) => faDigits(String(Math.round(n / 1e5) / 10), true);

export const errMsg = (e: unknown) => (e instanceof ApiRequestError || e instanceof Error ? e.message : 'خطا در ارتباط با سرور');

/** Milestone progress segments (released solid, pending outlined). */
export function MsSeg({ steps, height = 6, width, label }: { steps: Pick<MilestoneStep, 'sharePct' | 'status' | 'id'>[]; height?: number; width?: number; label?: string }) {
  return (
    <div className="lkseg" role="img" aria-label={label} style={{ height, width, flex: width ? 'none' : undefined }}>
      {steps.map((s) => <span key={s.id} className={s.status === 'released' ? 'r' : s.status === 'pending_approval' ? 'p' : ''} style={{ flex: s.sharePct }} />)}
    </div>
  );
}

/** Downloads a CSV (UTF-8 with BOM so Excel shows Persian correctly). */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
