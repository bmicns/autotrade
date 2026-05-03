import { closePosition, closeTradeMemory, deletePendingOrder, getOpenPosition, openPosition, recordPartialExit } from "@/lib/engine/db";
import { checkOrderFill, sellOrder } from "@/lib/engine/kis";
import { sendTradeAlert } from "@/lib/engine/notify";
import type { StrategyKey } from "@/lib/engine/strategies";
import type { EngineAction, StepContext } from "@/lib/engine/types";
import type { SignalRaw } from "@/lib/kis/indicators";
import {
  isFinalTakeProfitPhase,
  resolvePartialExitPhase,
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

export async function reconcilePendingOrderFill(params: {
  ctx: StepContext;
  order: {
    id: string;
    stock_code: string;
    stock_name?: string | null;
    order_no: string;
    created_at: string;
    strategy_key?: string | null;
    signal_score?: number | null;
  };
}): Promise<EngineAction | null> {
  const fillResult = await checkOrderFill(params.ctx.config, params.order.order_no, params.order.stock_code);
  if (fillResult.filled && fillResult.filledQty > 0) {
    await deletePendingOrder(params.order.id);
    const existingPos = await getOpenPosition(params.order.stock_code);
    if (!existingPos) {
      await openPosition(
        params.order.stock_code,
        params.order.stock_name ?? null,
        fillResult.filledPrice,
        fillResult.filledQty,
        {
          strength: "weak",
          side: "buy",
          totalScore: params.order.signal_score ?? 0,
          comment: "체결 복구",
          indicators: [],
          raw: EMPTY_RAW,
          matchCount: 0,
          ...(params.order.strategy_key ? { strategyKey: params.order.strategy_key as StrategyKey } : {}),
        },
        "initial",
      );
    }
    return {
      type: "order_filled",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: `체결 확인: ${fillResult.filledQty}주 @ ${fillResult.filledPrice.toLocaleString()}원`,
    };
  }

  const ageMin = (Date.now() - new Date(params.order.created_at).getTime()) / 60000;
  if (ageMin >= 30) {
    await deletePendingOrder(params.order.id);
    return {
      type: "order_cancelled_timeout",
      code: params.order.stock_code,
      name: params.order.stock_name ?? params.order.stock_code,
      detail: `미체결 ${Math.round(ageMin)}분 경과 → 자동 삭제`,
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
  alertType: "sell" | "stop_loss" | "take_profit";
}): Promise<{ action: EngineAction; tradeCount: number }> {
  const closeReason = params.actionType as PositionCloseReason;
  const result = await sellOrder(params.ctx.config, params.code, params.qty);
  const action: EngineAction = {
    type: result.success ? params.actionType : "sell_failed",
    code: params.code,
    name: params.name,
    detail: result.success ? `${params.detail} (${result.msg})` : `${params.detail} → 매도 실패: ${result.msg}`,
  };

  if (!result.success) return { action, tradeCount: 0 };

  const { pnlPct, pnlAmt } = calcPnl(params.avgPrice, params.currentPrice, params.qty);
  await closePosition(params.code, params.currentPrice, params.qty, closeReason);
  await closeTradeMemory(params.code, pnlPct, pnlAmt, calcHoldDays(params.entryDate), closeReason);
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
  secondTakeProfitRatio: number;
}): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const currentPhase = params.currentPhase ?? "initial";
  if (isFinalTakeProfitPhase(currentPhase)) {
    return {
      actions: [{ type: "trailing_only", code: params.code, name: params.name, detail: "2차 익절 완료 상태 — 트레일링 스탑 대기 중" }],
      tradeCount: 0,
    };
  }

  const isSmallPosition = params.qty <= 3;
  const sellQty = isSmallPosition
    ? params.qty
    : currentPhase === "initial"
      ? Math.max(1, Math.floor(params.qty * params.ctx.takeProfitRatio / 100))
      : Math.max(1, Math.floor(params.qty * params.secondTakeProfitRatio / 100));
  const { nextPhase, phaseLabel } = resolvePartialExitPhase({ currentPhase, isSmallPosition });

  const result = await sellOrder(params.ctx.config, params.code, sellQty);
  const action: EngineAction = {
    type: result.success ? params.riskAction : "sell_failed",
    code: params.code,
    name: params.name,
    detail: result.success
      ? `${phaseLabel}: ${params.riskReason} → 매도 ${sellQty}/${params.qty}주 (${result.msg})`
      : `${phaseLabel} 매도 실패: ${result.msg}`,
  };

  if (!result.success) return { actions: [action], tradeCount: 0 };

  const { pnlPct, pnlAmt } = calcPnl(params.avgPrice, params.currentPrice, sellQty);
  const remainingQty = params.qty - sellQty;
  if (remainingQty <= 0) {
    const closeReason = params.riskAction as PositionCloseReason;
    await closePosition(params.code, params.currentPrice, sellQty, closeReason);
    await closeTradeMemory(params.code, pnlPct, pnlAmt, calcHoldDays(params.entryDate), closeReason);
  } else {
    await recordPartialExit(params.code, params.currentPrice, sellQty, nextPhase);
  }

  await sendTradeAlert({
    type: "take_profit",
    code: params.code,
    name: params.name,
    qty: sellQty,
    price: params.currentPrice,
    pnlPct,
  });
  return { actions: [action], tradeCount: 1 };
}
