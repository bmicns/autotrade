import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";
import { sendDailyReport } from "@/lib/engine/notify";

// GET /api/daily-report — 크론 전용 (proxy.ts CRON_ROUTES)
// 수동 트리거가 필요한 경우 대시보드 UI에서 세션 인증 후 직접 호출하는 별도 엔드포인트 추가 고려
export async function GET(_req: NextRequest) {
  const kstNow = new Date(Date.now() + 9 * 3600000);
  const today = kstNow.toISOString().slice(0, 10);

  // 오늘 청산된 포지션
  const { data: closedToday } = await supabase
    .from("positions")
    .select("stock_code, stock_name, pnl_amount, pnl_percent, exit_reason")
    .eq("status", "closed")
    .gte("exit_date", today);

  // 오늘 열린 포지션
  const { data: openToday } = await supabase
    .from("positions")
    .select("stock_code")
    .eq("status", "open");

  // 오늘 엔진 실행 횟수 + 스캔 수
  const { data: runData } = await supabase
    .from("engine_runs")
    .select("trade_count, scanned_count, actions")
    .gte("created_at", today);

  const closed = closedToday || [];
  const runs = runData || [];

  const BUY_ACTION_TYPES = new Set(["approved_buy", "split_buy_1", "split_buy_2", "surge_buy"]);

  const sellCount = closed.length;
  const buyCount = runs.reduce((s, r) => {
    const actions = Array.isArray(r.actions) ? r.actions : [];
    return s + actions.filter((a: { type?: string }) => BUY_ACTION_TYPES.has(a.type ?? "")).length;
  }, 0);
  const realizedPnlAmt = closed.reduce((s, p) => s + (Number(p.pnl_amount) || 0), 0);
  const realizedPnlPct = closed.length > 0
    ? closed.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0) / closed.length
    : 0;

  const details = closed.map((p) => ({
    name: p.stock_name || p.stock_code,
    code: p.stock_code,
    pnlAmt: Number(p.pnl_amount) || 0,
    pnlPct: Number(p.pnl_percent) || 0,
    reason: p.exit_reason || "매도",
  }));

  await sendDailyReport({
    date: today,
    tradeCount: buyCount + sellCount,
    buyCount: Math.max(0, buyCount),
    sellCount,
    realizedPnlAmt,
    realizedPnlPct,
    openPositions: (openToday || []).length,
    engineRuns: runs.length,
    scannedCount: runs.reduce((s, r) => s + (Number(r.scanned_count) || 0), 0),
    details,
  });

  return NextResponse.json({ ok: true, date: today, sellCount, realizedPnlAmt });
}
