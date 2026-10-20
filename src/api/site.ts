'use client';
/** Hooks for the public website. */
import { useMutation, useQuery } from '@tanstack/react-query';
import type { BlogPost, FaqItem, Fund } from '@/types/domain';
import { get, post } from './client';
import { qk } from './keys';

export const useBlogPosts = () => useQuery({ queryKey: qk.site.blog, queryFn: () => get<Omit<BlogPost, 'body'>[]>('/public/blog') });
export const useBlogPost = (slug: string) => useQuery({ queryKey: qk.site.post(slug), queryFn: () => get<BlogPost>(`/public/blog/${slug}`), enabled: !!slug });
export const usePublicFunds = () => useQuery({ queryKey: qk.site.funds, queryFn: () => get<Fund[]>('/public/funds') });
export const usePublicFaq = () => useQuery({ queryKey: qk.site.faq, queryFn: () => get<FaqItem[]>('/public/faq') });
export const useContactForm = () => useMutation({ mutationFn: (v: { name: string; phone: string; company?: string; email?: string; topic?: string; employees?: string | number; message?: string }) => post<{ ok: boolean; ticket: string }>('/public/contact', v) });
