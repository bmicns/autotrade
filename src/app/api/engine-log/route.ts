import { supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;

    const [runsResult, filterResult] = await Promise.all([
      supabase
        .from("engine_runs")
        .select("id, run_at, trade_count, scanned_count, duration_ms, error, actions", { count: "exact" })
        .order("run_at", { ascending: false })
        .range(offset, offset + limit - 1),
      // 최근 5회 실행에서 signal_skip / dart_filtered 액션 파싱
      supabase
        .from("engine_runs")
        .select("run_at, actions")
        .order("run_at", { ascending: false })
        .limit(5),
    ]);

    if (runsResult.error) return NextResponse.json({ error: runsResult.error.message }, { status: 500 });

    type Action = { type: string; code?: string; name?: string; detail?: string };
    const filterLogs: { stock_code: string; stock_name?: string; action_type: string; reason: string; run_at: string }[] = [];

    for (const run of filterResult.data ?? []) {
      for (const action of (run.actions as Action[]) ?? []) {
        if (action.type === "signal_skip" || action.type === "dart_filtered") {
          filterLogs.push({
            stock_code: action.code ?? "",
            stock_name: action.name,
            action_type: action.type,
            reason: action.detail ?? "",
            run_at: run.run_at,
          });
        }
      }
    }

    // 홈 탭용 marketContext (첫 번째 실행에서 추출)
    const latestRun = (runsResult.data ?? [])[0];
    const marketContext = latestRun
      ? ((latestRun.actions as Action[]) ?? []).find((a) => a.type === "market_context") ?? null
      : null;

    return NextResponse.json({
      runs: runsResult.data ?? [],
      total: runsResult.count ?? 0,
      page,
      limit,
      hasMore: (runsResult.count ?? 0) > offset + limit,
      filterLogs,
      marketContext,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
