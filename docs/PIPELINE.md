# Local evidence pipeline

The website reads the bundled `data/release.json` and needs no account, database or network connection to calculate scenarios. Research records remain in `.local/records.json` until the explicit release command checks their evidence. No deployment or hosted database has been activated.

## Import and publish

```bash
npm run data:import -- data/researched-deals.json
npm run data:release
npm run dev
```

An import accepts a JSON array or an object with a `deals` array, and merges records by stable event ID. Each record must have an ID. Reimporting the same file does not duplicate events, and two identical IDs in one input fail before writing. Partial objects are retained, so research can continue without inventing missing fields. The import writes reasons for exclusions to `.local/pipeline/quarantined.json` and leaves the public snapshot unchanged.

A release includes only completed events with sourced launch and completion dates, known point-in-time operating stage, last unaffected close and pre-raise shares. Every supplied numeric field needs its own `fieldSources` reference. Each included leg needs price, announced and completed proceeds, independently disclosed issued shares and completion date, with keys such as `legs.placement.price`. Those references must resolve to a source containing a page or section and a supporting extract. `stageNote` records the classification rationale, and the event completion date equals the latest included leg completion.

These checks establish that the evidence record is present; they cannot prove that a human attached the correct paragraph. Researchers must read the linked announcement and ensure that the excerpt supports the specific field, date, ordinary-share class and leg. An offer proposal is not proof of completed allotment. Independent shares must come from the disclosure, never be calculated by dividing proceeds by price and then labelled reported.

Missing optional VWAP, liquidity and aftermarket figures remain null. Missing core pricing or completion evidence keeps the entire event out of the release. Quarantined record counts and unresolved discovered-document counts contribute to the coverage total; that total counts unresolved items, not distinct unidentified deals. If every record is excluded, release fails and preserves the previous snapshot. Partial records stay available in the local queue.

## Rounding and reproducibility

The default independent proceeds check permits only A$0.01 for numerical conversion noise. A rounding allowance needs a source-backed entry in committed `data/rounding.json`, keyed by event and leg ID. The unit describes the published precision, so proceeds stated to the nearest A$0.1m allow a difference of A$0.05m. It is not a percentage tolerance.

```json
{
  "example-event/placement": {
    "proceedsUnitM": 0.1,
    "sourceId": "completion-announcement",
    "note": "Completed proceeds stated to the nearest A$0.1 million on page 1."
  }
}
```

Use the actual disclosure precision rather than increasing the unit until a discrepancy passes. The implementation rejects units above A$1m; less precise large raisings need further research or a deliberate model extension. `.local/rounding.json` can override entries for local research. Commit verified changes to `data/rounding.json` before sharing a release so another checkout can reproduce them. The release version includes the record and rounding inputs, and `data/release-manifest.json` records the rounding hash and snapshot SHA-256.

Before replacing the public file, the worker validates the candidate and saves a versioned copy and the previous snapshot under `.local/releases/`. To restore a local snapshot, copy the chosen version back to `data/release.json`, regenerate its manifest through the release workflow when appropriate and rebuild the app. Keep published JSON and its matching manifest together when copying a release between machines.

## Discover and extract

```bash
npm run data:update
npm run data:pdf -- /absolute/path/announcement.pdf
```

`npm run data:backfill -- --all` builds the separate current-ASX-200 headline index in `data/research/` that feeds the homepage, using IOZ equity holdings as the current-company proxy and the ASX yearly company announcement search as the document index. The [research data map](RESEARCH-DATA.md) describes the folders, coverage measures, headline grouping, source links and the remaining field-verification work. This backfill is manual and is not part of the deployment job.

Discovery supports reviewed JSON Feed and RSS 2.0 endpoints in `data/source-registry.json`. Each source requires an enabled flag, recorded access review, review date, rights note and exact hostname allowlist. The initial registry can be empty, in which case the command explicitly reports that no unattended coverage exists. Do not treat recent manual research as a market-wide checked-through date.

The worker applies conditional requests, a 2 MB feed limit, a 15-second request timeout, a 40-feed run limit and spacing between requests to one host. It rejects redirects and private addresses. An ASX host can be configured when its exact hostname is allowlisted and the registry records the reviewed access permission, but the current worker only understands JSON Feed and RSS, not ASX's announcement JSON. Failed sources retain their previous successful cursor and store the error. A changed feed item returns to the unresolved queue. A feed title identifies a candidate; discovery never promotes it into a completed deal.

The PDF command extracts local text with Poppler or the pinned pypdf fallback. To install the fallback in this project:

```bash
python3 -m venv .local/pdf-venv
.local/pdf-venv/bin/python -m pip install -r scripts/pdf-requirements.txt
```

`PDF_PYTHON` can select another interpreter with pypdf installed. The worker retains page references and candidate lines in `.local/extracted/`, limits PDFs to 30 MB and stops extraction after 30 seconds. Scanned PDFs with little extracted text are marked `needsOcr`. OCR and semantic event extraction are not implemented; those files require further research and cannot publish themselves.

The general evidence pipeline has no active refresh schedule. `.github/workflows/manual-check.yml` runs only when manually dispatched after a future GitHub upload, checks the application and never collects or publishes deal data. Connecting permitted feeds and maintaining unfamiliar-document exceptions remain separate operating work.

## Optional PostgreSQL storage

The local JSON pipeline is the default. `scripts/database.ts` can store and recover canonical records and worker state in an existing PostgreSQL or Supabase database, without adding database access to the browser. It uses `pg`, parameterised writes and a transaction covering the records and state. The compact JSONB store preserves partial research and decimal input values; it is not the fully normalised multi-table research warehouse described in the original plan.

Set `DATABASE_URL` in the shell for these commands. It is never a `NEXT_PUBLIC_` value, and these scripts do not automatically load `.env`. Keep real credentials out of the repository.

```bash
npm run data:db -- init
npm run data:db -- check
npm run data:db -- push
npm run data:db -- pull
```

`init` applies `supabase/schema.sql` to an existing database using a schema administrator. The SQL creates `asx_private`, enables RLS, revokes access from public and Supabase API roles and grants limited access to a NOLOGIN `asx_ingest` group. An administrator must grant that group to a dedicated ingestion login. Keep `asx_private` out of exposed Data API schemas and disable the Data API if it is unused. No login password is included in the SQL and no hosted project is provisioned. This is a standalone bootstrap SQL file, not a generated Supabase migration.

Use a verified TLS connection for a remote database and the provider's current connection details. `check` queries schema/table privileges, RLS flags and record access; it rejects API-role access or missing RLS. `push` upserts canonical records without deleting database records that are absent locally. `pull` takes a consistent read-only snapshot and exports into `.local/database-export/`, leaving the active local records and website untouched. Copy any exported rounding entries into the research configuration and use `data:import` on exported records for an explicit restore.

No PostgreSQL server or credentials are needed for localhost use. Database SQL and a real restore must be verified with `init`, `check`, `push` and `pull` against the eventual database before calling that optional integration operational. Supabase's current [API security documentation](https://supabase.com/docs/guides/api/securing-your-api) explains the separate grants, RLS and exposed-schema controls.

## Checks

```bash
npm run test:pipeline
npm run typecheck
```

Pipeline tests cover feed parsing and host restrictions, source provenance and missing core fields, explicit rounding, duplicate identities, idempotent import, preservation of incomplete records, release rejection, unresolved counts and retention of the previous snapshot. Integration tests run in temporary directories with synthetic fixtures and do not change the research dataset or public release.
