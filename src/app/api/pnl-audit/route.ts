import { NextRequest, NextResponse } from "next/server";
import { compareClosedPositionPnl } from "@/lib/engine/pnl-audit";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";

export async function GET(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "14");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.floor(daysParam), 90) : 14;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const [positionsRes, memoriesRes] = await Promise.all([
      supabase
        .from("positions")
        .select("id, stock_code, stock_name, exit_date, exit_reason, pnl_amount, pnl_percent")
        .eq("status", "closed")
        .gte("exit_date", cutoff)
        .order("exit_date", { ascending: false })
        .limit(200),
      supabase
        .from("trade_memory")
        .select("id, stock_code, stock_name, closed_at, exit_reason, pnl_amount, pnl_percent")
        .not("closed_at", "is", null)
        .gte("closed_at", cutoff)
        .order("closed_at", { ascending: false })
        .limit(200),
    ]);

    const summary = compareClosedPositionPnl(positionsRes.data ?? [], memoriesRes.data ?? []);

    return NextResponse.json({
      days,
      cutoff,
      closedPositionCount: positionsRes.data?.length ?? 0,
      closedTradeMemoryCount: memoriesRes.data?.length ?? 0,
      matchedCount: summary.matchedCount,
      mismatchCount: summary.mismatchCount,
      mismatches: summary.mismatches.slice(0, 30),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "손익 대사 조회 실패" },
      { status: 500 },
    );
  }
}
