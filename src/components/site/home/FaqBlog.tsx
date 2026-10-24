'use client';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';
import { FaqList } from '../FaqList';

export function FaqSection() {
  return (
    <section id="faq" className="s-sec lined" aria-labelledby="faq-title">
      <div className="s-wrap s-faqgrid">
        <div className="s-sec-head">
          <span className="s-eyebrow"><span className="dot" />پیش از شروع</span>
          <h2 id="faq-title" className="s-h2">چند سؤال،<br /><span className="s-mute2">چند پاسخ روشن.</span></h2>
          <Link href={routes.site.faq} className="s-link">همه سوالات<Icon name="forward" /></Link>
        </div>
        <FaqList limit={5} />
      </div>
    </section>
  );
}
