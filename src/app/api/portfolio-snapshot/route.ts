import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { apiCacheHeaders } from "@/lib/http-cache";

/*
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL UNIQUE,
  total_eval bigint NOT NULL,
  total_pnl bigint NOT NULL DEFAULT 0,
  cash_balance bigint NOT NULL DEFAULT 0,
  open_positions integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
*/

export interface PortfolioSnapshot {
  id: string;
  date: string;
  total_eval: number;
  total_pnl: number;
  cash_balance: number;
  open_positions: number;
  created_at: string;
}

// POST /api/portfolio-snapshot — 오늘 날짜 스냅샷 upsert
export async function POST(req: NextRequest) {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.realtime });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효하지 않습니다" }, { status: 400, headers: apiCacheHeaders.realtime });
  }

  const { total_eval, total_pnl, cash_balance, open_positions } = body as {
    total_eval?: unknown;
    total_pnl?: unknown;
    cash_balance?: unknown;
    open_positions?: unknown;
  };

  // 서버 검증
  const evalNum = Number(total_eval);
  if (!Number.isFinite(evalNum) || evalNum <= 0) {
    return NextResponse.json(
      { error: "total_eval은 0보다 큰 정수여야 합니다" },
      { status: 422, headers: apiCacheHeaders.realtime },
    );
  }

  const pnlNum  = Number(total_pnl  ?? 0);
  const cashNum = Number(cash_balance ?? 0);
  const posNum  = Number(open_positions ?? 0);

  if (!Number.isFinite(pnlNum) || !Number.isFinite(cashNum) || !Number.isFinite(posNum)) {
    return NextResponse.json(
      { error: "숫자 필드에 유효하지 않은 값이 포함되어 있습니다" },
      { status: 422, headers: apiCacheHeaders.realtime },
    );
  }

  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .upsert(
      {
        date: today,
        total_eval: Math.round(evalNum),
        total_pnl:  Math.round(pnlNum),
        cash_balance: Math.round(cashNum),
        open_positions: Math.round(posNum),
      },
      { onConflict: "date" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: apiCacheHeaders.realtime });
  }

  return NextResponse.json({ snapshot: data }, { status: 200, headers: apiCacheHeaders.realtime });
}

// GET /api/portfolio-snapshot — 최근 30일 스냅샷 조회
export async function GET() {
  const supabaseError = getSupabaseConfigError();
  if (supabaseError) {
    return NextResponse.json({ error: supabaseError }, { status: 503, headers: apiCacheHeaders.short });
  }

  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("id, date, total_eval, total_pnl, cash_balance, open_positions, created_at")
    .order("date", { ascending: true })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: apiCacheHeaders.short });
  }

  return NextResponse.json({ snapshots: data ?? [] }, { headers: apiCacheHeaders.short });
}
