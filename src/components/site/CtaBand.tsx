import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';

/** Final call-to-action band on the brand gradient (white text by design). */
export function CtaBand({
  title = 'پاداش بعدی را به دارایی تبدیل کنید',
  text = 'کارکنان با یک شماره موبایل وارد اپ می‌شوند؛ سازمان‌ها با یک جلسه دمو شروع می‌کنند.',
}: { title?: string; text?: string }) {
  return (
    <section className="s-sec tight" aria-labelledby="cta-title">
      <div className="s-wrap">
        <div className="s-cta">
          <div className="s-col" style={{ gap: 10, maxWidth: 640 }}>
            <h2 id="cta-title" className="s-h2" style={{ color: '#FFFFFF' }}>{title}</h2>
            <p style={{ fontSize: 16, lineHeight: 2, color: 'rgb(255 255 255 / .86)' }}>{text}</p>
          </div>
          <div className="s-actions">
            <Link href={routes.app.login} className="btn lg on-dark"><Icon name="user" />ورود به اپ</Link>
            <Link href={`${routes.site.business}#demo`} className="btn lg ghost"><Icon name="building" />درخواست دمو</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
