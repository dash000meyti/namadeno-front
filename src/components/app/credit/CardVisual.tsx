/** The black Namadno card face (design: app-card, re-skinned to the new logo) + the small logo chip used in card sub-screens. */
import { faDigits, money } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import { LogoFull, LogoMark } from '@/components/ui/Brand';
import type { Card } from '@/types/domain';
import { CI } from './icons';

export const last4 = (c: Card) => faDigits(c.maskedPan.replace(/\D/g, '').slice(-4));

export function LogoChip({ w = 40, h = 28, r = 6, lh = 14 }: { w?: number; h?: number; r?: number; lw?: number; lh?: number }) {
  return (
    <span style={{ width: w, height: h, borderRadius: r, background: 'var(--brand-card)', boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / .08)', color: '#FFFFFF', display: 'grid', placeItems: 'center', flex: 'none' }}>
      <LogoMark size={lh} />
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
      <div role="img" aria-label={`کارت نمادنو ${last4(card)} · ${blocked ? 'مسدود' : 'فعال'}`} style={{ width: '100%', maxWidth: 342, height: 200, boxSizing: 'border-box', borderRadius: 20, background: 'var(--brand-card)', color: '#FFFFFF', boxShadow: '0 24px 48px -20px rgb(7 11 20 / .6), inset 0 0 0 1px rgb(255 255 255 / .08)', padding: '20px 22px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', filter: blocked ? 'grayscale(.55)' : undefined }}>
        <LogoMark size={230} style={{ position: 'absolute', left: -46, bottom: -70, color: 'rgb(255 255 255 / .05)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <LogoFull height={20} />
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
