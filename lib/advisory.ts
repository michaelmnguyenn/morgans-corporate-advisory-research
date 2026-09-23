import type { PrecedentCandidate } from './precedents';
import type { FundingDeal } from './funding';
import { mainDiscount, type Terms } from './terms';

export const purposes = [
  { id: 'any', label: 'Any purpose' },
  { id: 'acquisition', label: 'Acquisition or investment' },
  { id: 'project', label: 'Project development' },
  { id: 'growth', label: 'Growth or expansion' },
  { id: 'balance', label: 'Balance sheet or debt' },
] as const;
export type Purpose = typeof purposes[number]['id'];

const purposePatterns: Record<Exclude<Purpose, 'any'>, RegExp> = {
  acquisition: /acquisit|acquire|merger|takeover|investment in|investments in|strategic interests|purchase of/i,
  project: /project|develop|construction|restart|production|mine\b|mining/i,
  growth: /growth|working capital|commercialis|new contract|rollout|expan(?:d|sion)|capacity|accelerate/i,
  balance: /balance sheet|debt|repay|refinanc|liquidity|fortify|de-risk/i,
};

const weakHeadline = /\bD&O notices?\b|participat(?:e|ion) in .*capital rais|support and participate in .*equity rais/i;
const boilerplate = /presentation|cleansing|booklet|letter|appendix|capital change|reminder|webinar|opens?\b|closes?\b|closing|dispatch|s708|section 708|results of|prospectus|offer document|trading halt/i;
const stopWords = new Set(['about', 'after', 'capital', 'company', 'equity', 'fund', 'funding', 'raise', 'raising', 'the', 'this', 'will', 'with', 'placement', 'offer', 'share', 'shares']);
const tokens = (value: string) => [...new Set((value.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(word => !stopWords.has(word)))];
const textOf = (candidate: PrecedentCandidate) => candidate.documents.map(document => document.title).join(' ');

export function purposesOf(candidate: PrecedentCandidate): Exclude<Purpose, 'any'>[] {
  const text = textOf(candidate);
  return (Object.keys(purposePatterns) as Exclude<Purpose, 'any'>[]).filter(purpose => purposePatterns[purpose].test(text));
}

export function matchesPurpose(text: string, purpose: Purpose): boolean {
  return purpose === 'any' || purposePatterns[purpose].test(text);
}

export function comparableFunding(deal: FundingDeal, statedPurpose: string | undefined, purpose: Purpose): boolean {
  const title = deal.documents.map(document => document.title).join(' ');
  if (deal.instrument === 'facility' && /funding package/i.test(title) && !/\b(?:loan|debt|credit|facilit)/i.test(title)) return false;
  if (purpose === 'project' && statedPurpose && /\b(?:repay|repayment|refinanc\w*|pay down)\b/i.test(statedPurpose)) return false;
  return matchesPurpose(`${title} ${statedPurpose ?? ''}`, purpose);
}

export function usableCandidate(candidate: PrecedentCandidate): boolean {
  return candidate.documents.some(document => !weakHeadline.test(document.title));
}

// Keep these in the source list, but do not let a merged follow-on or unclear structure set the benchmark.
export function benchmarkable(candidate: PrecedentCandidate): boolean {
  const text = textOf(candidate);
  if (!usableCandidate(candidate) || candidate.structure === 'other' || /follow-on placement/i.test(text)) return false;
  if (candidate.structure === 'spp' && /(?:equity|capital) rais/i.test(text)) return false;
  return true;
}

// The headline most likely to say what the raise was for, skipping booklets, cleansing notices and the like.
export function describe(candidate: PrecedentCandidate): PrecedentCandidate['documents'][number] {
  const useful = candidate.documents.filter(document => !boilerplate.test(document.title) && !weakHeadline.test(document.title));
  const pool = useful.length ? useful : candidate.documents;
  return pool.find(document => Object.values(purposePatterns).some(pattern => pattern.test(document.title)) || /\b(to|for)\b/i.test(document.title))
    ?? pool.find(document => amountsIn(document.title).length) ?? pool[0];
}

export type Amount = { currency: 'A$' | 'NZ$' | 'US$' | 'EUR'; millions: number };
const amountPattern = /(A\$|NZ\$|US\$|AUD ?|EUR ?|\$)\s?(\d[\d,]*(?:\.\d+)?)\s?(m\b|mn\b|million\b|bn\b|billion\b)/gi;

export function amountsIn(title: string): Amount[] {
  return [...title.matchAll(amountPattern)].map(([, prefix, value, unit]) => {
    const code = prefix.trim().toUpperCase();
    const currency = code === 'NZ$' ? 'NZ$' : code === 'US$' ? 'US$' : code === 'EUR' ? 'EUR' : 'A$';
    const millions = Number(value.replace(/,/g, '')) * (/^b/i.test(unit) ? 1000 : 1);
    return { currency, millions } as Amount;
  });
}

// Largest amount named across the raise's headlines, preferring Australian dollars when a headline gives both.
export function headlineSize(candidate: PrecedentCandidate): Amount | null {
  const all = candidate.documents.flatMap(document => amountsIn(document.title));
  const aud = all.filter(amount => amount.currency === 'A$');
  const pool = aud.length ? aud : all;
  return pool.length ? pool.reduce((a, b) => (b.millions > a.millions ? b : a)) : null;
}

export function formatAmount(amount: Amount | null): string {
  if (!amount) return '';
  const value = amount.millions >= 1000 ? `${(amount.millions / 1000).toFixed(amount.millions % 1000 ? 2 : 1).replace(/0$/, '')}bn` : `${Number(amount.millions.toFixed(1))}m`;
  return `${amount.currency}${value}`;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export type Match = { candidate: PrecedentCandidate; own: boolean; sameSector: boolean; samePurpose: boolean; score: number };

export function rankComparables(candidates: PrecedentCandidate[], ticker: string, sector: string, purpose: Purpose, keywords: string): Match[] {
  const wanted = tokens(keywords);
  return candidates.filter(usableCandidate).map(candidate => {
    const own = candidate.ticker === ticker;
    const sameSector = candidate.sector === sector;
    const samePurpose = purpose === 'any' || purposesOf(candidate).includes(purpose);
    const words = tokens(textOf(candidate));
    const overlap = wanted.filter(word => words.some(other => other.startsWith(word))).length;
    const score = (own ? 20 : 0) + (sameSector ? 5 : 0) + (samePurpose && purpose !== 'any' ? 5 : 0) + overlap * 3 + (candidate.lastDate >= '2024-01-01' ? 1 : 0);
    return { candidate, own, sameSector, samePurpose, score };
  }).sort((a, b) => b.score - a.score || b.candidate.lastDate.localeCompare(a.candidate.lastDate));
}

// Structure from the headlines, splitting the combined case into what was actually combined.
export function structureName(candidate: PrecedentCandidate): string {
  const text = textOf(candidate);
  if (candidate.structure === 'spp' && /(?:equity|capital) rais/i.test(text)) return 'Equity raise + SPP (type unclear)';
  if (candidate.structure !== 'mixed') return ({ placement: 'Placement', entitlement: 'Entitlement offer', spp: 'SPP', other: 'Not clear' } as const)[candidate.structure];
  const entitlement = /entitlement|rights issue/i.test(text);
  const spp = /share purchase plan|\bSPP\b/i.test(text);
  return entitlement && spp ? 'Placement, entitlement + SPP' : entitlement ? 'Placement + entitlement' : 'Placement + SPP';
}

export function structureSummary(matches: Match[], terms: Record<string, Terms>) {
  const groups = new Map<string, Match[]>();
  for (const match of matches) groups.set(structureName(match.candidate), [...(groups.get(structureName(match.candidate)) ?? []), match]);
  return [...groups].map(([structure, rows]) => {
    const sizes = rows.map(row => headlineSize(row.candidate)).filter((amount): amount is Amount => amount?.currency === 'A$').map(amount => amount.millions);
    const discounts = rows.map(row => mainDiscount(terms[row.candidate.id])).filter(discount => discount?.basis === 'last close').map(discount => discount!.percent);
    const underwritten = rows.filter(row => terms[row.candidate.id]?.underwritten?.value === 'fully').length;
    return { structure, count: rows.length, medianSize: median(sizes), sized: sizes.length, medianDiscount: median(discounts), discounted: discounts.length, underwritten, examples: [...new Set(rows.map(row => row.candidate.ticker))].slice(0, 4) };
  }).sort((a, b) => b.count - a.count);
}

export function leadManagerCounts(matches: Match[], terms: Record<string, Terms>) {
  const counts = new Map<string, number>();
  for (const match of matches) for (const name of terms[match.candidate.id]?.leadManagers ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
