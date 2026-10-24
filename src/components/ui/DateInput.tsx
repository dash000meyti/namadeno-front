'use client';
/**
 * Jalali date field with a calendar button — every date input in the app and the panels uses it.
 *
 * - The value stays the text the forms already keep («۱۴۰۵/۰۹/۱۵», Persian or Latin digits); typing still works.
 * - The calendar button opens a month view (week starts on Saturday) in a popover rendered into <body>,
 *   so tables, cards and dialogs never clip it. Month and year selects jump far (birth dates).
 * - `min` / `max` (ISO or Date) disable days outside the range; «امروز» and optional «پاک کردن».
 *
 * `DateInput` = field + button (variant 'in' = compact panel field, 'ctl' = form field).
 * `DatePickerButton` = only the button, for custom-styled fields (it anchors to its parent element).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { faDigits, JALALI_MONTHS } from '@/lib/format';
import { now } from '@/lib/clock';
import { formatJalali, jParts, jalaliToIsoAny, monthLength, parseJalaliText, weekdaySat, ymdKey, type YMD } from '@/lib/jalali';

const CAL = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2';
const CHEV_R = 'M10 6l6 6-6 6';
const CHEV_L = 'M14 6l-6 6 6 6';
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const WEEK_FULL = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

type Bound = string | Date | undefined;
const toYmd = (b: Bound): YMD | null => (b ? jParts(b) : null);

interface PickerProps {
  /** Current text value of the field. */
  value: string;
  /** Called with «۱۴۰۵/۰۹/۱۵» (or '' when cleared). */
  onChange: (text: string) => void;
  min?: Bound;
  max?: Bound;
  /** Shows «پاک کردن» (optional dates). */
  clearable?: boolean;
  /** Name of the field for the button's accessible label, e.g. «سررسید مرحله ۲». */
  label?: string;
  disabled?: boolean;
}

/** Only the calendar button; the popover anchors to the button's parent (the field box). */
export function DatePickerButton({ value, onChange, min, max, clearable, label, disabled, className }: PickerProps & { className?: string }) {
  const [btn, setBtn] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const anchor = btn?.parentElement ?? btn;
  return (
    <>
      <button
        ref={setBtn} type="button" className={'nm-dp-btn' + (className ? ' ' + className : '')} disabled={disabled}
        aria-label={`انتخاب ${label ?? 'تاریخ'} از تقویم`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon d={CAL} size={17} />
      </button>
      {open && anchor && (
        <Popover anchor={anchor} onClose={() => { setOpen(false); btn?.focus(); }}>
          <Calendar
            selected={parseJalaliText(value)} min={toYmd(min)} max={toYmd(max)} clearable={clearable}
            onPick={(p) => { onChange(p ? formatJalali(p) : ''); setOpen(false); btn?.focus(); }}
          />
        </Popover>
      )}
    </>
  );
}

/** Date field + calendar button. */
export function DateInput({ value, onChange, min, max, clearable, label, disabled, id, placeholder = '۱۴۰۵/۰۹/۱۵', invalid, variant = 'in', width = 112, full, style, onBlur }: PickerProps & {
  id?: string; placeholder?: string; invalid?: boolean; onBlur?: () => void;
  /** 'in' = compact panel field (tables, setting rows); 'ctl' = form field (.nm-ctl). */
  variant?: 'in' | 'ctl';
  /** Width of the text part for variant 'in'. */
  width?: number;
  /** Stretch to the container width (variant 'in'). */
  full?: boolean;
  style?: CSSProperties;
}) {
  const cls = variant === 'ctl' ? 'nm-ctl nm-date' + (invalid ? ' err' : '') : 'nm-in nm-date' + (invalid ? ' err' : '');
  return (
    <span className={cls} style={{ ...(full ? { width: '100%' } : null), ...style }}>
      <input
        id={id} type="text" aria-label={label} className="num" value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} onBlur={onBlur} aria-invalid={invalid || undefined} autoComplete="off"
        style={variant === 'in' && !full ? { width } : undefined}
      />
      <DatePickerButton value={value} onChange={onChange} min={min} max={max} clearable={clearable} label={label} disabled={disabled} />
    </span>
  );
}

// ───────────── popover ─────────────

