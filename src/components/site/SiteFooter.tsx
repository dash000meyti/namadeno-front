import Link from 'next/link';
import { routes } from '@/lib/routes';
import { Logotype } from '@/components/ui/Brand';
import { SiteLogo } from './Logo';

const COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'نمادنو',
    links: [
      { label: 'اپ نمادنو', href: '/#product' },
      { label: 'دارایی‌ها', href: '/#namadno' },
      { label: 'اعتبار نمادنو', href: '/#credit' },
      { label: 'افتتاح حساب', href: routes.app.signup },
      { label: 'ورود', href: routes.app.login },
    ],
  },
  {
    title: 'سازمان‌ها',
    links: [
      { label: 'نمادنو برای سازمان‌ها', href: routes.site.business },
      { label: 'رزرو جلسه‌ی معرفی', href: `${routes.site.business}#demo` },
      { label: 'ورود سازمان‌ها', href: routes.org.login },
    ],
  },
  {
    title: 'شرکت',
    links: [
      { label: 'درباره ما', href: routes.site.about },
      { label: 'وبلاگ', href: routes.site.blog },
      { label: 'تماس با ما', href: routes.site.contact },
    ],
  },
  {
    title: 'اعتماد',
    links: [
      { label: 'امنیت', href: routes.site.security },
      { label: 'سوالات متداول', href: routes.site.faq },
      { label: 'شرایط استفاده', href: routes.site.terms },
      { label: 'حریم خصوصی', href: routes.site.privacy },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="s-ftr">
      <div className="s-wrap">
        <div className="s-ftr-grid">
          <div className="s-ftr-brand">
            <SiteLogo height={30} />
            <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-secondary)' }}>
              ارزشی که می‌ماند.
              <br />نمادنو، خانه‌ی دارایی‌های ماندگار.
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
        </div>
      </div>
      <div className="s-ftr-mark" aria-hidden="true"><Logotype height={220} /></div>
    </footer>
  );
}
