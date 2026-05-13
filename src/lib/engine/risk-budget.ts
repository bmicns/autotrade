export type RiskBudgetSnapshot = {
  dailyLossLimitPct: number;
  todayRealizedLossPct: number;
  maxPositions: number;
  openPositionCount: number;
  maxDailyTrades: number;
  todayTradeCount: number;
  maxPerTradeAmount: number;
  availableCash: number;
};

export type RiskBudgetSummary = {
  dailyLossReached: boolean;
  dailyLossWarning: boolean;
  positionSlotsRemaining: number;
  tradeSlotsRemaining: number;
  hasCashForFreshEntry: boolean;
  cashShortfallAmount: number;
};

export type SectorExposureSummary = {
  maxPerSector: number;
  overloadedCount: number;
  overloadedSectors: Array<{ sector: string; count: number }>;
};

export type EntryPressureSummary = {
  saturatedCount: number;
  overflowCount: number;
  stocks: Array<{ code: string; count: number; limit: number }>;
};

export const RISK_WARNING_USAGE_RATIO = 0.8;

export function summarizeRiskBudget(snapshot: RiskBudgetSnapshot): RiskBudgetSummary {
  const lossLimit = Math.abs(snapshot.dailyLossLimitPct);
  const realizedLoss = Math.abs(Math.min(snapshot.todayRealizedLossPct, 0));
  const positionSlotsRemaining = Math.max(0, snapshot.maxPositions - snapshot.openPositionCount);
  const tradeSlotsRemaining = Math.max(0, snapshot.maxDailyTrades - snapshot.todayTradeCount);
  const requiredCash = Math.max(0, snapshot.maxPerTradeAmount);
  const availableCash = Math.max(0, snapshot.availableCash);

  return {
    dailyLossReached: lossLimit > 0 && realizedLoss >= lossLimit,
    dailyLossWarning: lossLimit > 0 && realizedLoss >= lossLimit * RISK_WARNING_USAGE_RATIO,
    positionSlotsRemaining,
    tradeSlotsRemaining,
    hasCashForFreshEntry: requiredCash <= 0 || availableCash >= requiredCash,
    cashShortfallAmount: requiredCash > availableCash ? requiredCash - availableCash : 0,
  };
}

export function summarizeSectorExposure(
  positions: Array<{ sector?: unknown }>,
  maxPerSector: number,
): SectorExposureSummary {
  if (maxPerSector <= 0) {
    return { maxPerSector, overloadedCount: 0, overloadedSectors: [] };
  }

  const sectorCounts = positions.reduce((map, position) => {
    const sector = typeof position.sector === "string" ? position.sector.trim() : "";
    if (!sector) return map;
    map.set(sector, (map.get(sector) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const overloadedSectors = [...sectorCounts.entries()]
    .filter(([, count]) => count > maxPerSector)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .map(([sector, count]) => ({ sector, count }));

  return {
    maxPerSector,
    overloadedCount: overloadedSectors.length,
    overloadedSectors,
  };
}

export function summarizeEntryPressure(
  rows: Array<{ stock_code?: unknown; strategy_key?: unknown }>,
  resolveLimit: (strategyKey?: string | null) => number,
): EntryPressureSummary {
  const map = new Map<string, { count: number; limit: number }>();

  for (const row of rows) {
    const code = typeof row.stock_code === "string" ? row.stock_code.trim() : "";
    if (!code) continue;
    const strategyKey = typeof row.strategy_key === "string" ? row.strategy_key : null;
    const limit = Math.max(1, resolveLimit(strategyKey));
    const current = map.get(code) ?? { count: 0, limit };
    current.count += 1;
    current.limit = Math.max(current.limit, limit);
    map.set(code, current);
  }

  const stocks = [...map.entries()]
    .map(([code, value]) => ({ code, count: value.count, limit: value.limit }))
    .filter((item) => item.count >= item.limit)
    .sort((a, b) => b.count - a.count || b.limit - a.limit || a.code.localeCompare(b.code, "ko"));

  return {
    saturatedCount: stocks.length,
    overflowCount: stocks.filter((item) => item.count > item.limit).length,
    stocks,
  };
}
