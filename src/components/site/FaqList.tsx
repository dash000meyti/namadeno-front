'use client';
/** FAQ accordion backed by GET /public/faq. Optional limit and free-text filter. */
import { useState } from 'react';
import { usePublicFaq } from '@/api/site';
import { Icon } from '@/components/ui/Icon';
import { SiteError } from './Section';

const norm = (s: string) => s.replace(/[يك]/g, (c) => (c === 'ي' ? 'ی' : 'ک')).replace(/‌/g, ' ').toLowerCase();

export function FaqList({ limit, query = '' }: { limit?: number; query?: string }) {
  const q = usePublicFaq();
  const [open, setOpen] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <div className="card s-faq" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="s-faq-item" style={{ padding: '18px 0' }}><span className="s-skl" style={{ display: 'block', height: 18, width: `${70 - i * 8}%` }} /></div>
        ))}
      </div>
    );
  }
  if (q.isError) return <SiteError message={q.error?.message} onRetry={() => q.refetch()} />;

  const needle = norm(query.trim());
  let items = q.data ?? [];
  if (needle) items = items.filter((f) => norm(f.q + ' ' + f.a).includes(needle));
  if (limit) items = items.slice(0, limit);

  if (!items.length) {
    return (
      <div className="card s-card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="s-itile c-default"><Icon name="search" /></span>
        <span style={{ fontWeight: 600 }}>سوالی با این عبارت پیدا نشد.</span>
        <span className="cap">عبارت دیگری را امتحان کنید یا از صفحه تماس با ما بپرسید.</span>
      </div>
    );
  }

  return (
    <div className="card s-faq">
      {items.map((f) => {
        const isOpen = open === f.id;
        return (
          <div key={f.id} className="s-faq-item">
            <h3 style={{ margin: 0, fontSize: 'inherit' }}>
              <button type="button" className="s-faq-q" aria-expanded={isOpen} aria-controls={`faq-a-${f.id}`} id={`faq-q-${f.id}`} onClick={() => setOpen(isOpen ? null : f.id)}>
                <span>{f.q}</span>
                <Icon name="plus" />
              </button>
            </h3>
            {isOpen && <div id={`faq-a-${f.id}`} role="region" aria-labelledby={`faq-q-${f.id}`} className="s-faq-a">{f.a}</div>}
          </div>
        );
      })}
    </div>
  );
}
