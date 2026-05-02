import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";
import { getMarketClosureReason } from "@/lib/engine/market-calendar";
import { cancelOpenBuyOrders } from "@/lib/engine/kis";
import { getBalance, getToken } from "@/lib/kis/api";
import { sendMarketCloseAlert } from "@/lib/engine/notify";
import type { EngineConfig } from "@/lib/engine/types";
type MinConfig = Pick<EngineConfig, "appKey" | "appSecret" | "accountNo" | "token">;

export async function GET() {
  try {
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const closureReason = getMarketClosureReason(cfgMap);
    if (closureReason) {
      return NextResponse.json({ skipped: true, reason: closureReason });
    }

    // KIS 설정 로드
    const { data: kisConfig } = await supabase.from("kis_config").select("*").limit(1).maybeSingle();
    if (!kisConfig?.app_key || !kisConfig?.app_secret || !kisConfig?.account_no) {
      return NextResponse.json({ error: "KIS app_key/app_secret/account_no 미설정" }, { status: 400 });
    }

    // 토큰이 없거나 만료된 경우 자동 재발급
    let token: string = kisConfig.token ?? "";
    if (!token) {
      try {
        token = await getToken(kisConfig.app_key, kisConfig.app_secret);
        await supabase.from("kis_config").update({ token, updated_at: new Date().toISOString() }).eq("id", "default");
      } catch {
        return NextResponse.json({ error: "KIS 토큰 자동 발급 실패 — 수동 재연결 필요" }, { status: 503 });
      }
    }

    const config: MinConfig = {
      appKey: kisConfig.app_key,
      appSecret: kisConfig.app_secret,
      accountNo: kisConfig.account_no,
      token,
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
