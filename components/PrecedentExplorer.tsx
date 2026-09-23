'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { benchmarkable, comparableFunding, describe as headlineFor, formatAmount, headlineSize, median, purposes, rankComparables, structureName, type Purpose } from '@/lib/advisory';
import { mainDiscount, type Terms } from '@/lib/terms';
import { balanceBefore, leverage, type BalanceSheet } from '@/lib/balance-sheet';
import type { FundingDeal, Instrument } from '@/lib/funding';
import type { FundingTerms } from '@/lib/funding-terms';
import type { RaiseMarket } from '@/lib/market-data';
import { PrecedentIndexSchema, UniverseSchema } from '@/lib/precedents';
import type { z } from 'zod';

type Index = z.infer<typeof PrecedentIndexSchema>;
type Universe = z.infer<typeof UniverseSchema>;
type Company = Universe['companies'][number];

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
const rate = (value: number) => `${Number(value.toFixed(2))}%`;
const signed = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}%`;
const times = (value: number) => `${value.toFixed(2)}x`;
const middle = (values: (number | null | undefined)[]) => median(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)));
const millions = (value: number, currency = 'A$') => (Math.abs(value) >= 1000 ? `${currency}${Number((value / 1000).toFixed(2))}bn` : `${currency}${Number(value.toFixed(value < 10 ? 1 : 0))}m`);
const shortInstrument: Record<Instrument, string> = { convertible: 'Convertible', hybrid: 'Hybrid / sub. notes', bond: 'Bond / notes', facility: 'Loan facility', royalty: 'Royalty / stream' };
const shortStructure = (name: string) => name.replace('Placement, entitlement + SPP', 'Placement + ANREO + SPP').replace('Entitlement offer', 'Entitlement');

type Quote = { close: number; date: string; currency: string; url: string; marketCap?: number };
export type Data = {
  terms: Record<string, Terms>; market: Record<string, RaiseMarket>; funding: FundingDeal[]; fundingTerms: Record<string, FundingTerms>;
  fundingMarket: Record<string, { marketCapMillions: number | null; audMillions: number | null; percentOfMarketCap: number | null }>;
  quotes: Record<string, Quote>; balances: Record<string, BalanceSheet>; history: Record<string, Omit<BalanceSheet, 'source' | 'sourceLabel'>[]>;
};

type Option = 'Placement' | 'Placement + SPP' | 'Entitlement offer' | 'Loan facility' | 'Bond / notes' | 'Convertible' | 'Hybrid';
const options: Option[] = ['Placement', 'Placement + SPP', 'Entitlement offer', 'Loan facility', 'Bond / notes', 'Convertible', 'Hybrid'];
const equityOptions = new Set<Option>(['Placement', 'Placement + SPP', 'Entitlement offer']);
const optionOfEquity = (name: string): Option | null => (name === 'Placement' ? 'Placement' : name === 'Placement + SPP' || name === 'SPP' ? 'Placement + SPP' : /entitlement/i.test(name) ? 'Entitlement offer' : null);
const optionOfDebt: Partial<Record<Instrument, Option>> = { facility: 'Loan facility', bond: 'Bond / notes', convertible: 'Convertible', hybrid: 'Hybrid' };

type Deal = { id: string; option: Option; ticker: string; company: string; date: string; url: string; title: string; note?: string; size: number | null; shareOfCap: number | null; rate: number | null; rateQuote?: string; day1: number | null; netDebt: number | null; netDebtDate?: string; who: string[] };

// Net debt in A$m at the last balance date before the deal, from AUD balance sheets only.
function netDebtBefore(data: Data, ticker: string, day: string) {
  const row = balanceBefore(data.history[ticker] as BalanceSheet[] | undefined, day);
  if (!row || row.currency !== 'AUD' || row.cash === null) return null;
  const debt = row.debt ?? (row.equity !== null ? 0 : null);
  return debt === null ? null : { value: debt - row.cash, date: row.date };
}

// Standard reasons an issuer picks each route, with the ASX placement limit checked against the amount entered.
function reasons(option: Option, facts: { newVsExisting: number | null; interest: number | null; netDebtAfter: number | null; recentPlacement?: string | null }) {
  const items: Record<Option, string[]> = {
    'Placement': ['Priced and settled in a few days with no prospectus', 'Only institutions and sophisticated investors take part, so retail holders are diluted',
      facts.newVsExisting === null ? 'Limited to 15% of existing shares in 12 months without holder approval' : facts.newVsExisting <= 15 ? facts.recentPlacement ? `Would be ${percent(facts.newVsExisting)} of shares against the 15% limit, but the ${facts.recentPlacement} has already used part of this year's capacity` : `Fits the 15% limit on shares issued without holder approval (${percent(facts.newVsExisting)})` : `Needs holder approval, as ${percent(facts.newVsExisting)} is above the 15% limit on shares issued without it`],
    'Placement + SPP': ['A placement with a share purchase plan so retail holders can buy up to A$30,000 each at the same price', 'SPP shares do not use the 15% placement limit', 'The SPP amount is only known when it closes and is often scaled back or increased'],
    'Entitlement offer': ['Every holder can buy new shares in proportion to their holding, so those who take up keep their stake', 'Not limited by the 15% cap, so it suits raises that are large against market cap', 'Takes three to four weeks with the retail offer and usually needs a deeper discount and an underwriter'],
    'Loan facility': ['No new shares issued', 'Needs cash flow or a project that can carry interest and repayments, and comes with covenants', facts.netDebtAfter !== null ? `Net debt would move to ${facts.netDebtAfter < 0 ? `net cash of ${millions(-facts.netDebtAfter)}` : millions(facts.netDebtAfter)}` : 'Banks rarely publish the rate'],
    'Bond / notes': ['Fixed rate for five to ten years, usually A$300m or more and often in US dollars', 'Lighter covenants than bank debt but a higher rate, and investors look for a credit history or rating', facts.interest !== null ? `About ${millions(facts.interest)} of interest a year at the median rate` : 'Rate depends on credit quality'],
    'Convertible': ['Lower coupon than straight debt because holders can convert into shares at a premium', 'Shares are only issued if the price rises past the conversion price', 'Suits companies with volatile share prices and strong investor demand'],
    'Hybrid': ['Counted partly as equity by rating agencies, so it supports the credit rating', 'Mostly used by banks, insurers, utilities and infrastructure owners'],
  };
  return items[option].map(item => <li key={item}>{item}</li>);
}

