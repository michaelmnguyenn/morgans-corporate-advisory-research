import { z } from 'zod';
import type { Instrument } from './funding';
import type { ArchiveRow } from './precedents';

const Found = <T extends z.ZodTypeAny>(value: T) => z.object({ value, source: z.string(), quote: z.string() }).nullable();
export const FundingTermsSchema = z.object({
  documents: z.array(z.string()),
  size: Found(z.object({ currency: z.string(), millions: z.number() })),
  coupon: Found(z.number()),
  margin: Found(z.object({ percent: z.number(), over: z.string() })),
  maturity: Found(z.string()),
  conversionPremium: Found(z.number()),
  counterparties: z.array(z.string()),
  purpose: Found(z.string()),
});
export const FundingTermsFileSchema = z.object({ generatedAt: z.string(), deals: z.record(z.string(), FundingTermsSchema) });
export type FundingTerms = z.infer<typeof FundingTermsSchema>;

const names: [string, RegExp][] = [
  ['Franco-Nevada', /Franco-?Nevada/], ['Wheaton', /Wheaton Precious/], ['Royal Gold', /Royal Gold/], ['Osisko', /Osisko/], ['Triple Flag', /Triple Flag/],
  ['Sandstorm', /Sandstorm/], ['OR Royalties', /OR Royalties/], ['Orion', /Orion (?:Resource|Mine Finance|Capital)/], ['Taurus', /Taurus (?:Mining|Funds)/], ['Nebari', /Nebari/],
  ['ANZ', /\bANZ\b|Australia and New Zealand Banking/], ['CBA', /Commonwealth Bank|\bCBA\b/], ['NAB', /National Australia Bank|\bNAB\b/], ['Westpac', /Westpac/],
  ['HSBC', /HSBC/], ['MUFG', /MUFG|Mitsubishi UFJ/], ['SMBC', /SMBC|Sumitomo Mitsui/], ['Mizuho', /Mizuho/], ['BNP Paribas', /BNP/], ['ING', /\bING\b/],
  ['Societe Generale', /Soci[eé]t[eé] G[eé]n[eé]rale/], ['Citi', /\bCiti(?:group|bank)?\b/], ['J.P. Morgan', /J\.?\s?P\.?\s?Morgan/], ['Goldman Sachs', /Goldman Sachs/],
  ['Morgan Stanley', /Morgan Stanley/], ['UBS', /\bUBS\b/], ['Macquarie', /Macquarie/], ['BofA Securities', /BofA|Bank of America|Merrill Lynch/], ['Barclays', /Barclays/],
  ['Deutsche Bank', /Deutsche/], ['Morgans', /\bMorgans\b/], ['Barrenjoey', /Barrenjoey/], ['Jarden', /Jarden/], ['Canaccord Genuity', /Canaccord/],
  ['Export Finance Australia', /Export Finance Australia|\bEFA\b/], ['NAIF', /Northern Australia Infrastructure Facility|\bNAIF\b/], ['CEFC', /Clean Energy Finance Corporation|\bCEFC\b/],
];

const clean = (text: string) => text.replace(/ /g, ' ').replace(/(\w)-\s*\n\s*(\w)/g, '$1$2').replace(/\s+/g, ' ').replace(/(A|NZ|US)\s?\$\s+/g, '$1$').replace(/(\d)\s+%/g, '$1%').replace(/ per cent\.?/gi, '%');
const around = (text: string, index: number, length: number) => text.slice(Math.max(0, text.lastIndexOf(' ', index - 60) + 1), Math.min(text.length, index + length + 80)).trim();
const currency = (prefix: string) => {
  const code = prefix.replace(/\s/g, '').toUpperCase();
  return code.startsWith('US') || code.startsWith('U.S') ? 'US$' : code.startsWith('HKD') ? 'HKD' : code.startsWith('SGD') ? 'SGD' : code.startsWith('NZ') ? 'NZ$' : code.startsWith('EUR') || code === '€' ? 'EUR' : code.startsWith('GBP') || code === '£' ? 'GBP' : code.startsWith('CHF') ? 'CHF' : code.startsWith('JPY') ? 'JPY' : 'A$';
};
const sizePattern = /(A\$|AUD ?|NZ\$|US\$|U\.S\.\$|USD ?|EUR ?|€|GBP ?|£|CHF ?|JPY ?|HKD ?|SGD ?|\$)(\d[\d,]*(?:\.\d+)?)(?: ?(million|billion|bn|m)\b)?/gi;

