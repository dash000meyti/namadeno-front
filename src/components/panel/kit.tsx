'use client';
/**
 * Namadno One — Panel kit. The only building blocks for pages of the organization panel and the operator console,
 * so every section looks and behaves the same. Guide with rules and examples: docs/PANEL-KIT.md. Styles: src/styles/panel.css.
 *
 * Page anatomy:  PageHeading → StatStrip (optional) → Card(s)
 *   list page    Card flush + Toolbar (Tabs, SearchField, Select) + Table + TableFoot; a row opens the Inspector
 *   detail page  PageHeading with lead avatar/tile + pills + actions → Tabs → Cards
 *   settings     SettingsGroup + SettingRow (Switch, NumInput, Chips, Select)
 *   wizard       PageHeading → Steps → Cards → ActionBar
 */
import Link from 'next/link';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { enDigits, faDigits, money } from '@/lib/format';

export type Tone = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
const tn = (t?: Tone) => (t ? ` tn-${t}` : '');
const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const P = {
  chevL: 'M14 6l-6 6 6 6',
  chevR: 'M10 6l6 6-6 6',
  chevD: 'M7 10l5 5 5-5',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  minus: 'M6 12h12',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  ext: 'M14 5h5v5M19 5l-8 8M17 13v6H5V7h6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  inbox: 'M3 13l2.5-7h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5',
};

const TONE_CYCLE: Tone[] = ['primary', 'info', 'success', 'warning', 'secondary', 'neutral'];
/** Stable tone for an id — a person or organization keeps the same avatar color on every screen. */
export const toneFor = (id: string): Tone => TONE_CYCLE[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % TONE_CYCLE.length];

/** Closes a popover on outside click / Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

// ───────────────────────── identity ─────────────────────────

/** Round avatar with a letter (soft tone). `sq` = rounded square (organizations). */
export function Ava({ letter, tone, id, size, sq, style }: { letter: string; tone?: Tone; id?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; sq?: boolean; style?: CSSProperties }) {
  const t = tone ?? (id ? toneFor(id) : 'primary');
  return <span className={cx('nm-ava', sq && 'sq', size && size !== 'md' && size, `tn-${t}`)} style={style} aria-hidden="true">{letter}</span>;
}

/** Soft icon tile — light tone background, tone-colored icon (same as the sidebar). */
export function Tile({ d, name, tone = 'primary', size = 'md', style }: { d?: string; name?: string; tone?: Tone; size?: 'sm' | 'md' | 'lg' | 'xl'; style?: CSSProperties }) {
  const px = size === 'xl' ? 24 : size === 'lg' ? 20 : size === 'md' ? 17 : 14;
  return <span className={cx('nm-tile soft', size !== 'sm' && size, `tn-${tone}`)} style={style} aria-hidden="true"><Icon d={d} name={name as never} size={px} /></span>;
}

/** Status / category pill. `dot` adds a small colored dot. */
export function Pill({ tone = 'neutral', dot, icon, children, title, style }: { tone?: Tone; dot?: boolean; icon?: string; children: ReactNode; title?: string; style?: CSSProperties }) {
  return <span className={'nm-pill' + tn(tone)} title={title} style={style}>{dot && <i />}{icon && <Icon d={icon} size={12} strokeWidth={1.8} />}{children}</span>;
}

/** Avatar/tile + title + subline. Used in table cells and list rows. */
export function Ident({ lead, title, sub, subLtr }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; subLtr?: boolean }) {
  return (
    <span className="nm-ident">
      {lead}
      <span className="nm-col"><b>{title}</b>{sub != null && <small className={subLtr ? 'num ltr' : undefined} style={subLtr ? { textAlign: 'right' } : undefined}>{sub}</small>}</span>
    </span>
  );
}

/** Thin progress bar (0..1). */
export function Meter({ value, tone = 'primary', width, thin, label }: { value: number; tone?: Tone; width?: number | string; thin?: boolean; label?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className={cx('nm-meter', thin && 'thin', `tn-${tone}`)} style={{ width }} role="img" aria-label={label ?? `${faDigits(Math.round(v * 100))}٪`}>
      <i style={{ width: `${Math.round(v * 1000) / 10}%` }} />
    </span>
  );
}

