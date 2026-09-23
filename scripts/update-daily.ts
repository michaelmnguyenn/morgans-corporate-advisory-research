import { atomicJson, fetchSource, type Source } from './pipeline';
import { parseDailyPage, sydneyDate, type DailyItem } from '../lib/daily';

const marketDate = sydneyDate(new Date());
const host = 'asx.api.markitdigital.com';
const endpoint = 'https://asx.api.markitdigital.com/asx-research/1.0/markets/announcements';
const maxPages = 30;
const pageSize = 100;

async function main() {
  const seen = new Map<string, DailyItem>();
  let scannedCount = 0;
  let reachedPreviousDay = false;
  for (let page = 0; page < maxPages; page++) {
    if (page) await new Promise(resolve => setTimeout(resolve, 1500));
    const source: Source = {
      id: 'asx-daily', name: 'ASX announcements',
      url: `${endpoint}?page=${page}&itemsPerPage=${pageSize}`, adapter: 'json-feed',
      enabled: true, accessReviewed: true, allowedHosts: [host],
      rightsNote: 'User-stated permission to collect ASX announcements for research; review before publishing beyond this project.',
      reviewedAt: marketDate,
    };
    const response = await fetchSource(source);
    if (response.unchanged) throw new Error('Unexpected unchanged ASX response');
    const result = parseDailyPage(JSON.parse(response.body), marketDate);
    scannedCount += result.pageSize;
    for (const item of result.items) seen.set(item.id, item);
    if (result.oldestDate === null || result.oldestDate < marketDate) { reachedPreviousDay = true; break; }
    if (result.pageSize < pageSize) { reachedPreviousDay = true; break; }
  }
  if (!reachedPreviousDay) throw new Error(`Stopped after ${maxPages} pages before reaching the previous market day; existing snapshot preserved`);
  await atomicJson('data/daily-announcements.json', {
    marketDate, checkedAt: new Date().toISOString(), scannedCount,
    items: [...seen.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  });
  console.log(`Checked ${scannedCount} ASX announcements for ${marketDate}; saved ${seen.size} candidate notices. No deals verified or published.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
