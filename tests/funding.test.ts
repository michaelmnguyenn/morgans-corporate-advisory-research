import { describe, expect, it } from 'vitest';
import { groupFunding, instrumentOf } from '../lib/funding';
import { extractFundingTerms } from '../lib/funding-terms';
import { raiseMarket } from '../lib/market-data';

const row = (id: string, date: string, title: string) => ({ id, date, title, url: `https://www.asx.com.au/${id}`, priceSensitive: true });

describe('debt, hybrid and royalty deals', () => {
  it('classifies new issues and ignores notices about instruments already on issue', () => {
    expect(instrumentOf('Xero prices US$925m 1.625% convertible notes due 2031')).toBe('convertible');
    expect(instrumentOf('IAG Launches Capital Notes 3 Offer')).toBe('hybrid');
    expect(instrumentOf('MIN prices US$1.3 Billion Senior Unsecured Notes Offering')).toBe('bond');
    expect(instrumentOf('Pilbara Minerals Establishes A$1B Debt Facility')).toBe('facility');
    expect(instrumentOf('BHP Announces Silver Streaming Transaction')).toBe('royalty');
    expect(instrumentOf('ANZ Capital Notes 7 - Distribution Rate')).toBeNull();
    expect(instrumentOf('FY26 Challenger Capital Notes Newsletter')).toBeNull();
    expect(instrumentOf('Launch of buyback of existing 2028 convertible notes')).toBeNull();
    expect(instrumentOf('New Convertible Notes Offering and Concurrent Repurchase')).toBe('convertible');
  });

  it('groups notices for the same instrument within 60 days', () => {
    const deals = groupFunding('BHP', 'BHP', 'Materials', [row('1', '2026-02-17', 'BHP Announces Silver Streaming Transaction'), row('2', '2026-04-02', 'BHP Completes Silver Streaming Transaction')]);
    expect(deals).toHaveLength(1);
  });

  it('reads size, coupon, maturity and conversion premium', () => {
    const text = 'Xero has priced US$925 million of 1.625% convertible notes due 2031. The initial conversion price represents a conversion premium of 30.0% to the reference share price. Goldman Sachs and Morgan Stanley acted as joint bookrunners.';
    const terms = extractFundingTerms('convertible', ['Xero prices US$925m 1.625% convertible notes due 2031'], [{ document: row('9', '2024-06-04', 'x'), text }], 'XRO', 2024);
    expect(terms.size?.value).toEqual({ currency: 'US$', millions: 925 });
    expect(terms.coupon?.value).toBe(1.625);
    expect(terms.maturity?.value).toBe('2031');
    expect(terms.conversionPremium?.value).toBe(30);
    expect(terms.counterparties).toEqual(['Goldman Sachs', 'Morgan Stanley']);
  });

  it('reads a hybrid margin over BBSW', () => {
    const text = 'The Margin has been determined under a bookbuild process and has been set at +235 basis points over the 3- month BBSW rate.';
    expect(extractFundingTerms('hybrid', [], [{ document: row('9', '2026-04-29', 'x'), text }]).margin?.value).toEqual({ percent: 2.35, over: 'BBSW' });
  });
});

describe('market data around a raise', () => {
  it('measures market cap and the price after the raise against the offer price, skipping halted days', () => {
    const closes: [string, number][] = [['2025-09-12', 7.74], ['2025-09-15', 7.88], ['2025-09-17', 7.76], ...Array.from({ length: 25 }, (_, i) => [`2025-10-${String(i + 1).padStart(2, '0')}`, 9.93] as [string, number])];
    const market = raiseMarket({ firstDate: '2025-09-16', documents: [row('1', '2025-09-16', 'A$300M Fully Underwritten Equity Raising')], ticker: 'PDN' },
      { documents: [], offerPrice: { value: 7.25, currency: 'A$', source: '1', quote: '' }, discounts: [], underwritten: null, leadManagers: [], leadSource: null, ratio: null, percentOfIssued: null, useOfFunds: null },
      { closes, splits: [], shares: [['2025-06-30', 398_960_289]] }, { closes: [['2025-09-15', 100], ['2025-10-20', 101]], splits: [], shares: [] });
    expect(market.referenceClose).toBe(7.88);
    expect(market.marketCapMillions).toBe(3144);
    expect(market.percentOfMarketCap).toBe(9.5);
    expect(market.impliedDiscount).toBe(8);
    expect(market.day1Return).toBe(7);
  });
});
