import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { KIS_VTS_BASE, KIS_TR } from "@/lib/constants";
import { analyzeSignal, analyzeSignalWithWeights, calcATR, calcDynamicRisk, checkRisk, type DailyCandle, type SignalResult } from "@/lib/kis/indicators";
import { runLearning, type LearningResult } from "@/lib/learning";

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
  takeProfitRatio: number;   // #1 익절 시 매도 비율 (0~100%)
  dailyLossLimit: number;    // #5 일일 최대 손실 한도 (%)
  dynamicRisk: boolean;      // #2 ATR 동적 손절 사용 여부
  watchlist?: string[];
}

// ─── Supabase 포지션 관리 ────────────────────────
async function openPosition(code: string, name: string | null, price: number, qty: number, signal: SignalResult, phase: "initial" | "full") {
  try {
    await supabase.from("positions").insert({
      stock_code: code, stock_name: name,
      entry_price: price, entry_qty: qty,
      entry_signal: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount, totalScore: signal.totalScore },
      signal_strength: signal.strength,
      phase, status: "open",
    });
  } catch { /* ignore */ }
}

async function closePosition(code: string, exitPrice: number, exitQty: number, exitReason: string) {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open")
      .order("entry_date", { ascending: true }).limit(1);
    if (!data || data.length === 0) return;
    const pos = data[0];
    const entryPrice = Number(pos.entry_price);
    const pnlAmount = (exitPrice - entryPrice) * exitQty;
    const pnlPercent = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    const holdDays = Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000));

    await supabase.from("positions").update({
      exit_price: exitPrice, exit_qty: exitQty,
      exit_date: new Date().toISOString(), exit_reason: exitReason,
      pnl_amount: Math.round(pnlAmount),
      pnl_percent: Math.round(pnlPercent * 100) / 100,
      hold_days: holdDays, status: "closed",
    }).eq("id", pos.id);
  } catch { /* ignore */ }
}

async function getOpenPosition(code: string) {
  try {
    const { data } = await supabase.from("positions").select("*")
      .eq("stock_code", code).eq("status", "open").limit(1);
    return data?.[0] || null;
  } catch { return null; }
}

// #5 일일 실현 손실 합산
async function getTodayRealizedLoss(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("positions").select("pnl_percent")
      .eq("status", "closed").gte("exit_date", today);
    if (!data) return 0;
    return data.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0);
  } catch { return 0; }
}

async function logEngineRun(tradeCount: number, actions: unknown[], scannedCount: number, durationMs: number, error?: string) {
  try {
    await supabase.from("engine_runs").insert({
      trade_count: tradeCount, actions, scanned_count: scannedCount,
      duration_ms: durationMs, error: error || null,
    });
  } catch { /* ignore */ }
}

// ─── #6 급등주 탐색 (KOSPI + KOSDAQ) ────────────
async function scanSurgeStocks(config: EngineConfig): Promise<string[]> {
  const codes = new Set<string>();
  const markets = ["J", "Q"]; // J=KOSPI, Q=KOSDAQ (#6)

  for (const mkt of markets) {
    // 등락률 상위
    try {
      const params = new URLSearchParams({
        fid_cond_mrkt_div_code: mkt, fid_cond_scr_div_code: "20170",
        fid_input_iscd: mkt === "J" ? "0001" : "1001",
        fid_rank_sort_cls_code: "0", fid_input_cnt_1: "0", fid_input_cnt_2: "",
        fid_div_cls_code: "0", fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0",
        fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "", fid_input_date_1: "",
      });
      const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/ranking/fluctuation?${params}`, {
        headers: headers(config, "FHPST01700000"),
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.output || []).slice(0, 20)) {
          const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
          if (code && (Number(item.prdy_ctrt) || 0) >= 3) codes.add(code);
        }
      }
    } catch { /* ignore */ }

    // 거래량 상위
    try {
      const params = new URLSearchParams({
        fid_cond_mrkt_div_code: mkt, fid_cond_scr_div_code: "20171",
        fid_input_iscd: mkt === "J" ? "0001" : "1001",
        fid_rank_sort_cls_code: "0", fid_input_cnt_1: "0", fid_input_cnt_2: "",
        fid_div_cls_code: "0", fid_trgt_cls_code: "0", fid_trgt_exls_cls_code: "0",
        fid_input_price_1: "", fid_input_price_2: "", fid_vol_cnt: "", fid_input_date_1: "",
      });
      const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/ranking/fluctuation?${params}`, {
        headers: headers(config, "FHPST01700000"),
      });
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.output || []).slice(0, 15)) {
          const code = item.stck_shrn_iscd || item.mksc_shrn_iscd;
          if (code) codes.add(code);
        }
      }
    } catch { /* ignore */ }

    await new Promise((r) => setTimeout(r, 200));
  }

  return Array.from(codes);
}

