'use client';
/**
 * Desktop shell shared by the organization panel and the operator console.
 * Two states of the same navigation:
 *   sidebar — calm macOS System Settings sidebar: logo, organization/environment, search (⌘K), the primary action,
 *             grouped items with soft icon tiles, and at the bottom notifications, theme and the account menu.
 *   dock    — collapsed (or narrower than 1100px): a floating macOS-style dock on the right edge. Icons magnify
 *             under the pointer, a label appears beside the hovered icon, a dot marks the current section.
 * Pages are built only from the panel kit (src/components/panel/kit.tsx, docs/PANEL-KIT.md).
 * Styles: src/styles/shell.css (shell) and src/styles/panel.css (kit), both scoped under .nm-shell.
 * The scrolling <main> is not positioned and has no transform/filter, so overlays (inspector, dialogs) cover the screen.
 */
import '@/styles/shell.css';
import '@/styles/panel.css';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LogoFull, LogoMark } from '@/components/ui/Brand';
import { useColorMode } from '@/theme/ColorModeProvider';
import { faDigits } from '@/lib/format';

export { PageHeading } from './kit';

export type AppTone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error' | 'ink';
export interface NavItem { label: string; href: string; d: string; badge?: number; match?: (path: string) => boolean; /** Short name (dock label). */ short?: string; /** Icon tile color. */ tone?: AppTone }
export interface NavGroup { title: string; items: NavItem[] }
export interface SearchItem { title: string; sub: string; kind: string; d: string; href: string; tone?: [string, string] }

interface Props {
  surface: 'org' | 'op';
  brandSub: string; // «سازمان» or «بهره‌بردار»
  homeHref: string;
  groups: NavGroup[];
  user: { name: string; role: string; letter: string };
  logoutHref: string;
  onLogout?: () => void;
  /** Organization block in the sidebar (org panel). */
  orgSwitcher?: { name: string; sub: string; contract: string; settingsHref: string };
  searchPlaceholder: string;
  searchItems: SearchItem[];
  primaryAction?: { label: string; href: string; d: string };
  envLabel?: string;
  bell: { href: string; count: number; label: string };
  settingsHref: string;
  children: React.ReactNode;
}

const TONES: AppTone[] = ['primary', 'secondary', 'warning', 'success', 'info', 'ink', 'error'];
const SUN = 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8';
const MOON = 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7';
const BELL = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4';
const SIDEBAR = 'M4 5h16v14H4zM15 5v14';
const CHEV = 'M8 10l4 4 4-4';
const LOGOUT = 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M14 17l5-5-5-5M19 12H9';
const GEAR = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1';
const CHECK = 'M5 12.5l4.5 4.5L19 7';
const SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4';
const PLUS = 'M12 5v14M5 12h14';

const toneClass = (t: AppTone) => `tn-${t === 'ink' ? 'neutral' : t}`;

/** Closes a popover on outside click. */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', on);
    return () => document.removeEventListener('mousedown', on);
  }, [open, close]);
  return ref;
}

/**
 * macOS dock magnification: icons grow under the pointer with a smooth falloff to their neighbours.
 * Positions are measured once when the pointer enters (unmagnified), like the real dock.
 */
function useMagnify(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const centers = useRef<number[]>([]);
  const frame = useRef(0);
  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-mag]') ?? []);
  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = () => { centers.current = items().map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; }); };
  const reset = useCallback(() => { cancelAnimationFrame(frame.current); items().forEach((el) => el.style.removeProperty('--s')); }, []);
  const onMouseEnter = () => { if (enabled && !reduced()) measure(); };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!enabled || reduced()) return;
    if (!centers.current.length) measure();
    const y = e.clientY;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      items().forEach((el, i) => {
        const d = y - (centers.current[i] ?? y);
        const s = 1 + 0.5 * Math.exp(-(d * d) / (2 * 38 * 38));
        el.style.setProperty('--s', s.toFixed(3));
      });
    });
  };
  const onMouseLeave = () => { centers.current = []; reset(); };
  useEffect(() => { if (!enabled) reset(); }, [enabled, reset]);
  return { ref, onMouseEnter, onMouseMove, onMouseLeave };
}

