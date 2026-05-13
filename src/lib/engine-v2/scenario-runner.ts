import { buildAssetWorkspaceSnapshot } from "./portfolio";
import { buildDefaultAssetPolicy, evaluateOrderPolicy, mergeAssetPolicy, type AssetPolicyBundle } from "./policies";
import type { EngineV2RuntimeConfig } from "./types";
import type { MarketCandle, OrderIntent, OrderPreview } from "../market/types";
import { getMarketAdapter } from "../market";
import type { AssetClass } from "../market/types";

export interface ScenarioScoreBreakdownItem {
  key:
    | "closeMomentum"
    | "openStrength"
    | "breakout"
    | "higherLow"
    | "volume"
    | "trend"
    | "volatility"
    | "return"
    | "averageClose"
    | "compression";
  label: string;
  weight: number;
  matched: boolean;
  detail?: string;
}

export interface ScenarioCandidate {
  symbol: string;
  name: string;
  price: number;
  score: number;
  reasons: string[];
  breakdown: ScenarioScoreBreakdownItem[];
  candles: MarketCandle[];
}

export interface ScenarioAssetResult {
  assetClass: string;
  candidate: ScenarioCandidate | null;
  policyAllowed: boolean;
  policyReasons: string[];
  orderPreview: OrderPreview | null;
}

export interface ScenarioRunnerResult {
  environment: EngineV2RuntimeConfig["environment"];
  dryRun: boolean;
  assets: ScenarioAssetResult[];
}

export interface ScenarioProfile {
  assetClass: AssetClass;
  minScore: number;
  closeMomentumWeight: number;
  breakoutWeight: number;
  volumeWeight: number;
  trendWeight: number;
  openStrengthWeight: number;
  higherLowWeight: number;
  volatilityWeight: number;
  returnWeight: number;
  averageCloseWeight: number;
  compressionWeight: number;
  overheatedThresholdPct: number;
  volumeBreakdownRatio: number;
  pullbackConsecutiveCount: number;
}

export type ScenarioProfileOverrides = Partial<
  Record<AssetClass, Partial<Omit<ScenarioProfile, "assetClass">>>
>;

export function getScenarioProfile(assetClass: AssetClass): ScenarioProfile {
  switch (assetClass) {
    case "kr_stock":
      return { assetClass, minScore: 60, closeMomentumWeight: 25, breakoutWeight: 20, volumeWeight: 10, trendWeight: 20, openStrengthWeight: 10, higherLowWeight: 10, volatilityWeight: 5, returnWeight: 10, averageCloseWeight: 10, compressionWeight: 5, overheatedThresholdPct: 7, volumeBreakdownRatio: 0.6, pullbackConsecutiveCount: 2 };
    case "kr_etf":
      return { assetClass, minScore: 50, closeMomentumWeight: 20, breakoutWeight: 10, volumeWeight: 10, trendWeight: 15, openStrengthWeight: 10, higherLowWeight: 10, volatilityWeight: 10, returnWeight: 10, averageCloseWeight: 10, compressionWeight: 10, overheatedThresholdPct: 5, volumeBreakdownRatio: 0.6, pullbackConsecutiveCount: 2 };
    case "us_etf":
      return { assetClass, minScore: 55, closeMomentumWeight: 20, breakoutWeight: 10, volumeWeight: 10, trendWeight: 20, openStrengthWeight: 10, higherLowWeight: 10, volatilityWeight: 10, returnWeight: 10, averageCloseWeight: 10, compressionWeight: 10, overheatedThresholdPct: 5, volumeBreakdownRatio: 0.6, pullbackConsecutiveCount: 2 };
    case "us_stock":
    default:
      return { assetClass, minScore: 65, closeMomentumWeight: 25, breakoutWeight: 15, volumeWeight: 10, trendWeight: 20, openStrengthWeight: 10, higherLowWeight: 5, volatilityWeight: 5, returnWeight: 10, averageCloseWeight: 10, compressionWeight: 5, overheatedThresholdPct: 7, volumeBreakdownRatio: 0.6, pullbackConsecutiveCount: 2 };
  }
}

export function resolveScenarioProfile(
  assetClass: AssetClass,
  overrides?: Partial<Omit<ScenarioProfile, "assetClass">>,
): ScenarioProfile {
  return {
    ...getScenarioProfile(assetClass),
    ...overrides,
    assetClass,
  };
}

function calcAverageVolume(candles: MarketCandle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((sum, candle) => sum + candle.volume, 0) / candles.length;
}

function calcAverageClose(candles: MarketCandle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((sum, candle) => sum + candle.close, 0) / candles.length;
}

function calcAverageRangePct(candles: MarketCandle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((sum, candle) => {
    const base = candle.open || candle.close || 1;
    return sum + (((candle.high - candle.low) / base) * 100);
  }, 0) / candles.length;
}

