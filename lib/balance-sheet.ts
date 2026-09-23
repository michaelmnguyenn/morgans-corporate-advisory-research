export type BalanceSheet = {
  date: string; currency: string; debt: number | null; equity: number | null; cash: number | null;
  source: string; sourceLabel: string; note?: string;
};

// All amounts are millions in the row's reporting currency, for one balance date.
export function leverage(row: BalanceSheet | undefined) {
  return {
    debtEquity: row && row.debt !== null && row.equity !== null && row.equity > 0 ? row.debt / row.equity : null,
    netDebt: row && row.debt !== null && row.cash !== null ? row.debt - row.cash : null,
  };
}

export function withinSize(size: number | null | undefined, target: number | null) {
  if (target === null || !Number.isFinite(target) || target <= 0) return true;
  return size != null && Number.isFinite(size) && size >= target / 2 && size <= target * 2;
}

export function parseBalanceSheet(body: any, source: string): BalanceSheet | null {
  return parseBalanceHistory(body, source)[0] ?? null;
}

// The last balance date on or before a deal, so a comparable's leverage is measured before it raised.
export function balanceBefore(history: BalanceSheet[] | undefined, date: string, maxDays = 550) {
  return history?.find(row => row.date <= date && Date.parse(date) - Date.parse(row.date) <= maxDays * 86_400_000);
}

export function parseBalanceHistory(body: any, source: string): BalanceSheet[] {
  const periods = new Map<string, BalanceSheet>();
  for (const series of body.timeseries?.result ?? []) {
    const type: string = series.meta?.type?.[0] ?? '';
    const field = type.endsWith('TotalDebt') ? 'debt' : type.endsWith('StockholdersEquity') ? 'equity' : 'cash';
    for (const point of series[type] ?? []) {
      const value = point.reportedValue?.raw;
      if (!Number.isFinite(value) || !point.currencyCode || !point.asOfDate) continue;
      const key = `${point.asOfDate}:${point.currencyCode}`;
      const row = periods.get(key) ?? { date: point.asOfDate, currency: point.currencyCode, debt: null, equity: null, cash: null, source, sourceLabel: 'Yahoo Finance' };
      row[field] = value / 1e6;
      periods.set(key, row);
    }
  }
  // Never backfill a missing figure from a different period or currency.
  return [...periods.values()].sort((a, b) => b.date.localeCompare(a.date));
}
