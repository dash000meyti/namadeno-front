import Link from 'next/link';
import type { BlogPost } from '@/types/domain';
import { Icon, type IconName } from '@/components/ui/Icon';
import { faDigits, jDayMonth } from '@/lib/format';
import { routes } from '@/lib/routes';

export type PostSummary = Omit<BlogPost, 'body'>;

const COVER_ICON: Record<BlogPost['cover'], IconName> = {
  gold: 'gold',
  fixed: 'chart',
  credit: 'card',
  org: 'building',
  security: 'shield',
};

/** Cover art drawn with CSS gradients (one palette per post.cover). */
export function BlogCover({ cover, tag, large }: { cover: BlogPost['cover']; tag?: string; large?: boolean }) {
  return (
    <div className={`s-cover ${cover}${large ? ' lg' : ''}`} aria-hidden="true">
      {tag && <span className="tag">{tag}</span>}
      <Icon name={COVER_ICON[cover] ?? 'doc'} />
    </div>
  );
}

export function PostMeta({ post }: { post: PostSummary }) {
  return (
    <div className="s-post-meta">
      <span>{post.author}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={post.publishedAt}>{jDayMonth(post.publishedAt, true)}</time>
      <span aria-hidden="true">·</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={14} />{faDigits(post.readMinutes)} دقیقه مطالعه</span>
    </div>
  );
}

export function BlogCard({ post }: { post: PostSummary }) {
  return (
    <Link href={routes.site.post(post.slug)} className="card s-card s-post">
      <BlogCover cover={post.cover} tag={post.category} />
      <div className="s-post-body">
        <h3 className="s-post-title">{post.title}</h3>
        <p className="s-post-ex">{post.excerpt}</p>
        <PostMeta post={post} />
      </div>
    </Link>
  );
}
