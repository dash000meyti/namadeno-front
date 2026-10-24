import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import Providers from './providers';
import { colorModeScript } from '@/theme/ColorModeProvider';

export const metadata: Metadata = {
  title: { default: 'نمادنو', template: '%s · نمادنو' },
  description: 'نمادنو — ارزشی که می‌ماند. پس‌انداز در صندوق‌های معتبر طلا و درآمد ثابت، اعتبار با پشتوانه دارایی و مزایای سازمانی به‌شکل دارایی.',
  applicationName: 'نمادنو',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F9FC' },
    { media: '(prefers-color-scheme: dark)', color: '#141826' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="th-light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
