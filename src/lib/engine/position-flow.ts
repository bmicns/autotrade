import { closePosition, closeTradeMemory, getOpenPosition, openPosition, reconcilePositionEntryFill, recordPartialExit, recordTradeMemory, resolvePendingOrder } from "@/lib/engine/db";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { cancelBuyOrder, checkOrderFill, sellOrder } from "@/lib/engine/kis";
import { sendTradeAlert } from "@/lib/engine/notify";
import { buildOrderFailureAction, recordOrderFailureEvent } from "@/lib/engine/order-failure";
import { resolvePendingOrderLifecycleDecision } from "@/lib/engine/pending-order-policy";
import type { StrategyKey } from "@/lib/engine/strategies";
import type { EngineAction, EngineConfig, StepContext } from "@/lib/engine/types";
import type { SignalRaw, SignalResult } from "@/lib/kis/indicators";
import {
  canReenterPosition,
  resolvePartialExitPhase,
  resolveEntryPhase,
  resolveRecoveredEntryPhase,
  type PositionCloseReason,
} from "@/lib/engine/lifecycle";

const EMPTY_RAW: SignalRaw = {
  rsi: 0,
  macd: 0,
  macdSignal: 0,
  macdCrossover: "none",
  ma5: 0,
  ma20: 0,
  ema5: 0,
  ema20: 0,
  bbPosition: "middle",
  volumeRatio: 100,
  atr: 0,
  adx: 0,
  regime: "ranging",
  stochRsiK: 50,
  stochRsiD: 50,
  obvSlope: 0,
  disparity: 0,
  patternSellHit: false,
};

function calcHoldDays(entryDate?: string | null): number {
  return entryDate ? Math.max(1, Math.ceil((Date.now() - new Date(entryDate).getTime()) / 86400000)) : 1;
}

function calcPnl(avgPrice: number, currentPrice: number, qty: number) {
  return {
    pnlPct: avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0,
    pnlAmt: (currentPrice - avgPrice) * qty,
  };
}

function buildRecoveredFillSignal(order: {
  stock_code: string;
  stock_name?: string | null;
  strategy_key?: string | null;
  entry_tag?: string | null;
  signal_score?: number | null;
  signal_context?: Record<string, unknown> | null;
}): SignalResult {
  return {
    strength: "weak",
    side: "buy",
    totalScore: order.signal_score ?? 0,
    comment: "체결 복구",
    indicators: [],
    raw: EMPTY_RAW,
    matchCount: 0,
    ...(order.strategy_key ? { strategyKey: order.strategy_key as StrategyKey } : {}),
    ...(order.entry_tag ? { entryTag: order.entry_tag } : {}),
    ...(Array.isArray(order.signal_context?.newsKeywords) ? { newsKeywords: order.signal_context?.newsKeywords as string[] } : {}),
    ...(typeof order.signal_context?.newsScore === "number" ? { newsScore: Number(order.signal_context.newsScore) } : {}),
    ...(typeof order.signal_context?.learningRiskEnabled === "boolean" ? { learningRiskEnabled: Boolean(order.signal_context.learningRiskEnabled) } : {}),
    ...(typeof order.signal_context?.directOrderNote === "string" ? { directOrderNote: String(order.signal_context.directOrderNote) } : {}),
    ...(typeof order.signal_context?.directOrderMarket === "string" ? { directOrderMarket: String(order.signal_context.directOrderMarket) } : {}),
    ...(typeof order.signal_context?.directOrderProfileId === "string" ? { directOrderProfileId: String(order.signal_context.directOrderProfileId) } : {}),
  };
}

