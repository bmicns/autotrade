import { supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { analyzePerformance, type Position } from "@/lib/analytics";

const CLOSE_TYPES = new Set(["take_profit", "stop_loss", "trailing_stop", "max_hold_sell"]);

// detail 문자열에서 첫 번째 pnl% 파싱: "(19.5% ≥ ..." → 19.5
function parsePnlPct(detail: string): number | null {
  const m = detail.match(/\(([+-]?\d+\.?\d*)%/);
  return m ? parseFloat(m[1]) : null;
}

type EngineAction = { type: string; code?: string; name?: string; detail?: string };

async function buildPositionsFromEngineRuns(dateFilter: string | null): Promise<Position[]> {
  let query = supabase
    .from("engine_runs")
    .select("run_at, actions")
    .order("run_at", { ascending: false })
    .limit(200);

  if (dateFilter) query = query.gte("run_at", dateFilter);

  const { data } = await query;
  if (!data) return [];

  const positions: Position[] = [];
  let idx = 0;

  for (const run of data) {
    for (const action of (run.actions as EngineAction[]) ?? []) {
      if (!CLOSE_TYPES.has(action.type) || !action.code) continue;
      const pnlPct = action.detail ? parsePnlPct(action.detail) : null;
      if (pnlPct === null) continue;

      positions.push({
        id: `engine-${run.run_at}-${idx++}`,
        stock_code: action.code,
        stock_name: action.name || null,
        entry_price: 0,
        entry_qty: 0,
        entry_date: run.run_at,
        entry_signal: null,
        signal_strength: null,
        exit_price: null,
        exit_date: run.run_at,
        exit_reason: action.type,
        pnl_amount: pnlPct * 1000, // 원화 미산출 — 부호 판별용
        pnl_percent: pnlPct,
        hold_days: null,
        status: "closed",
      });
    }
  }

  return positions;
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "all";

  let dateFilter: string | null = null;
  const now = new Date();
  if (period === "1w") dateFilter = new Date(now.getTime() - 7 * 86400000).toISOString();
  else if (period === "1m") dateFilter = new Date(now.getTime() - 30 * 86400000).toISOString();
  else if (period === "3m") dateFilter = new Date(now.getTime() - 90 * 86400000).toISOString();

  try {
    let posQuery = supabase.from("positions").select("*").order("entry_date", { ascending: false });
    if (dateFilter) posQuery = posQuery.gte("entry_date", dateFilter);

    const { data, error } = await posQuery;

    if (error && !(error.code === "42P01" || error.message?.includes("does not exist"))) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dbPositions: Position[] = (data || []).map((row: Record<string, unknown>) => ({
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

    // positions가 비어있으면 engine_runs에서 보완
    const enginePositions = dbPositions.length === 0
      ? await buildPositionsFromEngineRuns(dateFilter)
      : [];

    const positions = [...dbPositions, ...enginePositions];
    const stats = analyzePerformance(positions);

    return NextResponse.json({
      ...stats,
      positions: positions.slice(0, 50),
      dataSource: dbPositions.length > 0 ? "db" : enginePositions.length > 0 ? "engine_runs" : "empty",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "성과 조회 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
