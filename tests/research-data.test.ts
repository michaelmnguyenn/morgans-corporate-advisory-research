import { expect, it } from 'vitest';
import equity from '../data/research/candidates.json';
import funding from '../data/research/funding.json';
import terms from '../data/research/terms.json';
import fundingTerms from '../data/research/funding-terms.json';
import quotes from '../data/research/quotes.json';
import universe from '../data/research/universe.json';

it('keeps extracted source IDs within their announcement group', () => {
  for (const [groups, values] of [[equity.candidates, terms.raises], [funding.deals, fundingTerms.deals]] as const) {
    for (const group of groups) {
      const ids = new Set(group.documents.map(document => document.id));
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const record = value as Record<string, unknown>;
        if (typeof record.source === 'string') {
          // Funding extraction also stores a grouped-headline source, not a PDF ID.
          expect(record.source === 'title' || ids.has(record.source), `${group.id}: ${record.source}`).toBe(true);
          expect(typeof record.quote === 'string' && record.quote.length > 0).toBe(true);
        }
        Object.values(record).forEach(visit);
      };
      visit((values as Record<string, unknown>)[group.id]);
    }
  }
});

it('has a dated AUD quote for every company in the snapshot', () => {
  for (const company of universe.companies) {
    const quote = (quotes.quotes as Record<string, { close: number; currency: string; date: string }>)[company.ticker];
    expect(quote, company.ticker).toBeDefined();
    expect(Number.isFinite(quote.close) && quote.close > 0).toBe(true);
    expect(quote.currency).toBe('AUD');
    expect(quote.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(quote.date <= quotes.generatedAt.slice(0, 10)).toBe(true);
  }
});
