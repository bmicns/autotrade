import type { MarketAdapter } from "./contracts";
import type { AssetClass } from "./types";
import { krEtfAdapter } from "./adapters/kr-etf";
import { krStockAdapter } from "./adapters/kr-stock";
import { usEtfAdapter } from "./adapters/us-etf";
import { usStockAdapter } from "./adapters/us-stock";

const ADAPTERS: Record<AssetClass, MarketAdapter> = {
  kr_stock: krStockAdapter,
  us_stock: usStockAdapter,
  kr_etf: krEtfAdapter,
  us_etf: usEtfAdapter,
};

export function getMarketAdapter(assetClass: AssetClass): MarketAdapter {
  return ADAPTERS[assetClass];
}

export function listMarketAdapters(): MarketAdapter[] {
  return Object.values(ADAPTERS);
}
