import { readFile } from 'node:fs/promises';
import { UniverseSchema } from '../lib/precedents';
import { parseBalanceHistory, type BalanceSheet } from '../lib/balance-sheet';
import { atomicJson } from './pipeline';

const universe = UniverseSchema.parse(JSON.parse(await readFile('data/research/universe.json', 'utf8')));
const companies: Record<string, BalanceSheet> = {};
const history: Record<string, Omit<BalanceSheet, 'source' | 'sourceLabel'>[]> = {};
const unavailable: string[] = [];
const types = ['TotalDebt', 'StockholdersEquity', 'CashCashEquivalentsAndShortTermInvestments'].flatMap(field => ['annual', 'quarterly'].map(period => period + field));
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < universe.companies.length) {
    const { ticker } = universe.companies[cursor++];
    const source = `https://au.finance.yahoo.com/quote/${ticker}.AX/balance-sheet/`;
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${ticker}.AX?type=${types.join(',')}&period1=1609459200&period2=${Math.floor(Date.now()/1000)}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = parseBalanceHistory(await response.json(), source);
      if (rows[0]) { companies[ticker] = rows[0]; history[ticker] = rows.map(({ source: _source, sourceLabel: _label, ...row }) => row); } else unavailable.push(ticker);
    } catch { unavailable.push(ticker); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}));
if (Object.keys(companies).length < universe.companies.length * 0.8) throw new Error('Balance sheet coverage below 80%; previous snapshot retained');
await atomicJson('data/research/balances.json', { generatedAt: new Date().toISOString(), companies, unavailable });
await atomicJson('data/research/balance-history.json', { generatedAt: new Date().toISOString(), source: 'Yahoo Finance reported balance sheets', history });
console.log(`${Object.keys(companies).length} company snapshots; ${unavailable.length} unavailable`);