function Popover({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = ref.current?.offsetWidth ?? 292;
      const h = ref.current?.offsetHeight ?? 360;
      const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
      const fitsBelow = r.bottom + 6 + h <= window.innerHeight - 8;
      const top = fitsBelow || r.top < h + 14 ? Math.min(r.bottom + 6, window.innerHeight - h - 8) : r.top - 6 - h;
      setPos({ top: Math.max(8, top), left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    // capture: Esc closes only the calendar, not the dialog or inspector around the field
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={ref} className="nm-dp" role="dialog" aria-label="انتخاب تاریخ" style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

// ───────────── calendar ─────────────

function Calendar({ selected, min, max, clearable, onPick }: { selected: YMD | null; min: YMD | null; max: YMD | null; clearable?: boolean; onPick: (p: YMD | null) => void }) {
  const today = jParts(now());
  const out = (p: YMD) => (!!min && ymdKey(p) < ymdKey(min)) || (!!max && ymdKey(p) > ymdKey(max));
  const start = selected ?? (out(today) ? (min && ymdKey(today) < ymdKey(min) ? min : max ?? today) : today);
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [focusDay, setFocusDay] = useState(start.y === view.y && start.m === view.m ? start.d : 1);
  const grid = useRef<HTMLDivElement | null>(null);
  // move focus into the grid on open and on arrow keys only (not while using the month/year selects)
  const wantFocus = useRef(true);

  const len = monthLength(view.y, view.m);
  const first = weekdaySat(jalaliToIsoAny(view.y, view.m, 1)!);
  const yFrom = min?.y ?? today.y - 100;
  const yTo = max?.y ?? today.y + 10;
  const years = Array.from({ length: Math.max(1, yTo - yFrom + 1) }, (_, i) => yFrom + i);

  const shift = (dm: number) => setView((v) => {
    const t = v.y * 12 + (v.m - 1) + dm;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  });
  const canPrev = !min || view.y * 12 + view.m > min.y * 12 + min.m;
  const canNext = !max || view.y * 12 + view.m < max.y * 12 + max.m;

  const fd = Math.min(focusDay, len);
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`button[data-d="${fd}"]`)?.focus();
  }, [fd, view]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    if (!step) return;
    e.preventDefault();
    wantFocus.current = true;
    const t = fd + step;
    if (t < 1) { const pl = monthLength(view.m === 1 ? view.y - 1 : view.y, view.m === 1 ? 12 : view.m - 1); shift(-1); setFocusDay(pl + t); }
    else if (t > len) { shift(1); setFocusDay(t - len); }
    else setFocusDay(t);
  };

  return (
    <div className="nm-dp-in">
      <div className="nm-dp-h">
        <button type="button" className="nm-dp-nav" aria-label="ماه قبل" disabled={!canPrev} onClick={() => shift(-1)}><Icon d={CHEV_R} size={16} /></button>
        <span className="nm-dp-sel">
          <select aria-label="ماه" value={view.m} onChange={(e) => setView((v) => ({ ...v, m: Number(e.target.value) }))}>
            {JALALI_MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
          <select aria-label="سال" className="num" value={view.y} onChange={(e) => setView((v) => ({ ...v, y: Number(e.target.value) }))}>
            {years.map((y) => <option key={y} value={y}>{faDigits(y)}</option>)}
          </select>
        </span>
        <button type="button" className="nm-dp-nav" aria-label="ماه بعد" disabled={!canNext} onClick={() => shift(1)}><Icon d={CHEV_L} size={16} /></button>
      </div>
      <div className="nm-dp-wk" aria-hidden="true">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
      <div ref={grid} className="nm-dp-grid" role="grid" onKeyDown={onKey}>
        {Array.from({ length: first }, (_, i) => <span key={'b' + i} />)}
        {Array.from({ length: len }, (_, i) => {
          const p = { y: view.y, m: view.m, d: i + 1 };
          const isSel = !!selected && ymdKey(selected) === ymdKey(p);
          const isToday = ymdKey(today) === ymdKey(p);
          const col = (first + i) % 7;
          return (
            <button
              key={i} type="button" data-d={p.d} tabIndex={p.d === fd ? 0 : -1} disabled={out(p)}
              className={'num' + (isSel ? ' on' : '') + (isToday ? ' today' : '') + (col === 6 ? ' fri' : '')}
              aria-pressed={isSel} aria-current={isToday ? 'date' : undefined}
              aria-label={`${WEEK_FULL[col]} ${faDigits(p.d)} ${JALALI_MONTHS[p.m - 1]} ${faDigits(p.y)}`}
              onClick={() => onPick(p)} onFocus={() => setFocusDay(p.d)}
            >
              {faDigits(p.d)}
            </button>
          );
        })}
      </div>
      <div className="nm-dp-f">
        <button type="button" className="nm-dp-link" disabled={out(today)} onClick={() => onPick(today)}>امروز</button>
        {clearable && <button type="button" className="nm-dp-link mute" onClick={() => onPick(null)}>پاک کردن</button>}
      </div>
    </div>
  );
}
