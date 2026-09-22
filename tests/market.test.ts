import {expect,it} from 'vitest';
import {marketWindow,sessionVwap,afterMarket} from '../lib/market';
const calendar=['2025-01-02','2025-01-03','2025-01-06','2025-01-07'];
const prices=calendar.map(date=>({date,close:2,volume:100,tradedValueAud:210}));
it('uses exchange sessions before cutoff without spanning the halt',()=>{expect(marketWindow(calendar,prices,'2025-01-07',3)).toMatchObject({valueAudM:.00021,method:'reported'});});
it('preserves zero volume and refuses missing observations',()=>{const p=[{...prices[0],volume:0,tradedValueAud:0},...prices.slice(1)];expect(marketWindow(calendar,p,'2025-01-07',3).valueAudM).toBe(.00014);expect(marketWindow(calendar,p.slice(1),'2025-01-07',3).valueAudM).toBeNull();});
it('never derives true VWAP from daily close alone',()=>{const p=prices.map(({tradedValueAud,...rest})=>rest);expect(sessionVwap(calendar,p,'2025-01-07',3)).toBeNull();expect(marketWindow(calendar,p,'2025-01-07',3).method).toBe('estimated');expect(sessionVwap(calendar,prices,'2025-01-07',3)).toBe(2.1);});
it('counts resumption as the first session and leaves immature returns blank',()=>{expect(afterMarket(calendar,prices,'2025-01-03',1)).toBe(2);expect(afterMarket(calendar,prices,'2025-01-03',30)).toBeNull();});
