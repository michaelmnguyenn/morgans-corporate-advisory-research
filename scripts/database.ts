import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { atomicJson, readJson } from './pipeline';
import { partitionRecords, RoundingSchema } from './validation';

const recordsSchema = z.array(z.object({ id: z.string().min(1) }).passthrough());
const statePaths = { cursors: '.local/pipeline/cursors.json', candidates: '.local/pipeline/candidates.json', rounding: '.local/rounding.json', run: '.local/pipeline/run.json' } as const;
async function main() {
  const action = process.argv[2];
  if (!['init', 'push', 'pull', 'check'].includes(action)) throw new Error('Usage: npm run data:db -- init|push|pull|check');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is unset. Database is optional; the local website and file pipeline work without it.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL connection URL is required');
  // pg verifies remote certificates. A local PostgreSQL instance can use sslmode=disable explicitly.
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.searchParams.get('sslmode') === 'disable') throw new Error('Remote database connections require TLS');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 30000, ...(url.searchParams.has('sslmode') ? {} : { ssl: ['localhost','127.0.0.1','[::1]'].includes(url.hostname) ? false : { rejectUnauthorized: true } }) });
  await client.connect();
  try {
    if (action === 'init') {
      await client.query(await readFile('supabase/schema.sql', 'utf8'));
      console.log('Created private storage in the existing database. Grant asx_ingest to a dedicated login before worker use; never expose asx_private through the Data API.');
    } else if (action === 'check') {
      const result = await client.query(`select n.nspname, c.relname, c.relrowsecurity, r.rolname,
        has_schema_privilege(r.oid,n.oid,'USAGE') as schema_access,
        has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE') as table_access
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join pg_roles r where n.nspname='asx_private' and c.relkind='r'
        and r.rolname in ('anon','authenticated','service_role','asx_ingest')`);
      if (result.rows.length < 2 || result.rows.some(row => !row.relrowsecurity || row.rolname !== 'asx_ingest' && (row.schema_access || row.table_access))) throw new Error('Database privacy checks failed');
      const probe = await client.query('select count(*)::int as count from asx_private.records');
      console.log(`Private schema/RLS checks passed; ${probe.rows[0].count} stored records accessible to this worker.`);
    } else if (action === 'push') {
      const records = recordsSchema.parse(await readJson('.local/records.json'));
      if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Duplicate canonical IDs');
      const state = await Promise.all(Object.entries(statePaths).map(async ([name,path]) => ({ name, payload: await readJson(path, name === 'candidates' ? [] : {}) })));
      const roundingRow = state.find(row => row.name === 'rounding')!;
      roundingRow.payload = RoundingSchema.parse({ ...await readJson<Record<string, unknown>>('data/rounding.json', {}), ...(roundingRow.payload as Record<string, unknown>) });
      await client.query('begin');
      try {
        for (const record of records) await client.query('insert into asx_private.records(id,record) values ($1,$2::jsonb) on conflict(id) do update set record=excluded.record, updated_at=now()', [record.id, JSON.stringify(record)]);
        for (const row of state) await client.query('insert into asx_private.worker_state(name,payload) values ($1,$2::jsonb) on conflict(name) do update set payload=excluded.payload, updated_at=now()', [row.name, JSON.stringify(row.payload)]);
        await client.query('commit');
      } catch (error) { await client.query('rollback'); throw error; }
      console.log(`Upserted ${records.length} local canonical records and worker state in one transaction; public release unchanged.`);
    } else {
      await client.query('begin isolation level repeatable read read only');
      const records = recordsSchema.parse((await client.query('select record from asx_private.records order by id')).rows.map(row => row.record));
      const state = (await client.query('select name,payload from asx_private.worker_state')).rows;
      await client.query('commit');
      const rounding = RoundingSchema.parse(state.find(row => row.name === 'rounding')?.payload ?? {});
      const partition = partitionRecords(records, rounding);
      // Export to a separate folder; restoring canonical data requires an explicit data:import command.
      await atomicJson('.local/database-export/records.json', records);
      for (const row of state) if (row.name in statePaths) await atomicJson(`.local/database-export/${row.name}.json`, row.payload);
      await atomicJson('.local/database-export/quarantined.json', partition.quarantined);
      console.log(`Exported ${records.length} records to .local/database-export; ${partition.quarantined.length} incomplete. Current records and public release unchanged.`);
    }
  } finally { await client.end(); }
}
// Avoid printing connection URLs or arbitrary server errors that may contain credentials.
main().catch(error => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted database URL]') : 'Database operation failed'); process.exitCode = 1; });
