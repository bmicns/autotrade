import { getMarketAdapter } from "../market";
import type { MarketAdapter } from "../market/contracts";
import type { AssetClass, MarketInstrument, MarketQuote, PositionSnapshot } from "../market/types";

export interface AssetWorkspaceSnapshot {
  assetClass: AssetClass;
  universe: MarketInstrument[];
  positions: PositionSnapshot[];
  quotes: MarketQuote[];
}

export async function buildAssetWorkspaceSnapshot(params: {
  assetClass: AssetClass;
  symbols?: string[];
  quoteLimit?: number;
  adapter?: MarketAdapter;
}): Promise<AssetWorkspaceSnapshot> {
  const adapter = params.adapter ?? getMarketAdapter(params.assetClass);
  const universe = await adapter.listUniverse({
    symbols: params.symbols,
    limit: params.quoteLimit,
  });
  const positions = adapter.listPositions ? await adapter.listPositions() : [];

  const quoteSymbols = new Set<string>();
  for (const item of universe) quoteSymbols.add(item.symbol);
  for (const item of positions) quoteSymbols.add(item.symbol);

  const quotes = await Promise.all(
    Array.from(quoteSymbols).map((symbol) => adapter.getQuote(symbol)),
  );

  return {
    assetClass: params.assetClass,
    universe,
    positions,
    quotes,
  };
}
