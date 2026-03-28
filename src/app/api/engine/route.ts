import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";
import { analyzeSignal, checkRisk, type DailyCandle } from "@/lib/kis/indicators";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Vercel Cron에서 1분마다 호출
// 1. 보유종목 시세 감시 → 손절/익절/트레일링 체크
// 2. 관심종목 신호 분석 → 자동체결 or 승인 대기

interface EngineConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  token: string;
  stopLoss: number;      // 기본 -5
  takeProfit: number;    // 기본 +5
  trailingStop: number;  // 기본 -3
  maxPerTrade: number;   // 1회 한도 (원)
  maxDailyTrades: number; // 1일 최대 횟수
  watchlist?: string[];   // 관심종목 코드 리스트
}

// 코스피 급등주 탐색 (등락률 상위 + 거래량 급증)
async function scanSurgeStocks(config: EngineConfig): Promise<string[]> {
  const codes = new Set<string>();

  // 1. 등락률 상위 30종목 (코스피)
  try {
    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",     // 코스피
      fid_cond_scr_div_code: "20170",  // 등락률
      fid_input_iscd: "0001",          // 코스피 전체
      fid_rank_sort_cls_code: "0",     // 상승률 순
      fid_input_cnt_1: "0",            // 가격 하한 없음
      fid_input_cnt_2: "",             // 가격 상한 없음
      fid_div_cls_code: "0",
      fid_trgt_cls_code: "0",
      fid_trgt_exls_cls_code: "0",
      fid_input_price_1: "",
      fid_input_price_2: "",
      fid_vol_cnt: "",
      fid_input_date_1: "",
    });
    const res = await fetch(
      `${KIS_VTS_BASE}/uapi/domestic-stock/v1/ranking/fluctuation?${params}`,
      { headers: headers(config, "FHPST01700000") }
    );
    if (res.ok) {
      const data = await res.json();
      const items = data.output || [];
      for (const item of items.slice(0, 30)) {
        const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
        const rate = Number(item.prdy_ctrt) || 0;
        // 3% 이상 상승 + 거래대금 10억 이상
        if (code && rate >= 3) codes.add(code);
      }
    }
  } catch { /* 등락률 조회 실패 무시 */ }

  // 2. 거래량 급증 상위 20종목 (코스피)
  try {
    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",
      fid_cond_scr_div_code: "20171",  // 거래량
      fid_input_iscd: "0001",
      fid_rank_sort_cls_code: "0",
      fid_input_cnt_1: "0",
      fid_input_cnt_2: "",
      fid_div_cls_code: "0",
      fid_trgt_cls_code: "0",
      fid_trgt_exls_cls_code: "0",
      fid_input_price_1: "",
      fid_input_price_2: "",
      fid_vol_cnt: "",
      fid_input_date_1: "",
    });
    const res = await fetch(
      `${KIS_VTS_BASE}/uapi/domestic-stock/v1/ranking/fluctuation?${params}`,
      { headers: headers(config, "FHPST01700000") }
    );
    if (res.ok) {
      const data = await res.json();
      const items = data.output || [];
      for (const item of items.slice(0, 20)) {
        const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
        if (code) codes.add(code);
      }
    }
  } catch { /* 거래량 조회 실패 무시 */ }

  return Array.from(codes);
}

// KIS 헤더
function headers(config: EngineConfig, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey,
    appsecret: config.appSecret,
    tr_id: trId,
  };
}

