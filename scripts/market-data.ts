// Pulls daily closes, splits and reported share counts from Yahoo Finance for every issuer in the precedent index,
// and saves the pre-raise market cap and the share price after each raise.
// Usage: npm run data:market
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PrecedentIndexSchema } from '../lib/precedents';
import { FundingIndexSchema } from '../lib/funding';
import { raiseMarket, type Series } from '../lib/market-data';
import { atomicJson } from './pipeline';

const cache = '.local/yahoo';
const agent = { 'User-Agent': 'Mozilla/5.0' };
const from = Math.floor(Date.parse('2021-06-01') / 1000);
const to = Math.floor(Date.now() / 1000);

async function cached(name: string, url: string) {
  const path = `${cache}/${name}.json`;
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8'));
  await new Promise(done => setTimeout(done, 400));
  const response = await fetch(url, { headers: agent });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const body = await response.json();
  await writeFile(path, JSON.stringify(body));
  return body;
}

async function series(symbol: string): Promise<Series> {
  const chart = await cached(`chart-${symbol}`, `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${from}&period2=${to}&interval=1d&events=split`);
  const result = chart.chart.result?.[0];
  if (!result?.timestamp) throw new Error(`No prices for ${symbol}`);
  const offset = result.meta.gmtoffset ?? 36000;
  const quote = result.indicators.quote[0];
  // Halted days come back with the previous close and no volume, so they are dropped.
  const closes = result.timestamp.map((time: number, index: number) => [new Date((time + offset) * 1000).toISOString().slice(0, 10), quote.close[index], quote.volume?.[index]] as [string, number | null, number | null])
    .filter(([, close, volume]: [string, number | null, number | null]) => close !== null && (symbol.startsWith('^') || symbol.endsWith('=X') || (volume ?? 0) > 0))
    .map(([date, close]: [string, number]) => [date, close] as [string, number]);
  const splits = Object.values(result.events?.splits ?? {}).map((split: any) => ({ date: new Date((split.date + offset) * 1000).toISOString().slice(0, 10), factor: split.numerator / split.denominator }));
  if (symbol.startsWith('^') || symbol.endsWith('=X')) return { closes, splits, shares: [] };
  const types = 'annualOrdinarySharesNumber,quarterlyOrdinarySharesNumber,annualShareIssued,quarterlyShareIssued';
  const fundamentals = await cached(`shares-${symbol}`, `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}?type=${types}&period1=${Math.floor(Date.parse('2019-01-01') / 1000)}&period2=${to}`);
  const shares = new Map<string, number>();
  for (const row of fundamentals.timeseries?.result ?? []) for (const point of row[row.meta.type[0]] ?? []) if (point?.reportedValue?.raw) shares.set(point.asOfDate, point.reportedValue.raw);
  return { closes, splits, shares: [...shares].sort((a, b) => a[0].localeCompare(b[0])) };
}

async function main() {
  await mkdir(cache, { recursive: true });
  const index = PrecedentIndexSchema.parse(JSON.parse(await readFile('data/research/candidates.json', 'utf8')));
  const terms = JSON.parse(await readFile('data/research/terms.json', 'utf8')).raises;
  const funding = existsSync('data/research/funding.json') ? FundingIndexSchema.parse(JSON.parse(await readFile('data/research/funding.json', 'utf8'))) : { deals: [] };
  const benchmark = await series('^AXJO');
  const tickers = [...new Set([...index.candidates.map(row => row.ticker), ...funding.deals.map(row => row.ticker)])].sort();
  const bySymbol = new Map<string, Series>();
  for (const ticker of tickers) {
    try { bySymbol.set(ticker, await series(`${ticker}.AX`)); } catch (error) { console.warn(`${ticker}: ${(error as Error).message}`); }
  }
  const raises: Record<string, ReturnType<typeof raiseMarket>> = {};
  for (const candidate of index.candidates) {
    const data = bySymbol.get(candidate.ticker);
    if (!data) continue;
    raises[candidate.id] = raiseMarket(candidate, terms[candidate.id], data, benchmark);
  }
  // Foreign currency deal sizes are converted at the AUD cross rate on the deal date.
  const fundingTerms = existsSync('data/research/funding-terms.json') ? JSON.parse(await readFile('data/research/funding-terms.json', 'utf8')).deals : {};
  const fx: Record<string, Series> = {};
  for (const [code, symbol] of [['US$', 'AUDUSD=X'], ['EUR', 'AUDEUR=X'], ['GBP', 'AUDGBP=X'], ['NZ$', 'AUDNZD=X'], ['CHF', 'AUDCHF=X'], ['JPY', 'AUDJPY=X'], ['HKD', 'AUDHKD=X'], ['SGD', 'AUDSGD=X']]) fx[code] = await series(`^${symbol}`.slice(1));
  const fundingMarket: Record<string, { marketCapMillions: number | null; audMillions: number | null; percentOfMarketCap: number | null }> = {};
  for (const deal of funding.deals) {
    const data = bySymbol.get(deal.ticker);
    const marketCapMillions = data ? raiseMarket(deal, undefined, data, benchmark).marketCapMillions : null;
    const size = fundingTerms[deal.id]?.size?.value as { currency: string; millions: number } | undefined;
    const rate = size && size.currency !== 'A$' ? fx[size.currency]?.closes.findLast(([day]) => day <= deal.firstDate)?.[1] : 1;
    const audMillions = size && rate ? Math.round((size.millions / rate) * 10) / 10 : null;
    fundingMarket[deal.id] = { marketCapMillions, audMillions, percentOfMarketCap: audMillions && marketCapMillions ? Math.round((audMillions / marketCapMillions) * 1000) / 10 : null };
  }
  await atomicJson('data/research/market.json', { generatedAt: new Date().toISOString(), source: 'Yahoo Finance daily closes, splits, reported share counts and AUD cross rates', raises, funding: fundingMarket });
  const values = Object.values(raises);
  console.log(`Saved ${values.length} raises: ${values.filter(row => row.marketCapMillions).length} with market cap, ${values.filter(row => row.day1Return !== null).length} with price reaction.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
