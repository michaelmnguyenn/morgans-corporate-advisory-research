import Decimal from 'decimal.js';
import { z } from 'zod';
import { DealSchema, DatasetSchema, type Deal } from '../lib/schema';

// A value stated to the nearest A$0.1m has a rounding unit of 0.1, not a 0.1m error allowance.
export const RoundingSchema = z.record(z.string(), z.object({ proceedsUnitM: z.number().positive().max(1), sourceId: z.string().min(1), note: z.string().min(10) }));
export type Rounding = z.infer<typeof RoundingSchema>;
export type Quarantined = { id: string; record: unknown; reasons: string[] };
export function validateDeal(input: unknown): Deal {
  const deal = DealSchema.parse(input);
  const sourceIds = new Set(deal.sources.map(source => source.id));
  if (sourceIds.size !== deal.sources.length) throw new Error(`${deal.id}: duplicate source IDs`);
  if (new Set(deal.legs.map(leg => leg.id)).size !== deal.legs.length) throw new Error(`${deal.id}: duplicate leg IDs`);
  if (deal.completionDate !== [...deal.legs.map(leg => leg.completionDate)].sort().at(-1)) throw new Error(`${deal.id}: event completion must equal latest included leg completion`);
  return deal;
}
export function releaseIssues(deal: Deal, rounding: Rounding = {}): string[] {
  const issues: string[] = [];
  const requireSource = (key: string) => {
    if (!deal.fieldSources[key]?.length) issues.push(`${key}: missing field evidence`);
    else for (const id of deal.fieldSources[key]) {
      const source = deal.sources.find(source => source.id === id);
      if (!source?.excerpt.trim() || !source.page?.trim()) issues.push(`${key}: source needs page/section and supporting extract`);
    }
  };
  for (const key of ['date', 'completionDate', 'stage', 'lastCloseDate']) requireSource(key);
  if (deal.stage === 'unknown') issues.push('stage: unknown operating stage');
  if (!deal.stageNote.trim()) issues.push('stage: missing point-in-time rationale');
  if (deal.lastClose === null) issues.push('lastClose: missing unaffected reference close');
  if (deal.sharesPreM === null) issues.push('sharesPreM: missing pre-raise share count');
  if (deal.lastCloseDate && deal.lastCloseDate > deal.date) issues.push('lastCloseDate: reference price is after launch');
  for (const [key, value] of Object.entries(deal)) if (typeof value === 'number') requireSource(key);
  for (const leg of deal.legs) {
    for (const key of ['price', 'announcedM', 'completedM', 'issuedSharesM', 'completionDate']) requireSource(`legs.${leg.id}.${key}`);
    if (leg.issuedSharesM === null || leg.issuedSharesM <= 0) { issues.push(`${leg.id}: missing independently disclosed issued shares`); continue; }
    const precision = rounding[`${deal.id}/${leg.id}`];
    if (precision && !deal.sources.some(source => source.id === precision.sourceId && source.excerpt.trim() && source.page?.trim())) issues.push(`${leg.id}: rounding basis source is missing`);
    const error = new Decimal(leg.issuedSharesM).mul(leg.price).minus(leg.completedM).abs();
    // One cent in AUD permits only floating conversion noise unless a documented source rounding unit is supplied.
    const tolerance = new Decimal(precision?.proceedsUnitM ?? 0).div(2).plus('0.00000001');
    if (error.greaterThan(tolerance)) issues.push(`${leg.id}: proceeds do not reconcile within disclosed precision (difference A$${error.mul(1e6).toFixed(2)})`);
  }
  return [...new Set(issues)];
}
export function partitionRecords(records: unknown[], rounding: Rounding = {}) {
  const valid: Deal[] = []; const quarantined: Quarantined[] = []; const ids = new Set<string>();
  for (const record of records) {
    const id = typeof record === 'object' && record && 'id' in record ? String(record.id) : `invalid-${quarantined.length}`;
    if (ids.has(id)) throw new Error(`Duplicate event ${id}`);
    ids.add(id);
    try { const deal = validateDeal(record); const reasons = releaseIssues(deal, rounding); if (reasons.length) quarantined.push({ id, record, reasons }); else valid.push(deal); }
    catch (error) { quarantined.push({ id, record, reasons: [String(error)] }); }
  }
  return { valid, quarantined };
}
export function validateDataset(input: unknown, rounding: Rounding = {}) {
  const dataset = DatasetSchema.parse(input);
  const partition = partitionRecords(dataset.deals, rounding);
  if (partition.quarantined.length) throw new Error(JSON.stringify(partition.quarantined.map(({ id, reasons }) => ({ id, reasons }))));
  return dataset;
}
