/**
 * Stroke icon in the design system's style (24-grid, 1.5 stroke, round caps).
 * Pass a path `d` copied from the design, or a `name` from the shared set below.
 */
import type { CSSProperties } from 'react';

export const ICONS = {
  back: 'M10 6l6 6-6 6',
  forward: 'M14 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01',
  assets: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2.5-7h11L20 13v6H4z',
  credit: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 14.5l5-5M9.5 9.5h.01M14.5 14.5h.01',
  shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 14.5l5-5',
  card: 'M3 9h18M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 15h4',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2',
  unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5zM12 15v2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  check: 'M5 12l5 5 9-11',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  deposit: 'M12 4v11M8 11l4 4 4-4M4 15v4h16v-4',
  withdraw: 'M12 15V4M8 8l4-4 4 4M4 15v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  swap: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  convert: 'M4 8h13l-3-3M20 16H7l3 3',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  percent: 'M19 5L5 19M7 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2M17 18a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  bank: 'M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18',
  banknote: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6 12h.01M18 12h.01',
  gold: 'M12 9c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  chart: 'M4 19h16M6 16V10M10 16V7M14 16v-5M18 16V5',
  pie: 'M12 3v9h9a9 9 0 1 1-9-9M15 3.5A9 9 0 0 1 20.5 9H15z',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-4-6-1.5S10 7 12 7M12 7c2-4 6-4 6-1.5S14 7 12 7',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21c.8-3.5 3.5-5.5 7-5.5s6.2 2 7 5.5M16 3.5a4 4 0 0 1 0 7.5M18 15.5c2 .7 3.4 2.6 4 5.5',
  building: 'M4 21V5l8-3v19M12 21V8l8 3v10M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8',
  send: 'M20 4L3 11l7 2 2 7zM10 13l10-9',
  chat: 'M4 5h16v11H9l-5 4z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  cart: 'M3 4h2l2.5 11h11L21 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  store: 'M4 10v10h16V10M3 4h18l-1.5 6h-15zM9 20v-6h6v6',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  risk: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  play: 'M8 5v14l11-7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  id: 'M3 5h18v14H3zM8 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5 16c.5-2 1.6-3 3-3s2.5 1 3 3M14 9h4M14 13h4',
  sparkle: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name?: IconName;
  d?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, d, size = 24, strokeWidth, className, style, title }: Props) {
  const path = d ?? (name ? ICONS[name] : '');
  return (
    <svg
      className={'ico' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={strokeWidth ? { strokeWidth, ...style } : style}
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}

/** The Namadno logo mark (used in panels and the site). */
export function LogoMark({ size = 40, radius = 10 }: { size?: number; radius?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: radius, background: 'var(--brand-gradient)', display: 'grid', placeItems: 'center', color: '#FFFFFF', flex: 'none' }}>
      <svg viewBox="0 0 64 40" width={size * 0.65} height={size * 0.4} aria-hidden="true">
        <path d="M3 37 L19 3 H33 L25 20 L31 28 L45 3 H61 L45 37 H31 L39 20 L33 12 L17 37 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
