/**
 * Namadno logo — exact geometry of the brand files (design: logo.svg, logotype.svg, logofull.svg; copies in /public/brand).
 * Monochrome: everything is filled with currentColor (ink on light, white on dark). Do not recolor or redraw.
 *   LogoMark  — the mark (square with a square counter, two quarter circles stepping out). viewBox 1 1 32 32.
 *   Logotype  — the «نمادنو» wordmark built on the same 4-unit module. viewBox 1 5 98 22.
 *   LogoFull  — wordmark + mark as one lockup (mark on the reading-start side). viewBox 1 1 138 32.
 */
import type { CSSProperties } from 'react';

export const MARK_BODY = 'M1 22.3332C1 23.806 2.194 25 3.66659 25L17.0002 25L17.0002 17.0007L10.3341 17.0007C9.59777 17.0007 9.00044 16.4037 9.00044 15.6673L9.00044 10.3337C9.00044 9.59734 9.59777 9.00035 10.3341 9.00035L15.6679 9.00035C16.4042 9.00035 17.0009 9.59734 17.0009 10.3337L17.0009 16.9996L25 16.9996L25 3.66678C25 2.19397 23.806 0.999998 22.3328 0.999998L3.66659 1C2.194 1 0.999999 2.19398 1 3.66679L1 22.3332Z';
/** The two quarter circles that step out of the square (radius 8, centers 25,17 and 17,25). */
export const MARK_STEP_A = 'M33 17C33 21.4183 29.4183 25 25 25L25 17L33 17Z';
export const MARK_STEP_B = 'M25 25C25 29.4183 21.4183 33 17 33L17 25L25 25Z';

const LOGOTYPE = [
  'M41 11h4v6h-4z', 'M7 5h8v4H7z', 'M7 13h8v4H7z', 'M7 19h8v4H7z', 'M17 11h4v2h-4z', 'M53 19h4v4h-4z',
  'M39 9L34 9C33.4477 9 33 8.55228 33 8L33 6C33 5.44771 33.4477 5 34 5L39 5L39 9Z',
  'M39 23L30 23C29.4477 23 29 22.5523 29 22L29 20C29 19.4477 29.4477 19 30 19L39 19L39 23Z',
  'M45 17L45 18C45 20.7614 42.7614 23 40 23L39 23L39 19L40 19C40.5523 19 41 18.5523 41 18L41 17L45 17Z',
  'M39 5L40 5C42.7614 5 45 7.23858 45 10V11H41L41 10C41 9.44771 40.5523 9 40 9L39 9V5Z',
  'M25 5H28C28.5523 5 29 5.44772 29 6V8C29 8.55228 28.5523 9 28 9H26C25.4477 9 25 8.55228 25 8V5Z',
  'M95 5H98C98.5523 5 99 5.44772 99 6V8C99 8.55228 98.5523 9 98 9H96C95.4477 9 95 8.55228 95 8V5Z',
  'M15 13L28 13C28.5523 13 29 13.4477 29 14V16C29 16.5523 28.5523 17 28 17L15 17V13Z',
  'M7 23L4 23C3.44771 23 3 22.5523 3 22L3 20C3 19.4477 3.44772 19 4 19L7 19L7 23Z',
  'M21 17L21 18C21 20.7614 18.7614 23 16 23L15 23L15 19L16 19C16.5523 19 17 18.5523 17 18L17 17L21 17Z',
  'M15 5L16 5C18.7614 5 21 7.23858 21 10V11H17L17 10C17 9.44771 16.5523 9 16 9L15 9V5Z',
  'M1 11L1 10C1 7.23858 3.23858 5 6 5L7 5L7 9L6 9C5.44771 9 5 9.44771 5 10L5 11L1 11Z',
  'M7 17L6 17C3.23858 17 1 14.7614 0.999999 12L0.999999 11L5 11L5 12C5 12.5523 5.44771 13 6 13L7 13L7 17Z',
  'M57 19H58.1716C58.702 19 59.2107 18.7893 59.5858 18.4142L63 15L66 18L62.7574 21.2426C61.6321 22.3679 60.106 23 58.5147 23H57V19Z',
  'M85 19H79L76 18L79.2426 21.2426C80.3679 22.3679 81.894 23 83.4853 23H85V19Z',
  'M47 17L47 6C47 5.44771 47.4477 5 48 5L50 5C50.5523 5 51 5.44772 51 6L51 17L47 17Z',
  'M80 19L98 19C98.5523 19 99 19.4477 99 20V22C99 22.5523 98.5523 23 98 23L84 23C81.7909 23 80 21.2091 80 19Z',
  'M53 23L52 23C49.2386 23 47 20.7614 47 18L47 17L51 17L51 18C51 18.5523 51.4477 19 52 19L53 19L53 23Z',
  'M67 11L70 14L66 18L63 15L67 11Z', 'M75 25L72 22L75 19L78 22L75 25Z', 'M75 11L78 14L75 17L72 14L75 11Z', 'M67 25L63 21L66 18L70 22L67 25Z',
  'M67 11L67.4645 10.5355C69.4171 8.58291 72.5829 8.58291 74.5355 10.5355L75 11L72 14L71.7071 13.7071C71.3166 13.3166 70.6834 13.3166 70.2929 13.7071L70 14L67 11Z',
  'M75 25L74.5355 25.4645C72.5829 27.4171 69.4171 27.4171 67.4645 25.4645L67 25L70 22L70.2929 22.2929C70.6834 22.6834 71.3166 22.6834 71.7071 22.2929L72 22L75 25Z',
  'M78 14L78.4645 14.4645C80.4171 16.4171 80.4171 19.5829 78.4645 21.5355L78 22L75 19L75.2929 18.7071C75.6834 18.3166 75.6834 17.6834 75.2929 17.2929L75 17L78 14Z',
];

type Common = { className?: string; style?: CSSProperties; title?: string };
const a11y = (title?: string) => (title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const });

export function LogoMark({ size = 32, className, style, title }: Common & { size?: number }) {
  return (
    <svg className={'nm-logo' + (className ? ' ' + className : '')} viewBox="1 1 32 32" width={size} height={size} fill="currentColor" style={style} {...a11y(title)}>
      <path d={MARK_BODY} /><path d={MARK_STEP_A} /><path d={MARK_STEP_B} />
    </svg>
  );
}

export function Logotype({ height = 22, className, style, title }: Common & { height?: number }) {
  return (
    <svg className={'nm-logo' + (className ? ' ' + className : '')} viewBox="1 5 98 22" height={height} width={(height * 98) / 22} fill="currentColor" style={style} {...a11y(title)}>
      {LOGOTYPE.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export function LogoFull({ height = 32, className, style, title = 'نمادنو' }: Common & { height?: number }) {
  return (
    <svg className={'nm-logo' + (className ? ' ' + className : '')} viewBox="1 1 138 32" height={height} width={(height * 138) / 32} fill="currentColor" style={style} {...a11y(title)}>
      {LOGOTYPE.map((d) => <path key={d} d={d} />)}
      <g transform="translate(106 0)"><path d={MARK_BODY} /><path d={MARK_STEP_A} /><path d={MARK_STEP_B} /></g>
    </svg>
  );
}
