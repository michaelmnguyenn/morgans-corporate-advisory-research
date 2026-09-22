import Decimal from 'decimal.js';
import type { Deal, Stage } from './schema';

const D = (v:number) => new Decimal(v);
export const sum = (values:number[]) => values.reduce((a,b)=>a.plus(b),D(0)).toNumber();
export const divide = (a:number|null,b:number|null):number|null => a===null||b===null||b===0 ? null : D(a).div(b).toNumber();
export const discount = (price:number,reference:number|null):number|null => reference===null||reference<=0 ? null : D(1).minus(D(price).div(reference)).times(100).toNumber();
export const marketBand = (v:number) => v<100?0:v<1000?1:v<5000?2:3;
export const raiseBand = (v:number) => v<10?0:v<25?1:v<50?2:3;
export const marketBandLabels = ['<100m','100m–<1bn','1bn–<5bn','≥5bn'];
export const raiseBandLabels = ['<10%','10%–<25%','25%–<50%','≥50%'];
export function primaryLeg(deal:Deal){return deal.legs.find(l=>/placement/i.test(l.structure)) ?? deal.legs.find(l=>/institutional/i.test(l.name)) ?? deal.legs[0];}
export function metrics(deal:Deal, basis:'completed'|'announced'='completed'){
 const leg=primaryLeg(deal),gross=sum(deal.legs.map(l=>l.completedM)),announced=sum(deal.legs.map(l=>l.announcedM));
 const raise=basis==='completed'?gross:announced;
 const newShares=sum(deal.legs.map(l=>l.issuedSharesM??D(l.completedM).div(l.price).toNumber()));
 const sharesPost=deal.sharesPreM===null?null:D(deal.sharesPreM).plus(newShares).toNumber();
 const marketCap=deal.sharesPreM===null||deal.lastClose===null?null:D(deal.sharesPreM).times(deal.lastClose).toNumber();
 const theoretical=marketCap===null||sharesPost===null?null:D(marketCap).plus(gross).div(sharesPost).toNumber();
 const dilution=sharesPost===null?null:D(newShares).div(sharesPost).times(100).toNumber();
 const raisePct=marketCap===null?null:D(raise).div(marketCap).times(100).toNumber();
 const days=divide(raise,deal.advAudM);
 const completeCash=[deal.cashPreM,deal.debtPreM,deal.feesM,deal.repaymentM,deal.otherUsesM,deal.newDebtM].every(v=>v!==null);
 const cashPost=completeCash?D(deal.cashPreM!).plus(gross).plus(deal.newDebtM!).minus(deal.feesM!).minus(deal.repaymentM!).minus(deal.otherUsesM!).toNumber():null;
 const debtPost=completeCash?D(deal.debtPreM!).plus(deal.newDebtM!).minus(deal.repaymentM!).toNumber():null;
 return {leg,gross,announced,raise,newShares,sharesPost,marketCap,theoretical,dilution,raisePct,days,discount:discount(leg.price,deal.lastClose),discount5:discount(leg.price,deal.vwap5),discount15:discount(leg.price,deal.vwap15),discountTheoretical:discount(leg.price,theoretical),return1:deal.close1===null?null:D(deal.close1).div(leg.price).minus(1).times(100).toNumber(),return30:deal.close30===null?null:D(deal.close30).div(leg.price).minus(1).times(100).toNumber(),cashPost,debtPost,netDebt:cashPost===null||debtPost===null?null:D(debtPost).minus(cashPost).toNumber()};
}
export function reconcile(deal:Deal){return deal.legs.map(leg=>({leg:leg.name,variance:leg.issuedSharesM===null?null:D(leg.issuedSharesM).times(leg.price).minus(leg.completedM).toNumber()}));}
export function quantile(values:number[],p:number){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),h=(a.length-1)*p,i=Math.floor(h);return a[i]+(a[Math.ceil(h)]-a[i])*(h-i);}
export function statistics(values:(number|null)[]){const a=values.filter((v):v is number=>v!==null&&Number.isFinite(v));return {n:a.length,missing:values.length-a.length,median:a.length<5?null:quantile(a,.5),q1:a.length<5?null:quantile(a,.25),q3:a.length<5?null:quantile(a,.75),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null};}
export interface Subject {name:string;stage:Stage;close:number;shares:number;raise:number;adv:number|null;vwap5:number|null;discount:number;asOf:string;structure:string;basis:'completed'|'announced';}
export function lookbackDate(asOf:string){const [y,m,d]=asOf.split('-').map(Number);const targetYear=y-2;const daysInMonth=new Date(Date.UTC(targetYear,m,0)).getUTCDate();return `${targetYear}-${String(m).padStart(2,'0')}-${String(Math.min(d,daysInMonth)).padStart(2,'0')}`;}
export function matchReasons(deal:Deal,s:Subject){
 const m=metrics(deal,s.basis),reasons:string[]=[];
 if(s.stage==='unknown'||deal.stage!==s.stage)reasons.push('Operating stage');
 if(deal.date<lookbackDate(s.asOf)||deal.date>s.asOf)reasons.push('Outside 24 months');
 if(deal.completionDate>s.asOf)reasons.push('Not completed at analysis date');
 if(deal.sources.some(source=>source.date>s.asOf))reasons.push('Evidence after analysis date');
 if(m.marketCap===null)reasons.push('Missing market cap');else if(marketBand(m.marketCap)!==marketBand(s.close*s.shares))reasons.push('Market cap band');
 if(m.raisePct===null)reasons.push('Missing raise / cap');else if(raiseBand(m.raisePct)!==raiseBand(s.raise/(s.close*s.shares)*100))reasons.push('Raise / cap band');
 if(s.structure!=='All structures'&&deal.structure!==s.structure)reasons.push('Structure');
 if(deal.notes.some(n=>/attached options|free.attaching options|attaching warrants/i.test(n)))reasons.push('Attached securities');
 return reasons;
}
export function scenario(close:number,shares:number,raise:number,d:number){if(close<=0||shares<=0||raise<=0||d>=100||d<0)return null;const price=D(close).times(D(1).minus(D(d).div(100))),newShares=D(raise).div(price),post=D(shares).plus(newShares);return {price:price.toNumber(),newShares:newShares.toNumber(),post:post.toNumber(),dilution:newShares.div(post).times(100).toNumber(),theoretical:D(shares).times(close).plus(raise).div(post).toNumber()};}
export function priceRange(reference:number|null,s:ReturnType<typeof statistics>){return reference===null||s.q1===null||s.q3===null?null:[D(reference).times(D(1).minus(D(s.q3).div(100))).toNumber(),D(reference).times(D(1).minus(D(s.q1).div(100))).toNumber()];}
export function format(value:number|null,dp=2){if(value===null||!Number.isFinite(value))return '—';const rounded=Number(value.toFixed(dp));const n=Math.abs(rounded).toLocaleString('en-AU',{minimumFractionDigits:dp,maximumFractionDigits:dp});return rounded<0?`(${n})`:n;}
export function dateLabel(value:string|null){if(!value)return '—';const part=value.slice(0,10);return new Date(part+'T00:00:00Z').toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});}
