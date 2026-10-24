import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHero, Section } from '@/components/site/Section';
import { CtaBand } from '@/components/site/CtaBand';
import { SiteStats } from '@/components/site/SiteStats';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'درباره ما',
  description: 'نمادنو، خانه‌ی دارایی‌های ماندگار؛ باور داریم پس‌انداز و پاداش هیچ‌کس نباید در تورم آب شود و اعتبار باید برای همه ساده باشد.',
};

const PRINCIPLES: { icon: IconName; c: string; title: string; text: string }[] = [
  { icon: 'shield', c: 'c-warning', title: 'حفظ ارزش', text: 'هر تصمیم محصول با یک پرسش سنجیده می‌شود: آیا ارزش پول مردم را بهتر حفظ می‌کند؟' },
  { icon: 'eye', c: 'c-primary', title: 'شفافیت', text: 'هر عدد قابل توضیح است: چه مقدار آزاد است، چه مقدار رزرو شده، چرا و تا کی.' },
  { icon: 'bank', c: 'c-secondary', title: 'امانت‌داری', text: 'دارایی همیشه به نام صاحبش است و نزد امین‌های دارای مجوز رسمی نگهداری می‌شود.' },
  { icon: 'sparkle', c: 'c-success', title: 'سادگی', text: 'خرید دارایی، وام یا اعتبار باید به سادگی یک پرداخت موبایلی باشد؛ بدون کاغذ و صف.' },
];

const AUDIENCES: { icon: IconName; title: string; text: string; href: string; cta: string }[] = [
  { icon: 'user', title: 'برای شما', text: 'حساب نمادنو برای هر کسی که می‌خواهد پس‌اندازش ماندگار باشد: دارایی‌های ماندگار، کیف پول ریالی و اعتبار نمادنو.', href: routes.app.signup, cta: 'افتتاح حساب نمادنو' },
  { icon: 'gift', title: 'برای همکاران سازمان‌ها', text: 'اگر سازمان‌تان همراه نمادنو است، پاداش و مزایا به‌صورت دارایی در همان حساب نمادنو به دست‌تان می‌رسد.', href: routes.app.login, cta: 'ورود به نمادنو' },
  { icon: 'building', title: 'برای سازمان‌ها', text: 'پاداش، عیدی و مزایای رفاهی را به‌صورت دارایی ماندگار بپردازید؛ رضایت بیشتر، ماندگاری نیروهای کلیدی.', href: routes.site.business, cta: 'نمادنو برای سازمان‌ها' },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'درباره ما' }]}
        eyebrow="درباره نمادنو"
        title="باور داریم ارزش،"
        mute="باید بماند."
        lead="نمادنو را یک گروه مدیریت دارایی ساخته است تا حفظ ارزش دارایی برای همه ساده باشد: برای هر کسی که می‌خواهد پس‌اندازش در برابر تورم بماند، و برای هر سازمانی که می‌خواهد قدردانی‌اش از همکارانش ماندگار باشد."
      />

      <Section tight>
        <SiteStats />
      </Section>

      <Section eyebrow="داستان ما" title="چرا نمادنو را ساختیم.">
        <div className="s-prose" style={{ maxWidth: 820 }}>
          <p>در اقتصادی که تورم بخشی از زندگی روزمره است، پس‌انداز ریالی آرام‌آرام کوچک می‌شود. ابزارهای حفظ ارزش وجود دارند، اما برای بسیاری از مردم یا پیچیده‌اند، یا دور از دسترس، یا با دغدغه‌ی امانت‌داری همراه.</p>
          <p>از سوی دیگر، گرفتن یک وام ساده هنوز برای خیلی‌ها یعنی ضامن، چک و رفت‌وآمد؛ حتی برای کسانی که دارایی دارند، اما نمی‌توانند بی‌آنکه آن را بفروشند از آن استفاده کنند.</p>
          <p>نمادنو این دو را به هم وصل می‌کند: پول شما به دارایی‌های معتبر و به نام خودتان تبدیل می‌شود، هر روز رشدش را می‌بینید و هر وقت لازم شد، با پشتوانه‌ی بخش آزادش اعتبار می‌گیرید. سازمان‌ها هم پاداش و مزایای همکاران‌شان را مستقیم به همین دارایی تبدیل می‌کنند. همه‌چیز با قاعده‌ای ساده و شفاف: «قابل برداشت» همیشه فقط از بخش آزاد.</p>
        </div>
      </Section>

      <Section eyebrow="اصول ما" title="چهار اصل،" mute="که از آن‌ها کوتاه نمی‌آییم.">
        <div className="s-g s-g4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className={'card s-card ' + p.c}>
              <span className="s-itile"><Icon name={p.icon} /></span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{p.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="برای چه کسانی" title="یک نمادنو،" mute="برای همه.">
        <div className="s-g s-g3">
          {AUDIENCES.map((s) => (
            <div key={s.title} className="card s-card c-primary">
              <span className="s-itile"><Icon name={s.icon} /></span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)', flex: 1 }}>{s.text}</p>
              <Link href={s.href} className="s-link">{s.cta}<Icon name="forward" /></Link>
            </div>
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
