import Link from 'next/link';
import { LogoFull } from '@/components/ui/Brand';

/** The full Namadno lockup (wordmark + mark), linking home. */
export function SiteLogo({ height = 28, href = '/' }: { height?: number; href?: string }) {
  return (
    <Link href={href} className="s-logo" aria-label="نمادنو — صفحه اصلی">
      <LogoFull height={height} title="نمادنو" />
    </Link>
  );
}