// 현재가 조회
async function getPrice(config: EngineConfig, code: string) {
  const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, {
    headers: headers(config, KIS_TR.PRICE),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.output;
}

// 일별 시세 (지표 계산용)
async function getDailyCandles(config: EngineConfig, code: string): Promise<DailyCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J",
    fid_input_iscd: code,
    fid_input_date_1: "",
    fid_input_date_2: "",
    fid_period_div_code: "D",
    fid_org_adj_prc: "0",
  });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`, {
    headers: headers(config, "FHKST03010100"),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.output2 || []).map((d: Record<string, string>) => ({
    date: d.stck_bsop_date,
    close: Number(d.stck_clpr) || 0,
    open: Number(d.stck_oprc) || 0,
    high: Number(d.stck_hgpr) || 0,
    low: Number(d.stck_lwpr) || 0,
    volume: Number(d.acml_vol) || 0,
  })).reverse(); // 오래된 순으로 정렬
}

// 잔고 조회
async function getBalance(config: EngineConfig) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const params = new URLSearchParams({
    CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: "N", OFL_YN: "", INQR_DVSN: "02", UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N", FNCG_AMT_AUTO_RDPT_YN: "N", PRCS_DVSN: "00",
    CTX_AREA_FK100: "", CTX_AREA_NK100: "",
  });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params}`, {
    headers: headers(config, KIS_TR.BALANCE),
  });
  if (!res.ok) return null;
  return res.json();
}

// 매도 주문
async function sellOrder(config: EngineConfig, code: string, qty: number) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: "POST",
    headers: headers(config, KIS_TR.SELL),
    body: JSON.stringify({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      PDNO: code, ORD_DVSN: "01", // 시장가
      ORD_QTY: String(qty), ORD_UNPR: "0",
    }),
  });
  return res.json();
}

// 매수 주문
async function buyOrder(config: EngineConfig, code: string, qty: number) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: "POST",
    headers: headers(config, KIS_TR.BUY),
    body: JSON.stringify({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      PDNO: code, ORD_DVSN: "01", // 시장가
      ORD_QTY: String(qty), ORD_UNPR: "0",
    }),
  });
  return res.json();
}

// Vercel Cron은 GET으로 호출 — 환경변수에서 KIS 설정 읽기
export async function GET(req: NextRequest) {
  // Cron 보안: Vercel Cron에서만 호출 가능
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.CRON_SECRET) {
    // CRON_SECRET 미설정이면 허용 (개발 편의)
  } else if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const accountNo = process.env.KIS_ACCOUNT_NO;

  if (!appKey || !appSecret || !accountNo) {
    return NextResponse.json({ error: "KIS 환경변수 미설정" }, { status: 400 });
  }

  // 토큰 발급
  const tokenRes = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!tokenRes.ok) return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  const tokenData = await tokenRes.json();

  // Supabase에서 watchlist 조회
  const { data: watchlistData } = await supabase
    .from("watchlist")
    .select("code")
    .eq("active", true);
  const watchlist = (watchlistData || []).map((w: { code: string }) => w.code);

  const config: EngineConfig = {
    appKey, appSecret, accountNo, token: tokenData.access_token,
    stopLoss: -5, takeProfit: 5, trailingStop: -3,
    maxPerTrade: 1000000, maxDailyTrades: 5,
    watchlist,
  };

  return runEngine(config);
}

// 클라이언트에서 수동 실행 (POST)
export async function POST(req: NextRequest) {
  const config: EngineConfig = await req.json();
  if (!config.token || !config.accountNo) {
    return NextResponse.json({ error: "KIS 설정 필요" }, { status: 400 });
  }
  return runEngine(config);
}

