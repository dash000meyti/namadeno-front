/** Brand-gradient card face (design: app-card) + the small logo chip used in card sub-screens. */
import { faDigits, money } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import type { Card } from '@/types/domain';
import { CI } from './icons';

const LOGO = 'M3 37 L19 3 H33 L25 20 L31 28 L45 3 H61 L45 37 H31 L39 20 L33 12 L17 37 Z';

export const last4 = (c: Card) => faDigits(c.maskedPan.replace(/\D/g, '').slice(-4));

export function LogoChip({ w = 40, h = 28, r = 6, lw = 22, lh = 14 }: { w?: number; h?: number; r?: number; lw?: number; lh?: number }) {
  return (
    <span style={{ width: w, height: h, borderRadius: r, background: 'var(--brand-gradient)', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <svg viewBox="0 0 64 40" width={lw} height={lh} aria-hidden="true"><path d={LOGO} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
    </span>
  );
}

export function CardStatusLabel({ card }: { card: Card }) {
  if (card.status === 'active') return <span className="lbl" style={{ background: 'var(--soft-success)', color: 'var(--success-text)' }}>فعال</span>;
  return <span className="lbl" style={{ background: 'var(--soft-error)', color: 'var(--error-text)' }}>{card.status === 'blocked' ? 'مسدود دائم' : 'مسدود'}</span>;
}

export function CardFace({ card }: { card: Card }) {
  const blocked = card.status !== 'active';
  return (
    <div style={{ height: 200, display: 'flex', justifyContent: 'center', flex: 'none' }}>
      <div role="img" aria-label={`کارت نمادنو ${last4(card)} · ${blocked ? 'مسدود' : 'فعال'}`} style={{ width: '100%', maxWidth: 342, height: 200, boxSizing: 'border-box', borderRadius: 24, background: 'var(--brand-gradient)', color: '#FFFFFF', boxShadow: 'var(--shadow-primary)', padding: '20px 22px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', filter: blocked ? 'grayscale(.55)' : undefined }}>
        <span style={{ position: 'absolute', left: -40, top: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgb(255 255 255 / .08)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <svg viewBox="0 0 64 40" width="30" height="19" aria-hidden="true"><path d={LOGO} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          <span className="wm" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>نمادنو</span>
          {blocked
            ? <span className="lbl" style={{ height: 22, background: 'var(--error-main)', color: '#FFFFFF', fontWeight: 700, gap: 4 }}><Icon d={CI.ban} size={12} />{card.status === 'blocked' ? 'مسدود دائم' : 'مسدود'}</span>
            : <span className="lbl" style={{ height: 22, background: 'rgb(255 255 255 / .18)', color: '#FFFFFF', fontWeight: 600 }}>فعال</span>}
          <span className="lbl num" style={{ marginRight: 'auto', height: 22, background: 'rgb(255 255 255 / .18)', color: '#FFFFFF', fontWeight: 600 }}>اعتبار {money(card.creditLimit)}</span>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span dir="ltr" className="num" style={{ fontSize: 22, letterSpacing: '.12em', textAlign: 'left', lineHeight: 1 }}>•••• {last4(card)}</span>
            <Icon d={CI.contactless} size={22} style={{ marginRight: 'auto', opacity: 0.9 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}><span style={{ fontSize: 10, opacity: 0.75 }}>دارنده کارت</span><span style={{ fontSize: 14, fontWeight: 600 }}>{card.holderName}</span></span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2 }}><span style={{ fontSize: 10, opacity: 0.75 }}>انقضا</span><span className="num" dir="ltr" style={{ fontSize: 14, fontWeight: 400 }}>{faDigits(card.expiry)}</span></span>
            <span style={{ marginRight: 'auto', display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.2, alignItems: 'flex-start' }}><span style={{ fontSize: 10, opacity: 0.75 }}>نوع کارت</span><span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>اعتباری</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Icon for a card transaction, guessed from its title. */
export function cardTxIcon(title: string) {
  if (/رستوران|کافه|غذا/.test(title)) return CI.food;
  if (/تاکسی|اسنپ|سفر|بلیت/.test(title)) return CI.car;
  if (/سوپرمارکت|هایپر|میوه/.test(title)) return CI.cart;
  if (/شارژ/.test(title)) return CI.bolt;
  if (/تسویه/.test(title)) return CI.refresh;
  if (/مسدود/.test(title)) return CI.ban;
  if (/فیزیکی/.test(title)) return CI.card;
  return CI.bag;
}

/** «خرید با کارت — فروشگاه آنلاین» → «فروشگاه آنلاین» */
export const cardTxTitle = (title: string) => title.replace(/^خرید با کارت\s*[—-]\s*/, '');
