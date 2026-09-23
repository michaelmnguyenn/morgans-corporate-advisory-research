# ASX 200 research data map

The screen uses the 200 ASX equity holdings in BlackRock's IOZ portfolio as a current-member proxy. `data/research/universe.json` records the source URL, holdings date, check time, company code, name and sector. It is not a reconstruction of historic index membership, and another year's holdings can differ. The project stores only these identifying fields, not portfolio weights or prices.

`data/research/announcements/<TICKER>.json` holds one record per archive year from 2021 through 2026. Each year records the ASX search URL, retrieval time, number of announcement rows seen, screened headline rows and any error. The 2021 rows start on 23 September, making a five-year lookback from the first collection date. A saved error is not counted as coverage. The collector only saves likely raise headlines and their announcement IDs, not whole ASX pages or PDF contents. Re-running the command skips successfully collected years and retries failures; `--refresh-current-year` checks 2026 again without repeating older years.

`data/research/candidates.json` is rebuilt from the company files. It groups screened titles for one ticker when they are no more than 45 days apart, labels each group unverified and retains the links to every matched source notice. This grouping is a research convenience, not proof the documents belong to one transaction. Generic securities forms, undisclosed raises and unusually titled announcements can be missed; unrelated raises close in time can be combined. The ASX announcement link may lead through ASX's access-terms page before the PDF.

The research record needed for a usable precedent remains separate: a human or evidence-controlled extractor must confirm structure, launch date, amount, offer price, purpose, completion, independent issued-share count and the source location supporting each field. Discount and dilution then need an unaffected price and pre-raise share count. The existing release pipeline in `docs/PIPELINE.md` enforces core evidence before publishing verified transactions. Neither this headline screen nor its rough similarity links enter that release automatically.

The homepage follows that sequence in a working view: filter the headline register, open a group, read the linked ASX notices, enter terms with a source/page note, then inspect the calculated new shares, discount and dilution. The working sheet is deliberately separate from the saved candidate index. Its inputs persist in the browser's local storage and can be downloaded one row at a time as CSV; they are not synced between devices or promoted to verified deal data. The three completed Morgans examples remain at `/case-studies`, and the daily announcement queue remains at `/today`.

Commands:

```bash
npm run data:backfill -- --limit=5
npm run data:backfill -- --ticker=PDN
npm run data:backfill -- --all
npm run data:backfill -- --all --refresh-current-year
npm run data:backfill -- --reindex
npm run data:backfill -- --refresh-universe --limit=5
```

The full run makes up to 1,200 year-by-company requests, spaces them by at least 600 milliseconds and saves each year before moving on. It can resume after interruption. The current holdings source should be reviewed before refreshing the universe because a changed member list alters the project boundary; files for former members are retained but omitted from the current candidate index.
