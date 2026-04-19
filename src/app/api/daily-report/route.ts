import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";
import { sendDailyReport } from "@/lib/engine/notify";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
