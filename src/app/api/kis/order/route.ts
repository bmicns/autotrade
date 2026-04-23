import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kis/api";
import { supabase } from "@/lib/supabase/api-client";

const VALID_SIDES = new Set(["buy", "sell"]);
const MAX_QTY = 10_000;
const MAX_PRICE = 10_000_000;

export async function POST(req: NextRequest) {
  try {
    const { side, stockCode, quantity, price, orderType } = await req.json();

    if (!VALID_SIDES.has(side)) {
      return NextResponse.json({ error: "side는 'buy' 또는 'sell'이어야 합니다" }, { status: 400 });
    }
    if (!/^\d{6}$/.test(stockCode)) {
      return NextResponse.json({ error: "유효하지 않은 종목코드입니다" }, { status: 400 });
    }
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
      return NextResponse.json({ error: `수량은 1~${MAX_QTY} 정수여야 합니다` }, { status: 400 });
    }
    const px = Number(price ?? 0);
    if (!Number.isFinite(px) || px < 0 || px > MAX_PRICE) {
      return NextResponse.json({ error: "유효하지 않은 가격입니다" }, { status: 400 });
    }

    const { data: cfg } = await supabase
      .from("kis_config")
      .select("app_key, app_secret, account_no, token")
      .eq("id", "default")
      .maybeSingle();

    if (!cfg?.app_key || !cfg?.token || !cfg?.account_no) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

    const data = await placeOrder(
      { appKey: cfg.app_key, appSecret: cfg.app_secret, accountNo: cfg.account_no, token: cfg.token },
      side,
      stockCode,
      qty,
      px,
      orderType ?? "00"
    );
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "주문 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
