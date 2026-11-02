'use client';
/**
 * Deposit receipt («فیش واریز») previews, shared by the organization panel and the operator console.
 *   ReceiptThumb  small square: the image, or a PDF / file tile — for lists and table cells
 *   ReceiptView   large preview: the image (opens full size in a new tab) or the PDF's name and size
 * `receipt.url` is a preview data URL in the mock (images only); the real backend returns the file URL.
 */
import type { CSSProperties } from 'react';
import type { ReceiptFile } from '@/api/op-treasury-extra';
import { Icon } from '@/components/ui/Icon';
import { faDigits } from '@/lib/format';

const isImage = (r: ReceiptFile) => r.type.startsWith('image/') && !!r.url;
/** «۱٫۲ مگابایت» / «۴۸۰ کیلوبایت». */
export function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${faDigits((bytes / 1024 / 1024).toFixed(1).replace('.', '٫'))} مگابایت` : `${faDigits(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
}

export function ReceiptThumb({ receipt, size = 40, style }: { receipt?: ReceiptFile; size?: number; style?: CSSProperties }) {
  const box: CSSProperties = {
    width: size, height: size, flex: 'none', borderRadius: Math.round(size / 4), overflow: 'hidden',
    background: 'var(--bg-neutral)', boxShadow: 'inset 0 0 0 1px var(--line)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', ...style,
  };
  if (!receipt) return <span style={box} aria-label="بدون فیش"><Icon name="doc" size={Math.round(size * 0.5)} /></span>;
  if (isImage(receipt)) {
     
    return <span style={box}><img src={receipt.url} alt={`فیش واریز · ${receipt.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>;
  }
  return (
    <span style={box} title={receipt.name} aria-label={`فیش ${receipt.type === 'application/pdf' ? 'PDF' : ''} · ${receipt.name}`}>
      <span style={{ display: 'grid', placeItems: 'center', gap: 1 }}>
        <Icon name="doc" size={Math.round(size * 0.42)} />
        {size >= 36 && <b style={{ fontSize: 9, letterSpacing: '.04em' }}>{receipt.type === 'application/pdf' ? 'PDF' : 'FILE'}</b>}
      </span>
    </span>
  );
}

export function ReceiptView({ receipt, maxHeight = 420 }: { receipt?: ReceiptFile; maxHeight?: number }) {
  if (!receipt) {
    return <div className="nm-note mute"><Icon name="doc" size={18} /><span>فیشی بارگذاری نشده است.</span></div>;
  }
  const meta = <span className="mute" style={{ fontSize: 12 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{receipt.name}</span> · {fileSize(receipt.size)}</span>;
  if (isImage(receipt)) {
    return (
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href={receipt.url} target="_blank" rel="noreferrer" aria-label="باز کردن فیش در اندازه‌ی کامل"
          style={{ display: 'grid', placeItems: 'center', borderRadius: 14, overflow: 'hidden', background: 'var(--bg-neutral)', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          { }
          <img src={receipt.url} alt={`فیش واریز · ${receipt.name}`} style={{ display: 'block', maxWidth: '100%', maxHeight, objectFit: 'contain' }} />
        </a>
        <figcaption style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{meta}<a className="nm-more" href={receipt.url} target="_blank" rel="noreferrer" style={{ marginRight: 'auto' }}>اندازه‌ی کامل</a></figcaption>
      </figure>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, background: 'var(--bg-neutral)' }}>
      <ReceiptThumb receipt={receipt} size={52} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <b style={{ fontSize: 13.5 }}>{receipt.type === 'application/pdf' ? 'فیش PDF' : 'فایل فیش'}</b>
        {meta}
      </span>
      {receipt.url && <a className="nm-more" href={receipt.url} target="_blank" rel="noreferrer" style={{ marginRight: 'auto' }}>باز کردن</a>}
    </div>
  );
}