export function PanelShell(p: Props) {
  const path = usePathname();
  const router = useRouter();
  const { mode, toggle } = useColorMode();
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [menu, setMenu] = useState<null | 'org' | 'user'>(null);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const closeMenu = useMemo(() => () => setMenu(null), []);
  const orgRef = useOutside(menu === 'org', closeMenu);
  const userRef = useOutside(menu === 'user', closeMenu);
  const dock = collapsed || narrow;
  const mag = useMagnify(dock);

  useEffect(() => { try { setCollapsed(localStorage.getItem(`nm-${p.surface}-side`) === 'mini'); } catch { /* ignore */ } }, [p.surface]);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1100px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const toggleCollapsed = () => {
    if (narrow) return;
    setMenu(null);
    setCollapsed((c) => { try { localStorage.setItem(`nm-${p.surface}-side`, c ? 'full' : 'mini'); } catch { /* ignore */ } return !c; });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); setMenu(null); }
      if (e.key === 'Escape') { setSearch(false); setMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); setMenu(null); }, [path]);
  useEffect(() => { setSel(0); }, [q, search]);

  const isActive = (it: NavItem) => (it.match ? it.match(path) : it.href === p.homeHref ? path === it.href : path === it.href || path.startsWith(it.href + '/'));
  const allItems = p.groups.flatMap((g) => g.items);
  const toneOf = (it: NavItem) => it.tone ?? TONES[allItems.indexOf(it) % TONES.length];
  const results = useMemo(() => p.searchItems.filter((s) => !q || s.title.includes(q) || s.sub.includes(q) || s.kind.includes(q)), [p.searchItems, q]);
  const go = (href: string) => { setSearch(false); router.push(href); };
  const openSearch = () => { setSearch(true); setMenu(null); };

  const orgMenu = p.orgSwitcher && menu === 'org' && (
    <div className="nm-pop" role="menu">
      <div className="nm-pop-row on">
        <span className="nm-ava sq">{p.orgSwitcher.name[0]}</span>
        <span className="nm-col"><b>{p.orgSwitcher.name}</b><small className="num">قرارداد <span dir="ltr">{p.orgSwitcher.contract}</span></small></span>
        <Icon d={CHECK} size={18} style={{ color: 'var(--primary-text)' }} />
      </div>
      <p className="nm-pop-note">حساب شما فقط به این سازمان دسترسی دارد. برای افزودن سازمان با بهره‌بردار تماس بگیرید.</p>
      <Link href={p.orgSwitcher.settingsHref} className="nm-pop-link" role="menuitem"><Icon d={GEAR} size={16} />حساب سازمان و قرارداد</Link>
    </div>
  );
  const userMenu = menu === 'user' && (
    <div className="nm-pop up" role="menu">
      {dock && <div className="nm-pop-row"><span className="nm-ava">{p.user.letter}</span><span className="nm-col"><b>{p.user.name}</b><small>{p.user.role}</small></span></div>}
      <Link href={p.settingsHref} className="nm-pop-link" role="menuitem"><Icon d={GEAR} size={16} />تنظیمات</Link>
      <Link href={p.logoutHref} onClick={p.onLogout} className="nm-pop-link danger" role="menuitem"><Icon d={LOGOUT} size={16} />خروج از حساب</Link>
    </div>
  );

  return (
    <div className={`s-${p.surface} nm-shell` + (dock ? ' dock' : '')}>
      {!dock ? (
        <aside className="nm-side" aria-label="ناوبری پنل">
          <div className="nm-side-head">
            <Link href={p.homeHref} className="nm-brand" aria-label={`نمادنو · ${p.brandSub}`}><LogoFull height={22} /></Link>
            <span className="nm-surface">{p.brandSub}</span>
            <button type="button" className="nm-ib collapse" onClick={toggleCollapsed} aria-label="جمع کردن نوار کناری" title="جمع کردن نوار کناری"><Icon d={SIDEBAR} size={18} /></button>
          </div>

          {p.orgSwitcher && (
            <div ref={orgRef} className="nm-anchor">
              <button type="button" className="nm-org" aria-expanded={menu === 'org'} onClick={() => setMenu((m) => (m === 'org' ? null : 'org'))}>
                <span className="nm-ava sq">{p.orgSwitcher.name[0]}</span>
                <span className="nm-col"><b>{p.orgSwitcher.name}</b><small>{p.orgSwitcher.sub}</small></span>
                <Icon d={CHEV} size={16} className="chev" />
              </button>
              {orgMenu}
            </div>
          )}
          {p.envLabel && <span className="nm-env" dir="ltr"><i />{p.envLabel}</span>}

          <button type="button" className="nm-search" onClick={openSearch} aria-label="جستجو در پنل">
            <Icon d={SEARCH} size={16} />
            <span>{p.searchPlaceholder}</span>
            <kbd dir="ltr">⌘K</kbd>
          </button>

          {p.primaryAction && (
            <Link href={p.primaryAction.href} className="nm-btn block nm-side-cta"><Icon d={PLUS} size={18} strokeWidth={2} /><span>{p.primaryAction.label}</span></Link>
          )}

          <nav className="nm-nav" aria-label="منوی اصلی">
            {p.groups.map((g) => (
              <div key={g.title} className="nm-grp" role="group" aria-label={g.title}>
                <span className="nm-grp-t">{g.title}</span>
                {g.items.map((it) => {
                  const on = isActive(it);
                  return (
                    <Link key={it.href} href={it.href} className={'nm-item' + (on ? ' on' : '')} aria-current={on ? 'page' : undefined}>
                      <span className={`nm-tile soft ${toneClass(toneOf(it))}`}><Icon d={it.d} size={15} strokeWidth={1.8} /></span>
                      <span className="nm-lb">{it.label}</span>
                      {!!it.badge && <span className="nm-badge">{faDigits(it.badge)}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="nm-side-foot">
            <Link href={p.bell.href} className="nm-item">
              <span className="nm-tile plain"><Icon d={BELL} size={16} /></span>
              <span className="nm-lb">اعلان‌ها</span>
              {p.bell.count > 0 && <span className="nm-badge">{faDigits(p.bell.count)}</span>}
            </Link>
            <button type="button" className="nm-item" onClick={toggle} aria-pressed={mode === 'dark'}>
              <span className="nm-tile plain"><Icon d={mode === 'dark' ? SUN : MOON} size={16} /></span>
              <span className="nm-lb">حالت تیره</span>
              <span className={'nm-switch' + (mode === 'dark' ? ' on' : '')} aria-hidden="true"><i /></span>
            </button>
            <div ref={userRef} className="nm-anchor">
              <button type="button" className="nm-user" aria-expanded={menu === 'user'} onClick={() => setMenu((m) => (m === 'user' ? null : 'user'))}>
                <span className="nm-ava">{p.user.letter}</span>
                <span className="nm-col"><b>{p.user.name}</b><small>{p.user.role}</small></span>
                <Icon name="more" size={18} className="chev" />
              </button>
              {userMenu}
            </div>
          </div>
        </aside>
      ) : (
        <aside className="nm-dock" aria-label="ناوبری پنل">
          <Link href={p.homeHref} className="nm-dock-logo" aria-label={`نمادنو · ${p.brandSub}`}>
            <LogoMark size={26} />
            {p.envLabel && <i className="env" title={p.envLabel} />}
          </Link>
          <div className="nm-dock-bar" ref={mag.ref} onMouseEnter={mag.onMouseEnter} onMouseMove={mag.onMouseMove} onMouseLeave={mag.onMouseLeave}>
            {!narrow && (
              <button type="button" className="nm-di" data-mag data-label="باز کردن نوار کناری" aria-label="باز کردن نوار کناری" onClick={toggleCollapsed}>
                <span className="nm-di-t tn-neutral"><Icon d={SIDEBAR} /></span>
              </button>
            )}
            <div className="nm-dock-grp">
              {p.orgSwitcher && (
                <div ref={orgRef} className="nm-anchor">
                  <button type="button" className="nm-di" data-mag data-label={p.orgSwitcher.name} aria-label={p.orgSwitcher.name} aria-expanded={menu === 'org'} onClick={() => setMenu((m) => (m === 'org' ? null : 'org'))}>
                    <span className="nm-di-t org">{p.orgSwitcher.name[0]}</span>
                  </button>
                  {orgMenu}
                </div>
              )}
              <button type="button" className="nm-di" data-mag data-label="جستجو  ⌘K" aria-label="جستجو در پنل" onClick={openSearch}>
                <span className="nm-di-t tn-neutral"><Icon d={SEARCH} /></span>
              </button>
              {p.primaryAction && (
                <Link href={p.primaryAction.href} className="nm-di" data-mag data-label={p.primaryAction.label} aria-label={p.primaryAction.label}>
                  <span className="nm-di-t cta"><Icon d={PLUS} strokeWidth={2} /></span>
                </Link>
              )}
            </div>
            {p.groups.map((g) => (
              <div key={g.title} className="nm-dock-grp" role="group" aria-label={g.title}>
                {g.items.map((it) => {
                  const on = isActive(it);
                  return (
                    <Link key={it.href} href={it.href} className={'nm-di' + (on ? ' on' : '')} data-mag data-label={it.label} aria-label={it.label} aria-current={on ? 'page' : undefined}>
                      <span className={`nm-di-t ${toneClass(toneOf(it))}`}><Icon d={it.d} strokeWidth={1.8} /></span>
                      {!!it.badge && <span className="nm-badge">{faDigits(it.badge)}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
            <div className="nm-dock-grp">
              <Link href={p.bell.href} className="nm-di" data-mag data-label="اعلان‌ها" aria-label={p.bell.label}>
                <span className="nm-di-t tn-neutral"><Icon d={BELL} /></span>
                {p.bell.count > 0 && <span className="nm-badge">{faDigits(p.bell.count)}</span>}
              </Link>
              <button type="button" className="nm-di" data-mag data-label={mode === 'dark' ? 'حالت روشن' : 'حالت تیره'} aria-label={mode === 'dark' ? 'حالت روشن' : 'حالت تیره'} aria-pressed={mode === 'dark'} onClick={toggle}>
                <span className="nm-di-t tn-neutral"><Icon d={mode === 'dark' ? SUN : MOON} /></span>
              </button>
              <div ref={userRef} className="nm-anchor">
                <button type="button" className="nm-di" data-mag data-label={p.user.name} aria-label={`حساب ${p.user.name}`} aria-expanded={menu === 'user'} onClick={() => setMenu((m) => (m === 'user' ? null : 'user'))}>
                  <span className="nm-di-t me">{p.user.letter}</span>
                </button>
                {userMenu}
              </div>
            </div>
          </div>
        </aside>
      )}

      <main ref={mainRef} className="nm-main">
        <div key={path} className="nm-main-in">{p.children}</div>
      </main>

      {search && (
        <div className="nm-spot-dim" onMouseDown={() => setSearch(false)}>
          <div role="dialog" aria-modal="true" aria-label="جستجو" className="nm-spot" onMouseDown={(e) => e.stopPropagation()}>
            <div className="nm-spot-in">
              <Icon d={SEARCH} size={20} />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={p.searchPlaceholder} aria-label="عبارت جستجو"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
                  if (e.key === 'Enter' && results[sel]) go(results[sel].href);
                }}
              />
              <kbd>Esc</kbd>
            </div>
            {results.length ? (
              <div className="nm-spot-list" role="listbox">
                {results.map((r, i) => (
                  <button key={r.title + r.href} type="button" role="option" aria-selected={i === sel} className={i === sel ? 'on' : undefined} onMouseEnter={() => setSel(i)} onClick={() => go(r.href)}>
                    <span className="ic" style={{ background: r.tone?.[0] ?? 'var(--soft-primary)', color: r.tone?.[1] ?? 'var(--primary-text)' } as CSSProperties}><Icon d={r.d} size={17} /></span>
                    <span className="nm-col"><b>{r.title}</b><small>{r.sub}</small></span>
                    <span className="kind">{r.kind}</span>
                  </button>
                ))}
              </div>
            ) : <span className="nm-spot-empty">نتیجه‌ای پیدا نشد</span>}
          </div>
        </div>
      )}
    </div>
  );
}
