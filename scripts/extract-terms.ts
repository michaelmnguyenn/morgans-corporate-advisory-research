// Downloads the launch notices for each candidate raise and reads the offer terms out of the PDF text.
// Usage: npm run data:terms [-- --ticker=PDN] [-- --refresh]
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { PrecedentIndexSchema, type PrecedentCandidate } from '../lib/precedents';
import { extractTerms, TermsFileSchema, type Terms } from '../lib/terms';
import { atomicJson } from './pipeline';
import { pdfText } from './asx-pdf';

const output = 'data/research/terms.json';
const boilerplate = /booklet|letter|cleansing|appendix|capital change|reminder|webinar|dispatch|s708|section 708|closing date|d&o|entitlement and acceptance|offer document|prospectus/i;
const completion = /complet|success|results of|oversubscribed|closes?\b|close of|update/i;

// Launch announcement first, then the presentation, then completion notices, which usually repeat the price.
function documentOrder(candidate: PrecedentCandidate) {
  const usable = candidate.documents.filter(document => !boilerplate.test(document.title));
  const rank = (title: string) => (/presentation/i.test(title) ? 1 : completion.test(title) ? 2 : 0);
  return [...usable].sort((a, b) => rank(a.title) - rank(b.title) || a.date.localeCompare(b.date)).slice(0, 4);
}

async function main() {
  const ticker = process.argv.find(arg => arg.startsWith('--ticker='))?.split('=')[1];
  const refresh = process.argv.includes('--refresh');
  const index = PrecedentIndexSchema.parse(JSON.parse(await readFile('data/research/candidates.json', 'utf8')));
  const saved = existsSync(output) ? TermsFileSchema.parse(JSON.parse(await readFile(output, 'utf8'))) : { generatedAt: '', raises: {} };
  const raises: Record<string, Terms> = { ...saved.raises };
  const todo = index.candidates.filter(candidate => (!ticker || candidate.ticker === ticker) && (refresh || !raises[candidate.id]));
  for (const [position, candidate] of todo.entries()) {
    const sources = [];
    for (const document of documentOrder(candidate)) {
      try {
        const text = await pdfText(document.id, document.url);
        if (text) sources.push({ document, text });
      } catch (error) { console.warn(`${candidate.ticker} ${document.id}: ${(error as Error).message}`); }
      const terms = extractTerms(sources);
      if (terms.offerPrice && !/floor/i.test(terms.offerPrice.quote) && terms.discounts.length && terms.leadManagers.length && terms.useOfFunds && (terms.proFormaCash || terms.cashBefore)) break;
    }
    raises[candidate.id] = extractTerms(sources);
    const found = raises[candidate.id];
    console.log(`${position + 1}/${todo.length} ${candidate.ticker} ${candidate.firstDate} price=${found.offerPrice?.value ?? '-'} discounts=${found.discounts.map(d => `${d.percent}% ${d.basis}`).join('; ') || '-'} lead=${found.leadManagers.join(', ') || '-'}`);
    if (position % 10 === 9) await atomicJson(output, { generatedAt: new Date().toISOString(), raises });
  }
  await atomicJson(output, { generatedAt: new Date().toISOString(), raises });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
