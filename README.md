# Morgans Corporate Advisory Research

The homepage is an ASX equity-raising precedent register. It screens five years of ASX announcement headlines for the 200 equity holdings in BlackRock's current IOZ portfolio, then opens each candidate in a working sheet with source links, term inputs and calculated share issuance, discount and dilution. The register is a source-screened research queue, not a database of verified deal terms.

The three researched Morgans deals remain available at `/case-studies`:

| Company | Date | Structure | Raised |
|---|---|---|---|
| Wagners Holding Company | September 2025 | Institutional placement | A$30m at A$2.60 |
| 29Metals | January 2026 | Accelerated non-renounceable entitlement offer | A$150m at A$0.40 |
| EBR Systems | May 2025 | Institutional placement of CDIs | A$55.9m at A$1.00 |

For each raise the site sets out the use of funds, how the offer worked and why that structure was chosen, then tests the outcome against the targets stated at launch, with a link to the company report or filing behind each result. A funding model shows new shares issued and dilution under alternative offer prices, and a chart tracks the daily share price against the offer price.

The separate `/today` screen shows possible equity-raising announcements from the latest ASX check. These are headline candidates, not researched or verified precedent deals. Saved announcements and notes remain in the browser. Run `npm run data:today` to update the snapshot locally before building; the GitHub Pages workflow is configured to repeat the check on weekdays once deployed.

The precedent register also remains at `/precedents`. Its source is the 200 equity holdings of BlackRock's IOZ fund, and it shows how many ASX company-years have actually been checked. Working-sheet entries stay in the current browser unless downloaded as CSV; they do not update the saved research index or turn a candidate into a verified precedent. Run `npm run data:backfill -- --all` to resume archive collection, or `npm run data:backfill -- --ticker=PDN` for one company; see [the research data map](docs/RESEARCH-DATA.md).

## Method

Targets come from each company's launch announcement and outcomes from subsequent ASX announcements, quarterly and half-year reports and SEC filings. Share prices are daily closes from Yahoo Finance to 21 September 2026. Limitations are listed on the overview page.

## Built with

Next.js, React, TypeScript and Decimal.js, exported as a static site on GitHub Pages. Deal data is in `data/morgans-deals.json` and validated in `lib/morgans.ts`.

```bash
npm ci
npm run dev
```
