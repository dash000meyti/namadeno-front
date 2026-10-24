'use client';
/** Quiet strip under the hero: the funds behind every package (GET /public/funds). */
import { usePublicFunds } from '@/api/site';
import { percent } from '@/lib/format';
import { ASSET_ICON, ASSET_META } from '@/lib/locks';
import { Icon } from '@/components/ui/Icon';

export function FundStrip() {
  const q = usePublicFunds();
  const funds = (q.data ?? []).filter((f) => f.status === 'active');
  return (
    <section id="funds" className="s-strip" aria-label="دارایی‌های نمادنو">
      <div className="s-wrap s-strip-in">
        <div className="s-strip-list" aria-busy={q.isLoading}>
          {q.isLoading && [0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="s-strip-it"><span className="s-skl" style={{ display: 'block', height: 16, width: 90 }} /><span className="s-skl" style={{ display: 'block', height: 12, width: 70, marginTop: 6 }} /></div>
          ))}
          {funds.map((f) => (
            <div key={f.id} className="s-strip-it">
              <span className="ic" aria-hidden="true" style={{ background: ASSET_META[f.kind]?.soft ?? 'var(--soft-primary)', color: ASSET_META[f.kind]?.fg ?? 'var(--primary-text)' }}>
                <Icon d={ASSET_ICON[f.kind] ?? ASSET_ICON.equity} size={17} strokeWidth={1.8} />
              </span>
              <span className="tx">
                <span className="n">{f.shortName || f.name.replace(/^صندوق\s*/, '')}</span>
                <span className="m">
                  <span>بازده سالانه <b style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{percent(f.return1y, 0)}</b></span>
                  <span dir="ltr" style={{ color: f.navChangePct1d >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>{percent(f.navChangePct1d, 2, true)}</span>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
