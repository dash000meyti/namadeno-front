import type { Metadata } from 'next';

export const metadata: Metadata = { title: { default: 'پنل بهره‌بردار', template: '%s · کنسول بهره‌بردار نمادنو' } };

export default function OpRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