export async function reconcilePendingOrderFill(params: {
  config: EngineConfig;
  order: {
    id: string;
    stock_code: string;
    stock_name?: string | null;
    order_no: string;
    order_qty?: number | null;
    limit_price?: number | null;
    created_at: string;
    strategy_key?: string | null;
      entry_tag?: string | null;
      signal_score?: number | null;
      signal_context?: Record<string, unknown> | null;
  };
}): Promise<EngineAction | null> {
  const fillResult = await checkOrderFill(params.config, params.order.order_no, params.order.stock_code);
  const ageMin = (Date.now() - new Date(params.order.created_at).getTime()) / 60000;
  const decision = resolvePendingOrderLifecycleDecision(fillResult.status, ageMin);

  if (decision === "filled" && fillResult.filledQty > 0) {
    await resolvePendingOrder({
      orderId: params.order.id,
      stockCode: params.order.stock_code,
      stockName: params.order.stock_name ?? null,
      orderNo: params.order.order_no,
      orderQty: params.order.order_qty ?? null,
      limitPrice: params.order.limit_price ?? null,
      createdAt: params.order.created_at,
      detail: `체결 확인 ${fillResult.filledQty}주 @ ${fillResult.filledPrice.toLocaleString()}원`,
      resolution: "filled",
    });
    const existingPos = await getOpenPosition(params.order.stock_code);
    if (!existingPos) {
      const recoveredSignal = buildRecoveredFillSignal(params.order);
      await openPosition(
        params.order.stock_code,
        params.order.stock_name ?? null,
        fillResult.filledPrice,
        fillResult.filledQty,
        recoveredSignal,
        "initial",
      );
      await recordTradeMemory({
        code: params.order.stock_code,
        name: params.order.stock_name ?? params.order.stock_code,
        baseSignal: recoveredSignal,
        learnedSignal: recoveredSignal,
        bonuses: { market: 0, investor: 0, snapshot: 0 },
        adjustedScore: recoveredSignal.totalScore,
        weightsSource: "default",
        positionSize: fillResult.filledQty,
        entryPrice: fillResult.filledPrice,
      });
    } else {
      await reconcilePositionEntryFill(
        params.order.stock_code,
        fillResult.filledPrice,
        fillResult.filledQty,
        canReenterPosition(existingPos.phase as string | null)
          ? resolveEntryPhase(existingPos.phase as string | null)
          : resolveRecoveredEntryPhase(existingPos.phase as string | null),
      );
    }
    return {
      type: "order_filled",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: `체결 확인: ${fillResult.filledQty}주 @ ${fillResult.filledPrice.toLocaleString()}원`,
    };
  }

  if (decision === "partial_observed" && fillResult.filledQty > 0) {
    await recordEngineEvent({
      eventType: "pending_order_partially_filled",
      stockCode: params.order.stock_code,
      entityTable: "pending_orders",
      entityId: params.order.id,
      payload: {
        order_no: params.order.order_no,
        order_qty: params.order.order_qty ?? null,
        limit_price: params.order.limit_price ?? null,
        pending_signal_id: typeof params.order.signal_context?.pending_signal_id === "string" ? params.order.signal_context.pending_signal_id : null,
        signal_source: typeof params.order.signal_context?.signal_source === "string" ? params.order.signal_context.signal_source : null,
        signal_context: params.order.signal_context ?? null,
        filled_qty: fillResult.filledQty,
        remaining_qty: fillResult.remainingQty,
        filled_price: fillResult.filledPrice,
        detail: fillResult.detail ?? null,
      },
    });
    return {
      type: "order_partially_filled",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: `부분체결 ${fillResult.filledQty}주, 잔여 ${fillResult.remainingQty}주 @ ${fillResult.filledPrice.toLocaleString()}원`,
    };
  }

  if (decision === "timeout") {
    const shouldAttemptCancel = fillResult.status === "partial" || fillResult.status === "open";
    const cancelResult = shouldAttemptCancel
      ? await cancelBuyOrder(params.config, params.order.order_no)
      : null;
    await resolvePendingOrder({
      orderId: params.order.id,
      stockCode: params.order.stock_code,
      stockName: params.order.stock_name ?? null,
      orderNo: params.order.order_no,
      orderQty: params.order.order_qty ?? null,
      limitPrice: params.order.limit_price ?? null,
      signalContext: params.order.signal_context ?? null,
      createdAt: params.order.created_at,
      resolution: "timeout",
      cancelAttempted: shouldAttemptCancel,
      cancelSucceeded: cancelResult?.success ?? false,
      cancelDetail: cancelResult ? `${cancelResult.msg}${cancelResult.remainingQty ? ` (잔여 ${cancelResult.remainingQty}주)` : ""}` : null,
      detail: fillResult.status === "not_found"
        ? `체결 기록 없이 ${Math.round(ageMin)}분 경과`
        : fillResult.status === "partial"
          ? `부분체결 후 잔여 ${fillResult.remainingQty}주 ${Math.round(ageMin)}분 경과`
          : `미체결 ${Math.round(ageMin)}분 경과`,
    });
    return {
      type: "order_cancelled_timeout",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: fillResult.status === "not_found"
        ? `체결 기록 없음 ${Math.round(ageMin)}분 경과 → 자동 삭제`
        : fillResult.status === "partial"
          ? `부분체결 잔여 ${fillResult.remainingQty}주 ${Math.round(ageMin)}분 경과 → ${cancelResult?.success ? "잔량 취소 후" : "잔량 취소 시도 후"} 정리`
          : shouldAttemptCancel
            ? `미체결 ${Math.round(ageMin)}분 경과 → ${cancelResult?.success ? "취소 후" : "취소 시도 후"} 정리`
            : `미체결 ${Math.round(ageMin)}분 경과 → 자동 삭제`,
    };
  }

  if (decision === "error" && fillResult.detail) {
    return {
      type: "order_fill_check_failed",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: `체결 확인 실패: ${fillResult.detail}`,
    };
  }

  return null;
}

