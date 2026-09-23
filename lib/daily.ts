import { z } from 'zod';

export const DailyItemSchema = z.object({
  id: z.string(), ticker: z.string(), company: z.string(), sector: z.string().nullable(),
  headline: z.string(), publishedAt: z.string(), kind: z.enum(['raise', 'filing']),
  documentKey: z.string(),
});
export const DailySnapshotSchema = z.object({
  marketDate: z.string(), checkedAt: z.string(), scannedCount: z.number().int().nonnegative(),
  items: z.array(DailyItemSchema),
});
export type DailyItem = z.infer<typeof DailyItemSchema>;
export type DailySnapshot = z.infer<typeof DailySnapshotSchema>;

const headlinePattern = /capital rais|equity rais|placement|entitlement|rights issue|share purchase plan|\bSPP\b|institutional offer|retail offer|convertible notes?/i;
const filingPattern = /proposed issue of securities|notification of issue|quotation of securities/i;
const employeePattern = /employee incentive|employee share|performance rights|director incentive/i;

export function sydneyDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (part: string) => parts.find(item => item.type === part)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const AnnouncementSchema = z.object({
  date: z.string(), documentKey: z.string(), headline: z.string(), symbol: z.string(),
  companyInfo: z.array(z.object({ displayName: z.string().optional(), sector: z.string().optional() })).optional(),
});

export function parseDailyPage(raw: unknown, marketDate: string): { items: DailyItem[]; oldestDate: string | null; pageSize: number } {
  const parsed = z.object({ data: z.object({ items: z.array(AnnouncementSchema) }) }).parse(raw);
  const items: DailyItem[] = [];
  for (const row of parsed.data.items) {
    if (sydneyDate(row.date) !== marketDate) continue;
    const kind = headlinePattern.test(row.headline) ? 'raise' : filingPattern.test(row.headline) ? 'filing' : null;
    if (!kind || employeePattern.test(row.headline)) continue;
    items.push({
      id: row.documentKey, documentKey: row.documentKey, ticker: row.symbol,
      company: row.companyInfo?.[0]?.displayName ?? row.symbol,
      sector: row.companyInfo?.[0]?.sector ?? null, headline: row.headline,
      publishedAt: row.date, kind,
    });
  }
  const last = parsed.data.items.at(-1);
  return { items, oldestDate: last ? sydneyDate(last.date) : null, pageSize: parsed.data.items.length };
}
