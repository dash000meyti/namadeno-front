import type { Metadata } from 'next';
import { DesignSystem } from '@/components/site/DesignSystem';
import { PageHero } from '@/components/site/Section';

export const metadata: Metadata = {
  title: 'سیستم طراحی',
  description: 'مرجع زنده توکن‌ها و کامپوننت‌های Namadno UI: رنگ، تایپوگرافی، شعاع، سایه، دکمه، برچسب و اجزای آزاد/رزروشده.',
};

export default function DesignSystemPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'سیستم طراحی' }]}
        eyebrow="Namadno UI"
        title="سیستم طراحی نمادنو"
        lead="مرجع زنده توکن‌ها و کامپوننت‌های اصلی؛ ساختار Minimals، شیشه ملایم و پالت محدود. همه مقادیر از متغیرهای CSS خوانده می‌شوند و با تغییر تم به‌روز می‌شوند."
      />
      <DesignSystem />
    </>
  );
}