function hasConsecutivePullback(candles: MarketCandle[], count: number): boolean {
  if (count <= 0 || candles.length < count + 1) return false;
  const recent = candles.slice(-(count + 1));
  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index].close >= recent[index - 1].close) {
      return false;
    }
  }
  return true;
}

export function scoreScenarioCandidate(params: {
  assetClass: AssetClass;
  candles: MarketCandle[];
  profileOverrides?: Partial<Omit<ScenarioProfile, "assetClass">>;
}): { score: number; reasons: string[]; breakdown: ScenarioScoreBreakdownItem[] } {
  const reasons: string[] = [];
  const breakdown: ScenarioScoreBreakdownItem[] = [];
  let score = 0;
  const candles = params.candles;
  const profile = resolveScenarioProfile(params.assetClass, params.profileOverrides);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  function pushBreakdown(item: ScenarioScoreBreakdownItem) {
    breakdown.push(item);
    if (item.matched) {
      score += item.weight;
      reasons.push(item.label);
    }
  }

  pushBreakdown({
    key: "closeMomentum",
    label: "latest close above previous close",
    weight: profile.closeMomentumWeight,
    matched: Boolean(last && prev && last.close > prev.close),
    detail: last && prev ? `${prev.close} -> ${last.close}` : undefined,
  });

  pushBreakdown({
    key: "openStrength",
    label: "close above open",
    weight: profile.openStrengthWeight,
    matched: Boolean(last && last.close >= last.open),
    detail: last ? `${last.open} -> ${last.close}` : undefined,
  });

  pushBreakdown({
    key: "breakout",
    label: "recent high breakout",
    weight: profile.breakoutWeight,
    matched: Boolean(last && prev && last.high >= prev.high),
    detail: last && prev ? `${prev.high} -> ${last.high}` : undefined,
  });

  pushBreakdown({
    key: "higherLow",
    label: "higher low support",
    weight: profile.higherLowWeight,
    matched: Boolean(last && prev && last.low >= prev.low),
    detail: last && prev ? `${prev.low} -> ${last.low}` : undefined,
  });

  if (last) {
    const averageVolume = calcAverageVolume(candles.slice(-5));
    pushBreakdown({
      key: "volume",
      label: "volume above recent average",
      weight: profile.volumeWeight,
      matched: averageVolume > 0 && last.volume >= averageVolume,
      detail: averageVolume > 0 ? `${last.volume} vs ${averageVolume.toFixed(0)}` : undefined,
    });
  }

  if (candles.length >= 3) {
    const recent = candles.slice(-3);
    const rising = recent.every((candle, index) => index === 0 || candle.close >= recent[index - 1].close);
    pushBreakdown({
      key: "trend",
      label: "three-candle momentum",
      weight: profile.trendWeight,
      matched: rising,
      detail: recent.map((candle) => candle.close).join(" -> "),
    });
  }

  if (last && last.open > 0) {
    const intradayRangePct = ((last.high - last.low) / last.open) * 100;
    pushBreakdown({
      key: "volatility",
      label: "controlled daily range",
      weight: profile.volatilityWeight,
      matched: intradayRangePct <= 3,
      detail: `${intradayRangePct.toFixed(2)}%`,
    });
  }

  if (candles.length >= 5) {
    const first = candles[0];
    const fiveCandleReturnPct = first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
    pushBreakdown({
      key: "return",
      label: "positive five-candle return",
      weight: profile.returnWeight,
      matched: fiveCandleReturnPct >= 2,
      detail: `${fiveCandleReturnPct.toFixed(2)}%`,
    });

    const averageClose = calcAverageClose(candles);
    pushBreakdown({
      key: "averageClose",
      label: "close above recent average",
      weight: profile.averageCloseWeight,
      matched: averageClose > 0 && last.close >= averageClose,
      detail: averageClose > 0 ? `${last.close} vs ${averageClose.toFixed(2)}` : undefined,
    });

    const earlyRange = calcAverageRangePct(candles.slice(0, 2));
    const recentRange = calcAverageRangePct(candles.slice(-3));
    pushBreakdown({
      key: "compression",
      label: "volatility compression",
      weight: profile.compressionWeight,
      matched: earlyRange > 0 && recentRange <= earlyRange,
      detail: earlyRange > 0 ? `${recentRange.toFixed(2)}% <= ${earlyRange.toFixed(2)}%` : undefined,
    });
  }

  return { score, reasons, breakdown };
}

