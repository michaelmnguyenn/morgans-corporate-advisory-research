import { z } from 'zod';
import { atomicJson, readJson } from './pipeline';
import { partitionRecords, RoundingSchema } from './validation';

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: npm run data:import -- data/researched-deals.json');
  const input = await readJson<unknown>(path);
  const raw = z.array(z.object({ id: z.string().min(1) }).passthrough()).parse(Array.isArray(input) ? input : (input as { deals?: unknown })?.deals);
  if (new Set(raw.map(deal => deal.id)).size !== raw.length) throw new Error('Duplicate event IDs in import');
  const current = z.array(z.object({ id: z.string().min(1) }).passthrough()).parse(await readJson('.local/records.json', []));
  const merged = new Map(current.map(deal => [deal.id, deal]));
  for (const deal of raw) merged.set(deal.id, deal);
  const records = [...merged.values()].sort((a,b) => a.id.localeCompare(b.id));
  const rounding = RoundingSchema.parse({ ...await readJson<Record<string, unknown>>('data/rounding.json', {}), ...await readJson<Record<string, unknown>>('.local/rounding.json', {}) });
  const partition = partitionRecords(records, rounding);
  // Preserve incomplete evidence locally, including records not yet shaped like a completed deal.
  await atomicJson('.local/records.json', records);
  await atomicJson('.local/pipeline/quarantined.json', partition.quarantined);
  await atomicJson('.local/pipeline/last-import.json', { at: new Date().toISOString(), path, imported: raw.length, total: merged.size, releaseReady: partition.valid.length, quarantined: partition.quarantined.length });
  console.log(`Imported ${raw.length} events; ${partition.valid.length} release-ready and ${partition.quarantined.length} quarantined. Public release unchanged.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
