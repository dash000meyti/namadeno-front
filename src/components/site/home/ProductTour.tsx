'use client';
/**
 * The product flow told on the product itself: steps scroll on one side while a sticky stage
 * swaps the matching screen (buy a fund → assets → credit → organization benefits). On small screens each step
 * shows its own screen inline.
 */
import { useEffect, useRef, useState } from 'react';
import { Motif } from '@/components/ui/Motif';
import { LockTypeChip } from '@/components/ui/LockBar';
import { faDigits } from '@/lib/format';
import { Section } from '../Section';
import { AssetsScreen, ConvertScreen, CreditScreen, InboxScreen } from './ProductScreens';

const STEPS = [
  {
    id: 'invest',
    t: 'پول‌تان را به دارایی تبدیل کنید.',
    d: 'از کیف پول ریالی، صندوق دلخواه‌تان را بخرید. قیمت هر واحد، تعداد واحدها و کارمزد، پیش از تأیید پیداست؛ بدون هزینه‌ی پنهان.',
    tags: ['صندوق طلا', 'درآمد ثابت', 'خرید و فروش آنی'],
    Screen: ConvertScreen,
  },
  {
    id: 'grow',
    t: 'رشدش را هر روز ببینید.',
    d: 'دارایی‌تان دو بخش دارد: آزاد و قفل‌شده. هر عدد «قابل برداشت» فقط از بخش آزاد است و هر قفل، دلیل و زمان آزادسازی‌اش را بی‌پرده نشان می‌دهد.',
    locks: true,
    Screen: AssetsScreen,
  },
  {
    id: 'credit',
    t: 'بی‌آنکه بفروشید، اعتبار بگیرید.',
    d: 'کارت اعتباری نمادنو، وام بدون ضامن و خرید اقساطی؛ با پشتوانه‌ی بخش آزاد دارایی، در چند دقیقه و بدون کاغذبازی. دارایی‌تان در این مدت همچنان رشد می‌کند.',
    tags: ['کارت نمادنو', 'وام تا ۴۰٪ دارایی آزاد', 'خرید اقساطی'],
    Screen: CreditScreen,
  },
  {
    id: 'benefits',
    t: 'پاداش سازمان‌تان، مستقیم به دارایی.',
    d: 'اگر سازمان شما همراه نمادنو است، پاداش و مزایا در «دریافتی‌ها» می‌رسد. تأیید می‌کنید و سهم طلا، درآمد ثابت یا ریال را خودتان انتخاب می‌کنید.',
    tags: ['پاداش و عیدی', 'مزایای رفاهی', 'قراردادهای پروژه‌ای'],
    Screen: InboxScreen,
  },
] as const;

export function ProductTour() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <Section
      id="product"
      eyebrow="اپ نمادنو"
      title="از پس‌انداز تا اعتبار،"
      mute="در چند لمس."
    >
      <div className="s-tour">
        <ol className="s-tour-steps" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((s, i) => {
            const Screen = s.Screen;
            return (
              <li key={s.id} id={s.id === 'credit' ? 'credit' : undefined} ref={(el) => { refs.current[i] = el; }} data-i={i} className={'s-tstep' + (i === active ? ' on' : '')}>
                <span className="no">{faDigits(String(i + 1).padStart(2, '0'))}</span>
                <h3 className="t">{s.t}</h3>
                <p className="d">{s.d}</p>
                <div className="tags">
                  {'locks' in s
                    ? (['collateral', 'vesting', 'installment', 'milestone', 'legal'] as const).map((k) => <LockTypeChip key={k} type={k} />)
                    : s.tags.map((t) => <span key={t} className="chip line">{t}</span>)}
                </div>
                <div className="vis" aria-hidden="true">
                  <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0' }}><Screen /></div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="s-tour-stage" aria-hidden="true">
          <Motif variant="grid" />
          {STEPS.map((s, i) => {
            const Screen = s.Screen;
            return <div key={s.id} className={'s-scene' + (i === active ? ' on' : '')}><Screen /></div>;
          })}
          <span className="s-tour-dots">{STEPS.map((s, i) => <i key={s.id} className={i === active ? 'on' : undefined} />)}</span>
        </div>
      </div>
    </Section>
  );
}
