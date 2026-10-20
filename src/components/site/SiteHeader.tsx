'use client';
/** Sticky glass header of the public site: logo, main nav, theme toggle, CTAs and the mobile menu (< 1080px). */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';
import { useColorMode } from '@/theme/ColorModeProvider';
import { SiteLogo } from './Logo';

export const SITE_NAV: { label: string; href: string; icon: IconName }[] = [
  { label: 'محصول', href: '/#product', icon: 'assets' },
  { label: 'سازمان‌ها', href: routes.site.business, icon: 'building' },
  { label: 'وبلاگ', href: routes.site.blog, icon: 'doc' },
  { label: 'سوالات متداول', href: routes.site.faq, icon: 'help' },
  { label: 'تماس', href: routes.site.contact, icon: 'chat' },
];

function isActive(pathname: string, href: string) {
  if (href.includes('#')) return false;
  return pathname === href || pathname.startsWith(href + '/');
}

export function ThemeToggle() {
  const { mode, toggle } = useColorMode();
  const dark = mode === 'dark';
  return (
    <button type="button" className="ibtn" onClick={toggle} aria-label={dark ? 'تم روشن' : 'تم تیره'} title={dark ? 'تم روشن' : 'تم تیره'}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  // close the menu on navigation
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => { if (window.innerWidth >= 1080) setOpen(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // The menu is rendered next to (not inside) the header: the header's backdrop-filter
  // would otherwise become the containing block of the fixed overlay.
  return (
    <>
      <header className="glass s-hdr">
        <div className="s-wrap s-hdr-bar">
          <SiteLogo size={36} />
          <nav className="s-nav" aria-label="منوی اصلی">
            {SITE_NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isActive(pathname, n.href) ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="s-hdr-end">
            <ThemeToggle />
            <Link href={routes.org.login} className="btn outlined c-primary s-hdr-cta">
              <Icon name="building" />پنل سازمان
            </Link>
            <Link href={routes.app.login} className="btn contained c-primary s-hdr-cta app">
              ورود به اپ
            </Link>
            <button
              type="button"
              className="ibtn s-menu-btn"
              aria-label={open ? 'بستن منو' : 'باز کردن منو'}
              aria-expanded={open}
              aria-controls="s-mobile-menu"
              onClick={() => setOpen((v) => !v)}
            >
              <Icon d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="s-mmenu" onClick={() => setOpen(false)}>
          <nav id="s-mobile-menu" aria-label="منوی موبایل" className="glass s-mmenu-panel" onClick={(e) => e.stopPropagation()}>
            {SITE_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="s-mlink" aria-current={isActive(pathname, n.href) ? 'page' : undefined} onClick={() => setOpen(false)}>
                <Icon name={n.icon} />{n.label}
              </Link>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <Link href={routes.org.login} className="btn lg outlined c-primary" onClick={() => setOpen(false)}>پنل سازمان</Link>
              <Link href={routes.app.login} className="btn lg contained c-primary" onClick={() => setOpen(false)}>ورود به اپ</Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
