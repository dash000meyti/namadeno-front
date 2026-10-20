'use client';
/** /blog — list with category filter (?cat=…), featured latest post when unfiltered. */
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useBlogPosts } from '@/api/site';
import { Icon } from '@/components/ui/Icon';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';
import { BlogCard, BlogCover, PostMeta } from './BlogCard';
import { SiteError, SkeletonCard } from './Section';

export function BlogIndex() {
  const q = useBlogPosts();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() || routes.site.blog;
  const cat = sp.get('cat') ?? '';
  const posts = useMemo(() => q.data ?? [], [q.data]);
  const cats = useMemo(() => Array.from(new Set(posts.map((p) => p.category))), [posts]);
  const list = cat ? posts.filter((p) => p.category === cat) : posts;
  const featured = !cat ? list[0] : undefined;
  const rest = featured ? list.slice(1) : list;

  const pick = (c: string) => router.replace(c ? `${pathname}?cat=${encodeURIComponent(c)}` : pathname, { scroll: false });

  return (
    <section className="s-sec" style={{ paddingTop: 24 }} aria-label="فهرست مطالب">
      <div className="s-wrap">
        <div className="s-seg" role="group" aria-label="فیلتر دسته‌بندی" style={{ marginBottom: 24 }}>
          <button type="button" aria-pressed={!cat} onClick={() => pick('')}>
            همه{q.isSuccess && <span className="num" style={{ marginRight: 6, opacity: 0.7 }}>{faDigits(posts.length)}</span>}
          </button>
          {cats.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => pick(c)}>
              {c}<span className="num" style={{ marginRight: 6, opacity: 0.7 }}>{faDigits(posts.filter((p) => p.category === c).length)}</span>
            </button>
          ))}
        </div>

        {q.isLoading && (
          <div className="s-g s-g3">{[0, 1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} h={320} />)}</div>
        )}
        {q.isError && <SiteError message={q.error?.message} onRetry={() => q.refetch()} />}

        {q.isSuccess && (
          <>
            {featured && (
              <Link href={routes.site.post(featured.slug)} className="card s-card s-post" style={{ marginBottom: 20 }}>
                <div className="s-g s-g2" style={{ gap: 0 }}>
                  <BlogCover cover={featured.cover} tag={featured.category} />
                  <div className="s-post-body" style={{ padding: 24, justifyContent: 'center', gap: 12 }}>
                    <span className="lbl soft c-primary" style={{ alignSelf: 'flex-start' }}>تازه‌ترین مطلب</span>
                    <h2 className="s-h2" style={{ fontSize: 'clamp(20px,2.4vw,28px)' }}>{featured.title}</h2>
                    <p className="s-lead" style={{ fontSize: 15 }}>{featured.excerpt}</p>
                    <PostMeta post={featured} />
                  </div>
                </div>
              </Link>
            )}
            {rest.length > 0 ? (
              <div className="s-g s-g3">{rest.map((p) => <BlogCard key={p.slug} post={p} />)}</div>
            ) : !featured ? (
              <div className="card s-card" style={{ alignItems: 'center', textAlign: 'center' }}>
                <span className="s-itile c-default"><Icon name="doc" /></span>
                <span style={{ fontWeight: 600 }}>مطلبی در این دسته نیست.</span>
                <button type="button" className="btn soft c-primary" onClick={() => pick('')}>نمایش همه مطالب</button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
