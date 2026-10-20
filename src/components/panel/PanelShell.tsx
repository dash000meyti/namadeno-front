'use client';
/**
 * Desktop shell shared by the organization panel and the operator console
 * (design: 300px glass side nav on the right, 72px glass header, scrolling <main>).
 */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon, LogoMark } from '@/components/ui/Icon';
import { useColorMode } from '@/theme/ColorModeProvider';
import { faDigits } from '@/lib/format';

export interface NavItem { label: string; href: string; d: string; badge?: number; match?: (path: string) => boolean }
export interface NavGroup { title: string; items: NavItem[] }
export interface SearchItem { title: string; sub: string; kind: string; d: string; href: string; tone?: [string, string] }

interface Props {
  surface: 'org' | 'op';
  brandSub: string; // «· سازمان» or «پنل بهره‌بردار»
  homeHref: string;
  groups: NavGroup[];
  user: { name: string; role: string; letter: string };
  logoutHref: string;
  onLogout?: () => void;
  /** Org switcher block under the logo (org panel). */
  orgSwitcher?: { name: string; sub: string; contract: string; settingsHref: string };
  searchPlaceholder: string;
  searchItems: SearchItem[];
  primaryAction?: { label: string; href: string; d: string };
  envLabel?: string;
  bell: { href: string; count: number; label: string };
  settingsHref: string;
  children: React.ReactNode;
}

const MOON = 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7';
const SUN = 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8';
const MENU = 'M4 7h16M4 12h16M4 17h16';
const LOGOUT = 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M14 17l5-5-5-5M19 12H9';
const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4';
const GEAR = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1';

