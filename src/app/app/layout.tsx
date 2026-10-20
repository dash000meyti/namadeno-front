import type { Metadata } from 'next';
import '@/styles/app.css';

export const metadata: Metadata = { title: { default: 'اپلیکیشن', template: '%s · نمادنو' } };

/** Mobile web-app frame. Every screen positions its header (.top), scroll area (.scr) and tab bar (.bnav) inside it. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="s-app app-frame">{children}</div>;
}
