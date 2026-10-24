'use client';
/**
 * Landing hero — promise «ارزشی که می‌ماند» for everyone; the whole Namadno ecosystem on one stage:
 * centered headline (lines reveal in turn), then the employee app on a phone, the organization panel
 * (macOS window) behind it and the black Namadno card in front, over two glowing quarter circles taken
 * from the logo. A push notification drops in. Layers follow the pointer and spread on scroll (depth);
 * all motion is off with prefers-reduced-motion and on touch screens.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Brand';
import { Motif } from '@/components/ui/Motif';
import { useSiteStats } from '@/api/site-extra';
import { compactMoney, faDigits, money } from '@/lib/format';
import { routes } from '@/lib/routes';
import { AssetsScreen, NamadnoCard, OrgWindow } from './ProductScreens';

const CARDS: { cls: string; c: string; icon: IconName; k: string; v: string }[] = [
  { cls: 'b', c: 'c-warning', icon: 'gold', k: 'صندوق طلا · امروز', v: '+۱٫۲۰٪ رشد ارزش' },
  { cls: 'c', c: 'c-success', icon: 'credit', k: 'اعتبار آماده‌ی شما', v: `${money(52_360_000)} تومان` },
];

export function Hero() {
  const stats = useSiteStats();
  const s = stats.data;
  const items = [
    { k: 'aum', v: s ? compactMoney(s.aum) : null, label: 'تومان دارایی امانت‌شده به نمادنو' },
    { k: 'emp', v: s ? money(s.employees) : null, label: 'عضو فعال' },
    { k: 'org', v: s ? faDigits(s.organizations) : null, label: 'سازمان همراه' },
  ];

  // depth: pointer parallax + scroll spread, written straight to CSS variables (no re-render)
  const stage = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches) return;
    let raf = 0;
    const set = (k: string, v: number) => el.style.setProperty(k, v.toFixed(3));
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        set('--mx', Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2))));
        set('--my', Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2))));
      });
    };
    const onLeave = () => { set('--mx', 0); set('--my', 0); };
    const onScroll = () => set('--sp', Math.max(0, Math.min(1, window.scrollY / 700)));
    const root = el.closest('section') ?? el;
    root.addEventListener('pointermove', onMove as EventListener);
    root.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('pointermove', onMove as EventListener);
      root.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <section className="s-hero" aria-labelledby="hero-title">
      <Motif variant="grid" className="s-hero-grid-bg" />
      <div className="s-wrap s-hero-grid">
        <div className="s-hero-copy">
          <Link href="/#credit" className="s-announce">
            <span className="tag">جدید</span>
            کارت اعتباری نمادنو؛ خرید با پشتوانه دارایی، بی‌آنکه آن را بفروشید
            <Icon name="forward" size={14} />
          </Link>
          <h1 id="hero-title" className="s-h1">
            <span className="ln" style={{ '--i': 0 } as React.CSSProperties}>ارزشی که می‌ماند.</span>
            <br /><span className="ln s-grad" style={{ '--i': 1 } as React.CSSProperties}>آینده‌ای که می‌سازید.</span>
          </h1>
          <p className="s-lead s-rise" style={{ maxWidth: 640, '--i': 2 } as React.CSSProperties}>
            نمادنو پس‌انداز شما را به دارایی ماندگار تبدیل می‌کند: صندوق‌های معتبر طلا و درآمد ثابت، به نام خودتان و در برابر تورم.
            هر وقت هم لازم شد، بی‌آنکه دارایی‌تان را بفروشید، با پشتوانه‌اش اعتبار بگیرید.
          </p>
          <div className="s-actions s-rise" style={{ justifyContent: 'center', '--i': 3 } as React.CSSProperties}>
            <Link href={routes.app.signup} className="btn lg contained c-primary">افتتاح حساب نمادنو</Link>
            <Link href={routes.site.business} className="btn lg text">نمادنو برای سازمان‌ها<Icon name="forward" /></Link>
          </div>
        </div>

        <div ref={stage} className="s-show" aria-hidden="true">
          <span className="s-aura" />
          <span className="s-q a" /><span className="s-q b" />

          <div className="s-l s-l-win"><div className="s-in"><OrgWindow /></div></div>
          <div className="s-l s-l-phone"><div className="s-in"><AssetsScreen /></div></div>
          <div className="s-l s-l-card"><div className="s-in"><NamadnoCard /></div></div>

          <div className="s-l s-l-note">
            <div className="s-in s-note">
              <span className="app"><LogoMark size={16} /></span>
              <span className="s-col" style={{ flex: 1, textAlign: 'right', lineHeight: 1.45 }}>
                <span className="s-row" style={{ justifyContent: 'space-between' }}><b>نمادنو</b><small>اکنون</small></span>
                <span>سود امروز به دارایی شما اضافه شد · <span dir="ltr">+{money(1_199_550)}</span> تومان</span>
              </span>
            </div>
          </div>

          {CARDS.map((c) => (
            <div key={c.cls} className={`s-l s-l-f ${c.cls}`}>
              <span className={`s-in s-fcard ${c.c}`}>
                <span className="ic"><Icon name={c.icon} /></span>
                <span className="s-col" style={{ textAlign: 'right' }}>
                  <span className="k">{c.k}</span>
                  <span className="v">{c.v}</span>
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="s-hero-stats" aria-live="polite" aria-busy={stats.isLoading}>
          {items.map((it) => (
            <div key={it.k} className="s-stat">
              {it.v !== null ? <b>{it.v}</b> : <span className="s-skl" style={{ display: 'block', height: 28, width: 96, margin: '5px auto' }} />}
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
