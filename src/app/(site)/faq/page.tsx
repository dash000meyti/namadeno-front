import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { FaqSearch } from '@/components/site/FaqSearch';
import { PageHero } from '@/components/site/Section';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'سوالات متداول',
  description: 'پاسخ سوال‌های رایج درباره خرید و فروش دارایی، بخش آزاد و رزروشده، وام، برداشت و همکاری سازمانی در نمادنو.',
};

export default function FaqPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'سوالات متداول' }]}
        title="سوالات متداول"
        lead="پاسخ رایج‌ترین پرسش‌ها درباره‌ی افتتاح حساب، خرید و فروش دارایی، بخش آزاد و رزروشده، اعتبار و همکاری سازمانی."
      />
      <section className="s-sec" style={{ paddingTop: 24 }} aria-label="فهرست سوالات">
        <div className="s-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <FaqSearch />
          <div className="card s-card c-primary" style={{ maxWidth: 860, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <span className="s-itile"><Icon name="chat" /></span>
            <span className="s-col" style={{ flex: '1 1 240px', gap: 2 }}>
              <span style={{ fontWeight: 700 }}>پاسخ سوالتان را پیدا نکردید؟</span>
              <span className="cap" style={{ fontSize: 13 }}>کاربران اپ می‌توانند از پشتیبانی داخل اپ تیکت ثبت کنند؛ برای سایر موضوعات پیام بگذارید.</span>
            </span>
            <div className="s-actions">
              <Link href={routes.app.support} className="btn outlined c-primary">پشتیبانی اپ</Link>
              <Link href={routes.site.contact} className="btn contained c-primary">تماس با ما</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
