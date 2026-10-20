'use client';
/** Glass bottom tab bar of the mobile app. */
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { usePendingCount } from '@/api/app';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';

export type AppTab = 'assets' | 'inbox' | 'credit' | 'card' | 'history';

const TABS: { key: AppTab; label: string; icon: IconName; href: string }[] = [
  { key: 'assets', label: 'دارایی‌ها', icon: 'assets', href: routes.app.home },
  { key: 'inbox', label: 'دریافتی‌ها', icon: 'inbox', href: routes.app.inbox() },
  { key: 'credit', label: 'اعتبار', icon: 'credit', href: routes.app.credit },
  { key: 'card', label: 'کارت', icon: 'card', href: routes.app.card },
  { key: 'history', label: 'تاریخچه', icon: 'history', href: routes.app.history() },
];

export function BottomNav({ active }: { active?: AppTab }) {
  const pending = usePendingCount();
  return (
    <nav className="glass bnav" aria-label="منوی اصلی">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} aria-current={on ? 'page' : undefined} style={{ color: on ? 'var(--primary-text)' : 'var(--text-secondary)' }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={t.icon} />
              {t.key === 'inbox' && pending > 0 && (
                <span style={{ position: 'absolute', top: -5, left: -9, minWidth: 16, height: 16, boxSizing: 'border-box', padding: '0 4px', borderRadius: 999, background: 'var(--error-main)', color: '#FFFFFF', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center', lineHeight: 1, boxShadow: '0 0 0 2px var(--bg-paper)' }}>
                  {faDigits(pending)}
                </span>
              )}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
