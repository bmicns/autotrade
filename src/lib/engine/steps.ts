import { supabase } from "@/lib/supabase/api-client";
import {
  analyzeSignal,
  analyzeSignalWithWeights,
  calcATR, calcDynamicRisk,
  checkRisk, type AtrMultipliers, type SignalRaw,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, getBalance, getMinuteCandles, limitBuyOrder, cancelOpenBuyOrders } from "@/lib/engine/kis";
import { applySectorFilter, applyStockFilter, getListingDate } from "@/lib/engine/filters";
import { getMarketTrend, getInvestorTrend } from "@/lib/engine/market";
import { getOpenPosition, getTodayEntryCount, getTodayRealizedLoss, getSectorCounts, getPendingOrders, reconcileBrokerPositionDrift, resolvePendingSignal, savePendingOrder, recordTradeMemory, syncBrokerHoldingsToPositions } from "@/lib/engine/db";
import { getStrategyBudget, type StrategyKey } from "@/lib/engine/strategies";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendHoldingNewsRiskAlert, sendTradeAlert } from "@/lib/engine/notify";
import { APPROVED_BUY_RATIO, DEFAULT_MARKET_CRASH_THRESHOLD } from "@/lib/engine/constants";
import { batchFetch, getOpeningBonus } from "@/lib/engine/utils";
import { executePartialExit, executeRiskSell, reconcilePendingOrderFill } from "@/lib/engine/position-flow";
import { canReenterPosition, type PendingSignalStatus } from "@/lib/engine/lifecycle";
import { resolveConfiguredPerStockEntryLimit, resolveSurgeRiskConfig } from "@/lib/engine/surge-strategy";
import { buildHoldingNewsAlert, fetchNewsSnapshot } from "@/lib/news";
import { buildOrderFailureAction, recordOrderFailureEvent } from "@/lib/engine/order-failure";
export { batchFetch, getOpeningBonus };

function resolveSellFirstThresholds(params: {
  rsiBuy: number;
  rsiSell: number;
  strongScore: number;
  weakScore: number;
  sensitivity?: number | null;
}) {
  const sensitivity = Math.max(1, Math.min(10, Math.round(Number(params.sensitivity) || 5)));
  return {
    rsiBuy: params.rsiBuy,
    rsiSell: Math.max(45, Math.min(params.rsiSell, 70) - sensitivity * 2),
    strongScore: Math.max(18, Math.min(params.strongScore, 70) - sensitivity * 4),
    weakScore: Math.max(10, Math.min(params.weakScore, 40) - sensitivity * 2),
  };
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

  // ─── 승인 대기 신호 자동 만료 (2시간 초과) ──────────
  try {
    const { data: expiredSignals } = await supabase
      .from("pending_signals")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 2 * 3600 * 1000).toISOString())
      .select("id");
    const expiredCount = expiredSignals?.length ?? 0;
    if (expiredCount > 0) {
      actions.push({ type: "signals_expired", code: "", detail: `승인 대기 만료: ${expiredCount}건` });
    }
  } catch { /* 만료 처리 실패가 엔진 실행에 영향 주지 않음 */ }

  // ─── 미체결 주문 체결 확인 ────────────────────────
  // Vercel 10s timeout 보호: 최대 5건만 처리 (나머지는 다음 크론에서 처리)
  const pendingOrders = (await getPendingOrders()).slice(0, 5);
  for (const order of pendingOrders) {
    const action = await reconcilePendingOrderFill({ config: ctx.config, order });
    if (action) actions.push(action);
    await new Promise((r) => setTimeout(r, 200));
  }

  // ─── 시장 급락 감지 ──────────────────────────────
  const crashThreshold = ctx.config.marketCrashThreshold ?? DEFAULT_MARKET_CRASH_THRESHOLD;
  const kospiRate = marketTrend.kospiRate;
  if (kospiRate <= crashThreshold) {
    return {
      actions: [
        ...actions,
        {
          type: "market_crash_halt", code: "",
          detail: `시장 급락 감지 (KOSPI ${kospiRate.toFixed(2)}% ≤ ${crashThreshold}%)`,
        },
      ],
      marketTrend,
      halted: true,
      haltReason: `시장 급락 감지 (KOSPI ${kospiRate.toFixed(2)}%)`,
    };
  }

  const todayLoss = await getTodayRealizedLoss();
  if (todayLoss <= ctx.dailyLossLimit) {
    return {
      actions: [...actions, { type: "daily_loss_halt", code: "", detail: `일일 손실 한도 도달 (${todayLoss.toFixed(1)}% ≤ ${ctx.dailyLossLimit}%)` }],
      marketTrend,
      halted: true,
      haltReason: `일일 손실 한도 ${todayLoss.toFixed(1)}%`,
    };
  }

  return { actions, marketTrend, halted: false };
}

