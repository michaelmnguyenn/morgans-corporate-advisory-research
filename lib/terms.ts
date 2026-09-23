import { z } from 'zod';
import type { ArchiveRow } from './precedents';

const Found = <T extends z.ZodTypeAny>(value: T) => z.object({ value, source: z.string(), quote: z.string() });
export const TermsSchema = z.object({
  documents: z.array(z.string()),
  offerPrice: Found(z.number()).extend({ currency: z.string() }).nullable(),
  discounts: z.array(z.object({ percent: z.number(), basis: z.string(), source: z.string(), quote: z.string() })),
  underwritten: Found(z.enum(['fully', 'partially', 'not'])).nullable(),
  leadManagers: z.array(z.string()),
  leadSource: z.string().nullable(),
  ratio: Found(z.string()).nullable(),
  percentOfIssued: Found(z.number()).nullable(),
  useOfFunds: Found(z.string()).nullable(),
});
export const TermsFileSchema = z.object({ generatedAt: z.string(), raises: z.record(z.string(), TermsSchema) });
export type Terms = z.infer<typeof TermsSchema>;

const brokers: [string, RegExp][] = [
  ['Macquarie', /Macquarie Capital|Macquarie/], ['UBS', /\bUBS\b/], ['Goldman Sachs', /Goldman Sachs/], ['J.P. Morgan', /J\.?\s?P\.?\s?Morgan/],
  ['Morgan Stanley', /Morgan Stanley/], ['Barrenjoey', /Barrenjoey/], ['Jarden', /Jarden/], ['Canaccord Genuity', /Canaccord/],
  ['Morgans', /\bMorgans\b/], ['Bell Potter', /Bell Potter/], ['Euroz Hartleys', /Euroz|Hartleys/], ['Argonaut', /Argonaut/],
  ['Petra Capital', /Petra Capital/], ['Shaw and Partners', /Shaw and Partners|Shaw & Partners/], ['Ord Minnett', /Ord Minnett/],
  ['Wilsons', /Wilsons/], ['Citi', /\bCiti(?:group)?\b/], ['BofA Securities', /BofA|Bank of America|Merrill Lynch/], ['Jefferies', /Jefferies/],
  ['Taylor Collison', /Taylor Collison/], ['Moelis', /Moelis/], ['E&P', /\bE&P\b|Evans (?:&|and) Partners/], ['RBC', /\bRBC\b/],
  ['BMO', /\bBMO\b/], ['Cormark', /Cormark/], ['Veritas', /Veritas Securities/], ['Barclays', /Barclays/], ['Aitken Mount', /Aitken Mount/],
  ['Craigs', /Craigs Investment/], ['Forsyth Barr', /Forsyth Barr/], ['Deutsche Bank', /Deutsche/], ['Credit Suisse', /Credit Suisse/],
  ['Unified Capital', /Unified Capital/], ['Sternship', /Sternship/], ['Blue Ocean', /Blue Ocean Equities/], ['Tamesis', /Tamesis/],
  ['Berenberg', /Berenberg/], ['Stifel', /Stifel/], ['Cantor Fitzgerald', /Cantor/], ['Haywood', /Haywood/], ['Scotiabank', /Scotia/],
];

const clean = (text: string) => text.replace(/ /g, ' ').replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/\s+/g, ' ')
  .replace(/(A|NZ|US|C)\s?\$\s+/g, '$1$').replace(/\$\s+(\d)/g, '$$$1').replace(/(\d)\s+\.\s*(\d)/g, '$1.$2').replace(/(\d)\s+%/g, '$1%').replace(/non\s*-\s*/gi, 'non-');
const quoteAround = (text: string, index: number, length: number) => text.slice(Math.max(0, text.lastIndexOf(' ', index - 60) + 1), Math.min(text.length, index + length + 80)).trim();
const currencyOf = (prefix: string) => (prefix.startsWith('NZ') ? 'NZ$' : prefix.startsWith('US') ? 'US$' : prefix.startsWith('C$') ? 'C$' : 'A$');

