import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ContactFormFromQuery } from '@/components/site/ContactForm';
import { PageHero, SkeletonCard } from '@/components/site/Section';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'تماس با ما',
  description: 'راه‌های ارتباط با نمادنو: پشتیبانی کاربران، همکاری سازمانی و رسانه.',
};

const CHANNELS: { icon: IconName; title: string; value: string; note: string; ltr?: boolean }[] = [
  { icon: 'phone', title: 'تلفن پشتیبانی', value: '۰۲۱-۹۱۰۰۰۰۰۰', note: 'شنبه تا چهارشنبه، ۹ تا ۱۷', ltr: true },
  { icon: 'send', title: 'ایمیل', value: 'hello@namadno.ir', note: 'پاسخ تا یک روز کاری', ltr: true },
  { icon: 'building', title: 'دفتر مرکزی', value: 'تهران، خیابان ولیعصر', note: 'مراجعه حضوری با هماهنگی قبلی' },
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'تماس با ما' }]}
        title="در خدمت شما هستیم."
        lead="پرسش، پیشنهاد یا درخواست همکاری دارید؟ فرم زیر را تکمیل کنید؛ پیام شما مستقیم به تیم مربوط می‌رسد و تا یک روز کاری پاسخ می‌گیرید."
      />
      <section className="s-sec" style={{ paddingTop: 24 }} aria-label="فرم تماس و راه‌های ارتباطی">
        <div className="s-wrap">
            <div className="s-split wide" style={{ alignItems: 'start', gap: 20 }}>
              <div className="card s-card">
                <h2 className="s-h3" style={{ marginBottom: 8 }}>فرم تماس</h2>
                <Suspense fallback={<SkeletonCard h={420} />}>
                  <ContactFormFromQuery />
                </Suspense>
              </div>
              <div className="s-col" style={{ gap: 16 }}>
                {CHANNELS.map((c) => (
                  <div key={c.title} className="card s-card c-primary" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <span className="s-itile"><Icon name={c.icon} /></span>
                    <span className="s-col" style={{ gap: 2 }}>
                      <span className="cap" style={{ fontSize: 13 }}>{c.title}</span>
                      <span style={{ fontSize: 16, fontWeight: 600 }} dir={c.ltr ? 'ltr' : undefined}>{c.value}</span>
                      <span className="cap">{c.note}</span>
                    </span>
                  </div>
                ))}
                <span className="cap">اطلاعات تماس بالا نمونه است و پیش از انتشار باید با اطلاعات رسمی جایگزین شود.</span>
                <div className="card s-card">
                  <h2 className="s-h3" style={{ fontSize: 16 }}>میان‌بُرها</h2>
                  <div className="s-col" style={{ gap: 4 }}>
                    <Link href={routes.app.support} className="s-link">پشتیبانی داخل اپ (برای کاربران)<Icon name="forward" /></Link>
                    <Link href={`${routes.site.business}#demo`} className="s-link">رزرو جلسه‌ی معرفی برای سازمان‌ها<Icon name="forward" /></Link>
                    <Link href={routes.site.faq} className="s-link">سوالات متداول<Icon name="forward" /></Link>
                  </div>
                </div>
              </div>
            </div>
        </div>
      </section>
    </>
  );
}
