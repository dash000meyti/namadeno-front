import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';
import { Section } from '../Section';

export const SECURITY_POINTS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'convert', title: 'تبدیل سریع و امن', text: 'هر وقت بخواهید، دارایی را با چند لمس به ریال برگردانید؛ مبلغ فقط به کیف پول و حساب بانکی به نام خودتان می‌رود.' },
  { icon: 'id', title: 'احراز هویت سه‌سطحی', text: 'شاهکار، ثبت احوال و سجام؛ هر خدمت فقط با سطح احراز لازمش فعال می‌شود.' },
  { icon: 'phone', title: 'تأیید هر عملیات حساس', text: 'برداشت، خرید با کارت و تغییر حساب بانکی تنها با رمز یک‌بارمصرف انجام می‌شود.' },
  { icon: 'risk', title: 'پایش لحظه‌ای ریسک', text: 'هر الگوی غیرعادی همان لحظه رصد می‌شود و در صورت نیاز، تراکنش تا بررسی متوقف می‌ماند.' },
];

export function SecuritySection() {
  return (
    <Section
      id="security"
      lined
      eyebrow="امنیت"
      title="اعتماد، از روز اول."
      mute="دارایی شما، همیشه به نام شما."
      headExtra={<Link href={routes.site.security} className="s-link">امنیت در نمادنو<Icon name="forward" /></Link>}
    >
      <div className="s-pillars four">
        {SECURITY_POINTS.map((p) => (
          <div key={p.title} className="s-pillar c-secondary">
            <span className="s-itile"><Icon name={p.icon} /></span>
            <span className="t" style={{ fontSize: 17 }}>{p.title}</span>
            <p className="d" style={{ fontSize: 14 }}>{p.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
