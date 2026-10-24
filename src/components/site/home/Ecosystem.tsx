'use client';
/**
 * «نمادنو چیست» — the four pillars of Namadno as an Apple-style bento:
 * funds (live from GET /public/funds), rial wallet, Namadno credit, and organization benefits.
 */
import Link from 'next/link';
import { usePublicFunds } from '@/api/site';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { money, percent } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Section } from '../Section';
import { Reveal } from '../Reveal';

function Head({ icon, label, c, title, text }: { icon: IconName; label: string; c: string; title: string; text: string }) {
  return (
    <>
      <span className={'s-bento-tag ' + c}><Icon name={icon} size={16} />{label}</span>
      <h3 className="s-bento-t">{title}</h3>
      <p className="s-bento-d">{text}</p>
    </>
  );
}

export function Ecosystem() {
  const funds = usePublicFunds();
  const list = (funds.data ?? []).filter((f) => f.status === 'active').slice(0, 4);
  return (
    <Section
      id="namadno"
      eyebrow="نمادنو چیست"
      title="یک حساب."
      mute="هر آنچه دارایی‌تان لازم دارد."
    >
      <div className="s-bento">
        <Reveal className="s-bento-it wide">
          <Head icon="gold" label="صندوق‌ها" c="c-warning" title="پس‌انداز در دارایی‌های ماندگار" text="طلا، درآمد ثابت، سهامی شاخصی، مختلط و نقره؛ با چند لمس بخرید، رشدش را هر روز ببینید و هر وقت خواستید به ریال برگردانید." />
          <div className="s-bento-funds" aria-busy={funds.isLoading}>
            {funds.isLoading && [0, 1, 2, 3].map((i) => <span key={i} className="s-skl" style={{ height: 44, borderRadius: 12 }} />)}
            {list.map((f) => (
              <div key={f.id} className="row">
                <span className="n">{f.name}</span>
                <span className="r">بازده سالانه <b>{percent(f.return1y, 0)}</b></span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="s-bento-it" delay={100}>
          <Head icon="banknote" label="کیف پول ریالی" c="c-secondary" title="نقطه‌ی شروع هر تصمیم" text="واریز آنی از کارت بانکی و برداشت به حسابی که به نام خودتان است." />
          <div className="s-bento-wallet">
            <span className="k">موجودی آزاد</span>
            <span className="v num">{money(20_400_000)} <small>تومان</small></span>
            <span className="s-row" style={{ gap: 6 }}><span className="chip line">واریز</span><span className="chip line">برداشت</span></span>
          </div>
        </Reveal>

        <Reveal className="s-bento-it" delay={100}>
          <Head icon="credit" label="اعتبار نمادنو" c="c-success" title="اعتبار، بی‌آنکه دارایی را بفروشید" text="کارت اعتباری، وام بدون ضامن تا ۴۰٪ دارایی آزاد و خرید اقساطی از فروشگاه‌های معتبر." />
          <div className="s-bento-credit">
            <LockBar free={130_900_000} locked={71_600_000} />
            <span className="s-row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-secondary)' }}>اعتبار آماده</span>
              <b className="num" style={{ fontWeight: 500 }}>{money(52_360_000)} تومان</b>
            </span>
          </div>
          <Link href="/#credit" className="btn text">بیشتر بدانید<Icon name="forward" /></Link>
        </Reveal>

        <Reveal className="s-bento-it wide" delay={200}>
          <Head icon="gift" label="مزایای سازمانی" c="c-primary" title="پاداش سازمان‌تان، مستقیم به دارایی" text="اگر سازمان شما همراه نمادنو است، پاداش، عیدی و مزایا به‌صورت واحد صندوق به همین حساب می‌رسد؛ تأیید می‌کنید و سهم هر صندوق را خودتان انتخاب می‌کنید." />
          <div className="s-bento-gift">
            <span className="ic"><Icon name="gift" /></span>
            <span className="s-col" style={{ lineHeight: 1.5 }}>
              <b>پاداش مهر ۱۴۰۵ · هلدینگ آرمان</b>
              <small>{money(20_000_000)} تومان · ۵۰٪ طلا، ۵۰٪ درآمد ثابت</small>
            </span>
            <span className="lbl soft c-success" style={{ marginRight: 'auto' }}>تأیید شد</span>
          </div>
          <Link href={routes.site.business} className="btn text">نمادنو برای سازمان‌ها<Icon name="forward" /></Link>
        </Reveal>
      </div>
    </Section>
  );
}
