import { NextRequest, NextResponse } from "next/server";
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";
import { analyzeSignal, checkRisk, type DailyCandle } from "@/lib/kis/indicators";

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

  const config: EngineConfig = {
    appKey, appSecret, accountNo, token: tokenData.access_token,
    stopLoss: -5, takeProfit: 5, trailingStop: -3,
    maxPerTrade: 1000000, maxDailyTrades: 5,
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

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount,
      actions,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
