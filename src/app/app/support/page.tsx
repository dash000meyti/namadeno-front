'use client';
/** «پشتیبانی» (design: app-support) — tutorial video mock, chat / call actions, tickets with history sheets, FAQ. */
import { useEffect, useRef, useState } from 'react';
import { useCreateTicket, useFaq, useMe, useSendTicketMessage, useTickets } from '@/api/app';
import { AppHeader } from '@/components/app/AppHeader';
import { BottomNav } from '@/components/app/BottomNav';
import { ErrorState, Scr, Skeleton } from '@/components/app/Screen';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { P } from '@/components/app/core/meta';
import { errMsg } from '@/components/app/core/ui';
import { faDigits, jDate, jDayMonth, time } from '@/lib/format';
import { now } from '@/lib/clock';
import { routes } from '@/lib/routes';
import type { Ticket, TicketMessage } from '@/types/domain';

const DUR = 165; // tutorial length in seconds (۲:۴۵)
const mmss = (x: number) => `${faDigits(Math.floor(x / 60))}:${faDigits(String(x % 60).padStart(2, '0'))}`;

export default function SupportPage() {
  const tickets = useTickets();
  const faq = useFaq();
  const [sheet, setSheet] = useState<{ mode: 'chat' } | { mode: 'ticket'; id: string } | null>(null);

  // tutorial video mock: play/pause, progress ticks every second
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setT((x) => { if (x + 1 >= DUR) { setPlaying(false); return 0; } return x + 1; }), 1000);
    return () => clearInterval(iv);
  }, [playing]);

  const [faqOpen, setFaqOpen] = useState(0);
  const [query, setQuery] = useState('');
  const faqItems = (faq.data ?? []).filter((f) => !query.trim() || f.q.includes(query.trim()) || f.a.includes(query.trim()));
  const list = tickets.data ?? [];
  const openCount = list.filter((x) => x.status === 'open').length;

  return (
    <>
      <Scr gap={12}>
        {/* page tutorial video */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>ویدئوی آموزش این صفحه</span>
          <button className="card" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'توقف ویدئوی آموزش' : 'پخش ویدئوی آموزش این صفحه'} style={{ width: '100%', boxSizing: 'border-box', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
            <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #3A47CD 0%, #4686A6 60%, #55B08C 100%)', overflow: 'hidden' }}>
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(260px 160px at 80% 10%, rgb(255 255 255 / .22), transparent 70%), radial-gradient(200px 140px at 10% 100%, rgb(20 24 38 / .35), transparent 70%)' }} />
              <span aria-hidden="true" style={{ position: 'absolute', left: 28, top: 22, width: 78, height: 150, boxSizing: 'border-box', borderRadius: 16, border: '3px solid rgb(255 255 255 / .85)', background: 'rgb(255 255 255 / .16)', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 8px' }}>
                <span style={{ height: 8, width: '60%', borderRadius: 4, background: 'rgb(255 255 255 / .8)' }} />
                <span style={{ height: 30, borderRadius: 6, background: 'rgb(255 255 255 / .35)' }} />
                <span style={{ height: 6, width: '80%', borderRadius: 3, background: 'rgb(255 255 255 / .55)' }} />
                <span style={{ height: 6, width: '70%', borderRadius: 3, background: 'rgb(255 255 255 / .55)' }} />
                <span style={{ height: 6, width: '50%', borderRadius: 3, background: 'rgb(255 255 255 / .55)' }} />
              </span>
              <span style={{ position: 'absolute', right: 16, top: 16, maxWidth: 200, display: 'flex', flexDirection: 'column', gap: 4, color: '#FFFFFF' }}>
                <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>راهنمای پشتیبانی نمادنو</span>
                <span style={{ fontSize: 12, lineHeight: 1.7, opacity: 0.85 }}>پرسش‌ها، تماس و پیگیری درخواست‌ها</span>
              </span>
              <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: 56, height: 56, margin: '-28px 0 0 -28px', borderRadius: '50%', background: 'rgb(255 255 255 / .92)', color: '#3A47CD', display: 'grid', placeItems: 'center', boxShadow: '0 8px 24px rgb(20 24 38 / .3)' }}>
                {playing ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ marginLeft: 3 }}><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
                )}
              </span>
              <span className="num" style={{ position: 'absolute', right: 12, bottom: 12, height: 22, padding: '0 8px', borderRadius: 6, background: 'rgb(20 24 38 / .6)', color: '#FFFFFF', fontSize: 11, fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
                {playing || t ? `${mmss(t)} از ${mmss(DUR)}` : mmss(DUR)}
              </span>
              <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgb(255 255 255 / .25)' }}>
                <span style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${Math.round((t / DUR) * 1000) / 10}%`, background: '#FFFFFF', transition: 'width .4s linear' }} />
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
              <Icon d="M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M17 10l5-3v10l-5-3" size={18} style={{ color: 'var(--primary-text)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>آموزش کامل صفحه پشتیبانی</span>
              <span className="num" style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{mmss(DUR)} دقیقه</span>
            </span>
          </button>
        </div>

        <div style={{ height: 48, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 'none' }}>
          <button className="btn" onClick={() => setSheet({ mode: 'chat' })} aria-haspopup="dialog" style={{ height: 48, background: 'var(--primary-main)', color: 'var(--primary-contrast)', boxShadow: 'var(--shadow-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0 }}>
            <Icon d={P.chat} size={18} />گفتگو با پشتیبانی
          </button>
          <a href="tel:02191000000" className="btn num" style={{ height: 48, boxSizing: 'border-box', border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 0, fontWeight: 600, textDecoration: 'none' }}>
            <Icon d={P.phone} size={18} />تماس <span dir="ltr">۰۲۱-۹۱۰۰۰۰۰۰</span>
          </a>
        </div>
        <span style={{ height: 16, fontSize: 11, color: 'var(--text-secondary)', lineHeight: '16px', textAlign: 'center', flex: 'none' }}>پاسخ‌گویی شنبه تا چهارشنبه ۸ تا ۱۸ · پنجشنبه ۸ تا ۱۳</span>

        {/* tickets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>درخواست‌های من</span>
            {openCount > 0 && <span className="lbl" style={{ marginRight: 8, height: 22, background: 'var(--soft-default)', color: 'var(--default-text)' }}>{faDigits(openCount)}</span>}
          </div>
          {tickets.isLoading ? (
            <Skeleton h={192} />
          ) : tickets.isError ? (
            <ErrorState message="دریافت درخواست‌ها ممکن نشد" onRetry={() => tickets.refetch()} />
          ) : list.length === 0 ? (
            <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>هنوز درخواستی ثبت نکرده‌اید.</div>
          ) : (
            <div className="card" style={{ boxSizing: 'border-box', padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
              {list.map((tk, i) => {
                const v = ticketVisual(tk);
                return (
                  <button key={tk.id} onClick={() => setSheet({ mode: 'ticket', id: tk.id })} aria-haspopup="dialog" style={{ width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: 0, border: 0, borderBottom: `1px dashed ${i === list.length - 1 ? 'transparent' : 'var(--divider)'}`, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'right', cursor: 'pointer' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: v.iconBg, color: v.iconFg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={P.ticket} size={18} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.4 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tk.subject}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>تیکت <span className="num">{tk.id}</span> · {jDayMonth(tk.createdAt)}{v.extra}</span>
                    </span>
                    <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: v.stBg, color: v.stFg, whiteSpace: 'nowrap' }}>{v.status}</span>
                    <Icon d={P.chevLeft} size={18} style={{ color: 'var(--text-disabled)' }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label style={{ height: 48, boxSizing: 'border-box', padding: '0 12px', borderRadius: 12, border: '1px solid var(--outline-border)', background: 'var(--bg-paper)', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5" size={20} style={{ color: 'var(--text-secondary)' }} />
          <input type="search" placeholder="جست‌وجو در راهنما، مثلاً «قفل زمانی»" aria-label="جست‌وجو در راهنما" value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setFaqOpen(0); }}
            style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, outline: 'none', padding: 0 }} />
        </label>

        {/* FAQ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <span style={{ height: 24, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>پرسش‌های پرتکرار</span>
          {faq.isLoading ? (
            <Skeleton h={250} />
          ) : faqItems.length === 0 ? (
            <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.7 }}>
              نتیجه‌ای برای «{query}» پیدا نشد. از «گفتگو با پشتیبانی» بپرسید.
            </div>
          ) : (
            <div className="card" style={{ boxSizing: 'border-box', padding: '0 14px', display: 'flex', flexDirection: 'column' }}>
              {faqItems.map((f, i) => {
                const on = i === faqOpen;
                return (
                  <div key={f.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: `1px dashed ${i === faqItems.length - 1 ? 'transparent' : 'var(--divider)'}` }}>
                    <button onClick={() => setFaqOpen(on ? -1 : i)} aria-expanded={on} style={{ width: '100%', minHeight: 50, display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', padding: 0, color: 'var(--text-primary)', fontFamily: 'inherit', textAlign: 'start', cursor: 'pointer' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: on ? 700 : 600, lineHeight: 1.6 }}>{f.q}</span>
                      <Icon d={P.chevDown} size={18} style={{ color: 'var(--text-secondary)', transform: `rotate(${on ? 180 : 0}deg)` }} />
                    </button>
                    {on && <span style={{ display: 'block', padding: '0 0 14px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{f.a}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Scr>

      <AppHeader title="پشتیبانی" back={routes.app.profile} />
      <BottomNav active="assets" />

      {sheet && <ChatSheet key={sheet.mode === 'chat' ? 'chat' : sheet.id} target={sheet} tickets={list} onClose={() => setSheet(null)} />}
    </>
  );
}

function ticketVisual(tk: Ticket) {
  const hasFile = tk.messages.some((m) => !!m.attachment);
  const last = tk.messages[tk.messages.length - 1];
  const open = tk.status === 'open';
  return {
    status: open ? 'در حال بررسی' : 'بسته شده',
    stBg: open ? 'var(--soft-warning)' : 'var(--soft-success)',
    stFg: open ? 'var(--warning-text)' : 'var(--success-text)',
    iconBg: open ? 'var(--soft-warning)' : hasFile ? 'var(--soft-success)' : 'var(--soft-default)',
    iconFg: open ? 'var(--warning-text)' : hasFile ? 'var(--success-text)' : 'var(--default-text)',
    extra: hasFile ? ' · گزارش دارد' : open && last?.from === 'agent' ? ' · پاسخ جدید' : '',
  };
}

/** A tiny one-page PDF (ASCII) so the attachment row produces a real downloadable file in the demo. */
function demoPdf(title: string): Blob {
  const text = ('Namadno - ' + title).replace(/[^\x20-\x7E]/g, '').replace(/([()\\])/g, '\\$1');
  const stream = `BT /F1 16 Tf 72 760 Td (${text}) Tj 0 -28 Td (Demo attachment generated by the mock API.) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

function download(name: string, ticketId: string) {
  const url = URL.createObjectURL(demoPdf(`${ticketId} report`));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.pdf') ? name : name + '.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ChatMsg = { id: string; me: boolean; text: string; time: string; who?: string; file?: { name: string; size: string } };

function ChatSheet({ target, tickets, onClose }: { target: { mode: 'chat' } | { mode: 'ticket'; id: string }; tickets: Ticket[]; onClose: () => void }) {
  const toast = useToast();
  const me = useMe();
  const create = useCreateTicket();
  const send = useSendTicketMessage();
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dl, setDl] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isChat = target.mode === 'chat';
  const ticketId = isChat ? chatId : target.id;
  // freshest copy: the list refetches after each mutation, the mutation result is available immediately
  const tk = ticketId
    ? [tickets.find((x) => x.id === ticketId), send.data, create.data]
      .filter((x): x is Ticket => !!x && x.id === ticketId)
      .sort((a, b) => b.messages.length - a.messages.length)[0]
    : undefined;
  const busy = create.isPending || send.isPending;

  const toMsg = (m: TicketMessage): ChatMsg => ({
    id: m.id, me: m.from === 'user', text: m.text, time: time(m.at),
    who: m.from === 'agent' ? 'پشتیبانی نمادنو' : undefined, file: m.attachment,
  });
  const welcome: ChatMsg = { id: 'welcome', me: false, text: `سلام${me.data?.firstName ? ' ' + me.data.firstName + ' جان' : ''}، به پشتیبانی نمادنو خوش آمدید. چطور می‌توانم کمک کنم؟`, time: time(now()), who: 'دستیار نمادنو' };
  const msgs: ChatMsg[] = isChat ? [welcome, ...(tk?.messages ?? []).map(toMsg)] : (tk?.messages ?? []).map(toMsg);
  const report = tk?.messages.find((m) => m.attachment)?.attachment;
  const canReply = isChat || tk?.status === 'open';

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const onError = (e: unknown) => toast(errMsg(e), 'error');
    if (!ticketId) {
      create.mutate({ subject: text.length > 40 ? text.slice(0, 40) + '…' : text, text }, { onSuccess: (t) => { setChatId(t.id); setDraft(''); }, onError });
    } else {
      send.mutate({ id: ticketId, text }, { onSuccess: () => setDraft(''), onError });
    }
  };

  const today = jDate(now());
  const created = tk?.createdAt;
  const dayLabel = !created || jDate(created) === today ? 'امروز' : jDayMonth(created);
  const st = tk && !isChat ? ticketVisual(tk) : undefined;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <button aria-label="بستن" onClick={onClose} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, margin: 0, padding: 0, background: 'rgb(20 24 38 / .45)', cursor: 'pointer' }} />
      <div role="dialog" aria-modal="true" aria-label={isChat ? 'گفتگو با پشتیبانی' : tk?.subject} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '88%', boxSizing: 'border-box', borderRadius: '24px 24px 0 0', background: 'var(--bg-paper)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -12px 32px rgb(20 24 38 / .25)', animation: 'nmInfoUp .3s cubic-bezier(.2,.8,.2,1)' }}>
        <span aria-hidden="true" style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, background: 'var(--grey-400)', marginTop: 8, flex: 'none' }} />
        <div style={{ flex: 'none', padding: '6px 12px 10px 8px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--divider)' }}>
          <span style={{ width: 40, height: 40, borderRadius: '50%', background: isChat ? 'var(--soft-primary)' : st?.iconBg, color: isChat ? 'var(--primary-text)' : st?.iconFg, display: 'grid', placeItems: 'center', flex: 'none', position: 'relative' }}>
            <Icon d={isChat ? P.chat : P.ticket} size={20} />
            {isChat && <span style={{ position: 'absolute', left: 1, bottom: 1, width: 10, height: 10, borderRadius: '50%', background: 'var(--success-main)', boxShadow: '0 0 0 2px var(--bg-paper)' }} />}
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.35 }}>
            <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isChat ? 'گفتگو با پشتیبانی' : tk?.subject}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {isChat ? (chatId ? <>تیکت <span className="num">{chatId}</span> · معمولاً در کمتر از ۵ دقیقه پاسخ می‌دهیم</> : 'معمولاً در کمتر از ۵ دقیقه پاسخ می‌دهیم') : tk ? <>تیکت <span className="num">{tk.id}</span> · ثبت {jDayMonth(tk.createdAt)}</> : ''}
            </span>
          </span>
          {st && <span className="lbl" style={{ height: 22, padding: '0 7px', fontSize: 11, background: st.stBg, color: st.stFg }}>{st.status}</span>}
          <button className="ibtn" aria-label="بستن" onClick={onClose} style={{ width: 36, height: 36, color: 'var(--text-secondary)' }}><Icon d={P.close} size={20} /></button>
        </div>

        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-neutral)' }}>
          <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-secondary)', padding: '2px 10px', borderRadius: 999, background: 'rgb(var(--grey-500-rgb) / .14)' }}>{dayLabel}</span>
          {msgs.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.me ? 'flex-start' : 'flex-end' }}>
              <div style={{ maxWidth: '78%', boxSizing: 'border-box', padding: '8px 12px 6px', borderRadius: m.me ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: m.me ? 'var(--primary-main)' : 'var(--bg-paper)', color: m.me ? 'var(--primary-contrast)' : 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: 'var(--shadow-z1)' }}>
                {!m.me && m.who && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-text)' }}>{m.who}</span>}
                <span style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{m.text}</span>
                {m.file && (
                  <a href="#" onClick={(e: React.MouseEvent) => { e.preventDefault(); download(m.file!.name, tk?.id ?? ''); setDl(true); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, background: 'var(--bg-paper)', color: 'var(--text-primary)', textDecoration: 'none', border: '1px solid var(--outline-border)' }}>
                    <span style={{ width: 36, height: 40, borderRadius: 8, background: 'var(--soft-error)', color: 'var(--error-text)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flex: 'none' }}>PDF</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, lineHeight: 1.3 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.file.name}</span>
                      <span className="num" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.file.size}</span>
                    </span>
                    <Icon d="M12 4v11M8 11l4 4 4-4M4 19h16" size={18} style={{ color: 'var(--primary-text)' }} />
                  </a>
                )}
                <span className="num" style={{ alignSelf: 'flex-end', fontSize: 10.5, opacity: 0.7 }}>{m.time}</span>
              </div>
            </div>
          ))}
          {busy && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: 'var(--bg-paper)', fontSize: 12, color: 'var(--text-secondary)' }}>پشتیبان در حال نوشتن…</span>
            </div>
          )}
        </div>

        {report && tk && (
          <div style={{ flex: 'none', padding: '10px 14px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--soft-success)' }}>
            <Icon d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" size={20} style={{ color: 'var(--success-text)' }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>خروجی گزارش آماده است</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{report.name}</span>
            </span>
            <button onClick={() => { download(report.name, tk.id); setDl(true); }} style={{ height: 34, padding: '0 12px', border: 0, borderRadius: 9, background: 'var(--success-main)', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              {dl ? <>دانلود شد<Icon d={P.check} size={14} strokeWidth={2.2} /></> : 'دانلود'}
            </button>
          </div>
        )}

        {canReply ? (
          <div style={{ flex: 'none', padding: '10px 12px 22px', borderTop: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-paper)' }}>
            <input
              value={draft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') submit(); }}
              placeholder="پیام خود را بنویسید…"
              aria-label="متن پیام"
              style={{ flex: 1, minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 22, border: 0, background: 'var(--bg-neutral)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 'none' }}
            />
            <button className="ibtn" aria-label="پیوست" onClick={() => toast('ارسال پیوست به‌زودی از همین‌جا فعال می‌شود؛ فعلاً فایل را به پیام پشتیبان پاسخ دهید.', 'info')} style={{ width: 40, height: 40, color: 'var(--text-secondary)' }}>
              <Icon d="M20 12l-8 8a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7-7" size={20} />
            </button>
            <button onClick={submit} aria-label="ارسال" disabled={busy || !draft.trim()} style={{ width: 44, height: 44, border: 0, borderRadius: '50%', background: 'var(--primary-main)', color: 'var(--primary-contrast)', display: 'grid', placeItems: 'center', cursor: busy ? 'progress' : 'pointer', boxShadow: 'var(--shadow-primary)', flex: 'none', opacity: !draft.trim() ? 0.6 : 1 }}>
              <Icon d="M20 4L3 11l7 2 2 7zM10 13l10-9" size={20} strokeWidth={2} style={{ transform: 'scaleX(-1)' }} />
            </button>
          </div>
        ) : (
          <div style={{ flex: 'none', padding: '12px 14px 24px', borderTop: '1px solid var(--divider)', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-paper)' }}>
            این تیکت بسته شده است · برای موضوع جدید از «گفتگو با پشتیبانی» استفاده کنید
          </div>
        )}
      </div>
    </div>
  );
}
