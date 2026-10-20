import Link from 'next/link';
import { routes } from '@/lib/routes';
import { SiteLogo } from './Logo';

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'محصول',
    links: [
      { label: 'اپلیکیشن کارکنان', href: routes.app.login },
      { label: 'پنل سازمانی', href: routes.org.login },
      { label: 'کنسول بهره‌بردار', href: routes.op.login },
      { label: 'صندوق‌ها', href: '/#funds' },
      { label: 'اعتبار و وام', href: '/#credit' },
    ],
  },
  {
    title: 'نمادنو',
    links: [
      { label: 'درباره ما', href: routes.site.about },
      { label: 'برای سازمان‌ها', href: routes.site.business },
      { label: 'فرصت‌های شغلی', href: routes.site.careers },
      { label: 'وبلاگ', href: routes.site.blog },
      { label: 'تماس با ما', href: routes.site.contact },
    ],
  },
  {
    title: 'اعتماد و قوانین',
    links: [
      { label: 'امنیت', href: routes.site.security },
      { label: 'شرایط استفاده', href: routes.site.terms },
      { label: 'حریم خصوصی', href: routes.site.privacy },
      { label: 'سوالات متداول', href: routes.site.faq },
      { label: 'نقشه محصول', href: routes.site.map },
      { label: 'سیستم طراحی', href: routes.site.designSystem },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="s-ftr">
      <div className="s-wrap">
        <div className="s-ftr-grid">
          <div className="s-ftr-brand">
            <SiteLogo size={36} />
            <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-secondary)' }}>
              سوپراپ مالی گروه صندوق‌های بورسی. پاداش و مزایای کارکنان به‌شکل واحد صندوق؛ با شفافیت کامل برای منابع انسانی و اعتبار بدون کاغذبازی برای کارکنان.
            </p>
          </div>
          {COLS.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h4>{c.title}</h4>
              <ul>
                {c.links.map((l) => (
                  <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="s-ftr-bottom">
          <span>© ۱۴۰۵ نمادنو. همه حقوق محفوظ است.</span>
          <span>سرمایه‌گذاری در صندوق‌ها با ریسک همراه است؛ بازدهی گذشته تضمینی برای آینده نیست.</span>
        </div>
      </div>
    </footer>
  );
}
