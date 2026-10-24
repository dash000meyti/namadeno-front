/**
 * Brand motif drawn from the logo's own construction (src/components/ui/Brand.tsx):
 *   variant="mark" — the mark as a blueprint: 4-unit construction grid, the circles that define its two
 *                    quarter-circle steps, hairline outline of the body, and the steps in the brand gradient
 *                    gently stepping out along the diagonal (growth — the «نو» of نمادنو).
 *   variant="grid" — the construction grid as a quiet texture for wide areas, with occasional modules
 *                    (a square cell and a quarter circle) borrowed from the mark. Fades out at the edges.
 * Colors from --mo-line / --mo-a / --mo-b / --mo-c (base.css). Purely decorative.
 */
import type { CSSProperties } from 'react';
import { MARK_BODY, MARK_STEP_A, MARK_STEP_B } from './Brand';

const GRID: string = (() => {
  let d = '';
  for (let v = -12; v <= 46; v += 4) d += `M${v} -12V46M-12 ${v}H46`;
  return d;
})();

export function Motif({ variant = 'mark', animate = true, className, style }: { variant?: 'mark' | 'grid'; animate?: boolean; className?: string; style?: CSSProperties }) {
  const cls = 'nm-motif ' + variant + (animate ? ' anim' : '') + (className ? ' ' + className : '');

  if (variant === 'grid') {
    return (
      <svg className={cls} aria-hidden="true" style={style}>
        <defs>
          <pattern id="mo-grid" width="192" height="192" patternUnits="userSpaceOnUse">
            <path d="M0 .5H192M0 32.5H192M0 64.5H192M0 96.5H192M0 128.5H192M0 160.5H192M.5 0V192M32.5 0V192M64.5 0V192M96.5 0V192M128.5 0V192M160.5 0V192" className="mo-l" />
            <rect x="64.5" y="32.5" width="32" height="32" className="mo-cell" />
            <path d="M160.5 128.5a32 32 0 0 1-32 32v-32z" className="mo-q" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mo-grid)" />
      </svg>
    );
  }

  return (
    <svg className={cls} viewBox="-12 -12 58 58" aria-hidden="true" style={style}>
      <defs>
        <linearGradient id="mo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--mo-a)' }} />
          <stop offset=".55" style={{ stopColor: 'var(--mo-b)' }} />
          <stop offset="1" style={{ stopColor: 'var(--mo-c)' }} />
        </linearGradient>
        <radialGradient id="mo-fade" cx="17" cy="17" r="30" gradientUnits="userSpaceOnUse">
          <stop offset=".35" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="mo-mask"><rect x="-12" y="-12" width="58" height="58" fill="url(#mo-fade)" /></mask>
      </defs>
      <g mask="url(#mo-mask)" fill="none" className="mo-l">
        <path d={GRID} />
        <path d="M-12 -12L46 46" className="mo-dash" />
        <circle cx="25" cy="17" r="8" className="mo-dash" />
        <circle cx="17" cy="25" r="8" className="mo-dash" />
        <circle cx="17" cy="17" r="22.63" className="mo-dash" />
      </g>
      <path d={MARK_BODY} className="mo-body" />
      <path d={MARK_STEP_A} className="mo-step a" fill="url(#mo-g)" />
      <path d={MARK_STEP_B} className="mo-step b" fill="url(#mo-g)" />
    </svg>
  );
}
