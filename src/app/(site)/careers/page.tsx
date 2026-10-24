import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHero, Section } from '@/components/site/Section';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'فرصت‌های شغلی',
  description: 'به تیم نمادنو بپیوندید؛ فرصت‌های شغلی در محصول، فنی، اعتبار و فروش سازمانی.',
};

const VALUES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'users', title: 'تیم کوچک، اثر بزرگ', text: 'تصمیم‌ها نزدیک به کاربر گرفته می‌شود و کار هر نفر مستقیم در محصول دیده می‌شود.' },
  { icon: 'chart', title: 'تصمیم بر پایه داده', text: 'فرضیه می‌سازیم، می‌سنجیم و یاد می‌گیریم؛ بدون تعارف و با احترام.' },
  { icon: 'sparkle', title: 'یادگیری دائمی', text: 'بودجه آموزش، جلسات اشتراک دانش و فرصت کار روی مسائل واقعی مالی.' },
  { icon: 'gift', title: 'مزایا به سبک نمادنو', text: 'بخشی از پاداش‌ها به‌صورت دارایی ماندگار؛ محصولی را که می‌سازیم، خودمان هر روز استفاده می‌کنیم.' },
];

const JOBS: { title: string; team: string; type: string; place: string }[] = [
  { title: 'توسعه‌دهنده ارشد فرانت‌اند (React / Next.js)', team: 'فنی', type: 'تمام‌وقت', place: 'تهران · هیبرید' },
  { title: 'توسعه‌دهنده بک‌اند', team: 'فنی', type: 'تمام‌وقت', place: 'تهران · هیبرید' },
  { title: 'طراح محصول (UI/UX)', team: 'محصول', type: 'تمام‌وقت', place: 'تهران · هیبرید' },
  { title: 'تحلیلگر ریسک اعتباری', team: 'اعتبار', type: 'تمام‌وقت', place: 'تهران' },
  { title: 'کارشناس فروش سازمانی', team: 'فروش', type: 'تمام‌وقت', place: 'تهران' },
];

export default function CareersPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'فرصت‌های شغلی' }]}
        eyebrow="به ما بپیوندید"
        title="محصولی بسازیم"
        mute="که ارزش پول مردم را نگه می‌دارد."
        lead="در نمادنو روی مسئله‌ای واقعی کار می‌کنیم: اینکه پس‌انداز و پاداش هیچ‌کس در تورم آب نشود و اعتبار برای همه ساده و منصفانه باشد."
      />

      <Section tight>
        <div className="s-g s-g4">
          {VALUES.map((v) => (
            <div key={v.title} className="card s-card c-primary">
              <span className="s-itile"><Icon name={v.icon} /></span>
              <h2 className="s-h3" style={{ fontSize: 16 }}>{v.title}</h2>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{v.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="jobs" eyebrow="موقعیت‌های باز" title="فرصت‌های فعلی" lead="موقعیت مناسبی نمی‌بینید؟ باز هم رزومه‌تان را بفرستید؛ اگر فرصتی متناسب باز شود، با شما تماس می‌گیریم.">
        <div className="card" style={{ padding: '4px 20px' }}>
          {JOBS.map((j, i) => (
            <div key={j.title} className="s-row" style={{ flexWrap: 'wrap', gap: 12, padding: '16px 0', borderBottom: i < JOBS.length - 1 ? '1px dashed var(--divider)' : 0 }}>
              <span className="s-col" style={{ flex: '1 1 260px', gap: 6 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.6 }}>{j.title}</span>
                <span className="s-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="lbl soft c-primary">{j.team}</span>
                  <span className="lbl soft c-default">{j.type}</span>
                  <span className="lbl soft c-secondary">{j.place}</span>
                </span>
              </span>
              <Link href={`${routes.site.contact}?topic=careers`} className="btn outlined c-primary">ارسال رزومه<Icon name="forward" /></Link>
            </div>
          ))}
        </div>
        <p className="cap" style={{ marginTop: 12 }}>فهرست موقعیت‌ها نمونه است و پیش از انتشار باید با موقعیت‌های واقعی جایگزین شود.</p>
      </Section>
    </>
  );
}
