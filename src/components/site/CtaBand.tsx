import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Motif } from '@/components/ui/Motif';
import { routes } from '@/lib/routes';

/** Final call to action: centered two-tone heading over the brand grid. */
export function CtaBand({
  title = 'آینده‌ی مالی‌تان را',
  grad = 'از امروز بسازید.',
  text = 'افتتاح حساب نمادنو چند دقیقه طول می‌کشد و کاملاً آنلاین است. سازمان‌ها با یک جلسه‌ی معرفی شروع می‌کنند.',
}: { title?: string; grad?: string; text?: string }) {
  return (
    <section className="s-sec tight" aria-labelledby="cta-title">
      <div className="s-wrap">
        <div className="s-cta">
          <Motif variant="grid" />
          <span className="s-eyebrow"><span className="dot" />شروع با نمادنو</span>
          <h2 id="cta-title" className="s-h2" style={{ maxWidth: 820 }}>{title}<br /><span className="s-grad">{grad}</span></h2>
          <p className="s-lead" style={{ maxWidth: 560 }}>{text}</p>
          <div className="s-actions">
            <Link href={routes.app.signup} className="btn lg contained c-primary">افتتاح حساب نمادنو</Link>
            <Link href={`${routes.site.business}#demo`} className="btn lg line"><Icon name="building" />رزرو جلسه‌ی معرفی برای سازمان</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