// ─── KIS API 유틸 ───────────────────────────────
function headers(config: EngineConfig, trId: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    authorization: `Bearer ${config.token}`,
    appkey: config.appKey, appsecret: config.appSecret, tr_id: trId,
  };
}

async function getPrice(config: EngineConfig, code: string) {
  const params = new URLSearchParams({ fid_cond_mrkt_div_code: "J", fid_input_iscd: code });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`, {
    headers: headers(config, KIS_TR.PRICE),
  });
  if (!res.ok) return null;
  return (await res.json()).output;
}

async function getDailyCandles(config: EngineConfig, code: string): Promise<DailyCandle[]> {
  const params = new URLSearchParams({
    fid_cond_mrkt_div_code: "J", fid_input_iscd: code,
    fid_input_date_1: "", fid_input_date_2: "",
    fid_period_div_code: "D", fid_org_adj_prc: "0",
  });
  const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`, {
    headers: headers(config, "FHKST03010100"),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.output2 || []).map((d: Record<string, string>) => ({
    date: d.stck_bsop_date, close: Number(d.stck_clpr) || 0,
    open: Number(d.stck_oprc) || 0, high: Number(d.stck_hgpr) || 0,
    low: Number(d.stck_lwpr) || 0, volume: Number(d.acml_vol) || 0,
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

interface OrderResult {
  success: boolean;
  msg: string;
  ordNo?: string;
  raw?: Record<string, unknown>;
}

async function executeOrder(config: EngineConfig, trId: string, code: string, qty: number, side: "buy" | "sell"): Promise<OrderResult> {
  const [cano, acntPrdtCd] = [config.accountNo.slice(0, 8), config.accountNo.slice(8, 10) || "01"];
  try {
    const res = await fetch(`${KIS_VTS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
      method: "POST", headers: headers(config, trId),
      body: JSON.stringify({ CANO: cano, ACNT_PRDT_CD: acntPrdtCd, PDNO: code, ORD_DVSN: "01", ORD_QTY: String(qty), ORD_UNPR: "0" }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "응답 없음");
      return { success: false, msg: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const data = await res.json();
    const rtCd = data.rt_cd;  // "0" = 성공
    const msg = data.msg1 || data.msg || "응답 없음";

    if (rtCd === "0") {
      return { success: true, msg, ordNo: data.output?.ODNO, raw: data };
    }
    return { success: false, msg: `[${rtCd}] ${msg}`, raw: data };
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "네트워크 오류";
    return { success: false, msg: errMsg };
  }
}

async function sellOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.SELL, code, qty, "sell");
}

async function buyOrder(config: EngineConfig, code: string, qty: number): Promise<OrderResult> {
  return executeOrder(config, KIS_TR.BUY, code, qty, "buy");
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

  // #3 세션 시간 체크 (KST 기준)
  const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();
  const kstMin = new Date(Date.now() + 9 * 3600000).getUTCMinutes();
  const kstTime = kstHour * 100 + kstMin;
  const inSession = (kstTime >= 930 && kstTime <= 1150) || (kstTime >= 1250 && kstTime <= 1510);
  if (!inSession) {
    // skip도 기록하여 cron 실행 여부 추적
    await logEngineRun(0, [{ type: "skipped", code: "", detail: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` }], 0, 0);
    return NextResponse.json({ skipped: true, reason: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` });
  }

  const tokenRes = await fetch(`${KIS_VTS_BASE}/oauth2/tokenP`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!tokenRes.ok) return NextResponse.json({ error: "토큰 발급 실패" }, { status: 500 });
  const tokenData = await tokenRes.json();

  const { data: watchlistData } = await supabase.from("watchlist").select("code").eq("active", true);
  const watchlist = (watchlistData || []).map((w: { code: string }) => w.code);

  const config: EngineConfig = {
    appKey, appSecret, accountNo, token: tokenData.access_token,
    stopLoss: -5, takeProfit: 5, trailingStop: -3,
    maxPerTrade: 1000000, maxDailyTrades: 5,
    takeProfitRatio: 50,   // #1
    dailyLossLimit: -3,    // #5
    dynamicRisk: true,     // #2
    watchlist,
  };

  return runEngine(config);
}

export async function POST(req: NextRequest) {
  const config: EngineConfig = await req.json();
  if (!config.token || !config.accountNo) {
    return NextResponse.json({ error: "KIS 설정 필요" }, { status: 400 });
  }
  return runEngine({ ...config, takeProfitRatio: config.takeProfitRatio ?? 50, dailyLossLimit: config.dailyLossLimit ?? -3, dynamicRisk: config.dynamicRisk ?? true });
}

// ─── 엔진 본체 ──────────────────────────────────
async function runEngine(config: EngineConfig) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    // ── 자가 학습: 과거 성과 기반 파라미터 자동 조정 ──
    let learning: LearningResult | null = null;
    try { learning = await runLearning(); } catch { /* 학습 실패 시 기본값 사용 */ }

    // 학습된 리스크 파라미터 적용 (학습 결과 있으면 덮어쓰기)
    let stopLoss = learning?.risk.source === "learned" ? learning.risk.stopLoss : (config.stopLoss ?? -5);
    let takeProfit = learning?.risk.source === "learned" ? learning.risk.takeProfit : (config.takeProfit ?? 5);
    let trailingStop = learning?.risk.source === "learned" ? learning.risk.trailingStop : (config.trailingStop ?? -3);
    const maxPerTrade = config.maxPerTrade ?? 1000000;
    const maxDailyTrades = config.maxDailyTrades ?? 5;
    const takeProfitRatio = learning?.risk.source === "learned" ? learning.risk.takeProfitRatio : (config.takeProfitRatio ?? 50);
    const dailyLossLimit = config.dailyLossLimit ?? -3;

    // 학습된 가중치
    const customWeights = learning?.weights.source === "learned" ? learning.weights : undefined;

    const actions: Array<{ type: string; code: string; name?: string; detail: string }> = [];
    let tradeCount = 0;

    // #5 일일 손실 한도 체크
    const todayLoss = await getTodayRealizedLoss();
    if (todayLoss <= dailyLossLimit) {
      const durationMs = Date.now() - startTime;
      await logEngineRun(0, [{ type: "daily_loss_halt", code: "", detail: `일일 손실 한도 도달 (${todayLoss.toFixed(1)}% ≤ ${dailyLossLimit}%)` }], 0, durationMs);
      return NextResponse.json({ timestamp: new Date().toISOString(), tradeCount: 0, halted: true, reason: `일일 손실 한도 ${todayLoss.toFixed(1)}%` });
    }

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

      // #2 ATR 동적 손절
      if (config.dynamicRisk) {
        const candles = await getDailyCandles(config, code);
        if (candles.length >= 15) {
          const atr = calcATR(candles);
          const dynamic = calcDynamicRisk(atr, currentPrice);
          stopLoss = dynamic.stopLoss;
          takeProfit = dynamic.takeProfit;
          trailingStop = dynamic.trailingStop;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      const risk = checkRisk(avgPrice, currentPrice, highPrice, stopLoss, takeProfit, trailingStop);

      if (risk.action !== "hold") {
        // #1 분할 매도: 익절 시 takeProfitRatio%만 매도, 나머지는 트레일링
        let sellQty = qty;
        if (risk.action === "take_profit" && takeProfitRatio < 100) {
          sellQty = Math.max(1, Math.floor(qty * takeProfitRatio / 100));
        }

        const result = await sellOrder(config, code, sellQty);
        actions.push({
          type: result.success ? risk.action : "sell_failed", code, name,
          detail: result.success
            ? `${risk.reason} → 매도 ${sellQty}/${qty}주 (${result.msg})`
            : `${risk.reason} → 매도 실패: ${result.msg}`,
        });

        if (result.success) {
          if (sellQty >= qty) {
            await closePosition(code, currentPrice, sellQty, risk.action);
          }
          tradeCount++;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ═══ STEP 1.5: 승인된 신호 매수 실행 ═══
    const { data: approvedSignals } = await supabase.from("pending_signals")
      .select("*").eq("status", "approved");

    for (const sig of approvedSignals || []) {
      if (tradeCount >= maxDailyTrades) break;
      if (holdings.some((h: Record<string, string>) => h.pdno === sig.stock_code && Number(h.hldg_qty) > 0)) {
        await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
        continue;
      }

      const priceData = await getPrice(config, sig.stock_code);
      const price = Number(priceData?.stck_prpr) || 0;
      const name = priceData?.hts_kor_isnm || sig.stock_name || sig.stock_code;
      if (price <= 0) continue;

      const qty = Math.floor((maxPerTrade * 0.5) / price);
      if (qty <= 0) continue;

      const result = await buyOrder(config, sig.stock_code, qty);
      actions.push({
        type: result.success ? "approved_buy" : "approved_buy_failed",
        code: sig.stock_code, name,
        detail: result.success
          ? `승인 매수 ${qty}주 @ ${price.toLocaleString()}원 (점수: ${sig.signal_score}) (${result.msg})`
          : `승인 매수 실패: ${result.msg}`,
      });

      if (result.success) {
        await openPosition(sig.stock_code, name, price, qty, { strength: "weak", side: "buy", totalScore: sig.signal_score, comment: sig.signal_comment, indicators: [], raw: sig.signal_data || {}, matchCount: 0 } as SignalResult, "initial");
        tradeCount++;
      }

      // 처리 완료 → expired로 변경
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      await new Promise((r) => setTimeout(r, 200));
    }

    // ═══ STEP 2: 관심종목 신호 분석 (매수) ═══
    const watchlist: string[] = config.watchlist ?? [];

    for (const code of watchlist) {
      if (tradeCount >= maxDailyTrades) break;
      if (holdings.some((h: Record<string, string>) => h.pdno === code && Number(h.hldg_qty) > 0)) continue;

      const candles = await getDailyCandles(config, code);
      scannedCount++;
      if (candles.length < 26) continue;

      const signal = customWeights ? analyzeSignalWithWeights(candles, customWeights) : analyzeSignal(candles);
      await new Promise((r) => setTimeout(r, 200));

      if (signal.strength === "strong" && signal.side === "buy") {
        const priceData = await getPrice(config, code);
        const price = Number(priceData?.stck_prpr) || 0;
        const name = priceData?.hts_kor_isnm || code;
        if (price <= 0) continue;

        // #1 분할 매수: 1차 50%, 나중에 추가매수
        const existingPos = await getOpenPosition(code);
        const buyRatio = existingPos?.phase === "initial" ? 1 : 0.5; // initial이면 나머지 50%
        const qty = Math.floor((maxPerTrade * buyRatio) / price);
        if (qty <= 0) continue;

        const result = await buyOrder(config, code, qty);
        const phase = existingPos ? "full" : "initial";
        actions.push({
          type: result.success ? (phase === "initial" ? "split_buy_1" : "split_buy_2") : "buy_failed",
          code, name,
          detail: result.success
            ? `${signal.totalScore}점 (${signal.raw.regime}) → ${phase === "initial" ? "1차" : "2차"} 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg})`
            : `${signal.totalScore}점 → 매수 실패: ${result.msg}`,
        });

        if (result.success) {
          if (!existingPos) {
            await openPosition(code, name, price, qty, signal, "initial");
          }
          tradeCount++;
        }
        await new Promise((r) => setTimeout(r, 200));

      } else if (signal.strength === "weak" && signal.side === "buy") {
        // DB에 승인 대기 신호 저장
        const priceData = await getPrice(config, code);
        const name = priceData?.hts_kor_isnm || code;
        try {
          await supabase.from("pending_signals").insert({
            stock_code: code, stock_name: name,
            signal_score: signal.totalScore,
            signal_comment: signal.comment,
            signal_data: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount },
            source: "watchlist", status: "pending",
          });
        } catch { /* ignore */ }

        actions.push({
          type: "pending_approval", code, name,
          detail: `약한 신호 ${signal.totalScore}점 → DB 저장, 승인 대기. ${signal.comment}`,
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // ═══ STEP 3: KOSPI + KOSDAQ 급등주 스캔 (#6) ═══
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

        const signal = customWeights ? analyzeSignalWithWeights(candles, customWeights) : analyzeSignal(candles);
        await new Promise((r) => setTimeout(r, 200));

        if (signal.strength === "strong" && signal.side === "buy") {
          const priceData = await getPrice(config, code);
          const price = Number(priceData?.stck_prpr) || 0;
          const name = priceData?.hts_kor_isnm || code;
          if (price <= 0) continue;

          // 급등주는 1차 50%만 진입
          const qty = Math.floor((maxPerTrade * 0.5) / price);
          if (qty <= 0) continue;

          const result = await buyOrder(config, code, qty);
          actions.push({
            type: result.success ? "surge_buy" : "surge_buy_failed", code, name,
            detail: result.success
              ? `급등주 ${signal.totalScore}점 (${signal.raw.regime}) → 1차 매수 ${qty}주 @ ${price.toLocaleString()}원 (${result.msg})`
              : `급등주 ${signal.totalScore}점 → 매수 실패: ${result.msg}`,
          });

          if (result.success) {
            await openPosition(code, name, price, qty, signal, "initial");
            tradeCount++;
          }
          await new Promise((r) => setTimeout(r, 200));

        } else if (signal.strength === "weak" && signal.side === "buy") {
          // DB에 승인 대기 신호 저장
          const priceData2 = await getPrice(config, code);
          const surgeName = priceData2?.hts_kor_isnm || code;
          try {
            await supabase.from("pending_signals").insert({
              stock_code: code, stock_name: surgeName,
              signal_score: signal.totalScore,
              signal_comment: signal.comment,
              signal_data: { indicators: signal.indicators, raw: signal.raw, matchCount: signal.matchCount },
              source: "surge", status: "pending",
            });
          } catch { /* ignore */ }

          actions.push({
            type: "surge_pending", code, name: surgeName,
            detail: `급등주 약한 ${signal.totalScore}점 → DB 저장, 승인 대기. ${signal.comment}`,
          });
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    const durationMs = Date.now() - startTime;
    await logEngineRun(tradeCount, actions, scannedCount, durationMs);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      tradeCount, scannedCount, durationMs, actions,
      learning: learning ? {
        weightsSource: learning.weights.source,
        riskSource: learning.risk.source,
        sampleSize: learning.risk.sampleSize,
        appliedRisk: { stopLoss, takeProfit, trailingStop, takeProfitRatio },
      } : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "엔진 실행 실패";
    const durationMs = Date.now() - startTime;
    await logEngineRun(0, [], scannedCount, durationMs, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