/**
 * Free / locked split (product rule: free = value − Σ locks). Two-part bar + the two amounts.
 * `fmt` formats amounts (default: full Toman); pass a compact formatter in tight places.
 */
export function FreeLocked({ free, locked, fmt = money, height = 8, unit }: { free: number; locked: number; fmt?: (n: number) => string; height?: number; unit?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <LockBar free={free} locked={locked} height={height} />
      <div className="nm-legend">
        <span><i style={{ background: 'var(--primary-main)', borderRadius: '50%' }} />آزاد <b>{fmt(free)}</b>{unit && ` ${unit}`}</span>
        {locked > 0
          ? <span><Icon d={'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2'} size={12} />قفل <b>{fmt(locked)}</b>{unit && ` ${unit}`}</span>
          : <span>همه آزاد</span>}
      </div>
    </div>
  );
}

/** Chart legend. */
export function Legend({ items }: { items: { label: ReactNode; color: string; value?: ReactNode }[] }) {
  return <div className="nm-legend">{items.map((x, i) => <span key={i}><i style={{ background: x.color }} />{x.label}{x.value != null && <b>{x.value}</b>}</span>)}</div>;
}

// ───────────────────────── page structure ─────────────────────────

export interface Crumb { label: string; href?: string }

/**
 * Page title row: quiet breadcrumbs, title, optional subline, actions on the left.
 * Detail pages pass `lead` (avatar or tile) and `pills` (status) — the same row then works as the entity header.
 */
export function PageHeading({ title, sub, crumbs, lead, pills, children }: { title: ReactNode; sub?: ReactNode; crumbs?: Crumb[]; lead?: ReactNode; pills?: ReactNode; children?: ReactNode }) {
  return (
    <div className="nm-head">
      {lead && <span className="nm-head-lead">{lead}</span>}
      <div className="nm-col" style={{ gap: 4 }}>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="مسیر" className="nm-crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <i aria-hidden="true">›</i>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="nm-h1">{title}</h1>
        {sub && <p className="nm-sub">{sub}</p>}
        {pills && <div className="nm-head-pills">{pills}</div>}
      </div>
      {children && <div className="nm-head-act">{children}</div>}
    </div>
  );
}

export interface Stat {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  /** Note color: up = good, down = bad, warn = needs attention. */
  trend?: 'up' | 'down' | 'warn';
  icon?: { d: string; tone: Tone };
  href?: string;
  /** Makes the cell a filter toggle (with `active`). */
  onClick?: () => void;
  active?: boolean;
}

/** One card with a few key numbers separated by hairlines. Replaces KPI card rows on every page. */
export function StatStrip({ items, loading }: { items: Stat[]; loading?: boolean }) {
  const n = loading ? 4 : items.length;
  return (
    <section className="nm-stats" style={{ '--n': n } as CSSProperties} aria-label="خلاصه">
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="nm-stat"><span className="nm-skel" style={{ width: 90, height: 12 }} /><span className="nm-skel" style={{ width: 120, height: 26, marginTop: 4 }} /><span className="nm-skel" style={{ width: 70, height: 10, marginTop: 4 }} /></div>
        ))
        : items.map((s, i) => {
          const body = (
            <>
              <span className="k">{s.icon && <span className={'nm-tile soft' + tn(s.icon.tone)}><Icon d={s.icon.d} size={13} /></span>}{s.label}</span>
              <span className="v"><span className="num">{s.value}</span>{s.unit != null && <span className="u">{s.unit}</span>}</span>
              <span className={cx('n', s.trend)}>{s.note}</span>
            </>
          );
          if (s.href) return <Link key={i} href={s.href} className="nm-stat">{body}</Link>;
          if (s.onClick) return <button key={i} type="button" className="nm-stat" aria-pressed={!!s.active} onClick={s.onClick}>{body}</button>;
          return <div key={i} className="nm-stat">{body}</div>;
        })}
    </section>
  );
}

/**
 * Card with an optional header (title, count, sub, actions or a «همه» link).
 * `flush` = no body padding (tables, lists that run edge to edge).
 */
