import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";
import { analyzeSignal, checkRisk, type DailyCandle, type SignalResult } from "@/lib/kis/indicators";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface EngineConfig {
  appKey: string;
  appSecret: string;
  accountNo: string;
  token: string;
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
  maxPerTrade: number;
  maxDailyTrades: number;
  watchlist?: string[];
}

// ─── Supabase 포지션 관리 ────────────────────────
async function openPosition(code: string, name: string | null, price: number, qty: number, signal: SignalResult) {
  try {
    await supabase.from("positions").insert({
      stock_code: code,
      stock_name: name,
      entry_price: price,
      entry_qty: qty,
      entry_signal: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount },
      signal_strength: signal.strength,
      status: "open",
    });
  } catch { /* 테이블 미존재 시 무시 */ }
}

async function closePosition(code: string, exitPrice: number, exitQty: number, exitReason: string) {
  try {
    // open 포지션 찾기
    const { data } = await supabase
      .from("positions")
      .select("*")
      .eq("stock_code", code)
      .eq("status", "open")
      .order("entry_date", { ascending: true })
      .limit(1);

    if (!data || data.length === 0) return;
    const pos = data[0];

    const entryPrice = Number(pos.entry_price);
    const pnlAmount = (exitPrice - entryPrice) * exitQty;
    const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    const entryDate = new Date(pos.entry_date);
    const holdDays = Math.max(1, Math.ceil((Date.now() - entryDate.getTime()) / 86400000));

    await supabase.from("positions").update({
      exit_price: exitPrice,
      exit_qty: exitQty,
      exit_date: new Date().toISOString(),
      exit_reason: exitReason,
      pnl_amount: Math.round(pnlAmount),
      pnl_percent: Math.round(pnlPercent * 100) / 100,
      hold_days: holdDays,
      status: "closed",
    }).eq("id", pos.id);
  } catch { /* 테이블 미존재 시 무시 */ }
}

async function logEngineRun(tradeCount: number, actions: unknown[], scannedCount: number, durationMs: number, error?: string) {
  try {
    await supabase.from("engine_runs").insert({
      trade_count: tradeCount,
      actions,
      scanned_count: scannedCount,
      duration_ms: durationMs,
      error: error || null,
    });
  } catch { /* 테이블 미존재 시 무시 */ }
}

// ─── 코스피 급등주 탐색 ─────────────────────────
async function scanSurgeStocks(config: EngineConfig): Promise<string[]> {
  const codes = new Set<string>();

  try {
    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",
      fid_cond_scr_div_code: "20170",
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
      for (const item of (data.output || []).slice(0, 30)) {
        const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
        if (code && (Number(item.prdy_ctrt) || 0) >= 3) codes.add(code);
      }
    }
  } catch { /* ignore */ }

  try {
    const params = new URLSearchParams({
      fid_cond_mrkt_div_code: "J",
      fid_cond_scr_div_code: "20171",
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
      for (const item of (data.output || []).slice(0, 20)) {
        const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
        if (code) codes.add(code);
      }
    }
  } catch { /* ignore */ }

  return Array.from(codes);
}

// ─── KIS API 유틸 ───────────────────────────────
function headers(config: EngineConfig, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey,
    appsecret: config.appSecret,
    tr_id: trId,
  };
}

async function getPrice(config: EngineConfig, code: string) {
  const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, {
    headers: headers(config, KIS_TR.PRICE),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.output;
}

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
  })).reverse();
}

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

async function sellOrder(config: EngineConfig, code: string, qty: number) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: "POST",
    headers: headers(config, KIS_TR.SELL),
    body: JSON.stringify({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      PDNO: code, ORD_DVSN: "01",
      ORD_QTY: String(qty), ORD_UNPR: "0",
    }),
  });
  return res.json();
}

async function buyOrder(config: EngineConfig, code: string, qty: number) {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: "POST",
    headers: headers(config, KIS_TR.BUY),
    body: JSON.stringify({
      CANO: cano, ACNT_PRDT_CD: acntPrdtCd,
      PDNO: code, ORD_DVSN: "01",
      ORD_QTY: String(qty), ORD_UNPR: "0",
    }),
  });
  return res.json();
}

// ─── Cron GET ───────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const accountNo = process.env.KIS_ACCOUNT_NO;

  if (!appKey || !appSecret || !accountNo) {
    return NextResponse.json({ error: "KIS 환경변수 미설정" }, { status: 400 });
  }

  const tokenRes = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!tokenRes.ok) return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  const tokenData = await tokenRes.json();

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

// ─── 수동 POST ──────────────────────────────────
export async function POST(req: NextRequest) {
  const config: EngineConfig = await req.json();
  if (!config.token || !config.accountNo) {
    return NextResponse.json({ error: "KIS 설정 필요" }, { status: 400 });
  }
  return runEngine(config);
}

