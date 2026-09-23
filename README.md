# ASX Equity Raising Precedents

The site starts from a company and what it needs the money for. You pick an ASX 200 company, choose the use of funds and enter a funding need if known. The first view compares the structures in similar equity raises with same-sector debt and other funding notices, then opens the linked ASX announcements. An illustrative model uses a dated share-price close and user-entered shares and debt to calculate market capitalisation, equity dilution and debt as a share of total capital.

The comparables come from five years of ASX announcement headlines for the 200 equity holdings in BlackRock's IOZ portfolio, grouped into candidate raises and linked to the ASX notices. Offer price, discount, underwriting, lead managers and use of funds are read from each launch announcement PDF by `npm run data:terms`, and each value links to the notice it came from. Convertibles, hybrids, bonds, announced loan facilities and royalty deals come from `npm run data:funding` and `npm run data:funding-terms`, and market cap and post-raise share prices from `npm run data:market`. Run `npm run data:backfill -- --all` to resume archive collection, or `npm run data:backfill -- --ticker=PDN` for one company, and see [the research data map](docs/RESEARCH-DATA.md) for coverage.

Run `npm run data:quotes` to refresh the 200-company share-price snapshot before building. The published site is static and does not fetch live prices. Shares on issue and gross debt are not filled from stale Yahoo financial statements; enter figures from dated company filings before using the optional calculation. The amount compares size without filtering the results. This is a precedent screener, not a financing recommendation or a verified deal census.

The earlier Morgans deal studies (`components/DealModels.tsx`, `data/morgans-deals.json`) are kept in the repository but are no longer published.

## Built with

Next.js, React, TypeScript and Zod, exported as a static site on GitHub Pages.

```bash
npm ci
npm run dev
```
