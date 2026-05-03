import {
  analyzeSignal, analyzeSignalWithWeights, calcPositionSize,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, limitBuyOrder, getMinuteCandles } from "@/lib/engine/kis";
import { hasDangerousDisclosure, getListingDate, applyStockFilter, applySectorFilter } from "@/lib/engine/filters";
import { getInvestorTrend, scanSurgeStocks, scanInstitutionalBuys } from "@/lib/engine/market";
import { getOpenPosition, getSectorCounts, savePendingOrder, recordTradeMemory } from "@/lib/engine/db";
import { getStrategyBudget } from "@/lib/engine/strategies";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";
import { batchFetch, getOpeningBonus } from "@/lib/engine/steps";
import { joinBonusTags, queuePendingSignal, recordSuccessfulEntry, sleepRateLimit } from "@/lib/engine/entry-flow";
import { resolveEntryBuyRatio, resolveEntryPhase } from "@/lib/engine/lifecycle";
// intraday 보너스 제거 — VWAP/POC가 analyzeSignal 핵심 지표로 통합됨

function decideStrength(score: number, strongScore: number, weakScore: number): "strong" | "weak" | "none" {
  return score >= strongScore ? "strong" : score >= weakScore ? "weak" : "none";
}

const WATCHLIST_STRATEGY = "watchlist_pullback";
const SURGE_STRATEGY = "surge_momentum";
const INSTITUTIONAL_STRATEGY = "institutional_follow";

