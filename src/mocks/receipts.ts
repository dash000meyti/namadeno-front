/**
 * Deposit receipts («فیش واریز») uploaded by organizations (multipart/form-data, field `receipt`).
 * The mock keeps a downscaled image preview as a data URL (≤ 1000px JPEG) so it fits in localStorage; a PDF keeps only
 * its name and size. The real backend stores the file and returns its URL.
 */
import type { ReceiptFile } from '@/api/op-treasury-extra';
import { newId } from './db';

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

export type ReceiptRead = { file: ReceiptFile } | { error: { code: string; message: string } };

const toDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

async function preview(f: File): Promise<string | undefined> {
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined') {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff'; // a transparent PNG becomes a white receipt, not black
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return toDataUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.72 }));
  }
  return f.size < 400_000 ? toDataUrl(f) : undefined;
}

/** Reads the `receipt` field of a form: null when missing, an error for a wrong type / size, else the stored receipt. */
export async function readReceipt(v: FormDataEntryValue | null): Promise<ReceiptRead | null> {
  if (!v || typeof v === 'string') return null;
  const f = v as File;
  if (!RECEIPT_TYPES.includes(f.type)) return { error: { code: 'bad_receipt', message: 'فیش باید تصویر (JPG، PNG یا WEBP) یا فایل PDF باشد.' } };
  if (f.size > RECEIPT_MAX_BYTES) return { error: { code: 'bad_receipt', message: 'حجم فیش حداکثر ۵ مگابایت است.' } };
  const url = f.type.startsWith('image/') ? await preview(f).catch(() => undefined) : undefined;
  return { file: { id: newId('rcp'), name: f.name || 'receipt', type: f.type, size: f.size, url } };
}

/** Form fields of a receipt upload (amount, note, packageId) plus the read receipt. */
export async function readReceiptForm(request: Request) {
  const fd = await request.formData();
  const str = (k: string) => { const x = fd.get(k); return typeof x === 'string' ? x.trim() : ''; };
  return { amount: Number(str('amount').replace(/[^\d.]/g, '')), note: str('note') || undefined, packageId: str('packageId') || undefined, receipt: await readReceipt(fd.get('receipt')) };
}

export const isMultipart = (request: Request) => (request.headers.get('content-type') ?? '').includes('multipart/form-data');
