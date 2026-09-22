import DealModels from '@/components/DealModels';
import morgans from '@/data/morgans-deals.json';
import prices from '@/data/morgans-prices.json';
import {MorgansDatasetSchema,PriceHistorySchema} from '@/lib/morgans';
export default function Page(){const research=MorgansDatasetSchema.parse(morgans);return <DealModels research={{...research,deals:research.deals.filter(d=>d.analysis.assessment)}} prices={PriceHistorySchema.parse(prices)}/>;}
