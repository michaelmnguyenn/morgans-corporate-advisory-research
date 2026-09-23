'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { calculateRaise } from '@/lib/deal-model';
import { similarity, type PrecedentCandidate, PrecedentIndexSchema, UniverseSchema } from '@/lib/precedents';
import type { z } from 'zod';

type Index = z.infer<typeof PrecedentIndexSchema>;
type Universe = z.infer<typeof UniverseSchema>;
type Sheet = { grossM: string; offer: string; reference: string; sharesPreM: string; purpose: string; sourceNote: string };
const storageKey = 'morgans-precedent-worksheets-v1';
const emptySheet: Sheet = { grossM: '', offer: '', reference: '', sharesPreM: '', purpose: '', sourceNote: '' };
const label = (value: string) => value === 'spp' ? 'SPP' : value.charAt(0).toUpperCase() + value.slice(1);
const primary = (row: PrecedentCandidate) => row.documents.find(doc => /rais|placement|entitlement|rights issue/i.test(doc.title) && !/presentation|complete|cleansing|results/i.test(doc.title)) ?? row.documents[0];
const reasons = (selected: PrecedentCandidate, row: PrecedentCandidate) => [selected.sector === row.sector && 'same sector', selected.structure === row.structure && 'same title structure', selected.ticker === row.ticker && 'same issuer'].filter(Boolean).join(' · ');
const numberOrNull = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const fmt = (value: number | null, digits = 1) => value === null ? '—' : new Intl.NumberFormat('en-AU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export default function PrecedentExplorer({ index, universe }: { index: Index; universe: Universe }) {
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('');
  const [structure, setStructure] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [page, setPage] = useState(0);
  const [worksheets, setWorksheets] = useState<Record<string, Sheet>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) setWorksheets(stored);
    } catch { /* A damaged browser-only worksheet should not prevent research. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (selectedId && window.matchMedia('(max-width: 980px)').matches) document.getElementById('worksheet-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedId]);
  const selected = index.candidates.find(row => row.id === selectedId);
  const sheet = selected ? { ...emptySheet, ...worksheets[selected.id] } : emptySheet;
  const model = calculateRaise({ grossM: numberOrNull(sheet.grossM), offer: numberOrNull(sheet.offer), reference: numberOrNull(sheet.reference), sharesPreM: numberOrNull(sheet.sharesPreM), feesPct: null });
  const sectors = [...new Set(universe.companies.map(row => row.sector))].sort();
  const filtered = useMemo(() => index.candidates.filter(row =>
    (!sector || row.sector === sector) && (!structure || row.structure === structure) &&
    `${row.ticker} ${row.company} ${row.documents.map(item => item.title).join(' ')}`.toLowerCase().includes(query.toLowerCase().trim())),
  [index.candidates, query, sector, structure]);
  const related = selected ? [...index.candidates].filter(row => row.id !== selected.id && similarity(selected, row) > 0)
    .sort((a, b) => similarity(selected, b) - similarity(selected, a) || b.lastDate.localeCompare(a.lastDate)).slice(0, 6) : [];
  const shown = filtered.slice(page * 40, (page + 1) * 40);
  const updateFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  const updateSheet = (field: keyof Sheet, value: string) => {
    if (!selected) return;
    const next = { ...worksheets, [selected.id]: { ...sheet, [field]: value } };
    setWorksheets(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Editing still works when browser storage is unavailable. */ }
  };
  const exportSheet = () => {
    if (!selected) return;
    const values = [selected.ticker, selected.company, selected.firstDate, selected.sector, selected.structure, sheet.grossM, sheet.offer, sheet.reference, sheet.sharesPreM, sheet.purpose, sheet.sourceNote, primary(selected).url];
    const headers = ['ticker', 'company', 'first_announcement', 'sector', 'headline_structure', 'gross_proceeds_aud_m', 'offer_price_aud', 'reference_price_aud', 'pre_raise_shares_m', 'purpose', 'source_note', 'source_url'];
    const csv = [headers, values].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `precedent-${selected.ticker}-${selected.firstDate}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return <main className="page precedent-page">
    <header><h1>Morgans Corporate Advisory Research</h1><p className="byline">Michael Nguyen</p>
      <nav><Link href="/" aria-current="page">Precedents</Link><Link href="/today">Daily watch</Link><Link href="/case-studies">Three deal studies</Link></nav></header>
    <section aria-labelledby="precedent-title">
      <h2 id="precedent-title">ASX equity-raising precedents</h2>
      <p className="meta">{index.companyCount} current IOZ holdings · {index.candidates.length} headline groups · {index.checkedCompanyYears}/{index.expectedCompanyYears} company-year archives checked · Since 23 September 2021</p>
      <p className="note">Headline matches are unverified. Open the ASX notices before using any terms as a precedent.</p>
      <details className="precedent-universe"><summary>Browse the {index.companyCount} companies and archive coverage</summary>
        <div className="precedent-universe-list">{index.companies.map(company => <div key={company.ticker}><button type="button" onClick={() => { updateFilter(setQuery, company.ticker); setSector(''); setStructure(''); }}>{company.ticker}</button><span>{company.name}</span><span>{company.sector}</span><span>{company.checkedYears}/6 years · {company.candidateCount} groups · <a href={`https://www.asx.com.au/asx/v2/statistics/announcements.do?asxCode=${company.ticker}&by=asxCode&timeframe=Y&year=${index.generatedAt.slice(0, 4)}`} target="_blank" rel="noreferrer">ASX archive</a></span></div>)}</div>
      </details>
      <div className="precedent-controls"><label>Company or headline<input value={query} onChange={event => updateFilter(setQuery, event.target.value)} placeholder="Ticker, company or filing" /></label>
        <label>Sector<select value={sector} onChange={event => updateFilter(setSector, event.target.value)}><option value="">All sectors</option>{sectors.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Structure in title<select value={structure} onChange={event => updateFilter(setStructure, event.target.value)}><option value="">All structures</option>{['placement', 'entitlement', 'spp', 'mixed', 'other'].map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label></div>
      <p className="daily-status">Showing {shown.length ? page * 40 + 1 : 0}–{Math.min((page + 1) * 40, filtered.length)} of {filtered.length}. Select a row to open its working sheet.</p>
      <div className="precedent-table-scroll"><table className="precedent-table"><thead><tr><th>Date</th><th>Issuer</th><th>Sector</th><th>Headline structure</th><th className="n">Notices</th><th>Research status</th><th>Working sheet</th></tr></thead>
        <tbody>{shown.map(row => <tr key={row.id} className={selectedId === row.id ? 'precedent-selected' : ''}><td>{row.firstDate}</td><td><strong>{row.ticker}</strong><br/><small>{row.company}</small></td><td>{row.sector}</td><td>{label(row.structure)}</td><td className="n">{row.documents.length}</td><td><span className={`precedent-status ${ready && worksheets[row.id] ? 'precedent-status-started' : ''}`}>{ready && worksheets[row.id] ? 'Worksheet started' : 'Headline lead'}</span></td><td><button type="button" onClick={() => setSelectedId(row.id)} aria-label={`Open working sheet for ${row.ticker} ${row.firstDate}`}>{selectedId === row.id ? 'Selected' : 'Review'}</button></td></tr>)}</tbody></table></div>
      {!filtered.length && <p>No headline groups match these filters.</p>}
      {filtered.length > 40 && <div className="precedent-pagination"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(filtered.length / 40)}</span><button type="button" disabled={(page + 1) * 40 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div>}
      {selected && <section className="precedent-worksheet" aria-labelledby="worksheet-title"><div className="precedent-sheet-heading"><div><h3 id="worksheet-title">{selected.company} ({selected.ticker})</h3><p>{selected.firstDate}{selected.lastDate !== selected.firstDate ? ` to ${selected.lastDate}` : ''} · {selected.sector} · {label(selected.structure)} from titles</p></div><button type="button" onClick={() => setSelectedId('')}>Close sheet</button></div>
        <p className="note">Working notes stay in this browser.</p>
        <div className="precedent-sheet-grid"><div><h4>Source announcements</h4><ul className="precedent-docs">{selected.documents.map(doc => <li key={doc.id}><a href={doc.url} target="_blank" rel="noreferrer">{doc.title}</a><span>{doc.date}{doc.priceSensitive ? ' · price sensitive' : ''}</span></li>)}</ul></div>
          <div><h4>Deal terms working sheet</h4><table className="precedent-model narrow"><tbody>
            <tr><th scope="row">Gross proceeds (A$m)</th><td><input aria-label="Gross proceeds in A$ millions" inputMode="decimal" type="number" min="0" step="any" value={sheet.grossM} onChange={event => updateSheet('grossM', event.target.value)} placeholder="From announcement" /></td></tr>
            <tr><th scope="row">Offer price (A$)</th><td><input aria-label="Offer price in A$" inputMode="decimal" type="number" min="0" step="any" value={sheet.offer} onChange={event => updateSheet('offer', event.target.value)} placeholder="From announcement" /></td></tr>
            <tr><th scope="row">Unaffected price (A$)</th><td><input aria-label="Unaffected share price in A$" inputMode="decimal" type="number" min="0" step="any" value={sheet.reference} onChange={event => updateSheet('reference', event.target.value)} placeholder="Check date and source" /></td></tr>
            <tr><th scope="row">Pre-raise shares (m)</th><td><input aria-label="Pre-raise shares in millions" inputMode="decimal" type="number" min="0" step="any" value={sheet.sharesPreM} onChange={event => updateSheet('sharesPreM', event.target.value)} placeholder="Independent share count" /></td></tr>
            <tr className="precedent-formula"><th scope="row">New shares (m)</th><td>{fmt(model?.issuedM ?? null, 2)}</td></tr>
            <tr className="precedent-formula"><th scope="row">Discount to unaffected price</th><td>{model?.discount === null || model?.discount === undefined ? '—' : `${fmt(model.discount)}%`}</td></tr>
            <tr className="precedent-formula"><th scope="row">Non-participant dilution</th><td>{model?.dilution === null || model?.dilution === undefined ? '—' : `${fmt(model.dilution)}%`}</td></tr>
          </tbody></table><label className="precedent-sheet-note">Use of funds<textarea value={sheet.purpose} onChange={event => updateSheet('purpose', event.target.value)} placeholder="Record the company's stated purpose" /></label><label className="precedent-sheet-note">Source and page note<textarea value={sheet.sourceNote} onChange={event => updateSheet('sourceNote', event.target.value)} placeholder="Announcement date, page and share-count source" /></label>
            <button type="button" className="precedent-export" onClick={exportSheet}>Download CSV</button><p className="note">New shares = proceeds ÷ offer price. Dilution = new shares ÷ post-raise shares.</p></div></div>
        <div className="precedent-related"><h4>Similar headline groups</h4>{related.length ? <ol>{related.map(row => <li key={row.id}><button type="button" onClick={() => setSelectedId(row.id)}>{row.ticker} · {row.firstDate} · {reasons(selected, row)}</button><a href={primary(row).url} target="_blank" rel="noreferrer">{primary(row).title}</a></li>)}</ol> : <p>No related groups have been indexed yet.</p>}</div>
      </section>}
    </section>
  </main>;
}
