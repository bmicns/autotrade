import type { MarketAdapter } from "../contracts";
import type { MarketCandle, MarketInstrument, MarketQuote, OrderIntent, OrderPreview, PositionSnapshot } from "../types";
import { buildDefaultUsQuote, buildUsOrderPreview, getDefaultUsEtfUniverse } from "./us-shared";
import { buildUsReadOnlyConfig, getKnownUsVenue, mapUsBalanceRowsToPositions, mapUsDailyPriceRows, mapUsQuoteResponse, resolveUsVenueFromSearchInfoRow } from "./us-kis";

function shouldUseLiveUsKis(): boolean {
  return Boolean(
    process.env.KIS_APP_KEY_US ||
    process.env.KIS_APP_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function loadUsEtfConfig() {
  const [{ getToken }, { getActiveKisConfigForAssetClass }] = await Promise.all([
    import("../../kis/api"),
    import("../../kis/runtime-config"),
  ]);
  const active = await getActiveKisConfigForAssetClass("us_etf");
  if (!active) {
    throw new Error("us_etf adapter: KIS runtime config missing");
  }
  const token = await getToken(active.config.appKey, active.config.appSecret);
  return buildUsReadOnlyConfig(active.config, token);
}

async function resolveUsVenue(config: Awaited<ReturnType<typeof loadUsEtfConfig>>, symbol: string) {
  const known = getKnownUsVenue(symbol);
  if (known) return known;

  const { searchOverseasInfo } = await import("../../kis/api");
  for (const productTypeCode of ["512", "513", "529"] as const) {
    try {
      const info = await searchOverseasInfo(config, symbol, productTypeCode);
      const rows = Array.isArray(info?.output) ? info.output : info?.output ? [info.output] : [];
      const resolved = resolveUsVenueFromSearchInfoRow(rows[0] as Record<string, unknown> | undefined);
      if (resolved) return resolved;
    } catch {
      // continue
    }
  }

  return getKnownUsVenue("QQQ")!;
}

export const usEtfAdapter: MarketAdapter = {
  assetClass: "us_etf",
  label: "US ETF Adapter",
  capabilities: {
    supportsMarketOrder: true,
    supportsLimitOrder: true,
    fractionalShares: false,
  },
  async listUniverse(filter): Promise<MarketInstrument[]> {
    const universe = getDefaultUsEtfUniverse();
    const filtered = filter?.symbols?.length
      ? universe.filter((item) => filter.symbols?.includes(item.symbol))
      : universe;
    return typeof filter?.limit === "number" && filter.limit > 0
      ? filtered.slice(0, filter.limit)
      : filtered;
  },
  async listPositions(): Promise<PositionSnapshot[]> {
    if (!shouldUseLiveUsKis()) return [];
    const { getOverseasBalance } = await import("../../kis/api");
    const config = await loadUsEtfConfig();
    const data = await getOverseasBalance(config, "NASD", "USD");
    const rows = Array.isArray(data?.output1) ? data.output1 as Array<Record<string, unknown>> : [];
    return mapUsBalanceRowsToPositions({ rows, assetClass: "us_etf" });
  },
  async getQuote(symbol: string): Promise<MarketQuote> {
    if (!shouldUseLiveUsKis()) {
      const base = symbol === "SPY" ? 510 : symbol === "QQQ" ? 440 : 280;
      return buildDefaultUsQuote(symbol, { basePrice: base });
    }
    const { getOverseasPrice, getOverseasPriceDetail } = await import("../../kis/api");
    const config = await loadUsEtfConfig();
    const venue = await resolveUsVenue(config, symbol);
    try {
      const [priceData, detailData] = await Promise.all([
        getOverseasPrice(config, symbol, venue.priceExchange),
        getOverseasPriceDetail(config, symbol, venue.priceExchange),
      ]);
      const priceRow = Array.isArray(priceData?.output) ? priceData.output[0] : priceData?.output;
      const detailRow = Array.isArray(detailData?.output) ? detailData.output[0] : detailData?.output;
      const quote = mapUsQuoteResponse({
        symbol,
        priceRow: priceRow as Record<string, unknown> | undefined,
        detailRow: detailRow as Record<string, unknown> | undefined,
      });
      if (quote.price > 0) return quote;
    } catch {
      // fallback below
    }
    const base = symbol === "SPY" ? 510 : symbol === "QQQ" ? 440 : 280;
    return buildDefaultUsQuote(symbol, { basePrice: base });
  },
  async getCandles(symbol: string, limit: number): Promise<MarketCandle[]> {
    if (!shouldUseLiveUsKis()) {
      return Array.from({ length: Math.max(limit, 0) }, (_, index) => ({
        at: `2026-05-${String(index + 1).padStart(2, "0")}`,
        open: 50 + index,
        high: 51 + index,
        low: 49 + index,
        close: 50 + index,
        volume: 2_000_000 + index * 2_000,
      }));
    }
    const { getOverseasDailyPrices } = await import("../../kis/api");
    const config = await loadUsEtfConfig();
    const venue = await resolveUsVenue(config, symbol);
    try {
      const data = await getOverseasDailyPrices(config, symbol, venue.priceExchange, { gubn: "0", modp: "1" });
      const rows = Array.isArray(data?.output2) ? data.output2 as Array<Record<string, unknown>> : [];
      const candles = mapUsDailyPriceRows(rows, limit);
      if (candles.length > 0) return candles;
    } catch {
      // fallback below
    }
    return Array.from({ length: Math.max(limit, 0) }, (_, index) => ({
      at: `2026-05-${String(index + 1).padStart(2, "0")}`,
      open: 50 + index,
      high: 51 + index,
      low: 49 + index,
      close: 50 + index,
      volume: 2_000_000 + index * 2_000,
    }));
  },
  async previewOrder(intent: OrderIntent, position?: PositionSnapshot | null): Promise<OrderPreview> {
    return buildUsOrderPreview(intent, position);
  },
};
