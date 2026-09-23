import DealModels from '@/components/DealModels';
import morgans from '@/data/morgans-deals.json';
import prices from '@/data/morgans-prices.json';
import { MorgansDatasetSchema, PriceHistorySchema } from '@/lib/morgans';

export default function CaseStudiesPage() {
  const research = MorgansDatasetSchema.parse(morgans);
  return <DealModels research={{ ...research, deals: research.deals.filter(deal => deal.analysis.assessment) }} prices={PriceHistorySchema.parse(prices)} />;
}
