import { describe, expect, it } from 'vitest';
import { parseDailyPage, sydneyDate } from '../lib/daily';

describe('daily announcement screening', () => {
  it('uses the Sydney calendar day across UTC boundaries', () => {
    expect(sydneyDate('2026-09-22T15:30:00Z')).toBe('2026-09-23');
    expect(sydneyDate('2026-01-01T12:30:00Z')).toBe('2026-01-01');
  });

  it('keeps candidate raises and filings without treating employee issues as raises', () => {
    const result = parseDailyPage({ data: { items: [
      { date: '2026-09-23T04:00:00Z', documentKey: 'a', headline: 'Institutional placement to fund acquisition', symbol: 'ABC', companyInfo: [{ displayName: 'ABC Limited', sector: 'Industrials' }] },
      { date: '2026-09-23T03:00:00Z', documentKey: 'b', headline: 'Application for quotation of securities', symbol: 'DEF' },
      { date: '2026-09-23T02:00:00Z', documentKey: 'c', headline: 'Employee share placement', symbol: 'GHI' },
      { date: '2026-09-23T01:00:00Z', documentKey: 'd', headline: 'Quarterly activities report', symbol: 'JKL' },
      { date: '2026-09-22T01:00:00Z', documentKey: 'e', headline: 'Capital raising', symbol: 'MNO' },
    ] } }, '2026-09-23');
    expect(result.pageSize).toBe(5);
    expect(result.oldestDate).toBe('2026-09-22');
    expect(result.items.map(item => [item.id, item.kind])).toEqual([['a', 'raise'], ['b', 'filing']]);
    expect(result.items[0]).toMatchObject({ company: 'ABC Limited', sector: 'Industrials' });
    expect(result.items[1]).toMatchObject({ company: 'DEF', sector: null });
  });
});
