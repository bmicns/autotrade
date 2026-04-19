import { NextRequest, NextResponse } from "next/server";
import { loadLatestLearning, applyLearning } from "@/lib/learning";
import { KIS_VTS_BASE } from "@/lib/constants";
import { type EngineConfig, type StepContext } from "@/lib/engine/types";
import { logEngineRun } from "@/lib/engine/db";
import { supabase } from "@/lib/supabase/api-client";
import { runStep0, runStep1, runStep15, runStep2, runStep3 } from "@/lib/engine/steps";

// ─── Cron GET ───────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 500 });
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const accountNo = process.env.KIS_ACCOUNT_NO;
  if (!appKey || !appSecret || !accountNo) {
    return NextResponse.json({ error: "KIS 환경변수 미설정" }, { status: 400 });
  }

  const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();
  const kstMin = new Date(Date.now() + 9 * 3600000).getUTCMinutes();
  const kstTime = kstHour * 100 + kstMin;
  const inSession = (kstTime >= 930 && kstTime <= 1150) || (kstTime >= 1250 && kstTime <= 1510);
  if (!inSession) {
    await logEngineRun(0, [{ type: "skipped", code: "", detail: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` }], 0, 0);
    return NextResponse.json({ skipped: true, reason: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` });
  }

  const cleanAppKey = appKey.replace(/\\n|\n/g, "").trim();
  const cleanAppSecret = appSecret.replace(/\\n|\n/g, "").trim();
  const cleanAccountNo = accountNo.replace(/\\n|\n/g, "").trim();

  const tokenRes = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: cleanAppKey, appsecret: cleanAppSecret }),
  });
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text().catch(() => "");
    await logEngineRun(0, [{ type: "token_error", code: "", detail: `KIS 토큰 발급 실패: ${tokenRes.status} ${errBody.slice(0, 200)}` }], 0, 0, "토큰 발급 실패");
    return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  }
  const tokenData = await tokenRes.json();

  const { data: watchlistData } = await supabase.from("watchlist").select("code").eq("active", true);
  const watchlist = (watchlistData || []).map((w: { code: string }) => w.code);

  const config: EngineConfig = {
    appKey: cleanAppKey, appSecret: cleanAppSecret, accountNo: cleanAccountNo, token: tokenData.access_token,
    stopLoss: -5, takeProfit: 5, trailingStop: -3,
    maxPerTrade: 1000000, maxDailyTrades: 5,
    takeProfitRatio: 50,
    dailyLossLimit: -3,
    dynamicRisk: true,
    maxHoldDays: 5,
    watchlist,
  };

  return runEngine(config);
}

// ─── 엔진 오케스트레이터 ─────────────────────────
async function runEngine(config: EngineConfig) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    // app_config 일괄 조회 (비상 정지 + 최대 포지션 수)
    const { data: appConfigs } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigs || []).map((r: { key: string; value: unknown }) => [r.key, r.value]));

    if (cfgMap.get("engine_enabled") === false || cfgMap.get("engine_enabled") === "false") {
      await logEngineRun(0, [{ type: "skipped", code: "", detail: "비상 정지 활성" }], 0, 0);
      return NextResponse.json({ skipped: true, reason: "비상 정지 활성" });
    }

    const maxPositions = Number(cfgMap.get("max_positions") ?? 5) || 5;
    const maxPerSector = Number(cfgMap.get("max_per_sector") ?? 2);

    let learning = null;
    try { learning = await loadLatestLearning(); } catch { /* 학습 로딩 실패 시 기본값 사용 */ }
    const applied = applyLearning(learning, config);

    const ctx: StepContext = {
      config, applied,
      maxPerTrade: config.maxPerTrade ?? 1000000,
      maxDailyTrades: config.maxDailyTrades ?? 5,
      maxPositions,
      maxPerSector,
      takeProfitRatio: applied.takeProfitRatio,
      dailyLossLimit: config.dailyLossLimit ?? -3,
      customWeights: applied.weights,
    };

    // STEP 0: 미체결 취소 + 시장 모멘텀 + 일일 손실 체크
    const step0 = await runStep0(ctx);
    if (step0.halted) {
      const durationMs = Date.now() - startTime;
      await logEngineRun(0, step0.actions, 0, durationMs);
      return NextResponse.json({ timestamp: new Date().toISOString(), tradeCount: 0, halted: true, reason: step0.haltReason });
    }

    // STEP 1: 보유종목 손절/익절/기간초과
    const step1 = await runStep1(ctx, step0.marketTrend);
    let tradeCount = step1.tradeCount;

    // STEP 1.5: 승인된 신호 매수
    const step15 = await runStep15(ctx, step1.holdings, tradeCount);
    tradeCount = step15.tradeCount;

    // 장 초반 스냅샷 로딩
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const { data: snapshots } = await supabase.from("market_snapshots").select("*").eq("date", today);
    const snapshotMap = new Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.stock_code, { open_price: Number(s.open_price), snapshot_price: Number(s.snapshot_price), snapshot_volume: Number(s.snapshot_volume) });
    }

    // STEP 2: 관심종목 신호 분석
    const step2 = await runStep2(ctx, step1.holdings, step0.marketTrend, snapshotMap, tradeCount);
    tradeCount = step2.tradeCount;
    scannedCount += step2.scannedCount;

    // STEP 3: 급등주 스캔
    const step3 = await runStep3(ctx, step1.holdings, step0.marketTrend, tradeCount);
    tradeCount = step3.tradeCount;
    scannedCount += step3.scannedCount;

    const allActions = [...step0.actions, ...step1.actions, ...step15.actions, ...step2.actions, ...step3.actions];
    const durationMs = Date.now() - startTime;
    await logEngineRun(tradeCount, allActions, scannedCount, durationMs);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount, scannedCount, durationMs, actions: allActions,
      learning: learning ? {
        confidence: learning.confidence,
        sampleSize: learning.sampleSize,
        weightsSource: applied.weights ? "learned" : "default",
        atrSource: learning.atrMultipliers.source,
        applied: {
          takeProfitRatio: applied.takeProfitRatio,
          targetRiskAmount: applied.targetRiskAmount,
          atrMultipliers: applied.atrMultipliers,
        },
      } : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    const durationMs = Date.now() - startTime;
    await logEngineRun(0, [], scannedCount, durationMs, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
