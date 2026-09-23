import { headlineSize } from './advisory';
import type { PrecedentCandidate } from './precedents';
import type { Terms } from './terms';

export type Series = { closes: [string, number][]; splits: { date: string; factor: number }[]; shares: [string, number][] };
export type RaiseMarket = {
  tradeDate: string | null; referenceDate: string | null; referenceClose: number | null; impliedDiscount: number | null;
  day1Return: number | null; month1Return: number | null; benchmarkMonth1: number | null;
  sharesOnIssue: number | null; sharesSource: 'reported' | 'notice' | null; marketCapMillions: number | null; percentOfMarketCap: number | null;
};

// Yahoo closes are adjusted for later splits and consolidations, so convert back to the price that traded on the day.
const rawFactor = (splits: Series['splits'], date: string) => splits.filter(split => split.date > date).reduce((product, split) => product * split.factor, 1);
const round = (value: number | null, places = 2) => (value === null || !Number.isFinite(value) ? null : Number(value.toFixed(places)));

export function raiseMarket(candidate: Pick<PrecedentCandidate, 'firstDate' | 'documents'> & { ticker?: string }, terms: Terms | undefined, data: Series, benchmark: Series): RaiseMarket {
  const empty: RaiseMarket = { tradeDate: null, referenceDate: null, referenceClose: null, impliedDiscount: null, day1Return: null, month1Return: null, benchmarkMonth1: null, sharesOnIssue: null, sharesSource: null, marketCapMillions: null, percentOfMarketCap: null };
  const at = data.closes.findIndex(([date]) => date >= candidate.firstDate);
  if (at <= 0) return empty;
  const [referenceDate, referenceAdjusted] = data.closes[at - 1];
  const factor = rawFactor(data.splits, referenceDate);
  const referenceClose = referenceAdjusted * factor;
  const [tradeDate, tradeAdjusted] = data.closes[at];
  const month = data.closes[at + 20];
  const offer = terms?.offerPrice?.currency === 'A$' ? terms.offerPrice.value : null;
  // A stated offer price that sits more than 60% away from the market is almost certainly a different security or a misread.
  const usableOffer = offer && Math.abs(1 - offer / referenceClose) < 0.6 ? offer : null;
  const bench = (date: string) => benchmark.closes.findLast(([day]) => day <= date)?.[1] ?? null;
  const benchStart = bench(referenceDate);
  const benchEnd = month ? bench(month[0]) : null;

  const reported = data.shares.findLast(([date]) => date <= candidate.firstDate && Date.parse(candidate.firstDate) - Date.parse(date) < 400 * 86_400_000);
  const size = headlineSize(candidate as PrecedentCandidate);
  let sharesOnIssue: number | null = null; let sharesSource: RaiseMarket['sharesSource'] = null;
  if (reported) { sharesOnIssue = reported[1] / factor; sharesSource = 'reported'; }
  else if (terms?.percentOfIssued && usableOffer && size?.currency === 'A$') { sharesOnIssue = (size.millions * 1e6) / usableOffer / (terms.percentOfIssued.value / 100); sharesSource = 'notice'; }
  const marketCapMillions = sharesOnIssue ? (sharesOnIssue * referenceClose) / 1e6 : null;

  return {
    tradeDate, referenceDate, referenceClose: round(referenceClose, 4),
    impliedDiscount: round(usableOffer ? (1 - usableOffer / referenceClose) * 100 : null, 1),
    day1Return: round(usableOffer ? ((tradeAdjusted * rawFactor(data.splits, tradeDate)) / usableOffer - 1) * 100 : null, 1),
    month1Return: round(usableOffer && month ? ((month[1] * rawFactor(data.splits, month[0])) / usableOffer - 1) * 100 : null, 1),
    benchmarkMonth1: round(benchStart && benchEnd ? (benchEnd / benchStart - 1) * 100 : null, 1),
    sharesOnIssue: round(sharesOnIssue, 0), sharesSource, marketCapMillions: round(marketCapMillions, 0),
    percentOfMarketCap: round(marketCapMillions && size?.currency === 'A$' ? (size.millions / marketCapMillions) * 100 : null, 1),
  };
}
