import { supabase } from "@/lib/supabase/api-client";
import {
  analyzeSignal, analyzeSignalWithWeights, calcATR, calcDynamicRisk,
  calcPositionSize, checkRisk, type AtrMultipliers, type SignalResult,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, getBalance, sellOrder, limitBuyOrder, cancelOpenBuyOrders } from "@/lib/engine/kis";
import { hasDangerousDisclosure, getListingDate, applyStockFilter, applySectorFilter } from "@/lib/engine/filters";
import { getMarketTrend, getInvestorTrend, scanSurgeStocks } from "@/lib/engine/market";
import { openPosition, closePosition, recordTradeMemory, closeTradeMemory, getOpenPosition, getTodayRealizedLoss, getSectorCounts } from "@/lib/engine/db";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";

// ─── 배치 병렬 패치 ─────────────────────────────────
export async function batchFetch<T>(
  codes: string[],
  fetcher: (code: string) => Promise<T>,
  batchSize = 3
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  for (let i = 0; i < codes.length; i += batchSize) {
    const chunk = codes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      chunk.map(async (code) => ({ code, data: await fetcher(code) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.code, r.value.data);
    }
    if (i + batchSize < codes.length) await new Promise((r) => setTimeout(r, 200));
  }
  return map;
}

// ─── 장 초반 스냅샷 보너스 ───────────────────────────
export function getOpeningBonus(
  code: string,
  snapshotMap: Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>
): number {
  const snap = snapshotMap.get(code);
  if (!snap || snap.open_price <= 0) return 0;
  const gap = (snap.snapshot_price - snap.open_price) / snap.open_price;
  if (gap > 0.01 && snap.snapshot_volume > 50000) return 15;
  if (gap > 0.005) return 8;
  if (gap < -0.02) return -20;
  if (gap < -0.01) return -10;
  return 0;
}

// ═══ STEP 0: 미체결 취소 + 시장 모멘텀 + 일일 손실 체크 ═══
export async function runStep0(ctx: StepContext): Promise<{
  actions: EngineAction[];
  marketTrend: MarketTrend;
  halted: boolean;
  haltReason?: string;
}> {
  const actions: EngineAction[] = [];

  const [cancelResult, marketTrend] = await Promise.all([
    cancelOpenBuyOrders(ctx.config),
    getMarketTrend(ctx.config),
  ]);

  if (cancelResult.cancelled > 0 || cancelResult.failed > 0) {
    actions.push({
      type: "cancel_open_orders", code: "",
      detail: `미체결 취소: 성공 ${cancelResult.cancelled}건, 실패 ${cancelResult.failed}건`,
    });
  }
  if (marketTrend.label) {
    actions.push({ type: "market_context", code: "", detail: `시장: ${marketTrend.label} (보정 ${marketTrend.bonus > 0 ? "+" : ""}${marketTrend.bonus}점)` });
  }

  const todayLoss = await getTodayRealizedLoss();
  if (todayLoss <= ctx.dailyLossLimit) {
    return {
      actions: [{ type: "daily_loss_halt", code: "", detail: `일일 손실 한도 도달 (${todayLoss.toFixed(1)}% ≤ ${ctx.dailyLossLimit}%)` }],
      marketTrend,
      halted: true,
      haltReason: `일일 손실 한도 ${todayLoss.toFixed(1)}%`,
    };
  }

  return { actions, marketTrend, halted: false };
}

// ═══ STEP 1: 보유종목 손절/익절/기간초과 감시 ═══
export async function runStep1(ctx: StepContext, marketTrend: MarketTrend): Promise<{
  actions: EngineAction[];
  tradeCount: number;
  holdings: Record<string, string>[];
}> {
  const actions: EngineAction[] = [];
  let tradeCount = 0;

  const balanceData = await getBalance(ctx.config);
  const holdings: Record<string, string>[] = balanceData?.output1 || [];

  for (const h of holdings) {
    const code = h.pdno;
    const qty = Number(h.hldg_qty) || 0;
    if (qty <= 0) continue;

    const avgPrice = Number(h.pchs_avg_pric) || 0;
    const currentPrice = Number(h.prpr) || 0;
    const highPrice = Number(h.stck_hgpr) || currentPrice;
    const name = h.prdt_name || code;

    const holdAtrMultipliers: AtrMultipliers = ctx.applied.atrMultipliers;
    let holdStopLoss = ctx.config.stopLoss ?? -5;
    let holdTakeProfit = ctx.config.takeProfit ?? 5;
    let holdTrailingStop = ctx.config.trailingStop ?? -3;

    if (ctx.config.dynamicRisk) {
      const holdCandles = await getDailyCandles(ctx.config, code);
      if (holdCandles.length >= 15) {
        const holdAtr = calcATR(holdCandles);
        const dynamic = calcDynamicRisk(holdAtr, currentPrice, holdAtrMultipliers);
        holdStopLoss = dynamic.stopLoss;
        holdTakeProfit = dynamic.takeProfit;
        holdTrailingStop = dynamic.trailingStop;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const risk = checkRisk(avgPrice, currentPrice, highPrice, holdStopLoss, holdTakeProfit, holdTrailingStop);

    const pos = await getOpenPosition(code);
    const maxHoldDays = ctx.config.maxHoldDays ?? 5;
    if (pos && risk.action === "hold") {
      const holdDays = Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
      if (holdDays >= maxHoldDays) {
        const result = await sellOrder(ctx.config, code, qty);
        actions.push({
          type: result.success ? "max_hold_sell" : "sell_failed", code, name,
          detail: result.success
            ? `보유 ${holdDays}일 초과 (최대 ${maxHoldDays}일) → 전량 청산 ${qty}주 (${result.msg})`
            : `보유기간 초과 청산 실패: ${result.msg}`,
        });
        if (result.success) {
          const holdDaysVal = Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000));
          const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
          const pnlAmt = (currentPrice - avgPrice) * qty;
          await closePosition(code, currentPrice, qty, "max_hold");
          await closeTradeMemory(code, pnlPct, pnlAmt, holdDaysVal, "max_hold");
          await sendTradeAlert({ type: "max_hold_sell", code, name, qty, price: currentPrice, pnlPct });
          tradeCount++;
        }
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
    }

    if (risk.action !== "hold") {
      let sellQty = qty;
      if (risk.action === "take_profit" && ctx.takeProfitRatio < 100) {
        sellQty = Math.max(1, Math.floor(qty * ctx.takeProfitRatio / 100));
      }

      const result = await sellOrder(ctx.config, code, sellQty);
      actions.push({
        type: result.success ? risk.action : "sell_failed", code, name,
        detail: result.success
          ? `${risk.reason} → 매도 ${sellQty}/${qty}주 (${result.msg})`
          : `${risk.reason} → 매도 실패: ${result.msg}`,
      });

      if (result.success) {
        const sellPnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
        const sellPnlAmt = (currentPrice - avgPrice) * sellQty;
        const holdDaysVal = pos ? Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)) : 1;
        if (sellQty >= qty) {
          await closePosition(code, currentPrice, sellQty, risk.action);
          await closeTradeMemory(code, sellPnlPct, sellPnlAmt, holdDaysVal, risk.action);
        }
        await sendTradeAlert({ type: risk.action as "sell" | "stop_loss" | "take_profit", code, name, qty: sellQty, price: currentPrice, pnlPct: sellPnlPct });
        tradeCount++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return { actions, tradeCount, holdings };
}

// ═══ STEP 1.5: 승인된 신호 매수 실행 ═══
export async function runStep15(
  ctx: StepContext,
  holdings: Record<string, string>[],
  tradeCount: number
): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const actions: EngineAction[] = [];

  const { data: approvedSignals } = await supabase.from("pending_signals")
    .select("*").eq("status", "approved");

  const openCount = () => holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  const sectorCounts15 = await getSectorCounts();

  for (const sig of approvedSignals || []) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openCount() >= ctx.maxPositions) break;
    if (holdings.some((h) => h.pdno === sig.stock_code && Number(h.hldg_qty) > 0)) {
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      continue;
    }

    const priceData = await getPrice(ctx.config, sig.stock_code);
    const price = Number(priceData?.stck_prpr) || 0;
    const name = priceData?.hts_kor_isnm || sig.stock_name || sig.stock_code;
    if (price <= 0) continue;

    const sector15 = (priceData as Record<string, string>).bstp_kor_isnm || null;
    const sectorFilter15 = applySectorFilter(sector15, sectorCounts15, ctx.maxPerSector);
    if (!sectorFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: sectorFilter15.reason });
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      continue;
    }

    const qtyOverride = sig.signal_data?.qty_override ? Number(sig.signal_data.qty_override) : 0;
    const qty = qtyOverride > 0 ? qtyOverride : Math.floor((ctx.maxPerTrade * 0.5) / price);
    if (qty <= 0) continue;

    const result = await limitBuyOrder(ctx.config, sig.stock_code, qty, price);
    actions.push({
      type: result.success ? "approved_buy" : "approved_buy_failed",
      code: sig.stock_code, name,
      detail: result.success
        ? `승인 지정가 매수 ${qty}주 @ ${result.limitPrice.toLocaleString()}원 (점수: ${sig.signal_score}) (${result.msg})`
        : `승인 매수 실패: ${result.msg}`,
    });

    if (result.success) {
      await openPosition(sig.stock_code, name, result.limitPrice, qty, { strength: "weak", side: "buy", totalScore: sig.signal_score, comment: sig.signal_comment, indicators: [], raw: sig.signal_data || {}, matchCount: 0 } as SignalResult, "initial", sector15 ?? undefined);
      await sendTradeAlert({ type: "buy", code: sig.stock_code, name, qty, price: result.limitPrice, score: sig.signal_score });
      tradeCount++;
    }

    await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount };
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

  const wCandleMap = await batchFetch(availableWatchlist, (code) => getDailyCandles(ctx.config, code));
  const wInvestorMap = await batchFetch(availableWatchlist, (code) => getInvestorTrend(ctx.config, code));
  scannedCount += availableWatchlist.length;

  const openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;

  for (const code of watchlist) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;
    if (!wCandleMap.has(code)) continue;

    const candles = wCandleMap.get(code)!;
    if (candles.length < 26) continue;

    const baseSignal = analyzeSignal(candles);
    const learnedSignal = ctx.customWeights ? analyzeSignalWithWeights(candles, ctx.customWeights) : baseSignal;

    const openingBonus = getOpeningBonus(code, snapshotMap);
    const investor = wInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
    const totalBonus = openingBonus + investor.bonus + marketTrend.bonus;
    const adjustedScore = learnedSignal.totalScore + totalBonus;
    const adjustedStrength = adjustedScore >= 70 ? "strong" : adjustedScore >= 40 ? "weak" : "none";
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

  const openPositionCount = holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  if (tradeCount >= ctx.maxDailyTrades || openPositionCount >= ctx.maxPositions) return { actions, tradeCount, scannedCount };

  const sectorCounts3 = await getSectorCounts();

  const surgeStocks = await scanSurgeStocks(ctx.config);
  const holdingCodes = new Set(holdings.map((h) => h.pdno));
  const watchlistSet = new Set(ctx.config.watchlist ?? []);
  const candidates = surgeStocks.filter((c) => !holdingCodes.has(c) && !watchlistSet.has(c));

  const sCandleMap = await batchFetch(candidates, (code) => getDailyCandles(ctx.config, code));
  const sInvestorMap = await batchFetch(candidates, (code) => getInvestorTrend(ctx.config, code));
  scannedCount += candidates.length;

  for (const code of candidates) {
    if (tradeCount >= ctx.maxDailyTrades) break;

    const candles = sCandleMap.get(code) ?? [];
    if (candles.length < 26) continue;

    const surgeBaseSignal = analyzeSignal(candles);
    const surgeLearnedSignal = ctx.customWeights ? analyzeSignalWithWeights(candles, ctx.customWeights) : surgeBaseSignal;
    const surgeInvestor = sInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
    const surgeAdjustedScore = surgeLearnedSignal.totalScore + surgeInvestor.bonus + marketTrend.bonus;
    const surgeAdjustedStrength = surgeAdjustedScore >= 70 ? "strong" : surgeAdjustedScore >= 40 ? "weak" : "none";
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
    }
  }

  return { actions, tradeCount, scannedCount };
}
