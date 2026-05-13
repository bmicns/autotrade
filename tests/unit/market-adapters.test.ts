import test from "node:test";
import assert from "node:assert/strict";

import { getMarketAdapter, listMarketAdapters } from "../../src/lib/market";
import {
  buildAssetWorkspaceSnapshot,
  buildDefaultAssetPolicy,
  evaluateOrderPolicy,
  mergeAssetPolicy,
  overrideEngineV2Selections,
  parseEngineV2Selections,
  readEngineV2RuntimeConfig,
  resolveEngineV2RuntimeStatus,
  getScenarioProfile,
  evaluateScenarioDisqualifiers,
  runEngineV2Mock,
  runEngineV2Scenario,
  scoreScenarioCandidate,
} from "../../src/lib/engine-v2";
import { getDefaultUsEtfUniverse, getDefaultUsStockUniverse } from "../../src/lib/market/adapters/us-shared";
import { buildKrEtfOrderPreview, normalizeKrEtfUniverse } from "../../src/lib/market/adapters/kr-etf";
import { buildKrStockOrderPreview, normalizeKrStockUniverse } from "../../src/lib/market/adapters/kr-stock";
import { classifyUsInstrumentKind, getKnownUsVenue, mapUsDailyPriceRows, mapUsQuoteResponse } from "../../src/lib/market/adapters/us-kis";
import { mapKrEtfPositionSnapshots, mapKrStockPositionSnapshots } from "../../src/lib/market/positions";
import type { MarketAdapter } from "../../src/lib/market/contracts";

test("market adapter registry exposes all four planned asset classes", () => {
  const adapters = listMarketAdapters();
  assert.deepEqual(
    adapters.map((adapter) => adapter.assetClass).sort(),
    ["kr_etf", "kr_stock", "us_etf", "us_stock"],
  );
  assert.equal(getMarketAdapter("kr_stock").label, "Korean Stock Adapter");
  assert.equal(getMarketAdapter("us_etf").capabilities.supportsLimitOrder, true);
});

test("engine-v2 runtime config defaults to local dry-run and kr stock selection", () => {
  const config = readEngineV2RuntimeConfig({});
  assert.deepEqual(config, {
    environment: "dev",
    dryRun: true,
    selections: [{ assetClass: "kr_stock" }],
  });
});

test("engine-v2 runtime config parses explicit environment and asset classes", () => {
  const config = readEngineV2RuntimeConfig({
    NEXIO_ENV: "paper",
    NEXIO_V2_DRY_RUN: "false",
    NEXIO_V2_ASSET_CLASSES: "kr_stock,us_stock,kr_etf,us_etf",
  });

  assert.deepEqual(config, {
    environment: "paper",
    dryRun: false,
    selections: [
      { assetClass: "kr_stock" },
      { assetClass: "us_stock" },
      { assetClass: "kr_etf" },
      { assetClass: "us_etf" },
    ],
  });
});

test("parseEngineV2Selections filters invalid asset classes and falls back safely", () => {
  assert.deepEqual(parseEngineV2Selections("kr_stock,invalid,us_etf"), [
    { assetClass: "kr_stock" },
    { assetClass: "us_etf" },
  ]);
  assert.deepEqual(parseEngineV2Selections("invalid-only"), [
    { assetClass: "kr_stock" },
  ]);
});

test("overrideEngineV2Selections replaces selection set from query-like input", () => {
  const config = overrideEngineV2Selections(readEngineV2RuntimeConfig({ NEXIO_ENV: "dev" }), "us_stock,us_etf");
  assert.deepEqual(config.selections, [
    { assetClass: "us_stock" },
    { assetClass: "us_etf" },
  ]);
});

test("engine-v2 runtime status blocks prod environment", () => {
  const status = resolveEngineV2RuntimeStatus({
    NEXIO_ENV: "prod",
    NEXIO_V2_DRY_RUN: "false",
    KIS_RUNTIME_MODE: "live",
    APP_BASE_URL: "https://nexio.vercel.app",
    CRON_SECRET: "secret",
    SESSION_SECRET: "session",
  });

  assert.equal(status.allowed, false);
  assert.equal(status.phase, "blocked_prod");
  assert.equal(status.readyForPaperVerification, false);
  assert.equal(status.checks.find((item) => item.key === "environment")?.status, "fail");
});

