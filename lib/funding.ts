import { z } from 'zod';
import { ArchiveRowSchema, type ArchiveRow } from './precedents';

export const instruments = [
  { id: 'convertible', label: 'Convertible notes' },
  { id: 'hybrid', label: 'Hybrids and subordinated notes' },
  { id: 'bond', label: 'Bonds and notes' },
  { id: 'facility', label: 'Loan facilities' },
  { id: 'royalty', label: 'Royalty, stream or prepayment' },
] as const;
export type Instrument = typeof instruments[number]['id'];

// Routine notices about instruments already on issue. Soft matches are kept when the title also announces a new issue.
const routine = /distribution (?:rate|payment|amount)|interest (?:rate|payment)|dividend rate|payment date|record date|margin (?:determination|set)|coupon (?:rate|payment)|resale|cleansing|appendix|quotation|reinvestment|conversion notice|exchange notice|monthly|quarterly|half[- ]year|annual report|results|trading halt|pause in trading|suspension|reinstatement|change of director|substantial holder|\bD&O\b|ceasing|securities trading policy|removal|letter to (?:holders|shareholders)|correspondence|despatch|dispatch|substitution|call notice|early redemption|repaid|maturity|terms amendment|amended terms|amendments to|indenture|put option|price adjustment|notice to noteholders|questions concerning|tender offer|power station|hybrid power|update on|final distribution|election to|newsletter|change of trustee|trust deed|amending deed|programme|program update|offering circular and pricing supplement|8-?K|form 8|warrant prospectus|\bupdate$/i;
const soft = /redeem|redemption|repurchase|buy-?back|repays?|conversion of|converts|exchange and purchase|option to issue/i;
const issuing = /offering|\bissues? |new /i;

const patterns: [Instrument, RegExp][] = [
  ['convertible', /convertible (?:notes?|bonds?|securities|debentures?)|exchangeable (?:notes?|bonds?)|\bconvertibles?\b/i],
  ['royalty', /royalt(?:y|ies) (?:financing|funding|agreement|deal|sale|transaction|package)|sells? .{0,30}royalty|(?:gold|silver|metals?) stream|stream(?:ing)? (?:agreement|financing|facility|deal|transaction)|prepayment (?:facility|agreement)|offtake (?:prepayment|financing)/i],
  ['bond', /senior (?:unsecured |secured )?notes|notes? offering|\bUSPP\b|US private placement|medium term notes?|\bMTN\b/i],
  ['hybrid', /capital notes|\bPERLS\b|hybrid (?:issue|notes|offer|securities|capital)|subordinated notes|tier (?:1|2|one|two) capital|additional tier 1|\bAT1\b|reset preference|hybrid (?:capital )?securities/i],
  ['bond', /\bbonds?\b|medium term notes?|\bMTN\b|US private placement|\bUSPP\b|senior (?:unsecured |secured )?notes|notes? (?:offering|issue|pricing)|eurobond|green notes?|sustainability[- ]linked notes?/i],
  ['facility', /(?:debt|loan|credit|term|revolving|syndicated|bridge|acquisition|project|finance|financing|green|working capital) facilit(?:y|ies)|refinanc|project financ|debt financing|debt funding|debt package|funding package|syndicated loan|loan agreement|credit approved|debt raising|debt raise|debt commitments|term debt|wholesale (?:notes|debt)|notes pricing/i],
];

export function instrumentOf(title: string): Instrument | null {
  if (routine.test(title) || (soft.test(title) && !issuing.test(title))) return null;
  return patterns.find(([, pattern]) => pattern.test(title))?.[0] ?? null;
}

export const FundingDealSchema = z.object({
  id: z.string(), ticker: z.string(), company: z.string(), sector: z.string(), instrument: z.enum(['convertible', 'hybrid', 'bond', 'facility', 'royalty']),
  firstDate: z.string(), lastDate: z.string(), documents: z.array(ArchiveRowSchema),
});
export const FundingIndexSchema = z.object({ generatedAt: z.string(), checkedCompanyYears: z.number().int(), deals: z.array(FundingDealSchema) });
export type FundingDeal = z.infer<typeof FundingDealSchema>;

// Notices for the same instrument within 60 days are treated as one transaction.
export function groupFunding(ticker: string, company: string, sector: string, rows: ArchiveRow[]): FundingDeal[] {
  const deals: FundingDeal[] = [];
  const sorted = [...new Map(rows.map(row => [row.id, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of sorted) {
    const instrument = instrumentOf(row.title);
    if (!instrument) continue;
    const open = deals.findLast(deal => deal.instrument === instrument);
    const gap = open ? (Date.parse(row.date) - Date.parse(open.lastDate)) / 86_400_000 : Infinity;
    if (open && gap <= 60) { open.documents.push(row); open.lastDate = row.date; }
    else deals.push({ id: `${ticker}-${instrument}-${row.date}-${row.id}`, ticker, company, sector, instrument, firstDate: row.date, lastDate: row.date, documents: [row] });
  }
  return deals;
}
