'use client';
/** Operator console — organizations & contracts (design: op-organizations): status filters, table, contract drawer. */
import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import Link from 'next/link';
import type { LockType, Organization } from '@/types/domain';
import { useOpFunds, useOpOrganizations, useOpProducts } from '@/api/op';
import { useOrgContracts, type OrgContractExt } from '@/api/op-core-extra';
import { PageHeading } from '@/components/panel/PanelShell';
import { Icon } from '@/components/ui/Icon';
import { LockBar } from '@/components/ui/LockBar';
import { ContractEditor, VersionList } from '@/components/op/core/ContractEditor';
import { ICON, LOCK_COL, Modal, ModalTitle, ORG_STATUS, PRODUCT_META, PanelState, TILES, fb, orgProducts, pctFa, splitPct } from '@/components/op/core/ui';
import { faDigits, jDate } from '@/lib/format';
import { LOCK_META } from '@/lib/locks';
import { routes } from '@/lib/routes';

type Filter = 'all' | Organization['status'];
const ORDER: Filter[] = ['all', 'active', 'onboarding', 'suspended'];
const GRID = 'minmax(0, 1fr) 76px 52px 100px 80px 72px 20px';

export default function OpOrganizationsPage() {
  const orgsQ = useOpOrganizations();
  const contracts = useOrgContracts();
  const fundsQ = useOpFunds();
  const products = useOpProducts();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  const all = useMemo(() => orgsQ.data ?? [], [orgsQ.data]);
  const cx = contracts.data ?? {};
  const counts = { active: 0, onboarding: 0, suspended: 0 } as Record<Organization['status'], number>;
  all.forEach((o) => { counts[o.status] += 1; });
  const filtered = all.filter((o) => (filter === 'all' || o.status === filter) && (!q.trim() || o.name.includes(q.trim()) || o.contractNo.toLowerCase().includes(q.trim().toLowerCase())));
  const rows = more ? filtered : filtered.slice(0, 6);
  const sel = all.find((o) => o.id === selId) ?? filtered[0] ?? all[0];
  const selExt = sel ? cx[sel.id] : undefined;
  const monthsOptions = products.data?.find((p) => p.kind === 'loan')?.monthsOptions ?? [3, 6, 12, 18];
  const pick = (f: Filter) => { setFilter(f); setMore(false); };

  const stats: { key: Organization['status']; title: string; d: string; bg: string; fg: string }[] = [
    { key: 'active', title: 'قرارداد فعال', d: ICON.check, bg: 'var(--soft-success)', fg: 'var(--success-text)' },
    { key: 'onboarding', title: 'در حال عقد', d: ICON.pen, bg: 'var(--soft-info)', fg: 'var(--info-text)' },
    { key: 'suspended', title: 'معلق', d: ICON.pause, bg: 'var(--soft-error)', fg: 'var(--error-text)' },
  ];

  return (
    <div style={{ flex: 1, minHeight: 0, margin: -24, display: 'flex', flexDirection: 'row' }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, boxSizing: 'border-box', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        <PageHeading title="سازمان‌ها و قراردادها" crumbs={[{ label: 'بهره‌بردار', href: routes.op.overview }, { label: 'عملیات' }, { label: 'سازمان‌ها' }]}>
          <Link href={routes.op.orgNew} className="btnp" style={{ fontSize: 14 }}><Icon d={ICON.plus} size={18} strokeWidth={2} />افزودن سازمان</Link>
        </PageHeading>

        <div style={{ height: 72, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {stats.map((s) => {
            const on = filter === s.key;
            return (
              <button key={s.key} type="button" className="card" aria-pressed={on} onClick={() => pick(on ? 'all' : s.key)} style={{ boxSizing: 'border-box', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', color: 'inherit', textAlign: 'right', cursor: 'pointer', outline: on ? '2px solid var(--primary-main)' : 'none', outlineOffset: -2 }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, background: s.bg, color: s.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={s.d} size={20} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, gap: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.title}</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}><span className="num" style={{ fontSize: 22 }}>{orgsQ.data ? faDigits(counts[s.key]) : '…'}</span><span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>سازمان</span></span>
                </span>
              </button>
            );
          })}
        </div>

        {orgsQ.isLoading ? <PanelState loading height={380} /> : orgsQ.isError ? <PanelState error={orgsQ.error} onRetry={() => orgsQ.refetch()} /> : (
          <div className="card" style={{ flex: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 56, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="org-search" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', color: 'var(--text-secondary)', cursor: 'text' }}>
                <Icon d={ICON.search} size={18} />
                <input id="org-search" value={q} onChange={(e) => { setQ(e.target.value); setMore(false); }} placeholder="جستجوی نام سازمان یا کد قرارداد" style={{ flex: 1, minWidth: 0, height: 34, border: 0, background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, outline: 0 }} />
                {q && <button type="button" className="ibtn" aria-label="پاک کردن جستجو" onClick={() => setQ('')} style={{ width: 24, height: 24 }}><Icon d={ICON.x} size={14} /></button>}
              </label>
              <button type="button" onClick={() => pick(ORDER[(ORDER.indexOf(filter) + 1) % ORDER.length])} aria-label="تغییر فیلتر وضعیت" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px 0 12px', borderRadius: 8, border: '1px solid var(--outline-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                وضعیت: {filter === 'all' ? 'همه' : ORG_STATUS[filter].label}<Icon d={ICON.chevD} size={16} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
            <div style={{ height: 36, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '0 12px', background: 'var(--table-head)', color: 'var(--grey-600)', fontSize: 12, fontWeight: 700 }}>
              <span>سازمان</span><span>قرارداد</span><span>کارکنان</span><span>AUM / قفل</span><span>محصولات</span><span>تمدید</span><span />
            </div>
            {rows.map((o, i) => {
              const on = sel?.id === o.id;
              const st = ORG_STATUS[o.status];
              const e = cx[o.id];
              const sp = e ? splitPct(e.aum, e.locked) : null;
              const prods = orgProducts(o);
              const tile = TILES[all.indexOf(o) % 6] ?? TILES[i % 6];
              return (
                <div key={o.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => setSelId(o.id)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelId(o.id); } }} className="rowbtn" style={{ height: 56, flex: 'none', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '0 12px', borderBottom: '1px dashed var(--divider)', fontSize: 13, background: on ? 'var(--nav-active)' : 'transparent', boxShadow: on ? 'inset -3px 0 0 var(--primary-main)' : 'none' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: tile[0], color: tile[1], display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{o.logoLetter}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
                      <span className="num" dir="ltr" style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right' }}>{o.contractNo}</span>
                    </span>
                  </span>
                  <span><span className="lbl" style={{ height: 22, padding: '0 6px', fontSize: 11, background: st.bg, color: st.fg }}>{st.label}</span></span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 400 }}>{faDigits(o.employees)}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <span className="num" style={{ fontSize: 13, fontWeight: 400, whiteSpace: 'nowrap' }}>{e && e.aum > 0 ? fb(e.aum) + ' میلیارد' : '—'}</span>
                    {e && e.aum > 0 && sp && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 44, flex: 'none' }}><LockBar free={sp.free} locked={e.locked} height={4} /></span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{pctFa(sp.lockedPct)} قفل</span>
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {prods.map((k) => {
                      const p = PRODUCT_META[k];
                      return <span key={k} title={p.name} aria-label={p.name} style={{ width: 24, height: 24, borderRadius: '50%', background: p.bg, color: p.fg, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon d={p.d} size={13} strokeWidth={1.8} /></span>;
                    })}
                    {!prods.length && <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>—</span>}
                  </span>
                  <span className="num" dir="ltr" style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', textAlign: 'right' }}>{o.status === 'onboarding' ? '—' : jDate(o.contractEnd)}</span>
                  <Link href={routes.op.organization(o.id)} aria-label={`صفحه ${o.name}`} onClick={(ev: MouseEvent) => ev.stopPropagation()} style={{ display: 'grid', placeItems: 'center', color: on ? 'var(--primary-text)' : 'var(--text-disabled)' }}><Icon d={ICON.chevL} size={16} /></Link>
                </div>
              );
            })}
            {!filtered.length && <div style={{ height: 72, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>{q ? 'سازمانی با این جستجو پیدا نشد' : 'سازمانی با این وضعیت نیست'}</div>}
            <div style={{ height: 48, flex: 'none', boxSizing: 'border-box', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>{filter === 'all' && !q ? `نمایش ${faDigits(rows.length)} از ${faDigits(all.length)} سازمان` : filter !== 'all' ? `${faDigits(filtered.length)} سازمان با وضعیت «${ORG_STATUS[filter].label}»` : `${faDigits(filtered.length)} سازمان پیدا شد`}</span>
              {filtered.length > 6 && <button type="button" className="btnt" onClick={() => setMore((m) => !m)} style={{ marginRight: 'auto', height: 32 }}>{more ? 'نمایش کمتر' : `نمایش ${faDigits(filtered.length - 6)} سازمان دیگر`}</button>}
            </div>
          </div>
        )}
      </div>

      <aside className="glass" aria-label="قرارداد سازمان انتخاب‌شده" style={{ width: 380, flex: 'none', boxSizing: 'border-box', border: 0, borderRight: '1px solid var(--glass-edge)', boxShadow: 'var(--shadow-dropdown)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {!sel || !selExt || !fundsQ.data ? (
          <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[40, 90, 220, 180].map((h, i) => <div key={i} style={{ height: h, borderRadius: 12, background: 'var(--bg-neutral)' }} />)}
          </div>
        ) : (
          <ContractEditor
            key={sel.id}
            org={sel}
            ext={selExt}
            funds={fundsQ.data}
            monthsOptions={monthsOptions}
            onHistory={() => setHistory(true)}
            header={(dirty) => <DrawerHeader org={sel} ext={selExt} dirty={dirty} tile={TILES[all.indexOf(sel) % 6] ?? TILES[0]} />}
          />
        )}
      </aside>

      {sel && selExt && (
        <Modal open={history} onClose={() => setHistory(false)} label="تاریخچه نسخه‌های قرارداد" width={540} radius={24} padding={24}>
          <ModalTitle title={`تاریخچه نسخه‌های قرارداد — ${sel.name}`} onClose={() => setHistory(false)} />
          <VersionList ext={selExt} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" className="btno" onClick={() => setHistory(false)}>بستن</button></div>
        </Modal>
      )}
    </div>
  );
}

function DrawerHeader({ org, ext, dirty, tile }: { org: Organization; ext: OrgContractExt; dirty: boolean; tile: [string, string] }) {
  const st = ORG_STATUS[org.status];
  const sp = splitPct(ext.aum, ext.locked);
  const types = (Object.entries(ext.lockByType) as [LockType, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ minHeight: 28, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: tile[0], color: tile[1], display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{org.logoLetter}</span>
          <h6 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Link href={routes.op.organization(org.id)} style={{ color: 'inherit' }}>قرارداد — {org.name}</Link>
          </h6>
          <span className="num" dir="ltr" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{org.contractNo}</span>
        </div>
        <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
          <span className="lbl" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
          <span>تمدید: <span className="num" dir="ltr" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{org.status === 'onboarding' ? '—' : jDate(org.contractEnd)}</span></span>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-disabled)' }} />
          <span>نسخه {faDigits(ext.version)}</span>
          {dirty && <span className="lbl" style={{ height: 20, padding: '0 6px', fontSize: 11, background: 'var(--soft-warning)', color: 'var(--warning-text)' }}>ذخیره‌نشده</span>}
        </div>
      </div>
      {ext.aum > 0 && (
        <div style={{ boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, background: 'var(--bg-neutral)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>دارایی قفل‌شده کارکنان</span>
            <span className="num" style={{ marginRight: 'auto', fontSize: 18 }}>{fb(ext.locked)}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>میلیارد · {pctFa(sp.lockedPct)} از AUM</span>
          </div>
          <LockBar free={sp.free} locked={ext.locked} />
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11, color: 'var(--text-secondary)' }}>
            {types.map(([k, v]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: `var(${LOCK_COL[k]})` }} />{LOCK_META[k].short} <span className="num" style={{ color: 'var(--text-primary)' }}>{fb(v)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