test("engine-v2 runtime status marks complete paper verification candidate", () => {
  const status = resolveEngineV2RuntimeStatus({
    NEXIO_ENV: "paper",
    NEXIO_V2_DRY_RUN: "false",
    KIS_RUNTIME_MODE: "paper",
    APP_BASE_URL: "https://paper-nexio.example.com",
    CRON_SECRET: "secret",
    SESSION_SECRET: "session",
  });

  assert.equal(status.allowed, true);
  assert.equal(status.phase, "paper_candidate");
  assert.equal(status.readyForPaperVerification, true);
  assert.equal(status.checks.every((item) => item.status !== "fail" && item.status !== "warn"), true);
});

test("normalizeKrStockUniverse keeps active six-digit rows only", () => {
  const universe = normalizeKrStockUniverse([
    { code: "005930", name: "삼성전자", active: true },
    { code: "034020", name: "두산에너빌리티", active: null },
    { code: "ABC", name: "invalid", active: true },
    { code: "028050", name: "삼성E&A", active: false },
  ]);

  assert.deepEqual(universe, [
    {
      symbol: "005930",
      name: "삼성전자",
      assetClass: "kr_stock",
      region: "KR",
      kind: "stock",
      currency: "KRW",
      exchange: "KRX",
    },
    {
      symbol: "034020",
      name: "두산에너빌리티",
      assetClass: "kr_stock",
      region: "KR",
      kind: "stock",
      currency: "KRW",
      exchange: "KRX",
    },
  ]);
});

test("buildKrStockOrderPreview warns on invalid limit and oversell", () => {
  const preview = buildKrStockOrderPreview(
    { symbol: "005930", side: "sell", quantity: 3, orderType: "limit", limitPrice: 0 },
    { symbol: "005930", quantity: 1, averagePrice: 70000, currency: "KRW" },
  );

  assert.equal(preview.venue, "KRX");
  assert.deepEqual(preview.warnings, [
    "지정가 주문에는 유효한 limitPrice가 필요합니다.",
    "매도 수량이 보유 수량을 초과합니다. 보유 1주",
  ]);
});

test("mapKrStockPositionSnapshots normalizes remaining quantity only", () => {
  const positions = mapKrStockPositionSnapshots([
    {
      stock_code: "005930",
      stock_name: "삼성전자",
      entry_qty: 10,
      partial_exit_qty: 4,
      entry_price: 70000,
      entry_date: "2026-05-02T01:00:00.000Z",
    },
    {
      stock_code: "034020",
      stock_name: "두산에너빌리티",
      entry_qty: 1,
      partial_exit_qty: 1,
      entry_price: 127600,
      entry_date: "2026-05-04T04:26:54.988165+00:00",
    },
  ]);

  assert.deepEqual(positions, [
    {
      symbol: "005930",
      name: "삼성전자",
      quantity: 6,
      averagePrice: 70000,
      openedAt: "2026-05-02T01:00:00.000Z",
      currency: "KRW",
      assetClass: "kr_stock",
      region: "KR",
      kind: "stock",
    },
  ]);
});

test("normalizeKrEtfUniverse keeps active six-digit rows only", () => {
  const universe = normalizeKrEtfUniverse([
    { code: "069500", name: "KODEX 200", active: true },
    { code: "360750", name: "TIGER 미국S&P500", active: null },
    { code: "ETF", name: "invalid", active: true },
  ]);

  assert.deepEqual(universe, [
    {
      symbol: "069500",
      name: "KODEX 200",
      assetClass: "kr_etf",
      region: "KR",
      kind: "etf",
      currency: "KRW",
      exchange: "KRX",
    },
    {
      symbol: "360750",
      name: "TIGER 미국S&P500",
      assetClass: "kr_etf",
      region: "KR",
      kind: "etf",
      currency: "KRW",
      exchange: "KRX",
    },
  ]);
});