export function PanelShell(p: Props) {
  const path = usePathname();
  const router = useRouter();
  const { mode, toggle } = useColorMode();
  const [mini, setMini] = useState(false);
  const [orgMenu, setOrgMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    try { setMini(localStorage.getItem(`nm-${p.surface}-nav-mini`) === '1'); } catch { /* ignore */ }
  }, [p.surface]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
      if (e.key === 'Escape') { setSearch(false); setOrgMenu(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggleMini = () => setMini((m) => { const n = !m; try { localStorage.setItem(`nm-${p.surface}-nav-mini`, n ? '1' : '0'); } catch { /* ignore */ } return n; });

  const isActive = (it: NavItem) => (it.match ? it.match(path) : it.href === p.homeHref ? path === it.href : path === it.href || path.startsWith(it.href + '/'));
  const allItems = p.groups.flatMap((g) => g.items);
  const results = useMemo(() => p.searchItems.filter((s) => !q || s.title.includes(q) || s.sub.includes(q) || s.kind.includes(q)), [p.searchItems, q]);

  const navLink = (it: NavItem) => {
    const on = isActive(it);
    return (
      <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 12px', borderRadius: 8, background: on ? 'var(--nav-active)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', fontSize: 14, fontWeight: on ? 600 : 500 }}>
        <Icon d={it.d} />
        <span style={{ flex: 1 }}>{it.label}</span>
        {!!it.badge && <span className="lbl" style={{ height: 22, padding: '0 7px', background: 'var(--error-main)', color: 'var(--error-contrast)' }}>{faDigits(it.badge)}</span>}
      </Link>
    );
  };

  return (
    <div className={`s-${p.surface}`} style={{ height: '100dvh', overflow: 'hidden', position: 'relative', background: 'var(--bg-default)', backgroundImage: 'var(--bg-aurora)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'row' }}>
      {!mini ? (
        <aside className="glass" style={{ width: 300, flex: 'none', position: 'relative', boxSizing: 'border-box', border: 0, borderLeft: '1px solid var(--divider)', boxShadow: 'none', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <Link href={p.homeHref} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px', color: 'inherit' }}>
            <LogoMark />
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="wm" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>نمادنو</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1 }}>{p.brandSub}</span>
            </span>
          </Link>
          {p.orgSwitcher && (
            <>
              <button onClick={() => setOrgMenu((x) => !x)} aria-expanded={orgMenu} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-neutral)', color: 'var(--text-primary)', textAlign: 'right', cursor: 'pointer' }}>
                <Icon d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h3a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2" size={20} style={{ color: 'var(--text-secondary)' }} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.orgSwitcher.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.orgSwitcher.sub}</span>
                </span>
                <Icon d={orgMenu ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
              {orgMenu && (
                <div className="glass" style={{ position: 'absolute', top: 136, right: 16, left: 16, zIndex: 15, borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--shadow-dropdown)' }}>
                  <button onClick={() => setOrgMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 10px', borderRadius: 8, border: 0, background: 'var(--nav-active)', color: 'var(--text-primary)', textAlign: 'right', cursor: 'pointer' }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{p.orgSwitcher.name[0]}</span>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.orgSwitcher.name}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>قرارداد <span dir="ltr">{p.orgSwitcher.contract}</span></span>
                    </span>
                    <Icon d="M5 12.5l4.5 4.5L19 7" size={18} style={{ color: 'var(--primary-text)' }} />
                  </button>
                  <span style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary)', padding: '4px 10px' }}>حساب شما فقط به این سازمان دسترسی دارد. برای افزودن سازمان با بهره‌بردار تماس بگیرید.</span>
                  <Link href={p.orgSwitcher.settingsHref} onClick={() => setOrgMenu(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                    <Icon d="M3 7h18v12H3zM3 7l2-3h12l2 3M15 12h3" size={16} />حساب سازمان و کاربران
                  </Link>
                </div>
              )}
            </>
          )}
          {p.groups.map((g) => (
            <nav key={g.title} aria-label={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'block', height: 24, lineHeight: '24px', padding: '0 12px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--grey-500)' }}>{g.title}</span>
              {g.items.map(navLink)}
            </nav>
          ))}
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--bg-neutral)' }}>
            <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, flex: 'none' }}>{p.user.letter}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.user.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.user.role}</span>
            </span>
            <Link href={p.logoutHref} onClick={p.onLogout} aria-label="خروج از پنل" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <Icon d={LOGOUT} size={16} />خروج
            </Link>
          </div>
        </aside>
      ) : (
        <aside className="glass" style={{ width: 88, flex: 'none', boxSizing: 'border-box', border: 0, borderLeft: '1px solid var(--divider)', boxShadow: 'none', padding: '20px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Link href={p.homeHref} aria-label={'نمادنو ' + p.brandSub}><LogoMark /></Link>
          <nav aria-label="منوی اصلی" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 8 }}>
            {allItems.map((it) => {
              const on = isActive(it);
              return (
                <Link key={it.href} href={it.href} aria-label={it.label} title={it.label} style={{ position: 'relative', width: 56, height: 48, borderRadius: 10, background: on ? 'var(--nav-active)' : 'transparent', color: on ? 'var(--primary-text)' : 'var(--text-secondary)', display: 'grid', placeItems: 'center' }}>
                  <Icon d={it.d} />
                  {!!it.badge && <span className="lbl" style={{ position: 'absolute', top: 2, left: 2, height: 18, padding: '0 5px', fontSize: 10, background: 'var(--error-main)', color: 'var(--error-contrast)' }}>{faDigits(it.badge)}</span>}
                </Link>
              );
            })}
          </nav>
          <Link href={p.logoutHref} onClick={p.onLogout} aria-label="خروج از پنل" title="خروج" style={{ marginTop: 'auto', width: 44, height: 44, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700 }}>{p.user.letter}</Link>
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="glass" style={{ height: 72, flex: 'none', position: 'relative', zIndex: 5, boxSizing: 'border-box', border: 0, borderBottom: '1px solid var(--glass-edge)', boxShadow: 'var(--glass-highlight)', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="ibtn" aria-label={mini ? 'باز کردن منو' : 'جمع کردن منو'} onClick={toggleMini}><Icon d={MENU} size={22} /></button>
          <button onClick={() => setSearch(true)} aria-label="جستجو در پنل" style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, width: 300, maxWidth: '40vw', padding: '0 14px 0 6px', borderRadius: 999, border: 0, background: 'var(--action-hover)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', textAlign: 'right' }}>
            <Icon name="search" size={20} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.searchPlaceholder}</span>
            <span className="lbl" dir="ltr" style={{ height: 22, padding: '0 6px', borderRadius: 6, background: 'var(--bg-paper)', color: 'var(--text-secondary)', fontSize: 11, boxShadow: '0 0 0 1px var(--divider)' }}>⌘K</span>
          </button>
          <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {p.envLabel && <span className="lbl" dir="ltr" style={{ gap: 6, background: 'var(--soft-success)', color: 'var(--success-text)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success-main)' }} />{p.envLabel}</span>}
            {p.primaryAction && (
              <Link href={p.primaryAction.href} className="btn" style={{ height: 36, padding: '0 14px', background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8, fontWeight: 700, fontSize: 14 }}>
                <Icon d={p.primaryAction.d} size={18} strokeWidth={2} />{p.primaryAction.label}
              </Link>
            )}
            <button className="ibtn" aria-label="تغییر تم" onClick={toggle} style={{ background: 'var(--glass-bg)', boxShadow: '0 0 0 1px var(--glass-edge)' }}>
              <Icon d={mode === 'dark' ? SUN : MOON} size={22} />
            </button>
            <Link href={p.bell.href} className="ibtn" aria-label={p.bell.label} style={{ position: 'relative' }}>
              <Icon d={BELL} size={22} />
              {p.bell.count > 0 && <span style={{ position: 'absolute', top: 5, left: 5, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 9, background: 'var(--error-main)', color: '#FFFFFF', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', lineHeight: 1 }}>{faDigits(p.bell.count)}</span>}
            </Link>
            <Link href={p.settingsHref} className="ibtn" aria-label="تنظیمات"><Icon d={GEAR} size={22} /></Link>
            <span title={`${p.user.name} · ${p.user.role}`} style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', marginRight: 4 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: '50%', background: 'var(--soft-primary)', color: 'var(--primary-text)', fontSize: 14, fontWeight: 700, boxShadow: '0 0 0 2px var(--bg-paper)' }}>{p.user.letter}</span>
            </span>
          </div>
        </header>
        <main style={{ flex: 1, minHeight: 0, boxSizing: 'border-box', padding: 24, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>
          {p.children}
        </main>
      </div>

      {search && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgb(20 24 38 / .45)', display: 'grid', placeItems: 'start center', paddingTop: 96 }} onClick={() => setSearch(false)}>
          <div role="dialog" aria-modal="true" aria-label="جستجو" className="glass" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: 'calc(100vw - 32px)', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-dropdown)', background: 'var(--bg-paper)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, padding: '0 12px', borderRadius: 10, background: 'var(--action-hover)' }}>
              <Icon name="search" size={20} style={{ color: 'var(--text-secondary)' }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={p.searchPlaceholder} style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', fontSize: 15 }} />
              <span className="lbl" style={{ height: 22, background: 'var(--bg-paper)', color: 'var(--text-secondary)', fontSize: 11 }}>Esc</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420, overflowY: 'auto' }}>
              {results.map((r) => (
                <button key={r.title + r.href} onClick={() => { setSearch(false); router.push(r.href); }} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 10px', borderRadius: 10, border: 0, background: 'transparent', color: 'var(--text-primary)', textAlign: 'right', cursor: 'pointer' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: r.tone?.[0] ?? 'var(--soft-primary)', color: r.tone?.[1] ?? 'var(--primary-text)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={r.d} size={20} /></span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.35 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.title}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.sub}</span>
                  </span>
                  <span className="lbl" style={{ height: 22, background: 'var(--soft-default)', color: 'var(--default-text)', fontWeight: 600 }}>{r.kind}</span>
                </button>
              ))}
              {!results.length && <span style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>نتیجه‌ای پیدا نشد</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Page title row with breadcrumbs (design: 20px h4 + dotted breadcrumb). */
export function PageHeading({ title, crumbs, children }: { title: React.ReactNode; crumbs?: { label: string; href?: string }[]; children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: 48, flex: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>{title}</h4>
        {crumbs && (
          <nav aria-label="مسیر" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, lineHeight: 1.3 }}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {i > 0 && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />}
                {c.href ? <Link href={c.href} style={{ color: 'var(--text-primary)' }}>{c.label}</Link> : <span style={{ color: 'var(--text-disabled)' }}>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
      </div>
      {children && <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>}
    </div>
  );
}
