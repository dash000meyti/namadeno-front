'use client';
import { PanelShell, type NavGroup, type SearchItem } from '@/components/panel/PanelShell';
import { useOpRequests } from '@/api/op';
import { setSession } from '@/api/client';
import { routes } from '@/lib/routes';

const I = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  funds: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  rules: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  risk: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM12 9v4M12 16.5h.01',
  reports: 'M4 20h16M7 16V10M12 16V5M17 16v-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 20v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1',
  gold: 'M4 17l2-6h5l1 6zM12 17l1-6h5l2 6zM8 11l2-6h4l2 6',
};

export default function OpPanelLayout({ children }: { children: React.ReactNode }) {
  const { data: pending } = useOpRequests({ status: 'pending' });
  const count = pending?.length ?? 0;
  const groups: NavGroup[] = [
    { title: 'عملیات', items: [
      { label: 'نمای کلی', href: routes.op.overview, tone: 'primary', d: I.dashboard },
      { label: 'سازمان‌ها و قراردادها', short: 'سازمان‌ها', href: routes.op.organizations, tone: 'secondary', d: I.building },
      { label: 'کاربران', href: routes.op.users, tone: 'info', d: I.users },
      { label: 'درخواست‌ها', href: routes.op.requests, tone: 'warning', d: I.inbox, badge: count },
    ] },
    { title: 'محصول', items: [
      { label: 'صندوق‌ها', href: routes.op.funds, tone: 'success', d: I.funds },
      { label: 'محصولات اعتباری', short: 'محصولات', href: routes.op.products, tone: 'primary', d: I.card },
      { label: 'قوانین و محدودیت‌ها', short: 'قوانین', href: routes.op.rules, tone: 'ink', d: I.rules },
    ] },
    { title: 'سیستم', items: [
      { label: 'ریسک و تقلب', short: 'ریسک', href: routes.op.risk, tone: 'error', d: I.risk },
      { label: 'گزارش‌ها', href: routes.op.reports, tone: 'secondary', d: I.reports },
      { label: 'تنظیمات', href: routes.op.settings, tone: 'ink', d: I.settings },
    ] },
  ];
  const search: SearchItem[] = [
    { title: 'هلدینگ آرمان', sub: 'قرارداد AR-1042 · ۳۸۴ کارمند', kind: 'سازمان', d: I.building, href: routes.op.organization('org-arman') },
    { title: 'سارا محمدی', sub: 'هلدینگ آرمان · امتیاز اعتباری ۷۴۲', kind: 'کاربر', d: I.user, href: routes.op.user('u-1001'), tone: ['var(--soft-info)', 'var(--info-text)'] },
    { title: 'درخواست وام RQ-2041', sub: '۳۰٬۰۰۰٬۰۰۰ تومان · در انتظار بررسی', kind: 'درخواست', d: I.inbox, href: routes.op.requests, tone: ['var(--soft-warning)', 'var(--warning-text)'] },
    { title: 'صندوق طلا — طلانو', sub: 'NAV ۳٬۰۱۵٬۰۰۰ · AUM ۲۵۹ میلیارد', kind: 'صندوق', d: I.gold, href: routes.op.fund('gold'), tone: ['var(--soft-warning)', 'var(--warning-text)'] },
    { title: 'هشدار AL-3318 — برداشت غیرعادی', sub: 'امتیاز ریسک ۸۲ · باز', kind: 'هشدار', d: I.risk, href: routes.op.risk, tone: ['var(--soft-error)', 'var(--error-text)'] },
  ];
  return (
    <PanelShell
      surface="op"
      brandSub="بهره‌بردار"
      homeHref={routes.op.overview}
      groups={groups}
      user={{ name: 'علی نادری', role: 'مدیر محصول', letter: 'ع' }}
      logoutHref={routes.op.login}
      onLogout={() => setSession(null, 'operator')}
      searchPlaceholder="جستجوی سازمان، کاربر، تراکنش…"
      searchItems={search}
      envLabel="Production"
      bell={{ href: routes.op.requests, count, label: 'اعلان‌ها — درخواست‌ها' }}
      settingsHref={routes.op.settings}
    >
      {children}
    </PanelShell>
  );
}
