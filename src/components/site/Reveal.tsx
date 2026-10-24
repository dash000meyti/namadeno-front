'use client';
/** Fades its child block in when it scrolls into view (CSS: .rv / .rv.in in site.css; off with reduced motion). */
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

export function Reveal({ as: Tag = 'div', className, style, delay = 0, children }: { as?: ElementType; className?: string; style?: CSSProperties; delay?: number; children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={'rv' + (inView ? ' in' : '') + (className ? ' ' + className : '')} style={delay ? { transitionDelay: `${delay}ms`, ...style } : style}>
      {children}
    </Tag>
  );
}
