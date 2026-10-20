'use client';
/**
 * «ارسال بسته» from the employees screens: creates a draft package with the chosen
 * recipients and opens the package wizard (step 1) on that draft.
 */
import { useRouter } from 'next/navigation';
import { useCreatePackage } from '@/api/org';
import { routes } from '@/lib/routes';

export function useStartPackage(onError: (e: unknown) => void) {
  const create = useCreatePackage();
  const router = useRouter();
  const start = (recipientIds: string[]) =>
    create.mutate(
      { title: 'بسته جدید', reason: 'bonus', recipientIds, amountPerPerson: 0, allocationMode: 'free', lockPolicy: { type: 'none' } },
      { onSuccess: (p) => router.push(routes.org.newRecipients(p.id)), onError },
    );
  return { start, pending: create.isPending };
}