const pricePatterns = [
  /(?:offer|issue|placement|subscription|application|entitlement offer|raising|fixed) price (?:of |is |will be |being )?(?:\([^)]{0,40}\) )?(?:of )?(A\$|NZ\$|US\$|C\$|\$)(\d{1,3}(?:\.\d{1,4})?)/i,
  /(?:at|price of|issued at|priced at) (?:an? (?:fixed |offer |issue )?price of )?(A\$|NZ\$|US\$|\$)(\d{1,3}\.\d{1,4}) (?:per|for each|a) (?:new |fully paid )?(?:ordinary )?(?:share|unit|security|stapled|CDI|New Share|Share)/i,
  /(?:offer|issue|placement) price (?:of |is )?(\d{1,3}(?:\.\d+)?) ?(cents|c) per/i,
  /(?:at|price of) (\d{1,3}(?:\.\d+)?) ?(cents|c) per (?:new )?(?:share|unit)/i,
];

function basisOf(phrase: string): string | null {
  const lower = phrase.toLowerCase();
  if (/theoretical|terp/.test(lower)) return 'TERP';
  const days = lower.match(/(\d+|five|ten|fifteen|twenty|thirty)[- ]?(?:trading[- ])?day/);
  if (/vwap|volume weighted/.test(lower)) {
    const words: Record<string, string> = { five: '5', ten: '10', fifteen: '15', twenty: '20', thirty: '30' };
    return days ? `${words[days[1]] ?? days[1]}-day VWAP` : 'VWAP';
  }
  if (/last|clos/.test(lower)) return 'last close';
  return null;
}

