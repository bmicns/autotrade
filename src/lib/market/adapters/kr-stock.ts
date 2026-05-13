import type { EngineConfig } from "../../engine/types";
import type { MarketAdapter } from "../contracts";
import { mapKrStockPositionSnapshots } from "../positions";
import type { MarketCandle, MarketInstrument, MarketQuote, OrderIntent, OrderPreview, PositionSnapshot } from "../types";

interface WatchlistRow {
  code?: string | null;
  name?: string | null;
  active?: boolean | null;
}

function buildReadOnlyConfig(base: {
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCode?: string;
}, token: string): EngineConfig {
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

async function loadKrStockConfig(): Promise<EngineConfig> {
  const [{ getToken }, { getActiveKisConfigForAssetClass }] = await Promise.all([
    import("../../kis/api"),
    import("../../kis/runtime-config"),
  ]);
  const active = await getActiveKisConfigForAssetClass("kr_stock");
  if (!active) {
    throw new Error("kr_stock adapter: KIS runtime config missing");
  }
  const token = await getToken(active.config.appKey, active.config.appSecret);
  return buildReadOnlyConfig(active.config, token);
}

export function normalizeKrStockUniverse(rows: WatchlistRow[]): MarketInstrument[] {
  return rows
    .filter((row) => row.active !== false)
    .map((row) => String(row.code ?? "").trim())
    .filter((code) => /^\d{6}$/.test(code))
    .map((code) => {
      const row = rows.find((item) => item.code === code);
      return {
        symbol: code,
        name: String(row?.name ?? code),
        assetClass: "kr_stock" as const,
        region: "KR" as const,
        kind: "stock" as const,
        currency: "KRW",
        exchange: "KRX",
      };
    });
}

export function buildKrStockOrderPreview(intent: OrderIntent, position?: PositionSnapshot | null): OrderPreview {
  const warnings: string[] = [];
  if (intent.orderType === "limit" && (!Number.isFinite(intent.limitPrice) || Number(intent.limitPrice) <= 0)) {
    warnings.push("지정가 주문에는 유효한 limitPrice가 필요합니다.");
  }
  if (intent.side === "sell" && position && intent.quantity > position.quantity) {
    warnings.push(`매도 수량이 보유 수량을 초과합니다. 보유 ${position.quantity}주`);
  }

  return {
    venue: "KRX",
    symbol: intent.symbol,
    side: intent.side,
    quantity: intent.quantity,
    orderType: intent.orderType,
    currency: "KRW",
    limitPrice: intent.orderType === "limit" ? intent.limitPrice : undefined,
    warnings,
  };
}

export const krStockAdapter: MarketAdapter = {
  assetClass: "kr_stock",
  label: "Korean Stock Adapter",
  capabilities: {
    supportsMarketOrder: true,
    supportsLimitOrder: true,
    fractionalShares: false,
  },
  async listUniverse(filter): Promise<MarketInstrument[]> {
    const { supabase } = await import("../../supabase/api-client");
    const { data, error } = await supabase
      .from("watchlist")
      .select("code, name, active")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`kr_stock adapter: watchlist query failed: ${error.message}`);
    }

    const normalized = normalizeKrStockUniverse((data ?? []) as WatchlistRow[]);
    const filteredSymbols = new Set((filter?.symbols ?? []).filter((symbol) => /^\d{6}$/.test(symbol)));
    const bySymbol = filteredSymbols.size > 0
      ? normalized.filter((item) => filteredSymbols.has(item.symbol))
      : normalized;
    const limited = typeof filter?.limit === "number" && filter.limit > 0
      ? bySymbol.slice(0, filter.limit)
      : bySymbol;
    return limited;
  },
  async listPositions(): Promise<PositionSnapshot[]> {
    const { supabase } = await import("../../supabase/api-client");
    const { data, error } = await supabase
      .from("positions")
      .select("stock_code, stock_name, entry_qty, partial_exit_qty, entry_price, entry_date")
      .eq("status", "open")
      .order("entry_date", { ascending: true });

    if (error) {
      throw new Error(`kr_stock adapter: positions query failed: ${error.message}`);
    }

    return mapKrStockPositionSnapshots((data ?? []) as Array<Record<string, unknown>>);
  },
  async getQuote(symbol: string): Promise<MarketQuote> {
    const { getPrice } = await import("../../engine/kis");
    const config = await loadKrStockConfig();
    const output = await getPrice(config, symbol);
    const price = Number(output.stck_prpr);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(output.__error_message || `kr_stock adapter: invalid quote for ${symbol}`);
    }

    return {
      symbol,
      price,
      currency: "KRW",
      asOf: new Date().toISOString(),
      open: Number(output.stck_oprc) || undefined,
      high: Number(output.stck_hgpr) || undefined,
      previousClose: undefined,
    };
  },
  async getCandles(symbol: string, limit: number): Promise<MarketCandle[]> {
    const { getDailyCandles } = await import("../../engine/kis");
    const config = await loadKrStockConfig();
    const candles = await getDailyCandles(config, symbol);
    const normalized = candles.map((candle) => ({
      at: candle.date,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }));
    if (limit > 0) {
      return normalized.slice(-limit);
    }
    return normalized;
  },
  async previewOrder(intent: OrderIntent, position?: PositionSnapshot | null): Promise<OrderPreview> {
    return buildKrStockOrderPreview(intent, position);
  },
};
