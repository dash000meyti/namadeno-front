import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LockTypeChip } from '@/components/ui/LockBar';
import { PageHero, Section } from '@/components/site/Section';
import { SECURITY_POINTS } from '@/components/site/home/SecuritySection';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'امنیت',
  description: 'احراز هویت سه‌سطحی، رمز پویا، نگهداری دارایی به نام کاربر و پایش ریسک در نمادنو.',
};

const KYC: { level: string; title: string; text: string; unlocks: string[] }[] = [
  { level: '۱', title: 'تطبیق شاهکار', text: 'بررسی می‌شود شماره موبایل به نام صاحب کد ملی باشد. این سطح هنگام ثبت‌نام انجام می‌شود.', unlocks: ['مشاهده دارایی‌ها', 'دریافت بسته‌های سازمان'] },
  { level: '۲', title: 'هویت پایه', text: 'با کد ملی و تاریخ تولد، اطلاعات هویتی از ثبت احوال استعلام می‌شود. برای سرویس‌های اعتباری الزامی است.', unlocks: ['اعتبار کارت نمادنو', 'وام', 'خرید اقساطی'] },
  { level: '۳', title: 'احراز سجام', text: 'اطلاعات سجامی (کد بورسی، حساب بانکی، نشانی) دریافت می‌شود. برای خرید و فروش صندوق‌ها لازم است.', unlocks: ['خرید و فروش صندوق'] },
];

const LAYERS: { icon: IconName; title: string; points: string[] }[] = [
  { icon: 'lock', title: 'حساب و ورود', points: ['ورود با رمز یک‌بارمصرف پیامکی', 'خروج خودکار پس از مدت عدم فعالیت', 'اعلان ورود از دستگاه جدید'] },
  { icon: 'withdraw', title: 'برداشت و تراکنش', points: ['برداشت فقط به حساب بانکی به نام خود کاربر', 'تأیید عملیات حساس با رمز پویا', 'سقف برداشت روزانه و رسید برای هر تراکنش'] },
  { icon: 'doc', title: 'داده و زیرساخت', points: ['ارتباط رمزنگاری‌شده در تمام مسیرها', 'دسترسی کارکنان بر اساس حداقل نیاز و با ثبت رویداد', 'پشتیبان‌گیری منظم و پایش لحظه‌ای سرویس‌ها'] },
];

const TIPS = [
  'رمز یک‌بارمصرف را به هیچ‌کس، حتی پشتیبانی نمادنو، اعلام نکنید.',
  'فقط از نشانی رسمی وب‌سایت و اپ نمادنو استفاده کنید و به پیوندهای ناشناس پیامکی اعتماد نکنید.',
  'شماره موبایل و حساب بانکی خود را به‌روز نگه دارید.',
  'در صورت مشاهده تراکنش ناشناس، فوراً از بخش پشتیبانی اپ گزارش دهید.',
];

export default function SecurityPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'امنیت' }]}
        eyebrow="امنیت در نمادنو"
        title="از دارایی شما در هر لایه محافظت می‌کنیم"
        lead="امنیت در نمادنو از احراز هویت شروع می‌شود، با تأیید هر تراکنش ادامه پیدا می‌کند و با پایش مداوم ریسک کامل می‌شود."
      />

      <Section tight>
        <div className="s-g s-g4">
          {SECURITY_POINTS.map((p) => (
            <div key={p.title} className="card s-card c-secondary">
              <span className="s-itile"><Icon name={p.icon} /></span>
              <h2 className="s-h3" style={{ fontSize: 16 }}>{p.title}</h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="احراز هویت" title="سه سطح، متناسب با هر خدمت" lead="هر خدمت فقط پس از سطح احراز لازم فعال می‌شود و همه مراحل آنلاین و داخل اپ انجام می‌شود.">
        <ol className="s-g s-g3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {KYC.map((k) => (
            <li key={k.level} className="card s-card">
              <div className="s-row"><span className="s-step-n">{k.level}</span><h3 className="s-h3" style={{ fontSize: 16 }}>{k.title}</h3></div>
              <p style={{ fontSize: 14, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{k.text}</p>
              <div className="s-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
                {k.unlocks.map((u) => <span key={u} className="lbl soft c-success"><Icon name="check" size={12} strokeWidth={2.2} />{u}</span>)}
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="لایه‌های حفاظت" title="از ورود تا برداشت">
        <div className="s-g s-g3">
          {LAYERS.map((l) => (
            <div key={l.title} className="card s-card c-primary">
              <span className="s-itile"><Icon name={l.icon} /></span>
              <h3 className="s-h3" style={{ fontSize: 16 }}>{l.title}</h3>
              <ul className="s-check">{l.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="s-split" style={{ alignItems: 'start' }}>
          <div className="card s-card">
            <span className="s-eyebrow"><span className="dot" />مسدودی قانونی</span>
            <h2 className="s-h3">شفاف، حتی وقتی بخشی از دارایی مسدود است</h2>
            <p style={{ fontSize: 14, lineHeight: 2, color: 'var(--text-secondary)' }}>
              اگر مرجع قضایی یا قانونی دستور مسدودی صادر کند، فقط همان مبلغ با برچسب زیر قفل می‌شود و دلیل و مرجع آن در اپ نمایش داده می‌شود. باقی دارایی آزاد شما قابل استفاده می‌ماند.
            </p>
            <LockTypeChip type="legal" long style={{ alignSelf: 'flex-start' }} />
          </div>
          <div className="card s-card c-warning">
            <span className="s-eyebrow" style={{ background: 'rgb(var(--warning-main-rgb) / .14)', color: 'var(--warning-text)' }}><span className="dot" />توصیه‌ها</span>
            <h2 className="s-h3">شما هم کمک کنید</h2>
            <ul className="s-check">{TIPS.map((t) => <li key={t}><Icon name="info" style={{ color: 'var(--warning-main)' }} />{t}</li>)}</ul>
          </div>
        </div>
      </Section>

      <Section tight>
        <div className="card s-card c-info" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <span className="s-itile"><Icon name="shield" /></span>
          <span className="s-col" style={{ flex: '1 1 260px', gap: 2 }}>
            <span style={{ fontWeight: 700 }}>گزارش آسیب‌پذیری</span>
            <span className="cap" style={{ fontSize: 13 }}>اگر مشکل امنیتی پیدا کرده‌اید، جزئیات را محرمانه به <span dir="ltr">security@namadno.ir</span> بفرستید. از گزارش مسئولانه شما قدردانی می‌کنیم.</span>
          </span>
          <Link href={`${routes.site.contact}?topic=other`} className="btn outlined c-primary">تماس با ما</Link>
        </div>
      </Section>
    </>
  );
}