// ─── 엔진 본체 ──────────────────────────────────
async function runEngine(config: EngineConfig) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    const stopLoss = config.stopLoss ?? -5;
    const takeProfit = config.takeProfit ?? 5;
    const trailingStop = config.trailingStop ?? -3;
    const maxPerTrade = config.maxPerTrade ?? 1000000;
    const maxDailyTrades = config.maxDailyTrades ?? 5;

    const actions: Array<{ type: string; code: string; name?: string; detail: string }> = [];
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
      const highPrice = Number(h.stck_hgpr) || currentPrice;
      const name = h.prdt_name || code;

      const risk = checkRisk(avgPrice, currentPrice, highPrice, stopLoss, takeProfit, trailingStop);

      if (risk.action !== "hold") {
        const result = await sellOrder(config, code, qty);
        actions.push({
          type: risk.action, code, name,
          detail: `${risk.reason} → 매도 ${qty}주 (${result.msg1 || "주문완료"})`,
        });

        // 포지션 종료 기록
        await closePosition(code, currentPrice, qty, risk.action);

        tradeCount++;
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ═══ STEP 2: 관심종목 신호 분석 (매수) ═══
    const watchlist: string[] = config.watchlist ?? [];

    for (const code of watchlist) {
      if (tradeCount >= maxDailyTrades) break;
      if (holdings.some((h: Record<string, string>) => h.pdno === code && Number(h.hldg_qty) > 0)) continue;

      const candles = await getDailyCandles(config, code);
      scannedCount++;
      if (candles.length < 26) continue;

      const signal = analyzeSignal(candles);
      await new Promise((r) => setTimeout(r, 200));

      if (signal.strength === "strong" && signal.side === "buy") {
        const priceData = await getPrice(config, code);
        const price = Number(priceData?.stck_prpr) || 0;
        const name = priceData?.stck_shrn_iscd || code;
        if (price <= 0) continue;

        const qty = Math.floor(maxPerTrade / price);
        if (qty <= 0) continue;

        const result = await buyOrder(config, code, qty);
        actions.push({
          type: "auto_buy", code, name,
          detail: `강한 신호 ${signal.matchCount}/5 → 자동 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg1 || "주문완료"})`,
        });

        // 포지션 오픈 기록
        await openPosition(code, name, price, qty, signal);

        tradeCount++;
        await new Promise((r) => setTimeout(r, 200));

      } else if (signal.strength === "weak" && signal.side === "buy") {
        actions.push({
          type: "pending_approval", code,
          detail: `약한 신호 ${signal.matchCount}/5 → 승인 대기. ${signal.comment}`,
        });
      }
    }

    // ═══ STEP 3: 코스피 급등주 스캔 ═══
    if (tradeCount < maxDailyTrades) {
      const surgeStocks = await scanSurgeStocks(config);
      const holdingCodes = new Set(holdings.map((h: Record<string, string>) => h.pdno));
      const watchlistSet = new Set(watchlist);
      const candidates = surgeStocks.filter((c) => !holdingCodes.has(c) && !watchlistSet.has(c));

      for (const code of candidates) {
        if (tradeCount >= maxDailyTrades) break;

        const candles = await getDailyCandles(config, code);
        scannedCount++;
        if (candles.length < 26) continue;

        const signal = analyzeSignal(candles);
        await new Promise((r) => setTimeout(r, 200));

        if (signal.strength === "strong" && signal.side === "buy") {
          const priceData = await getPrice(config, code);
          const price = Number(priceData?.stck_prpr) || 0;
          const name = priceData?.stck_shrn_iscd || code;
          if (price <= 0) continue;

          const qty = Math.floor(maxPerTrade / price);
          if (qty <= 0) continue;

          const result = await buyOrder(config, code, qty);
          actions.push({
            type: "surge_buy", code, name,
            detail: `급등주 강한 신호 ${signal.matchCount}/5 → 자동 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg1 || "주문완료"})`,
          });

          await openPosition(code, name, price, qty, signal);

          tradeCount++;
          await new Promise((r) => setTimeout(r, 200));

        } else if (signal.strength === "weak" && signal.side === "buy") {
          actions.push({
            type: "surge_pending", code,
            detail: `급등주 약한 신호 ${signal.matchCount}/5 → 승인 대기. ${signal.comment}`,
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logEngineRun(tradeCount, actions, scannedCount, durationMs);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount,
      scannedCount,
      durationMs,
      actions,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    const durationMs = Date.now() - startTime;
    await logEngineRun(0, [], scannedCount, durationMs, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
