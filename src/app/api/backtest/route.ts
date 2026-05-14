import { getSupabaseConfigError, supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { KIS_API_BASE } from "@/lib/constants";
import { readEngineControlSnapshot } from "@/lib/engine/control";
import { runBacktest } from "@/lib/backtest";
import type { DailyCandle } from "@/lib/kis/indicators";


export const maxDuration = 30;

/**
 * POST /api/backtest
 * KIS 일별시세로 과거 데이터를 가져와 백테스트 실행
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseError = getSupabaseConfigError();
    if (supabaseError) return NextResponse.json({ error: supabaseError }, { status: 503 });

    const body = await req.json();
    const { data: appConfigRows } = await supabase.from("app_config").select("key, value");
    const cfgMap = new Map((appConfigRows ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]));
    const control = readEngineControlSnapshot(cfgMap);
    const {
      stockCode,
      stockName,
      stopLoss = -Math.abs(control.stop_loss),
      trailingStop = -Math.abs(control.trailing_stop),
      partialExitRatio = control.partial_exit_ratio,
      maxHoldDays = control.max_hold_days,
      maxPerTrade = 1000000,
      buyFeeRate = 0.00015,
      sellFeeRate = 0.00015,
      sellTaxRate = 0.0018,
      buySlippageRate = 0.0005,
      sellSlippageRate = 0.0005,
    } = body;

    if (!stockCode) {
      return NextResponse.json({ error: "종목코드 필수" }, { status: 400 });
    }

    // KIS 인증 정보
    const { data: kisConfig } = await supabase.from("kis_config").select("*").limit(1).maybeSingle();
    if (!kisConfig?.token) {
      return NextResponse.json({ error: "KIS 연결이 필요합니다" }, { status: 400 });
    }

    // 일별 시세 조회 (최대 100일)
    const candles = await fetchDailyCandles(
      stockCode,
      kisConfig.app_key,
      kisConfig.app_secret,
      kisConfig.token,
    );

    if (candles.length < 30) {
      return NextResponse.json({ error: `데이터 부족: ${candles.length}일 (최소 30일 필요)` }, { status: 400 });
    }

    const result = runBacktest({
      stockCode,
      stockName: stockName ?? stockCode,
      candles,
      initialCash: maxPerTrade,
      stopLoss,
      trailingStop,
      partialExitRatio,
      maxHoldDays,
      maxPerTrade,
      buyFeeRate,
      sellFeeRate,
      sellTaxRate,
      buySlippageRate,
      sellSlippageRate,
    });

    // 실전 성과 비교 — 백테스트와 동일 기간의 trade_memory 데이터
    const periodStart = candles[0]?.date ?? "";
    const periodEnd = candles[candles.length - 1]?.date ?? "";
    let liveComparison = null;
    if (periodStart && periodEnd) {
      const { data: liveTrades } = await supabase
        .from("trade_memory")
        .select("pnl_amount, pnl_percent, entry_date, closed_at, exit_reason, is_win")
        .eq("stock_code", stockCode)
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd)
        .not("closed_at", "is", null);

      if (liveTrades && liveTrades.length > 0) {
        const wins = liveTrades.filter((p) => (Number(p.pnl_amount) || 0) > 0);
        const totalPnl = liveTrades.reduce((s, p) => s + (Number(p.pnl_amount) || 0), 0);
        const avgWinPnl = wins.length > 0 ? wins.reduce((s, p) => s + (Number(p.pnl_amount) || 0), 0) / wins.length : 0;
        const losses = liveTrades.filter((p) => (Number(p.pnl_amount) || 0) <= 0);
        const avgLossPnl = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + (Number(p.pnl_amount) || 0), 0) / losses.length) : 0;
        liveComparison = {
          period: `${periodStart} ~ ${periodEnd}`,
          totalTrades: liveTrades.length,
          closedTrades: liveTrades.length,
          winRate: liveTrades.length > 0 ? Math.round((wins.length / liveTrades.length) * 1000) / 10 : 0,
          profitFactor: avgLossPnl > 0 ? Math.round((avgWinPnl / avgLossPnl) * 100) / 100 : null,
          totalPnl: Math.round(totalPnl),
          totalReturn: maxPerTrade > 0 ? Math.round((totalPnl / maxPerTrade) * 10000) / 100 : 0,
        };
      }
    }

    return NextResponse.json({ ...result, liveComparison });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "백테스트 실행 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** KIS 일별 시세 조회 — 최근 100거래일 */
async function fetchDailyCandles(
  code: string,
  appKey: string,
  appSecret: string,
  token: string,
): Promise<DailyCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J",
    fid_input_iscd: code,
    fid_input_date_1: "",
    fid_input_date_2: "",
    fid_period_div_code: "D",
    fid_org_adj_prc: "0",
  });

  const res = await fetch(
    `${KIS_API_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST03010100",
      },
    },
  );

  if (!res.ok) throw new Error(`KIS daily price: ${res.status}`);

  const data = await res.json();
  const output = data.output2 ?? [];

  const candles: DailyCandle[] = output
    .filter((d: Record<string, string>) => d.stck_bsop_date && Number(d.stck_clpr) > 0)
    .map((d: Record<string, string>) => ({
      date: `${d.stck_bsop_date.slice(0, 4)}-${d.stck_bsop_date.slice(4, 6)}-${d.stck_bsop_date.slice(6, 8)}`,
      open: Number(d.stck_oprc) || 0,
      high: Number(d.stck_hgpr) || 0,
      low: Number(d.stck_lwpr) || 0,
      close: Number(d.stck_clpr) || 0,
      volume: Number(d.acml_vol) || 0,
    }))
    .reverse(); // KIS는 최신→과거 순이므로 뒤집기

  return candles;
}