// ═══ STEP 2: 관심종목 신호 분석 (매수) ═══
export async function runStep2(
  ctx: StepContext,
  holdings: Record<string, string>[],
  marketTrend: MarketTrend,
  snapshotMap: Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>,
  tradeCount: number
): Promise<{ actions: EngineAction[]; tradeCount: number; scannedCount: number }> {
  const actions: EngineAction[] = [];
  let scannedCount = 0;
  const allocationPct = ctx.strategyAllocations[WATCHLIST_STRATEGY];
  const strategyBudget = getStrategyBudget(ctx.maxPerTrade, allocationPct);

  const sectorCounts = await getSectorCounts();

  const watchlist: string[] = ctx.config.watchlist ?? [];
  const availableWatchlist = watchlist.filter(
    (code) => !holdings.some((h) => h.pdno === code && Number(h.hldg_qty) > 0)
  );

  const wCandleMap   = await batchFetch(availableWatchlist, (code) => getDailyCandles(ctx.config, code));
  const wInvestorMap = await batchFetch(availableWatchlist, (code) => getInvestorTrend(ctx.config, code));
  const wMinuteMap   = await batchFetch(availableWatchlist, (code) => getMinuteCandles(ctx.config, code));
  scannedCount += availableWatchlist.length;

  let openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;

  for (const code of watchlist) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;
    if (!wCandleMap.has(code)) continue;

    const candles = wCandleMap.get(code)!;
    if (candles.length < 26) continue;

    const thresholds = { rsiBuy: ctx.rsiBuy, rsiSell: ctx.rsiSell, strongScore: ctx.strongScore, weakScore: ctx.weakScore };
    const minuteCandles = wMinuteMap.get(code) ?? [];
    const baseSignal = analyzeSignal(candles, thresholds, minuteCandles);
    const learnedSignal = ctx.customWeights ? analyzeSignalWithWeights(candles, ctx.customWeights, thresholds, minuteCandles) : baseSignal;

    const openingBonus = getOpeningBonus(code, snapshotMap);
    const investor = wInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
    // VWAP/POC는 analyzeSignal 핵심 지표로 통합 — openingBonus/investor/market만 보정
    const totalBonus = openingBonus + investor.bonus + marketTrend.bonus;
    const adjustedScore = learnedSignal.totalScore + totalBonus;
    const adjustedStrength = decideStrength(adjustedScore, ctx.strongScore, ctx.weakScore);
    const bonusTag = joinBonusTags([
      openingBonus !== 0 ? `장초반 ${openingBonus > 0 ? "+" : ""}${openingBonus}` : "",
      investor.label ? `[${investor.label}]` : "",
      marketTrend.label ? `[${marketTrend.label}]` : "",
    ]);

    if (adjustedStrength === "strong" && learnedSignal.side === "buy") {
      const priceData = await getPrice(ctx.config, code);
      const price = Number(priceData?.stck_prpr) || 0;
      const name = priceData?.hts_kor_isnm || code;
      if (price <= 0) continue;

      const listingDate = await getListingDate(ctx.config, code);
      await new Promise((r) => setTimeout(r, 200));
      const filter = applyStockFilter(priceData as Record<string, string>, listingDate);
      if (!filter.passed) {
        actions.push({ type: "filtered_out", code, name, detail: `종목 필터 탈락: ${filter.reason}` });
        continue;
      }

      const sector = (priceData as Record<string, string>).bstp_kor_isnm || null;
      const sectorFilter = applySectorFilter(sector, sectorCounts, ctx.maxPerSector);
      if (!sectorFilter.passed) {
        actions.push({ type: "skip", code, name, detail: sectorFilter.reason });
        continue;
      }

      const dart = await hasDangerousDisclosure(code);
      await new Promise((r) => setTimeout(r, 200));
      if (dart.danger) {
        actions.push({ type: "dart_filtered", code, name, detail: `DART 위험공시 탈락: ${dart.reason}` });
        continue;
      }

      const existingPos = await getOpenPosition(code);
      const buyRatio = resolveEntryBuyRatio(existingPos?.phase);
      const positionSize = calcPositionSize(
        learnedSignal.raw.atr, price,
        ctx.applied.targetRiskAmount, strategyBudget, ctx.applied.atrMultipliers.stop
      );
      const qty = Math.floor((positionSize * buyRatio) / price);
      if (qty <= 0) continue;

      const result = await limitBuyOrder(ctx.config, code, qty, price);
      const phase = resolveEntryPhase(existingPos?.phase);
      actions.push({
        type: result.success ? (phase === "initial" ? "split_buy_1" : "split_buy_2") : "buy_failed",
        code, name,
        detail: result.success
          ? `${adjustedScore}점 (${learnedSignal.raw.regime}) B:${baseSignal.totalScore}/L:${learnedSignal.totalScore} ${bonusTag} → ${phase === "initial" ? "1차" : "2차"} 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`
          : `${adjustedScore}점 ${bonusTag} → 매수 실패: ${result.msg}`,
      });

      if (result.success) {
        await recordSuccessfulEntry({
          ctx,
          code,
          name,
          qty,
          result,
          adjustedScore,
          strategyKey: WATCHLIST_STRATEGY,
          marketTrend,
          baseSignal,
          learnedSignal,
          bonuses: { market: marketTrend.bonus, investor: investor.bonus, snapshot: openingBonus },
        });
        tradeCount++;
        openPositionCount++;
      }
      await sleepRateLimit();

    } else if (adjustedStrength === "weak" && learnedSignal.side === "buy") {
      const priceData = await getPrice(ctx.config, code);
      const name = priceData?.hts_kor_isnm || code;
      await queuePendingSignal({
        code,
        name,
        score: adjustedScore,
        comment: `${learnedSignal.comment}${bonusTag}`,
        signal: learnedSignal,
        source: "watchlist",
        strategyKey: WATCHLIST_STRATEGY,
        allocationPct,
        openingBonus,
        institutionalBonus: investor.bonus,
      });

      actions.push({
        type: "pending_approval", code, name,
        detail: `약한 신호 ${adjustedScore}점${bonusTag} → DB 저장, 승인 대기. ${learnedSignal.comment}`,
      });
      await sleepRateLimit();
    } else {
      actions.push({
        type: "signal_skip",
        code, name: code,
        detail: `${adjustedScore}점 방향:${learnedSignal.side}(${adjustedStrength}) [${learnedSignal.raw.regime}] RSI:${learnedSignal.raw.rsi.toFixed(0)} MACD:${learnedSignal.raw.macdCrossover} MA:${learnedSignal.raw.ma5 > learnedSignal.raw.ma20 ? "↑" : "↓"} EMA:${learnedSignal.raw.ema5 > learnedSignal.raw.ema20 ? "↑" : "↓"} BB:${learnedSignal.raw.bbPosition} Vol:${learnedSignal.raw.volumeRatio.toFixed(0)}%${learnedSignal.raw.vwap ? ` VWAP:${Math.round(learnedSignal.raw.vwap).toLocaleString()}` : ""}${bonusTag ? " " + bonusTag : ""}`,
      });
    }
  }

  return { actions, tradeCount, scannedCount };
}

