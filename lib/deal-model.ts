import Decimal from 'decimal.js';
export interface RaiseInputs {grossM:number|null;offer:number|null;reference:number|null;sharesPreM:number|null;feesPct:number|null}
export function calculateRaise(v:RaiseInputs){
 if(v.grossM===null||v.offer===null||!Number.isFinite(v.grossM)||!Number.isFinite(v.offer)||v.grossM<=0||v.offer<=0)return null;
 const gross=new Decimal(v.grossM),offer=new Decimal(v.offer),issued=gross.div(offer);
 const pre=v.sharesPreM!==null&&Number.isFinite(v.sharesPreM)&&v.sharesPreM>0?new Decimal(v.sharesPreM):null;
 const ref=v.reference!==null&&Number.isFinite(v.reference)&&v.reference>0?new Decimal(v.reference):null;
 const post=pre?.plus(issued)??null,cap=pre&&ref?pre.times(ref):null;
 const fees=v.feesPct!==null&&Number.isFinite(v.feesPct)&&v.feesPct>=0&&v.feesPct<=100?gross.times(v.feesPct).div(100):null;
 return {issuedM:issued.toNumber(),postM:post?.toNumber()??null,dilution:post?issued.div(post).times(100).toNumber():null,discount:ref?new Decimal(1).minus(offer.div(ref)).times(100).toNumber():null,marketCapM:cap?.toNumber()??null,raiseCapPct:cap?gross.div(cap).times(100).toNumber():null,feesM:fees?.toNumber()??null,netM:fees?gross.minus(fees).toNumber():null,theoretical:cap&&post?cap.plus(gross).div(post).toNumber():null};
}