const toMillions = (value: string, unit: string | undefined) => {
  const number = Number(value.replace(/,/g, ''));
  if (number >= 1_000_000) return number / 1e6;
  return unit ? number * (/^b/i.test(unit) ? 1000 : 1) : 0;
};
const issuerNames: Record<string, string> = { ANZ: 'ANZ', CBA: 'CBA', NAB: 'NAB', WBC: 'Westpac', MQG: 'Macquarie' };

export function extractFundingTerms(instrument: Instrument, titles: string[], sources: { document: ArchiveRow; text: string }[], ticker = '', dealYear = 0): FundingTerms {
  const terms: FundingTerms = { documents: sources.map(source => source.document.id), size: null, coupon: null, margin: null, maturity: null, conversionPremium: null, counterparties: [], purpose: null };
  const titleText = titles.join(' | ');
  const fromTitle = [...titleText.matchAll(sizePattern)].map(match => ({ currency: currency(match[1]), millions: toMillions(match[2], match[3]) })).filter(size => size.millions > 0);
  if (fromTitle.length) terms.size = { value: fromTitle.reduce((a, b) => (b.millions > a.millions ? b : a)), source: 'title', quote: titleText.slice(0, 200) };
  const titleCoupon = titleText.match(/(\d{1,2}\.\d{1,3})% (?:senior|convertible|subordinated|notes|bonds)/i);
  if (titleCoupon) terms.coupon = { value: Number(titleCoupon[1]), source: 'title', quote: titleText.slice(0, 200) };
  const titleDue = titleText.match(/due (20\d\d)/i);
  if (titleDue) terms.maturity = { value: titleDue[1], source: 'title', quote: titleText.slice(0, 200) };

  for (const { document, text: raw } of sources) {
    const text = clean(raw);
    if (!terms.size) {
      const match = [...text.matchAll(sizePattern)].find(found => toMillions(found[2], found[3]) > 0 && /notes?|bonds?|facilit|loan|debt|securities|stream|royalt|prepayment|offering|raise/i.test(text.slice(found.index!, found.index! + 120)));
      if (match) terms.size = { value: { currency: currency(match[1]), millions: toMillions(match[2], match[3]) }, source: document.id, quote: around(text, match.index!, match[0].length) };
    }
    if (!terms.coupon) {
      const match = text.match(/(?:coupon|interest rate|fixed rate|interest) (?:rate )?(?:of |at |is |will be )?(\d{1,2}(?:\.\d{1,4})?)%(?! of)/i) ?? text.match(/(\d{1,2}(?:\.\d{1,4})?)% (?:per annum |p\.a\. )?(?:coupon|fixed rate|senior|convertible|subordinated|notes|bonds)/i);
      if (match && Number(match[1]) > 0 && Number(match[1]) < 20) terms.coupon = { value: Number(match[1]), source: document.id, quote: around(text, match.index!, match[0].length) };
    }
    if (!terms.margin) {
      const text2 = text.replace(/3-\s+month/gi, '3-month');
      const percent = text2.match(/margin (?:has been |was |is |will be )?(?:determined [^.]{0,40} and has been )?(?:set |determined )?(?:at |of )?\+?(\d{1,2}(?:\.\d{1,4})?)% (?:per annum |p\.a\. )?(?:above|over) (?:the )?(?:3[- ]?month |three[- ]month )?(BBSW|bank bill|BBSY|SOFR)/i)
        ?? text2.match(/(?:3[- ]?month )?(BBSW|bank bill (?:swap )?rate|BBSY|SOFR) (?:rate )?plus (?:a |an initial )?(?:margin of )?(\d{1,2}(?:\.\d{1,4})?)%/i);
      const bps = text2.match(/\+?(\d{2,3}) ?(?:bps|basis points)(?: margin)? (?:above|over) (?:the )?(?:underlying base rate|(?:3[- ]?month )?(?:BBSW|bank bill|BBSY|SOFR))/i);
      if (percent) {
        const [value, over] = /^\d/.test(percent[1]) ? [percent[1], percent[2]] : [percent[2], percent[1]];
        if (Number(value) < 10) terms.margin = { value: { percent: Number(value), over: /bbsw|bank bill/i.test(over) ? 'BBSW' : over.trim() }, source: document.id, quote: around(text2, percent.index!, percent[0].length) };
      } else if (bps && Number(bps[1]) < 1000) terms.margin = { value: { percent: Number(bps[1]) / 100, over: /SOFR/i.test(bps[0]) ? 'SOFR' : 'BBSW' }, source: document.id, quote: around(text2, bps.index!, bps[0].length) };
    }
    if (!terms.maturity) {
      const match = text.match(/(?:matur(?:e|es|ity|ing)|due|expir(?:e|es|y|ing)|term of|tenor of|repayable)(?: date)?(?: (?:in|on|of|date is|by))? (?:(?:\d{1,2} )?(?:January|February|March|April|May|June|July|August|September|October|November|December) )?(20[2-5]\d)/i)
        ?? text.match(/(\d{1,2}(?:\.\d)?)[- ]year (?:term|tenor|notes|bonds?|facility|loan|maturity)/i);
      if (match && (!/^20/.test(match[1]) || Number(match[1]) > dealYear)) terms.maturity = { value: /^20/.test(match[1]) ? match[1] : `${match[1]} years`, source: document.id, quote: around(text, match.index!, match[0].length) };
    }
    if (instrument === 'convertible' && !terms.conversionPremium) {
      const match = text.match(/conversion premium of (?:approximately )?(\d{1,3}(?:\.\d{1,2})?)%/i) ?? text.match(/(\d{1,3}(?:\.\d{1,2})?)% (?:conversion )?premium (?:to|over)/i);
      if (match && Number(match[1]) < 150) terms.conversionPremium = { value: Number(match[1]), source: document.id, quote: around(text, match.index!, match[0].length) };
    }
    if (!terms.counterparties.length) {
      const windows = [...text.matchAll(/lead managers?|bookrunners?|arrangers?|lenders?|banks?|underwriters?|dealers?|royalty|stream|subscriber|investor/gi)].map(match => text.slice(Math.max(0, match.index! - 200), match.index! + 200));
      terms.counterparties = names.filter(([name, pattern]) => name !== issuerNames[ticker] && windows.some(window => pattern.test(window))).map(([name]) => name);
    }
    if (!terms.purpose) {
      const body = text.replace(/For personal use only/gi, ' ').replace(/\bPage \d+(?: of \d+)?\b/gi, ' ').replace(/(?:\b[A-Z][A-Z&’'-]{1,}\b[ ,]*){4,}/g, ' ').replace(/\s+/g, ' ');
      const sentence = body.split(/(?<=[a-z0-9)”"%]\.)\s+(?=[A-Z])/).find(line => /proceeds|will be used|to fund|to refinance|to repay|general corporate purposes/i.test(line) && line.length > 50 && line.length < 500 && !/forward.looking/i.test(line));
      if (sentence) terms.purpose = { value: sentence.length > 300 ? `${sentence.slice(0, 297).replace(/\s\S*$/, '')}…` : sentence, source: document.id, quote: sentence.slice(0, 200) };
    }
  }
  return terms;
}
