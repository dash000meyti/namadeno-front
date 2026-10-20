'use client';
/** /app/assets/[kind] — other funds (equity, mixed, silver …), same structure as app-gold/app-fixed. */
import { useParams } from 'next/navigation';
import { AssetPage } from '@/components/app/money/AssetPage';
import type { AssetKind } from '@/types/domain';

export default function Page() {
  const params = useParams<{ kind: string }>();
  const kind = (Array.isArray(params.kind) ? params.kind[0] : params.kind) as AssetKind;
  return <AssetPage key={kind} kind={kind} />;
}
