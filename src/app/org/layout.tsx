import type { Metadata } from 'next';

export const metadata: Metadata = { title: { default: 'پنل سازمانی', template: '%s · پنل سازمانی نمادنو' } };

export default function OrgRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
