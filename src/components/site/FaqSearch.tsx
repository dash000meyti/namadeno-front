'use client';
/** /faq — searchable FAQ list. */
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { FaqList } from './FaqList';

export function FaqSearch() {
  const [query, setQuery] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
      <div className="tf" style={{ minHeight: 52, background: 'var(--card-bg)' }}>
        <Icon name="search" size={20} style={{ color: 'var(--text-secondary)' }} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجو در سوالات؛ مثلاً «وام» یا «قفل»" aria-label="جست‌وجو در سوالات متداول" style={{ height: 48 }} />
        {query && (
          <button type="button" className="ibtn" style={{ width: 32, height: 32 }} aria-label="پاک کردن جست‌وجو" onClick={() => setQuery('')}><Icon name="close" size={16} /></button>
        )}
      </div>
      <FaqList query={query} />
    </div>
  );
}
