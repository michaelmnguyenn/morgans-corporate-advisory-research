import { z } from 'zod';

export const UniverseCompanySchema = z.object({ ticker: z.string(), name: z.string(), sector: z.string() });
export const UniverseSchema = z.object({ source: z.string().url(), sourceAsOf: z.string(), checkedAt: z.string(), companies: z.array(UniverseCompanySchema) });
export const ArchiveRowSchema = z.object({ id: z.string(), date: z.string(), title: z.string(), url: z.string().url(), priceSensitive: z.boolean() });
export const ArchiveYearSchema = z.object({ year: z.number().int(), url: z.string().url(), checkedAt: z.string(), totalRows: z.number().int().nonnegative(), rows: z.array(ArchiveRowSchema), error: z.string().optional() });
export const CompanyArchiveSchema = z.object({ ticker: z.string(), years: z.array(ArchiveYearSchema) });
export const PrecedentCandidateSchema = z.object({
  id: z.string(), ticker: z.string(), company: z.string(), sector: z.string(), firstDate: z.string(), lastDate: z.string(),
  structure: z.enum(['placement', 'entitlement', 'spp', 'mixed', 'other']), status: z.literal('unverified'),
  documents: z.array(ArchiveRowSchema),
});
export const PrecedentIndexSchema = z.object({ generatedAt: z.string(), universeAsOf: z.string(), companyCount: z.number().int(), completeCompanies: z.number().int(), checkedCompanyYears: z.number().int(), expectedCompanyYears: z.number().int(),
  companies: z.array(UniverseCompanySchema.extend({ checkedYears: z.number().int(), noticeCount: z.number().int(), candidateCount: z.number().int() })).default([]),
  candidates: z.array(PrecedentCandidateSchema) });
export type ArchiveRow = z.infer<typeof ArchiveRowSchema>;
export type PrecedentCandidate = z.infer<typeof PrecedentCandidateSchema>;

const anchor = /(?:capital|equity|share) rais|\bplacement\b|entitlement|rights issue|share purchase plan|\bSPP\b|retail offer|institutional offer|retail shortfall/i;
const falsePositive = /employee|incentive|performance right|director|substantial holder|dividend reinvestment|reinvestment plan|recycling placement|capital notes?|court|appeal|litigation|underwrites? .*entitlement offer|to support .*entitlement offer/i;

export function isRaiseHeadline(title: string, ticker?: string): boolean {
  const otherIssuer = title.match(/^([A-Z0-9]{2,4}):\s*/);
  if (otherIssuer && ticker && otherIssuer[1] !== ticker) return false;
  if (/US Private Placement/i.test(title) && !/equity|share/i.test(title)) return false;
  return anchor.test(title) && !falsePositive.test(title);
}

export function parseArchiveHtml(html: string, year: number, ticker?: string): { totalRows: number; rows: ArchiveRow[] } {
  if (!/Search results: Company announcements|Search results for Company announcements/i.test(html) || !html.includes(String(year))) throw new Error('Unexpected ASX archive response');
  const rowElements = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows: ArchiveRow[] = [];
  for (const [, element] of rowElements) {
    const date = element.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    const filing = element.match(/<a\b[^>]*href="([^"]*displayAnnouncement\.do\?[^"<]*idsId=(\d+))[^"]*"[^>]*>([\s\S]*?)<br\s*\/?\s*>/i);
    if (!date || !filing || Number(date[3]) !== year) continue;
    const title = filing[3].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const link = new URL(filing[1].replace(/&amp;/g, '&'), 'https://www.asx.com.au');
    if (link.protocol !== 'https:' || link.hostname !== 'www.asx.com.au') continue;
    rows.push({ id: filing[2], date: `${date[3]}-${date[2]}-${date[1]}`, title,
      url: link.toString(),
      priceSensitive: /icon-price-sensitive\.svg/i.test(element) });
  }
  return { totalRows: rows.length, rows: rows.filter(row => isRaiseHeadline(row.title, ticker)) };
}

function structureOf(rows: ArchiveRow[]): PrecedentCandidate['structure'] {
  const all = rows.map(row => row.title).join(' ');
  const types = [ /placement/i.test(all) && 'placement', /entitlement|rights issue/i.test(all) && 'entitlement', /share purchase plan|\bSPP\b/i.test(all) && 'spp' ].filter(Boolean);
  return types.length > 1 ? 'mixed' : (types[0] || 'other') as PrecedentCandidate['structure'];
}

export function groupCandidates(ticker: string, company: string, sector: string, rows: ArchiveRow[]): PrecedentCandidate[] {
  const sorted = [...new Map(rows.filter(row => isRaiseHeadline(row.title, ticker)).map(row => [row.id, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const clusters: ArchiveRow[][] = [];
  for (const row of sorted) {
    const previous = clusters.at(-1);
    const days = previous ? (Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${previous.at(-1)!.date}T00:00:00Z`)) / 86_400_000 : Infinity;
    if (!previous || days > 45) clusters.push([row]); else previous.push(row);
  }
  return clusters.map(documents => ({ id: `${ticker}-${documents[0].date}-${documents[0].id}`, ticker, company, sector,
    firstDate: documents[0].date, lastDate: documents.at(-1)!.date, structure: structureOf(documents),
    status: 'unverified' as const, documents }));
}

export function similarity(a: PrecedentCandidate, b: PrecedentCandidate): number {
  if (a.id === b.id) return -1;
  return (a.sector === b.sector ? 3 : 0) + (a.structure === b.structure ? 3 : 0) + (a.ticker === b.ticker ? 1 : 0);
}