export function extractTerms(sources: { document: ArchiveRow; text: string }[]): Terms {
  const terms: Terms = { documents: sources.map(source => source.document.id), offerPrice: null, discounts: [], underwritten: null, leadManagers: [], leadSource: null, ratio: null, percentOfIssued: null, useOfFunds: null };
  for (const { document, text: raw } of sources) {
    const text = clean(raw);
    if (!terms.offerPrice || /floor/i.test(terms.offerPrice.quote)) {
      // Take the price sitting next to a discount statement, skipping scrip, option and SPP pricing.
      const found = pricePatterns.flatMap((pattern, rank) => [...text.matchAll(new RegExp(pattern.source, 'gi'))].map(match => ({ match, rank })))
        .map(({ match, rank }) => {
          const cents = /^(cents|c)$/i.test(match[2]);
          const value = cents ? Number(match[1]) / 100 : Number(match[2]);
          const before = text.slice(Math.max(0, match.index! - 120), match.index!);
          const after = text.slice(match.index!, match.index! + 260);
          const sentence = before.slice(-70).split(/[.•]\s/).pop() ?? '';
          const bad = /scrip|consideration|conversion|exercise|option|warrant|convertible|share purchase plan|\bSPP\b|lower of/i.test(sentence + match[0]);
          const score = (/discount|premium/i.test(after) ? 3 : 0) + (rank === 0 ? 1 : 0) + (cents || /^(A\$|\$)$/.test(match[1]) ? 2 : 0) - (/floor/i.test(before.slice(-40)) ? 2 : 0);
          return { match, value, currency: cents ? 'A$' : currencyOf(match[1]), bad, score };
        }).filter(row => !row.bad && row.value > 0 && row.value < 500)
        .sort((a, b) => b.score - a.score || a.match.index! - b.match.index!);
      const best = found[0];
      if (best && (!terms.offerPrice || !/floor/i.test(text.slice(Math.max(0, best.match.index! - 40), best.match.index!))))
        terms.offerPrice = { value: best.value, currency: best.currency, source: document.id, quote: quoteAround(text, best.match.index!, best.match[0].length) };
    }
    for (const match of text.replace(/\bnil discount/gi, '0% discount').matchAll(/(\d{1,2}(?:\.\d{1,2})?)% (?:discount|premium) to (?:the |its |[A-Z][\w]* ?'?s? )?((?:(?!\s(?:and|or)\s|\d+(?:\.\d+)?\s?%|[;•]|\.\s).){0,90})/gi)) {
      const basis = basisOf(match[2]);
      const context = text.slice(Math.max(0, match.index! - 160), match.index! + match[0].length);
      if (/share purchase plan|\bSPP\b|lower of|closing date|dividend reinvestment|conversion price/i.test(context)) continue;
      const percent = Number(match[1]) * (/premium/i.test(match[0]) ? -1 : 1);
      if (basis && !terms.discounts.some(discount => discount.basis === basis) && Math.abs(percent) < 60) terms.discounts.push({ percent, basis, source: document.id, quote: quoteAround(text, match.index!, match[0].length) });
    }
    if (!terms.underwritten || terms.underwritten.value === 'not') {
      const fully = text.match(/(?<!not |non-)fully underwritten/i);
      const partly = text.match(/partially underwritten|partly underwritten/i);
      const not = text.match(/non-underwritten|not underwritten|is not being underwritten/i);
      const match = fully ?? partly ?? (terms.underwritten ? null : not);
      if (match) terms.underwritten = { value: fully ? 'fully' : partly ? 'partially' : 'not', source: document.id, quote: quoteAround(text, match.index!, match[0].length) };
    }
    if (!terms.leadManagers.length) {
      const windows = [...text.matchAll(/(?:lead managers?|bookrunners?|underwriters?|lead manager and underwriter|arrangers?)/gi)].map(match => text.slice(Math.max(0, match.index! - 250), match.index! + 250));
      const names = brokers.filter(([, pattern]) => windows.some(window => pattern.test(window))).map(([name]) => name);
      if (names.length) { terms.leadManagers = names; terms.leadSource = document.id; }
    }
    if (!terms.ratio) {
      const match = text.match(/\b(1) (?:new \w+ |fully paid \w+ |\w+ )?(?:\(\w+\) )?for (?:every )?(\d{1,3}(?:\.\d+)?) (?:existing|fully paid|ordinary|shares?|units?|securities|stapled|CDIs|pro[- ]rata|accelerated|renounceable|non-renounceable|entitlement)/i);
      if (match && /entitlement|rights/i.test(text)) terms.ratio = { value: `1 for ${match[2]}`, source: document.id, quote: quoteAround(text, match.index!, match[0].length) };
    }
    if (!terms.percentOfIssued) {
      // Size of the new issue against existing shares, only where the sentence is about the new shares.
      for (const match of text.matchAll(/(\d{1,2}(?:\.\d{1,2})?)% of (?:the |its |[A-Z][\w’']*'?s )?(?:existing |current |total )?(?:ordinary |fully paid )?(?:shares|issued (?:share )?capital|securities|stapled securities|units|share capital)(?: (?:currently |then )?on issue| outstanding)?/gi)) {
        const before = text.slice(Math.max(0, match.index! - 200), match.index!);
        if (!/new (?:fully paid )?(?:ordinary )?(?:shares|securities|units|stapled|CDIs)|placement|entitlement offer|issue of|will be issued/i.test(before) || /acquir|own(?:ing|s)? |interest in|stake/i.test(before.slice(-80))) continue;
        terms.percentOfIssued = { value: Number(match[1]), source: document.id, quote: quoteAround(text, match.index!, match[0].length) };
        break;
      }
    }
    if (!terms.useOfFunds) {
      const sentence = text.split(/(?<=\.)\s+(?=[A-Z])/).find(line => /proceeds|funds raised|equity raising will|placement will|offer will/i.test(line) && /\b(used|use|fund|funding|applied|allocated|support|accelerate|advance|repay)\b/i.test(line) && line.length > 60 && line.length < 600 && !/costs of the offer only|forward.looking/i.test(line));
      if (sentence) terms.useOfFunds = { value: sentence.length > 320 ? `${sentence.slice(0, 317).replace(/\s\S*$/, '')}…` : sentence, source: document.id, quote: sentence.slice(0, 200) };
    }
  }
  // Where the sentence quotes the reference price, the stated discount has to agree with the offer price.
  if (terms.offerPrice) {
    const offer = terms.offerPrice.value;
    terms.discounts = terms.discounts.filter(discount => {
      const reference = discount.quote.slice(discount.quote.search(/\d+(?:\.\d+)?% (?:discount|premium)/)).match(/(?:of|at|was) (?:A\$|NZ\$|\$)(\d+\.\d+)/);
      if (!reference || discount.basis === 'TERP') return true;
      const implied = ((Number(reference[1]) - offer) / Number(reference[1])) * 100;
      return Math.abs(implied - discount.percent) <= 1.5;
    });
  }
  return terms;
}

// Discount to last close where the notice gives one, otherwise TERP, then the shortest VWAP.
export function mainDiscount(terms: Terms | undefined) {
  if (!terms?.discounts.length) return null;
  const order = (basis: string) => (basis === 'last close' ? 0 : basis === 'TERP' ? 1 : basis === 'VWAP' ? 50 : Number(basis.match(/\d+/)?.[0] ?? 40) + 1);
  return [...terms.discounts].sort((a, b) => order(a.basis) - order(b.basis))[0];
}