test("buildKrEtfOrderPreview warns on invalid limit and oversell", () => {
  const preview = buildKrEtfOrderPreview(
    { symbol: "069500", side: "sell", quantity: 5, orderType: "limit", limitPrice: 0 },
    { symbol: "069500", quantity: 2, averagePrice: 35000, currency: "KRW" },
  );

  assert.equal(preview.venue, "KRX");
  assert.deepEqual(preview.warnings, [
    "지정가 주문에는 유효한 limitPrice가 필요합니다.",
    "매도 수량이 보유 수량을 초과합니다. 보유 2주",
  ]);
});

test("mapKrEtfPositionSnapshots normalizes remaining quantity only", () => {
  const positions = mapKrEtfPositionSnapshots([
    {
      stock_code: "069500",
      stock_name: "KODEX 200",
      entry_qty: 8,
      partial_exit_qty: 3,
      entry_price: 35000,
      entry_date: "2026-05-02T01:00:00.000Z",
    },
  ]);

  assert.deepEqual(positions, [
    {
      symbol: "069500",
      name: "KODEX 200",
      quantity: 5,
      averagePrice: 35000,
      openedAt: "2026-05-02T01:00:00.000Z",
      currency: "KRW",
      assetClass: "kr_etf",
      region: "KR",
      kind: "etf",
    },
  ]);
});

test("buildAssetWorkspaceSnapshot aggregates universe, positions, and unique quotes", async () => {
  const adapter: MarketAdapter = {
    assetClass: "kr_stock",
    label: "stub",
    capabilities: {
      supportsMarketOrder: true,
      supportsLimitOrder: true,
      fractionalShares: false,
    },
    async listUniverse() {
      return [
        { symbol: "005930", name: "삼성전자", assetClass: "kr_stock", region: "KR", kind: "stock", currency: "KRW" },
        { symbol: "034020", name: "두산에너빌리티", assetClass: "kr_stock", region: "KR", kind: "stock", currency: "KRW" },
      ];
    },
    async listPositions() {
      return [
        { symbol: "034020", name: "두산에너빌리티", quantity: 1, averagePrice: 127600, currency: "KRW", assetClass: "kr_stock", region: "KR", kind: "stock" },
      ];
    },
    async getQuote(symbol) {
      return {
        symbol,
        price: symbol === "005930" ? 70000 : 127600,
        currency: "KRW",
        asOf: "2026-05-05T00:00:00.000Z",
      };
    },
    async getCandles() {
      return [];
    },
    async previewOrder(intent) {
      return {
        venue: "KRX",
        symbol: intent.symbol,
        side: intent.side,
        quantity: intent.quantity,
        orderType: intent.orderType,
        currency: "KRW",
        warnings: [],
      };
    },
  };

  const snapshot = await buildAssetWorkspaceSnapshot({
    assetClass: "kr_stock",
    adapter,
  });

  assert.equal(snapshot.assetClass, "kr_stock");
  assert.equal(snapshot.universe.length, 2);
  assert.equal(snapshot.positions.length, 1);
  assert.deepEqual(snapshot.quotes.map((item) => item.symbol).sort(), ["005930", "034020"]);
});

test("buildDefaultAssetPolicy creates per-asset defaults", () => {
  const bundle = buildDefaultAssetPolicy("kr_stock");
  assert.deepEqual(bundle, {
    risk: {
      assetClass: "kr_stock",
      enabled: true,
      maxPositions: 5,
      maxDailyTrades: 5,
      maxPositionValue: 1_000_000,
      stopLossPct: 5,
      trailingStopPct: 3,
      partialExitRatio: 50,
      maxHoldDays: 5,
    },
  });
});

test("mergeAssetPolicy preserves asset class while applying overrides", () => {
  const merged = mergeAssetPolicy(buildDefaultAssetPolicy("kr_etf"), {
    maxPositions: 2,
    maxPositionValue: 500_000,
  });

  assert.equal(merged.risk.assetClass, "kr_etf");
  assert.equal(merged.risk.maxPositions, 2);
  assert.equal(merged.risk.maxPositionValue, 500_000);
});

test("evaluateOrderPolicy blocks disabled or oversized orders", () => {
  const result = evaluateOrderPolicy(
    mergeAssetPolicy(buildDefaultAssetPolicy("kr_stock"), {
      enabled: false,
      maxPositionValue: 100_000,
      maxPositions: 1,
      maxDailyTrades: 1,
    }).risk,
    {
      quantity: 2,
      price: 80_000,
      currentPositionCount: 1,
      currentDailyTrades: 1,
    },
  );

  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, [
    "asset class disabled",
    "max positions reached",
    "max daily trades reached",
    "max position value exceeded",
  ]);
  assert.equal(result.orderValue, 160_000);
});

