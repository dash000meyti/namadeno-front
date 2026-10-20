'use client';
/** Glass top bar of the mobile app (design: 60px, title, notifications + help icons). */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useNotifications } from '@/api/app';
import { routes } from '@/lib/routes';

interface Props {
  title?: React.ReactNode;
  /** true → router.back(); string → link target. Omit for tab roots. */
  back?: boolean | string;
  backIcon?: 'back' | 'close';
  backLabel?: string;
  /** Rendered right after the title (e.g. a fund symbol chip). */
  badge?: React.ReactNode;
  /** Replaces back + title (e.g. the home greeting). */
  leading?: React.ReactNode;
  /** Extra icon buttons placed before the notification bell. */
  actions?: React.ReactNode;
  /** Extra icon buttons after the help icon. */
  trailing?: React.ReactNode;
  hideDefaultActions?: boolean;
  transparent?: boolean;
}

export function AppHeader({ title, back, backIcon = 'back', backLabel, badge, leading, actions, trailing, hideDefaultActions, transparent }: Props) {
  const router = useRouter();
  const { data: notifs } = useNotifications();
  const unread = (notifs ?? []).some((n) => !n.read);
  const backEl = back ? (
    typeof back === 'string' ? (
      <Link href={back} className="ibtn" aria-label={backLabel ?? (backIcon === 'close' ? 'بستن' : 'بازگشت')} style={{ marginLeft: -4, color: 'var(--text-primary)' }}>
        <Icon name={backIcon} />
      </Link>
    ) : (
      <button className="ibtn" aria-label={backLabel ?? 'بازگشت'} onClick={() => router.back()} style={{ marginLeft: -4 }}>
        <Icon name={backIcon} />
      </button>
    )
  ) : null;

  const firstAction = { width: 32, height: 32, flex: 'none' as const, marginRight: 'auto' };
  const nextAction = { width: 32, height: 32, flex: 'none' as const, marginRight: -8 };

  return (
    <header className={transparent ? 'top' : 'glass top'} style={transparent ? { borderBottom: 0, background: 'transparent' } : undefined}>
      {leading ?? (
        <>
          {backEl}
          {title !== undefined && <span style={{ fontSize: 18, fontWeight: 700, marginRight: back ? 0 : 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{title}</span>}
          {badge}
        </>
      )}
      {hideDefaultActions ? (
        <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>{actions}{trailing}</span>
      ) : (
        <>
          {actions ? <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>{actions}</span> : null}
          <Link href={routes.app.notifications} className="ibtn" aria-label="اعلان‌ها" style={{ ...(actions ? nextAction : firstAction), position: 'relative', color: 'var(--text-primary)' }}>
            <Icon name="bell" />
            {unread && <span style={{ position: 'absolute', top: 3, left: 5, width: 9, height: 9, borderRadius: '50%', background: 'var(--error-main)', boxShadow: '0 0 0 2px var(--bg-paper)' }} />}
          </Link>
          <Link href={routes.app.support} className="ibtn" aria-label="راهنما و پشتیبانی" style={{ ...nextAction, color: 'var(--text-primary)' }}>
            <Icon name="help" />
          </Link>
          {trailing}
        </>
      )}
    </header>
  );
}

/** Small icon button that matches the header's tight spacing (use inside `actions`/`trailing`). */
export function HeaderIconButton({ icon, d, label, onClick, href, color = 'var(--text-secondary)', first }: { icon?: Parameters<typeof Icon>[0]['name']; d?: string; label: string; onClick?: () => void; href?: string; color?: string; first?: boolean }) {
  const style = { width: 32, height: 32, flex: 'none' as const, marginRight: first ? 0 : -8, color };
  if (href) return <Link href={href} className="ibtn" aria-label={label} style={style}><Icon name={icon} d={d} /></Link>;
  return <button className="ibtn" aria-label={label} onClick={onClick} style={style}><Icon name={icon} d={d} /></button>;
}
