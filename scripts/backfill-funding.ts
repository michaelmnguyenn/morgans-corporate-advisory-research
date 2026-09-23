// Re-reads each company's ASX announcement archive, keeps every title locally and indexes debt, hybrid and royalty deals.
// Usage: npm run data:funding [-- --index-only]
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { groupFunding, type FundingDeal } from '../lib/funding';
import { parseArchiveRows, UniverseSchema, type ArchiveRow } from '../lib/precedents';
import { atomicJson } from './pipeline';

const cache = '.local/archive';
const years = [2021, 2022, 2023, 2024, 2025, 2026];
const start = '2021-09-23';

async function main() {
  const universe = UniverseSchema.parse(JSON.parse(await readFile('data/research/universe.json', 'utf8')));
  await mkdir(cache, { recursive: true });
  if (!process.argv.includes('--index-only')) {
    for (const [index, company] of universe.companies.entries()) {
      for (const year of years) {
        const path = `${cache}/${company.ticker}-${year}.json`;
        if (existsSync(path) && year !== new Date().getUTCFullYear()) continue;
        const url = `https://www.asx.com.au/asx/v2/statistics/announcements.do?asxCode=${company.ticker}&by=asxCode&timeframe=Y&year=${year}`;
        await new Promise(done => setTimeout(done, 600));
        try {
          const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research; equity precedents)' } });
          const rows = parseArchiveRows(await response.text(), year).filter(row => row.date >= start);
          await atomicJson(path, { ticker: company.ticker, year, url, checkedAt: new Date().toISOString(), rows });
        } catch (error) { console.warn(`${company.ticker} ${year}: ${(error as Error).message}`); }
      }
      console.log(`${index + 1}/${universe.companies.length} ${company.ticker}`);
    }
  }
  const deals: FundingDeal[] = [];
  let checked = 0;
  for (const company of universe.companies) {
    const rows: ArchiveRow[] = [];
    for (const year of years) {
      const path = `${cache}/${company.ticker}-${year}.json`;
      if (!existsSync(path)) continue;
      checked++;
      rows.push(...JSON.parse(await readFile(path, 'utf8')).rows);
    }
    deals.push(...groupFunding(company.ticker, company.name, company.sector, rows));
  }
  await atomicJson('data/research/funding.json', { generatedAt: new Date().toISOString(), checkedCompanyYears: checked, deals: deals.sort((a, b) => b.firstDate.localeCompare(a.firstDate)) });
  console.log(`Indexed ${deals.length} debt, hybrid and royalty deals from ${checked} company-years.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
