'use client';
/**
 * The two rial treasuries, shown like funds — first — on /op/funds and in the command center:
 *   «ریال»      users' rial wallets, organizations' free balances and Namadno's free rial (orders to funds are paid when
 *              recorded, so no cash is tied in orders)
 *   «ریال رزرو» money of sent packages waiting for recipients (blocked); the part whose deposit receipt is not approved
 *              yet waits in the queue (not here) until its receipt is approved — receipts have no due date
 * Namadno's free rial is never negative: users' sales it cannot pay wait in the queue («فروش در صف واریز») and the
 * treasury reads «نیاز به تأمین ریال» (state need_buy) until rial is raised (e.g. a redemption).
 * Here: their state (filters + pills), the cells of the stock table, the bank waterfall, the «خزانه‌ی ریالی» inspector
 * and the rows of the CSV / printable reports. Data: `RialTreasury` (GET /op/treasury/rial or `summary.rial`).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useOpOrganizations } from '@/api/op';
import { useRialMoves, useStockQueue, type RialTreasury, type RialTreasuryId, type StockState } from '@/api/op-treasury-extra';
import {
  Allocation, Ava, Ident, Inspector, KV, KeyStats, List, ListRow, Meter, Note, Pill, Section, Tile, Who, type Tone,
} from '@/components/panel/kit';
import { Icon } from '@/components/ui/Icon';
import { ORG_RIAL, RIAL_MOVE, RIAL_UI, STOCK_STATE, TI, amt, isNeed } from '@/components/op/treasury/ui';
import { dayTime } from '@/components/op/system/fmt';
import { OpLabel, bnOr, samt, sbn } from '@/components/op/funds/stock';
import { QueueList } from '@/components/op/funds/queue';
import { faDigits } from '@/lib/format';
import { routes } from '@/lib/routes';

export const RIAL_IDS: RialTreasuryId[] = ['rial', 'rial_reserve'];

/** Short subline of each treasury in tables and lists. */
export const RIAL_SHORT_SUB: Record<RialTreasuryId, string> = {
  rial: 'کیف پول کاربران و حساب سازمان‌ها',
  rial_reserve: 'بسته‌های در انتظار دریافت',
};

const RIAL_NEED_HINT = 'فروش کاربران در صف واریز است؛ ریال آزاد نمادنو باید تأمین شود';
/** Same labels as the fund stock (need_buy reads «نیاز به تأمین ریال»), hints written for Namadno's free rial. */
const RIAL_HINT: Record<StockState, string> = {
  need_buy: RIAL_NEED_HINT,
  /** deprecated alias of need_buy */
  shortfall: RIAL_NEED_HINT,
  below: 'ریال آزاد نمادنو کمتر از حداقل هدف است',
  ok: 'ریال آزاد نمادنو در محدوده‌ی هدف است',
  surplus: 'ریال آزاد نمادنو بیشتر از سقف هدف است',
  inactive: 'غیرفعال',
};

export interface RialStatus { label: string; tone: Tone; hint: string; state: StockState }

/**
 * «ریال»: Namadno's free rial against its target band. Never negative: users' sales it cannot pay wait in the queue →
 * «نیاز به تأمین ریال» (state need_buy).
 */
export function mainStatus(r: RialTreasury): RialStatus {
  const st = r.main.state === 'shortfall' ? 'need_buy' : r.main.state;
  const s = STOCK_STATE[st];
  return { label: isNeed(st) ? 'نیاز به تأمین ریال' : s.label, tone: s.tone, hint: RIAL_HINT[st], state: st };
}

/**
 * «ریال رزرو» is always «متعادل»: a package is sent (and blocked) only when it is paid — one «آزاد» does not cover waits
 * in the queue until its receipt is approved, so nothing here is ever unfunded.
 */
export function reserveStatus(r: RialTreasury): RialStatus {
  void r;
  return { label: 'متعادل', tone: 'success', hint: 'بسته‌ها فقط پس از پرداخت ارسال می‌شوند؛ مبلغ همه‌ی بسته‌های ارسالی در حساب است', state: 'ok' };
}

export const rialStatus = (id: RialTreasuryId, r: RialTreasury) => (id === 'rial' ? mainStatus(r) : reserveStatus(r));

/** Organizations' packages waiting in the queue for their receipt approval (not delivered, not blocked). */
export const queueOf = (r: RialTreasury) => ({
  count: r.byOrg.reduce((s, a) => s + (a.queuedCount ?? 0), 0),
  total: r.byOrg.reduce((s, a) => s + (a.queuedTotal ?? 0), 0),
});

