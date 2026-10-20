import Link from 'next/link';
import { LogoMark } from '@/components/ui/Icon';

/** Logo mark + Divan wordmark (the only place Divan is used). */
export function SiteLogo({ size = 36, href = '/' }: { size?: number; href?: string }) {
  return (
    <Link href={href} className="s-logo" aria-label="نمادنو — صفحه اصلی">
      <LogoMark size={size} radius={10} />
      <span className="wm">نمادنو</span>
    </Link>
  );
}
