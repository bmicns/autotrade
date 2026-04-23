import { supabase } from "@/lib/supabase/api-client";
import {
  analyzeSignal, analyzeSignalWithWeights, calcPositionSize,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, limitBuyOrder, getMinuteCandles } from "@/lib/engine/kis";
import { hasDangerousDisclosure, getListingDate, applyStockFilter, applySectorFilter } from "@/lib/engine/filters";
import { getInvestorTrend, scanSurgeStocks } from "@/lib/engine/market";
import { openPosition, recordTradeMemory, getOpenPosition, getSectorCounts, savePendingOrder } from "@/lib/engine/db";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";
import { batchFetch, getOpeningBonus } from "@/lib/engine/steps";
// intraday 보너스 제거 — VWAP/POC가 analyzeSignal 핵심 지표로 통합됨

function decideStrength(score: number, strongScore: number, weakScore: number): "strong" | "weak" | "none" {
  return score >= strongScore ? "strong" : score >= weakScore ? "weak" : "none";
}

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
    const weightsSource: "learned" | "default" = ctx.customWeights ? "learned" : "default";
    const bonusTag = [
      openingBonus !== 0 ? `장초반 ${openingBonus > 0 ? "+" : ""}${openingBonus}` : "",
      investor.label ? `[${investor.label}]` : "",
      marketTrend.label ? `[${marketTrend.label}]` : "",
    ].filter(Boolean).join(" ");

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
      const buyRatio = existingPos?.phase === "initial" ? 1 : 0.5;
      const positionSize = calcPositionSize(
        learnedSignal.raw.atr, price,
        ctx.applied.targetRiskAmount, ctx.maxPerTrade, ctx.applied.atrMultipliers.stop
      );
      const qty = Math.floor((positionSize * buyRatio) / price);
      if (qty <= 0) continue;

      const result = await limitBuyOrder(ctx.config, code, qty, price);
      const phase = existingPos ? "full" : "initial";
      actions.push({
        type: result.success ? (phase === "initial" ? "split_buy_1" : "split_buy_2") : "buy_failed",
        code, name,
        detail: result.success
          ? `${adjustedScore}점 (${learnedSignal.raw.regime}) B:${baseSignal.totalScore}/L:${learnedSignal.totalScore} ${bonusTag} → ${phase === "initial" ? "1차" : "2차"} 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`
          : `${adjustedScore}점 ${bonusTag} → 매수 실패: ${result.msg}`,
      });

      if (result.success) {
        await savePendingOrder({
          stock_code: code,
          stock_name: name,
          order_no: result.ordNo ?? "",
          order_qty: qty,
          limit_price: result.limitPrice,
          signal_score: adjustedScore,
        });
        if (!existingPos) {
          await openPosition(code, name, result.limitPrice, qty, { ...learnedSignal, totalScore: adjustedScore }, "initial", sector ?? undefined);
          await recordTradeMemory({
            code, name, baseSignal, learnedSignal,
            bonuses: { market: marketTrend.bonus, investor: investor.bonus, snapshot: openingBonus },
            adjustedScore, weightsSource, positionSize: qty * result.limitPrice,
          });
        }
        await sendTradeAlert({ type: "buy", code, name, qty, price: result.limitPrice, score: adjustedScore });
        tradeCount++;
        openPositionCount++;
      }
      await new Promise((r) => setTimeout(r, 200));

    } else if (adjustedStrength === "weak" && learnedSignal.side === "buy") {
      const priceData = await getPrice(ctx.config, code);
      const name = priceData?.hts_kor_isnm || code;
      try {
        await supabase.from("pending_signals").insert({
          stock_code: code, stock_name: name,
          signal_score: adjustedScore,
          signal_comment: `${learnedSignal.comment}${bonusTag}`,
          signal_data: { indicators: learnedSignal.indicators, raw: learnedSignal.raw, matchCount: learnedSignal.matchCount, openingBonus, institutionalBonus: investor.bonus },
          source: "watchlist", status: "pending",
        });
      } catch { /* ignore */ }

      actions.push({
        type: "pending_approval", code, name,
        detail: `약한 신호 ${adjustedScore}점${bonusTag} → DB 저장, 승인 대기. ${learnedSignal.comment}`,
      });
      await new Promise((r) => setTimeout(r, 200));
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
    const surgeWeightsSource: "learned" | "default" = ctx.customWeights ? "learned" : "default";
    const surgeInvestorTag = [
      surgeInvestor.label ? `[${surgeInvestor.label}]` : "",
      marketTrend.label ? `[${marketTrend.label}]` : "",
    ].filter(Boolean).join(" ");

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
        ctx.applied.targetRiskAmount, ctx.maxPerTrade, ctx.applied.atrMultipliers.stop
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
        await savePendingOrder({
          stock_code: code,
          stock_name: name,
          order_no: result.ordNo ?? "",
          order_qty: qty,
          limit_price: result.limitPrice,
          signal_score: surgeAdjustedScore,
        });
        await openPosition(code, name, result.limitPrice, qty, { ...surgeLearnedSignal, totalScore: surgeAdjustedScore }, "initial", surgeSector ?? undefined);
        await recordTradeMemory({
          code, name,
          baseSignal: surgeBaseSignal, learnedSignal: surgeLearnedSignal,
          bonuses: { market: marketTrend.bonus, investor: surgeInvestor.bonus, snapshot: 0 },
          adjustedScore: surgeAdjustedScore, weightsSource: surgeWeightsSource,
          positionSize: qty * result.limitPrice,
        });
        await sendTradeAlert({ type: "surge_buy", code, name, qty, price: result.limitPrice, score: surgeAdjustedScore });
        tradeCount++;
        openPositionCount++;
      }
      await new Promise((r) => setTimeout(r, 200));

    } else if (surgeAdjustedStrength === "weak" && surgeLearnedSignal.side === "buy") {
      const priceData2 = await getPrice(ctx.config, code);
      const surgeName = priceData2?.hts_kor_isnm || code;
      try {
        await supabase.from("pending_signals").insert({
          stock_code: code, stock_name: surgeName,
          signal_score: surgeAdjustedScore,
          signal_comment: `${surgeLearnedSignal.comment}${surgeInvestorTag}`,
          signal_data: { indicators: surgeLearnedSignal.indicators, raw: surgeLearnedSignal.raw, matchCount: surgeLearnedSignal.matchCount, institutionalBonus: surgeInvestor.bonus },
          source: "surge", status: "pending",
        });
      } catch { /* ignore */ }

      actions.push({
        type: "surge_pending", code, name: surgeName,
        detail: `급등주 약한 ${surgeAdjustedScore}점${surgeInvestorTag} → DB 저장, 승인 대기. ${surgeLearnedSignal.comment}`,
      });
      await new Promise((r) => setTimeout(r, 200));
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
