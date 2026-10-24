import type { Metadata } from 'next';
import Link from 'next/link';
import type { LockType } from '@/types/domain';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { ContactForm } from '@/components/site/ContactForm';
import { OrgPanelMock, ORG_FEATURES } from '@/components/site/home/OrgsSection';
import { PageHero, Section } from '@/components/site/Section';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'نمادنو برای سازمان‌ها',
  description: 'پاداش، عیدی و مزایای همکاران را به‌صورت دارایی ماندگار بپردازید؛ رضایت بیشتر، ماندگاری نیروهای کلیدی و کنترل کامل بودجه. رزرو جلسه‌ی معرفی.',
};

const OUTCOMES = [
  { big: '۸۹٪', t: 'پذیرش پاداش‌ها', d: 'همکاران سازمان‌های همراه، پاداش‌های دارایی را تأیید و نگه می‌دارند؛ نه اینکه فوراً خرجش کنند.' },
  { big: '۷ روز', t: 'تا اولین پرداخت', d: 'از امضای قرارداد تا ارسال اولین پاداش، کمتر از یک هفته؛ بدون یکپارچه‌سازی پیچیده.' },
  { big: 'صفر', t: 'ضمانت سازمان', d: 'همکاران با پشتوانه‌ی دارایی خودشان اعتبار می‌گیرند؛ بدون ضمانت سازمان و بدون کسر از حقوق.' },
];

const BENEFITS: { icon: IconName; c: string; title: string; text: string }[] = [
  { icon: 'shield', c: 'c-warning', title: 'قدرت خرید همکاران، محفوظ', text: 'پاداش در طلا یا درآمد ثابت می‌نشیند و در برابر تورم ارزشش را نگه می‌دارد.' },
  { icon: 'clock', c: 'c-primary', title: 'ماندگاری با پس‌انداز سازمانی', text: 'پاداش را به‌شکل پس‌انداز بفرستید تا در تاریخی که تعیین می‌کنید به دست همکار برسد؛ ارزشش تا آن روز برای او رشد می‌کند و انگیزه‌ی ماندن می‌سازد.' },
  { icon: 'flag', c: 'c-info', title: 'پرداخت مرحله‌ای قراردادها', text: 'مبلغ قرارداد پروژه‌ای از روز اول به نام همکار ثبت می‌شود و سهم هر مرحله با تأیید شما به دستش می‌رسد.' },
  { icon: 'credit', c: 'c-success', title: 'رفاه اعتباری، بی‌دردسر', text: 'همکاران با پشتوانه‌ی دارایی خودشان وام و اعتبار می‌گیرند؛ بدون ضمانت سازمان و بدون کسر از حقوق.' },
  { icon: 'users', c: 'c-secondary', title: 'پرداخت گروهی در چند دقیقه', text: 'برای یک نفر یا هزار نفر؛ گیرندگان، مبلغ، دارایی و شیوه‌ی دریافت در یک مسیر کوتاه.' },
  { icon: 'chart', c: 'c-default', title: 'گزارش شفاف و قابل حسابرسی', text: 'پذیرش هر پاداش، مصرف بودجه و پس‌انداز سازمانی همکاران؛ لحظه‌ای و قابل خروجی.' },
];

const PROCESS: { title: string; text: string }[] = [
  { title: 'جلسه‌ی معرفی و قرارداد', text: 'سیاست مزایای شما را با هم مرور می‌کنیم؛ دارایی‌های مجاز، امکان برداشت نقدی و شیوه‌های دریافت در قرارداد تعیین می‌شود.' },
  { title: 'افزودن همکاران', text: 'همکاران را تکی یا با یک فایل اکسل اضافه کنید؛ دعوت‌نامه‌ی افتتاح حساب نمادنو برایشان پیامک می‌شود.' },
  { title: 'ارسال پاداش', text: 'مبلغ، دارایی یا تخصیص آزاد و شیوه‌ی دریافت را انتخاب کنید و پیش از ارسال، خلاصه را ببینید.' },
  { title: 'پیگیری و گزارش', text: 'پذیرش هر همکار، مراحل قراردادها و مصرف بودجه را در داشبورد سازمانی ببینید.' },
];

const POLICIES: { type: LockType | 'none'; title: string; text: string }[] = [
  { type: 'none', title: 'همه آزاد', text: 'پاداش از همان لحظه‌ی تأیید همکار، کامل در اختیار اوست؛ مناسب پاداش‌های مناسبتی و رفاهی.' },
  { type: 'vesting', title: 'پس‌انداز سازمانی', text: 'پاداش برای همکار پس‌انداز می‌شود و در تاریخی که تعیین می‌کنید، خودکار آزاد می‌شود؛ تا آن روز هم به نام اوست و رشد می‌کند. مناسب پاداش ماندگاری.' },
  { type: 'milestone', title: 'دریافت مرحله‌ای', text: 'مبلغ به چند مرحله تقسیم می‌شود و سهم هر مرحله با تأیید شما به دست همکار می‌رسد؛ مناسب قراردادهای پروژه‌ای.' },
];

