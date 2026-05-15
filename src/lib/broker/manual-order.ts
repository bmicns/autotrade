import { placeOrder, placeOverseasOrder } from "@/lib/kis/api";
import { getActiveKisConfig, getActiveKisConfigForAssetClass } from "@/lib/kis/runtime-config";
import { normalizeKisProfileId } from "@/lib/kis/profile";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";
import type { BrokerId } from "./types";
import { getBrokerLabel } from "./registry";

const VALID_SIDES = new Set(["buy", "sell"]);
const MAX_QTY = 10_000;
const MAX_PRICE = 10_000_000;
const MAX_NOTE_LENGTH = 120;

export function validateManualOrderPayload(input: Record<string, unknown>) {
  const side = String(input.side ?? "");
  const stockCode = String(input.stockCode ?? "");
  const stockName = typeof input.stockName === "string" ? input.stockName : "";
  const marketType = input.market === "us" ? "us" : "kr";
  const normalizedProfileId = normalizeKisProfileId(typeof input.profileId === "string" ? input.profileId : undefined);
  const normalizedNote = typeof input.note === "string" ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : "";
  const normalizedStockName = stockName.trim() ? stockName.trim().slice(0, 80) : stockCode;
  const qty = Math.floor(Number(input.quantity));
  const px = Number(input.price ?? 0);
  const exchangeCode = typeof input.exchangeCode === "string" ? input.exchangeCode : undefined;
  const orderType = typeof input.orderType === "string" ? input.orderType : "00";

  if (!VALID_SIDES.has(side)) return { error: "side는 'buy' 또는 'sell'이어야 합니다" };
  if (marketType === "kr" && !/^\d{6}$/.test(stockCode)) return { error: "유효하지 않은 국내 종목코드입니다" };
  if (marketType === "us" && !/^[A-Z][A-Z0-9.-]{0,14}$/i.test(stockCode)) return { error: "유효하지 않은 해외 심볼입니다" };
  if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) return { error: `수량은 1~${MAX_QTY} 정수여야 합니다` };
  if (!Number.isFinite(px) || px < 0 || px > MAX_PRICE) return { error: "유효하지 않은 가격입니다" };
  if (typeof input.note === "string" && input.note.trim().length > MAX_NOTE_LENGTH) {
    return { error: `주문 메모는 ${MAX_NOTE_LENGTH}자 이하여야 합니다` };
  }

  return {
    side: side as "buy" | "sell",
    stockCode,
    marketType,
    normalizedProfileId,
    normalizedNote,
    normalizedStockName,
    qty,
    px,
    exchangeCode,
    orderType,
  };
}

export async function placeBrokerManualOrder(
  brokerId: BrokerId,
  payload: ReturnType<typeof validateManualOrderPayload> & { error?: undefined },
) {
  if (brokerId !== "kis") {
    return {
      ok: false as const,
      status: 501,
      body: { error: `${getBrokerLabel(brokerId)} 주문 라우트는 아직 구현되지 않았습니다` },
    };
  }

  const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
  const active = payload.normalizedProfileId
    ? await getActiveKisConfig(payload.normalizedProfileId)
    : payload.marketType === "us"
      ? await getActiveKisConfigForAssetClass("us_stock")
      : await getActiveKisConfig(domesticProfileId);

  if (!active) {
    return {
      ok: false as const,
      status: 400,
      body: {
        error: payload.marketType === "us"
          ? "미국 KIS 설정이 없습니다"
          : `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다`,
      },
    };
  }

  let token: string;
  try {
    token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
    return {
      ok: false as const,
      status: 500,
      body: {
        error: `${payload.marketType === "us" ? "미국" : "국내"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
      },
    };
  }

  if (payload.marketType === "us") {
    if ((payload.orderType ?? "00") !== "00") {
      return { ok: false as const, status: 400, body: { error: "해외주식 주문은 현재 지정가(00)만 지원합니다" } };
    }

    const normalizedExchange = payload.exchangeCode === "NYSE" || payload.exchangeCode === "AMEX" ? payload.exchangeCode : "NASD";
    const data = await placeOverseasOrder(
      {
        appKey: active.config.appKey,
        appSecret: active.config.appSecret,
        accountNo: active.config.accountNo,
        accountProductCode: active.config.accountProductCode,
        token,
      },
      {
        side: payload.side,
        symbol: payload.stockCode.toUpperCase(),
        quantity: payload.qty,
        price: payload.px,
        exchangeCode: normalizedExchange,
        orderDiv: "00",
      },
    );

    if (String(data?.rt_cd ?? "") === "0") {
      await recordEngineEvent({
        eventType: payload.side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
        stockCode: payload.stockCode.toUpperCase(),
        entityTable: "operations",
        entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
        payload: {
          market: "us",
          exchangeCode: normalizedExchange,
          qty: payload.qty,
          price: payload.px,
          order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
          side: payload.side,
          profileId: active.profileId,
          success: true,
          currency: "USD",
          stock_name: payload.normalizedStockName || null,
          note: payload.normalizedNote || null,
        },
      });
    }

    return {
      ok: true as const,
      status: 200,
      body: { ...data, profileId: active.profileId, market: "us", exchangeCode: normalizedExchange },
    };
  }

  const data = await placeOrder(
    {
      appKey: active.config.appKey,
      appSecret: active.config.appSecret,
      accountNo: active.config.accountNo,
      accountProductCode: active.config.accountProductCode,
      token,
    },
    payload.side,
    payload.stockCode,
    payload.qty,
    payload.px,
    (payload.orderType ?? "00") as "00" | "01",
  );

  if (String(data?.rt_cd ?? "") === "0") {
    await recordEngineEvent({
      eventType: payload.side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
      stockCode: payload.stockCode,
      entityTable: "operations",
      entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
      payload: {
        market: "kr",
        qty: payload.qty,
        price: payload.px,
        order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
        side: payload.side,
        profileId: active.profileId,
        success: true,
        currency: "KRW",
        stock_name: payload.normalizedStockName || null,
        note: payload.normalizedNote || null,
      },
    });
  }

  return {
    ok: true as const,
    status: 200,
    body: { ...data, profileId: active.profileId, market: "kr" },
  };
}