export async function executeRiskSell(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  entryDate?: string | null;
  actionType: string;
  detail: string;
  alertType: "sell" | "stop_loss" | "trailing_stop";
}): Promise<{ action: EngineAction; tradeCount: number }> {
  const closeReason = params.actionType as PositionCloseReason;
  const result = await sellOrder(params.ctx.config, params.code, params.qty);
  const action: EngineAction = result.success
    ? {
        type: params.actionType,
        code: params.code,
        name: params.name,
        detail: `${params.detail} (${result.msg})`,
      }
    : buildOrderFailureAction({
        defaultType: "sell_failed",
        code: params.code,
        name: params.name,
        message: result.msg,
        prefix: `${params.detail} → 매도 실패`,
      });

  if (!result.success) {
    await recordOrderFailureEvent({
      stockCode: params.code,
      stockName: params.name,
      side: "sell",
      message: result.msg,
      orderQty: params.qty,
      context: params.detail,
    });
    return { action, tradeCount: 0 };
  }

  const closeSummary = await closePosition(params.code, params.currentPrice, params.qty, closeReason);
  const fallbackPnl = calcPnl(params.avgPrice, params.currentPrice, params.qty);
  const pnlPct = closeSummary?.pnlPercent ?? fallbackPnl.pnlPct;
  const pnlAmt = closeSummary?.pnlAmount ?? fallbackPnl.pnlAmt;
  await closeTradeMemory(params.code, pnlPct, pnlAmt, closeSummary?.holdDays ?? calcHoldDays(params.entryDate), closeReason);
  await sendTradeAlert({
    type: params.alertType,
    code: params.code,
    name: params.name,
    qty: params.qty,
    price: params.currentPrice,
    pnlPct,
  });
  return { action, tradeCount: 1 };
}

export async function executePartialExit(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  entryDate?: string | null;
  currentPhase?: string | null;
  riskAction: string;
  riskReason: string;
  partialExitRatio?: number;
}): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const currentPhase = params.currentPhase ?? "initial";
  const isSmallPosition = params.qty <= 1;
  const isFirstTrailingExit = currentPhase === "initial";
  const partialExitRatio = Number.isFinite(params.partialExitRatio) ? Number(params.partialExitRatio) : params.ctx.partialExitRatio;
  const sellQty = isSmallPosition
    ? params.qty
    : isFirstTrailingExit
      ? Math.max(1, Math.floor(params.qty * partialExitRatio / 100))
      : params.qty;
  const { nextPhase, phaseLabel } = resolvePartialExitPhase({ currentPhase, isSmallPosition });

  const result = await sellOrder(params.ctx.config, params.code, sellQty);
  const action: EngineAction = result.success
    ? {
        type: params.riskAction,
        code: params.code,
        name: params.name,
        detail: `${phaseLabel}: ${params.riskReason} → 매도 ${sellQty}/${params.qty}주 (${result.msg})`,
      }
    : buildOrderFailureAction({
        defaultType: "sell_failed",
        code: params.code,
        name: params.name,
        message: result.msg,
        prefix: `${phaseLabel} 매도 실패`,
      });

  if (!result.success) {
    await recordOrderFailureEvent({
      stockCode: params.code,
      stockName: params.name,
      side: "sell",
      message: result.msg,
      orderQty: sellQty,
      context: `${phaseLabel} ${params.riskReason}`,
    });
    return { actions: [action], tradeCount: 0 };
  }

  const remainingQty = params.qty - sellQty;
  if (remainingQty <= 0) {
    const closeReason = "trailing_stop" as PositionCloseReason;
    const closeSummary = await closePosition(params.code, params.currentPrice, sellQty, closeReason);
    const fallbackPnl = calcPnl(params.avgPrice, params.currentPrice, sellQty);
    const pnlPct = closeSummary?.pnlPercent ?? fallbackPnl.pnlPct;
    const pnlAmt = closeSummary?.pnlAmount ?? fallbackPnl.pnlAmt;
    await closeTradeMemory(params.code, pnlPct, pnlAmt, closeSummary?.holdDays ?? calcHoldDays(params.entryDate), closeReason);
    await sendTradeAlert({
      type: "trailing_stop",
      code: params.code,
      name: params.name,
      qty: sellQty,
      price: params.currentPrice,
      pnlPct,
    });
  } else {
    const { pnlPct } = calcPnl(params.avgPrice, params.currentPrice, sellQty);
    await recordPartialExit(params.code, params.currentPrice, sellQty, nextPhase);
    await sendTradeAlert({
      type: "trailing_stop",
      code: params.code,
      name: params.name,
      qty: sellQty,
      price: params.currentPrice,
      pnlPct,
    });
  }
  return { actions: [action], tradeCount: 1 };
}
