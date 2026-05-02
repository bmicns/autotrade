export const STRATEGY_KEYS = [
  "watchlist_pullback",
  "surge_momentum",
  "institutional_follow",
] as const;

export type StrategyKey = (typeof STRATEGY_KEYS)[number];

export type StrategyAllocations = Record<StrategyKey, number>;

export const DEFAULT_STRATEGY_ALLOCATIONS: StrategyAllocations = {
  watchlist_pullback: 40,
  surge_momentum: 25,
  institutional_follow: 35,
};

export function normalizeStrategyAllocations(
  raw: Partial<Record<StrategyKey, unknown>> | null | undefined
): StrategyAllocations {
  const parsed = { ...DEFAULT_STRATEGY_ALLOCATIONS };

  for (const key of STRATEGY_KEYS) {
    const value = raw?.[key];
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0 && num <= 100) {
      parsed[key] = num;
    }
  }

  const total = Object.values(parsed).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...DEFAULT_STRATEGY_ALLOCATIONS };

  const normalized = {} as StrategyAllocations;
  for (const key of STRATEGY_KEYS) {
    normalized[key] = Math.round((parsed[key] / total) * 1000) / 10;
  }

  return normalized;
}

export function getStrategyBudget(maxPerTrade: number, allocationPct: number): number {
  return Math.max(0, Math.floor((maxPerTrade * allocationPct) / 100));
}
