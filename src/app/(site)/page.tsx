import type { Metadata } from 'next';
import { Hero } from '@/components/site/home/Hero';
import { HowItWorks } from '@/components/site/home/HowItWorks';
import { FundsSection } from '@/components/site/home/FundsSection';
import { LocksSection } from '@/components/site/home/LocksSection';
import { CreditSection } from '@/components/site/home/CreditSection';
import { OrgsSection } from '@/components/site/home/OrgsSection';
import { SecuritySection } from '@/components/site/home/SecuritySection';
import { BlogTeaser, FaqSection } from '@/components/site/home/FaqBlog';
import { CtaBand } from '@/components/site/CtaBand';

export const metadata: Metadata = {
  title: { absolute: 'نمادنو — پاداشی که ارزشش می‌ماند' },
  description: 'نمادنو، سوپراپ مالی گروه صندوق‌های بورسی: پاداش و مزایای کارکنان به‌صورت واحد صندوق، دارایی آزاد و قفل‌شده شفاف، و اعتبار، وام و خرید اقساطی با پشتوانه دارایی.',
};

export default function Home() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <FundsSection />
      <LocksSection />
      <CreditSection />
      <OrgsSection />
      <SecuritySection />
      <FaqSection />
      <BlogTeaser />
      <CtaBand />
    </>
  );
}