// ═══ STEP 3: KOSPI + KOSDAQ 급등주 스캔 ═══
export async function runStep3(
  ctx: StepContext,
  holdings: Record<string, string>[],
  marketTrend: MarketTrend,
  tradeCount: number
): Promise<{ actions: EngineAction[]; tradeCount: number; scannedCount: number }> {
  const actions: EngineAction[] = [];
  let scannedCount = 0;
  const allocationPct = ctx.strategyAllocations[SURGE_STRATEGY];
  const strategyBudget = getStrategyBudget(ctx.maxPerTrade, allocationPct);

  let openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  if (tradeCount >= ctx.maxDailyTrades || openPositionCount >= ctx.maxPositions) return { actions, tradeCount, scannedCount };

  const sectorCounts3 = await getSectorCounts();

  const surgeStocks = await scanSurgeStocks(ctx.config);
  const holdingCodes = new Set(holdings.map((h) => h.pdno));
  const watchlistSet = new Set(ctx.config.watchlist ?? []);
  const candidates = surgeStocks.filter((c) => !holdingCodes.has(c) && !watchlistSet.has(c));

  const sCandleMap = await batchFetch(candidates, (code) => getDailyCandles(ctx.config, code));
  const sInvestorMap = await batchFetch(candidates, (code) => getInvestorTrend(ctx.config, code));
  const sMinuteMap = await batchFetch(candidates, (code) => getMinuteCandles(ctx.config, code));
  scannedCount += candidates.length;

  for (const code of candidates) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;

    const candles = sCandleMap.get(code) ?? [];
    if (candles.length < 26) continue;

    const surgeMinuteCandles = sMinuteMap.get(code) ?? [];
    const surgeThresholds = { rsiBuy: ctx.rsiBuy, rsiSell: ctx.rsiSell, strongScore: ctx.strongScore, weakScore: ctx.weakScore };
    const surgeBaseSignal = analyzeSignal(candles, surgeThresholds, surgeMinuteCandles);
    const surgeLearnedSignal = ctx.customWeights ? analyzeSignalWithWeights(candles, ctx.customWeights, surgeThresholds, surgeMinuteCandles) : surgeBaseSignal;
    const surgeInvestor = sInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
    const surgeAdjustedScore = surgeLearnedSignal.totalScore + surgeInvestor.bonus + marketTrend.bonus;
    const surgeAdjustedStrength = decideStrength(surgeAdjustedScore, ctx.strongScore, ctx.weakScore);
    const surgeInvestorTag = joinBonusTags([
      surgeInvestor.label ? `[${surgeInvestor.label}]` : "",
      marketTrend.label ? `[${marketTrend.label}]` : "",
    ]);

    if (surgeAdjustedStrength === "strong" && surgeLearnedSignal.side === "buy") {
      const priceData = await getPrice(ctx.config, code);
      const price = Number(priceData?.stck_prpr) || 0;
      const name = priceData?.hts_kor_isnm || code;
      if (price <= 0) continue;

      const surgeListing = await getListingDate(ctx.config, code);
      await new Promise((r) => setTimeout(r, 200));
      const surgeFilter = applyStockFilter(priceData as Record<string, string>, surgeListing);
      if (!surgeFilter.passed) {
        actions.push({ type: "filtered_out", code, name, detail: `급등주 필터 탈락: ${surgeFilter.reason}` });
        continue;
      }

      const surgeSector = (priceData as Record<string, string>).bstp_kor_isnm || null;
      const surgeSectorFilter = applySectorFilter(surgeSector, sectorCounts3, ctx.maxPerSector);
      if (!surgeSectorFilter.passed) {
        actions.push({ type: "skip", code, name, detail: surgeSectorFilter.reason });
        continue;
      }

      const surgeDart = await hasDangerousDisclosure(code);
      await new Promise((r) => setTimeout(r, 200));
      if (surgeDart.danger) {
        actions.push({ type: "dart_filtered", code, name, detail: `급등주 DART 위험공시 탈락: ${surgeDart.reason}` });
        continue;
      }

      const surgePositionSize = calcPositionSize(
        surgeLearnedSignal.raw.atr, price,
        ctx.applied.targetRiskAmount, strategyBudget, ctx.applied.atrMultipliers.stop
      );
      const qty = Math.floor((surgePositionSize * 0.5) / price);
      if (qty <= 0) continue;

      const result = await limitBuyOrder(ctx.config, code, qty, price);
      actions.push({
        type: result.success ? "surge_buy" : "surge_buy_failed", code, name,
        detail: result.success
          ? `급등주 ${surgeAdjustedScore}점 (${surgeLearnedSignal.raw.regime}) B:${surgeBaseSignal.totalScore}/L:${surgeLearnedSignal.totalScore}${surgeInvestorTag} → 1차 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`
          : `급등주 ${surgeAdjustedScore}점${surgeInvestorTag} → 매수 실패: ${result.msg}`,
      });

      if (result.success) {
        await recordSuccessfulEntry({
          ctx,
          code,
          name,
          qty,
          result,
          adjustedScore: surgeAdjustedScore,
          strategyKey: SURGE_STRATEGY,
          marketTrend,
          baseSignal: surgeBaseSignal,
          learnedSignal: surgeLearnedSignal,
          bonuses: { market: marketTrend.bonus, investor: surgeInvestor.bonus, snapshot: 0 },
        });
        tradeCount++;
        openPositionCount++;
      }
      await sleepRateLimit();

    } else if (surgeAdjustedStrength === "weak" && surgeLearnedSignal.side === "buy") {
      const priceData2 = await getPrice(ctx.config, code);
      const surgeName = priceData2?.hts_kor_isnm || code;
      await queuePendingSignal({
        code,
        name: surgeName,
        score: surgeAdjustedScore,
        comment: `${surgeLearnedSignal.comment}${surgeInvestorTag}`,
        signal: surgeLearnedSignal,
        source: "surge",
        strategyKey: SURGE_STRATEGY,
        allocationPct,
        institutionalBonus: surgeInvestor.bonus,
      });

      actions.push({
        type: "surge_pending", code, name: surgeName,
        detail: `급등주 약한 ${surgeAdjustedScore}점${surgeInvestorTag} → DB 저장, 승인 대기. ${surgeLearnedSignal.comment}`,
      });
      await sleepRateLimit();
    } else {
      actions.push({
        type: "surge_signal_skip",
        code, name: code,
        detail: `${surgeAdjustedScore}점 방향:${surgeLearnedSignal.side}(${surgeAdjustedStrength}) [${surgeLearnedSignal.raw.regime}] RSI:${surgeLearnedSignal.raw.rsi.toFixed(0)} MACD:${surgeLearnedSignal.raw.macdCrossover} MA:${surgeLearnedSignal.raw.ma5 > surgeLearnedSignal.raw.ma20 ? "↑" : "↓"}${surgeInvestorTag ? " " + surgeInvestorTag : ""}`,
      });
    }
  }

  return { actions, tradeCount, scannedCount };
}

