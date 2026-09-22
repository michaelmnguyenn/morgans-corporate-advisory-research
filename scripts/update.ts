import { atomicJson, fetchSource, hash, parseFeed, readJson, RegistrySchema, type Candidate, type Cursor } from './pipeline';

async function main() {
  const registry = RegistrySchema.parse(await readJson('data/source-registry.json'));
  const statePath = '.local/pipeline/cursors.json';
  const cursors = await readJson<Record<string, Cursor>>(statePath, {});
  const candidates = await readJson<Candidate[]>('.local/pipeline/candidates.json', []);
  const queue = new Map(candidates.map(item => [item.id, item]));
  const sources = registry.sources.filter(item => item.enabled);
  if (sources.length > 40) throw new Error('Per-run budget is 40 feeds; split registry before continuing');
  const hosts = new Map<string, number>(); let failures = 0;
  for (const source of sources) {
    const now = new Date().toISOString();
    const old = cursors[source.id];
    cursors[source.id] = { ...old, lastAttemptAt: now };
    try {
      const host = new URL(source.url).hostname;
      const delay = Math.max(0, (hosts.get(host) ?? 0) + 1500 - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      hosts.set(host, Date.now());
      const response = await fetchSource(source, old);
      if (!response.unchanged) {
        for (const candidate of parseFeed(source, response.body)) {
          const existing = queue.get(candidate.id);
          if (!existing || existing.contentHash !== candidate.contentHash) queue.set(candidate.id, candidate);
        }
        cursors[source.id] = { lastAttemptAt: now, lastSuccessAt: now, etag: response.etag, lastModified: response.lastModified, contentHash: hash(response.body) };
      } else cursors[source.id] = { ...old, lastAttemptAt: now, lastSuccessAt: now, error: undefined };
    } catch (error) { failures++; cursors[source.id].error = String(error); console.error(`${source.id}: ${error}`); }
    await atomicJson('.local/pipeline/candidates.json', [...queue.values()]);
    await atomicJson(statePath, cursors);
  }
  await atomicJson('.local/pipeline/run.json', { lastAttemptAt: new Date().toISOString(), enabledSources: sources.length, failures, unresolvedCount: queue.size, published: false });
  console.log(`${sources.length} enabled sources checked; ${queue.size} unresolved candidates. Public release unchanged.`);
  if (!sources.length) console.log('No permitted unattended feed configured. Manual source research/import remains available.');
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