export function evaluateScenarioDisqualifiers(params: {
  assetClass: AssetClass;
  candles: MarketCandle[];
  profileOverrides?: Partial<Omit<ScenarioProfile, "assetClass">>;
}): string[] {
  const reasons: string[] = [];
  const candles = params.candles;
  const last = candles[candles.length - 1];
  const profile = resolveScenarioProfile(params.assetClass, params.profileOverrides);

  if (!last) return reasons;

  const rangeBase = last.open || last.close || 1;
  const intradayRangePct = ((last.high - last.low) / rangeBase) * 100;
  if (intradayRangePct >= profile.overheatedThresholdPct) {
    reasons.push(`volatility overheated (${intradayRangePct.toFixed(2)}% >= ${profile.overheatedThresholdPct}%)`);
  }

  if (last.volume > 0) {
    const averageVolume = calcAverageVolume(candles.slice(-5));
    if (averageVolume > 0 && last.volume < averageVolume * profile.volumeBreakdownRatio) {
      reasons.push("volume breakdown");
    }
  }

  if (hasConsecutivePullback(candles, profile.pullbackConsecutiveCount)) {
    reasons.push(`${profile.pullbackConsecutiveCount}-candle pullback`);
  }

  return reasons;
}

async function pickScenarioCandidate(params: {
  assetClass: AssetClass;
  universe: Array<{ symbol: string; name: string }>;
  positions: Array<{ symbol: string }>;
  quotes: Array<{ symbol: string; price: number }>;
  loadCandles: (symbol: string) => Promise<MarketCandle[]>;
  profileOverrides?: Partial<Omit<ScenarioProfile, "assetClass">>;
}): Promise<ScenarioCandidate | null> {
  const held = new Set(params.positions.map((position) => position.symbol));
  let best: ScenarioCandidate | null = null;
  for (const item of params.universe) {
    if (held.has(item.symbol)) continue;
    const quote = params.quotes.find((candidate) => candidate.symbol === item.symbol);
    if (!quote || quote.price <= 0) continue;
    const candles = await params.loadCandles(item.symbol);
    const scored = scoreScenarioCandidate({
      assetClass: params.assetClass,
      candles,
      profileOverrides: params.profileOverrides,
    });
    const candidate: ScenarioCandidate = {
      symbol: item.symbol,
      name: item.name,
      price: quote.price,
      score: scored.score,
      reasons: scored.reasons,
      breakdown: scored.breakdown,
      candles,
    };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}

export async function runEngineV2Scenario(
  config: EngineV2RuntimeConfig,
  policyOverrides?: Partial<Record<string, Partial<AssetPolicyBundle["risk"]>>>,
  profileOverrides?: ScenarioProfileOverrides,
): Promise<ScenarioRunnerResult> {
  const assets: ScenarioAssetResult[] = [];

  for (const selection of config.selections) {
    const adapter = getMarketAdapter(selection.assetClass);
    const snapshot = await buildAssetWorkspaceSnapshot({
      assetClass: selection.assetClass,
      symbols: selection.symbols,
    });

    const policy = policyOverrides?.[selection.assetClass]
      ? mergeAssetPolicy(buildDefaultAssetPolicy(selection.assetClass), policyOverrides[selection.assetClass] ?? {})
      : buildDefaultAssetPolicy(selection.assetClass);

    const candidate = await pickScenarioCandidate({
      ...snapshot,
      assetClass: selection.assetClass,
      loadCandles: (symbol) => adapter.getCandles(symbol, 5),
      profileOverrides: profileOverrides?.[selection.assetClass],
    });
    if (!candidate) {
      assets.push({
        assetClass: selection.assetClass,
        candidate: null,
        policyAllowed: false,
        policyReasons: ["no candidate available"],
        orderPreview: null,
      });
      continue;
    }

    const policyResult = evaluateOrderPolicy(policy.risk, {
      quantity: 1,
      price: candidate.price,
      currentPositionCount: snapshot.positions.length,
      currentDailyTrades: 0,
    });
    const profile = resolveScenarioProfile(selection.assetClass, profileOverrides?.[selection.assetClass]);
    const combinedReasons = [...policyResult.reasons];
    const disqualifiers = evaluateScenarioDisqualifiers({
      assetClass: selection.assetClass,
      candles: await adapter.getCandles(candidate.symbol, 5),
      profileOverrides: profileOverrides?.[selection.assetClass],
    });
    combinedReasons.push(...disqualifiers);
    if (candidate.score < profile.minScore) {
      combinedReasons.push(`score below threshold (${candidate.score} < ${profile.minScore})`);
    }
    const scenarioAllowed = combinedReasons.length === 0;

    let orderPreview: OrderPreview | null = null;
    if (scenarioAllowed) {
      const intent: OrderIntent = {
        symbol: candidate.symbol,
        side: "buy",
        quantity: 1,
        orderType: adapter.capabilities.supportsLimitOrder ? "limit" : "market",
        limitPrice: adapter.capabilities.supportsLimitOrder ? candidate.price : undefined,
      };
      orderPreview = await adapter.previewOrder(intent, null);
    }

      assets.push({
      assetClass: selection.assetClass,
      candidate,
      policyAllowed: scenarioAllowed,
      policyReasons: combinedReasons,
      orderPreview,
    });
  }

  return {
    environment: config.environment,
    dryRun: config.dryRun,
    assets,
  };
}