async function runEngine(config: EngineConfig) {
  try {
    const stopLoss = config.stopLoss ?? -5;
    const takeProfit = config.takeProfit ?? 5;
    const trailingStop = config.trailingStop ?? -3;
    const maxPerTrade = config.maxPerTrade ?? 1000000;
    const maxDailyTrades = config.maxDailyTrades ?? 5;

    const actions: Array<{ type: string; code: string; detail: string }> = [];
    let tradeCount = 0;

    // ═══ STEP 1: 보유종목 손절/익절 감시 ═══
    const balanceData = await getBalance(config);
    const holdings = balanceData?.output1 || [];

    for (const h of holdings) {
      const code = h.pdno;
      const qty = Number(h.hldg_qty) || 0;
      if (qty <= 0) continue;

      const avgPrice = Number(h.pchs_avg_pric) || 0;
      const currentPrice = Number(h.prpr) || 0;
      const highPrice = Number(h.stck_hgpr) || currentPrice; // 당일 고가를 고점으로 사용

      const risk = checkRisk(avgPrice, currentPrice, highPrice, stopLoss, takeProfit, trailingStop);

      if (risk.action !== "hold") {
        // 자동 매도 실행
        const result = await sellOrder(config, code, qty);
        actions.push({
          type: risk.action,
          code,
          detail: `${risk.reason} → 매도 ${qty}주 (${result.msg1 || "주문완료"})`,
        });
        tradeCount++;
        await new Promise((r) => setTimeout(r, 200)); // API 제한 방지
      }
    }

    // ═══ STEP 2: 관심종목 신호 분석 (매수) ═══
    // 관심종목: 요청 body에서 받거나 비어있으면 스킵
    const watchlist: string[] = config.watchlist ?? [];

    for (const code of watchlist) {
      if (tradeCount >= maxDailyTrades) break;

      // 이미 보유중이면 스킵
      if (holdings.some((h: Record<string, string>) => h.pdno === code && Number(h.hldg_qty) > 0)) continue;

      const candles = await getDailyCandles(config, code);
      if (candles.length < 26) continue;

      const signal = analyzeSignal(candles);
      await new Promise((r) => setTimeout(r, 200)); // API 제한 방지

      if (signal.strength === "strong" && signal.side === "buy") {
        // 강한 매수 신호 → 자동 체결
        const priceData = await getPrice(config, code);
        const price = Number(priceData?.stck_prpr) || 0;
        if (price <= 0) continue;

        const qty = Math.floor(maxPerTrade / price);
        if (qty <= 0) continue;

        const result = await buyOrder(config, code, qty);
        actions.push({
          type: "auto_buy",
          code,
          detail: `강한 신호 ${signal.matchCount}/5 → 자동 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg1 || "주문완료"})`,
        });
        tradeCount++;
        await new Promise((r) => setTimeout(r, 200));

      } else if (signal.strength === "weak" && signal.side === "buy") {
        // 약한 매수 신호 → 승인 대기 (Supabase signals 테이블에 저장)
        actions.push({
          type: "pending_approval",
          code,
          detail: `약한 신호 ${signal.matchCount}/5 → 승인 대기. ${signal.comment}`,
        });
      }
    }

    // ═══ STEP 3: 코스피 급등주 스캔 (등락률+거래량 상위) ═══
    if (tradeCount < maxDailyTrades) {
      const surgeStocks = await scanSurgeStocks(config);
      // watchlist와 보유종목 제외
      const holdingCodes = new Set(holdings.map((h: Record<string, string>) => h.pdno));
      const watchlistSet = new Set(watchlist);
      const candidates = surgeStocks.filter((c) => !holdingCodes.has(c) && !watchlistSet.has(c));

      for (const code of candidates) {
        if (tradeCount >= maxDailyTrades) break;

        const candles = await getDailyCandles(config, code);
        if (candles.length < 26) continue;

        const signal = analyzeSignal(candles);
        await new Promise((r) => setTimeout(r, 200));

        if (signal.strength === "strong" && signal.side === "buy") {
          const priceData = await getPrice(config, code);
          const price = Number(priceData?.stck_prpr) || 0;
          if (price <= 0) continue;

          const qty = Math.floor(maxPerTrade / price);
          if (qty <= 0) continue;

          const result = await buyOrder(config, code, qty);
          actions.push({
            type: "surge_buy",
            code,
            detail: `급등주 강한 신호 ${signal.matchCount}/5 → 자동 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg1 || "주문완료"})`,
          });
          tradeCount++;
          await new Promise((r) => setTimeout(r, 200));

        } else if (signal.strength === "weak" && signal.side === "buy") {
          actions.push({
            type: "surge_pending",
            code,
            detail: `급등주 약한 신호 ${signal.matchCount}/5 → 승인 대기. ${signal.comment}`,
          });
        }
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount,
      surgeScanned: true,
      actions,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
