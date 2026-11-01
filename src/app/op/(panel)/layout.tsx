'use client';
/**
 * Operator console shell. The console is built around the treasury: پایش (overview, activity, risk) · خزانه (fund stock,
 * orders to funds, cash, planning and targets) · مشتریان (organizations, users, requests) · تنظیمات.
 * Badges and the ⌘K list come from live data (treasury actions, pending requests, organizations, funds).
 */
import { PanelShell, type NavGroup, type SearchItem } from '@/components/panel/PanelShell';
import { useOpOrganizations, useOpRequests } from '@/api/op';
import { useTreasuryActions, useTreasuryPositions } from '@/api/op-treasury-extra';
import { setSession } from '@/api/client';
import { routes } from '@/lib/routes';
import { FEATURES } from '@/lib/features';
import { compactMoney, faDigits } from '@/lib/format';

const I = {
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  risk: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9.5C7.4 20.3 4 16.5 4 12V6zM12 9v4M12 16.5h.01',
  stock: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  order: 'M7 4h10l3 3v13H4V4zM8 10h8M8 14h8M8 18h5',
  cash: 'M3 7h18v12H3zM3 11h18M7 15h3',
  plan: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  building: 'M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.2a3.5 3.5 0 0 1 0 6.6',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4',
  rules: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
};

export default function OpPanelLayout({ children }: { children: React.ReactNode }) {
  const { data: pending } = useOpRequests({ status: 'pending' });
  const { data: actions } = useTreasuryActions();
  const { data: orgs } = useOpOrganizations();
  const { data: positions } = useTreasuryPositions();
  const acts = actions ?? [];
  const requests = pending?.length ?? 0;
  const dueOrders = acts.filter((a) => a.kind === 'order_settle').length;
  const overdueDeposits = acts.filter((a) => a.kind === 'deposit_overdue').length;
  const urgent = acts.filter((a) => a.severity !== 'info').length;

  const groups: NavGroup[] = [
    { title: 'پایش', items: [
      { label: 'نمای کلی', href: routes.op.overview, tone: 'primary', d: I.dashboard },
      { label: 'فعالیت‌ها', href: routes.op.activity, tone: 'info', d: I.activity },
      { label: 'ریسک و تقلب', short: 'ریسک', href: routes.op.risk, tone: 'error', d: I.risk },
    ] },
    { title: 'خزانه', items: [
      { label: 'موجودی صندوق‌ها', short: 'موجودی', href: routes.op.funds, tone: 'success', d: I.stock },
      { label: 'سفارش‌ها', href: routes.op.orders, tone: 'primary', d: I.order, badge: dueOrders },
      { label: 'نقدینگی', href: routes.op.cash, tone: 'warning', d: I.cash, badge: overdueDeposits },
      { label: 'برنامه‌ریزی و اهداف', short: 'برنامه‌ریزی', href: routes.op.planning, tone: 'secondary', d: I.plan },
    ] },
    { title: 'مشتریان', items: [
      { label: 'سازمان‌ها', href: routes.op.organizations, tone: 'secondary', d: I.building },
      { label: 'کاربران', href: routes.op.users, tone: 'info', d: I.users },
      { label: 'درخواست‌ها', href: routes.op.requests, tone: 'warning', d: I.inbox, badge: requests },
      { label: 'محصولات اعتباری', short: 'محصولات', href: routes.op.products, tone: 'primary', d: I.card, soon: !FEATURES.orgCredit },
    ] },
    { title: 'تنظیمات', items: [
      { label: 'قوانین و محدودیت‌ها', short: 'قوانین', href: routes.op.rules, tone: 'ink', d: I.rules },
      { label: 'تنظیمات', href: routes.op.settings, tone: 'ink', d: I.settings },
    ] },
  ];

  // ⌘K: pages, then funds and organizations from live data
  const search: SearchItem[] = [
    { title: 'موجودی صندوق‌ها', sub: 'خزانه · تخصیص، رزرو و موجودی آزاد', kind: 'صفحه', d: I.stock, href: routes.op.funds },
    { title: 'سفارش‌ها', sub: dueOrders ? `${faDigits(dueOrders)} سفارش سررسید تسویه` : 'صدور و ابطال واحد', kind: 'صفحه', d: I.order, href: routes.op.orders },
    { title: 'نقدینگی', sub: overdueDeposits ? `${faDigits(overdueDeposits)} واریز با دیرکرد` : 'حساب ریالی و واریز سازمان‌ها', kind: 'صفحه', d: I.cash, href: routes.op.cash },
    { title: 'برنامه‌ریزی و اهداف', sub: 'پیش‌بینی تقاضا و هدف‌ها', kind: 'صفحه', d: I.plan, href: routes.op.planning },
    { title: 'فعالیت‌ها', sub: 'کاربران، سازمان‌ها و تیم نمادنو', kind: 'صفحه', d: I.activity, href: routes.op.activity },
    { title: 'درخواست‌ها', sub: `${faDigits(requests)} در انتظار بررسی`, kind: 'صفحه', d: I.inbox, href: routes.op.requests },
    ...(positions ?? []).filter((p) => p.status === 'active').map((p): SearchItem => ({
      title: p.name, sub: `موجودی ${compactMoney(p.heldValue)} · آزاد ${compactMoney(p.availableValue)}`, kind: 'صندوق', d: I.stock, href: routes.op.fund(p.fundId),
      tone: ['var(--soft-warning)', 'var(--warning-text)'],
    })),
    ...(orgs ?? []).map((o): SearchItem => ({
      title: o.name, sub: `قرارداد ${o.contractNo} · ${faDigits(o.employees)} کارمند`, kind: 'سازمان', d: I.building, href: routes.op.organization(o.id),
    })),
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
      searchPlaceholder="جستجوی صندوق، سازمان، صفحه…"
      searchItems={search}
      envLabel="Production"
      bell={{ href: routes.op.overview, count: urgent, label: 'صف اقدام' }}
      settingsHref={routes.op.settings}
    >
      {children}
    </PanelShell>
  );
}
