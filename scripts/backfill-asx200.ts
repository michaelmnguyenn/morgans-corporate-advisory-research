import { readJson, atomicJson, fetchSource, type Source } from './pipeline';
import { parseArchiveHtml, groupCandidates, UniverseSchema, CompanyArchiveSchema, type ArchiveRow } from '../lib/precedents';

const holdingsUrl = 'https://www.blackrock.com/au/products/251852/fund/1478358644060.ajax?fileType=csv&fileName=IOZ_holdings&dataType=fund';
const base = 'data/research';
const args = process.argv.slice(2);
const limitArg = args.find(value => value.startsWith('--limit='));
const tickerArg = args.find(value => value.startsWith('--ticker='))?.split('=')[1]?.toUpperCase();
const limit = args.includes('--all') ? Infinity : limitArg ? Number(limitArg.split('=')[1]) : 5;
if (!Number.isInteger(limit) && limit !== Infinity || limit <= 0) throw new Error('Use --limit=N or --all');

function source(url: string, host: string, id: string): Source {
  return { id, name: host === 'www.blackrock.com' ? 'IOZ holdings' : 'ASX historical announcements', url, adapter: 'json-feed', enabled: true, accessReviewed: true,
    allowedHosts: [host], rightsNote: host === 'www.blackrock.com'
      ? 'Public downloadable fund holdings used for a current-company research list; do not republish portfolio data.'
      : 'Research collection under user-stated ASX access permission; do not republish source documents.',
    reviewedAt: '2026-09-23' };
}
function csvLine(line: string): string[] {
  const fields: string[] = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(value); value = ''; }
    else value += char;
  }
  fields.push(value);
  return fields;
}
export function parseHoldings(csv: string) {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const sourceAsOf = lines[0].match(/Fund Holdings as of,"?([^"\r\n]+)"?/)?.[1]?.replace(/"$/, '');
  const heading = lines.findIndex(line => line.startsWith('Ticker,Name,Sector,Asset Class,'));
  if (!sourceAsOf || heading < 0) throw new Error('Unexpected BlackRock holdings format');
  const companies = lines.slice(heading + 1).map(csvLine).filter(fields => fields[3] === 'Equity' && fields[10] === 'ASX - All Markets')
    .map(fields => ({ ticker: fields[0].trim().toUpperCase(), name: fields[1].trim(), sector: fields[2].trim() }))
    .filter(row => /^[A-Z0-9]{2,5}$/.test(row.ticker));
  if (companies.length !== 200 || new Set(companies.map(row => row.ticker)).size !== 200) throw new Error(`Expected 200 distinct ASX equities, found ${companies.length}`);
  return UniverseSchema.parse({ source: holdingsUrl, sourceAsOf, checkedAt: new Date().toISOString(), companies });
}

async function main() {
  let universe = await readJson<ReturnType<typeof parseHoldings> | null>(`${base}/universe.json`, null);
  if (!universe || args.includes('--refresh-universe')) {
    const result = await fetchSource(source(holdingsUrl, 'www.blackrock.com', 'ioz-holdings'));
    if (result.unchanged) throw new Error('Unexpected unchanged holdings response');
    universe = parseHoldings(result.body);
    await atomicJson(`${base}/universe.json`, universe);
    console.log(`Saved ${universe.companies.length} current-universe companies from IOZ holdings as of ${universe.sourceAsOf}.`);
  }
  universe = UniverseSchema.parse(universe);
  const companies = args.includes('--reindex') ? [] : tickerArg ? universe.companies.filter(company => company.ticker === tickerArg) : universe.companies.slice(0, limit);
  if (!companies.length && !args.includes('--reindex')) throw new Error(`Ticker ${tickerArg} is not in the saved current universe`);
  const start = '2021-09-23';
  const years = [2021, 2022, 2023, 2024, 2025, 2026];
  const currentYear = new Date().getUTCFullYear();
  for (const [index, company] of companies.entries()) {
    const path = `${base}/announcements/${company.ticker}.json`;
    const saved = CompanyArchiveSchema.parse(await readJson(path, { ticker: company.ticker, years: [] }));
    for (const year of years) {
      if (saved.years.some(item => item.year === year && !item.error) && !(args.includes('--refresh-current-year') && year === currentYear)) continue;
      const url = `https://www.asx.com.au/asx/v2/statistics/announcements.do?asxCode=${company.ticker}&by=asxCode&timeframe=Y&year=${year}`;
      try {
        await new Promise(resolve => setTimeout(resolve, 600));
        const response = await fetchSource(source(url, 'www.asx.com.au', `archive-${company.ticker.toLowerCase()}-${year}`));
        if (response.unchanged) throw new Error('Unexpected unchanged response');
        const parsed = parseArchiveHtml(response.body, year, company.ticker);
        const rows = parsed.rows.filter(row => row.date >= start);
        saved.years = [...saved.years.filter(item => item.year !== year), { year, url, checkedAt: new Date().toISOString(), totalRows: parsed.totalRows, rows }].sort((a, b) => a.year - b.year);
      } catch (error) {
        saved.years = [...saved.years.filter(item => item.year !== year), { year, url, checkedAt: new Date().toISOString(), totalRows: 0, rows: [] as ArchiveRow[], error: String(error) }].sort((a, b) => a.year - b.year);
      }
      await atomicJson(path, saved);
    }
    console.log(`${index + 1}/${companies.length} ${company.ticker}: ${saved.years.filter(item => !item.error).length}/6 years, ${saved.years.reduce((sum, item) => sum + item.rows.length, 0)} screened notices`);
  }
  const candidates = [];
  const companySummaries = [];
  let completeCompanies = 0; let checkedCompanyYears = 0;
  for (const company of universe.companies) {
    const saved = CompanyArchiveSchema.parse(await readJson(`${base}/announcements/${company.ticker}.json`, { ticker: company.ticker, years: [] }));
    const good = saved.years.filter(item => !item.error);
    checkedCompanyYears += good.length;
    if (good.length === years.length) completeCompanies++;
    const grouped = groupCandidates(company.ticker, company.name, company.sector, good.flatMap(item => item.rows));
    candidates.push(...grouped);
    companySummaries.push({ ...company, checkedYears: good.length, noticeCount: good.reduce((sum, item) => sum + item.rows.length, 0), candidateCount: grouped.length });
  }
  await atomicJson(`${base}/candidates.json`, { generatedAt: new Date().toISOString(), universeAsOf: universe.sourceAsOf,
    companyCount: universe.companies.length, completeCompanies, checkedCompanyYears,
    expectedCompanyYears: universe.companies.length * years.length, companies: companySummaries,
    candidates: candidates.sort((a, b) => b.lastDate.localeCompare(a.lastDate)) });
  console.log(`Indexed ${candidates.length} unverified candidate groups across ${checkedCompanyYears}/${universe.companies.length * years.length} company-years.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
