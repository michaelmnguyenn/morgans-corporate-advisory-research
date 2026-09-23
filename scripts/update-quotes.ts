// Save a dated last-close snapshot for the current research universe; no quote is fetched by the static website.
import { readFile } from 'node:fs/promises';
import { UniverseSchema } from '../lib/precedents';
import { atomicJson } from './pipeline';

type Quote = { close: number; date: string; currency: string; url: string };
const universe = UniverseSchema.parse(JSON.parse(await readFile('data/research/universe.json', 'utf8')));
const quotes: Record<string, Quote> = {};
const tickers = universe.companies.map(company => company.ticker);
let cursor = 0;

async function worker() {
  while (cursor < tickers.length) {
    const ticker = tickers[cursor++];
    const symbol = `${ticker}.AX`;
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const chart = (await response.json()).chart.result?.[0];
      const timestamps: number[] = chart?.timestamp ?? [];
      const closes: (number | null)[] = chart?.indicators?.quote?.[0]?.close ?? [];
      const offset: number = chart?.meta?.gmtoffset ?? 36000;
      const session = chart?.meta?.currentTradingPeriod?.regular;
      const position = closes.findLastIndex((close, index) => typeof close === 'number' && Number.isFinite(close) && close > 0
        && Number.isFinite(timestamps[index]) && !(session && timestamps[index] >= session.start && Date.now() < session.end * 1000));
      if (position < 0) throw new Error('No close');
      quotes[ticker] = { close: Number(closes[position]!.toFixed(4)), date: new Date((timestamps[position] + offset) * 1000).toISOString().slice(0, 10), currency: chart.meta.currency ?? 'AUD', url: `https://au.finance.yahoo.com/quote/${symbol}/` };
    } catch (error) { console.warn(`${ticker}: ${(error as Error).message}`); }
    await new Promise(done => setTimeout(done, 250));
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
if (Object.keys(quotes).length !== tickers.length) throw new Error('Incomplete quote refresh; previous snapshot retained');
await atomicJson('data/research/quotes.json', { generatedAt: new Date().toISOString(), source: 'Yahoo Finance daily chart last close', quotes });
console.log(`Saved ${Object.keys(quotes).length} of ${tickers.length} quotes`);
