'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useBlogPost, useBlogPosts } from '@/api/site';
import type { ApiRequestError } from '@/api/client';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { BlogCard, BlogCover, PostMeta } from '@/components/site/BlogCard';
import { PageHero, Section, SiteError, SkeletonCard } from '@/components/site/Section';
import { CtaBand } from '@/components/site/CtaBand';
import { routes } from '@/lib/routes';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = useBlogPost(slug ?? '');
  const all = useBlogPosts();
  const toast = useToast();

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: post.data?.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('پیوند مطلب کپی شد.');
    } catch {
      /* user cancelled the share sheet or clipboard is unavailable */
    }
  };

  if (post.isLoading) {
    return (
      <div className="s-wrap" style={{ paddingBlock: 40, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <span className="s-skl" style={{ height: 16, width: 160 }} />
        <span className="s-skl" style={{ height: 40, width: '80%' }} />
        <SkeletonCard h={300} r={24} />
        {[0, 1, 2].map((i) => <span key={i} className="s-skl" style={{ height: 18, width: `${95 - i * 10}%` }} />)}
      </div>
    );
  }

  if (post.isError || !post.data) {
    const err = post.error as ApiRequestError | null;
    const notFound = err?.status === 404;
    return (
      <>
        <PageHero crumbs={[{ label: 'وبلاگ', href: routes.site.blog }, { label: notFound ? 'پیدا نشد' : 'خطا' }]} title={notFound ? 'مطلب پیدا نشد' : 'خطا در دریافت مطلب'} lead={notFound ? 'ممکن است نشانی اشتباه باشد یا مطلب حذف شده باشد.' : undefined} />
        <div className="s-wrap" style={{ paddingBlock: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
          {!notFound && <SiteError message={err?.message} onRetry={() => post.refetch()} />}
          <Link href={routes.site.blog} className="btn soft c-primary"><Icon name="back" />بازگشت به وبلاگ</Link>
        </div>
      </>
    );
  }

  const p = post.data;
  const others = (all.data ?? []).filter((x) => x.slug !== p.slug);
  const related = [...others.filter((x) => x.category === p.category), ...others.filter((x) => x.category !== p.category)].slice(0, 3);

  return (
    <>
      <article>
        <PageHero crumbs={[{ label: 'وبلاگ', href: routes.site.blog }, { label: p.category, href: `${routes.site.blog}?cat=${encodeURIComponent(p.category)}` }, { label: p.title }]} title={p.title} lead={p.excerpt}>
          <div className="s-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <PostMeta post={p} />
            <button type="button" className="btn sm soft c-primary" onClick={share} style={{ marginRight: 'auto' }}><Icon name="share" />اشتراک‌گذاری</button>
          </div>
        </PageHero>
        <div className="s-wrap" style={{ paddingTop: 16 }}>
          <BlogCover cover={p.cover} tag={p.category} large />
          <div className="s-prose" style={{ marginTop: 32, marginInline: 'auto' }}>
            {p.body.map((para, i) =>
              para.startsWith('## ') ? <h2 key={i}>{para.slice(3)}</h2> : <p key={i}>{para}</p>,
            )}
            <div className="alert soft c-info" style={{ marginTop: 28 }}>
              <Icon name="info" />
              <span>این مطلب جنبه آموزشی دارد و توصیه سرمایه‌گذاری نیست. پیش از تصمیم، شرایط و ریسک هر دارایی را مطالعه کنید.</span>
            </div>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <Section eyebrow="بیشتر بخوانید" title="مطالب مرتبط" headExtra={<Link href={routes.site.blog} className="s-link">همه مطالب<Icon name="forward" /></Link>}>
          <div className="s-g s-g3">{related.map((r) => <BlogCard key={r.slug} post={r} />)}</div>
        </Section>
      )}
      <CtaBand />
    </>
  );
}