test("us stock and etf adapters expose mock universes", async () => {
  const usStock = getMarketAdapter("us_stock");
  const usEtf = getMarketAdapter("us_etf");

  assert.deepEqual(getDefaultUsStockUniverse().map((item) => item.symbol), ["AAPL", "MSFT", "NVDA"]);
  assert.deepEqual(getDefaultUsEtfUniverse().map((item) => item.symbol), ["SPY", "QQQ", "VTI"]);
  assert.equal((await usStock.listUniverse()).length, 3);
  assert.equal((await usEtf.listUniverse()).length, 3);
});

test("us venue helpers expose known venue profiles and classify etf heuristics", () => {
  assert.equal(getKnownUsVenue("AAPL")?.priceExchange, "NAS");
  assert.equal(getKnownUsVenue("SPY")?.orderExchange, "AMEX");
  assert.equal(classifyUsInstrumentKind("QQQ", "Invesco QQQ Trust"), "etf");
  assert.equal(classifyUsInstrumentKind("AAPL", "Apple"), "stock");
});

test("us quote and dailyprice mappers normalize official KIS field names", () => {
  const quote = mapUsQuoteResponse({
    symbol: "AAPL",
    priceRow: { last: "210.55", base: "208.10" },
    detailRow: { open: "209.00", high: "211.00", low: "208.50", last: "210.55", base: "208.10" },
  });
  assert.equal(quote.price, 210.55);
  assert.equal(quote.previousClose, 208.1);
  assert.equal(quote.high, 211);

  const candles = mapUsDailyPriceRows([
    { xymd: "20260501", open: "100", high: "101", low: "99", clos: "100.5", tvol: "1000" },
    { xymd: "20260502", open: "101", high: "102", low: "100", clos: "101.5", tvol: "1100" },
  ], 1);
  assert.deepEqual(candles, [
    { at: "20260502", open: 101, high: 102, low: 100, close: 101.5, volume: 1100 },
  ]);
});

test("runEngineV2Mock returns per-asset snapshot and policy status", async () => {
  const result = await runEngineV2Mock({
    environment: "dev",
    dryRun: true,
    selections: [
      { assetClass: "us_stock" },
      { assetClass: "us_etf" },
    ],
  }, {
    us_etf: { enabled: false },
  });

  assert.equal(result.environment, "dev");
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].assetClass, "us_stock");
  assert.equal(result.assets[0].policyAllowed, true);
  assert.equal(result.assets[1].assetClass, "us_etf");
  assert.equal(result.assets[1].policyAllowed, false);
  assert.deepEqual(result.assets[1].policyReasons, ["asset class disabled"]);
});

test("runEngineV2Scenario selects first non-held candidate and builds preview order", async () => {
  const result = await runEngineV2Scenario({
    environment: "dev",
    dryRun: true,
    selections: [
      { assetClass: "us_stock" },
    ],
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].assetClass, "us_stock");
  assert.equal(result.assets[0].policyAllowed, true);
  assert.equal(result.assets[0].candidate?.symbol, "AAPL");
  assert.equal(result.assets[0].candidate?.score, 115);
  assert.equal(result.assets[0].candidate?.breakdown.length, 10);
  assert.equal(result.assets[0].candidate?.candles.length, 5);
  assert.equal(result.assets[0].candidate?.breakdown[0]?.label, "latest close above previous close");
  assert.equal(result.assets[0].orderPreview?.symbol, "AAPL");
  assert.equal(result.assets[0].orderPreview?.orderType, "limit");
});

test("runEngineV2Scenario applies profile overrides to block under raised threshold", async () => {
  const result = await runEngineV2Scenario(
    {
      environment: "dev",
      dryRun: true,
      selections: [
        { assetClass: "us_stock" },
      ],
    },
    undefined,
    {
      us_stock: { minScore: 120 },
    },
  );

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].candidate?.symbol, "AAPL");
  assert.equal(result.assets[0].candidate?.score, 115);
  assert.equal(result.assets[0].policyAllowed, false);
  assert.equal(result.assets[0].orderPreview, null);
  assert.deepEqual(result.assets[0].policyReasons, ["score below threshold (115 < 120)"]);
});

