// Reads the pricing or launch notice for each debt, hybrid and royalty deal and keeps its headline terms.
// Usage: npm run data:funding-terms [-- --refresh]
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { FundingIndexSchema, type FundingDeal } from '../lib/funding';
import { extractFundingTerms, FundingTermsFileSchema, type FundingTerms } from '../lib/funding-terms';
import { pdfText } from './asx-pdf';
import { atomicJson } from './pipeline';

const output = 'data/research/funding-terms.json';

// Pricing and completion notices state the final terms, so they are read before launch notices.
function documentOrder(deal: FundingDeal) {
  const rank = (title: string) => (/pric|bookbuild|margin|complet|closes|successful|issues? /i.test(title) ? 0 : /prospectus|offering circular|presentation/i.test(title) ? 2 : 1);
  return [...deal.documents].filter(document => !/8-?K|form 8|appendix/i.test(document.title)).sort((a, b) => rank(a.title) - rank(b.title) || a.date.localeCompare(b.date)).slice(0, 2);
}

async function main() {
  const index = FundingIndexSchema.parse(JSON.parse(await readFile('data/research/funding.json', 'utf8')));
  const saved = existsSync(output) ? FundingTermsFileSchema.parse(JSON.parse(await readFile(output, 'utf8'))) : { generatedAt: '', deals: {} };
  const deals: Record<string, FundingTerms> = process.argv.includes('--refresh') ? {} : { ...saved.deals };
  const todo = index.deals.filter(deal => !deals[deal.id]);
  for (const [position, deal] of todo.entries()) {
    const sources = [];
    for (const document of documentOrder(deal)) {
      try {
        const text = await pdfText(document.id, document.url);
        if (text) sources.push({ document, text });
      } catch (error) { console.warn(`${deal.ticker} ${document.id}: ${(error as Error).message}`); }
    }
    deals[deal.id] = extractFundingTerms(deal.instrument, deal.documents.map(document => document.title), sources, deal.ticker, Number(deal.firstDate.slice(0, 4)));
    const found = deals[deal.id];
    console.log(`${position + 1}/${todo.length} ${deal.ticker} ${deal.instrument} ${deal.firstDate} size=${found.size ? `${found.size.value.currency}${found.size.value.millions}m` : '-'} coupon=${found.coupon?.value ?? '-'} margin=${found.margin?.value.percent ?? '-'} maturity=${found.maturity?.value ?? '-'} premium=${found.conversionPremium?.value ?? '-'} with=${found.counterparties.join(',') || '-'}`);
    if (position % 10 === 9) await atomicJson(output, { generatedAt: new Date().toISOString(), deals });
  }
  await atomicJson(output, { generatedAt: new Date().toISOString(), deals });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
