import PrecedentExplorer from '@/components/PrecedentExplorer';
import index from '@/data/research/candidates.json';
import universe from '@/data/research/universe.json';
import { PrecedentIndexSchema, UniverseSchema } from '@/lib/precedents';

export default function PrecedentsPage() {
  return <PrecedentExplorer index={PrecedentIndexSchema.parse(index)} universe={UniverseSchema.parse(universe)} />;
}
