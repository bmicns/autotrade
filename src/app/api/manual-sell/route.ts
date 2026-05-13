import { NextRequest, NextResponse } from "next/server";
import { getOpenPosition, closePosition, closeTradeMemory } from "@/lib/engine/db";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { getPrice as getEnginePrice, sellOrder } from "@/lib/engine/kis";
import { sendTradeAlert } from "@/lib/engine/notify";
import { getOpenPositionRemainingQty } from "@/lib/engine/position-math";
import type { EngineConfig } from "@/lib/engine/types";
import { getEngineLockState } from "@/lib/engine/app-config";
import { getActiveKisConfig } from "@/lib/kis/runtime-config";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";

const MAX_QTY = 10_000;

export async function POST(req: NextRequest) {
  try {
    const lockState = await getEngineLockState();
    if (lockState.locked) {
      return NextResponse.json({ error: "엔진 실행 중에는 수동 매도를 실행할 수 없습니다" }, { status: 409 });
    }

    const { stockCode, quantity } = await req.json() as {
      stockCode?: string;
      quantity?: number;
    };

    if (!/^\d{6}$/.test(String(stockCode ?? ""))) {
      return NextResponse.json({ error: "유효하지 않은 종목코드입니다" }, { status: 400 });
    }

    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
      return NextResponse.json({ error: `수량은 1~${MAX_QTY} 정수여야 합니다` }, { status: 400 });
    }

    const position = await getOpenPosition(stockCode!);
    const openQty = position ? getOpenPositionRemainingQty(position) : null;
    if (position && qty !== openQty) {
      return NextResponse.json({ error: `수동 매도 테스트는 현재 전량 매도만 지원합니다. 보유 ${openQty}주` }, { status: 400 });
    }

    const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = await getActiveKisConfig(domesticProfileId);
    if (!active) {
      return NextResponse.json(
        { error: `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다` },
        { status: 400 },
      );
    }

    // Write-order rehearsal should validate the same credential set with a fresh token.
    let token: string;
    try {
      token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "국내 KIS 토큰 발급 실패";
      return NextResponse.json(
        { error: `국내 KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}` },
        { status: 500 },
      );
    }
    const engineConfig: EngineConfig = {
      appKey: active.config.appKey,
      appSecret: active.config.appSecret,
      accountNo: active.config.accountNo,
      accountProductCode: active.config.accountProductCode,
      token,
      stopLoss: -2,
      trailingStop: -3,
      maxPerTrade: 0,
      maxDailyTrades: 1,
      partialExitRatio: 50,
      dailyLossLimit: -3,
      maxHoldDays: 1,
      dynamicRisk: true,
    };
    const quote = await getEnginePrice(engineConfig, stockCode!);
    const currentPrice = Number(quote?.stck_prpr) || Number(position?.entry_price) || 0;

    const result = await sellOrder(engineConfig, stockCode!, qty);

    if (!result.success) {
      await recordEngineEvent({
        eventType: "manual_sell_executed",
        stockCode: stockCode!,
        entityTable: "operations",
        entityId: null,
      payload: {
        success: false,
        qty,
        side: "sell",
        market: "kr",
        currency: "KRW",
        profileId: active.profileId,
        order_no: result.ordNo ?? null,
        stock_name: String(position?.stock_name ?? stockCode),
        reason: result.msg ?? "매도 주문 실패",
        hadOpenPosition: Boolean(position),
      },
      });
      return NextResponse.json({ success: false, result }, { status: 400 });
    }

    const closeSummary = position ? await closePosition(stockCode!, currentPrice, qty, "manual_sell") : null;
    const pnlPct = closeSummary?.pnlPercent
      ?? (Number(position?.entry_price) > 0 ? ((currentPrice - Number(position?.entry_price)) / Number(position?.entry_price)) * 100 : undefined);
    const pnlAmt = closeSummary?.pnlAmount
      ?? (Number(position?.entry_price) > 0 ? (currentPrice - Number(position?.entry_price)) * qty : undefined);
    const holdDays = closeSummary?.holdDays
      ?? (position?.entry_date ? Math.max(1, Math.ceil((Date.now() - new Date(String(position.entry_date)).getTime()) / 86400000)) : undefined);
    if (position && pnlPct !== undefined && pnlAmt !== undefined && holdDays !== undefined) {
      await closeTradeMemory(stockCode!, pnlPct, pnlAmt, holdDays, "manual_sell");
    }
    await recordEngineEvent({
      eventType: "manual_sell_executed",
      stockCode: stockCode!,
      entityTable: "operations",
      entityId: result.ordNo ?? null,
      payload: {
        success: true,
        qty,
        price: currentPrice,
        side: "sell",
        market: "kr",
        currency: "KRW",
        profileId: active.profileId,
        order_no: result.ordNo ?? null,
        stock_name: String(position?.stock_name ?? stockCode),
        pnlPct: pnlPct ?? null,
        pnlAmt: pnlAmt ?? null,
        holdDays: holdDays ?? null,
        hadOpenPosition: Boolean(position),
      },
    });
    await sendTradeAlert({
      type: "sell",
      code: stockCode!,
      name: String(position?.stock_name ?? stockCode),
      qty,
      price: currentPrice,
      pnlPct,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      stockCode,
      quantity: qty,
      price: currentPrice,
      message: result.msg ?? "매도 주문 성공",
      orderNo: result.ordNo ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수동 매도 실패" },
      { status: 500 },
    );
  }
}
