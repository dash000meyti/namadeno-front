import type { MockDB } from '../db';
import { daysFromNow, jalaliToIso } from '@/lib/clock';

/** Shape of db.extra.orgPackages (owned by the "org-packages" area). */
export interface OrgPkgSchedule {
  id: string;
  title: string;
  period: string;
  to: string;
  format: 'Excel' | 'PDF';
  lastAt?: string;
  enabled: boolean;
  tone: 'primary' | 'info' | 'warning' | 'success';
  icon: 'wallet' | 'percent' | 'file' | 'pkg' | 'clock';
}
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
  /** packageId → milestone step ids the organization sent back for correction */
  fixRequests: Record<string, string[]>;
  schedules: OrgPkgSchedule[];
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
    fixRequests: {},
    schedules: [
      { id: 's1', title: 'گزارش ماهانه حقوق و مزایا', period: 'ماهانه · اول هر ماه', to: 'مدیر مالی، منابع انسانی', format: 'Excel', lastAt: jalaliToIso(1405, 8, 1), enabled: true, tone: 'primary', icon: 'wallet' },
      { id: 's2', title: 'گزارش تسهیلات و اقساط', period: 'هفتگی · شنبه‌ها', to: 'مدیر مالی', format: 'PDF', lastAt: jalaliToIso(1405, 8, 10), enabled: true, tone: 'info', icon: 'percent' },
      { id: 's3', title: 'گزارش مالیاتی فصلی', period: 'فصلی · پایان فصل', to: 'امور مالی، حسابرس', format: 'Excel', lastAt: jalaliToIso(1405, 6, 31), enabled: false, tone: 'warning', icon: 'file' },
      { id: 's4', title: 'بسته‌های تأییدنشده و مراحل منتظر تأیید', period: 'روزانه · ۰۹:۰۰', to: 'منابع انسانی', format: 'PDF', lastAt: daysFromNow(0, '09:00'), enabled: true, tone: 'success', icon: 'pkg' },
    ],
    exports: [
      { id: 'payroll', title: 'گزارش حقوق و مزایا', desc: 'بسته‌ها، قفل‌ها و مراحل', lastAt: jalaliToIso(1405, 8, 1), tone: 'primary', icon: 'wallet' },
      { id: 'credit', title: 'گزارش تسهیلات', desc: 'اقساط و قفل وثیقه', lastAt: jalaliToIso(1405, 8, 10), tone: 'info', icon: 'percent' },
      { id: 'tax', title: 'گزارش مالیاتی', desc: 'مزایای غیرنقدی مشمول مالیات · فصل پاییز', lastAt: jalaliToIso(1405, 6, 31), tone: 'warning', icon: 'file' },
    ],
    chain: [
      { id: 'c1', label: 'نیاز به تأیید مدیر مالی', desc: 'برای هر بسته، پیش از ارسال به کارکنان', enabled: true, locked: true },
      { id: 'c2', label: 'تأیید دومرحله‌ای بسته‌های بزرگ', desc: 'بسته‌های بالای ۵ میلیارد تومان · مدیرعامل', enabled: true, locked: false },
      { id: 'c3', label: 'تأیید HR برای برداشت نقدی', desc: 'درخواست‌های برداشت از بسته‌های نقدی‌مجاز', enabled: false, locked: false },
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
