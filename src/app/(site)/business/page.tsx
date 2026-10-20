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
  title: 'برای سازمان‌ها',
  description: 'پاداش، رفاهی و پرداخت قراردادهای پروژه‌ای را به‌صورت واحد صندوق‌های بورسی بپردازید؛ با قفل زمانی یا مرحله‌ای و گزارش لحظه‌ای. درخواست دمو.',
};

const BENEFITS: { icon: IconName; c: string; title: string; text: string }[] = [
  { icon: 'shield', c: 'c-warning', title: 'حفظ ارزش مزایا', text: 'پاداش در صندوق طلا یا درآمد ثابت می‌نشیند؛ قدرت خرید کارکنان در برابر تورم حفظ می‌شود.' },
  { icon: 'clock', c: 'c-primary', title: 'ماندگاری با قفل زمانی', text: 'بسته‌ها را با تاریخ آزادسازی بفرستید؛ ارزش بسته در این مدت برای کارمند رشد می‌کند.' },
  { icon: 'flag', c: 'c-info', title: 'پرداخت مرحله‌ای قراردادها', text: 'مبلغ قرارداد پروژه‌ای از ابتدا تخصیص می‌یابد و با تأیید هر مرحله آزاد می‌شود.' },
  { icon: 'credit', c: 'c-success', title: 'رفاه اعتباری بدون ضمانت', text: 'کارکنان با پشتوانه دارایی خودشان وام و اعتبار می‌گیرند؛ بدون ضمانت سازمان و کسر از حقوق.' },
  { icon: 'users', c: 'c-secondary', title: 'ارسال گروهی در چند دقیقه', text: 'انتخاب گیرندگان، تعیین مبلغ و صندوق، بررسی و ارسال؛ برای یک نفر یا هزار نفر.' },
  { icon: 'chart', c: 'c-default', title: 'گزارش شفاف و قابل حسابرسی', text: 'پذیرش بسته‌ها، مصرف بودجه، قفل‌ها و درخواست‌ها؛ لحظه‌ای و قابل خروجی گرفتن.' },
];

const PROCESS: { title: string; text: string }[] = [
  { title: 'قرارداد و تنظیمات', text: 'صندوق‌های مجاز، امکان برداشت نقدی، سیاست قفل و خدمات اعتباری کارکنان در قرارداد تعیین می‌شود.' },
  { title: 'افزودن کارکنان', text: 'کارکنان را تکی یا گروهی اضافه کنید؛ دعوت‌نامه ورود به اپ برایشان پیامک می‌شود.' },
  { title: 'ارسال بسته', text: 'مبلغ، صندوق یا تخصیص آزاد و نوع قفل را انتخاب کنید؛ پیش از ارسال، خلاصه را بررسی می‌کنید.' },
  { title: 'پیگیری و گزارش', text: 'وضعیت تأیید هر کارمند، مراحل قراردادها و مصرف بودجه را در داشبورد ببینید.' },
];

const POLICIES: { type: LockType | 'none'; title: string; text: string }[] = [
  { type: 'none', title: 'بدون قفل', text: 'بسته بلافاصله پس از تأیید کارمند آزاد است؛ مناسب پاداش‌های مناسبتی و رفاهی.' },
  { type: 'vesting', title: 'قفل زمانی', text: 'تا تاریخ تعیین‌شده قابل فروش نیست و سپس خودکار آزاد می‌شود؛ مناسب پاداش ماندگاری.' },
  { type: 'milestone', title: 'آزادسازی مرحله‌ای', text: 'مبلغ به مراحل تقسیم و هر مرحله با تأیید شما آزاد می‌شود؛ مناسب قراردادهای پروژه‌ای.' },
];

const DEMO_POINTS = [
  'نمایش زنده پنل سازمانی و اپ کارکنان',
  'بررسی سیاست مزایا و پیشنهاد صندوق‌ها و قفل‌های مناسب',
  'برآورد زمان راه‌اندازی و تعرفه متناسب با تعداد کارکنان',
  'پاسخ به سوالات مالی، حقوقی و فنی تیم شما',
];

export default function BusinessPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'برای سازمان‌ها' }]}
        eyebrow="پنل سازمانی نمادنو"
        title="مزایای کارکنان، به شکل دارایی ماندگار"
        lead="به‌جای پرداخت ریالی، پاداش و رفاهی کارکنان را به‌صورت واحد صندوق‌های بورسی بپردازید؛ با سیاست قفل دلخواه، اعتبار بدون ضمانت سازمان و شفافیت کامل برای منابع انسانی."
      >
        <div className="s-actions" style={{ marginTop: 6 }}>
          <a href="#demo" className="btn lg contained c-primary">درخواست دمو</a>
          <Link href={routes.org.login} className="btn lg outlined c-primary"><Icon name="building" />ورود به پنل سازمان</Link>
        </div>
      </PageHero>

      <Section eyebrow="چرا نمادنو" title="برای منابع انسانی، مالی و کارکنان">
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

      <Section eyebrow="شروع همکاری" title="از قرارداد تا اولین بسته">
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
            <span className="s-eyebrow"><span className="dot" />سیاست‌های قفل</span>
            <h2 className="s-h2">هر بسته، با سیاست مناسب خودش</h2>
            <p className="s-lead">سیاست قفل را هنگام ارسال بسته انتخاب می‌کنید و کارمند پیش از تأیید، شرط آزادسازی را می‌بیند. در همه حالت‌ها سود و تغییر ارزش برای کارمند است.</p>
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

      <Section id="demo" eyebrow="درخواست دمو" title="یک جلسه کوتاه، برای شروع" lead="فرم را پر کنید تا کارشناسان فروش سازمانی برای هماهنگی جلسه با شما تماس بگیرند.">
        <div className="s-split wide" style={{ alignItems: 'start', gap: 20 }}>
          <div className="card s-card">
            <ContactForm variant="demo" />
          </div>
          <div className="s-col" style={{ gap: 16 }}>
            <div className="card s-card c-primary">
              <h3 className="s-h3" style={{ fontSize: 16 }}>در جلسه دمو</h3>
              <ul className="s-check">
                {DEMO_POINTS.map((d) => <li key={d}><Icon name="check" />{d}</li>)}
              </ul>
            </div>
            <div className="card s-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <span className="s-itile c-secondary"><Icon name="phone" /></span>
              <span className="s-col" style={{ gap: 2 }}>
                <span className="cap" style={{ fontSize: 13 }}>فروش سازمانی</span>
                <span style={{ fontWeight: 600 }} dir="ltr">business@namadno.ir</span>
              </span>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
