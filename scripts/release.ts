import { readFile } from 'node:fs/promises';
import { DatasetSchema, type Dataset } from '../lib/schema';
import { atomicJson, hash, readJson, RegistrySchema, type Candidate } from './pipeline';
import { partitionRecords, RoundingSchema, validateDataset } from './validation';

async function main() {
  const raw = await readJson<unknown[]>('.local/records.json');
  const rounding = RoundingSchema.parse({ ...await readJson<Record<string, unknown>>('data/rounding.json', {}), ...await readJson<Record<string, unknown>>('.local/rounding.json', {}) });
  const { valid: records, quarantined } = partitionRecords(raw, rounding);
  await atomicJson('.local/pipeline/quarantined.json', quarantined);
  if (!records.length) throw new Error(`No release-ready records; ${quarantined.length} records retained in local quarantine. Existing public snapshot unchanged.`);
  const previous = DatasetSchema.parse(await readJson('data/release.json'));
  const registry = RegistrySchema.parse(await readJson('data/source-registry.json'));
  const candidates = await readJson<Candidate[]>('.local/pipeline/candidates.json', []);
  const run = await readJson<{ lastAttemptAt: string } | null>('.local/pipeline/run.json', null);
  const now = new Date().toISOString();
  const dataset: Dataset = {
    version: `local-${now.slice(0,10)}-${hash(JSON.stringify({ records, rounding })).slice(0,8)}`,
    generatedAt: now,
    coverage: { ...previous.coverage, description: `${records.length} source-researched completed events. This is a bounded research sample, not a complete ASX archive.`,
      scope: `${registry.sources.filter(source => source.enabled).length} configured feeds; manually researched history plus unresolved discovery queue. No market-wide checked-through assertion.`,
      announcementsCheckedThrough: null, lastAttemptAt: run?.lastAttemptAt ?? now, lastSuccessAt: now,
      sourceCount: new Set(records.flatMap(deal => deal.sources.map(source => source.url))).size,
      unresolvedCount: candidates.filter(candidate => candidate.state === 'unresolved').length + quarantined.length,
      historicalStart: [...records.map(deal => deal.date)].sort()[0] ?? null,
      pricesAsOf: null,
    }, deals: records,
  };
  validateDataset(dataset, rounding);
  await atomicJson(`.local/releases/${dataset.version}.json`, dataset);
  // Current release stays untouched until the whole candidate validates and backup exists.
  await atomicJson('.local/releases/previous.json', previous);
  await atomicJson('data/release.json', dataset);
  const bytes = await readFile('data/release.json', 'utf8');
  await atomicJson('data/release-manifest.json', { version: dataset.version, generatedAt: now, sha256: hash(bytes), eventCount: records.length, schemaVersion: 1, calculationVersion: '1.0.0', roundingSha256: hash(JSON.stringify(rounding)), file: 'release.json' });
  console.log(`Published local snapshot ${dataset.version} with ${records.length} events. Restart/rebuild the static app to load changes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
