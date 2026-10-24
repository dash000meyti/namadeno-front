'use client';
/** Headline numbers from GET /public/stats in four glass tiles. */
import { useSiteStats } from '@/api/site-extra';
import { compactMoney, faDigits, money } from '@/lib/format';
import { SiteError } from './Section';

export function SiteStats() {
  const q = useSiteStats();
  if (q.isError) return <SiteError message={q.error?.message} onRetry={() => q.refetch()} />;
  const s = q.data;
  const tiles = [
    { k: 'سازمان همراه', v: s ? faDigits(s.organizations) : null },
    { k: 'عضو فعال', v: s ? money(s.employees) : null },
    { k: 'صندوق فعال', v: s ? faDigits(s.funds) : null },
    { k: 'دارایی امانت‌شده (تومان)', v: s ? compactMoney(s.aum) : null },
  ];
  return (
    <div className="s-g s-g4" aria-busy={q.isLoading}>
      {tiles.map((t) => (
        <div key={t.k} className="card s-card" style={{ gap: 4 }}>
          <span className="cap" style={{ fontSize: 13 }}>{t.k}</span>
          {t.v !== null ? <span className="num" style={{ fontSize: 30, lineHeight: 1.3 }}>{t.v}</span> : <span className="s-skl" style={{ display: 'block', height: 36, width: '60%' }} />}
        </div>
      ))}
    </div>
  );
}
