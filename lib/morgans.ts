import {z} from 'zod';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const EvidenceSchema=z.object({url:z.string().url(),title:z.string().min(1),date,page:z.string().min(1),supports:z.string().min(1)});
export const MorgansDealSchema=z.object({
 id:z.string(),ticker:z.string(),company:z.string(),date,sector:z.string(),amountM:z.number().positive(),amountBasis:z.string(),price:z.number().positive(),discountPct:z.number().finite(),discountReference:z.string().min(1),structure:z.string(),purpose:z.string().min(1),morgansRole:z.string().min(1),completion:z.string().min(1),notes:z.array(z.string()),sources:z.array(EvidenceSchema).min(2),team:z.array(z.string()).default([]),referencePrice:z.number().positive().nullable().default(null),capital:z.object({sharesPreM:z.number().positive(),source:EvidenceSchema,note:z.string()}).nullable().default(null),
 analysis:z.object({rationale:z.array(z.string().min(1)).optional(),purpose:z.array(z.string().min(1)).min(1),structure:z.array(z.string().min(1)).min(1),split:z.object({title:z.string(),parts:z.array(z.object({label:z.string(),amountM:z.number().positive()})).min(1)}).nullable(),metrics:z.array(z.object({metric:z.string(),target:z.string(),result:z.string(),status:z.enum(['ahead','met','behind']),date:date.optional(),source:z.object({label:z.string(),url:z.string().url()}).optional()})).min(1),priceNotes:z.array(z.string().min(1)),quotedBaseM:z.number().positive().optional(),assessment:z.object({summary:z.string().min(1),take:z.array(z.string().min(1)).min(1),takeaway:z.string().min(1)}).optional(),sources:z.array(z.object({title:z.string(),url:z.string().url(),date:date.optional()}))})
});
export const MorgansDatasetSchema=z.object({checkedAt:date,deals:z.array(MorgansDealSchema)}).superRefine((v,c)=>{if(new Set(v.deals.map(d=>d.id)).size!==v.deals.length)c.addIssue({code:'custom',message:'Duplicate event'});});
export type MorgansDeal=z.infer<typeof MorgansDealSchema>;
export type MorgansDataset=z.infer<typeof MorgansDatasetSchema>;
// Text stays text when pasted into Excel, even if a future issuer name starts with a formula marker.
export function excelCell(value:string|number){return typeof value==='number'?String(value):(/^[=+@\-]/.test(value)?"'":'')+value.replace(/[\t\r\n]+/g,' ');}
export function comparisonTsv(deals:MorgansDeal[]){return [['Company','ASX','Announced','Structure','Gross proceeds (A$m)','Proceeds basis','Offer (A$)','Reported discount (%)','Discount reference','Purpose','Morgans role','Completion evidence','Sources'],...deals.map(d=>[d.company,d.ticker,d.date,d.structure,d.amountM,d.amountBasis,d.price,d.discountPct,d.discountReference,d.purpose,d.morgansRole,d.completion,d.sources.map(s=>s.url).join(' | ')])].map(r=>r.map(v=>excelCell(v)).join('\t')).join('\n');}
export const PriceHistorySchema=z.object({checkedAt:date,series:z.record(z.string(),z.array(z.tuple([date,z.number().positive()])).min(2))});
export type PriceHistory=z.infer<typeof PriceHistorySchema>;
/** Close on the first trading day on or after `on`, against the close before it. */
export function dayMove(series:[string,number][],on:string){const i=series.findIndex(r=>r[0]>=on);return i>0?{date:series[i][0],close:series[i][1],pct:(series[i][1]/series[i-1][1]-1)*100}:null;}
