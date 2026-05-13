import { buildAssetWorkspaceSnapshot } from "./portfolio";
import { buildDefaultAssetPolicy, evaluateOrderPolicy, type AssetPolicyBundle } from "./policies";
import type { EngineV2RuntimeConfig } from "./types";

export interface MockRunnerAssetResult {
  assetClass: string;
  universeCount: number;
  positionCount: number;
  quoteCount: number;
  policyAllowed: boolean;
  policyReasons: string[];
}

export interface MockRunnerResult {
  environment: EngineV2RuntimeConfig["environment"];
  dryRun: boolean;
  assets: MockRunnerAssetResult[];
}

export async function runEngineV2Mock(
  config: EngineV2RuntimeConfig,
  policyOverrides?: Partial<Record<string, Partial<AssetPolicyBundle["risk"]>>>,
): Promise<MockRunnerResult> {
  const assets: MockRunnerAssetResult[] = [];

  for (const selection of config.selections) {
    const snapshot = await buildAssetWorkspaceSnapshot({
      assetClass: selection.assetClass,
      symbols: selection.symbols,
    });
    const policy = buildDefaultAssetPolicy(selection.assetClass);
    const merged = policyOverrides?.[selection.assetClass]
      ? {
          risk: {
            ...policy.risk,
            ...policyOverrides[selection.assetClass],
            assetClass: policy.risk.assetClass,
          },
        }
      : policy;

    const representativePrice = snapshot.quotes[0]?.price ?? 0;
    const policyResult = evaluateOrderPolicy(merged.risk, {
      quantity: 1,
      price: representativePrice,
      currentPositionCount: snapshot.positions.length,
      currentDailyTrades: 0,
    });

    assets.push({
      assetClass: selection.assetClass,
      universeCount: snapshot.universe.length,
      positionCount: snapshot.positions.length,
      quoteCount: snapshot.quotes.length,
      policyAllowed: policyResult.allowed,
      policyReasons: policyResult.reasons,
    });
  }

  return {
    environment: config.environment,
    dryRun: config.dryRun,
    assets,
  };
}
