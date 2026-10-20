'use client';
/** Extra React Query hooks owned by the "app-core" area (endpoints in src/mocks/handlers/app-core-extra.ts). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KycLevel } from '@/types/domain';
import { get, post } from './client';
import { qk } from './keys';

export interface KycDetails {
  level: KycLevel;
  mobile: string;
  nationalId: string;
  fullName: string;
  birthDate?: string;
  fatherName?: string;
  registryOffice?: string;
  sejam?: { bourseCode: string; bankAccount: string; postalCode: string };
}

export interface SecurityInfo {
  passwordChangedAt: string;
}

/** Keys live under ['me', …] so every "me" invalidation refreshes them too. */
export const coreKeys = {
  kyc: ['me', 'kyc-details'] as const,
  security: ['me', 'security'] as const,
};

export const useKycDetails = () => useQuery({ queryKey: coreKeys.kyc, queryFn: () => get<KycDetails>('/me/kyc') });
export const useSecurity = () => useQuery({ queryKey: coreKeys.security, queryFn: () => get<SecurityInfo>('/me/security') });

/** Change password (POST /me/password) — also refreshes the security info. */
export const useChangePasswordCore = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { current?: string; next: string }) => post<{ ok: true; passwordChangedAt: string }>('/me/password', v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me.all }),
  });
};
