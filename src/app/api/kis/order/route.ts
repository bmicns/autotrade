import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kis/api";

export async function POST(req: NextRequest) {
  try {
    const { appKey, appSecret, token, accountNo, side, stockCode, quantity, price, orderType } = await req.json();

    if (!appKey || !appSecret || !token || !accountNo || !side || !stockCode || !quantity) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    const data = await placeOrder(
      { appKey, appSecret, accountNo, token },
      side,
      stockCode,
      quantity,
      price ?? 0,
      orderType ?? "00"
    );
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "주문 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
