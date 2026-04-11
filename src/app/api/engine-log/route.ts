import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET() {
  try {
    // 최근 엔진 실행 5건에서 market_context + filter 로그 추출
    const { data, error } = await supabase
      .from("engine_runs")
      .select("id, created_at, actions")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // market_context: 가장 최근 엔진 실행의 시장 모멘텀
    let marketContext: {
      kospi_rate: number;
      kosdaq_rate: number;
      avg_rate: number;
      bonus: number;
      label: string;
    } | null = null;

    // filter logs: 최근 5회 실행의 필터 탈락 종목
    const filterLogs: Array<{
      stock_code: string;
      stock_name?: string;
      action_type: string;
      reason: string;
      run_at: string;
    }> = [];

    for (const run of data || []) {
      const actions: Array<Record<string, unknown>> = Array.isArray(run.actions) ? run.actions : [];

      // market_context: 첫 번째 실행에서만 추출
      if (!marketContext) {
        const mc = actions.find((a) => a.action_type === "market_context");
        if (mc) {
          marketContext = {
            kospi_rate: Number(mc.kospi_rate ?? 0),
            kosdaq_rate: Number(mc.kosdaq_rate ?? 0),
            avg_rate: Number(mc.avg_rate ?? 0),
            bonus: Number(mc.bonus ?? 0),
            label: String(mc.label ?? ""),
          };
        }
      }

      // filtered_out + dart_filtered 수집
      for (const a of actions) {
        if (a.action_type === "filtered_out" || a.action_type === "dart_filtered") {
          filterLogs.push({
            stock_code: String(a.stock_code ?? ""),
            stock_name: a.stock_name ? String(a.stock_name) : undefined,
            action_type: String(a.action_type),
            reason: String(a.reason ?? ""),
            run_at: String(run.created_at ?? ""),
          });
        }
      }
    }

    return NextResponse.json({ marketContext, filterLogs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
