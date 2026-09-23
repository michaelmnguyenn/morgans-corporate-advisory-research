import { describe, expect, it } from 'vitest';
import { benchmarkable, comparableFunding, matchesPurpose, structureSummary, type Match } from '../lib/advisory';
import type { FundingDeal } from '../lib/funding';
import type { PrecedentCandidate } from '../lib/precedents';

const candidate = (ticker: string, structure: PrecedentCandidate['structure'], titles: string[]): PrecedentCandidate => ({
  id: ticker, ticker, company: ticker, sector: 'Materials', firstDate: '2025-01-01', lastDate: '2025-01-01', structure,
  status: 'unverified', documents: titles.map((title, index) => ({ id: `${ticker}-${index}`, date: '2025-01-01', title, url: 'https://www.asx.com.au/x', priceSensitive: true })),
});

describe('headline benchmarks', () => {
  it('excludes a grouped follow-on and unresolved structure without hiding their source records', () => {
    expect(benchmarkable(candidate('SRL', 'placement', ['A$46m Placement', 'Follow-on Placement of A$19m']))).toBe(false);
    expect(benchmarkable(candidate('WAF', 'other', ['Equity Raising']))).toBe(false);
    expect(benchmarkable(candidate('PDI', 'placement', ['A$69m Placement for project development']))).toBe(true);
  });

  it('only counts identified single-launch structures in a pricing summary', () => {
    const rows: Match[] = [candidate('PDI', 'placement', ['A$69m Placement']), candidate('SRL', 'placement', ['A$46m Placement', 'Follow-on Placement of A$19m'])]
      .filter(benchmarkable).map(row => ({ candidate: row, own: false, sameSector: true, samePurpose: true, score: 10 }));
    expect(structureSummary(rows, {})).toMatchObject([{ structure: 'Placement', count: 1, medianSize: 69, sized: 1 }]);
  });

  it('matches the funding purpose without treating every facility as project debt', () => {
    expect(matchesPurpose('Facility funds construction of the mine', 'project')).toBe(true);
    expect(matchesPurpose('Revolving facility refinances existing debt', 'project')).toBe(false);
    const funding = (title: string, instrument: FundingDeal['instrument']): FundingDeal => ({ id: title, ticker: 'X', company: 'X', sector: 'Materials', firstDate: '2025-01-01', lastDate: '2025-01-01', instrument,
      documents: [{ id: title, date: '2025-01-01', title, url: 'https://www.asx.com.au/x', priceSensitive: true }] });
    expect(comparableFunding(funding('Project funding package reaches financial close', 'facility'), 'Funds construction', 'project')).toBe(false);
    expect(comparableFunding(funding('Senior notes offering', 'bond'), 'Proceeds repay project financing debt', 'project')).toBe(false);
    expect(comparableFunding(funding('A$100m loan facility', 'facility'), 'Proceeds restart the mine', 'project')).toBe(true);
  });
});
