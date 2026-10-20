'use client';
import Link from 'next/link';
import { useBlogPosts } from '@/api/site';
import { Icon } from '@/components/ui/Icon';
import { routes } from '@/lib/routes';
import { BlogCard } from '../BlogCard';
import { FaqList } from '../FaqList';
import { Section, SiteError, SkeletonCard } from '../Section';

export function FaqSection() {
  return (
    <Section
      id="faq"
      eyebrow="سوالات متداول"
      title="پاسخ سوال‌های رایج"
      center
      headExtra={<Link href={routes.site.faq} className="s-link">همه سوالات<Icon name="forward" /></Link>}
    >
      <div style={{ maxWidth: 860, marginInline: 'auto' }}>
        <FaqList limit={5} />
      </div>
    </Section>
  );
}

export function BlogTeaser() {
  const q = useBlogPosts();
  return (
    <Section
      id="blog"
      eyebrow="وبلاگ"
      title="یادداشت‌هایی برای تصمیم بهتر"
      headExtra={<Link href={routes.site.blog} className="s-link">همه مطالب<Icon name="forward" /></Link>}
    >
      {q.isLoading && <div className="s-g s-g3">{[0, 1, 2].map((i) => <SkeletonCard key={i} h={320} />)}</div>}
      {q.isError && <SiteError message={q.error?.message} onRetry={() => q.refetch()} />}
      {q.isSuccess && (
        <div className="s-g s-g3">
          {(q.data ?? []).slice(0, 3).map((p) => <BlogCard key={p.slug} post={p} />)}
        </div>
      )}
    </Section>
  );
}
