'use client';
/** Quiet strip under the hero: the funds behind every package (GET /public/funds). */
import { usePublicFunds } from '@/api/site';
import { percent } from '@/lib/format';

export function FundStrip() {
  const q = usePublicFunds();
  const funds = (q.data ?? []).filter((f) => f.status === 'active');
  return (
    <section id="funds" className="s-strip" aria-label="صندوق‌های نمادنو">
      <div className="s-wrap s-strip-in">
        <p className="s-strip-t">سرمایه‌ی شما، در صندوق‌های تحت نظارت سازمان بورس</p>
        <div className="s-strip-list" aria-busy={q.isLoading}>
          {q.isLoading && [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="s-strip-it"><span className="s-skl" style={{ display: 'block', height: 16, width: 90 }} /><span className="s-skl" style={{ display: 'block', height: 12, width: 70, marginTop: 6 }} /></div>
          ))}
          {funds.map((f) => (
            <div key={f.id} className="s-strip-it">
              <span className="n">{f.name}</span>
              <span className="m">
                <span>بازده سالانه <b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{percent(f.return1y, 0)}</b></span>
                <span dir="ltr" style={{ color: f.navChangePct1d >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{percent(f.navChangePct1d, 2, true)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
