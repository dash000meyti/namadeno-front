'use client';
import { PanelShell, type NavGroup, type SearchItem } from '@/components/panel/PanelShell';
import { useOrgMe, useOrgRequests } from '@/api/org';
import { setSession } from '@/api/client';
import { routes } from '@/lib/routes';
import { faDigits } from '@/lib/format';

const I = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  pkg: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  credit: 'M3 6h18v12H3zM3 10h18M7 15h3',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  reports: 'M4 20h16M7 16V10M12 16V5M17 16v-3',
  contract: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1',
};

export default function OrgPanelLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useOrgMe();
  const { data: pending } = useOrgRequests('pending');
  const count = pending?.length ?? 0;
  const org = me?.organization;
  const groups: NavGroup[] = [
    { title: 'کلی', items: [
      { label: 'داشبورد', href: routes.org.dashboard, d: I.dashboard },
      { label: 'کارکنان', href: routes.org.employees, d: I.users },
      { label: 'بسته‌های دارایی', href: routes.org.packages, d: I.pkg },
      { label: 'تسهیلات و اعتبار', href: routes.org.credit, d: I.credit },
      { label: 'درخواست‌ها', href: routes.org.requests, d: I.inbox, badge: count },
    ] },
    { title: 'مدیریت', items: [
      { label: 'گزارش‌ها', href: routes.org.reports, d: I.reports },
      { label: 'تنظیمات قرارداد', href: routes.org.contract, d: I.contract },
    ] },
  ];
  const search: SearchItem[] = [
    { title: 'کارکنان', sub: 'فهرست و پروفایل کارکنان', kind: 'صفحه', d: I.users, href: routes.org.employees },
    { title: 'سارا محمدی', sub: 'کد پرسنلی ۱۰۴۸ · فنی', kind: 'کارمند', d: I.user, href: routes.org.employee('u-1001'), tone: ['var(--soft-info)', 'var(--info-text)'] },
    { title: 'پاداش مهر ۱۴۰۵', sub: 'بسته ارسال‌شده', kind: 'بسته', d: I.pkg, href: routes.org.package('pkg-mehr'), tone: ['var(--soft-warning)', 'var(--warning-text)'] },
    { title: 'قرارداد پروژه پرتال منابع انسانی', sub: 'آزادسازی مرحله‌ای', kind: 'بسته', d: I.pkg, href: routes.org.package('pkg-ms-portal') },
    { title: 'ارسال بسته دارایی', sub: 'شروع ارسال جدید', kind: 'عملیات', d: I.pkg, href: routes.org.newRecipients() },
    { title: 'درخواست‌ها', sub: faDigits(count) + ' درخواست در انتظار', kind: 'صفحه', d: I.inbox, href: routes.org.requests },
    { title: 'گزارش‌ها', sub: 'گزارش بسته‌ها و تخصیص', kind: 'صفحه', d: I.reports, href: routes.org.reports },
  ];
  return (
    <PanelShell
      surface="org"
      brandSub="· سازمان"
      homeHref={routes.org.dashboard}
      groups={groups}
      user={{ name: me?.admin.name ?? 'نیما رضایی', role: me?.admin.role ?? 'مدیر منابع انسانی', letter: (me?.admin.name ?? 'ن')[0] }}
      logoutHref={routes.org.login}
      onLogout={() => setSession(null, 'org_admin')}
      orgSwitcher={{ name: org?.name ?? 'هلدینگ آرمان', sub: `سازمان فعال · ${faDigits(org?.employees ?? 384)} کارمند`, contract: org?.contractNo ?? 'AR-1042', settingsHref: routes.org.contract }}
      searchPlaceholder="جستجو…"
      searchItems={search}
      primaryAction={{ label: 'ارسال بسته دارایی', href: routes.org.newRecipients(), d: I.pkg }}
      bell={{ href: routes.org.requests, count, label: 'اعلان‌ها و درخواست‌ها' }}
      settingsHref={routes.org.contract}
    >
      {children}
    </PanelShell>
  );
}
