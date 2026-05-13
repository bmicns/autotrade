import { NextRequest, NextResponse } from "next/server";
import { placeOrder, placeOverseasOrder } from "@/lib/kis/api";
import { getEngineLockState, isEngineEnabled } from "@/lib/engine/app-config";
import { getSupabaseConfigError } from "@/lib/supabase/api-client";
import { getActiveKisConfig, getActiveKisConfigForAssetClass } from "@/lib/kis/runtime-config";
import { normalizeKisProfileId } from "@/lib/kis/profile";
import { recordEngineEvent } from "@/lib/engine/event-log";
import { KIS_RUNTIME_MODE } from "@/lib/constants";
import { resolveKisAccessToken } from "@/lib/kis/runtime-token";

const VALID_SIDES = new Set(["buy", "sell"]);
const MAX_QTY = 10_000;
const MAX_PRICE = 10_000_000;
const MAX_NOTE_LENGTH = 120;

export async function POST(req: NextRequest) {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const { side, stockCode, stockName, quantity, price, orderType, profileId, market, exchangeCode, note } = await req.json();
    const normalizedProfileId = normalizeKisProfileId(typeof profileId === "string" ? profileId : undefined);
    const marketType = market === "us" ? "us" : "kr";
    const normalizedNote = typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "";
    const normalizedStockName = typeof stockName === "string" && stockName.trim()
      ? stockName.trim().slice(0, 80)
      : typeof stockCode === "string"
        ? stockCode
        : "";

    if (!VALID_SIDES.has(side)) {
      return NextResponse.json({ error: "side는 'buy' 또는 'sell'이어야 합니다" }, { status: 400 });
    }
    if (side === "buy" && !(await isEngineEnabled())) {
      return NextResponse.json({ error: "비상 정지 활성 상태에서는 신규 매수를 실행할 수 없습니다" }, { status: 409 });
    }
    if (side === "buy") {
      const lockState = await getEngineLockState();
      if (lockState.locked) {
        return NextResponse.json({ error: "엔진 실행 중에는 신규 매수를 실행할 수 없습니다" }, { status: 409 });
      }
    }
    if (marketType === "kr" && !/^\d{6}$/.test(stockCode)) {
      return NextResponse.json({ error: "유효하지 않은 국내 종목코드입니다" }, { status: 400 });
    }
    if (marketType === "us" && !/^[A-Z][A-Z0-9.-]{0,14}$/i.test(stockCode)) {
      return NextResponse.json({ error: "유효하지 않은 해외 심볼입니다" }, { status: 400 });
    }
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
      return NextResponse.json({ error: `수량은 1~${MAX_QTY} 정수여야 합니다` }, { status: 400 });
    }
    const px = Number(price ?? 0);
    if (!Number.isFinite(px) || px < 0 || px > MAX_PRICE) {
      return NextResponse.json({ error: "유효하지 않은 가격입니다" }, { status: 400 });
    }
    if (typeof note === "string" && note.trim().length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `주문 메모는 ${MAX_NOTE_LENGTH}자 이하여야 합니다` }, { status: 400 });
    }

    const domesticProfileId = KIS_RUNTIME_MODE === "prod" ? "kr" : "default";
    const active = normalizedProfileId
      ? await getActiveKisConfig(normalizedProfileId)
      : marketType === "us"
        ? await getActiveKisConfigForAssetClass("us_stock")
        : await getActiveKisConfig(domesticProfileId);
    if (!active) {
      return NextResponse.json(
        {
          error: marketType === "us"
            ? "미국 KIS 설정이 없습니다"
            : `${KIS_RUNTIME_MODE === "prod" ? "국내" : "모의"} KIS 설정이 없습니다`,
        },
        { status: 400 },
      );
    }
    let token: string;
    try {
      token = await resolveKisAccessToken(active.profileId, active.config.appKey, active.config.appSecret);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "KIS 토큰 발급 실패";
      return NextResponse.json(
        {
          error: `${marketType === "us" ? "미국" : "국내"} KIS 토큰 오류 (${active.source}/${active.profileId}): ${message}`,
        },
        { status: 500 },
      );
    }

    if (marketType === "us") {
      if ((orderType ?? "00") !== "00") {
        return NextResponse.json({ error: "해외주식 주문은 현재 지정가(00)만 지원합니다" }, { status: 400 });
      }
      const normalizedExchange = exchangeCode === "NYSE" || exchangeCode === "AMEX" ? exchangeCode : "NASD";
      const data = await placeOverseasOrder(
        {
          appKey: active.config.appKey,
          appSecret: active.config.appSecret,
          accountNo: active.config.accountNo,
          accountProductCode: active.config.accountProductCode,
          token,
        },
        {
          side,
          symbol: String(stockCode).toUpperCase(),
          quantity: qty,
          price: px,
          exchangeCode: normalizedExchange,
          orderDiv: "00",
        },
      );
      if (String(data?.rt_cd ?? "") === "0") {
        await recordEngineEvent({
          eventType: side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
          stockCode: String(stockCode).toUpperCase(),
          entityTable: "operations",
          entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
        payload: {
          market: "us",
          exchangeCode: normalizedExchange,
          qty,
          price: px,
          order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
          side,
          profileId: active.profileId,
          success: true,
          currency: "USD",
          stock_name: normalizedStockName || null,
          note: normalizedNote || null,
          },
        });
      }
      return NextResponse.json({ ...data, profileId: active.profileId, market: "us", exchangeCode: normalizedExchange });
    }

    const data = await placeOrder(
      {
        appKey: active.config.appKey,
        appSecret: active.config.appSecret,
        accountNo: active.config.accountNo,
        accountProductCode: active.config.accountProductCode,
        token,
      },
      side,
      stockCode,
      qty,
      px,
      orderType ?? "00"
    );
    if (String(data?.rt_cd ?? "") === "0") {
      await recordEngineEvent({
        eventType: side === "buy" ? "manual_buy_executed" : "manual_sell_executed",
        stockCode: stockCode,
        entityTable: "operations",
        entityId: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
        payload: {
          market: "kr",
          qty,
          price: px,
          order_no: typeof data?.output?.ODNO === "string" ? data.output.ODNO : null,
          side,
          profileId: active.profileId,
          success: true,
          currency: "KRW",
          stock_name: normalizedStockName || null,
          note: normalizedNote || null,
        },
      });
    }
    return NextResponse.json({ ...data, profileId: active.profileId, market: "kr" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "주문 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
