'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@/types/domain';
import { post, setSession } from './client';
import { qk } from './keys';

export type OtpPurpose = 'login' | 'signup' | 'reset';

export const useRequestOtp = () =>
  useMutation({ mutationFn: (v: { mobile: string; purpose: OtpPurpose }) => post<{ sent: boolean; ttl: number; devCode?: string }>('/auth/otp/request', v) });

export const useVerifyOtp = () =>
  useMutation({
    mutationFn: (v: { mobile: string; code: string; purpose: OtpPurpose }) => post<Session | { verified: true; mobile: string }>('/auth/otp/verify', v),
    onSuccess: (r) => { if ('token' in r) setSession(r); },
  });

export const useLogin = () =>
  useMutation({ mutationFn: (v: { mobile: string; password: string }) => post<Session>('/auth/login', v), onSuccess: (s) => setSession(s) });

export const useSignup = () =>
  useMutation({ mutationFn: (v: { nationalId: string; mobile: string; password: string }) => post<Session>('/auth/signup', v), onSuccess: (s) => setSession(s) });

export const useResetPassword = () =>
  useMutation({ mutationFn: (v: { mobile: string; code: string; password: string }) => post<Session>('/auth/password/reset', v), onSuccess: (s) => setSession(s) });

export const useLogout = () =>
  useMutation({ mutationFn: () => post('/auth/logout'), onSettled: () => setSession(null, 'employee') });

// Organization panel: the same Namadno account as the app (national ID + account password); only members with panel access may enter.
// Panel sign-ins drop the cached data of the previous person (role, name and what they may see differ per account).
export const useOrgLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { nationalId: string; password: string }) => post<Session>('/org/auth/login', v),
    onSuccess: (s) => { setSession(s, 'org_admin'); qc.removeQueries({ queryKey: qk.org.all }); },
  });
};

/** «فراموشی رمز / فعال‌سازی»: a code goes to the mobile of the person's Namadno account. */
export const useOrgRequestOtp = () =>
  useMutation({ mutationFn: (v: { nationalId: string }) => post<{ sent: boolean; ttl: number; mobile: string; devCode?: string }>('/org/auth/otp', v) });

/** Sets the Namadno account password (also used in the app), activates an invited panel member, and signs in. */
export const useOrgResetPassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { nationalId: string; code: string; password: string }) => post<Session>('/org/auth/password/reset', v),
    onSuccess: (s) => { setSession(s, 'org_admin'); qc.removeQueries({ queryKey: qk.org.all }); },
  });
};

export const useOpLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; password: string; otp?: string }) => post<Session>('/op/auth/login', v),
    onSuccess: (s) => { setSession(s, 'operator'); qc.removeQueries({ queryKey: qk.op.all }); },
  });
};
