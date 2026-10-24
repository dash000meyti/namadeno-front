'use client';
/**
 * Panel kit — charts. One visual language for every chart in the panels (re-exported from kit.tsx):
 *   Bars        vertical bars, optionally stacked series, x labels, optional value labels
 *   LineChart   one or more smooth lines (optional area / dashed), y ticks, hover readout
 *   Spark       tiny trend line for table cells and stats
 *   Ring        single value gauge (score, rate)
 *   Allocation  shares of a whole: one stacked bar + legend rows (replaces donuts)
 * Colors: pass CSS colors (var(--chart-1) …). Numbers in labels must be pre-formatted by the caller (fmt).
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { faDigits } from '@/lib/format';

/** Measures an element's width (charts keep text unscaled). */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const cw = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
/** Catmull-Rom → cubic Bézier smoothing. */
export function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** "Nice" axis maximum (1, 2, 2.5, 5 × 10^n). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

export interface Series { name: string; color: string }

/**
 * Vertical bars. `data[i].values[j]` is series j of category i (stacked bottom-up in series order).
 * `highlight` emphasizes one category (e.g. the current month); others are drawn lighter.
 */
export function Bars({ data, series, height = 180, fmt = (n) => faDigits(Math.round(n)), showValues, highlight, label }: {
  data: { label: string; values: number[] }[];
  series: Series[];
  height?: number;
  fmt?: (n: number) => string;
  showValues?: boolean;
  highlight?: number;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>(480);
  const top = showValues ? 20 : 8, bottom = 24;
  const ch = height - top - bottom;
  const max = niceMax(Math.max(1, ...data.map((d) => d.values.reduce((a, b) => a + Math.max(0, b), 0))));
  const n = Math.max(1, data.length);
  const slot = w / n;
  const bw = Math.max(8, Math.min(36, slot * 0.5));
  return (
    <div ref={ref} className="nm-chart" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label={label}>
        {[0, 0.5, 1].map((t) => <line key={t} className="grid" x1={0} x2={w} y1={top + ch * (1 - t)} y2={top + ch * (1 - t)} style={{ opacity: t === 0 ? 1 : 0.6 }} />)}
        {data.map((d, i) => {
          const cx = slot * i + slot / 2;
          let acc = 0;
          const dim = highlight != null && highlight !== i;
          const total = d.values.reduce((a, b) => a + Math.max(0, b), 0);
          return (
            <g key={i} style={{ opacity: dim ? 0.45 : 1 }}>
              <title>{`${d.label}: ${series.length > 1 ? d.values.map((v, j) => `${series[j]?.name ?? ''} ${fmt(v)}`).join(' · ') : fmt(total)}`}</title>
              <rect x={slot * i} y={top} width={slot} height={ch} fill="transparent" />
              {d.values.map((v, j) => {
                const h = (Math.max(0, v) / max) * ch;
                const y = top + ch - acc - h;
                acc += h;
                const last = j === d.values.length - 1 || d.values.slice(j + 1).every((x) => x <= 0);
                if (h <= 0) return null;
                return last
                  ? <path key={j} d={roundTop(cx - bw / 2, y, bw, h, Math.min(5, bw / 3, h))} fill={series[j]?.color ?? 'var(--chart-1)'} />
                  : <rect key={j} x={cx - bw / 2} y={y} width={bw} height={h} fill={series[j]?.color ?? 'var(--chart-1)'} />;
              })}
              {showValues && total > 0 && <text className="ax" x={cx} y={top + ch - (total / max) * ch - 6} textAnchor="middle" style={{ fill: 'var(--text-primary)', fontWeight: 600 }}>{fmt(total)}</text>}
              <text className="ax" x={cx} y={height - 6} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
function roundTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

/** Smooth line chart with hover readout. */
export function LineChart({ labels, series, height = 200, fmt = (n) => faDigits(Math.round(n)), min, label }: {
  labels: string[];
  series: (Series & { values: number[]; area?: boolean; dashed?: boolean })[];
  height?: number;
  fmt?: (n: number) => string;
  /** Lower bound of the y axis (default 0). */
  min?: number;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<number | null>(null);
  const left = 44, top = 10, bottom = 24;
  const cw = Math.max(10, w - left - 8), ch = height - top - bottom;
  const all = series.flatMap((s) => s.values);
  const lo = min ?? 0;
  const hi = niceMax(Math.max(lo + 1, ...all) - lo) + lo;
  const n = Math.max(2, labels.length);
  const x = (i: number) => left + (cw * i) / (n - 1);
  const y = (v: number) => top + ch - ((v - lo) / (hi - lo)) * ch;
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(cw / 70))));
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - left) / cw) * (n - 1));
    setHover(i >= 0 && i < labels.length ? i : null);
  };
  return (
    <div ref={ref} className="nm-chart" style={{ height }}>
      <svg width={w} height={height} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => {
          const v = lo + (hi - lo) * t;
          return (
            <g key={t}>
              <line className="grid" x1={left} x2={left + cw} y1={y(v)} y2={y(v)} style={{ opacity: t === 0 ? 1 : 0.6 }} />
              <text className="ax" x={left - 8} y={y(v) + 4} textAnchor="end">{fmt(v)}</text>
            </g>
          );
        })}
        {labels.map((l, i) => (i % step === 0 || i === labels.length - 1) && <text key={i} className="ax" x={x(i)} y={height - 6} textAnchor="middle">{l}</text>)}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
          const d = smoothPath(pts);
          return (
            <g key={si}>
              {s.area && pts.length > 1 && (
                <>
                  <defs><linearGradient id={`lc-${si}-${label.length}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".18" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
                  <path d={`${d} L${r1(pts[pts.length - 1][0])} ${top + ch} L${r1(pts[0][0])} ${top + ch} Z`} fill={`url(#lc-${si}-${label.length})`} />
                </>
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeDasharray={s.dashed ? '5 5' : undefined} />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + ch} stroke="var(--line-strong)" />
            {series.map((s, si) => s.values[hover] != null && <circle key={si} cx={x(hover)} cy={y(s.values[hover])} r={4} fill="var(--bg-paper)" stroke={s.color} strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <div style={{ position: 'absolute', top: 0, [x(hover) > w / 2 ? 'right' : 'left']: x(hover) > w / 2 ? w - x(hover) + 10 : x(hover) + 10, pointerEvents: 'none', padding: '6px 10px', borderRadius: 10, background: 'var(--bg-paper)', boxShadow: 'var(--pn-float)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap', zIndex: 2 } as CSSProperties}>
          <b style={{ fontWeight: 600 }}>{labels[hover]}</b>
          {series.map((s, si) => <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}><i style={{ width: 8, height: 8, borderRadius: 3, background: s.color }} />{s.name}<b className="num" style={{ marginRight: 'auto', paddingRight: 8, color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(s.values[hover])}</b></span>)}
        </div>
      )}
    </div>
  );
}

/** Tiny trend line. */
export function Spark({ values, color = 'var(--chart-1)', width = 72, height = 24, area = true, label }: { values: number[]; color?: string; width?: number; height?: number; area?: boolean; label?: string }) {
  if (values.length < 2) return <span style={{ width, height, display: 'inline-block' }} />;
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(width * i) / (values.length - 1), 2 + (height - 4) * (1 - (v - lo) / span)] as [number, number]);
  const d = smoothPath(pts);
  return (
    <svg width={width} height={height} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ display: 'block', overflow: 'visible', flex: 'none' }}>
      {area && <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

/** Single value gauge (0..1). */
export function Ring({ value, size = 104, stroke = 10, color = 'var(--primary-main)', children, label }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${r1(c * v)} ${r1(c)}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.2 }}>{children}</div>
    </div>
  );
}

