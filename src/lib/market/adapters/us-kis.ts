import type { AssetClass, InstrumentKind, MarketCandle, MarketQuote, PositionSnapshot } from "../types";
import type { RuntimeKisConfig } from "@/lib/kis/runtime-config";
import type { EngineConfig } from "@/lib/engine/types";

export interface UsVenueProfile {
  priceExchange: "NAS" | "NYS" | "AMS";
  orderExchange: "NASD" | "NYSE" | "AMEX";
  productTypeCode: "512" | "513" | "529";
  currency: "USD";
}

export const US_VENUE_PROFILES: Record<UsVenueProfile["priceExchange"], UsVenueProfile> = {
  NAS: { priceExchange: "NAS", orderExchange: "NASD", productTypeCode: "512", currency: "USD" },
  NYS: { priceExchange: "NYS", orderExchange: "NYSE", productTypeCode: "513", currency: "USD" },
  AMS: { priceExchange: "AMS", orderExchange: "AMEX", productTypeCode: "529", currency: "USD" },
};

const KNOWN_US_SYMBOL_VENUES: Record<string, UsVenueProfile["priceExchange"]> = {
  AAPL: "NAS",
  MSFT: "NAS",
  NVDA: "NAS",
  QQQ: "NAS",
  SPY: "AMS",
  VTI: "NYS",
};

const ETF_NAME_HINTS = [" ETF", " TRUST", " FUND", " INDEX", " ISHARES", " VANGUARD", " SPDR", " INVESCO"];

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

export function buildUsReadOnlyConfig(base: RuntimeKisConfig, token: string): EngineConfig {
  return {
    appKey: base.appKey,
    appSecret: base.appSecret,
    accountNo: base.accountNo,
    accountProductCode: base.accountProductCode,
    token,
    stopLoss: -2,
    trailingStop: -3,
    maxPerTrade: 0,
    maxDailyTrades: 0,
    partialExitRatio: 50,
    dailyLossLimit: -3,
    maxHoldDays: 1,
    dynamicRisk: true,
  };
}

export function getKnownUsVenue(symbol: string): UsVenueProfile | null {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  const code = KNOWN_US_SYMBOL_VENUES[normalized];
  return code ? US_VENUE_PROFILES[code] : null;
}

export function resolveUsVenueFromSearchInfoRow(row: Record<string, unknown> | null | undefined): UsVenueProfile | null {
  const productType = firstString(row ?? {}, ["prdt_type_cd"]);
  switch (productType) {
    case "512":
      return US_VENUE_PROFILES.NAS;
    case "513":
      return US_VENUE_PROFILES.NYS;
    case "529":
      return US_VENUE_PROFILES.AMS;
    default:
      return null;
  }
}

export function classifyUsInstrumentKind(symbol: string, name?: string | null): InstrumentKind {
  const normalizedSymbol = String(symbol ?? "").trim().toUpperCase();
  if (["QQQ", "SPY", "VTI"].includes(normalizedSymbol)) return "etf";

  const upperName = String(name ?? "").trim().toUpperCase();
  if (ETF_NAME_HINTS.some((hint) => upperName.includes(hint))) return "etf";
  return "stock";
}

export function mapUsBalanceRowsToPositions(params: {
  rows: Array<Record<string, unknown>>;
  assetClass: AssetClass;
}): PositionSnapshot[] {
  const targetKind: InstrumentKind = params.assetClass === "us_etf" ? "etf" : "stock";

  return params.rows
    .map((row) => {
      const symbol = firstString(row, ["ovrs_pdno", "pdno", "symb", "rsym"]).toUpperCase();
      const name = firstString(row, ["ovrs_item_name", "prdt_name", "item_name", "symb_name"]) || symbol;
      const quantity = Math.max(0, firstNumber(row, ["ovrs_cblc_qty", "cblc_qty", "hldg_qty"]));
      const averagePrice = firstNumber(row, ["pchs_avg_pric", "avg_pric", "pchs_unpr"]);
      const kind = classifyUsInstrumentKind(symbol, name);
      return {
        symbol,
        name,
        quantity,
        averagePrice,
        currency: "USD",
        assetClass: params.assetClass,
        region: "US" as const,
        kind,
      };
    })
    .filter((row) => row.symbol && row.quantity > 0 && row.kind === targetKind);
}

export function mapUsQuoteResponse(params: {
  symbol: string;
  priceRow?: Record<string, unknown> | null;
  detailRow?: Record<string, unknown> | null;
}): MarketQuote {
  const price = firstNumber(params.detailRow ?? {}, ["last"]) || firstNumber(params.priceRow ?? {}, ["last"]);
  return {
    symbol: params.symbol,
    price,
    currency: "USD",
    asOf: new Date().toISOString(),
    open: firstNumber(params.detailRow ?? {}, ["open"]) || undefined,
    high: firstNumber(params.detailRow ?? {}, ["high"]) || undefined,
    low: firstNumber(params.detailRow ?? {}, ["low"]) || undefined,
    previousClose: firstNumber(params.detailRow ?? {}, ["base"]) || firstNumber(params.priceRow ?? {}, ["base"]) || undefined,
  };
}

export function mapUsDailyPriceRows(rows: Array<Record<string, unknown>>, limit: number): MarketCandle[] {
  const normalized = rows
    .map((row) => ({
      at: firstString(row, ["xymd"]),
      open: firstNumber(row, ["open"]),
      high: firstNumber(row, ["high"]),
      low: firstNumber(row, ["low"]),
      close: firstNumber(row, ["clos"]),
      volume: firstNumber(row, ["tvol"]),
    }))
    .filter((row) => row.at && row.close > 0);

  if (limit > 0) {
    return normalized.slice(-limit);
  }
  return normalized;
}
