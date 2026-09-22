import {describe,it,expect} from 'vitest';
import {calculateRaise} from '../lib/deal-model';
const base={grossM:20,offer:.8,reference:1,sharesPreM:100,feesPct:null};
describe('individual financing model',()=>{
 it('links price, proceeds, share issuance and ownership using one calculation',()=>{const m=calculateRaise(base)!;expect(m.issuedM).toBe(25);expect(m.postM).toBe(125);expect(m.dilution).toBe(20);expect(m.discount).toBe(20);expect(m.theoretical).toBe(.96);expect(m.netM).toBeNull();});
 it('lower price issues more shares for fixed proceeds; higher proceeds also increases dilution',()=>{const m=calculateRaise({...base,offer:.4})!;expect(m.issuedM).toBe(50);expect(m.dilution).toBeCloseTo(100/3);const bigger=calculateRaise({...base,grossM:40})!;expect(bigger.issuedM).toBe(m.issuedM);});
 it('never infers missing ownership denominator or fee cost',()=>{const m=calculateRaise({...base,sharesPreM:null,reference:null})!;expect(m.issuedM).toBe(25);expect(m.dilution).toBeNull();expect(m.marketCapM).toBeNull();expect(m.discount).toBeNull();expect(m.netM).toBeNull();expect(calculateRaise({...base,feesPct:0})!.netM).toBe(20);expect(calculateRaise({...base,feesPct:5})!.netM).toBe(19);});
 it('supports offer premiums but rejects invalid financial inputs',()=>{expect(calculateRaise({...base,offer:1.1})!.discount).toBe(-10);expect(calculateRaise({...base,offer:0})).toBeNull();expect(calculateRaise({...base,grossM:Infinity})).toBeNull();expect(calculateRaise({...base,feesPct:101})!.netM).toBeNull();});
});
