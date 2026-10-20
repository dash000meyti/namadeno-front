import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';
import { Section } from '../Section';

export const SECURITY_POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'id', title: 'احراز هویت سه‌سطحی', text: 'شاهکار، استعلام ثبت احوال و سجام؛ هر خدمت فقط با سطح احراز لازم فعال می‌شود.' },
  { icon: 'phone', title: 'رمز پویا برای عملیات حساس', text: 'برداشت، خرید با کارت و تغییر حساب بانکی با رمز یک‌بارمصرف تأیید می‌شود.' },
  { icon: 'bank', title: 'دارایی به نام خود شما', text: 'واحدها در صندوق‌های تحت نظارت سازمان بورس و اوراق بهادار به نام شما ثبت می‌شود.' },
  { icon: 'risk', title: 'پایش ریسک و تقلب', text: 'الگوهای غیرعادی به‌صورت لحظه‌ای رصد و در صورت نیاز تراکنش برای بررسی متوقف می‌شود.' },
];

export function SecuritySection() {
  return (
    <Section
      id="security"
      eyebrow="امنیت"
      title="امنیت، از ورود تا برداشت"
      lead="از دارایی شما در هر لایه محافظت می‌کنیم؛ از احراز هویت و تأیید تراکنش تا نگهداری واحدها و پایش ریسک."
      headExtra={<Link href={routes.site.security} className="s-link">جزئیات امنیت در نمادنو<Icon name="forward" /></Link>}
    >
      <div className="s-g s-g4">
        {SECURITY_POINTS.map((p) => (
          <div key={p.title} className="card s-card c-secondary">
            <span className="s-itile"><Icon name={p.icon} /></span>
            <h3 className="s-h3" style={{ fontSize: 16 }}>{p.title}</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.95, color: 'var(--text-secondary)' }}>{p.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