/** Shares of a whole: one stacked bar + legend rows (label, percent, optional amount). */
export function Allocation({ items, fmt, compact }: { items: { label: ReactNode; value: number; color: string }[]; fmt?: (n: number) => string; compact?: boolean }) {
  const total = items.reduce((a, x) => a + Math.max(0, x.value), 0);
  const pct = (v: number) => (total ? faDigits(Math.round((v / total) * 100)) + '٪' : '—');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--fill)' }} role="img" aria-label={items.map((x) => `${typeof x.label === 'string' ? x.label : ''} ${pct(x.value)}`).join('، ')}>
        {items.filter((x) => x.value > 0).map((x, i) => <i key={i} style={{ flex: x.value, background: x.color, minWidth: 3 }} />)}
      </div>
      {compact ? (
        <div className="nm-legend">{items.map((x, i) => <span key={i}><i style={{ background: x.color }} />{x.label}<b>{pct(x.value)}</b></span>)}</div>
      ) : (
        <div className="nm-list">
          {items.map((x, i) => (
            <div key={i} className="nm-li" style={{ minHeight: 40, padding: '6px 0' }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: x.color, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{x.label}</span>
              {fmt && <span className="num mute" style={{ fontSize: 12.5 }}>{fmt(x.value)}</span>}
              <b className="num" style={{ fontSize: 13, fontWeight: 600, width: 44, textAlign: 'left' }}>{pct(x.value)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
