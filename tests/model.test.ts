import { describe,it,expect } from 'vitest';
import { discount,scenario,statistics,priceRange,marketBand,raiseBand,lookbackDate,format,divide } from '../lib/model';
describe('pricing model',()=>{
 it('reconciles the documented A$20m fixture',()=>{const s=scenario(1,100,20,20)!;expect(s).toEqual({price:.8,newShares:25,post:125,dilution:20,theoretical:.96});expect(discount(.8,.96)).toBeCloseTo(16.6666667);expect(divide(20,.5)).toBe(40);});
 it('does not manufacture liquidity or reference discounts',()=>{expect(discount(1,null)).toBeNull();expect(divide(20,0)).toBeNull();expect(scenario(1,0,20,15)).toBeNull();});
 it('suppresses independently per metric below five complete observations',()=>{expect(statistics([10,12,14,16,null]).median).toBeNull();expect(statistics([10,12,14,16,18,null])).toMatchObject({n:5,missing:1,median:14,q1:12,q3:16});});
 it('uses inclusive interpolated quartiles and reverses prices',()=>{const s=statistics([10,12,14,16,18,20]);expect(s.q1).toBe(12.5);expect(s.q3).toBe(17.5);expect(priceRange(1,s)).toEqual([.825,.875]);});
 it('classifies boundaries without overlaps',()=>{expect([99.99,100,999.9,1000,4999,5000].map(marketBand)).toEqual([0,1,1,2,2,3]);expect([9.99,10,24.99,25,49.99,50].map(raiseBand)).toEqual([0,1,1,2,2,3]);});
 it('handles leap day lookback and financial notation',()=>{expect(lookbackDate('2024-02-29')).toBe('2022-02-28');expect(format(-12.3)).toBe('(12.30)');expect(format(-.00001)).toBe('0.00');expect(format(null)).toBe('—');});
});
