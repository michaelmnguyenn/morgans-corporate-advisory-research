# Morgans Corporate Advisory Research

Independent research into three ASX equity raises on which Morgans acted as lead manager. Not affiliated with or endorsed by Morgans.

| Company | Date | Structure | Raised |
|---|---|---|---|
| Wagners Holding Company | September 2025 | Institutional placement | A$30m at A$2.60 |
| 29Metals | January 2026 | Accelerated non-renounceable entitlement offer | A$150m at A$0.40 |
| EBR Systems | May 2025 | Institutional placement of CDIs | A$55.9m at A$1.00 |

For each raise the site sets out the use of funds, how the offer worked and why that structure was chosen, then tests the outcome against the targets stated at launch, with a link to the company report or filing behind each result. A funding model shows new shares issued and dilution under alternative offer prices, and a chart tracks the daily share price against the offer price.

## Method

Targets come from each company's launch announcement and outcomes from subsequent ASX announcements, quarterly and half-year reports and SEC filings. Share prices are daily closes from Yahoo Finance to 21 September 2026. Limitations are listed on the overview page.

## Built with

Next.js, React, TypeScript and Decimal.js, exported as a static site and hosted on GitHub Pages. Deal data is in `data/morgans-deals.json` and validated in `lib/morgans.ts`.

```bash
npm ci
npm run dev
```
