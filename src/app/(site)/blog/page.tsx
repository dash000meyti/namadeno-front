import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BlogIndex } from '@/components/site/BlogIndex';
import { PageHero, SkeletonCard } from '@/components/site/Section';
import { CtaBand } from '@/components/site/CtaBand';

export const metadata: Metadata = {
  title: 'وبلاگ',
  description: 'یادداشت‌های نمادنو درباره حفظ ارزش دارایی، بخش آزاد و رزروشده، اعتبار و مزایای سازمانی.',
};

export default function BlogPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'وبلاگ' }]}
        title="وبلاگ نمادنو"
        lead="یادداشت‌هایی درباره‌ی حفظ ارزش دارایی، طلا و درآمد ثابت، اعتبار با پشتوانه‌ی دارایی و مزایای سازمانی؛ کوتاه، کاربردی و بی‌اصطلاحات پیچیده."
      />
      <Suspense fallback={<div className="s-wrap s-g s-g3" style={{ paddingBlock: 24 }}>{[0, 1, 2].map((i) => <SkeletonCard key={i} h={320} />)}</div>}>
        <BlogIndex />
      </Suspense>
      <CtaBand />
    </>
  );
}
