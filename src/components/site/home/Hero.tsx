'use client';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useSiteStats } from '@/api/site-extra';
import { compactMoney, faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { PhoneMock } from './PhoneMock';

export function Hero() {
  const stats = useSiteStats();
  const s = stats.data;
  const items = [
    { k: 'org', v: s ? faDigits(s.organizations) : null, label: 'سازمان فعال' },
    { k: 'emp', v: s ? money(s.employees) : null, label: 'کارمند دارای دارایی' },
    { k: 'aum', v: s ? compactMoney(s.aum) : null, label: 'تومان دارایی تحت مدیریت' },
  ];
  return (
    <section className="s-hero" aria-labelledby="hero-title">
      <div className="s-wrap s-hero-grid">
        <div className="s-hero-copy">
          <span className="s-eyebrow"><span className="dot" />سوپراپ مالی گروه صندوق‌های بورسی</span>
          <h1 id="hero-title" className="s-h1">
            پاداشی که <span className="s-grad">ارزشش می‌ماند</span>
          </h1>
          <p className="s-lead" style={{ maxWidth: 580 }}>
            سازمان‌ها پاداش و مزایای کارکنان را به‌جای ریال، به‌صورت واحد صندوق‌های طلا، درآمد ثابت و… می‌پردازند.
            کارکنان در اپ نمادنو تأیید و تخصیص می‌دهند، بین ریال و صندوق‌ها جابه‌جا می‌کنند و با پشتوانه دارایی آزادشان اعتبار می‌گیرند.
          </p>
          <div className="s-actions">
            <Link href={routes.app.login} className="btn lg contained c-primary"><Icon name="user" />ورود به اپ</Link>
            <Link href={`${routes.site.business}#demo`} className="btn lg outlined c-primary"><Icon name="building" />درخواست دمو برای سازمان</Link>
          </div>
          <div className="s-hero-stats" aria-live="polite" aria-busy={stats.isLoading}>
            {items.map((it) => (
              <div key={it.k} className="s-stat">
                {it.v !== null ? <b>{it.v}</b> : <span className="s-skl" style={{ display: 'block', height: 26, width: '70%', margin: '4px 0' }} />}
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}
