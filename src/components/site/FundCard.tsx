/** Public fund card: icon, name/symbol, 1y return, sparkline, NAV and risk. */
import type { Fund, FundCategory, RiskLevel } from '@/types/domain';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ASSET_META } from '@/lib/locks';
import { money, percent } from '@/lib/format';

export const RISK_META: Record<RiskLevel, { label: string; c: string }> = {
  low: { label: 'کم', c: 'c-success' },
  medium: { label: 'متوسط', c: 'c-warning' },
  high: { label: 'زیاد', c: 'c-error' },
  very_high: { label: 'خیلی زیاد', c: 'c-error' },
};

export const CATEGORY_LABEL: Record<FundCategory, string> = {
  commodity: 'کالایی',
  fixed_income: 'درآمد ثابت',
  equity: 'سهامی',
  mixed: 'مختلط',
};

export function Sparkline({ values, w = 120, h = 36, color = 'var(--chart-1)', fluid = false }: { values: number[]; w?: number; h?: number; color?: string; fluid?: boolean }) {
  if (values.length < 2) return <span style={{ display: 'block', width: w, height: h }} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${d} L${(w - 2).toFixed(1)} ${h} L2 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={fluid ? '100%' : w} height={h} preserveAspectRatio={fluid ? 'none' : undefined} aria-hidden="true" style={{ display: 'block', overflow: 'visible', direction: 'ltr' }}>
      <path d={area} style={{ fill: color, opacity: 0.1 }} />
      <path d={d} fill="none" style={{ stroke: color }} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FundCard({ fund }: { fund: Fund }) {
  const m = ASSET_META[fund.kind] ?? ASSET_META.gold;
  const soon = fund.status === 'coming_soon';
  const paused = fund.status === 'paused';
  const up = fund.return1y >= 0;
  const hist = (fund.history ?? []).map((x) => x.v);
  return (
    <article className="card s-card s-fund" aria-label={fund.name}>
      <div className="s-fund-top">
        <span className="s-fund-dot" style={{ background: m.soft, color: m.fg }}><Icon name={m.icon as IconName} /></span>
        <div className="s-col" style={{ flex: 1, lineHeight: 1.5 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{fund.name}</h3>
          <span className="cap">{fund.symbol} · {CATEGORY_LABEL[fund.category]}</span>
        </div>
        {soon ? (
          <span className="lbl soft c-info">به‌زودی</span>
        ) : paused ? (
          <span className="lbl soft c-default">متوقف</span>
        ) : (
          <span className={'lbl soft ' + (up ? 'c-success' : 'c-error')} dir="ltr" title="بازده یک‌ساله">{percent(fund.return1y, 0, true)}</span>
        )}
      </div>
      <p style={{ fontSize: 13.5, lineHeight: 1.85, color: 'var(--text-secondary)', minHeight: 50 }}>{fund.description}</p>
      {!soon && hist.length > 1 && (
        <div style={{ height: 40 }}><Sparkline fluid values={hist} w={280} h={40} color={up ? 'var(--chart-1)' : 'var(--error-main)'} /></div>
      )}
      <dl className="s-kv" style={{ margin: 0 }}>
        <div>
          <dt className="k">قیمت هر واحد</dt>
          <dd className="v" style={{ margin: 0 }}>{soon ? '—' : <>{money(fund.nav)} <span className="cap">ت</span></>}</dd>
        </div>
        <div>
          <dt className="k">{fund.effectiveYield ? 'سود مؤثر سالانه' : 'بازده یک‌ساله'}</dt>
          <dd className="v" style={{ margin: 0, color: soon ? undefined : up ? 'var(--success-text)' : 'var(--error-text)' }}>
            {soon ? '—' : <span dir="ltr">{percent(fund.effectiveYield ?? fund.return1y, 0, !fund.effectiveYield)}</span>}
          </dd>
        </div>
        <div>
          <dt className="k">ریسک</dt>
          <dd className="v" style={{ margin: 0 }}><span className={'lbl soft ' + RISK_META[fund.risk].c} style={{ height: 22, fontSize: 11 }}>{RISK_META[fund.risk].label}</span></dd>
        </div>
      </dl>
    </article>
  );
}
