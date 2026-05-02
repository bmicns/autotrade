import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextResponse } from "next/server";


export interface StockStat {
  stock_code: string;
  stock_name: string;
  trade_count: number;
  win_count: number;
  win_rate: number;        // 0~100
  avg_pnl: number;         // 평균 손익 %
  total_pnl: number;       // 총 손익 원
  fitness_score: number;   // 0~100
  fitness_label: "good" | "neutral" | "poor";
  last_trade: string;      // ISO 날짜
}

// GET /api/stats/stocks — 종목별 성과 집계
export async function GET() {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const { data, error } = await supabase
      .from("trade_memory")
      .select("stock_code, stock_name, is_win, pnl_percent, pnl_amount, closed_at")
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ stocks: [] });
    }

    // stock_code별 집계
    const statMap = new Map<string, {
      stock_name: string;
      trades: Array<{ is_win: boolean; pnl_percent: number; pnl_amount: number }>;
      last_trade: string;
    }>();

    for (const row of data) {
      const key = row.stock_code;
      if (!statMap.has(key)) {
        statMap.set(key, {
          stock_name: row.stock_name ?? key,
          trades: [],
          last_trade: row.closed_at ?? "",
        });
      }
      const entry = statMap.get(key)!;
      entry.trades.push({
        is_win: row.is_win === true,
        pnl_percent: Number(row.pnl_percent ?? 0),
        pnl_amount: Number(row.pnl_amount ?? 0),
      });
      // 최신 거래일 유지
      if (row.closed_at && row.closed_at > entry.last_trade) {
        entry.last_trade = row.closed_at;
      }
    }

    const stocks: StockStat[] = [];

    for (const [code, entry] of statMap.entries()) {
      const { trades, stock_name, last_trade } = entry;
      const trade_count = trades.length;
      const wins = trades.filter((t) => t.is_win);
      const losses = trades.filter((t) => !t.is_win);
      const win_count = wins.length;
      const win_rate = trade_count > 0 ? Math.round((win_count / trade_count) * 100) : 0;
      const avg_pnl = trade_count > 0
        ? Math.round(trades.reduce((s, t) => s + t.pnl_percent, 0) / trade_count * 100) / 100
        : 0;
      const total_pnl = Math.round(trades.reduce((s, t) => s + t.pnl_amount, 0));

      // fitness_score 계산
      let fitness_score = 50;
      let fitness_label: "good" | "neutral" | "poor" = "neutral";

      if (trade_count >= 5) {
        const avgWin = wins.length > 0
          ? wins.reduce((s, t) => s + t.pnl_percent, 0) / wins.length
          : 0;
        const avgLoss = losses.length > 0
          ? Math.abs(losses.reduce((s, t) => s + t.pnl_percent, 0) / losses.length)
          : 1; // 0 나누기 방지

        const profitFactorScore = Math.min((avgWin / avgLoss) / 3 * 100, 100);
        const sampleAdequacy = Math.min(trade_count / 10, 1) * 100;
        fitness_score = Math.round(
          (win_rate * 0.5) + (profitFactorScore * 0.3) + (sampleAdequacy * 0.2)
        );

        fitness_label = fitness_score >= 60 ? "good" : fitness_score >= 30 ? "neutral" : "poor";
      }

      stocks.push({
        stock_code: code,
        stock_name,
        trade_count,
        win_count,
        win_rate,
        avg_pnl,
        total_pnl,
        fitness_score,
        fitness_label,
        last_trade,
      });
    }

    // fitness_score 내림차순 정렬
    stocks.sort((a, b) => b.fitness_score - a.fitness_score);

    return NextResponse.json({ stocks });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "조회 실패" },
      { status: 500 }
    );
  }
}
