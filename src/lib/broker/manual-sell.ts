import { closePosition, closeTradeMemory, getOpenPosition } from "@/lib/engine/db";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { getEngineLockState } from "@/lib/engine/app-config";
import { sellOrder, getPrice as getEnginePrice } from "@/lib/engine/kis";
import { sendTradeAlert } from "@/lib/engine/notify";
import { getOpenPositionRemainingQty } from "@/lib/engine/position-math";
import { resolveActiveDomesticExecutionContext } from "./execution";

const MAX_QTY = 10_000;

export function validateManualSellPayload(input: Record<string, unknown>) {
  const stockCode = typeof input.stockCode === "string" ? input.stockCode : "";
  const qty = Math.floor(Number(input.quantity));

  if (!/^\d{6}$/.test(stockCode)) {
    return { error: "유효하지 않은 종목코드입니다" };
  }
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
    return { error: `수량은 1~${MAX_QTY} 정수여야 합니다` };
  }

  return {
    stockCode,
    qty,
  };
}

export async function executeBrokerManualSell(payload: ReturnType<typeof validateManualSellPayload> & { error?: undefined }) {
  const lockState = await getEngineLockState();
  if (lockState.locked) {
    return {
      ok: false as const,
      status: 409,
      body: { error: "엔진 실행 중에는 수동 매도를 실행할 수 없습니다" },
    };
  }

  const position = await getOpenPosition(payload.stockCode);
  const openQty = position ? getOpenPositionRemainingQty(position) : null;
  if (position && payload.qty !== openQty) {
    return {
      ok: false as const,
      status: 400,
      body: { error: `수동 매도 테스트는 현재 전량 매도만 지원합니다. 보유 ${openQty}주` },
    };
  }

  const execution = await resolveActiveDomesticExecutionContext();
  if (!execution.ok) {
    return {
      ok: false as const,
      status: execution.status,
      body: { error: execution.error },
    };
  }

  const engineConfig = execution.engineConfig;
  const quote = await getEnginePrice(engineConfig, payload.stockCode);
  const currentPrice = Number(quote?.stck_prpr) || Number(position?.entry_price) || 0;
  const result = await sellOrder(engineConfig, payload.stockCode, payload.qty);

  if (!result.success) {
    await recordEngineEvent({
      eventType: "manual_sell_executed",
      stockCode: payload.stockCode,
      entityTable: "operations",
      entityId: null,
      payload: {
        success: false,
        qty: payload.qty,
        side: "sell",
        market: "kr",
        currency: "KRW",
        profileId: execution.profileId,
        order_no: result.ordNo ?? null,
        stock_name: String(position?.stock_name ?? payload.stockCode),
        reason: result.msg ?? "매도 주문 실패",
        hadOpenPosition: Boolean(position),
      },
    });
    return {
      ok: false as const,
      status: 400,
      body: { success: false, result },
    };
  }

  const closeSummary = position ? await closePosition(payload.stockCode, currentPrice, payload.qty, "manual_sell") : null;
  const pnlPct = closeSummary?.pnlPercent
    ?? (Number(position?.entry_price) > 0 ? ((currentPrice - Number(position?.entry_price)) / Number(position?.entry_price)) * 100 : undefined);
  const pnlAmt = closeSummary?.pnlAmount
    ?? (Number(position?.entry_price) > 0 ? (currentPrice - Number(position?.entry_price)) * payload.qty : undefined);
  const holdDays = closeSummary?.holdDays
    ?? (position?.entry_date ? Math.max(1, Math.ceil((Date.now() - new Date(String(position.entry_date)).getTime()) / 86400000)) : undefined);

  if (position && pnlPct !== undefined && pnlAmt !== undefined && holdDays !== undefined) {
    await closeTradeMemory(payload.stockCode, pnlPct, pnlAmt, holdDays, "manual_sell");
  }

  await recordEngineEvent({
    eventType: "manual_sell_executed",
    stockCode: payload.stockCode,
    entityTable: "operations",
    entityId: result.ordNo ?? null,
    payload: {
      success: true,
      qty: payload.qty,
      price: currentPrice,
      side: "sell",
      market: "kr",
      currency: "KRW",
      profileId: execution.profileId,
      order_no: result.ordNo ?? null,
      stock_name: String(position?.stock_name ?? payload.stockCode),
      pnlPct: pnlPct ?? null,
      pnlAmt: pnlAmt ?? null,
      holdDays: holdDays ?? null,
      hadOpenPosition: Boolean(position),
    },
  });

  await sendTradeAlert({
    type: "sell",
    code: payload.stockCode,
    name: String(position?.stock_name ?? payload.stockCode),
    qty: payload.qty,
    price: currentPrice,
    pnlPct,
  }).catch(() => {});

  return {
    ok: true as const,
    status: 200,
    body: {
      success: true,
      stockCode: payload.stockCode,
      quantity: payload.qty,
      price: currentPrice,
      message: result.msg ?? "매도 주문 성공",
      orderNo: result.ordNo ?? null,
    },
  };
}