export default function PrecedentExplorer({ index, universe, data }: { index: Index; universe: Universe; data: Data }) {
  const { terms, market } = data;
  const companies = useMemo(() => [...universe.companies].sort((a, b) => a.ticker.localeCompare(b.ticker)), [universe.companies]);
  const [ticker, setTicker] = useState(companies.some(company => company.ticker === 'MI6') ? 'MI6' : companies[0]?.ticker ?? '');
  const [purpose, setPurpose] = useState<Purpose>('any');
  const [targetAmount, setTargetAmount] = useState('250');
  const [selected, setSelected] = useState<Option | 'all'>('all');
  const [limit, setLimit] = useState(15);
  const company = companies.find(row => row.ticker === ticker);

  const quote = data.quotes[ticker];
  const balance = data.balances[ticker];
  const own0 = useMemo(() => (company ? index.candidates.filter(candidate => candidate.ticker === company.ticker).sort((a, b) => b.firstDate.localeCompare(a.firstDate)) : []), [company, index.candidates]);
  // A raise after the balance date makes the reported cash stale, so the notice's own pro forma cash is used when it states one.
  const raiseSince = balance ? own0.find(candidate => candidate.firstDate > balance.date) : undefined;
  const sinceTerms = raiseSince ? terms[raiseSince.id] : undefined;
  const sinceSize = raiseSince ? headlineSize(raiseSince) : null;
  const plausible = (value: number | undefined) => value !== undefined && (!sinceSize || value <= sinceSize.millions * 6 + 500);
  const proForma = plausible(sinceTerms?.proFormaCash?.value) ? sinceTerms!.proFormaCash! : null;
  // Without a stated pro forma figure, cash is estimated as the reported balance plus the A$ raised since, and labelled as such.
  const raisedSince = balance ? own0.filter(candidate => candidate.firstDate > balance.date).reduce((sum, candidate) => { const size = headlineSize(candidate); return size?.currency === 'A$' ? sum + size.millions : sum; }, 0) : 0;
  const estimated = !proForma && balance?.cash != null && raisedSince > 0;
  const cash = proForma ? proForma.value : balance?.cash != null ? balance.cash + raisedSince : null;
  const netDebt = balance?.debt != null && cash !== null ? balance.debt - cash : balance && balance.cash !== null ? leverage(balance).netDebt : null;
  const marketCap = quote?.marketCap ?? null;
  const amount = Number(targetAmount) > 0 ? Number(targetAmount) : null;
  const today = quote?.date ?? index.generatedAt.slice(0, 10);

  const ranked = useMemo(() => (company ? rankComparables(index.candidates, company.ticker, company.sector, purpose, '') : []), [company, index.candidates, purpose]);
  const own = ranked.filter(row => row.own).sort((a, b) => b.candidate.firstDate.localeCompare(a.candidate.firstDate));
  const ownFunding = data.funding.filter(deal => deal.ticker === ticker);

  const deals: Deal[] = [];
  if (company) {
    for (const match of ranked) {
      const { candidate } = match;
      const option = optionOfEquity(structureName(candidate));
      if (match.own || !match.sameSector || !match.samePurpose || !option || !benchmarkable(candidate)) continue;
      const found = terms[candidate.id];
      const deal = market[candidate.id];
      const size = headlineSize(candidate);
      const discount = mainDiscount(found);
      const notice = headlineFor(candidate);
      const debt = netDebtBefore(data, candidate.ticker, candidate.firstDate);
      deals.push({ id: candidate.id, option, ticker: candidate.ticker, company: candidate.company, date: candidate.firstDate, url: notice.url, title: notice.title, note: found?.useOfFunds?.value,
        size: size?.currency === 'A$' ? size.millions : null, shareOfCap: deal?.percentOfMarketCap ?? null,
        rate: discount?.basis === 'last close' ? discount.percent : deal?.impliedDiscount ?? null, rateQuote: discount?.quote, day1: deal?.day1Return ?? null,
        netDebt: debt?.value ?? null, netDebtDate: debt?.date, who: found?.leadManagers ?? [] });
    }
    for (const deal of data.funding) {
      const option = optionOfDebt[deal.instrument];
      const found = data.fundingTerms[deal.id];
      if (deal.ticker === ticker || deal.sector !== company.sector || !option || !comparableFunding(deal, found?.purpose?.value, purpose)) continue;
      const notice = deal.documents.find(document => /pric|complet|successful|issues? |launch|announces|establish|secur|execut/i.test(document.title)) ?? deal.documents[0];
      const debt = netDebtBefore(data, deal.ticker, deal.firstDate);
      deals.push({ id: deal.id, option, ticker: deal.ticker, company: deal.company, date: deal.firstDate, url: notice.url, title: notice.title, note: found?.purpose?.value,
        size: data.fundingMarket[deal.id]?.audMillions ?? null, shareOfCap: data.fundingMarket[deal.id]?.percentOfMarketCap ?? null,
        rate: found?.coupon?.value ?? null, rateQuote: found?.coupon?.quote, day1: null, netDebt: debt?.value ?? null, netDebtDate: debt?.date, who: found?.counterparties ?? [] });
    }
    deals.sort((a, b) => b.date.localeCompare(a.date));
  }
  const recent = own.find(row => /placement/i.test(structureName(row.candidate)) && Date.parse(today) - Date.parse(row.candidate.firstDate) < 365 * 86_400_000)?.candidate;
  const recentPlacement = recent ? `${formatAmount(headlineSize(recent)) || ''} placement on ${date(recent.firstDate)}`.trim() : null;
  const listed = deals.filter(deal => selected === 'all' || deal.option === selected);
  const signedMillions = (value: number) => (value < 0 ? `(${millions(-value)})` : millions(value));
  const fmt = (value: number | null | undefined, format: (value: number) => string) => (value == null ? '–' : format(value));

  const summary = options.map(option => {
    const rows = deals.filter(deal => deal.option === option);
    const equity = equityOptions.has(option);
    const rate = middle(rows.map(row => row.rate));
    // Share of the company a holder who does not take part gives up, if the whole amount is raised at the median discount.
    const given = equity && amount && marketCap && rate !== null ? (100 * amount) / (marketCap * (1 - rate / 100) + amount) : null;
    return { option, rows, equity, size: middle(rows.map(row => row.size)), shareOfCap: middle(rows.map(row => row.shareOfCap)), rate, rated: rows.filter(row => row.rate !== null).length,
      day1: middle(rows.map(row => row.day1)), given, interest: !equity && amount && rate !== null ? (amount * rate) / 100 : null };
  }).filter(row => row.rows.length);

  return <main className="page precedent-page">
    <header className="sheet-header"><h1>ASX Capital Raising Precedents</h1><p className="byline">Michael Nguyen</p></header>

    <section className="search-panel three" aria-label="Inputs">
      <label className="field-company"><span>Company</span><CompanySearch key={ticker} companies={companies} value={company} onChange={value => { setTicker(value); setSelected('all'); setLimit(15); }} /></label>
      <label><span>Raising for</span><select value={purpose} onChange={event => { setPurpose(event.target.value as Purpose); setSelected('all'); setLimit(15); }}>{purposes.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label><span>Amount (A$m)</span><input type="number" min="0" step="1" inputMode="decimal" value={targetAmount} onChange={event => setTargetAmount(event.target.value)} /></label>
    </section>

    {company && <>
      <h2>{company.ticker} {tidyName(company.name)} <span className="sector">{company.sector}</span></h2>
      <table className="xl">
        <thead><tr><th>Share price</th><th>Market cap</th><th>Debt</th><th>Cash</th><th>Net debt</th><th>Balance sheet</th><th>Last equity raise</th><th>Last debt deal</th></tr></thead>
        <tbody><tr>
          <td className="n">{quote ? <a href={quote.url} target="_blank" rel="noreferrer" title={`Close on ${date(quote.date)}`}>{money(quote.close, 'A$')}</a> : '–'}</td>
          <td className="n" title="ASX company page">{marketCap ? millions(marketCap) : '–'}</td>
          <td className="n">{balance?.debt != null ? millions(balance.debt) : '–'}</td>
          <td className="n">{cash !== null ? (proForma ? <a href={raiseSince!.documents.find(document => document.id === proForma.source)?.url} target="_blank" rel="noreferrer" title={proForma.quote}>{millions(cash)}</a> : millions(cash)) : '–'}{proForma ? <small>pro forma after the {date(raiseSince!.firstDate)} raise</small> : estimated ? <small>estimate: {millions(balance!.cash!)} at {date(balance!.date)} + {millions(raisedSince)} raised since</small> : raiseSince && <small>before the {date(raiseSince.firstDate)} raise</small>}</td>
          <td className="n">{fmt(netDebt, signedMillions)}</td>
          <td title={balance?.note}>{balance ? <a href={balance.source} target="_blank" rel="noreferrer">{balance.sourceLabel === 'Yahoo Finance' ? 'Yahoo Finance' : balance.sourceLabel.replace(/, p\.\d+/, '')}, {date(balance.date)}</a> : '–'}{balance && Date.parse(today) - Date.parse(balance.date) > 456 * 86_400_000 && <small className="warn">over 15 months old</small>}</td>
          <td>{own[0] ? `${formatAmount(headlineSize(own[0].candidate)) || ''} ${structureName(own[0].candidate).toLowerCase().replace('spp', 'SPP')}, ${date(own[0].candidate.firstDate)}`.trim() : 'None since 2021'}</td>
          <td>{ownFunding[0] ? `${shortInstrument[ownFunding[0].instrument].toLowerCase()}, ${date(ownFunding[0].firstDate)}` : 'None announced'}</td>
        </tr></tbody>
      </table>

      {(own.length > 0 || ownFunding.length > 0) && <>
        <h3>{company.ticker}&apos;s recent deals</h3>
        <div className="recent">{[...own.filter(({ candidate }) => benchmarkable(candidate) || terms[candidate.id]?.offerPrice).slice(0, 3).map(({ candidate }) => {
          const found = terms[candidate.id];
          const deal = market[candidate.id];
          const size = formatAmount(headlineSize(candidate));
          const notice = headlineFor(candidate);
          const prices = found?.discounts.map(item => item.percent === 0 ? `nil discount to ${item.basis}` : item.percent < 0 ? `${percent(-item.percent)} premium to ${item.basis}` : `${percent(item.percent)} discount to ${item.basis}`) ?? [];
          const pf = found?.proFormaCash && found.proFormaCash.value <= (headlineSize(candidate)?.millions ?? Infinity) * 6 + 500 ? found.proFormaCash.value : null;
          const points = [
            `${[size, structureName(candidate).toLowerCase().replace('spp', 'SPP'), found?.offerPrice && `at ${money(found.offerPrice.value, found.offerPrice.currency)}`].filter(Boolean).join(' ')}${prices.length ? `, ${prices.join(' and ')}` : ''}`,
            found?.useOfFunds?.value,
            ...(() => {
              const stated = (found?.alongside ?? []).map(item => `A$${item.millions}m ${item.kind}${item.kind.includes('facilit') ? '' : ' funding'}${item.from ? ` from ${item.from}` : ''}`);
              const near = ownFunding.filter(deal => Math.abs(Date.parse(deal.firstDate) - Date.parse(candidate.firstDate)) <= 45 * 86_400_000)
                .map(deal => `${data.fundingMarket[deal.id]?.audMillions != null ? `${millions(data.fundingMarket[deal.id].audMillions!)} ` : ''}${shortInstrument[deal.instrument].toLowerCase()} announced ${date(deal.firstDate)}`);
              const all = [...stated, ...near];
              return all.length ? [`Alongside ${all.join('; ')}`] : [];
            })(),
            found?.cashBefore || pf ? `Cash ${[found?.cashBefore && `A$${found.cashBefore.value}m before`, pf && `A$${pf}m pro forma after`].filter(Boolean).join(', ')}` : null,
            found?.leadManagers.length ? `Led by ${found.leadManagers.join(', ')}${found.underwritten ? `, ${/\bSPP\b|share purchase plan/i.test(found.underwritten.quote) && found.underwritten.value === 'not' ? 'SPP not underwritten' : found.underwritten.value === 'fully' ? 'fully underwritten' : found.underwritten.value === 'partially' ? 'partly underwritten' : 'not underwritten'}` : ''}` : null,
            deal?.day1Return != null ? `Shares ${signed(deal.day1Return)} against the offer price on day 1${deal.month1Return != null ? ` and ${signed(deal.month1Return)} after a month` : ''}` : null,
          ].filter((point): point is string => Boolean(point));
          return <article key={candidate.id}><h4>{date(candidate.firstDate)} · <a href={notice.url} target="_blank" rel="noreferrer">{notice.title}</a></h4><ul>{points.map(point => <li key={point}>{point}</li>)}</ul></article>;
        }), ...ownFunding.slice(0, 2).map(deal => {
          const found = data.fundingTerms[deal.id];
          const notice = deal.documents[0];
          const size = data.fundingMarket[deal.id]?.audMillions;
          const points = [
            `${size != null ? `${millions(size)} ` : ''}${shortInstrument[deal.instrument].toLowerCase()}${found?.coupon ? ` at ${rate(found.coupon.value)}` : found?.margin ? ` at ${found.margin.value.over} + ${found.margin.value.percent}%` : ''}${found?.maturity ? `, due ${found.maturity.value}` : ''}`,
            found?.purpose?.value,
            found?.counterparties.length ? `With ${found.counterparties.join(', ')}` : null,
          ].filter((point): point is string => Boolean(point));
          return <article key={deal.id}><h4>{date(deal.firstDate)} · <a href={notice.url} target="_blank" rel="noreferrer">{notice.title}</a></h4><ul>{points.map(point => <li key={point}>{point}</li>)}</ul></article>;
        })]}</div>
      </>}

      <h3>Equity</h3>
      <table className="xl options">
        <thead>
          <tr><th rowSpan={2}>Option</th><th colSpan={4} className="span">{company.sector} deals since 2021</th><th colSpan={2} className="span">{company.ticker}{amount ? `, A$${amount}m` : ''}</th><th rowSpan={2}>Why companies choose it</th></tr>
          <tr><th className="n">Deals</th><th className="n">Median size</th><th className="n">Median discount</th><th className="n">Median day 1</th><th className="n">New shares vs existing</th><th className="n">Company given away</th></tr>
        </thead>
        <tbody>{summary.filter(row => row.equity).map(row => {
          const newVsExisting = row.given !== null ? (100 * row.given) / (100 - row.given) : null;
          return <tr key={row.option} className={selected === row.option ? 'here' : undefined}>
            <td><button type="button" className="link" onClick={() => { setSelected(selected === row.option ? 'all' : row.option); setLimit(15); }}>{row.option}</button></td>
            <td className="n">{row.rows.length}</td>
            <td className="n">{fmt(row.size, value => millions(value))}</td>
            <td className="n" title={`${row.rated} of ${row.rows.length} deals state it`}>{fmt(row.rate, percent)}</td>
            <td className="n">{fmt(row.day1, signed)}</td>
            <td className="n">{fmt(newVsExisting, percent)}</td>
            <td className="n">{fmt(row.given, percent)}</td>
            <td><ul className="why">{reasons(row.option, { newVsExisting, interest: null, netDebtAfter: null, recentPlacement })}</ul></td>
          </tr>;
        })}</tbody>
      </table>

      <h3>Debt</h3>
      <table className="xl options">
        <thead>
          <tr><th rowSpan={2}>Option</th><th colSpan={3} className="span">{company.sector} deals since 2021</th><th colSpan={2} className="span">{company.ticker}{amount ? `, A$${amount}m` : ''}</th><th rowSpan={2}>Why companies choose it</th></tr>
          <tr><th className="n">Deals</th><th className="n">Median size</th><th className="n">Median rate</th><th className="n">Interest a year</th><th className="n">Net debt after</th></tr>
        </thead>
        <tbody>{summary.filter(row => !row.equity).map(row => {
          const netDebtAfter = netDebt !== null && amount ? netDebt + amount : null;
          return <tr key={row.option} className={selected === row.option ? 'here' : undefined}>
            <td><button type="button" className="link" onClick={() => { setSelected(selected === row.option ? 'all' : row.option); setLimit(15); }}>{row.option}</button></td>
            <td className="n">{row.rows.length}</td>
            <td className="n">{fmt(row.size, value => millions(value))}</td>
            <td className="n" title={`${row.rated} of ${row.rows.length} deals state it`}>{row.rate === null ? 'not disclosed' : rate(row.rate)}</td>
            <td className="n">{fmt(row.interest, value => millions(value))}</td>
            <td className="n">{row.option === 'Convertible' || row.option === 'Hybrid' ? '' : fmt(netDebtAfter, signedMillions)}</td>
            <td><ul className="why">{reasons(row.option, { newVsExisting: null, interest: row.interest, netDebtAfter })}</ul></td>
          </tr>;
        })}</tbody>
      </table>

      <div className="section-head">
        <h3>{selected === 'all' ? 'All deals' : `${selected} deals`}</h3>
        <div className="scope-tabs" role="group" aria-label="Option">
          <button type="button" aria-pressed={selected === 'all'} onClick={() => { setSelected('all'); setLimit(15); }}>All <span>{deals.length}</span></button>
          {summary.map(row => <button key={row.option} type="button" aria-pressed={selected === row.option} onClick={() => { setSelected(row.option); setLimit(15); }}>{row.option} <span>{row.rows.length}</span></button>)}
        </div>
      </div>
      <table className="sheet-table">
        <thead><tr><th>Date</th><th>Company</th><th>Option</th><th className="n">Size</th><th className="n">% of mkt cap</th><th className="n">Discount / rate</th><th className="n">Day 1</th><th className="n">Net debt before</th><th>Banks and brokers</th></tr></thead>
        <tbody>{listed.slice(0, limit).map(deal => <tr key={deal.id}>
          <td className="date">{date(deal.date)}</td>
          <td><strong>{deal.ticker}</strong> {tidyName(deal.company)}<a className="headline" href={deal.url} target="_blank" rel="noreferrer" title={deal.note}>{deal.title}</a></td>
          <td>{deal.option}</td>
          <td className="n">{fmt(deal.size, value => millions(value))}</td>
          <td className="n">{fmt(deal.shareOfCap, percent)}</td>
          <td className="n" title={deal.rateQuote}>{deal.rate === null ? '–' : equityOptions.has(deal.option) ? percent(deal.rate) : rate(deal.rate)}</td>
          <td className="n">{fmt(deal.day1, signed)}</td>
          <td className="n" title={deal.netDebtDate ? `Balance sheet ${date(deal.netDebtDate)}` : undefined}>{fmt(deal.netDebt, signedMillions)}</td>
          <td><small title={deal.who.join(', ')}>{deal.who.length ? deal.who.slice(0, 2).join(', ') + (deal.who.length > 2 ? ` +${deal.who.length - 2}` : '') : '–'}</small></td>
        </tr>)}</tbody>
      </table>
      {listed.length > limit && <button type="button" className="more" onClick={() => setLimit(listed.length)}>Show all {listed.length}</button>}
    </>}

    <section className="notes" aria-labelledby="notes-title">
      <h3 id="notes-title">Notes</h3>
      <ul>
        <li>Deals are ASX announcements since 23 Sep 2021 by the {index.companyCount} companies in the IOZ ASX 200 ETF, in the same sector as the company chosen.</li>
        <li>Discount is the offer price against the last close. Rate is the fixed coupon, where the notice states one. Day 1 is the first close against the offer price.</li>
        <li>Company given away is the share a holder who does not take part loses if the whole amount is raised at the median discount, using the current ASX market cap.</li>
        <li>Debt and cash are from the latest balance sheet shown, and net debt before a deal from the last one before it (Yahoo Finance). Brackets mean net cash.</li>
        <li>Loan facilities only appear when the company announced them. Hover a figure for the sentence it was read from.</li>
      </ul>
    </section>
  </main>;
}
