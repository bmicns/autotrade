import type { AssetClass } from "../market/types";

export interface AssetRiskPolicy {
  assetClass: AssetClass;
  enabled: boolean;
  maxPositions: number;
  maxDailyTrades: number;
  maxPositionValue: number;
  stopLossPct: number;
  trailingStopPct: number;
  partialExitRatio: number;
  maxHoldDays: number;
}

export interface OrderPolicyCheckInput {
  quantity: number;
  price: number;
  currentPositionCount: number;
  currentDailyTrades: number;
}

export interface OrderPolicyCheckResult {
  allowed: boolean;
  reasons: string[];
  orderValue: number;
}

export interface AssetPolicyBundle {
  risk: AssetRiskPolicy;
}

const DEFAULT_POLICY_VALUES = {
  enabled: true,
  maxPositions: 5,
  maxDailyTrades: 5,
  maxPositionValue: 1_000_000,
  stopLossPct: 5,
  trailingStopPct: 3,
  partialExitRatio: 50,
  maxHoldDays: 5,
} as const;

export function buildDefaultAssetPolicy(assetClass: AssetClass): AssetPolicyBundle {
  return {
    risk: {
      assetClass,
      ...DEFAULT_POLICY_VALUES,
    },
  };
}

export function evaluateOrderPolicy(
  policy: AssetRiskPolicy,
  input: OrderPolicyCheckInput,
): OrderPolicyCheckResult {
  const reasons: string[] = [];
  const orderValue = input.quantity * input.price;

  if (!policy.enabled) reasons.push("asset class disabled");
  if (input.currentPositionCount >= policy.maxPositions) reasons.push("max positions reached");
  if (input.currentDailyTrades >= policy.maxDailyTrades) reasons.push("max daily trades reached");
  if (orderValue > policy.maxPositionValue) reasons.push("max position value exceeded");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) reasons.push("quantity must be positive");
  if (!Number.isFinite(input.price) || input.price <= 0) reasons.push("price must be positive");

  return {
    allowed: reasons.length === 0,
    reasons,
    orderValue,
  };
}

export function mergeAssetPolicy(
  base: AssetPolicyBundle,
  overrides: Partial<Omit<AssetRiskPolicy, "assetClass">>,
): AssetPolicyBundle {
  return {
    risk: {
      ...base.risk,
      ...overrides,
      assetClass: base.risk.assetClass,
    },
  };
}
