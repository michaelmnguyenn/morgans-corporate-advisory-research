'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { describe as headlineFor, formatAmount, headlineSize, leadManagerCounts, median, purposes, rankComparables, structureName, structureSummary, type Match, type Purpose } from '@/lib/advisory';
import { mainDiscount, type Terms } from '@/lib/terms';
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

export type Data = { terms: Record<string, Terms>; market: Record<string, RaiseMarket>; funding: FundingDeal[]; fundingTerms: Record<string, FundingTerms>; fundingMarket: Record<string, { marketCapMillions: number | null; audMillions: number | null; percentOfMarketCap: number | null }> };

function Notices({ documents, note, label }: { documents: FundingDeal['documents']; note?: string; label: string }) {
  if (!note && documents.length < 2) return null;
  return <details><summary>{label}</summary>{note && <p>{note}</p>}
    <ul>{documents.map(document => <li key={document.id}>{date(document.date)} <a href={document.url} target="_blank" rel="noreferrer">{document.title}</a></li>)}</ul></details>;
}

function RaiseTable({ rows, limit, data }: { rows: Match[]; limit: number; data: Data }) {
  return <div className="table-scroll"><table className="raise-table"><thead><tr><th>Date</th><th>Company</th><th>Structure</th><th className="n">Size</th><th className="n">% of mkt cap</th><th className="n">Price</th><th className="n">Discount</th><th className="n">Day 1</th><th className="n">1 month</th><th>Underwritten</th><th>Lead managers</th></tr></thead>
    <tbody>{rows.slice(0, limit).map(({ candidate, own }) => {
      const lead = headlineFor(candidate);
      const found = data.terms[candidate.id];
      const market = data.market[candidate.id];
      const discount = mainDiscount(found);
      const cite = (id: string | null | undefined) => candidate.documents.find(document => document.id === id)?.url;
      return <tr key={candidate.id} className={own ? 'own' : undefined}>
        <td>{date(candidate.firstDate)}</td>
        <td><strong>{candidate.ticker}</strong> {tidyName(candidate.company)}{own && <span className="tag">this company</span>}
          <div className="headline"><a href={lead.url} target="_blank" rel="noreferrer">{lead.title}</a></div>
          <Notices documents={candidate.documents} note={found?.useOfFunds?.value} label="Use of funds and notices" /></td>
        <td>{structureName(candidate)}{found?.ratio && <><br /><small>{found.ratio.value}</small></>}</td>
        <td className="n">{formatAmount(headlineSize(candidate)) || <small>–</small>}</td>
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
  return <div className="table-scroll"><table className="raise-table funding-table"><thead><tr><th>Date</th><th>Company</th><th>Instrument</th><th className="n">Size</th><th className="n">% of mkt cap</th><th className="n">Coupon or margin</th><th>Maturity</th><th className="n">Conversion premium</th><th>Banks and counterparties</th></tr></thead>
    <tbody>{deals.slice(0, limit).map(deal => {
      const found = data.fundingTerms[deal.id];
      const fundingMarket = data.fundingMarket[deal.id];
      const size = found?.size?.value;
      const cite = (id: string | undefined) => deal.documents.find(document => document.id === id)?.url ?? deal.documents[0].url;
      const lead = deal.documents.find(document => /pric|complet|successful|issues? |launch|announces/i.test(document.title)) ?? deal.documents[0];
      return <tr key={deal.id} className={deal.ticker === ticker ? 'own' : undefined}>
        <td>{date(deal.firstDate)}</td>
        <td><strong>{deal.ticker}</strong> {tidyName(deal.company)}{deal.ticker === ticker && <span className="tag">this company</span>}
          <div className="headline"><a href={lead.url} target="_blank" rel="noreferrer">{lead.title}</a></div>
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
  const { terms, market } = data;
  const companies = useMemo(() => [...universe.companies].sort((a, b) => a.ticker.localeCompare(b.ticker)), [universe.companies]);
  const [ticker, setTicker] = useState(companies.some(company => company.ticker === 'MI6') ? 'MI6' : companies[0]?.ticker ?? '');
  const [purpose, setPurpose] = useState<Purpose>('project');
  const [keywords, setKeywords] = useState('');
  const [scope, setScope] = useState<Scope>('best');
  const [limit, setLimit] = useState(12);
  const [instrument, setInstrument] = useState<Instrument | 'all'>('all');
  const [fundingScope, setFundingScope] = useState<'sector' | 'all'>('sector');
  const [fundingLimit, setFundingLimit] = useState(12);
  const company = companies.find(row => row.ticker === ticker);
  const purposeLabel = purposes.find(row => row.id === purpose)!.label.toLowerCase();
  const reset = () => { setLimit(12); setFundingLimit(12); };

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
  const basis: Scope = scopes.best.length >= 3 ? 'best' : scopes.sector.length >= 3 ? 'sector' : 'purpose';
  const summary = structureSummary(scopes[basis], terms);
  const brokers = leadManagerCounts(scopes[basis], terms).slice(0, 6);
  const rows = [...(scope === 'purpose' ? [] : own.filter(matchesWords)), ...scopes[scope]];
  const lastOwn = own[0]?.candidate;
  const lastTerms = lastOwn && terms[lastOwn.id];
  const lastDiscount = mainDiscount(lastTerms);
  const lastCap = lastOwn && market[lastOwn.id]?.percentOfMarketCap;
  const basisText = basis === 'best' ? `${scopes.best.length} ${company?.sector} raises${purpose === 'any' ? '' : ` for ${purposeLabel}`}`
    : basis === 'sector' ? `all ${scopes.sector.length} ${company?.sector} raises` : `${scopes.purpose.length} raises for ${purposeLabel} across all sectors`;

  const fundingText = (deal: FundingDeal) => [...deal.documents.map(document => document.title), data.fundingTerms[deal.id]?.purpose?.value ?? ''].join(' ').toLowerCase();
  const fundingPool = data.funding.filter(deal => deal.ticker !== ticker && (fundingScope === 'all' || deal.sector === company?.sector) && words.every(word => fundingText(deal).includes(word)));
  const ownFunding = data.funding.filter(deal => deal.ticker === ticker);
  const fundingRows = [...ownFunding, ...fundingPool].filter(deal => instrument === 'all' || deal.instrument === instrument);
  const equityPool = scopes[fundingScope === 'all' ? 'all' : 'sector'];
  const mix = [
    { label: 'Equity raises', deals: equityPool.length, companies: new Set(equityPool.map(row => row.candidate.ticker)).size,
      median: medianText(equityPool.map(row => headlineSize(row.candidate)).map(amount => (amount?.currency === 'A$' ? amount.millions : null)), value => millions(value)), rate: '' },
    ...instruments.map(row => {
      const deals = fundingPool.filter(deal => deal.instrument === row.id);
      return { label: row.label, deals: deals.length, companies: new Set(deals.map(deal => deal.ticker)).size,
        median: medianText(deals.map(deal => data.fundingMarket[deal.id]?.audMillions), value => millions(value)),
        rate: medianText(deals.map(deal => data.fundingTerms[deal.id]?.coupon?.value), rate) };
    }),
  ];

  return <main className="page precedent-page">
    <header>
      <h1>ASX Capital Raising Precedents</h1>
      <p className="byline">Michael Nguyen</p>
      <p className="source">{index.candidates.length} equity raises and {data.funding.length} debt, hybrid, convertible and royalty deals by ASX 200 companies since September 2021, with terms taken from each announcement and share prices from Yahoo Finance.</p>
    </header>

    <section className="search-panel" aria-label="Search">
      <label className="field-company"><span>Company</span><CompanySearch key={ticker} companies={companies} value={company} onChange={value => { setTicker(value); reset(); }} /></label>
      <label><span>Raising for</span><select value={purpose} onChange={event => { setPurpose(event.target.value as Purpose); reset(); }}>{purposes.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label><span>Keyword</span><input value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="e.g. gold, lithium, acquisition" /></label>
    </section>

    {company && <>
      <section className="company-line">
        <h2>{company.ticker} · {tidyName(company.name)}</h2>
        <p className="meta">{company.sector} · {lastOwn
          ? <>last raised equity {date(lastOwn.firstDate)}, {[[formatAmount(headlineSize(lastOwn)), structureName(lastOwn).toLowerCase().replace('spp', 'SPP'), lastTerms?.offerPrice && `at ${money(lastTerms.offerPrice.value, lastTerms.offerPrice.currency)}`].filter(Boolean).join(' '), lastDiscount && `${percent(lastDiscount.percent)} discount to ${lastDiscount.basis}`, lastCap != null && `${percent(lastCap)} of market cap`, lastTerms?.leadManagers.length && `led by ${lastTerms.leadManagers.join(', ')}`].filter(Boolean).join(', ')}</>
          : 'no equity raise since September 2021'}{ownFunding.length > 0 && <>, and {ownFunding.length} debt or hybrid deal{ownFunding.length > 1 ? 's' : ''} ({[...new Set(ownFunding.map(deal => shortInstrument[deal.instrument].toLowerCase()))].join(', ')})</>}</p>
      </section>

      <section aria-labelledby="structure-title">
        <h3 id="structure-title">Comparable equity raises by structure</h3>
        {summary.length ? <>
          <p className="meta">Based on {basisText}. Day 1 and 1 month are the share price against the offer price.</p>
          <div className="table-scroll"><table className="structure-table"><thead><tr><th>Structure</th><th className="n">Raises</th><th className="n">Median size</th><th className="n">Median % of mkt cap</th><th className="n">Median discount to last close</th><th className="n">Median day 1</th><th className="n">Median 1 month</th><th className="n">Fully underwritten</th><th>Examples</th></tr></thead>
            <tbody>{summary.map(row => {
              const members = scopes[basis].filter(match => structureName(match.candidate) === row.structure);
              return <tr key={row.structure}><td>{row.structure}</td><td className="n">{row.count}</td>
                <td className="n">{row.medianSize === null ? '–' : `A$${Math.round(row.medianSize)}m`}</td>
                <td className="n">{medianText(members.map(match => market[match.candidate.id]?.percentOfMarketCap), percent)}</td>
                <td className="n">{row.medianDiscount === null ? '–' : percent(row.medianDiscount)}{row.discounted > 0 && row.discounted < row.count && <small> ({row.discounted} of {row.count})</small>}</td>
                <td className="n">{medianText(members.map(match => market[match.candidate.id]?.day1Return), signed)}</td>
                <td className="n">{medianText(members.map(match => market[match.candidate.id]?.month1Return), signed)}</td>
                <td className="n">{row.underwritten} of {row.count}</td><td>{row.examples.join(', ')}</td></tr>;
            })}</tbody></table></div>
          {brokers.length > 0 && <p className="meta">Most frequent lead managers: {brokers.map(([name, count]) => `${name} (${count})`).join(', ')}.</p>}
        </> : <p>No comparable raises match{words.length ? ` “${keywords}”` : ''}.</p>}
      </section>

      <section aria-labelledby="raises-title">
        <h3 id="raises-title">Equity raises</h3>
        <div className="scope-tabs" role="group" aria-label="Which raises to show">
          {(Object.keys(scopes) as Scope[]).map(key => <button key={key} type="button" aria-pressed={scope === key} onClick={() => { setScope(key); setLimit(12); }}>{scopeLabels[key]} <span>{scopes[key].length}</span></button>)}
        </div>
        {rows.length ? <RaiseTable rows={rows} limit={limit} data={data} /> : <p className="empty">Nothing in this group{words.length ? ` mentions “${keywords}”` : ''}.</p>}
        {rows.length > limit && <button type="button" className="more" onClick={() => setLimit(rows.length)}>Show all {rows.length}</button>}
      </section>

      <section aria-labelledby="funding-title">
        <h3 id="funding-title">Debt, hybrids and other funding</h3>
        <div className="scope-tabs" role="group" aria-label="Which companies">
          <button type="button" aria-pressed={fundingScope === 'sector'} onClick={() => { setFundingScope('sector'); setFundingLimit(12); }}>{company.sector}</button>
          <button type="button" aria-pressed={fundingScope === 'all'} onClick={() => { setFundingScope('all'); setFundingLimit(12); }}>All sectors</button>
        </div>
        <div className="table-scroll"><table className="structure-table"><thead><tr><th>Funding type</th><th className="n">Deals</th><th className="n">Companies</th><th className="n">Median size</th><th className="n">Median coupon</th></tr></thead>
          <tbody>{mix.map(row => <tr key={row.label}><td>{row.label}</td><td className="n">{row.deals}</td><td className="n">{row.companies}</td><td className="n">{row.median}</td><td className="n">{row.rate}</td></tr>)}</tbody></table></div>
        <div className="scope-tabs" role="group" aria-label="Which instrument">
          {(['all', ...instruments.map(row => row.id)] as (Instrument | 'all')[]).map(key => <button key={key} type="button" aria-pressed={instrument === key} onClick={() => { setInstrument(key); setFundingLimit(12); }}>{key === 'all' ? 'All types' : instrumentLabel[key]} <span>{[...ownFunding, ...fundingPool].filter(deal => key === 'all' || deal.instrument === key).length}</span></button>)}
        </div>
        {fundingRows.length ? <FundingTable deals={fundingRows} limit={fundingLimit} data={data} ticker={ticker} /> : <p className="empty">No {instrument === 'all' ? 'debt or hybrid' : instrumentLabel[instrument].toLowerCase()} deals{fundingScope === 'sector' ? ` in ${company.sector}` : ''}{words.length ? ` mention “${keywords}”` : ''}.</p>}
        {fundingRows.length > fundingLimit && <button type="button" className="more" onClick={() => setFundingLimit(fundingRows.length)}>Show all {fundingRows.length}</button>}
      </section>
    </>}

    <details className="method"><summary>Where the data comes from</summary>
      <p>The companies are the {index.companyCount} holdings of the iShares ASX 200 ETF (IOZ) as at {index.universeAsOf}, so companies that have since left the index are not included. Each company&apos;s ASX announcements from 23 September 2021 were searched for placements, entitlement offers and SPPs, and separately for convertible notes, hybrids and subordinated notes, bonds, loan facilities and royalty or stream deals. Notices close together are treated as one deal. Offer price, discount, underwriting, lead managers, coupon, margin, maturity and conversion premium were read from the announcement PDFs, and hovering over a figure shows the sentence it came from.</p>
      <p>Market cap is the share count Yahoo Finance reports for the last balance date before the raise multiplied by the close before the announcement, with the notice&apos;s own share count used for older raises. Day 1 and 1 month compare the close on the first trading day after the announcement, and 20 trading days later, with the offer price. Where a notice states no discount, it is worked out from the offer price and the previous close. Loan facilities only appear when the company announced them, so most companies&apos; bank debt is not here. Blank cells mean the notice did not state the term in a form the extractor could read.</p>
    </details>
  </main>;
}
