import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzePerformance, type Position } from "@/lib/analytics";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "all";

  // 기간 필터
  let dateFilter: string | null = null;
  const now = new Date();
  if (period === "1w") {
    dateFilter = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else if (period === "1m") {
    dateFilter = new Date(now.getTime() - 30 * 86400000).toISOString();
  } else if (period === "3m") {
    dateFilter = new Date(now.getTime() - 90 * 86400000).toISOString();
  }

  try {
    let query = supabase
      .from("positions")
      .select("*")
      .order("entry_date", { ascending: false });

    if (dateFilter) {
      query = query.gte("entry_date", dateFilter);
    }

    const { data, error } = await query;

    if (error) {
      // 테이블 미존재 시 빈 결과 반환
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return NextResponse.json(analyzePerformance([]));
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const positions: Position[] = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      stock_code: row.stock_code as string,
      stock_name: (row.stock_name as string) || null,
      entry_price: Number(row.entry_price) || 0,
      entry_qty: Number(row.entry_qty) || 0,
      entry_date: row.entry_date as string,
      entry_signal: (row.entry_signal as Record<string, unknown>) || null,
      signal_strength: (row.signal_strength as string) || null,
      exit_price: row.exit_price ? Number(row.exit_price) : null,
      exit_date: (row.exit_date as string) || null,
      exit_reason: (row.exit_reason as string) || null,
      pnl_amount: row.pnl_amount ? Number(row.pnl_amount) : null,
      pnl_percent: row.pnl_percent ? Number(row.pnl_percent) : null,
      hold_days: row.hold_days ? Number(row.hold_days) : null,
      status: (row.status as string) || "open",
    }));

    const stats = analyzePerformance(positions);
    return NextResponse.json({ ...stats, positions: positions.slice(0, 50) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "성과 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
