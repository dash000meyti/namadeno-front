import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Motif } from '@/components/ui/Motif';
import { routes } from '@/lib/routes';
import { Reveal } from '../Reveal';

const STEPS = [
  { n: '۰۱', t: 'رضایت ماندگار', tag: 'برای همکاران', d: 'هر پاداش، دارایی‌ای است که هر روز رشد می‌کند و پشتوانه‌ی اعتبار می‌شود؛ قدردانی شما ماه‌ها بعد هم دیده می‌شود.' },
  { n: '۰۲', t: 'ماندگاری نیروها', tag: 'قفل هوشمند', d: 'با قفل زمانی یا آزادسازی مرحله‌ای، پاداش را به ماندن و به نتیجه گره بزنید؛ ارزشش در این مدت برای همکار رشد می‌کند.' },
  { n: '۰۳', t: 'کنترل کامل بودجه', tag: 'گزارش لحظه‌ای', d: 'ارسال گروهی در چند دقیقه، پذیرش هر بسته و مصرف بودجه در یک پنل؛ راه‌اندازی کامل در کمتر از یک هفته.' },
];

/** «برای سازمان‌ها» — rendered as an island in the opposite theme. */
export function OrgIsland() {
  return (
    <section className="s-sec tight" aria-labelledby="org-title">
      <div className="s-wrap">
        <div className="s-island">
          <Motif variant="grid" />
          <div className="s-sec-head" style={{ maxWidth: 720 }}>
            <span className="s-eyebrow"><span className="dot" />نمادنو برای سازمان‌ها</span>
            <h2 id="org-title" className="s-h2">پاداشی که دیده می‌شود.<br /><span className="s-mute2">نیرویی که می‌ماند.</span></h2>
            <p className="s-lead">پاداش ریالی زود فراموش می‌شود؛ دارایی‌ای که هر روز رشد می‌کند، نه. با نمادنو پاداش، عیدی و مزایای رفاهی را به‌صورت دارایی ماندگار بپردازید، نیروهای کلیدی را نگه دارید و اثر هر تومان بودجه را ببینید.</p>
            <div className="s-actions">
              <Link href={`${routes.site.business}#demo`} className="btn lg lux">رزرو جلسه‌ی معرفی</Link>
              <Link href={routes.site.business} className="btn lg text">نمادنو برای سازمان‌ها<Icon name="forward" /></Link>
            </div>
          </div>
          <ol className="s-nsteps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} className="s-nstep" delay={i * 120}>
                <span className="n">{s.n}</span>
                <span className="rule" />
                <span className="s-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <span className="t">{s.t}</span>
                  <span className="chip line" style={{ height: 28, fontSize: 12 }}>{s.tag}</span>
                </span>
                <p className="d">{s.d}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
