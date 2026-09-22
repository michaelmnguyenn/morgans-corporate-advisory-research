/** Market windows use an explicit exchange calendar. Missing sessions are not zero-volume days. */
import Decimal from 'decimal.js';
export type Session = {date:string;close:number;volume:number;tradedValueAud?:number};
export function marketWindow(calendar:string[],observations:Session[],cutoffExclusive:string,length=30){
 const dates=[...new Set(calendar)].filter(d=>d<cutoffExclusive).sort().slice(-length);
 if(dates.length!==length)return {valueAudM:null,method:null,reason:`Only ${dates.length} prior exchange sessions`} as const;
 const byDate=new Map(observations.map(o=>[o.date,o]));
 const rows=dates.map(d=>byDate.get(d));
 if(rows.some(r=>!r||!Number.isFinite(r.close)||r.close<=0||!Number.isFinite(r.volume)||r.volume<0))return {valueAudM:null,method:null,reason:'Missing or invalid session observations'} as const;
 const verified=rows as Session[],reported=verified.every(r=>r.tradedValueAud!==undefined&&Number.isFinite(r.tradedValueAud)&&r.tradedValueAud>=0);
 const total=verified.reduce((a,r)=>a.plus(reported?r.tradedValueAud!:new Decimal(r.close).mul(r.volume)),new Decimal(0));
 return {valueAudM:total.div(length).div(1e6).toNumber(),method:reported?'reported' as const:'estimated' as const,reason:null};
}
export function sessionVwap(calendar:string[],observations:Session[],cutoffExclusive:string,length:number){
 const dates=[...new Set(calendar)].filter(d=>d<cutoffExclusive).sort().slice(-length),byDate=new Map(observations.map(o=>[o.date,o]));
 if(dates.length!==length)return null;
 const rows=dates.map(d=>byDate.get(d));
 if(rows.some(r=>!r||r.tradedValueAud===undefined||!Number.isFinite(r.tradedValueAud)||r.tradedValueAud<0||!Number.isFinite(r.volume)||r.volume<0))return null;
 const total=rows.reduce((a,r)=>a.plus(r!.tradedValueAud!),new Decimal(0)),vol=rows.reduce((a,r)=>a.plus(r!.volume),new Decimal(0));
 return vol.isZero()?null:total.div(vol).toNumber();
}
export function afterMarket(calendar:string[],observations:Session[],resumptionDate:string,n:number){
 const sessions=[...new Set(calendar)].sort(),start=sessions.indexOf(resumptionDate);
 if(start===-1||n<1)return null;
 const date=sessions[start+n-1];if(!date)return null;
 return observations.find(o=>o.date===date)?.close??null;
}
