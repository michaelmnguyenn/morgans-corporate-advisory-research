import PrecedentExplorer from '@/components/PrecedentExplorer';
import index from '@/data/research/candidates.json';
import funding from '@/data/research/funding.json';
import fundingTerms from '@/data/research/funding-terms.json';
import market from '@/data/research/market.json';
import quotes from '@/data/research/quotes.json';
import balances from '@/data/research/balances.json';
import balanceOverrides from '@/data/research/balance-overrides.json';
import balanceHistory from '@/data/research/balance-history.json';
import type { BalanceSheet } from '@/lib/balance-sheet';
import terms from '@/data/research/terms.json';
import universe from '@/data/research/universe.json';
import { FundingIndexSchema } from '@/lib/funding';
import { FundingTermsFileSchema } from '@/lib/funding-terms';
import type { RaiseMarket } from '@/lib/market-data';
import { PrecedentIndexSchema, UniverseSchema } from '@/lib/precedents';
import { TermsFileSchema } from '@/lib/terms';

export default function Page() {
  return <PrecedentExplorer index={PrecedentIndexSchema.parse(index)} universe={UniverseSchema.parse(universe)} data={{
    terms: TermsFileSchema.parse(terms).raises,
    market: market.raises as Record<string, RaiseMarket>,
    funding: FundingIndexSchema.parse(funding).deals,
    fundingTerms: FundingTermsFileSchema.parse(fundingTerms).deals,
    fundingMarket: market.funding,
    quotes: quotes.quotes,
    balances: { ...balances.companies, ...balanceOverrides } as Record<string, BalanceSheet>,
    history: balanceHistory.history as Record<string, Omit<BalanceSheet, 'source' | 'sourceLabel'>[]>,
  }} />;
}
