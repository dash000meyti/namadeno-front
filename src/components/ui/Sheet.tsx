'use client';
/**
 * Bottom sheet used by the mobile app (design: grab line, 24px top radius, slides up).
 * Renders inside the current .s-app screen (position: absolute), with a dimmed scrim.
 */
import { useEffect } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Height as a CSS value; default auto (max 88%). */
  height?: string;
  padding?: string;
  hideHeader?: boolean;
  label?: string;
}

export function Sheet({ open, onClose, title, subtitle, children, height, padding = '0 16px 24px', hideHeader, label }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <button aria-label="بستن" onClick={onClose} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, margin: 0, padding: 0, background: 'rgb(20 24 38 / .45)', cursor: 'pointer' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height, maxHeight: '88%', boxSizing: 'border-box', padding,
          borderRadius: '24px 24px 0 0', background: 'var(--bg-paper)', display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 -12px 32px rgb(20 24 38 / .25)', animation: 'nmInfoUp .3s cubic-bezier(.2,.8,.2,1)', overflowY: 'auto',
        }}
      >
        <span aria-hidden="true" style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, background: 'var(--grey-400)', marginTop: 8, flex: 'none' }} />
        {!hideHeader && (title || subtitle) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.35 }}>
              {title && <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>}
              {subtitle && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{subtitle}</span>}
            </span>
            <button className="ibtn" aria-label="بستن" onClick={onClose} style={{ width: 36, height: 36, color: 'var(--text-secondary)' }}>
              <Icon name="close" size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
