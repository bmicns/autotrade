import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/kis/api";
import { supabase } from "@/lib/supabase/api-client";

export async function POST(req: NextRequest) {
  try {
    const { side, stockCode, quantity, price, orderType } = await req.json();

    if (!side || !stockCode || !quantity) {
      return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
    }

    const { data: cfg } = await supabase
      .from("kis_config")
      .select("app_key, app_secret, account_no, token")
      .eq("id", "default")
      .single();

    if (!cfg?.app_key || !cfg?.token) {
      return NextResponse.json({ error: "KIS 설정이 없습니다" }, { status: 400 });
    }

    const data = await placeOrder(
      { appKey: cfg.app_key, appSecret: cfg.app_secret, accountNo: cfg.account_no, token: cfg.token },
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
