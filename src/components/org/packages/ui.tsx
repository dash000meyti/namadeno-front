/** Error text for the org package/report/contract screens. UI comes from the Panel kit (src/components/panel/kit.tsx). */
export const errMsg = (e: unknown, fallback = 'خطا در ارتباط با سرور') => (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' ? (e as { message: string }).message : fallback);
