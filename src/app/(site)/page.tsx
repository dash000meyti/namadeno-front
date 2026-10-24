import type { Metadata } from 'next';
import { Hero } from '@/components/site/home/Hero';
import { FundStrip } from '@/components/site/home/FundStrip';
import { Statement } from '@/components/site/home/Statement';
import { Ecosystem } from '@/components/site/home/Ecosystem';
import { ProductTour } from '@/components/site/home/ProductTour';
import { OrgIsland } from '@/components/site/home/OrgIsland';
import { SecuritySection } from '@/components/site/home/SecuritySection';
import { FaqSection } from '@/components/site/home/FaqBlog';
import { CtaBand } from '@/components/site/CtaBand';

export const metadata: Metadata = {
  title: { absolute: 'نمادنو — ارزشی که می‌ماند' },
  description: 'نمادنو پس‌انداز شما را به دارایی ماندگار تبدیل می‌کند: طلا و درآمد ثابت به نام خودتان، اعتبار و وام بدون فروش دارایی، و مزایای سازمانی به‌شکل دارایی.',
};

export default function Home() {
  return (
    <>
      <Hero />
      <FundStrip />
      <Statement />
      <Ecosystem />
      <ProductTour />
      <OrgIsland />
      <SecuritySection />
      <FaqSection />
      <CtaBand />
    </>
  );
}
