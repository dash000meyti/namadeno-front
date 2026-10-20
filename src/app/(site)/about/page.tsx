import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PageHero, Section } from '@/components/site/Section';
import { CtaBand } from '@/components/site/CtaBand';
import { SiteStats } from '@/components/site/SiteStats';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'درباره ما',
  description: 'نمادنو، سوپراپ مالی گروه صندوق‌های بورسی؛ مأموریت ما تبدیل مزایای کارکنان به دارایی ماندگار و دسترسی ساده به اعتبار است.',
};

const PRINCIPLES: { icon: IconName; c: string; title: string; text: string }[] = [
  { icon: 'eye', c: 'c-primary', title: 'شفافیت', text: 'هر عدد قابل توضیح است: چه مقدار آزاد است، چه مقدار قفل است، چرا و تا کی.' },
  { icon: 'shield', c: 'c-warning', title: 'حفظ ارزش', text: 'پول کارکنان باید در برابر تورم ایمن بماند؛ برای همین مزایا را به دارایی تبدیل می‌کنیم.' },
  { icon: 'sparkle', c: 'c-success', title: 'سادگی', text: 'خرید صندوق، وام یا اعتبار باید به سادگی یک پرداخت موبایلی باشد؛ بدون کاغذ و صف.' },
  { icon: 'users', c: 'c-secondary', title: 'دو طرف برنده', text: 'سازمان ماندگاری و رضایت می‌گیرد، کارمند دارایی و اعتبار؛ محصول را برای هر دو می‌سازیم.' },
];

const SURFACES: { icon: IconName; title: string; text: string; href: string; cta: string }[] = [
  { icon: 'phone', title: 'اپ کارکنان', text: 'دریافت و تخصیص بسته‌ها، خرید و فروش صندوق، کارت، وام و خرید اقساطی.', href: routes.app.login, cta: 'ورود به اپ' },
  { icon: 'building', title: 'پنل سازمانی', text: 'مدیریت کارکنان، ارسال بسته‌ها، سیاست‌های قفل، درخواست‌ها و گزارش‌ها.', href: routes.org.login, cta: 'ورود به پنل' },
  { icon: 'settings', title: 'کنسول بهره‌بردار', text: 'مدیریت صندوق‌ها، قراردادها، محصولات اعتباری، قوانین و پایش ریسک.', href: routes.op.login, cta: 'ورود به کنسول' },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'درباره ما' }]}
        eyebrow="درباره نمادنو"
        title="مزایایی که ارزششان می‌ماند"
        lead="نمادنو سوپراپ مالی یک گروه صندوق‌های بورسی است. باور داریم پاداش و مزایای کارکنان نباید در تورم آب شود؛ باید به دارایی تبدیل شود، رشد کند و در روز نیاز پشتوانه اعتبار باشد."
      />

      <Section tight>
        <SiteStats />
      </Section>

      <Section eyebrow="داستان ما" title="چرا نمادنو را ساختیم">
        <div className="s-prose" style={{ maxWidth: 820 }}>
          <p>سازمان‌ها هر سال بخش بزرگی از بودجه منابع انسانی را صرف پاداش و رفاهی می‌کنند، اما پرداخت ریالی در عمل خیلی زود ارزش خود را از دست می‌دهد و اثر آن در ذهن کارکنان کم‌رنگ می‌شود.</p>
          <p>از سوی دیگر، گرفتن یک وام ساده برای بسیاری از کارکنان هنوز به معنای ضامن، چک و رفت‌وآمد است؛ در حالی که همین افراد دارایی دارند، فقط امکان استفاده از آن را ندارند.</p>
          <p>نمادنو این دو مسئله را به هم وصل می‌کند: مزایا به‌صورت واحد صندوق‌های بورسی پرداخت می‌شود، کارمند آن را در اپ تأیید و مدیریت می‌کند و بخش آزاد دارایی‌اش پشتوانه اعتبار، وام و خرید اقساطی می‌شود. همه‌چیز با قاعده‌ای ساده و شفاف: «قابل برداشت» همیشه فقط از بخش آزاد.</p>
        </div>
      </Section>

      <Section eyebrow="اصول ما" title="چیزهایی که برایمان مهم است">
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

      <Section eyebrow="یک محصول، سه سطح" title="هر کس، ابزار خودش را دارد">
        <div className="s-g s-g3">
          {SURFACES.map((s) => (
            <div key={s.title} className="card s-card c-primary">
              <span className="s-itile"><Icon name={s.icon} /></span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)', flex: 1 }}>{s.text}</p>
              <Link href={s.href} className="s-link">{s.cta}<Icon name="forward" /></Link>
            </div>
          ))}
        </div>
        <div className="s-actions" style={{ marginTop: 24 }}>
          <Link href={routes.site.careers} className="btn soft c-primary"><Icon name="users" />به تیم ما بپیوندید</Link>
          <Link href={routes.site.map} className="btn c-primary">نقشه کامل محصول<Icon name="forward" /></Link>
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