export function RialTile({ id, size }: { id: RialTreasuryId; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const u = RIAL_UI[id];
  return <Tile d={u.d} tone={u.tone} size={size} />;
}

export function RialStatePill({ id, r }: { id: RialTreasuryId; r: RialTreasury }) {
  const s = rialStatus(id, r);
  return <Pill tone={s.tone} dot title={s.hint}>{s.label}</Pill>;
}

// ───────────────────────── stock table cells ─────────────────────────

/** Column keys of the stock table on /op/funds. */
export type StockCol = 'fund' | 'nav' | 'held' | 'alloc' | 'res' | 'com' | 'free' | 'cov' | 'st';

/**
 * One cell of a rial row in the stock table. Mapping: «ریال» — تخصیص = users' wallets, رزرو = their reserved part,
 * تعهد = organizations' money (free + set aside for queued packages), آزاد = Namadno's free rial (in buy orders underneath),
 * پوشش = free rial vs the target minimum. «ریال رزرو» — تعهد = blocked for sent packages (always paid), the queue underneath.
 */
export function RialCell({ col, id, r }: { col: StockCol; id: RialTreasuryId; r: RialTreasury }): ReactNode {
  const m = r.main;
  const v = r.reserve;
  const main = id === 'rial';
  const dash = bnOr(0);
  switch (col) {
    case 'fund':
      return <Ident lead={<RialTile id={id} />} title={RIAL_UI[id].name} sub={RIAL_SHORT_SUB[id]} />;
    case 'nav':
      return dash;
    case 'held':
      return <span className="num" style={{ fontWeight: 600 }}>{bnOr(main ? m.held : v.held)}</span>;
    case 'alloc':
      return main ? <span className="num" title="کیف پول کاربران">{bnOr(m.users)}</span> : dash;
    case 'res':
      return main ? <span className="num mute" title="رزرو کیف پول کاربران">{bnOr(m.usersReserved)}</span> : dash;
    case 'com':
      return <span className="num mute" title={main ? 'حساب سازمان‌ها: آزاد و کنار گذاشته برای بسته‌های در صف' : 'بلاک‌شده برای بسته‌های ارسالی'}>{bnOr(main ? m.orgFree + (m.orgSetAside ?? 0) : v.blocked)}</span>;
    case 'free': {
      if (main) {
        return (
          <>
            <span className="num" style={{ fontWeight: 600 }} title="ریال آزاد نمادنو">{sbn(Math.max(0, m.available))}</span>
            {(m.needValue ?? 0) > 0 && <span className="sm" style={{ color: 'var(--error-text)' }} title="فروش کاربران در صف واریز">نیاز <span className="num">{sbn(m.needValue)}</span></span>}
          </>
        );
      }
      // «ریال رزرو» has no free part: it holds exactly the sent packages' money
      const q = queueOf(r);
      return (
        <>
          {dash}
          {q.count > 0 && <span className="sm">{faDigits(q.count)} بسته در صف</span>}
        </>
      );
    }
    case 'cov': {
      const s = rialStatus(id, r);
      if (main) {
        const min = m.target?.minFreeValue;
        if (!min) return dash;
        return (
          <>
            <span className="num"><span className="sm">حداقل </span>{sbn(min)}</span>
            <Meter value={Math.max(0, m.available) / min} tone={s.tone} width={72} thin label={`ریال آزاد ${amt(Math.max(0, m.available))} از حداقل ${amt(min)} تومان`} />
          </>
        );
      }
      return dash;
    }
    case 'st':
      return <RialStatePill id={id} r={r} />;
    default:
      return null;
  }
}

// ───────────────────────── bank waterfall ─────────────────────────

const COL = {
  users: 'var(--chart-1)',
  orgFree: 'var(--warning-main)',
  setAside: 'var(--warning-light)',
  reserve: `var(${RIAL_UI.rial_reserve.col})`,
  queue: 'var(--error-main)',
  free: 'var(--chart-2)',
};

/**
 * «موجودی حساب بانکی» − کیف پول کاربران − حساب آزاد سازمان‌ها − کنار گذاشته برای بسته‌های در صف − ریال رزرو
 * = ریال آزاد نمادنو (never negative). With users' sales waiting for rial: − فروش در صف واریز =
 * ریال آزاد پس از صف, or «نیاز به تأمین ریال» when the queue is larger.
 * `bar` adds the shares bar above; `unit` writes «تومان» after each amount.
 */
export function BankWaterfall({ r, bar, unit }: { r: RialTreasury; bar?: boolean; unit?: boolean }) {
  const m = r.main;
  const free = Math.max(0, m.available);
  const queued = m.queuedValue ?? 0;
  const need = m.needValue ?? 0;
  const a = (n: number, strong?: boolean, tone?: string) => (
    <span className="num" style={{ fontWeight: strong ? 600 : 500, color: tone }}>{n ? `${samt(n)}${unit ? ' تومان' : ''}` : '—'}</span>
  );
  const kv = (
    <KV rows={[
      [<OpLabel key="b" strong>موجودی حساب بانکی</OpLabel>, a(r.bank, true)],
      [<OpLabel key="u" op="−" sub={m.usersReserved > 0 ? `شامل رزرو ${amt(m.usersReserved)}` : undefined}>کیف پول کاربران</OpLabel>, a(m.users)],
      [<OpLabel key="o" op="−">حساب آزاد سازمان‌ها</OpLabel>, a(m.orgFree)],
      ...((m.orgSetAside ?? 0) > 0 ? [[<OpLabel key="q" op="−" sub="از حساب سازمان‌ها، تا تأیید فیش">کنار گذاشته برای بسته‌های در صف</OpLabel>, a(m.orgSetAside)] as [ReactNode, ReactNode]] : []),
      [<OpLabel key="r" op="−">ریال رزرو (بسته‌ها)</OpLabel>, a(r.reserve.held)],
      [<OpLabel key="f" op="=" strong>ریال آزاد نمادنو</OpLabel>, a(free, true)],
      ...(queued > 0 ? [
        [<OpLabel key="q" op="−" sub={`${faDigits(m.queuedCount)} فروش کاربر`}>فروش در صف واریز</OpLabel>, a(queued)] as [ReactNode, ReactNode],
        need > 0
          ? [<OpLabel key="n" op="=" strong sub="با ابطال از صندوق‌ها، فروش‌ها خودکار پرداخت می‌شوند"><span style={{ color: 'var(--error-text)' }}>نیاز به تأمین ریال</span></OpLabel>, a(need, true, 'var(--error-text)')] as [ReactNode, ReactNode]
          : [<OpLabel key="n" op="=" strong>ریال آزاد پس از صف</OpLabel>, a(free - queued, true)] as [ReactNode, ReactNode],
      ] : []),
    ]} />
  );
  if (!bar) return kv;
  return (
    <div className="nm-stack" style={{ gap: 14 }}>
      <Allocation compact items={[
        { label: 'کیف پول کاربران', value: m.users, color: COL.users },
        { label: 'حساب آزاد سازمان‌ها', value: m.orgFree, color: COL.orgFree },
        ...((m.orgSetAside ?? 0) > 0 ? [{ label: 'کنار گذاشته برای بسته‌های در صف', value: m.orgSetAside, color: COL.setAside }] : []),
        { label: 'ریال رزرو', value: r.reserve.held, color: COL.reserve },
        ...(queued > 0 ? [{ label: 'فروش در صف واریز', value: Math.min(queued, free), color: COL.queue }] : []),
        { label: queued > 0 ? 'ریال آزاد پس از صف' : 'ریال آزاد نمادنو', value: Math.max(0, free - queued), color: COL.free },
      ]} />
      {kv}
    </div>
  );
}

/**
 * «ریال رزرو»: blocked for sent packages (always paid), and — outside it — the queue: packages waiting for their receipt
 * approval and the receipts themselves (neither is part of the bank balance or the reserve until approved).
 */
export function ReserveBreakdown({ r }: { r: RialTreasury }) {
  const v = r.reserve;
  const q = queueOf(r);
  const a = (n: number) => <span className="num">{n > 0 ? `${amt(n)} تومان` : '—'}</span>;
  return (
    <div className="nm-stack" style={{ gap: 12 }}>
      <KV rows={[
        [<OpLabel key="b" strong sub="گیرندگانی که بسته را هنوز دریافت نکرده‌اند">بلاک‌شده برای بسته‌های ارسالی</OpLabel>, a(v.blocked)],
        [<OpLabel key="q" sub={ORG_RIAL.queued.sub}>بسته در صف تأیید فیش</OpLabel>, <span key="q" className="num">{q.count > 0 ? `${faDigits(q.count)} بسته · ${amt(q.total)} تومان` : '—'}</span>],
        [<OpLabel key="e" sub={ORG_RIAL.pending.sub}>فیش در انتظار تأیید</OpLabel>, a(v.expected)],
      ]} />
      <span className="mute" style={{ fontSize: 12, lineHeight: 1.7 }}>بسته فقط پس از پرداخت ارسال و بلاک می‌شود؛ بسته‌ی در صف تا تأیید فیش به همکاران نمی‌رسد.</span>
    </div>
  );
}

// ───────────────────────── inspector ─────────────────────────

/** «خزانه‌ی ریالی» — opened from either rial row of the stock table (`focus` = the row clicked). */
export function RialInspector({ focus, r, onClose }: { focus: RialTreasuryId; r: RialTreasury; onClose: () => void }) {
  const orgs = useOpOrganizations();
  const moves = useRialMoves({ limit: 8 });
  const m = r.main;
  const need = (m.queuedCount ?? 0) > 0;
  const queue = useStockQueue('rial');
  const v = r.reserve;
  const letter = (id: string, name: string) => orgs.data?.find((o) => o.id === id)?.logoLetter ?? name.charAt(0);
  const top = [...r.byOrg]
    .filter((a) => a.free + a.blocked + a.pending + (a.queuedTotal ?? 0) > 0)
    .sort((a, b) => b.blocked + b.free - (a.blocked + a.free))
    .slice(0, 5);
  const st = mainStatus(r);
  const mainWeak = isNeed(st.state) || st.state === 'below';

  const bank = (
    <Section key="bank" title="تفکیک حساب بانکی"><BankWaterfall r={r} bar unit /></Section>
  );
  const reserve = (
    <Section key="reserve" title="ریال رزرو"><ReserveBreakdown r={r} /></Section>
  );

  return (
    <Inspector
      open onClose={onClose} title="خزانه‌ی ریالی" label={`خزانه‌ی ریالی — ${RIAL_UI[focus].name}`}
      footer={<Link href={routes.op.cash} className="nm-btn ghost"><Icon d={TI.cash} size={16} />نقدینگی</Link>}
    >
      <Who
        lead={<RialTile id={focus} size="xl" />}
        title={RIAL_UI[focus].name}
        sub={RIAL_UI[focus].sub}
        pills={<RialStatePill id={focus} r={r} />}
      />
      <KeyStats items={[
        ['موجودی بانک', <span key="b" className="num">{amt(r.bank)}</span>],
        (m.needValue ?? 0) > 0
          ? ['نیاز به تأمین ریال', <span key="a" className="num" style={{ color: 'var(--error-text)' }}>{amt(m.needValue)}</span>]
          : ['ریال آزاد نمادنو', <span key="a" className="num">{amt(Math.max(0, m.available))}</span>],
        ['ریال رزرو', <span key="r" className="num">{amt(v.held)}</span>],
      ]} />

      {mainWeak && (
        isNeed(st.state) ? (
          <Note tone="err" icon={TI.wallet} action={<Link href={`${routes.op.funds}?state=need_buy`} className="nm-btn sm text">صف تأمین</Link>}>
            <b style={{ fontWeight: 600 }}>نیاز به تأمین ریال <span className="num">{amt(m.needValue)}</span> تومان</b>
            <span style={{ display: 'block' }}>{faDigits(m.queuedCount)} فروش کاربر در صف واریز است؛ با ابطال از صندوقی که بیش از هدف موجودی دارد ریال آزاد تأمین کنید. فروش‌ها به ترتیب و خودکار پرداخت می‌شوند.</span>
          </Note>
        ) : (
          <Note tone="warn" icon={TI.wallet}>
            {st.hint}{m.target ? ` · حداقل هدف ${amt(m.target.minFreeValue)} تومان` : ''}
          </Note>
        )
      )}
      {v.expected > 0 && (
        <Note tone="info" icon={TI.deposit} action={<Link href={`${routes.op.cash}?status=expected`} className="nm-btn sm text">بررسی فیش‌ها</Link>}>
          فیش واریز به مبلغ {amt(v.expected)} تومان در انتظار تأیید است{queueOf(r).count > 0 ? `؛ ${faDigits(queueOf(r).count)} بسته پس از تأیید ارسال می‌شود` : ''}
        </Note>
      )}

      {focus === 'rial_reserve' ? [reserve, bank] : [bank, reserve]}

      {need && (
        <Section title="فروش‌های در صف واریز" action={<span className="num mute">{faDigits(m.queuedCount)} مورد</span>}>
          <QueueList items={queue.data} loading={queue.isLoading} />
        </Section>
      )}

      {m.target && (
        <Section title="ریال آزاد در برابر هدف">
          <Meter value={m.target.minFreeValue ? Math.max(0, m.available) / m.target.minFreeValue : 1} tone={st.tone}
            label={`ریال آزاد ${amt(Math.max(0, m.available))} از حداقل ${amt(m.target.minFreeValue)} تومان`} />
          <KV rows={[
            ['حداقل ریال آزاد', <span key="n" className="num">{amt(m.target.minFreeValue)} تومان</span>],
            ['سقف ریال آزاد', m.target.maxFreeValue ? <span key="x" className="num">{amt(m.target.maxFreeValue)} تومان</span> : <span key="x" className="mute">تعیین نشده</span>],
          ]} />
        </Section>
      )}

      <Section title="حساب ریالی سازمان‌ها" action={<Link className="nm-more" href={routes.op.organizations}>همه</Link>}>
        {top.length ? (
          <List>
            {top.map((a) => (
              <ListRow key={a.orgId} href={routes.op.organization(a.orgId)}
                label={`${a.orgName}: آزاد ${amt(a.free)}، بلاک‌شده ${amt(a.blocked)}${a.pending > 0 ? `، فیش در انتظار تأیید ${amt(a.pending)}` : ''} تومان`}
                lead={<Ava letter={letter(a.orgId, a.orgName)} id={a.orgId} sq size="sm" />}
                title={a.orgName}
                sub={<>آزاد <span className="num">{amt(a.free)}</span> · بلاک <span className="num">{amt(a.blocked)}</span></>}
                trail={a.pending > 0
                  ? <Pill tone={ORG_RIAL.pending.tone} title={ORG_RIAL.pending.sub}>فیش در انتظار <span className="num">{amt(a.pending)}</span></Pill>
                  : a.queuedCount > 0 ? <Pill tone={ORG_RIAL.queued.tone} title={ORG_RIAL.queued.sub}><span className="num">{faDigits(a.queuedCount)}</span> بسته در صف</Pill>
                    : undefined}
              />
            ))}
          </List>
        ) : <span className="mute" style={{ fontSize: 12.5 }}>هیچ سازمانی مانده‌ی ریالی ندارد</span>}
      </Section>

      <Section title="گردش ریالی اخیر">
        {moves.isLoading ? <span className="mute" style={{ fontSize: 12.5 }}>در حال بارگذاری…</span>
          : (moves.data ?? []).length ? (
            <List>
              {(moves.data ?? []).map((x) => {
                const k = RIAL_MOVE[x.kind];
                return (
                  <ListRow key={x.id}
                    label={`${k.label}: ${x.from} به ${x.to}، ${amt(x.amount)} تومان`}
                    lead={<Tile d={k.d} tone={k.tone} size="sm" />}
                    title={k.label}
                    sub={<>{x.from}<Icon d={TI.chevL} size={11} style={{ margin: '0 3px', verticalAlign: '-1px' }} />{x.to} · <span className="num">{dayTime(x.at)}</span></>}
                    trail={<span className="num">{amt(x.amount)}</span>}
                  />
                );
              })}
            </List>
          ) : <span className="mute" style={{ fontSize: 12.5 }}>گردش ریالی‌ای ثبت نشده است</span>}
      </Section>
    </Inspector>
  );
}

// ───────────────────────── report rows ─────────────────────────

type Cell = string | number;

/**
 * «خزانه‌ی ریالی» block of the stock CSV / printable report: header + «ریال» + «ریال رزرو» + the bank total.
 * `n` formats amounts (raw for CSV, compact for print); `blank` fills cells that do not apply.
 */
export function rialReportRows(r: RialTreasury, n: (v: number) => Cell, blank: Cell = ''): Cell[][] {
  const m = r.main;
  const v = r.reserve;
  return [
    ['خزانه', 'موجودی', 'کیف پول کاربران', 'رزرو کیف پول‌ها', 'حساب آزاد سازمان‌ها', 'کنار گذاشته برای بسته‌های در صف', 'بلاک‌شده برای بسته‌ها', 'فیش در انتظار تأیید', 'آزاد', 'فروش در صف واریز', 'نیاز به تأمین ریال', 'وضعیت'],
    [RIAL_UI.rial.name, n(m.held), n(m.users), n(m.usersReserved), n(m.orgFree), n(m.orgSetAside ?? 0), blank, blank, n(Math.max(0, m.available)), n(m.queuedValue ?? 0), n(m.needValue ?? 0), mainStatus(r).label],
    [RIAL_UI.rial_reserve.name, n(v.held), blank, blank, blank, blank, n(v.blocked), blank, blank, blank, blank, reserveStatus(r).label],
    ['حساب بانکی (جمع)', n(r.bank), n(m.users), n(m.usersReserved), n(m.orgFree), n(m.orgSetAside ?? 0), n(v.blocked), n(v.expected), blank, blank, blank, blank],
  ];
}