test("scoreScenarioCandidate returns momentum reasons from rising candles", () => {
  const scored = scoreScenarioCandidate({
    assetClass: "us_stock",
    candles: [
      { at: "2026-05-01", open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { at: "2026-05-02", open: 101, high: 102, low: 100, close: 101, volume: 1100 },
      { at: "2026-05-03", open: 102, high: 103, low: 101, close: 102, volume: 1200 },
      { at: "2026-05-04", open: 103, high: 104, low: 102, close: 103, volume: 1300 },
      { at: "2026-05-05", open: 104, high: 105, low: 103, close: 104, volume: 1400 },
    ],
  });

  assert.equal(scored.score, 115);
  assert.deepEqual(scored.reasons, [
    "latest close above previous close",
    "close above open",
    "recent high breakout",
    "higher low support",
    "volume above recent average",
    "three-candle momentum",
    "controlled daily range",
    "positive five-candle return",
    "close above recent average",
    "volatility compression",
  ]);
  assert.equal(scored.breakdown.length, 10);
  assert.equal(scored.breakdown.every((item) => item.matched), true);
});

test("getScenarioProfile exposes asset-class-specific thresholds", () => {
  assert.deepEqual(getScenarioProfile("kr_stock"), {
    assetClass: "kr_stock",
    minScore: 60,
    closeMomentumWeight: 25,
    breakoutWeight: 20,
    volumeWeight: 10,
    trendWeight: 20,
    openStrengthWeight: 10,
    higherLowWeight: 10,
    volatilityWeight: 5,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 5,
    overheatedThresholdPct: 7,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  });
  assert.deepEqual(getScenarioProfile("kr_etf"), {
    assetClass: "kr_etf",
    minScore: 50,
    closeMomentumWeight: 20,
    breakoutWeight: 10,
    volumeWeight: 10,
    trendWeight: 15,
    openStrengthWeight: 10,
    higherLowWeight: 10,
    volatilityWeight: 10,
    returnWeight: 10,
    averageCloseWeight: 10,
    compressionWeight: 10,
    overheatedThresholdPct: 5,
    volumeBreakdownRatio: 0.6,
    pullbackConsecutiveCount: 2,
  });
});

test("evaluateScenarioDisqualifiers blocks overheated weak setups", () => {
  const reasons = evaluateScenarioDisqualifiers({
    assetClass: "kr_stock",
    candles: [
      { at: "2026-05-01", open: 100, high: 104, low: 99, close: 103, volume: 1000 },
      { at: "2026-05-02", open: 103, high: 105, low: 101, close: 102, volume: 1000 },
      { at: "2026-05-03", open: 102, high: 103, low: 99, close: 101, volume: 1000 },
      { at: "2026-05-04", open: 101, high: 102, low: 97, close: 100, volume: 1000 },
      { at: "2026-05-05", open: 100, high: 109, low: 99, close: 99, volume: 300 },
    ],
  });

  assert.deepEqual(reasons, [
    "volatility overheated (10.00% >= 7%)",
    "volume breakdown",
    "2-candle pullback",
  ]);
});

test("evaluateScenarioDisqualifiers respects override thresholds", () => {
  const reasons = evaluateScenarioDisqualifiers({
    assetClass: "kr_stock",
    profileOverrides: {
      overheatedThresholdPct: 12,
      volumeBreakdownRatio: 0.2,
      pullbackConsecutiveCount: 0,
    },
    candles: [
      { at: "2026-05-01", open: 100, high: 104, low: 99, close: 103, volume: 1000 },
      { at: "2026-05-02", open: 103, high: 105, low: 101, close: 102, volume: 1000 },
      { at: "2026-05-03", open: 102, high: 103, low: 99, close: 101, volume: 1000 },
      { at: "2026-05-04", open: 101, high: 102, low: 97, close: 100, volume: 1000 },
      { at: "2026-05-05", open: 100, high: 109, low: 99, close: 99, volume: 300 },
    ],
  });

  assert.deepEqual(reasons, []);
});
