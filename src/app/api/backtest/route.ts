import { supabase } from "@/lib/supabase/api-client";
import { NextRequest, NextResponse } from "next/server";
import { KIS_VTS_BASE } from "@/lib/constants";
import { runBacktest } from "@/lib/backtest";
import type { DailyCandle } from "@/lib/kis/indicators";


export const maxDuration = 30;

/**
 * POST /api/backtest
 * KIS 일별시세로 과거 데이터를 가져와 백테스트 실행
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      stockCode,
      stockName,
      stopLoss = -5,
      takeProfit = 5,
      trailingStop = -3,
      maxPerTrade = 1000000,
    } = body;

    if (!stockCode) {
      return NextResponse.json({ error: "종목코드 필수" }, { status: 400 });
    }

    // KIS 인증 정보
    const { data: kisConfig } = await supabase.from("kis_config").select("*").limit(1).single();
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
      takeProfit,
      trailingStop,
      maxPerTrade,
    });

    return NextResponse.json(result);
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
    `${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
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
