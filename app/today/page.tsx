import DailyWatch from '@/components/DailyWatch';
import snapshot from '@/data/daily-announcements.json';
import { DailySnapshotSchema } from '@/lib/daily';

export default function TodayPage() {
  return <DailyWatch snapshot={DailySnapshotSchema.parse(snapshot)} />;
}