const DEMO_POINTS = [
  'نمایش زنده‌ی پنل سازمانی و اپ نمادنو',
  'بررسی سیاست پاداش شما و پیشنهاد دارایی‌ها و شیوه‌های دریافت مناسب',
  'برآورد زمان راه‌اندازی و تعرفه، متناسب با اندازه‌ی سازمان',
  'پاسخ به پرسش‌های مالی، حقوقی و فنی تیم شما',
];

export default function BusinessPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'نمادنو برای سازمان‌ها' }]}
        eyebrow="نمادنو برای سازمان‌ها"
        title="پاداشی که دیده می‌شود."
        mute="نیرویی که می‌ماند."
        lead="پاداش ریالی در چند هفته فراموش می‌شود. با نمادنو، هر پاداش به دارایی‌ای تبدیل می‌شود که هر روز رشد می‌کند، پشتوانه‌ی اعتبار همکاران است و ماه‌ها بعد هم یادآور قدردانی شماست."
      >
        <div className="s-actions" style={{ marginTop: 6 }}>
          <a href="#demo" className="btn lg contained c-primary">رزرو جلسه‌ی معرفی</a>
          <Link href={routes.org.login} className="btn lg line"><Icon name="building" />ورود سازمان‌ها</Link>
        </div>
      </PageHero>

      <Section tight>
        <div className="s-pillars">
          {OUTCOMES.map((o) => (
            <div key={o.t} className="s-pillar">
              <span className="big s-grad">{o.big}</span>
              <span className="t">{o.t}</span>
              <p className="d">{o.d}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="چرا نمادنو" title="برای منابع انسانی، برای مالی،" mute="و برای همکاران‌تان.">
        <div className="s-g s-g3">
          {BENEFITS.map((b) => (
            <div key={b.title} className={'card s-card ' + b.c}>
              <span className="s-itile"><Icon name={b.icon} /></span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{b.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{b.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="شروع همکاری" title="از جلسه‌ی معرفی" mute="تا اولین پاداش.">
        <ol className="s-g s-g4" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {PROCESS.map((p, i) => (
            <li key={p.title} className="card s-card">
              <span className="s-step-n">{faDigits(i + 1)}</span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{p.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{p.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="s-split">
          <div className="s-col" style={{ gap: 16 }}>
            <span className="s-eyebrow"><span className="dot" />شیوه‌های دریافت</span>
            <h2 className="s-h2">هر پاداش،<br /><span className="s-mute2">به شیوه‌ی مناسب خودش.</span></h2>
            <p className="s-lead">شیوه‌ی دریافت را هنگام ارسال انتخاب می‌کنید و همکار پیش از تأیید، زمان یا شرط آزاد شدن را می‌بیند. در همه‌ی حالت‌ها، دارایی از روز اول به نام همکار است و سود و رشد ارزشش برای اوست.</p>
            <div className="s-col" style={{ gap: 10 }}>
              {POLICIES.map((p) => (
                <div key={p.type} className="card" style={{ padding: 14, borderRadius: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <LockTypeChip type={p.type} style={{ marginTop: 3 }} />
                  <span className="s-col" style={{ gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{p.title}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.85, color: 'var(--text-secondary)' }}>{p.text}</span>
                  </span>
                </div>
              ))}
            </div>
            <ul className="s-check" style={{ marginTop: 6 }}>
              {ORG_FEATURES.slice(2).map((f) => <li key={f}><Icon name="check" />{f}</li>)}
            </ul>
          </div>
          <OrgPanelMock />
        </div>
      </Section>

      <Section id="demo" eyebrow="جلسه‌ی معرفی" title="یک گفت‌وگوی کوتاه،" mute="برای شروعی درست." lead="فرم را تکمیل کنید؛ مشاوران سازمانی نمادنو برای هماهنگی جلسه با شما تماس می‌گیرند.">
        <div className="s-split wide" style={{ alignItems: 'start', gap: 20 }}>
          <div className="card s-card">
            <ContactForm variant="demo" />
          </div>
          <div className="s-col" style={{ gap: 16 }}>
            <div className="card s-card c-primary">
              <h3 className="s-h3" style={{ fontSize: 16 }}>در جلسه‌ی معرفی</h3>
              <ul className="s-check">
                {DEMO_POINTS.map((d) => <li key={d}><Icon name="check" />{d}</li>)}
              </ul>
            </div>
            <div className="card s-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <span className="s-itile c-secondary"><Icon name="phone" /></span>
              <span className="s-col" style={{ gap: 2 }}>
                <span className="cap" style={{ fontSize: 13 }}>مشاوران سازمانی</span>
                <span style={{ fontWeight: 600 }} dir="ltr">business@namadno.ir</span>
              </span>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