export function Card({ title, count, sub, actions, more, flush, id, className, style, bodyStyle, children }: {
  title?: ReactNode; count?: ReactNode; sub?: ReactNode; actions?: ReactNode;
  more?: { label: string; href?: string; onClick?: () => void };
  flush?: boolean; id?: string; className?: string; style?: CSSProperties; bodyStyle?: CSSProperties; children?: ReactNode;
}) {
  const hid = useId();
  const hasHead = title != null || actions != null || more != null;
  return (
    <section className={cx('nm-card', flush && 'flush', className)} style={style} id={id} aria-labelledby={title != null ? hid : undefined}>
      {hasHead && (
        <header className="nm-card-h">
          {title != null && <h2 id={hid}>{title}</h2>}
          {count != null && <span className="nm-count">{typeof count === 'number' ? faDigits(count) : count}</span>}
          {sub != null && <span className="sub">{sub}</span>}
          {(actions != null || more) && (
            <span className="x">
              {actions}
              {more && (more.href
                ? <Link href={more.href} className="nm-more">{more.label}<Icon d={P.chevL} size={14} /></Link>
                : <button type="button" className="nm-more" onClick={more.onClick}>{more.label}<Icon d={P.chevL} size={14} /></button>)}
            </span>
          )}
        </header>
      )}
      {flush ? children : <div className="nm-card-b" style={bodyStyle}>{children}</div>}
    </section>
  );
}

/** Labeled block inside a card or the inspector. */
export function Section({ title, action, children, style }: { title?: ReactNode; action?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="nm-sec" style={style}>
      {(title != null || action != null) && <div className="nm-sec-t">{title}{action != null && <span className="x">{action}</span>}</div>}
      {children}
    </section>
  );
}

/** Key → value rows. */
export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return <dl className="nm-kv" style={{ margin: 0 }}>{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** Small stat tiles (2–4) — inspector and detail pages. */
export function KeyStats({ items }: { items: [ReactNode, ReactNode][] }) {
  return <div className="nm-keys" style={{ '--n': items.length } as CSSProperties}>{items.map(([k, v], i) => <div key={i}><span>{k}</span><b>{v}</b></div>)}</div>;
}

/** Big number with a unit. */
export function BigNum({ value, unit, style }: { value: ReactNode; unit?: ReactNode; style?: CSSProperties }) {
  return <span className="nm-big" style={style}><span className="num">{value}</span>{unit != null && <span className="u">{unit}</span>}</span>;
}

/** Row in a list: lead (Ava/Tile) + title/sub + trailing content. Link, button or plain. */
export function ListRow({ lead, title, sub, trail, href, onClick, subLtr, label }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; href?: string; onClick?: () => void; subLtr?: boolean; label?: string }) {
  const inner = (
    <>
      {lead}
      <span className="nm-col"><b>{title}</b>{sub != null && <small className={subLtr ? 'num' : undefined}>{sub}</small>}</span>
      {trail != null && <span className="trail">{trail}</span>}
    </>
  );
  if (href) return <Link href={href} className="nm-li" aria-label={label}>{inner}</Link>;
  if (onClick) return <button type="button" className="nm-li" onClick={onClick} aria-label={label}>{inner}</button>;
  return <div className="nm-li">{inner}</div>;
}
export function List({ children }: { children: ReactNode }) { return <div className="nm-list">{children}</div>; }

// ───────────────────────── toolbar & filters ─────────────────────────

/** First row of a list card: Tabs, SearchField, Select …; put `<span className="grow" />` to push items to the end. */
export function Toolbar({ children }: { children: ReactNode }) { return <div className="nm-tools">{children}</div>; }

/** Segmented control. The one control for switching views, statuses and page sections. */
export function Tabs<K extends string | number>({ value, onChange, items, label, size }: { value: K; onChange: (k: K) => void; items: { key: K; label: ReactNode; count?: number; hot?: boolean }[]; label: string; size?: 'lg' }) {
  return (
    <div className={cx('nm-seg', size)} role="group" aria-label={label}>
      {items.map((it) => (
        <button key={String(it.key)} type="button" aria-pressed={it.key === value} onClick={() => onChange(it.key)}>
          {it.label}
          {it.count != null && <span className={cx('c', it.hot && it.count > 0 && 'hot')}>{faDigits(it.count)}</span>}
        </button>
      ))}
    </div>
  );
}

