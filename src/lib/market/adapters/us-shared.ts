import type { MarketInstrument, MarketQuote, OrderIntent, OrderPreview, PositionSnapshot } from "../types";

interface UsSeedRow {
  symbol: string;
  name: string;
}

function normalizeUsUniverse(
  rows: UsSeedRow[],
  params: { assetClass: "us_stock" | "us_etf"; kind: "stock" | "etf" },
): MarketInstrument[] {
  return rows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    assetClass: params.assetClass,
    region: "US" as const,
    kind: params.kind,
    currency: "USD",
    exchange: "NASDAQ",
  }));
}

export function getDefaultUsStockUniverse(): MarketInstrument[] {
  return normalizeUsUniverse([
    { symbol: "AAPL", name: "Apple" },
    { symbol: "MSFT", name: "Microsoft" },
    { symbol: "NVDA", name: "NVIDIA" },
  ], { assetClass: "us_stock", kind: "stock" });
}

export function getDefaultUsEtfUniverse(): MarketInstrument[] {
  return normalizeUsUniverse([
    { symbol: "SPY", name: "SPDR S&P 500 ETF" },
    { symbol: "QQQ", name: "Invesco QQQ Trust" },
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF" },
  ], { assetClass: "us_etf", kind: "etf" });
}

export function buildDefaultUsQuote(
  symbol: string,
  params: { basePrice: number },
): MarketQuote {
  return {
    symbol,
    price: params.basePrice,
    currency: "USD",
    asOf: new Date().toISOString(),
  };
}

export function buildUsOrderPreview(
  intent: OrderIntent,
  position: PositionSnapshot | null | undefined,
): OrderPreview {
  const warnings: string[] = [];
  if (intent.orderType === "limit" && (!Number.isFinite(intent.limitPrice) || Number(intent.limitPrice) <= 0)) {
    warnings.push("limit orders require a positive limitPrice");
  }
  if (intent.side === "sell" && position && intent.quantity > position.quantity) {
    warnings.push(`sell quantity exceeds position size (${position.quantity})`);
  }

  return {
    venue: "US",
    symbol: intent.symbol,
    side: intent.side,
    quantity: intent.quantity,
    orderType: intent.orderType,
    currency: "USD",
    limitPrice: intent.orderType === "limit" ? intent.limitPrice : undefined,
    warnings,
  };
}
