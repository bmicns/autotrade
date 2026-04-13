import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runLearning } from "@/lib/learning";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// GET /api/learn?history=N — 학습 결과 조회
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const historyN = parseInt(searchParams.get("history") ?? "0", 10);

    // 현재 활성 스냅샷 (만료 포함 최신)
    const { data: active } = await supabase
      .from("learning_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const now = new Date().toISOString();
    const isExpired = active
      ? !active.is_active || active.expires_at < now
      : true;

    let history = undefined;
    if (historyN > 0) {
      const { data: histData } = await supabase
        .from("learning_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(historyN);
      history = histData ?? [];
    }

    return NextResponse.json({
      snapshot: active ?? null,
      isExpired,
      ...(history !== undefined ? { history } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

// POST /api/learn — 학습 즉시 실행 (수동 트리거)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLearning();
    return NextResponse.json({
      success: true,
      confidence: result.confidence,
      sampleSize: result.sampleSize,
      weights_source: result.weights.source,
      atr_source: result.atrMultipliers.source,
      winRate: result.winRate,
      message: `학습 완료 (신뢰도: ${result.confidence}, 샘플 ${result.sampleSize}건)`,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "학습 실행 실패",
    }, { status: 500 });
  }
}