/** Filled search field (toolbar). */
export function SearchField({ value, onChange, placeholder, label, width, id }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; width?: number | string; id?: string }) {
  return (
    <label className="nm-find" style={width ? { width } : undefined}>
      <Icon d={P.search} size={16} />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} />
      {value && <button type="button" className="clr" aria-label="پاک کردن جستجو" onClick={() => onChange('')}><Icon d={P.close} size={14} /></button>}
    </label>
  );
}

/** Pop-up button with a menu of options (single choice). Shows «prefix: value». */
export function Select<K extends string | number>({ value, onChange, options, label, prefix, icon, align }: { value: K; onChange: (k: K) => void; options: { key: K; label: string; count?: number }[]; label: string; prefix?: string; icon?: string; align?: 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const cur = options.find((o) => o.key === value);
  return (
    <div className="nm-selw" ref={ref}>
      <button type="button" className="nm-sel" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        {icon && <Icon d={icon} size={16} />}
        {prefix && <span className="p">{prefix}:</span>}
        <span>{cur?.label ?? '—'}</span>
        <Icon d={P.chevD} size={15} />
      </button>
      {open && (
        <div className={cx('nm-menu', align)} role="listbox" aria-label={label}>
          {options.map((o) => (
            <button key={String(o.key)} type="button" role="option" aria-selected={o.key === value} className={o.key === value ? 'on' : undefined} onClick={() => { onChange(o.key); setOpen(false); }}>
              <span className="ck">{o.key === value && <Icon d={P.check} size={15} strokeWidth={2} />}</span>
              <span className="t">{o.label}</span>
              {o.count != null && <span className="c">{faDigits(o.count)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** «…» menu for row/page actions. */
export function MenuButton({ items, label, icon = 'M12 5.5h.01M12 12h.01M12 18.5h.01', align }: { items: ({ label: string; onClick: () => void; danger?: boolean; disabled?: boolean } | 'sep')[]; label: string; icon?: string; align?: 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="nm-selw" ref={ref}>
      <button type="button" className="nm-ib" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}><Icon d={icon} size={18} strokeWidth={2.2} /></button>
      {open && (
        <div className={cx('nm-menu', align)} role="menu" onClick={(e) => e.stopPropagation()}>
          {items.map((it, i) => it === 'sep' ? <hr key={i} /> : (
            <button key={i} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'danger' : undefined} onClick={() => { setOpen(false); it.onClick(); }}><span className="t">{it.label}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── table ─────────────────────────

export interface Column<T> {
  key: string;
  label: ReactNode;
  /** CSS grid track, e.g. '120px' or 'minmax(0, 1.4fr)'. Default: minmax(0, 1fr). */
  width?: string;
  align?: 'end' | 'center';
  /** Stack content vertically (number + bar, value + note). */
  col?: boolean;
  render: (row: T, index: number) => ReactNode;
}

/**
 * The one table. Rows are links (`rowHref`) or open the inspector (`onRowClick` + `selectedKey`).
 * Selection checkboxes with `select`. Loading, error and empty states are built in.
 */
export function Table<T>({ columns, rows, rowKey, onRowClick, rowHref, selectedKey, rowLabel, dimRow, loading, error, onRetry, empty, select, minWidth, chevron }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  selectedKey?: string | null;
  /** Accessible name of a row (e.g. the person's name). */
  rowLabel?: (row: T) => string;
  dimRow?: (row: T) => boolean;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  select?: { selected: string[]; onChange: (keys: string[]) => void; label?: (row: T) => string; allLabel?: string };
  minWidth?: number;
  /** Trailing chevron on clickable rows. */
  chevron?: boolean;
}) {
  const tracks = [select ? '18px' : null, ...columns.map((c) => c.width ?? 'minmax(0, 1fr)'), chevron ? '16px' : null].filter(Boolean).join(' ');
  const vars = { '--cols': tracks, '--minw': minWidth ? `${minWidth}px` : undefined } as CSSProperties;
  const keys = rows.map(rowKey);
  const all = select && keys.length > 0 && keys.every((k) => select.selected.includes(k));
  const some = select && !all && keys.some((k) => select.selected.includes(k));
  const toggleAll = () => select && select.onChange(all ? select.selected.filter((k) => !keys.includes(k)) : Array.from(new Set([...select.selected, ...keys])));
  const toggle = (k: string) => select && select.onChange(select.selected.includes(k) ? select.selected.filter((x) => x !== k) : [...select.selected, k]);

  return (
    <div className="nm-table" role="table">
      <div className="nm-tr nm-th" role="row" style={vars}>
        {select && <span role="columnheader"><button type="button" className="nm-tsel" role="checkbox" aria-checked={all ? 'true' : some ? 'mixed' : 'false'} aria-label={select.allLabel ?? 'انتخاب همه'} onClick={toggleAll}>{(all || some) && <Icon d={all ? P.check : P.minus} size={12} strokeWidth={3} />}</button></span>}
        {columns.map((c) => <span key={c.key} role="columnheader" className={cx('nm-td', c.align)}>{c.label}</span>)}
        {chevron && <span />}
      </div>
      {loading && <SkeletonRows n={5} />}
      {!loading && error != null && <ErrorBlock error={error} onRetry={onRetry} flat />}
      {!loading && error == null && !rows.length && (empty ?? <Empty title="موردی پیدا نشد" />)}
      {!loading && error == null && rows.map((r, i) => {
        const k = rowKey(r);
        const on = selectedKey === k;
        const cells = (
          <>
            {select && (
              <span onClick={(e) => e.stopPropagation()}>
                <button type="button" className="nm-tsel" role="checkbox" aria-checked={select.selected.includes(k)} aria-label={select.label ? select.label(r) : 'انتخاب'} onClick={() => toggle(k)}>{select.selected.includes(k) && <Icon d={P.check} size={12} strokeWidth={3} />}</button>
              </span>
            )}
            {columns.map((c) => <span key={c.key} role="cell" className={cx('nm-td', c.align, c.col && 'col')}>{c.render(r, i)}</span>)}
            {chevron && <span className="nm-td"><Icon d={P.chevL} size={16} className="chev" /></span>}
          </>
        );
        const cls = cx('nm-tr', (onRowClick || rowHref) && 'click', on && 'on', dimRow?.(r) && 'nm-dimrow');
        if (rowHref) return <Link key={k} href={rowHref(r)} role="row" className={cls} style={vars} aria-label={rowLabel?.(r)}>{cells}</Link>;
        return (
          <div
            key={k} role="row" className={cls} style={vars}
            tabIndex={onRowClick ? 0 : undefined}
            aria-selected={onRowClick ? on : undefined}
            aria-label={rowLabel?.(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            onKeyDown={onRowClick ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRowClick(r); } } : undefined}
          >
            {cells}
          </div>
        );
      })}
    </div>
  );
}

/** Footer of a list card: «n از m» + pager. */
export function TableFoot({ shown, total, unit = 'مورد', page, pages, onPage, children }: { shown: number; total: number; unit?: string; page?: number; pages?: number; onPage?: (p: number) => void; children?: ReactNode }) {
  return (
    <div className="nm-tfoot">
      <span>نمایش <span className="num">{faDigits(shown)}</span> از <span className="num">{faDigits(total)}</span> {unit}</span>
      {children}
      {page != null && pages != null && pages > 1 && onPage && (
        <nav className="nm-pager" aria-label="صفحه‌ها">
          <button type="button" aria-label="صفحه قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon d={P.chevR} size={15} /></button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{faDigits(p)}</button>)}
          <button type="button" aria-label="صفحه بعد" disabled={page >= pages} onClick={() => onPage(page + 1)}><Icon d={P.chevL} size={15} /></button>
        </nav>
      )}
    </div>
  );
}

/** Paging helper: `const pg = usePaging(rows, 8)` → pg.rows, pg.page, pg.pages, pg.setPage. Resets to page 1 when `resetKey` changes. */
export function usePaging<T>(rows: T[], size: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return { rows: rows.slice((cur - 1) * size, cur * size), page: cur, pages, setPage, total: rows.length };
}

/** Shown instead of the toolbar while rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <div className="nm-bulk" role="toolbar" aria-label="عملیات گروهی">
      <button type="button" className="nm-ib" aria-label="لغو انتخاب" onClick={onClear}><Icon d={P.close} size={16} /></button>
      <span><span className="num">{faDigits(count)}</span> مورد انتخاب شده</span>
      <span className="x">{children}</span>
    </div>
  );
}

// ───────────────────────── inspector ─────────────────────────

/**
 * The one detail panel. Floats on the left over the page (no scrim), so the list stays usable:
 * clicking another row switches the item. Esc or ✕ closes. `href` adds «صفحه کامل».
 * Body: Who → KeyStats → Section(s); `footer` holds the actions.
 */
export function Inspector({ open, onClose, title, label, href, hrefLabel = 'صفحه کامل', actions, footer, children, width }: {
  open: boolean; onClose: () => void; title: ReactNode; label: string; href?: string; hrefLabel?: string;
  actions?: ReactNode; footer?: ReactNode; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.nm-dlg-dim')) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <aside className="nm-insp" role="complementary" aria-label={label} style={width ? { width: `min(${width}px, calc(100vw - 24px))` } : undefined}>
      <header className="nm-insp-h">
        <button type="button" className="nm-ib" aria-label="بستن پنل" onClick={onClose}><Icon d={P.close} size={18} /></button>
        <h2>{title}</h2>
        {actions}
        {href && <Link href={href} className="nm-btn sm text">{hrefLabel}<Icon d={P.ext} size={15} /></Link>}
      </header>
      <div className="nm-insp-b">{children}</div>
      {footer && <footer className="nm-insp-f">{footer}</footer>}
    </aside>
  );
}

/** Identity block at the top of the inspector (or a card): big avatar/tile, name, subline, pills. */
export function Who({ lead, title, sub, pills }: { lead: ReactNode; title: ReactNode; sub?: ReactNode; pills?: ReactNode }) {
  return (
    <div className="nm-who">
      {lead}
      <span className="nm-col">
        <b>{title}</b>
        {sub != null && <small>{sub}</small>}
        {pills && <span className="pills">{pills}</span>}
      </span>
    </div>
  );
}

// ───────────────────────── settings & forms ─────────────────────────

/** Group of settings rows in one rounded box, title above (macOS System Settings). */
export function SettingsGroup({ title, action, footer, children, style }: { title?: ReactNode; action?: ReactNode; footer?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section className="nm-set" style={style}>
      {(title != null || action != null) && <h2 className="nm-set-t" style={{ margin: 0 }}>{title}{action != null && <span className="x">{action}</span>}</h2>}
      <div className="nm-set-box">{children}</div>
      {footer && <p className="nm-set-f" style={{ margin: 0 }}>{footer}</p>}
    </section>
  );
}

/** One setting: label + description on the right, control on the left. `stack` puts the control under the label. */
export function SettingRow({ label, desc, htmlFor, children, stack, lead }: { label: ReactNode; desc?: ReactNode; htmlFor?: string; children?: ReactNode; stack?: boolean; /** Avatar, tile or dot before the label. */ lead?: ReactNode }) {
  return (
    <div className={cx('nm-set-row', stack && 'stack')}>
      {lead}
      <div className="l">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <b>{label}</b>}{desc != null && <small>{desc}</small>}</div>
      {children != null && <div className="c">{children}</div>}
    </div>
  );
}

/** On/off switch (green when on, like macOS). */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="nm-sw" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><i /></button>;
}

/** Compact number/text input with an optional suffix (unit). */
export function NumInput({ value, onChange, suffix, width = 72, label, id, invalid, disabled, ltr, placeholder, text, full }: {
  value: string | number; onChange: (v: string) => void; suffix?: ReactNode; width?: number; label?: string; id?: string;
  invalid?: boolean; disabled?: boolean; ltr?: boolean; placeholder?: string; text?: boolean;
  /** Stretch to the container width (text fields in forms and dialogs). */
  full?: boolean;
}) {
  return (
    <span className={cx('nm-in', !text && 'num', invalid && 'err')} style={full ? { width: '100%', height: 40 } : undefined}>
      <input id={id} aria-label={label} inputMode={text ? undefined : 'decimal'} dir={ltr ? 'ltr' : undefined} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={full ? undefined : { width }} aria-invalid={invalid || undefined} />
      {suffix != null && <span className="sfx">{suffix}</span>}
    </span>
  );
}

/**
 * Number-bound input: shows Persian digits (with separators unless `decimals`), parses Persian or Latin typing.
 * `onChange` gets NaN for an empty field. `full` stretches to the container width.
 */
export function NumberInput({ value, onChange, suffix, width = 72, label, id, decimals, invalid, disabled, full, ltr }: {
  value: number; onChange: (n: number) => void; suffix?: ReactNode; width?: number; label?: string; id?: string;
  decimals?: boolean; invalid?: boolean; disabled?: boolean; full?: boolean; ltr?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Number.isFinite(value) ? (decimals ? faDigits(String(value), true) : money(value)) : '');
  return (
    <span className={cx('nm-in num', invalid && 'err')} style={full ? { width: '100%' } : undefined}>
      <input
        id={id} aria-label={label} aria-invalid={invalid || undefined} inputMode="decimal" dir={ltr ? 'ltr' : undefined} disabled={disabled} value={shown}
        onFocus={() => setText(shown)}
        onChange={(e) => { const t = e.target.value; setText(t); const n = parseFloat(enDigits(t).replace(/[٬,]/g, '')); onChange(t.trim() === '' ? NaN : Number.isFinite(n) ? n : NaN); }}
        onBlur={() => setText(null)}
        style={full ? undefined : { width }}
      />
      {suffix != null && <span className="sfx">{suffix}</span>}
    </span>
  );
}

/** Choice chips. Single choice by default; `multi` for several. */
export function Chips<K extends string | number>({ value, onChange, options, label, disabled }: { value: K | K[]; onChange: (v: K) => void; options: { key: K; label: ReactNode }[]; label: string; disabled?: boolean }) {
  const on = (k: K) => (Array.isArray(value) ? value.includes(k) : value === k);
  return (
    <div className="nm-chips" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.key)} type="button" className="nm-chip" aria-pressed={on(o.key)} disabled={disabled} onClick={() => onChange(o.key)}>{o.label}</button>)}
    </div>
  );
}

/** Labeled form field (Namadno One .nm-field) for forms in cards and dialogs. */
export function Field({ label, htmlFor, help, error, children, style }: { label: ReactNode; htmlFor?: string; help?: ReactNode; error?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="nm-field" style={style}>
      <label className="l" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="nm-help err" role="alert">{error}</span> : help ? <span className="nm-help">{help}</span> : null}
    </div>
  );
}

/** Callout. */
export function Note({ tone = 'info', icon, children, action, style }: { tone?: 'info' | 'warn' | 'err' | 'ok' | 'mute'; icon?: string; children: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  const d = icon ?? (tone === 'warn' || tone === 'err' ? P.alert : tone === 'ok' ? P.check : 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01');
  return <div className={`nm-note ${tone}`} role={tone === 'err' ? 'alert' : undefined} style={style}><Icon d={d} size={18} /><span style={{ flex: 1, minWidth: 0 }}>{children}</span>{action && <span className="x">{action}</span>}</div>;
}

// ───────────────────────── dialogs ─────────────────────────

/** Centered dialog with a scrim. Esc / scrim click closes. Footer actions sit at the end (primary last). */
export function Dialog({ open, onClose, title, sub, icon, width, footer, children, label }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; icon?: ReactNode; width?: number; footer?: ReactNode; children?: ReactNode; label?: string }) {
  const hid = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="nm-dlg-dim" onMouseDown={onClose}>
      <div className="nm-dlg" role="dialog" aria-modal="true" aria-labelledby={label ? undefined : hid} aria-label={label} style={width ? ({ '--w': `${width}px` } as CSSProperties) : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="nm-dlg-h">
          {icon}
          <span className="nm-col"><h2 id={hid}>{title}</h2>{sub && <p>{sub}</p>}</span>
          <button type="button" className="nm-ib" aria-label="بستن" onClick={onClose} style={{ marginRight: 'auto', marginTop: -4 }}><Icon d={P.close} size={18} /></button>
        </div>
        {children != null && <div className="nm-dlg-b">{children}</div>}
        {footer && <div className="nm-dlg-f">{footer}</div>}
      </div>
    </div>
  );
}

/** Yes/no confirmation. */
export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onClose }: { open: boolean; title: ReactNode; body?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} width={440}
      icon={<Tile d={P.alert} tone={danger ? 'error' : 'warning'} size="lg" />}
      footer={<><button type="button" className="nm-btn ghost" onClick={onClose}>انصراف</button><button type="button" className={cx('nm-btn', danger && 'danger')} disabled={busy} onClick={onConfirm}>{confirmLabel}</button></>}>
      {body}
    </Dialog>
  );
}

// ───────────────────────── feedback ─────────────────────────

/** Empty state (inside cards and tables). */
export function Empty({ icon = P.inbox, tone, title, sub, action }: { icon?: string; tone?: Tone; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className={'nm-empty' + tn(tone)}>
      <span className="ic"><Icon d={icon} size={22} /></span>
      <b>{title}</b>
      {sub && <p>{sub}</p>}
      {action}
    </div>
  );
}

/** Error with retry. `flat` = inside a card (no own card). */
export function ErrorBlock({ error, message, onRetry, flat }: { error?: unknown; message?: string; onRetry?: () => void; flat?: boolean }) {
  const msg = message ?? (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string' ? (error as { message: string }).message : 'دریافت اطلاعات ممکن نشد');
  const body = <Empty icon={P.alert} tone="error" title={msg} action={onRetry && <button type="button" className="nm-btn sm ghost" onClick={onRetry}>تلاش دوباره</button>} />;
  return flat ? <div role="alert">{body}</div> : <section className="nm-card" role="alert">{body}</section>;
}

/** Shimmer placeholder. */
export function Skel({ w = '100%', h = 14, r, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) {
  return <span className="nm-skel" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
/** Loading rows for tables and lists. */
export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div className="nm-skel-rows" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i}><Skel w={34} h={34} r={17} /><span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}><Skel w="32%" h={11} /><Skel w="20%" h={9} /></span><Skel w={70} h={20} r={10} /></div>
      ))}
    </div>
  );
}
/** Placeholder card while a page loads. */
export function SkeletonCard({ h = 220 }: { h?: number }) {
  return <section className="nm-card" aria-hidden="true" style={{ height: h, padding: 20, gap: 12 }}><Skel w="28%" h={14} /><Skel w="60%" h={10} /><Skel w="100%" h={h - 110} r={12} style={{ marginTop: 'auto' }} /></section>;
}

// ───────────────────────── wizard ─────────────────────────

export interface StepItem { label: string; sub?: string; href?: string }
/** Horizontal steps of a multi-step flow. `current` is 0-based; steps before it are done. */
export function Steps({ steps, current }: { steps: StepItem[]; current: number }) {
  return (
    <nav className="nm-steps" aria-label="مراحل">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'cur' : '';
        const inner = (<><i>{i < current ? <Icon d={P.check} size={14} strokeWidth={2.4} /> : faDigits(i + 1)}</i><span className="nm-col"><b>{s.label}</b>{s.sub && <small>{s.sub}</small>}</span></>);
        return (
          <Fragment key={i}>
            {i > 0 && <span className={cx('ln', i <= current && 'done')} aria-hidden="true" />}
            {s.href && i !== current ? <Link href={s.href} className={cx('nm-step', state)}>{inner}</Link> : <span className={cx('nm-step', state)} aria-current={i === current ? 'step' : undefined}>{inner}</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Sticky bar at the bottom of forms and wizards: summary on the right, actions on the left. */
export function ActionBar({ children, actions }: { children?: ReactNode; actions: ReactNode }) {
  return <div className="nm-bar" role="region" aria-label="اقدام‌ها">{children}<span className="x">{actions}</span></div>;
}

// ───────────────────────── charts (src/components/panel/charts.tsx) ─────────────────────────
export { Allocation, Bars, LineChart, Ring, Spark, niceMax, smoothPath, useWidth, type Series } from './charts';
