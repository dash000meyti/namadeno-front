'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { FundCategory } from '@/types/domain';
import { usePublicFunds } from '@/api/site';
import { Icon } from '@/components/ui/Icon';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';
import { CATEGORY_LABEL, FundCard } from '../FundCard';
import { Section, SiteError, SkeletonCard } from '../Section';

type Filter = 'all' | FundCategory;

export function FundsSection() {
  const q = usePublicFunds();
  const [filter, setFilter] = useState<Filter>('all');
  const funds = useMemo(() => q.data ?? [], [q.data]);
  const cats = useMemo(() => {
    const present = new Set(funds.map((f) => f.category));
    return (Object.keys(CATEGORY_LABEL) as FundCategory[]).filter((c) => present.has(c));
  }, [funds]);
  const list = filter === 'all' ? funds : funds.filter((f) => f.category === filter);
  const count = (c: Filter) => (c === 'all' ? funds.length : funds.filter((f) => f.category === c).length);

  return (
    <Section
      id="funds"
      eyebrow="صندوق‌های گروه"
      title="هر پاداش، در صندوقی که مناسب شماست"
      lead="واحدهای صندوق به نام شما ثبت می‌شود. هر صندوق فقط به کیف پول ریالی تبدیل می‌شود و ریال به هر صندوقی؛ ساده و بدون کد بورسی جداگانه."
    >
      <div className="s-seg" role="group" aria-label="فیلتر نوع صندوق" style={{ marginBottom: 20 }}>
        {(['all', ...cats] as Filter[]).map((c) => (
          <button key={c} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)}>
            {c === 'all' ? 'همه' : CATEGORY_LABEL[c]}
            {q.isSuccess && <span className="num" style={{ marginRight: 6, opacity: 0.7 }}>{faDigits(count(c))}</span>}
          </button>
        ))}
      </div>

      {q.isLoading && (
        <div className="s-g s-g3">{[0, 1, 2].map((i) => <SkeletonCard key={i} h={280} />)}</div>
      )}
      {q.isError && <SiteError message={q.error?.message} onRetry={() => q.refetch()} />}
      {q.isSuccess && (
        <div className="s-g s-g3">
          {list.map((f) => <FundCard key={f.id} fund={f} />)}
        </div>
      )}

      <div className="s-row" style={{ marginTop: 20, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <span className="cap">قیمت واحدها به تومان. بازدهی گذشته تضمینی برای بازدهی آینده نیست.</span>
        <Link href={routes.app.login} className="s-link">خرید و فروش در اپ<Icon name="forward" /></Link>
      </div>
    </Section>
  );
}
