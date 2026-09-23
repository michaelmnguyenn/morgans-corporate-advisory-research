import { describe, expect, it } from 'vitest';
import { extractTerms, mainDiscount } from '../lib/terms';

const document = { id: '1', date: '2025-09-16', title: 'A$300M Fully Underwritten Equity Raising', url: 'https://www.asx.com.au/x', priceSensitive: true };

describe('launch notice terms', () => {
  it('reads price, discounts, underwriting and lead managers', () => {
    const text = `Paladin announces a fully underwritten equity raising. Consideration shares issued at A$9.10 per share to vendors.
      The Offer Price of A$ 7.25 per Share represents an 8.0 % discount to the last close of A$7.88 on the ASX and an 8.1% discount to the 5-day volume weighted average price.
      Proceeds from the equity raising will primarily be used to advance the development of the PLS Project.
      Macquarie Capital (Australia) Limited and Canaccord Genuity are acting as Joint Lead Managers to the Offer.`;
    const terms = extractTerms([{ document, text }]);
    expect(terms.offerPrice?.value).toBe(7.25);
    expect(terms.discounts.map(d => d.basis)).toEqual(['last close', '5-day VWAP']);
    expect(mainDiscount(terms)?.percent).toBe(8);
    expect(terms.underwritten?.value).toBe('fully');
    expect(terms.leadManagers).toEqual(['Macquarie', 'Canaccord Genuity']);
    expect(terms.useOfFunds?.value).toMatch(/PLS Project/);
  });

  it('ignores SPP pricing and reads entitlement ratios', () => {
    const text = `A $246 million fully underwritten 1 for 5.05 pro rata accelerated non-renounceable entitlement offer at $7.85 per New Share, representing a 7.9% discount to TERP.
      The SPP price will be the lower of the Placement price and a 2% discount to the 5-day VWAP up to the closing date of the SPP.`;
    const terms = extractTerms([{ document, text }]);
    expect(terms.ratio?.value).toBe('1 for 5.05');
    expect(terms.discounts.map(d => `${d.percent} ${d.basis}`)).toEqual(['7.9 TERP']);
  });
});
