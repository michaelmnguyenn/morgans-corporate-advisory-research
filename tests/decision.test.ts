import { describe, expect, it } from 'vitest';
import { financingModel } from '../lib/decision';

describe('illustrative financing model', () => {
  it('ties market cap, placement dilution and debt share of capital to the inputs', () => {
    const result = financingModel({ amount: 250, sharePrice: 0.88, sharesMillions: 2271.92459, discountPercent: 10, grossDebtMillions: 100 });
    expect(result.marketCap).toBeCloseTo(1999.2936, 3);
    expect(result.offerPrice).toBeCloseTo(0.792, 3);
    expect(result.newShares).toBeCloseTo(315.6566, 3);
    expect(result.dilution).toBeCloseTo(12.2, 1);
    expect(result.sizeToMarketCap).toBeCloseTo(12.5, 1);
    expect(result.debtAfterBorrowing).toBeGreaterThan(result.debtToCapital!);
  });

  it('does not invent a ratio when shares or debt are unknown', () => {
    const result = financingModel({ amount: 250, sharePrice: 0.88, sharesMillions: null, discountPercent: 0, grossDebtMillions: null });
    expect(result.marketCap).toBeNull();
    expect(result.dilution).toBeNull();
    expect(result.debtAfterBorrowing).toBeNull();
  });
});
