import type {
  AssetClass,
  MarketCandle,
  MarketInstrument,
  MarketQuote,
  OrderIntent,
  OrderPreview,
  PositionSnapshot,
} from "./types";

export interface AssetUniverseFilter {
  symbols?: string[];
  limit?: number;
}

export interface AssetOrderCapabilities {
  supportsMarketOrder: boolean;
  supportsLimitOrder: boolean;
  fractionalShares: boolean;
}

export interface MarketAdapter {
  readonly assetClass: AssetClass;
  readonly label: string;
  readonly capabilities: AssetOrderCapabilities;
  listUniverse(filter?: AssetUniverseFilter): Promise<MarketInstrument[]>;
  listPositions?(): Promise<PositionSnapshot[]>;
  getQuote(symbol: string): Promise<MarketQuote>;
  getCandles(symbol: string, limit: number): Promise<MarketCandle[]>;
  previewOrder(intent: OrderIntent, position?: PositionSnapshot | null): Promise<OrderPreview>;
}
