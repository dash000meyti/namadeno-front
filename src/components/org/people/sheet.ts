/**
 * Minimal spreadsheet reader for the employee import (no dependencies):
 *  - CSV / TSV (UTF-8, optional BOM, quoted fields)
 *  - XLSX: reads the first worksheet via the browser's DecompressionStream('deflate-raw').
 * Returns rows of trimmed cell strings.
 */

export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) return parseCsv(await file.text());
  throw new Error('فقط فایل XLSX یا CSV پشتیبانی می‌شود.');
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/)[0] ?? '';
  const delim = (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Record<string, string>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('فایل XLSX معتبر نیست.');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + csize);
    const bytes = method === 0 ? raw : method === 8 ? await inflate(raw) : null;
    if (bytes) out[name] = dec.decode(bytes);
  }
  return out;
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return letters.split('').reduce((s, c) => s * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  if (typeof DecompressionStream === 'undefined') throw new Error('مرورگر شما از خواندن XLSX پشتیبانی نمی‌کند؛ فایل را با قالب CSV ذخیره کنید.');
  const files = await unzip(buf, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('برگه‌ای در فایل پیدا نشد.');
  const parser = new DOMParser();
  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const sdoc = parser.parseFromString(files['xl/sharedStrings.xml'], 'application/xml');
    Array.from(sdoc.getElementsByTagName('si')).forEach((si) => shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')));
  }
  const doc = parser.parseFromString(files[sheetName], 'application/xml');
  const rows: string[][] = [];
  Array.from(doc.getElementsByTagName('row')).forEach((r) => {
    const row: string[] = [];
    Array.from(r.getElementsByTagName('c')).forEach((c, i) => {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : i;
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val = v;
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent ?? '').join('');
      while (row.length < idx) row.push('');
      row[idx] = val.trim();
    });
    if (row.some((x) => x)) rows.push(row);
  });
  return rows;
}
