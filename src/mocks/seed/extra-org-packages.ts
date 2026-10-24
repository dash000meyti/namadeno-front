import type { MockDB } from '../db';
import { jalaliToIso } from '@/lib/clock';

/** Shape of db.extra.orgPackages (owned by the "org-packages" area). */
export interface OrgPkgExport {
  id: 'payroll' | 'credit' | 'tax';
  title: string;
  desc: string;
  lastAt?: string;
  tone: 'primary' | 'info' | 'warning';
  icon: 'wallet' | 'percent' | 'file';
}
export interface OrgPkgChainItem { id: string; label: string; desc: string; enabled: boolean; locked: boolean }
export interface OrgPkgStore {
  /** packageId → employee ids that were reminded */
  reminders: Record<string, string[]>;
  exports: OrgPkgExport[];
  chain: OrgPkgChainItem[];
  chainUpdatedAt?: string;
  /** Monthly totals (toman) of the four months before Farvardin 1405 — extends the yearly chart. */
  earlierMonths: { month: string; sent: number }[];
  /** Weekly baseline (toman) of the last 4 weeks; real sends are added on top. */
  weeklyBaseline: number[];
}

export function defaultOrgPkgStore(): OrgPkgStore {
  return {
    reminders: {},
    exports: [
      { id: 'payroll', title: 'گزارش حقوق و مزایا', desc: 'بسته‌ها، رزروها و مراحل', lastAt: jalaliToIso(1405, 8, 1), tone: 'primary', icon: 'wallet' },
      { id: 'credit', title: 'گزارش تسهیلات', desc: 'اقساط و رزرو پشتوانه', lastAt: jalaliToIso(1405, 8, 10), tone: 'info', icon: 'percent' },
      { id: 'tax', title: 'گزارش مالیاتی', desc: 'مزایای غیرنقدی مشمول مالیات · فصل پاییز', lastAt: jalaliToIso(1405, 6, 31), tone: 'warning', icon: 'file' },
    ],
    chain: [
      { id: 'c1', label: 'تأیید نهایی توسط تأییدکننده', desc: 'برای هر بسته، پیش از ارسال به کارکنان', enabled: true, locked: true },
      { id: 'c2', label: 'تأیید دومرحله‌ای بسته‌های بزرگ', desc: 'بسته‌های بالای ۵ میلیارد تومان · مدیرعامل', enabled: true, locked: false },
      { id: 'c4', label: 'اطلاع‌رسانی پس از ارسال', desc: 'پیامک و اعلان به کارکنان گیرنده', enabled: true, locked: false },
    ],
    chainUpdatedAt: jalaliToIso(1405, 4, 10),
    earlierMonths: [
      { month: 'آذر', sent: 3.4e9 },
      { month: 'دی', sent: 4.1e9 },
      { month: 'بهمن', sent: 2.8e9 },
      { month: 'اسفند', sent: 8.6e9 },
    ],
    weeklyBaseline: [0.62e9, 0.48e9, 0.71e9, 0.49e9],
  };
}

/** Extra mock data owned by the "org-packages" area (stored under db.extra.orgPackages). */
export function seed_orgPackages(db: MockDB) {
  db.extra.orgPackages = defaultOrgPkgStore();
}
