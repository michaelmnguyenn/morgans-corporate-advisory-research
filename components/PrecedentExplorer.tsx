'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { benchmarkable, comparableFunding, describe as headlineFor, formatAmount, headlineSize, median, purposes, rankComparables, structureName, structureSummary, type Match, type Purpose } from '@/lib/advisory';
import { mainDiscount, type Terms } from '@/lib/terms';
import { financingModel } from '@/lib/decision';
import { instruments, type FundingDeal, type Instrument } from '@/lib/funding';
import type { FundingTerms } from '@/lib/funding-terms';
import type { RaiseMarket } from '@/lib/market-data';
import { PrecedentIndexSchema, UniverseSchema } from '@/lib/precedents';
import type { z } from 'zod';

type Index = z.infer<typeof PrecedentIndexSchema>;
type Universe = z.infer<typeof UniverseSchema>;
type Company = Universe['companies'][number];
type Scope = 'best' | 'sector' | 'purpose' | 'all';

const small = new Set(['and', 'of', 'the', 'for']);
const tidyName = (name: string) => name
  .replace(/\b(LTD|LIMITED|CDI|CORP|PLC|INC\.?|DEF|STAPLED|STAPL|STAPLE|UNITS?|TRUST|CLASS B VOTING CD|CORPO)\b\.?/gi, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase()
  .replace(/\b[a-z][a-z']*/g, (word, offset) => (offset && small.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
  .replace(/\b(Asx|Anz|Agl|Als|Apa|Bhp|Gpt|Igo|Iag|Jb|Nrw|Qbe|Rea|Tpg|Aub|Srg|Nib|Sgh|Car|Pexa|Iress|Pdi|Nxt|Hub24|Eos|Srl|Ifm|Obm|Ioz)\b/g, word => word.toUpperCase());
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function CompanySearch({ companies, value, onChange }: { companies: Company[]; value: Company | undefined; onChange: (ticker: string) => void }) {
  const label = (company?: Company) => (company ? `${company.ticker} · ${tidyName(company.name)}` : '');
  const [query, setQuery] = useState(label(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const typed = query !== label(value) ? query.trim().toLowerCase() : '';
  const options = companies.filter(company => !typed || company.ticker.toLowerCase().startsWith(typed) || tidyName(company.name).toLowerCase().includes(typed))
    .sort((a, b) => Number(b.ticker.toLowerCase().startsWith(typed) && !!typed) - Number(a.ticker.toLowerCase().startsWith(typed) && !!typed) || a.ticker.localeCompare(b.ticker));
  const choose = (company: Company) => { setOpen(false); onChange(company.ticker); };

  return <div className="combo">
    <input ref={input} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
      value={query} placeholder="Type a ticker or company name" autoComplete="off" spellCheck={false}
      onFocus={event => { event.target.select(); setOpen(true); setActive(0); }}
      onBlur={() => { setOpen(false); setQuery(label(value)); }}
      onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, options.length - 1)); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
        else if (event.key === 'Enter' && open && options[active]) { event.preventDefault(); choose(options[active]); }
        else if (event.key === 'Escape') { setOpen(false); setQuery(label(value)); }
      }} />
    <button type="button" className="combo-toggle" tabIndex={-1} aria-label="Show all companies" onMouseDown={event => { event.preventDefault(); if (open) setOpen(false); else input.current?.focus(); }}>▾</button>
    {open && <ul id={listId} role="listbox" className="combo-list">
      {options.length ? options.map((company, index) => <li key={company.ticker} id={`${listId}-${index}`} role="option" aria-selected={index === active}
        onMouseDown={event => { event.preventDefault(); choose(company); }} onMouseEnter={() => setActive(index)}>
        <strong>{company.ticker}</strong> {tidyName(company.name)} <span>{company.sector}</span></li>)
        : <li className="combo-empty">No ASX 200 company matches “{query}”</li>}
    </ul>}
  </div>;
}

const money = (value: number, currency: string) => `${currency}${value < 1 ? value.toFixed(3).replace(/0$/, '') : value.toFixed(2)}`;
const percent = (value: number) => `${Number(value.toFixed(1))}%`;

const rate = (value: number) => `${Number(value.toFixed(3))}%`;
const signed = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}%`;
const medianText = (values: (number | null | undefined)[], format: (value: number) => string) => {
  const middle = median(values.filter((value): value is number => typeof value === 'number'));
  return middle === null ? '–' : format(middle);
};
const millions = (value: number, currency = 'A$') => (value >= 1000 ? `${currency}${Number((value / 1000).toFixed(2))}bn` : `${currency}${Math.round(value)}m`);
const instrumentLabel = Object.fromEntries(instruments.map(row => [row.id, row.label])) as Record<Instrument, string>;
const shortInstrument: Record<Instrument, string> = { convertible: 'Convertible', hybrid: 'Hybrid / subordinated', bond: 'Bond / notes', facility: 'Loan facility', royalty: 'Royalty / stream' };

export type Data = { terms: Record<string, Terms>; market: Record<string, RaiseMarket>; funding: FundingDeal[]; fundingTerms: Record<string, FundingTerms>; fundingMarket: Record<string, { marketCapMillions: number | null; audMillions: number | null; percentOfMarketCap: number | null }>; quotes: Record<string, { close: number; date: string; currency: string; url: string }> };

function Notices({ documents, note, label }: { documents: FundingDeal['documents']; note?: string; label: string }) {
  if (!note && documents.length < 2) return null;
  return <details><summary>{label}</summary>{note && <p>{note}</p>}
    <ul>{documents.map(document => <li key={document.id}>{date(document.date)} <a href={document.url} target="_blank" rel="noreferrer">{document.title}</a></li>)}</ul></details>;
}

function RaiseTable({ rows, limit, data }: { rows: Match[]; limit: number; data: Data }) {
  return <div className="table-scroll"><table className="raise-table"><thead><tr><th>Date</th><th>Company</th><th>Structure</th><th className="n" title="Largest amount in the grouped headlines; check scope in the filing">Headline size</th><th className="n" title="Headline size divided by estimated pre-announcement market cap, not ownership dilution">% of est. mkt cap</th><th className="n">Offer price</th><th className="n">Discount</th><th className="n">First close vs offer</th><th className="n">20 sessions later vs offer</th><th>Underwritten</th><th>Lead managers</th></tr></thead>
    <tbody>{rows.slice(0, limit).map(({ candidate, own }) => {
      const lead = headlineFor(candidate);
      const unresolved = !benchmarkable(candidate);
      const found = unresolved ? undefined : data.terms[candidate.id];
      const market = unresolved ? undefined : data.market[candidate.id];
      const discount = mainDiscount(found);
      const cite = (id: string | null | undefined) => candidate.documents.find(document => document.id === id)?.url;
      return <tr key={candidate.id} className={own ? 'own' : undefined}>
        <td>{date(candidate.firstDate)}</td>
        <td><strong>{candidate.ticker}</strong> {tidyName(candidate.company)}{own && <span className="tag">this company</span>}
          <div className="headline"><a href={lead.url} target="_blank" rel="noreferrer">{lead.title}</a></div>
          {unresolved && <small>Grouped or unclear notices; check the filing</small>}
          <Notices documents={candidate.documents} note={found?.useOfFunds?.value} label="Use of funds and notices" /></td>
        <td>{structureName(candidate)}{found?.ratio && <><br /><small>{found.ratio.value}</small></>}</td>
        <td className="n">{!unresolved && formatAmount(headlineSize(candidate)) || <small>–</small>}</td>
        <td className="n">{market?.percentOfMarketCap != null ? percent(market.percentOfMarketCap) : <small>–</small>}</td>
        <td className="n">{found?.offerPrice ? <a className="cite" href={cite(found.offerPrice.source)} target="_blank" rel="noreferrer" title={found.offerPrice.quote}>{money(found.offerPrice.value, found.offerPrice.currency)}</a> : <small>–</small>}</td>
        <td className="n">{discount ? <><a className="cite" href={cite(discount.source)} target="_blank" rel="noreferrer" title={discount.quote}>{discount.percent < 0 ? `${percent(-discount.percent)} premium` : percent(discount.percent)}</a>{discount.basis !== 'last close' && <><br /><small>to {discount.basis}</small></>}</>
          : market?.impliedDiscount != null ? <span title={`Offer price against the ${market.referenceDate} close of ${market.referenceClose}`}>{percent(market.impliedDiscount)}<br /><small>from prices</small></span> : <small>–</small>}</td>
        <td className="n">{market?.day1Return != null ? <span title={`${market.tradeDate} close against the offer price`}>{signed(market.day1Return)}</span> : <small>–</small>}</td>
        <td className="n">{market?.month1Return != null ? <span title={market.benchmarkMonth1 != null ? `ASX 200 over the same period: ${signed(market.benchmarkMonth1)}` : undefined}>{signed(market.month1Return)}</span> : <small>–</small>}</td>
        <td>{found?.underwritten ? { fully: 'Yes', partially: 'Partly', not: 'No' }[found.underwritten.value] : <small>–</small>}</td>
        <td className="brokers">{found?.leadManagers.length ? found.leadManagers.join(', ') : <small>–</small>}</td>
      </tr>;
    })}</tbody></table></div>;
}

function FundingTable({ deals, limit, data, ticker }: { deals: FundingDeal[]; limit: number; data: Data; ticker: string }) {
  return <div className="table-scroll"><table className="raise-table funding-table"><thead><tr><th>Date</th><th>Company</th><th>Instrument</th><th className="n">Size</th><th className="n" title="Deal size divided by estimated market cap; not debt / equity or total leverage">% of est. mkt cap</th><th className="n">Coupon or margin</th><th>Maturity</th><th className="n">Conversion premium</th><th>Banks and counterparties</th></tr></thead>
    <tbody>{deals.slice(0, limit).map(deal => {
      const unresolved = !comparableFunding(deal, undefined, 'any');
      const found = unresolved ? undefined : data.fundingTerms[deal.id];
      const fundingMarket = unresolved ? undefined : data.fundingMarket[deal.id];
      const size = found?.size?.value;
      const cite = (id: string | undefined) => deal.documents.find(document => document.id === id)?.url;
      const lead = deal.documents.find(document => /pric|complet|successful|issues? |launch|announces/i.test(document.title)) ?? deal.documents[0];
      return <tr key={deal.id} className={deal.ticker === ticker ? 'own' : undefined}>
        <td>{date(deal.firstDate)}</td>
        <td><strong>{deal.ticker}</strong> {tidyName(deal.company)}{deal.ticker === ticker && <span className="tag">this company</span>}
          <div className="headline"><a href={lead.url} target="_blank" rel="noreferrer">{lead.title}</a></div>
          {unresolved && <small>Combined funding package; terms need checking</small>}
          <Notices documents={deal.documents} note={found?.purpose?.value} label="Purpose and notices" /></td>
        <td>{shortInstrument[deal.instrument]}</td>
        <td className="n">{size ? <><a className="cite" href={cite(found!.size!.source)} target="_blank" rel="noreferrer" title={found!.size!.quote}>{millions(size.millions, size.currency)}</a>{size.currency !== 'A$' && fundingMarket?.audMillions && <><br /><small>{millions(fundingMarket.audMillions)}</small></>}</> : <small>–</small>}</td>
        <td className="n">{fundingMarket?.percentOfMarketCap != null ? percent(fundingMarket.percentOfMarketCap) : <small>–</small>}</td>
        <td className="n">{found?.coupon ? <a className="cite" href={cite(found.coupon.source)} target="_blank" rel="noreferrer" title={found.coupon.quote}>{rate(found.coupon.value)}</a>
          : found?.margin ? <a className="cite" href={cite(found.margin.source)} target="_blank" rel="noreferrer" title={found.margin.quote}>{found.margin.value.over} + {Number(found.margin.value.percent.toFixed(2))}%</a> : <small>–</small>}</td>
        <td>{found?.maturity ? <span title={found.maturity.quote}>{found.maturity.value}</span> : <small>–</small>}</td>
        <td className="n">{found?.conversionPremium ? <span title={found.conversionPremium.quote}>{percent(found.conversionPremium.value)}</span> : deal.instrument === 'convertible' ? <small>–</small> : null}</td>
        <td className="brokers">{found?.counterparties.length ? found.counterparties.join(', ') : <small>–</small>}</td>
      </tr>;
    })}</tbody></table></div>;
}

export default function PrecedentExplorer({ index, universe, data }: { index: Index; universe: Universe; data: Data }) {
  const { terms } = data;
  const companies = useMemo(() => [...universe.companies].sort((a, b) => a.ticker.localeCompare(b.ticker)), [universe.companies]);
  const [ticker, setTicker] = useState(companies.some(company => company.ticker === 'MI6') ? 'MI6' : companies[0]?.ticker ?? '');
  const [purpose, setPurpose] = useState<Purpose>('project');
  const [keywords, setKeywords] = useState('');
  const [targetAmount, setTargetAmount] = useState('250');
  const [shareCount, setShareCount] = useState('');
  const [grossDebt, setGrossDebt] = useState('');
  const [offerDiscount, setOfferDiscount] = useState('0');
  const [priceOverride, setPriceOverride] = useState('');
  const [scope, setScope] = useState<Scope>('best');
  const [limit, setLimit] = useState(12);
  const [instrument, setInstrument] = useState<Instrument | 'all'>('all');
  const [fundingScope, setFundingScope] = useState<'purpose' | 'sector' | 'all'>('purpose');
  const [fundingLimit, setFundingLimit] = useState(12);
  const company = companies.find(row => row.ticker === ticker);
  const purposeLabel = purposes.find(row => row.id === purpose)!.label.toLowerCase();
  const reset = () => { setLimit(12); setFundingLimit(12); setShareCount(''); setGrossDebt(''); setPriceOverride(''); };
  const quote = data.quotes[ticker];
  const numberOrNull = (value: string) => value.trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const model = financingModel({ amount: numberOrNull(targetAmount), sharePrice: numberOrNull(priceOverride) ?? quote?.close ?? null,
    sharesMillions: numberOrNull(shareCount), discountPercent: numberOrNull(offerDiscount), grossDebtMillions: numberOrNull(grossDebt) });

  const ranked = useMemo(() => (company ? rankComparables(index.candidates, company.ticker, company.sector, purpose, keywords) : []), [company, index.candidates, purpose, keywords]);
  const words = keywords.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const matchesWords = (row: Match) => words.every(word => row.candidate.documents.some(document => document.title.toLowerCase().includes(word)) || (terms[row.candidate.id]?.useOfFunds?.value.toLowerCase().includes(word) ?? false));
  const own = ranked.filter(row => row.own).sort((a, b) => b.candidate.firstDate.localeCompare(a.candidate.firstDate));
  const others = ranked.filter(row => !row.own && matchesWords(row));
  const scopes: Record<Scope, Match[]> = {
    best: others.filter(row => row.sameSector && row.samePurpose),
    sector: others.filter(row => row.sameSector),
    purpose: others.filter(row => row.samePurpose),
    all: others,
  };
  const scopeLabels: Record<Scope, string> = {
    best: purpose === 'any' ? `${company?.sector}` : `${company?.sector} + ${purposeLabel}`,
    sector: `All ${company?.sector}`,
    purpose: purpose === 'any' ? 'All sectors' : `${purposes.find(row => row.id === purpose)!.label}, any sector`,
    all: 'Every raise',
  };
  const basis: Scope = scopes.best.filter(row => benchmarkable(row.candidate)).length >= 3 ? 'best'
    : scopes.sector.filter(row => benchmarkable(row.candidate)).length >= 3 ? 'sector' : 'purpose';
  const benchmarkRows = scopes[basis].filter(row => benchmarkable(row.candidate));
  const summary = structureSummary(benchmarkRows, terms);
  const leading = summary[0];
  const amount = Number(targetAmount);
  const rows = [...(scope === 'purpose' ? [] : own.filter(matchesWords)), ...scopes[scope]];
  const lastOwn = own[0]?.candidate;
  const basisText = basis === 'best' ? `${company?.sector} raises for ${purposeLabel}`
    : basis === 'sector' ? `${company?.sector} raises, all purposes` : `raises for ${purposeLabel} across sectors`;

  const fundingText = (deal: FundingDeal) => [...deal.documents.map(document => document.title), data.fundingTerms[deal.id]?.purpose?.value ?? ''].join(' ').toLowerCase();
  const fundingPool = data.funding.filter(deal => deal.ticker !== ticker && (fundingScope === 'all' || deal.sector === company?.sector)
    && (fundingScope !== 'purpose' || comparableFunding(deal, data.fundingTerms[deal.id]?.purpose?.value, purpose)) && words.every(word => fundingText(deal).includes(word)));
  const ownFunding = data.funding.filter(deal => deal.ticker === ticker);
  const purposeFunding = data.funding.filter(deal => deal.ticker !== ticker && deal.sector === company?.sector
    && comparableFunding(deal, data.fundingTerms[deal.id]?.purpose?.value, purpose) && words.every(word => fundingText(deal).includes(word)));
  const comparableFacilities = purposeFunding.filter(deal => deal.instrument === 'facility');
  const fundingRows = [...ownFunding, ...fundingPool].filter(deal => instrument === 'all' || deal.instrument === instrument);
  const equityPool = scopes[fundingScope === 'purpose' ? 'best' : fundingScope === 'all' ? 'all' : 'sector'].filter(row => benchmarkable(row.candidate));
  const mix = [
    { label: 'Equity raises', deals: equityPool.length, companies: new Set(equityPool.map(row => row.candidate.ticker)).size,
      median: medianText(equityPool.map(row => headlineSize(row.candidate)).map(amount => (amount?.currency === 'A$' ? amount.millions : null)), value => millions(value)) },
    ...instruments.map(row => {
      const deals = fundingPool.filter(deal => deal.instrument === row.id && comparableFunding(deal, undefined, 'any'));
      return { label: row.label, deals: deals.length, companies: new Set(deals.map(deal => deal.ticker)).size,
        median: medianText(deals.map(deal => data.fundingMarket[deal.id]?.audMillions), value => millions(value)) };
    }),
  ];

  return <main className="page precedent-page">
    <header>
      <h1>ASX Capital Raising Precedents</h1>
      <p className="byline">Michael Nguyen</p>
      <p className="source">ASX 200 · {index.candidates.length} equity groups · {data.funding.length} other funding groups · since 2021. Automatically extracted; check the linked filings.</p>
    </header>

    <section className="search-panel" aria-label="Search">
      <label className="field-company"><span>Company</span><CompanySearch key={ticker} companies={companies} value={company} onChange={value => { setTicker(value); reset(); }} /></label>
      <label><span>Raising for</span><select value={purpose} onChange={event => { setPurpose(event.target.value as Purpose); reset(); }}>{purposes.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label><span>Amount to compare (A$m)</span><input type="number" min="0" step="1" inputMode="decimal" value={targetAmount} onChange={event => setTargetAmount(event.target.value)} /></label>
    </section>

    {company && <>
      <section className="company-line">
        <h2>{company.ticker} · {tidyName(company.name)}</h2>
        <p className="meta">{company.sector}{quote && <> · <a href={quote.url} target="_blank" rel="noreferrer">A${quote.close.toFixed(3)} close, {date(quote.date)}</a></>}{lastOwn && <> · last raise: {formatAmount(headlineSize(lastOwn)) || 'amount unstated'} {structureName(lastOwn).toLowerCase()}, {date(lastOwn.firstDate)}</>}</p>
      </section>

      <section className="funding-screen" aria-labelledby="screen-title">
        <h3 id="screen-title">Precedent summary</h3>
        <div className="route-grid">
          <div><h4>Most common equity structure in this set</h4><p className="route-name">{leading?.structure ?? 'No clear structure'}</p><p>{leading?.count ?? 0} of {benchmarkRows.length} groups · {basisText}</p></div>
          <div><h4>Same-sector loan notices</h4><p className="route-name">{comparableFacilities.length} matches</p><p>{company.sector} · {purposeLabel}. Matches are based on wording, not borrowing capacity.</p></div>
        </div>
        <p className="meta">{targetAmount && amount > 0 && leading?.medianSize && leading.sized ? `Your A$${amount}m is ${Number((amount / leading.medianSize).toFixed(1))}× the A$${Math.round(leading.medianSize)}m median ${leading.structure.toLowerCase()} (${leading.sized} headline amounts).` : 'Enter an amount to compare with the precedent sizes.'} Amount does not filter the list.</p>
      </section>

      <details className="company-model">
        <summary>Optional calculation · market cap, dilution and debt</summary>
        <div className="model-inputs">
          <label><span>Shares on issue (m)</span><input type="number" min="0" step="0.1" inputMode="decimal" value={shareCount} onChange={event => setShareCount(event.target.value)} placeholder="From latest filing" /></label>
          <label><span>Gross debt (A$m)</span><input type="number" min="0" step="1" inputMode="decimal" value={grossDebt} onChange={event => setGrossDebt(event.target.value)} placeholder="From latest accounts" /></label>
          <label><span>Offer discount (%)</span><input type="number" min="0" max="99" step="0.1" inputMode="decimal" value={offerDiscount} onChange={event => setOfferDiscount(event.target.value)} /></label>
          <label><span>Share price (A$)</span><input type="number" min="0" step="0.001" inputMode="decimal" value={priceOverride} onChange={event => setPriceOverride(event.target.value)} placeholder={quote ? quote.close.toFixed(3) : 'Enter price'} /></label>
        </div>
        <div className="model-results">
          <div><span>Market equity value</span><strong>{model.marketCap !== null ? millions(model.marketCap) : '—'}</strong><small>{model.marketCap !== null ? 'Share price × shares on issue' : 'Needs shares on issue'}</small></div>
          <div><span>Ownership dilution · non-participant</span><strong>{model.dilution !== null ? percent(model.dilution) : '—'}</strong><small>{model.newShares !== null ? `${Number(model.newShares.toFixed(1))}m new shares at A$${model.offerPrice?.toFixed(3)}` : 'Needs amount, price and discount'}</small></div>
          <div><span>Debt / total capital</span><strong>{model.debtAfterBorrowing !== null ? `${percent(model.debtToCapital!)} → ${percent(model.debtAfterBorrowing)}` : '—'}</strong><small>{model.debtAfterBorrowing !== null ? 'If the full need is borrowed; excludes cash' : 'Needs funding need, shares and debt'}</small></div>
        </div>
        <p className="model-note">Illustrative, before fees. Check shares and debt against dated <a href={`https://www.asx.com.au/asx/v2/statistics/announcements.do?by=asxCode&asxCode=${company.ticker}`} target="_blank" rel="noreferrer">ASX filings</a>. Debt / total capital = gross debt ÷ (gross debt + market cap), holding share price and shares constant. It excludes cash and does not measure borrowing capacity.</p>
      </details>

      <section aria-labelledby="structure-title">
        <h3 id="structure-title">Equity structures</h3>
        <p className="meta">{benchmarkRows.length} {basisText}. Unclear or grouped follow-on raises are in the full list.</p>
        {summary.length ? <div className="structure-list">{summary.map(row => <div key={row.structure} className="structure-row"><span>{row.structure}</span><div className="structure-track"><span style={{ width: `${Math.max(5, row.count / benchmarkRows.length * 100)}%` }} /></div><strong>{row.count} of {benchmarkRows.length}</strong><small>{row.medianSize !== null ? `A$${Math.round(row.medianSize)}m median size (${row.sized} deals)` : 'Size not found'}</small></div>)}</div> : <p>No clear structures in this set.</p>}
      </section>

      <section aria-labelledby="examples-title">
        <h3 id="examples-title">Examples</h3>
        <div className="example-columns">
          <div><h4>Equity</h4>{benchmarkRows.length ? benchmarkRows.slice(0, 3).map(({ candidate }) => {
            const notice = headlineFor(candidate);
            return <article key={candidate.id}><p><strong>{candidate.ticker}</strong> · {date(candidate.firstDate)} · {structureName(candidate)} · {formatAmount(headlineSize(candidate)) || 'size unstated'}</p><a href={notice.url} target="_blank" rel="noreferrer">{notice.title}</a></article>;
          }) : <p>No close equity notices in this screen.</p>}</div>
          <div><h4>Debt and other funding</h4>{purposeFunding.length ? purposeFunding.slice(0, 3).map(deal => {
            const notice = deal.documents[0];
            const size = data.fundingMarket[deal.id]?.audMillions;
            return <article key={deal.id}><p><strong>{deal.ticker}</strong> · {date(deal.firstDate)} · {shortInstrument[deal.instrument]}{size != null ? ` · ${millions(size)}` : ''}</p><a href={notice.url} target="_blank" rel="noreferrer">{notice.title}</a></article>;
          }) : <p>No same-sector funding notice mentions this purpose.</p>}</div>
        </div>
      </section>

      <details className="full-register" open><summary>Equity raises and terms</summary>
        <label className="keyword-field"><span>Filter deals by keyword</span><input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. gold, lithium, acquisition" /></label>
        <div className="scope-tabs" role="group" aria-label="Which raises to show">
          {(Object.keys(scopes) as Scope[]).map(key => <button key={key} type="button" aria-pressed={scope === key} onClick={() => { setScope(key); setLimit(12); }}>{scopeLabels[key]} <span>{scopes[key].length}</span></button>)}
        </div>
        {rows.length ? <RaiseTable rows={rows} limit={limit} data={data} /> : <p className="empty">Nothing in this group{words.length ? ` mentions “${keywords}”` : ''}.</p>}
        {rows.length > limit && <button type="button" className="more" onClick={() => setLimit(rows.length)}>Show all {rows.length}</button>}
      </details>

      <details className="full-register"><summary>All debt and other funding</summary>
        <div className="scope-tabs" role="group" aria-label="Which companies">
          <button type="button" aria-pressed={fundingScope === 'purpose'} onClick={() => { setFundingScope('purpose'); setFundingLimit(12); }}>{company.sector} + {purposeLabel}</button>
          <button type="button" aria-pressed={fundingScope === 'sector'} onClick={() => { setFundingScope('sector'); setFundingLimit(12); }}>{company.sector}</button>
          <button type="button" aria-pressed={fundingScope === 'all'} onClick={() => { setFundingScope('all'); setFundingLimit(12); }}>All sectors</button>
        </div>
        <div className="table-scroll"><table className="structure-table"><thead><tr><th>Funding type</th><th className="n">Groups</th><th className="n">Companies</th><th className="n">Median size (A$)</th></tr></thead>
          <tbody>{mix.map(row => <tr key={row.label}><td>{row.label}</td><td className="n">{row.deals}</td><td className="n">{row.companies}</td><td className="n">{row.median}</td></tr>)}</tbody></table></div>
        <div className="scope-tabs" role="group" aria-label="Which instrument">
          {(['all', ...instruments.map(row => row.id)] as (Instrument | 'all')[]).map(key => <button key={key} type="button" aria-pressed={instrument === key} onClick={() => { setInstrument(key); setFundingLimit(12); }}>{key === 'all' ? 'All types' : instrumentLabel[key]} <span>{[...ownFunding, ...fundingPool].filter(deal => key === 'all' || deal.instrument === key).length}</span></button>)}
        </div>
        {fundingRows.length ? <FundingTable deals={fundingRows} limit={fundingLimit} data={data} ticker={ticker} /> : <p className="empty">No {instrument === 'all' ? 'debt or hybrid' : instrumentLabel[instrument].toLowerCase()} deals{fundingScope !== 'all' ? ` in ${company.sector}` : ''}{words.length ? ` mention “${keywords}”` : ''}.</p>}
        {fundingRows.length > fundingLimit && <button type="button" className="more" onClick={() => setFundingLimit(fundingRows.length)}>Show all {fundingRows.length}</button>}
      </details>
    </>}

    <details className="method"><summary>Data and limits</summary>
      <p>The universe is the {index.companyCount} equity holdings of IOZ at {index.universeAsOf}, not historical ASX 200 membership. Announcements from 23 September 2021 are grouped by issuer and timing. These are candidate groups, not a verified deal census. Sector and purpose matches use sector labels and announcement wording; they do not establish financial comparability. If fewer than three clear same-sector, same-purpose equity groups exist, the summary broadens to sector, then purpose, as labelled above.</p>
      <p>Terms are automatically extracted from PDFs and headlines and need checking against the linked filings. Hover over terms for the extracted text; headline-derived funding amounts refer to the group&apos;s notices. Headline size is the largest amount in the grouped titles and can differ from final proceeds. Unclear structures and explicit follow-on placement groups are excluded from equity summaries. Missing figures are blank, not zero. Loan notices do not cover all bank borrowing. Counts describe this dataset, not market-wide funding preferences.</p>
      <p>Estimated market cap uses a Yahoo reported share count up to 400 days old, or a share count inferred from the notice&apos;s issue percentage, multiplied by the preceding trading close. It may miss intervening issues. Returns compare the first available traded close on or after the group&apos;s first announcement, and 20 traded sessions later, with the offer price; they are not total or market-adjusted returns. Calculated discounts use the preceding close where no extracted discount is available. The company price is a dated snapshot, not a live quote.</p>
    </details>
  </main>;
}
