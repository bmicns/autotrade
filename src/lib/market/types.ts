export const ASSET_CLASSES = [
  "kr_stock",
  "us_stock",
  "kr_etf",
  "us_etf",
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number];

export type MarketRegion = "KR" | "US";

export type InstrumentKind = "stock" | "etf";

export interface MarketInstrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  region: MarketRegion;
  kind: InstrumentKind;
  currency: string;
  exchange?: string;
}

export interface MarketQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
}

export interface MarketCandle {
  at: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PositionSnapshot {
  symbol: string;
  name?: string | null;
  quantity: number;
  averagePrice: number;
  openedAt?: string;
  currency: string;
  assetClass?: AssetClass;
  region?: MarketRegion;
  kind?: InstrumentKind;
}

export interface OrderIntent {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType: "market" | "limit";
  limitPrice?: number;
}

export interface OrderPreview {
  venue: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType: "market" | "limit";
  currency: string;
  limitPrice?: number;
  warnings: string[];
}
