import { Icon } from '@/components/ui/Icon';
import { faDigits } from '@/lib/format';
import { PageHero } from './Section';

export interface LegalSection { id: string; title: string; body: (string | string[])[] }

/** Legal/policy document: placeholder notice, table of contents and numbered sections. Strings = paragraphs, string[] = bullet list. */
export function LegalPage({ title, lead, updated, sections, crumb }: { title: string; lead: string; updated: string; sections: LegalSection[]; crumb: string }) {
  return (
    <>
      <PageHero crumbs={[{ label: crumb }]} title={title} lead={lead}>
        <span className="cap" style={{ fontSize: 13 }}>آخرین به‌روزرسانی: {updated}</span>
      </PageHero>
      <section className="s-sec" style={{ paddingTop: 16 }} aria-label={title}>
        <div className="s-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="alert soft c-warning" role="note" style={{ maxWidth: 820 }}>
            <Icon name="risk" />
            <span><b>متن نمونه — پیش از انتشار بازبینی حقوقی شود.</b> این متن برای نمایش ساختار صفحه نوشته شده و جایگزین مشاوره حقوقی نیست.</span>
          </div>
          <nav aria-label="فهرست مطالب" className="card s-card" style={{ maxWidth: 820 }}>
            <h2 className="s-h3" style={{ fontSize: 15 }}>فهرست</h2>
            <ol style={{ margin: 0, paddingRight: 20, display: 'grid', gap: 4, fontSize: 14, listStyleType: 'persian' }}>
              {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
            </ol>
          </nav>
          <div className="s-prose">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>{`${faDigits(i + 1)}. ${s.title}`}</h2>
                {s.body.map((b, j) =>
                  Array.isArray(b) ? (
                    <ul key={j}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
                  ) : (
                    <p key={j}>{b}</p>
                  ),
                )}
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
