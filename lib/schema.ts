import { z } from 'zod';

const nullableNumber = z.number().finite().nonnegative().nullable();
const nullablePrice = z.number().finite().positive().nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)), 'Invalid date');
export const stages = ['producing_profitable','revenue_unprofitable','pre_revenue_funded','exploration','unknown'] as const;
export const stageLabels: Record<typeof stages[number], string> = { producing_profitable:'Producing / profitable', revenue_unprofitable:'Revenue / unprofitable', pre_revenue_funded:'Pre-revenue / funded', exploration:'Exploration', unknown:'Not classified' };
export const SourceSchema = z.object({ id:z.string().min(1), title:z.string().min(1), url:z.string().url().refine(v=>/^https?:\/\//.test(v),'HTTP source required'), date, page:z.string().nullable(), excerpt:z.string() });
export const LegSchema = z.object({ id:z.string().min(1), name:z.string(), structure:z.string(), price:z.number().positive(), announcedM:z.number().nonnegative(), completedM:z.number().positive(), issuedSharesM:nullableNumber, completionDate:date, status:z.literal('completed'), sourceIds:z.array(z.string()).min(1) });
export const DealSchema = z.object({
 id:z.string().min(1),ticker:z.string().min(1),company:z.string().min(1),date,completionDate:date,stage:z.enum(stages),sector:z.string(),structure:z.string(),purpose:z.string(),managers:z.array(z.string()),
 cornerstone:z.enum(['yes','no','unknown']),cornerstoneName:z.string().nullable(),underwritten:z.enum(['yes','no','partial','unknown']),sharesPreM:nullablePrice,lastClose:nullablePrice,lastCloseDate:date.nullable(),vwap5:nullablePrice,vwap15:nullablePrice,advAudM:nullableNumber,advMethod:z.enum(['reported','estimated']).nullable(),resumptionDate:date.nullable(),close1:nullablePrice,close30:nullablePrice,capacitySharesM:nullableNumber,cashPreM:nullableNumber,debtPreM:nullableNumber,feesM:nullableNumber,repaymentM:nullableNumber,otherUsesM:nullableNumber,newDebtM:nullableNumber,stageNote:z.string(),notes:z.array(z.string()),legs:z.array(LegSchema).min(1),sources:z.array(SourceSchema).min(1),fieldSources:z.record(z.string(),z.array(z.string()))
}).superRefine((deal,ctx)=>{
 const ids=new Set(deal.sources.map(s=>s.id));
 for(const leg of deal.legs){if(leg.completionDate<deal.date)ctx.addIssue({code:'custom',message:'Completion precedes launch'});for(const id of leg.sourceIds)if(!ids.has(id))ctx.addIssue({code:'custom',message:`Missing source ${id}`});}
 for(const refs of Object.values(deal.fieldSources))for(const id of refs)if(!ids.has(id))ctx.addIssue({code:'custom',message:`Missing field source ${id}`});
 if(deal.lastClose!==null&&!deal.lastCloseDate)ctx.addIssue({code:'custom',message:'Reference close needs its date'});
});
export const DatasetSchema = z.object({version:z.string(),generatedAt:z.string(),coverage:z.object({description:z.string(),announcementsCheckedThrough:z.string().nullable(),pricesAsOf:z.string().nullable(),lastAttemptAt:z.string().nullable(),lastSuccessAt:z.string().nullable(),sourceCount:z.number(),unresolvedCount:z.number(),historicalStart:z.string().nullable(),scope:z.string()}),deals:z.array(DealSchema)});
export type Deal = z.infer<typeof DealSchema>;
export type Leg = z.infer<typeof LegSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type Stage = Deal['stage'];
