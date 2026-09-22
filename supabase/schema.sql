-- Optional bootstrap for an existing PostgreSQL/Supabase database. No hosted resource is created.
-- Keep asx_private OUT of the Supabase Data API exposed schemas; disable that API if unused.
begin;
create schema if not exists asx_private;
revoke all on schema asx_private from public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'asx_ingest') then
    create role asx_ingest nologin;
  end if;
end $$;
create table if not exists asx_private.records (
  id text primary key,
  record jsonb not null check (jsonb_typeof(record) = 'object' and record->>'id' = id),
  updated_at timestamptz not null default now()
);
create table if not exists asx_private.worker_state (
  name text primary key check (name in ('cursors', 'candidates', 'rounding', 'run')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on all tables in schema asx_private from public;
revoke all on all sequences in schema asx_private from public;
alter default privileges in schema asx_private revoke all on tables from public;
alter default privileges in schema asx_private revoke execute on functions from public;
alter table asx_private.records enable row level security;
alter table asx_private.worker_state enable row level security;
drop policy if exists ingest_records on asx_private.records;
create policy ingest_records on asx_private.records to asx_ingest using (true) with check (true);
drop policy if exists ingest_state on asx_private.worker_state;
create policy ingest_state on asx_private.worker_state to asx_ingest using (true) with check (true);
grant usage on schema asx_private to asx_ingest;
grant select, insert, update on asx_private.records, asx_private.worker_state to asx_ingest;
-- Supabase roles do not exist on a plain local PostgreSQL installation.
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on schema asx_private from %I', role_name);
      execute format('revoke all on all tables in schema asx_private from %I', role_name);
      execute format('revoke all on all sequences in schema asx_private from %I', role_name);
    end if;
  end loop;
end $$;
commit;