// ═══ STEP 4: 기관 순매수 상위 종목 추종 매수 ═══
export async function runStep4(
  ctx: StepContext,
  holdings: Record<string, string>[],
  marketTrend: MarketTrend,
  tradeCount: number,
): Promise<{ actions: EngineAction[]; tradeCount: number; scannedCount: number }> {
  const actions: EngineAction[] = [];
  let scannedCount = 0;
  const allocationPct = ctx.strategyAllocations[INSTITUTIONAL_STRATEGY];
  const strategyBudget = getStrategyBudget(ctx.maxPerTrade, allocationPct);

  let openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  if (tradeCount >= ctx.maxDailyTrades || openPositionCount >= ctx.maxPositions) {
    return { actions, tradeCount, scannedCount };
  }

  const cfg = ctx.config as unknown as Record<string, unknown>;
  const minOrgn: number = typeof cfg.minInstitutionalBuy === "number" ? cfg.minInstitutionalBuy : 50;

  const candidates = await scanInstitutionalBuys(ctx.config, minOrgn);
  if (candidates.length === 0) return { actions, tradeCount, scannedCount };

  const holdingCodes = new Set(holdings.map((h) => h.pdno));
  const watchlistSet = new Set(ctx.config.watchlist ?? []);
  const filtered = candidates.filter((c) => !holdingCodes.has(c.code) && !watchlistSet.has(c.code));
  scannedCount += filtered.length;

  const sectorCounts = await getSectorCounts();

  for (const { code, name: candidateName, orgn, frgn } of filtered) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;

    const candles = await getDailyCandles(ctx.config, code);
    await new Promise((r) => setTimeout(r, 200));
    if (candles.length < 26) continue;

    const minuteCandles = await getMinuteCandles(ctx.config, code);
    await new Promise((r) => setTimeout(r, 200));

    // 최소 기술 조건: RSI < 75, MA5 > MA20 (상승 추세, 과매수 아님)
    const signal = analyzeSignal(candles, undefined, minuteCandles);
    const rsiOk = signal.raw.rsi < 75;
    const maOk  = signal.raw.ma5 > signal.raw.ma20;

    if (!rsiOk || !maOk) {
      actions.push({
        type: "signal_skip", code, name: candidateName,
        detail: `기관추종 조건 미충족: RSI ${signal.raw.rsi.toFixed(0)}${!rsiOk ? "(≥75)" : ""} MA${!maOk ? "(하락)" : ""}`,
      });
      continue;
    }

    const priceData = await getPrice(ctx.config, code);
    const price = Number(priceData?.stck_prpr) || 0;
    const name  = priceData?.hts_kor_isnm || candidateName;
    if (price <= 0) continue;
    await new Promise((r) => setTimeout(r, 200));

    const listingDate = await getListingDate(ctx.config, code);
    await new Promise((r) => setTimeout(r, 200));
    const filter = applyStockFilter(priceData as Record<string, string>, listingDate);
    if (!filter.passed) {
      actions.push({ type: "filtered_out", code, name, detail: `종목 필터 탈락: ${filter.reason}` });
      continue;
    }

    const sector = (priceData as Record<string, string>).bstp_kor_isnm || null;
    const sectorFilter = applySectorFilter(sector, sectorCounts, ctx.maxPerSector);
    if (!sectorFilter.passed) {
      actions.push({ type: "skip", code, name, detail: sectorFilter.reason });
      continue;
    }

    const dart = await hasDangerousDisclosure(code);
    await new Promise((r) => setTimeout(r, 200));
    if (dart.danger) {
      actions.push({ type: "dart_filtered", code, name, detail: `DART 위험공시: ${dart.reason}` });
      continue;
    }

    // 기관 추종 매수: 반액 고정 (분산 리스크 관리)
    const qty = Math.floor((strategyBudget * 0.5) / price);
    if (qty <= 0) continue;

    const result = await limitBuyOrder(ctx.config, code, qty, price);
    const orgnLabel = `기관 ${orgn.toFixed(0)}억${frgn > 0 ? `+외국인 ${frgn.toFixed(0)}억` : ""}`;

    actions.push({
      type: result.success ? "orgn_follow_buy" : "buy_failed",
      code, name,
      detail: result.success
        ? `기관추종 (${orgnLabel}) RSI:${signal.raw.rsi.toFixed(0)} MA:↑ → 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주`
        : `기관추종 매수 실패 (${orgnLabel}): ${result.msg}`,
    });

    if (result.success) {
      const syntheticScore = Math.round(orgn + (frgn > 0 ? frgn * 0.5 : 0));
      await savePendingOrder({ stock_code: code, stock_name: name, order_no: result.ordNo ?? "", order_qty: qty, limit_price: result.limitPrice, signal_score: syntheticScore, strategy_key: INSTITUTIONAL_STRATEGY });
      await sendTradeAlert({ type: "buy", code, name, qty, price: result.limitPrice, score: syntheticScore, strategyKey: INSTITUTIONAL_STRATEGY, regime: signal.raw.regime });
      await recordTradeMemory({
        code, name,
        baseSignal: signal,
        learnedSignal: signal,
        bonuses: { market: marketTrend.bonus, investor: 0, snapshot: 0 },
        adjustedScore: syntheticScore,
        weightsSource: "default",
        positionSize: qty * result.limitPrice,
        entryPrice: result.limitPrice,
        stopLossPct: ctx.config.stopLoss,
        takeProfitPct: ctx.config.takeProfit,
      });
      tradeCount++;
      openPositionCount++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount, scannedCount };
}
