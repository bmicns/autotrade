import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";
import { cancelOpenBuyOrders } from "@/lib/engine/kis";
import { getBalance } from "@/lib/kis/api";
import { sendMarketCloseAlert } from "@/lib/engine/notify";
import type { EngineConfig } from "@/lib/engine/types";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // KIS 설정 로드
    const { data: kisConfig } = await supabase.from("kis_config").select("*").limit(1).single();
    if (!kisConfig?.token) {
      return NextResponse.json({ error: "KIS 연결 필요" }, { status: 400 });
    }

    const config: EngineConfig = {
      appKey: kisConfig.app_key,
      appSecret: kisConfig.app_secret,
      accountNo: kisConfig.account_no,
      token: kisConfig.token,
      stopLoss: -5,
      takeProfit: 5,
      trailingStop: -3,
      maxPerTrade: 1000000,
      maxDailyTrades: 10,
      takeProfitRatio: 50,
      dailyLossLimit: -3,
      dynamicRisk: true,
      maxHoldDays: 5,
    };

    // 1. 미체결 매수 주문 전량 취소
    const { cancelled, failed } = await cancelOpenBuyOrders(config);

    // 2. DB open 포지션 목록
    const { data: dbPositions } = await supabase
      .from("positions")
      .select("stock_code")
      .eq("status", "open");

    const dbCodes = new Set((dbPositions ?? []).map((p: { stock_code: string }) => p.stock_code));

    // 3. KIS 실제 잔고 조회 (직접 호출 — URL에 credential 노출 방지)
    const balData = await getBalance(config).catch(() => ({}));
    const kisCodes = new Set<string>(
      (((balData as Record<string, unknown>).output1 ?? []) as Array<{ pdno: string; hldg_qty: string }>)
        .filter((h) => Number(h.hldg_qty) > 0)
        .map((h) => h.pdno),
    );

    // 4. 불일치 감지: DB에 open이나 KIS에 없는 종목
    const mismatches: string[] = [];
    for (const code of dbCodes) {
      if (!kisCodes.has(code)) {
        mismatches.push(code);
        await supabase
          .from("positions")
          .update({ status: "mismatch", updated_at: new Date().toISOString() })
          .eq("stock_code", code)
          .eq("status", "open");
      }
    }

    // 5. app_config에 last_close_at 기록
    await supabase.from("app_config").upsert({
      key: "last_close_at",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 6. 텔레그램 알림
    await sendMarketCloseAlert(cancelled, failed, mismatches);

    return NextResponse.json({ ok: true, cancelled, failed, mismatches });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "정산 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
