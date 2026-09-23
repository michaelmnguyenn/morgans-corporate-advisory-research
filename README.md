# ASX Equity Raising Precedents

The site starts from a company and what it needs the money for. You pick an ASX 200 company, choose the use of funds and optionally describe the objective, and the page shows that company's own raising history, same-sector comparables whose headlines mention the same purpose, and same-purpose raises outside the sector, with a first view on which structure the comparables used most often.

The comparables come from five years of ASX announcement headlines for the 200 equity holdings in BlackRock's IOZ portfolio, grouped into candidate raises and linked to the ASX notices. Offer price, discount, underwriting, lead managers and use of funds are read from each launch announcement PDF by `npm run data:terms`, and each value links to the notice it came from. Convertibles, hybrids, bonds, announced loan facilities and royalty deals come from `npm run data:funding` and `npm run data:funding-terms`, and market cap and post-raise share prices from `npm run data:market`. Run `npm run data:backfill -- --all` to resume archive collection, or `npm run data:backfill -- --ticker=PDN` for one company, and see [the research data map](docs/RESEARCH-DATA.md) for coverage.

The earlier Morgans deal studies (`components/DealModels.tsx`, `data/morgans-deals.json`) are kept in the repository but are no longer published.

## Built with

Next.js, React, TypeScript and Zod, exported as a static site on GitHub Pages.

```bash
npm ci
npm run dev
```
