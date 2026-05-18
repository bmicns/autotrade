import {
  analyzeSignal, analyzeSignalWithWeights, calcPositionSize,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, limitBuyOrder, getMinuteCandles } from "@/lib/engine/kis";
import { hasDangerousDisclosure, getListingDate, applyStockFilter, applySectorFilter } from "@/lib/engine/filters";
import { getInvestorTrend, scanSurgeStocks, scanInstitutionalBuys } from "@/lib/engine/market";
import { getLatestStopLossReference, getOpenPosition, getSectorCounts, getTodayEntryCount, savePendingOrder, recordTradeMemory } from "@/lib/engine/db";
import { getStrategyBudget } from "@/lib/engine/strategies";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";
import { batchFetch, getOpeningBonus } from "@/lib/engine/steps";
import { joinBonusTags, queuePendingSignal, recordSuccessfulEntry, sleepRateLimit } from "@/lib/engine/entry-flow";
import { canReenterPosition, shouldAllowStopLossReentry } from "@/lib/engine/lifecycle";
import { MAX_DAILY_ENTRIES_PER_STOCK } from "@/lib/engine/constants";
import { buildHoldingNewsAlert, fetchNewsSnapshot, scoreNewsForStock, summarizeNewsKeywords } from "@/lib/news";
import {
  evaluateSurgeEarlyEntry,
  resolveConfiguredPerStockEntryLimit,
  resolveSurgeBuyRatio,
  resolveSurgeIntradayEdge,
  resolveSurgeNewsRiskCooldown,
  resolveSurgeReentryCooldown,
} from "@/lib/engine/surge-strategy";
import { buildOrderFailureAction, recordOrderFailureEvent } from "@/lib/engine/order-failure";
import { recordEngineEvent } from "@/lib/engine/event-log";
// intraday 보너스 제거 — VWAP/POC가 analyzeSignal 핵심 지표로 통합됨

async function markStep3Stage(stage: string, payload: Record<string, unknown> = {}) {
  await recordEngineEvent({
    eventType: "engine_stage_marker",
    stockCode: null,
    entityTable: "operations",
    entityId: null,
    payload: {
      stage: `step3:${stage}`,
      ...payload,
      marked_at: new Date().toISOString(),
    },
  });
}

function decideStrength(score: number, strongScore: number, weakScore: number): "strong" | "weak" | "none" {
  return score >= strongScore ? "strong" : score >= weakScore ? "weak" : "none";
}

function resolveLearningTimeBucket(now: Date): "장초반" | "오전" | "오후" | "장마감" {
  const hour = now.getHours();
  if (hour <= 9) return "장초반";
  if (hour <= 11) return "오전";
  if (hour <= 14) return "오후";
  return "장마감";
}