// ─── STEP 1 내부 헬퍼: 보유기간 초과 청산 ───────────
async function executeMaxHoldSell(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pos: { entry_date: string } | null;
  maxHoldDays: number;
}): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const holdDays = Math.ceil((Date.now() - new Date(params.pos!.entry_date).getTime()) / 86400000);
  const { action, tradeCount } = await executeRiskSell({
    ctx: params.ctx,
    code: params.code,
    name: params.name,
    qty: params.qty,
    avgPrice: params.avgPrice,
    currentPrice: params.currentPrice,
    entryDate: params.pos?.entry_date,
    actionType: "max_hold_sell",
    detail: `비수익 보유 ${holdDays}일 초과 (최대 ${params.maxHoldDays}일) → 전량 청산 ${params.qty}주`,
    alertType: "trailing_stop",
  });
  await new Promise((r) => setTimeout(r, 200));
  return { actions: [action], tradeCount };
}

// ─── STEP 1 내부 헬퍼: 2단계 익절 실행 ──────────────
// ═══ STEP 1: 보유종목 손절/익절/기간초과 감시 ═══
export async function runStep1(ctx: StepContext): Promise<{
  actions: EngineAction[];
  tradeCount: number;
  holdings: Record<string, string>[];
}> {
  const actions: EngineAction[] = [];
  let tradeCount = 0;

  const balanceData = await getBalance(ctx.config);
  const holdings: Record<string, string>[] = balanceData?.output1 || [];
  const restoredPositions = await syncBrokerHoldingsToPositions(holdings);
  for (const restored of restoredPositions) {
    actions.push({
      type: "position_reconciled",
      code: restored.code,
      name: restored.name,
      detail: `실잔고 동기화로 포지션 복구: ${restored.qty}주`,
    });
  }
  const driftResolution = await reconcileBrokerPositionDrift(holdings);
  for (const adjusted of driftResolution.qtyAdjusted) {
    actions.push({
      type: "position_reconciled",
      code: adjusted.code,
      name: adjusted.name,
      detail: `실잔고 기준 수량 보정: ${adjusted.fromQty}주 -> ${adjusted.toQty}주`,
    });
  }
  for (const orphaned of driftResolution.orphanedClosed) {
    actions.push({
      type: "position_reconciled",
      code: orphaned.code,
      name: orphaned.name,
      detail: `브로커 미보유 포지션 정리: ${orphaned.qty}주 orphan 종료`,
    });
  }

  const activeCodes = holdings.filter((h) => Number(h.hldg_qty) > 0).map((h) => h.pdno);
  const candleMap = await batchFetch(activeCodes, (code) => getDailyCandles(ctx.config, code));
  const minuteMap = await batchFetch(activeCodes, (code) => getMinuteCandles(ctx.config, code));
  const newsSnapshot = await fetchNewsSnapshot();
  const holdingNewsAlerts: Array<{ code: string; name: string; headlines: string[] }> = [];

  for (const h of holdings) {
    const code = h.pdno;
    const qty = Number(h.hldg_qty) || 0;
    if (qty <= 0) continue;

    const avgPrice = Number(h.pchs_avg_pric) || 0;
    const currentPrice = Number(h.prpr) || 0;
    const highPrice = Number(h.stck_hgpr) || currentPrice;
    const name = h.prdt_name || code;
    const holdingNewsAlert = buildHoldingNewsAlert(name, newsSnapshot.latestNews);
    if (holdingNewsAlert?.riskItems.length) {
      holdingNewsAlerts.push({
        code,
        name,
        headlines: holdingNewsAlert.riskItems.map((item) => item.title),
      });
      actions.push({
        type: "holding_news_risk",
        code,
        name,
        detail: holdingNewsAlert.riskItems.slice(0, 2).map((item) => item.title).join(" | "),
      });
    }

    const holdAtrMultipliers: AtrMultipliers = ctx.applied.atrMultipliers;
    let holdStopLoss = ctx.config.stopLoss ?? -5;
    let holdTrailingStop = ctx.config.trailingStop ?? -3;

    if (ctx.config.dynamicRisk) {
      const holdCandles = candleMap.get(code) ?? [];
      if (holdCandles.length >= 15) {
        const holdAtr = calcATR(holdCandles);
        const dynamic = calcDynamicRisk(holdAtr, currentPrice, holdAtrMultipliers);
        holdStopLoss = dynamic.stopLoss;
        holdTrailingStop = dynamic.trailingStop;
      } else {
        actions.push({ type: "dynamic_risk_skipped", code, name, detail: `캔들 부족 (${holdCandles.length}개) — 기본값 적용` });
      }
    }

    const pos = await getOpenPosition(code);
    const strategyKey = ((pos?.entry_signal as { strategyKey?: StrategyKey } | null)?.strategyKey) ?? null;
    const isSurgePosition = strategyKey === "surge_momentum";
    let partialExitRatio = ctx.partialExitRatio;
    if (isSurgePosition) {
      const configuredSurgeRisk = resolveSurgeRiskConfig(holdStopLoss, holdTrailingStop, {
        partialExitRatio: ctx.config.surgeTrailingPartialExitRatio,
        stopLoss: ctx.config.surgeTightStopLoss ? Math.abs(ctx.config.surgeTightStopLoss) : null,
        trailingStop: ctx.config.surgeTightTrailingStop ? Math.abs(ctx.config.surgeTightTrailingStop) : null,
      });
      holdStopLoss = configuredSurgeRisk.stopLoss;
      holdTrailingStop = configuredSurgeRisk.trailingStop;
      partialExitRatio = configuredSurgeRisk.partialExitRatio;
    }

    const holdCandles = candleMap.get(code) ?? [];
    if (holdCandles.length >= 26) {
      const holdMinuteCandles = minuteMap.get(code) ?? [];
      const sellFirstThresholds = resolveSellFirstThresholds({
        rsiBuy: ctx.rsiBuy,
        rsiSell: ctx.rsiSell,
        strongScore: ctx.strongScore,
        weakScore: ctx.weakScore,
        sensitivity: ctx.config.sellRuleSensitivity,
      });
      const baseSignal = analyzeSignal(holdCandles, sellFirstThresholds, holdMinuteCandles);
      const evaluatedSignal = ctx.customWeights
        ? analyzeSignalWithWeights(holdCandles, ctx.customWeights, sellFirstThresholds, holdMinuteCandles)
        : baseSignal;

      if (evaluatedSignal.side === "sell" && evaluatedSignal.strength !== "none") {
        const minuteSignalDetail = evaluatedSignal.raw.vwap || evaluatedSignal.raw.poc
          ? ` · VWAP ${evaluatedSignal.raw.vwap ? Math.round(evaluatedSignal.raw.vwap).toLocaleString() : "N/A"} / POC ${evaluatedSignal.raw.poc ? Math.round(evaluatedSignal.raw.poc).toLocaleString() : "N/A"}`
          : "";
        const { action, tradeCount: sold } = await executeRiskSell({
          ctx,
          code,
          name,
          qty,
          avgPrice,
          currentPrice,
          entryDate: pos?.entry_date,
          actionType: "signal_rule_sell",
          detail: `매도 규칙 최우선 이탈 ${evaluatedSignal.totalScore}점 (${evaluatedSignal.strength}) · ${evaluatedSignal.comment}${minuteSignalDetail} → 전량 매도 ${qty}주`,
          alertType: "sell",
        });
        actions.push(action);
        tradeCount += sold;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
    }

    const effectiveRisk = checkRisk(avgPrice, currentPrice, highPrice, holdStopLoss, holdTrailingStop);

    const maxHoldDays = ctx.config.maxHoldDays ?? 5;
    if (pos && effectiveRisk.action === "hold") {
      const holdDays = Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
      const pnlRate = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
      if (holdDays >= maxHoldDays && pnlRate <= 0) {
        const r = await executeMaxHoldSell({ ctx, code, name, qty, avgPrice, currentPrice, pos, maxHoldDays });
        actions.push(...r.actions);
        tradeCount += r.tradeCount;
        continue;
      }
    }

    // 기관 순매도 전환 청산 (ATR 청산 조건이 없을 때만 체크)
    if (effectiveRisk.action === "hold") {
      try {
        const investor = await getInvestorTrend(ctx.config, code);
        const orgnFlipThreshold = -100; // 기관 3일 합산 -100억 이하 시 청산
        if (investor.orgn < orgnFlipThreshold) {
          const { action, tradeCount: sold } = await executeRiskSell({
            ctx,
            code,
            name,
            qty,
            avgPrice,
            currentPrice,
            entryDate: pos?.entry_date,
            actionType: "orgn_flip_sell",
            detail: `기관 순매도 전환 청산 (${investor.orgn.toFixed(0)}억) → 매도 ${qty}주`,
            alertType: "stop_loss",
          });
          actions.push(action);
          tradeCount += sold;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      } catch { /* 기관 데이터 조회 실패 시 ATR 로직으로 폴백 */ }
    }

    if (effectiveRisk.action !== "hold") {
      if (effectiveRisk.action === "trailing_stop") {
        const r = await executePartialExit({
          ctx,
          code,
          name,
          qty,
          avgPrice,
          currentPrice,
          entryDate: pos?.entry_date,
          currentPhase: pos?.phase,
          riskAction: isSurgePosition ? "surge_trailing_stop" : effectiveRisk.action,
          riskReason: effectiveRisk.reason,
          partialExitRatio,
        });
        actions.push(...r.actions);
        tradeCount += r.tradeCount;
      } else {
        const { action, tradeCount: sold } = await executeRiskSell({
          ctx,
          code,
          name,
          qty,
          avgPrice,
          currentPrice,
          entryDate: pos?.entry_date,
          actionType: effectiveRisk.action,
          detail: `${effectiveRisk.reason} → 매도 ${qty}주`,
          alertType: "stop_loss",
        });
        actions.push(action);
        tradeCount += sold;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  if (holdingNewsAlerts.length > 0) {
    await sendHoldingNewsRiskAlert({ items: holdingNewsAlerts });
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

  async function resolveSignal(id: string, status: PendingSignalStatus, detail?: string) {
    await resolvePendingSignal(id, status, detail);
  }

  type PendingSignalRow = {
    id: string;
    stock_code: string;
    stock_name?: string | null;
    signal_score: number;
    signal_comment?: string | null;
    signal_data?: {
      qty_override?: number | string;
      strategyKey?: StrategyKey;
      allocationPct?: number | string;
      raw?: SignalRaw;
      indicators?: unknown[];
      matchCount?: number;
      openingBonus?: number;
      institutionalBonus?: number;
      newsKeywords?: string[];
      newsScore?: number;
      learningRiskEnabled?: boolean;
    } | null;
    source?: string | null;
  };

  // 조회와 동시에 status → "processing" 으로 전환 (중복 실행 방지)
  // resolved_at은 실제 처리 종료 시점에만 기록한다.
  const { data: claimedSignals } = await supabase.from("pending_signals")
    .update({ status: "processing" })
    .eq("status", "approved")
    .is("resolved_at", null)
    .select("*");
  const approvedSignals = claimedSignals;

  const holdingCodes = new Set(holdings.filter((h) => Number(h.hldg_qty) > 0).map((h) => h.pdno));
  let openPositionCount = holdingCodes.size;
  const sectorCounts15 = await getSectorCounts();

  for (const sig of (approvedSignals ?? []) as PendingSignalRow[]) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openPositionCount >= ctx.maxPositions) break;

    const existingPos = await getOpenPosition(sig.stock_code);
    const existingPhase = existingPos?.phase as string | null | undefined;
    const hasHolding = holdingCodes.has(sig.stock_code);
    const strategyKey = sig.signal_data?.strategyKey;
    if ((sig.signal_data?.newsScore ?? 0) < 0) {
      const detail = `악재 뉴스 보수화 (${(sig.signal_data?.newsKeywords ?? []).join(", ") || "newsScore<0"})`;
      await resolveSignal(sig.id, "rejected", detail);
      actions.push({
        type: "approved_news_risk_skip",
        code: sig.stock_code,
        name: sig.stock_name ?? sig.stock_code,
        detail,
      });
      continue;
    }
    if ((hasHolding && (!existingPos || !canReenterPosition(existingPhase))) || (existingPos && !canReenterPosition(existingPhase))) {
      await resolveSignal(sig.id, "expired", "이미 보유 중이라 자동 만료");
      continue;
    }
    const perStockEntryLimit = resolveConfiguredPerStockEntryLimit(strategyKey ?? null, ctx.config.surgeMaxDailyEntriesPerStock);
    const todayEntryCount = await getTodayEntryCount(sig.stock_code);
    if (todayEntryCount >= perStockEntryLimit) {
      await resolveSignal(sig.id, "rejected", `당일 진입 한도 도달 (${todayEntryCount}/${perStockEntryLimit})`);
      actions.push({
        type: "skip",
        code: sig.stock_code,
        name: sig.stock_name ?? sig.stock_code,
        detail: `당일 재진입 한도 도달 (${todayEntryCount}/${perStockEntryLimit})`,
      });
      continue;
    }

    const priceData = await getPrice(ctx.config, sig.stock_code);
    const price = Number(priceData?.stck_prpr) || 0;
    const name = priceData?.hts_kor_isnm || sig.stock_name || sig.stock_code;
    if (price <= 0) {
      const detail = priceData?.__error_message ? `현재가 조회 실패: ${priceData.__error_message}` : "현재가 조회 실패";
      await resolveSignal(sig.id, "failed", detail);
      actions.push({ type: "price_lookup_failed", code: sig.stock_code, name, detail });
      continue;
    }

    const sector15 = (priceData as Record<string, string>).bstp_kor_isnm || null;
    const sectorFilter15 = applySectorFilter(sector15, sectorCounts15, ctx.maxPerSector);
    if (!sectorFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: sectorFilter15.reason });
      await resolveSignal(sig.id, "rejected", sectorFilter15.reason);
      continue;
    }

    // 수동매수 포함 모든 경로: 관리종목/정리매매 필터 적용
    const listingDate15 = await getListingDate(ctx.config, sig.stock_code);
    const stockFilter15 = applyStockFilter(priceData as Record<string, string>, listingDate15);
    if (!stockFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: `종목 필터: ${stockFilter15.reason}` });
      await resolveSignal(sig.id, "rejected", `종목 필터: ${stockFilter15.reason}`);
      continue;
    }

    const qtyOverride = sig.signal_data?.qty_override ? Math.min(Number(sig.signal_data.qty_override), 10_000) : 0;
    const allocationPct = Number(sig.signal_data?.allocationPct);
    const allocatedBudget = strategyKey
      ? getStrategyBudget(
          ctx.totalCapital,
          Number.isFinite(allocationPct) ? allocationPct : ctx.strategyAllocations[strategyKey]
        )
      : ctx.totalCapital;
    const affordableBudget = Math.min(allocatedBudget, ctx.availableCash || Number.MAX_SAFE_INTEGER);
    const qty = qtyOverride > 0 ? qtyOverride : Math.floor((affordableBudget * APPROVED_BUY_RATIO) / price);
    if (qty <= 0) {
      await resolveSignal(sig.id, "failed", "주문 수량이 0주로 계산됨");
      actions.push({ type: "approved_buy_failed", code: sig.stock_code, name, detail: "주문 수량이 0주로 계산됨" });
      continue;
    }

    const result = await limitBuyOrder(ctx.config, sig.stock_code, qty, price);
    if (result.success) {
      actions.push({
        type: "approved_buy",
        code: sig.stock_code,
        name,
        detail: `승인 지정가 매수 ${qty}주 @ ${result.limitPrice.toLocaleString()}원 (점수: ${sig.signal_score}) (${result.msg})`,
      });
    } else {
      await recordOrderFailureEvent({
        stockCode: sig.stock_code,
        stockName: name,
        side: "buy",
        message: result.msg,
        strategyKey: strategyKey ?? null,
        orderQty: qty,
        limitPrice: result.limitPrice,
        context: "승인 매수",
      });
      actions.push(buildOrderFailureAction({
        defaultType: "approved_buy_failed",
        code: sig.stock_code,
        name,
        message: result.msg,
        prefix: "승인 매수 실패",
      }));
    }

    if (result.success) {
      await savePendingOrder({
        stock_code: sig.stock_code,
        stock_name: name,
        order_no: result.ordNo ?? "",
        order_qty: qty,
        limit_price: result.limitPrice,
        signal_score: sig.signal_score ?? null,
        pending_signal_id: sig.id,
        signal_source: sig.source ?? null,
        signal_context: {
          newsKeywords: sig.signal_data?.newsKeywords ?? [],
          newsScore: sig.signal_data?.newsScore ?? null,
          learningRiskEnabled: sig.signal_data?.learningRiskEnabled ?? null,
        },
      });
      await sendTradeAlert({ type: "buy", code: sig.stock_code, name, qty, price: result.limitPrice, score: sig.signal_score });
      if (sig.signal_data?.raw) {
        const storedRaw = sig.signal_data.raw;
        const syntheticSignal = {
          indicators: (sig.signal_data.indicators ?? []) as import("@/lib/kis/indicators").IndicatorResult[],
          totalScore: sig.signal_score,
          matchCount: sig.signal_data.matchCount ?? 0,
          strength: "strong" as const,
          side: "buy" as const,
          comment: "",
          raw: storedRaw,
        };
        await recordTradeMemory({
          code: sig.stock_code,
          name,
          baseSignal: syntheticSignal,
          learnedSignal: syntheticSignal,
          bonuses: {
            market: 0,
            investor: sig.signal_data.institutionalBonus ?? 0,
            snapshot: sig.signal_data.openingBonus ?? 0,
          },
          adjustedScore: sig.signal_score,
          weightsSource: "default",
          positionSize: qty * result.limitPrice,
        });
      }
      // 섹터 카운트 즉시 갱신 — 루프 내 중복 매수 방지
      if (sector15) sectorCounts15.set(sector15, (sectorCounts15.get(sector15) ?? 0) + 1);
      tradeCount++;
      if (!hasHolding) {
        holdingCodes.add(sig.stock_code);
        openPositionCount++;
      }
      await resolveSignal(sig.id, "expired", "주문 접수 완료");
    } else {
      await resolveSignal(sig.id, "failed", result.msg);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount };
}