function formatStopLossReentryLabel(stopPrice: number): string {
  return `손절가 ${Math.round(stopPrice).toLocaleString()}원 회복 재진입`;
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
  const strategyBudget = Math.min(getStrategyBudget(ctx.totalCapital, allocationPct), ctx.availableCash || Number.MAX_SAFE_INTEGER);

  const sectorCounts = await getSectorCounts();

  const watchlist: string[] = ctx.config.watchlist ?? [];
  const availableWatchlist = watchlist;

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
      if (price <= 0) {
        const detail = priceData?.__error_message ? `현재가 조회 실패: ${priceData.__error_message}` : "현재가 조회 실패";
        actions.push({ type: "price_lookup_failed", code, name, detail });
        continue;
      }

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
      const existingPhase = existingPos?.phase as string | null | undefined;
      if (existingPos && !canReenterPosition(existingPhase)) {
        actions.push({ type: "signal_skip", code, name, detail: "기보유 포지션 유지 중 — 재진입 대기" });
        continue;
      }
      const todayEntryCount = await getTodayEntryCount(code);
      if (todayEntryCount >= MAX_DAILY_ENTRIES_PER_STOCK) {
        actions.push({ type: "skip", code, name, detail: `당일 재진입 한도 도달 (${todayEntryCount}/${MAX_DAILY_ENTRIES_PER_STOCK})` });
        continue;
      }
      const latestStopLoss = !existingPos ? await getLatestStopLossReference(code) : null;
      const stopLossRecoveryReentry = !existingPos && latestStopLoss
        ? shouldAllowStopLossReentry({
            currentPrice: price,
            stopPrice: latestStopLoss.stopPrice,
            raw: learnedSignal.raw,
          })
        : false;
      const isTrailingReentry = existingPhase === "partial_tp";
      const isLegacySplit = existingPhase === "initial";
      const buyRatio = isTrailingReentry || isLegacySplit || stopLossRecoveryReentry ? 0.5 : 1;
      const positionSize = calcPositionSize(
        learnedSignal.raw.atr, price,
        ctx.applied.targetRiskAmount, strategyBudget, ctx.applied.atrMultipliers.stop
      );
      const qty = Math.floor((positionSize * buyRatio) / price);
      if (qty <= 0) continue;

      const result = await limitBuyOrder(ctx.config, code, qty, price);
      if (result.success) {
        actions.push({
          type: isTrailingReentry || isLegacySplit ? "split_buy_2" : "split_buy_1",
          code,
          name,
          detail: `${adjustedScore}점 (${learnedSignal.raw.regime}) B:${baseSignal.totalScore}/L:${learnedSignal.totalScore} ${bonusTag} → ${stopLossRecoveryReentry && latestStopLoss ? formatStopLossReentryLabel(latestStopLoss.stopPrice) : isTrailingReentry ? "트레일링 재진입" : isLegacySplit ? "레거시 2차" : "1차"} 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`,
        });
      } else {
        await recordOrderFailureEvent({
          stockCode: code,
          stockName: name,
          side: "buy",
          message: result.msg,
          strategyKey: WATCHLIST_STRATEGY,
          orderQty: qty,
          limitPrice: result.limitPrice,
          context: stopLossRecoveryReentry && latestStopLoss ? formatStopLossReentryLabel(latestStopLoss.stopPrice) : isTrailingReentry ? "트레일링 재진입" : isLegacySplit ? "레거시 2차" : "watchlist 매수",
        });
        actions.push(buildOrderFailureAction({
          defaultType: "buy_failed",
          code,
          name,
          message: result.msg,
          prefix: `${adjustedScore}점 ${bonusTag} → 매수 실패`,
        }));
      }

      if (result.success) {
        await recordSuccessfulEntry({
          ctx,
          code,
          name,
          qty,
          result,
          adjustedScore,
          strategyKey: WATCHLIST_STRATEGY,
          baseSignal,
          learnedSignal,
          bonuses: { market: marketTrend.bonus, investor: investor.bonus, snapshot: openingBonus },
        });
        tradeCount++;
        if (!existingPos) openPositionCount++;
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
  let watchlistExcludedCount = 0;
  let blockedHoldingCount = 0;
  let reentryCooldownCount = 0;
  let entryLimitCount = 0;
  let shortCandleCount = 0;
  let qtyZeroCount = 0;
  const allocationPct = ctx.strategyAllocations[SURGE_STRATEGY];
  const strategyBudget = Math.min(getStrategyBudget(ctx.totalCapital, allocationPct), ctx.availableCash || Number.MAX_SAFE_INTEGER);

  let openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  if (tradeCount >= ctx.maxDailyTrades || openPositionCount >= ctx.maxPositions) return { actions, tradeCount, scannedCount };

  const sectorCounts3 = await getSectorCounts();
  await markStep3Stage("sector_counts_loaded", { sector_count: sectorCounts3.size });

  const { candidates: surgeStocks, diagnostic: surgeDiagnostic } = await scanSurgeStocks(ctx.config);
  await markStep3Stage("surge_candidates_loaded", { surge_stock_count: surgeStocks.length });
  const newsSnapshot = await fetchNewsSnapshot();
  await markStep3Stage("news_snapshot_loaded", { latest_news_count: newsSnapshot.latestNews.length });
  const holdingCodes = new Set(holdings.map((h) => h.pdno));
  const watchlistSet = new Set(ctx.config.watchlist ?? []);
  watchlistExcludedCount = surgeStocks.filter((candidate) => watchlistSet.has(candidate.code)).length;
  const candidates = surgeStocks.filter((c) => !watchlistSet.has(c.code));
  const learningNow = new Date();
  const learningTimeBucket = resolveLearningTimeBucket(learningNow);

  const candidateCodes = candidates.map((candidate) => candidate.code);
  const candidateNames = new Map(candidates.map((candidate) => [candidate.code, candidate.name]));
  const sCandleMap = await batchFetch(candidateCodes, (code) => getDailyCandles(ctx.config, code));
  await markStep3Stage("candles_batch_loaded", { candidate_count: candidateCodes.length, candle_count: sCandleMap.size });
  const sInvestorMap = await batchFetch(candidateCodes, (code) => getInvestorTrend(ctx.config, code));
  await markStep3Stage("investor_batch_loaded", { investor_count: sInvestorMap.size });
  const sMinuteMap = await batchFetch(candidateCodes, (code) => getMinuteCandles(ctx.config, code));
  await markStep3Stage("minute_batch_loaded", { minute_count: sMinuteMap.size });
  scannedCount += candidates.length;

  actions.push({
    type: "surge_scan_summary",
    code: "",
    detail: `급등주 후보 ${surgeStocks.length}건 · watchlist 제외 ${watchlistExcludedCount}건 · 실평가 ${candidates.length}건 · ${surgeDiagnostic.marketDiagnostics.map((item) => {
      const marketLabel = item.market === "J" ? "KOSPI" : "KOSDAQ";
      const parts = [`${marketLabel} 등락률 ${item.fluctuationCount}건`, `거래량 ${item.volumeCount}건`];
      if (item.fluctuationError) parts.push(`등락률오류 ${item.fluctuationError}`);
      if (item.volumeError) parts.push(`거래량오류 ${item.volumeError}`);
      return parts.join(" / ");
    }).join(" · ")}`,
  });

  for (const code of candidateCodes) {
    await markStep3Stage("candidate_started", { code, trade_count: tradeCount, open_position_count: openPositionCount });
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;

    const existingPos = await getOpenPosition(code);
    if (holdingCodes.has(code) && !canReenterPosition(existingPos?.phase as string | null)) {
      blockedHoldingCount++;
      continue;
    }
    const reentryCooldown = resolveSurgeReentryCooldown({
      existingPhase: existingPos?.phase as string | null,
      entryDate: (existingPos as { entry_date?: string | null } | null | undefined)?.entry_date ?? null,
      cooldownMinutes: ctx.config.surgeReentryCooldownMinutes,
    });
    if (reentryCooldown.blocked) {
      reentryCooldownCount++;
      actions.push({ type: "surge_reentry_cooldown_skip", code, name: code, detail: `급등주 재진입 쿨다운 ${reentryCooldown.remainingMinutes}분 남음` });
      continue;
    }
    const todayEntryCount = await getTodayEntryCount(code);
    const perStockEntryLimit = resolveConfiguredPerStockEntryLimit(SURGE_STRATEGY, ctx.config.surgeMaxDailyEntriesPerStock);
    if (todayEntryCount >= perStockEntryLimit) {
      entryLimitCount++;
      actions.push({ type: "skip", code, name: code, detail: `당일 재진입 한도 도달 (${todayEntryCount}/${perStockEntryLimit})` });
      continue;
    }

    const candles = sCandleMap.get(code) ?? [];
    if (candles.length < 26) {
      shortCandleCount++;
      continue;
    }

    const surgeMinuteCandles = sMinuteMap.get(code) ?? [];
    const surgeThresholds = { rsiBuy: ctx.rsiBuy, rsiSell: ctx.rsiSell, strongScore: ctx.strongScore, weakScore: ctx.weakScore };
    const surgeBaseSignal = analyzeSignal(candles, surgeThresholds, surgeMinuteCandles);
    const surgeLearnedSignal = ctx.customWeights ? analyzeSignalWithWeights(candles, ctx.customWeights, surgeThresholds, surgeMinuteCandles) : surgeBaseSignal;
    const surgeInvestor = sInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
    const surgeName = candidateNames.get(code) ?? code;
    const surgeNews = scoreNewsForStock(surgeName, newsSnapshot.latestNews, {
      positiveBonus: ctx.config.surgeNewsPositiveBonus,
      negativePenalty: ctx.config.surgeNewsNegativePenalty,
    });
    const surgeNewsAlert = buildHoldingNewsAlert(surgeName, newsSnapshot.latestNews);
    const surgeNewsCooldown = resolveSurgeNewsRiskCooldown({
      publishedAts: (surgeNewsAlert?.riskItems ?? []).map((item) => item.publishedAt),
      cooldownMinutes: ctx.config.surgeNewsRiskCooldownMinutes,
    });
    const surgeNewsKeywords = summarizeNewsKeywords(surgeNews.matched, 3).map((item) => item.keyword);
    const intradayEdge = resolveSurgeIntradayEdge(learningNow, {
      openBonus: ctx.config.surgeOpenBonus,
      morningBonus: ctx.config.surgeMorningBonus,
      latePenalty: ctx.config.surgeLatePenalty,
    });
    const surgeTrigger = evaluateSurgeEarlyEntry({
      minuteCandles: surgeMinuteCandles,
      priceData: undefined,
    });
    const surgeEntryTag = existingPos?.phase === "partial_tp"
      ? "surge_reentry"
      : surgeTrigger.earlyEntry
        ? "surge_early_entry"
        : "surge_standard_entry";
    const learningTagPenalty = ctx.applied.riskAdjustments.surgeEntryTagPenalties[surgeEntryTag] ?? 0;
    const learningTimePenalty = ctx.applied.riskAdjustments.timeBucketPenalties[learningTimeBucket] ?? 0;
    const learningKeywordPenalty = surgeNewsKeywords.reduce((maxPenalty, keyword) => {
      const penalty = ctx.applied.riskAdjustments.newsKeywordPenalties[keyword] ?? 0;
      return Math.max(maxPenalty, penalty);
    }, 0);
    let surgeAdjustedScore = surgeLearnedSignal.totalScore + surgeInvestor.bonus + marketTrend.bonus + surgeTrigger.bonus + intradayEdge.bonus + surgeNews.bonus - learningTagPenalty - learningTimePenalty - learningKeywordPenalty;
    const surgeAdjustedStrength = decideStrength(surgeAdjustedScore, ctx.strongScore, ctx.weakScore);
    const surgeInvestorTag = joinBonusTags([
      surgeInvestor.label ? `[${surgeInvestor.label}]` : "",
      marketTrend.label ? `[${marketTrend.label}]` : "",
      intradayEdge.label ? `[${intradayEdge.label}]` : "",
      surgeNews.label ? `[${surgeNews.label}]` : "",
      learningTagPenalty > 0 ? `[학습진입 -${learningTagPenalty}]` : "",
      learningTimePenalty > 0 ? `[학습시간 -${learningTimePenalty}]` : "",
      learningKeywordPenalty > 0 ? `[학습키워드 -${learningKeywordPenalty}]` : "",
    ]);
    const surgeWeakAutoBuyFloor = Math.max(ctx.weakScore + 12, ctx.strongScore - 18);
    const surgeWeakAutoBuyCandidate =
      surgeLearnedSignal.side === "buy" &&
      surgeAdjustedStrength === "weak" &&
      surgeAdjustedScore >= surgeWeakAutoBuyFloor &&
      surgeTrigger.bonus >= 8 &&
      surgeNews.bonus >= 0;
    const shouldEvaluateEntry = surgeLearnedSignal.side === "buy" && (
      surgeAdjustedStrength === "strong" ||
      surgeTrigger.earlyEntry ||
      surgeWeakAutoBuyCandidate
    );
    const shouldQueuePending = surgeLearnedSignal.side === "buy" && !shouldEvaluateEntry && (surgeAdjustedStrength === "weak" || surgeTrigger.bonus >= 8);
    if ((surgeNewsAlert?.riskItems.length ?? 0) > 0 && surgeNewsCooldown.blocked) {
      actions.push({
        type: "surge_news_cooldown_skip",
        code,
        name: surgeName,
        detail: `악재 뉴스 쿨다운 ${surgeNewsCooldown.remainingMinutes}분 남음 · ${surgeNewsAlert?.riskItems[0]?.title ?? "뉴스 리스크"}`,
      });
      continue;
    }
    if ((surgeNewsAlert?.riskItems.length ?? 0) > 0 && surgeNews.bonus < 0) {
      actions.push({
        type: "surge_news_risk_skip",
        code,
        name: surgeName,
        detail: surgeNewsAlert?.riskItems.slice(0, 2).map((item) => item.title).join(" | ") || `뉴스 리스크 ${surgeNews.bonus}점`,
      });
      continue;
    }

    if (shouldEvaluateEntry) {
      const priceData = await getPrice(ctx.config, code);
      const price = Number(priceData?.stck_prpr) || 0;
      const name = priceData?.hts_kor_isnm || code;
      if (price <= 0) {
        const detail = priceData?.__error_message ? `현재가 조회 실패: ${priceData.__error_message}` : "현재가 조회 실패";
        actions.push({ type: "price_lookup_failed", code, name, detail });
        continue;
      }

      const liveTrigger = evaluateSurgeEarlyEntry({
        minuteCandles: surgeMinuteCandles,
        priceData,
      });
      const latestStopLoss = !existingPos ? await getLatestStopLossReference(code) : null;
      const stopLossRecoveryReentry = !existingPos && latestStopLoss
        ? shouldAllowStopLossReentry({
            currentPrice: price,
            stopPrice: latestStopLoss.stopPrice,
            raw: surgeLearnedSignal.raw,
          })
        : false;
      const liveEntryTag = existingPos?.phase === "partial_tp"
        ? "surge_reentry"
        : liveTrigger.earlyEntry
          ? "surge_early_entry"
          : "surge_standard_entry";
      const liveLearningTagPenalty = ctx.applied.riskAdjustments.surgeEntryTagPenalties[liveEntryTag] ?? 0;
      surgeAdjustedScore = surgeLearnedSignal.totalScore + surgeInvestor.bonus + marketTrend.bonus + liveTrigger.bonus + intradayEdge.bonus + surgeNews.bonus - liveLearningTagPenalty - learningTimePenalty - learningKeywordPenalty;
      const canEarlyCatch = liveTrigger.earlyEntry;
      const liveStrength = decideStrength(surgeAdjustedScore, ctx.strongScore, ctx.weakScore);
      const liveWeakAutoBuyCandidate =
        surgeLearnedSignal.side === "buy" &&
        liveStrength === "weak" &&
        surgeAdjustedScore >= surgeWeakAutoBuyFloor &&
        liveTrigger.bonus >= 8 &&
        surgeNews.bonus >= 0;
      if (surgeLearnedSignal.side !== "buy" || (liveStrength !== "strong" && !canEarlyCatch && !liveWeakAutoBuyCandidate)) {
        actions.push({
          type: "surge_signal_skip",
          code,
          name,
          detail: `급등주 선캐치 조건 미충족 (${surgeAdjustedScore}점${liveTrigger.reasons.length > 0 ? ` · ${liveTrigger.reasons.join(", ")}` : ""})`,
        });
        continue;
      }
      if (!intradayEdge.allowFreshEntry && existingPos?.phase !== "partial_tp" && !canEarlyCatch) {
        actions.push({
          type: "surge_late_entry_skip",
          code,
          name,
          detail: `장마감 신규진입 보수화 (${surgeAdjustedScore}점${liveTrigger.reasons.length > 0 ? ` · ${liveTrigger.reasons.join(", ")}` : ""})`,
        });
        continue;
      }

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
      const stopLossRecoveryRatio = stopLossRecoveryReentry ? 0.5 : 1;
      const qty = Math.floor((surgePositionSize * resolveSurgeBuyRatio(existingPos?.phase as string | null, ctx.config.surgeReentryBuyRatio) * stopLossRecoveryRatio) / price);
      if (qty <= 0) {
        qtyZeroCount++;
        continue;
      }

      const result = await limitBuyOrder(ctx.config, code, qty, price);
      if (result.success) {
        actions.push({
          type: existingPos?.phase === "partial_tp"
            ? "surge_reentry_buy"
            : liveTrigger.earlyEntry
              ? "surge_early_entry_buy"
              : "surge_buy",
          code,
          name,
          detail: `급등주 ${surgeAdjustedScore}점 (${surgeLearnedSignal.raw.regime}) B:${surgeBaseSignal.totalScore}/L:${surgeLearnedSignal.totalScore}${surgeInvestorTag}${liveTrigger.reasons.length > 0 ? ` [${liveTrigger.reasons.join(" · ")}]` : ""} → ${stopLossRecoveryReentry && latestStopLoss ? `${formatStopLossReentryLabel(latestStopLoss.stopPrice)} ` : ""}지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`,
        });
      } else {
        await recordOrderFailureEvent({
          stockCode: code,
          stockName: name,
          side: "buy",
          message: result.msg,
          strategyKey: SURGE_STRATEGY,
          orderQty: qty,
          limitPrice: result.limitPrice,
          context: stopLossRecoveryReentry && latestStopLoss ? formatStopLossReentryLabel(latestStopLoss.stopPrice) : existingPos?.phase === "partial_tp" ? "급등 재진입" : liveTrigger.earlyEntry ? "급등 선캐치" : "급등 매수",
        });
        actions.push(buildOrderFailureAction({
          defaultType: "surge_buy_failed",
          code,
          name,
          message: result.msg,
          prefix: `급등주 ${surgeAdjustedScore}점${surgeInvestorTag}${liveTrigger.reasons.length > 0 ? ` [${liveTrigger.reasons.join(" · ")}]` : ""} → 매수 실패`,
        }));
      }

      if (result.success) {
        await recordSuccessfulEntry({
          ctx,
          code,
          name,
          qty,
          result,
          adjustedScore: surgeAdjustedScore,
          strategyKey: SURGE_STRATEGY,
          entryTag: liveEntryTag,
          signalContext: {
            newsKeywords: surgeNewsKeywords,
            newsScore: surgeNews.bonus,
            learningRiskEnabled: ctx.config.learningRiskAdjustmentsEnabled !== false,
            learningAdjustments: {
              entryTag: liveEntryTag,
              timeBucket: learningTimeBucket,
              keywords: surgeNewsKeywords,
              penalties: {
                entryTag: liveLearningTagPenalty,
                timeBucket: learningTimePenalty,
                newsKeyword: learningKeywordPenalty,
              },
            },
          },
          baseSignal: surgeBaseSignal,
          learnedSignal: surgeLearnedSignal,
          bonuses: { market: marketTrend.bonus, investor: surgeInvestor.bonus, snapshot: 0 },
        });
        tradeCount++;
        if (!existingPos) openPositionCount++;
        await markStep3Stage("candidate_entry_recorded", { code, trade_count: tradeCount, open_position_count: openPositionCount });
      }
      await sleepRateLimit();

    } else if (shouldQueuePending) {
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
        newsKeywords: surgeNewsKeywords,
        newsScore: surgeNews.bonus,
        learningRiskEnabled: ctx.config.learningRiskAdjustmentsEnabled !== false,
      });

      actions.push({
        type: "surge_pending", code, name: surgeName,
        detail: `급등주 약한 ${surgeAdjustedScore}점${surgeInvestorTag}${surgeTrigger.reasons.length > 0 ? ` [${surgeTrigger.reasons.join(" · ")}]` : ""} → DB 저장, 승인 대기. ${surgeLearnedSignal.comment}`,
      });
      await markStep3Stage("candidate_pending_queued", { code });
      await sleepRateLimit();
    } else {
      actions.push({
        type: "surge_signal_skip",
        code, name: code,
        detail: `${surgeAdjustedScore}점 방향:${surgeLearnedSignal.side}(${surgeAdjustedStrength}) [${surgeLearnedSignal.raw.regime}] RSI:${surgeLearnedSignal.raw.rsi.toFixed(0)} MACD:${surgeLearnedSignal.raw.macdCrossover} MA:${surgeLearnedSignal.raw.ma5 > surgeLearnedSignal.raw.ma20 ? "↑" : "↓"}${surgeInvestorTag ? " " + surgeInvestorTag : ""}`,
      });
    }
  }

  await markStep3Stage("completed", { scanned_count: scannedCount, trade_count: tradeCount });

  actions.push({
    type: "surge_scan_funnel",
    code: "",
    detail: `보유유지 ${blockedHoldingCount} · 재진입쿨다운 ${reentryCooldownCount} · 진입한도 ${entryLimitCount} · 26봉미만 ${shortCandleCount} · 수량0 ${qtyZeroCount}`,
  });

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
  const strategyBudget = Math.min(getStrategyBudget(ctx.totalCapital, allocationPct), ctx.availableCash || Number.MAX_SAFE_INTEGER);

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
  const filtered = candidates.filter((c) => !watchlistSet.has(c.code));
  scannedCount += filtered.length;

  const sectorCounts = await getSectorCounts();

  for (const { code, name: candidateName, orgn, frgn } of filtered) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;

    const existingPos = await getOpenPosition(code);
    if (holdingCodes.has(code) && !canReenterPosition(existingPos?.phase as string | null)) continue;
    const todayEntryCount = await getTodayEntryCount(code);
    if (todayEntryCount >= MAX_DAILY_ENTRIES_PER_STOCK) {
      actions.push({ type: "skip", code, name: candidateName, detail: `당일 재진입 한도 도달 (${todayEntryCount}/${MAX_DAILY_ENTRIES_PER_STOCK})` });
      continue;
    }

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
    if (price <= 0) {
      const detail = priceData?.__error_message ? `현재가 조회 실패: ${priceData.__error_message}` : "현재가 조회 실패";
      actions.push({ type: "price_lookup_failed", code, name, detail });
      continue;
    }
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
    const latestStopLoss = !existingPos ? await getLatestStopLossReference(code) : null;
    const stopLossRecoveryReentry = !existingPos && latestStopLoss
      ? shouldAllowStopLossReentry({
          currentPrice: price,
          stopPrice: latestStopLoss.stopPrice,
          raw: signal.raw,
        })
      : false;

    // 기관 추종 매수: 반액 고정 (분산 리스크 관리)
    const qty = Math.floor((strategyBudget * (stopLossRecoveryReentry ? 0.25 : 0.5)) / price);
    if (qty <= 0) continue;

    const result = await limitBuyOrder(ctx.config, code, qty, price);
    const orgnLabel = `기관 ${orgn.toFixed(0)}억${frgn > 0 ? `+외국인 ${frgn.toFixed(0)}억` : ""}`;

    if (result.success) {
      actions.push({
        type: "orgn_follow_buy",
        code,
        name,
        detail: `기관추종 (${orgnLabel}) RSI:${signal.raw.rsi.toFixed(0)} MA:↑ → ${stopLossRecoveryReentry && latestStopLoss ? `${formatStopLossReentryLabel(latestStopLoss.stopPrice)} ` : ""}지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주`,
      });
    } else {
      await recordOrderFailureEvent({
        stockCode: code,
        stockName: name,
        side: "buy",
        message: result.msg,
        strategyKey: INSTITUTIONAL_STRATEGY,
        orderQty: qty,
        limitPrice: result.limitPrice,
        context: stopLossRecoveryReentry && latestStopLoss ? formatStopLossReentryLabel(latestStopLoss.stopPrice) : "기관추종 매수",
      });
      actions.push(buildOrderFailureAction({
        defaultType: "buy_failed",
        code,
        name,
        message: result.msg,
        prefix: `기관추종 매수 실패 (${orgnLabel})`,
      }));
    }

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
      });
        tradeCount++;
        if (!existingPos) openPositionCount++;
      }
    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount, scannedCount };
}
