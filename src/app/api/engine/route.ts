import { NextRequest, NextResponse } from "next/server";
import { analyzeSignal, analyzeSignalWithWeights, calcATR, calcDynamicRisk, calcPositionSize, checkRisk, type AtrMultipliers, type SignalResult } from "@/lib/kis/indicators";
import { loadLatestLearning, applyLearning } from "@/lib/learning";
import { KIS_VTS_BASE } from "@/lib/constants";
import { type EngineConfig } from "@/lib/engine/types";
import { openPosition, closePosition, recordTradeMemory, closeTradeMemory, getOpenPosition, getTodayRealizedLoss, logEngineRun } from "@/lib/engine/db";
import { supabase } from "@/lib/supabase/api-client";
import { getPrice, getDailyCandles, getBalance, sellOrder, limitBuyOrder, cancelOpenBuyOrders } from "@/lib/engine/kis";
import { hasDangerousDisclosure, getListingDate, applyStockFilter } from "@/lib/engine/filters";
import { getMarketTrend, getInvestorTrend, scanSurgeStocks } from "@/lib/engine/market";

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

  // #3 세션 시간 체크 (KST 기준)
  const kstHour = new Date(Date.now() + 9 * 3600000).getUTCHours();
  const kstMin = new Date(Date.now() + 9 * 3600000).getUTCMinutes();
  const kstTime = kstHour * 100 + kstMin;
  const inSession = (kstTime >= 930 && kstTime <= 1150) || (kstTime >= 1250 && kstTime <= 1510);
  if (!inSession) {
    await logEngineRun(0, [{ type: "skipped", code: "", detail: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` }], 0, 0);
    return NextResponse.json({ skipped: true, reason: `장 외 시간 (KST ${kstHour}:${String(kstMin).padStart(2, "0")})` });
  }

  // 환경변수에 trailing \n 제거 (Vercel env pull 포맷 버그 대응)
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
    takeProfitRatio: 50,   // #1
    dailyLossLimit: -3,    // #5
    dynamicRisk: true,     // #2
    maxHoldDays: 5,        // 최대 5일 보유
    watchlist,
  };

  return runEngine(config);
}

export async function POST(req: NextRequest) {
  const config: EngineConfig = await req.json();
  if (!config.token || !config.accountNo) {
    return NextResponse.json({ error: "KIS 설정 필요" }, { status: 400 });
  }
  return runEngine({ ...config, takeProfitRatio: config.takeProfitRatio ?? 50, dailyLossLimit: config.dailyLossLimit ?? -3, dynamicRisk: config.dynamicRisk ?? true, maxHoldDays: config.maxHoldDays ?? 5 });
}

// ─── 헬퍼: 배치 병렬 패치 ───────────────────────
async function batchFetch<T>(
  codes: string[],
  fetcher: (code: string) => Promise<T>,
  batchSize = 3
): Promise<Map<string, T>> {
  const map = new Map<string, T>();
  for (let i = 0; i < codes.length; i += batchSize) {
    const chunk = codes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      chunk.map(async (code) => ({ code, data: await fetcher(code) }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") map.set(r.value.code, r.value.data);
    }
    if (i + batchSize < codes.length) await new Promise((r) => setTimeout(r, 200));
  }
  return map;
}

// ─── 엔진 본체 ──────────────────────────────────
async function runEngine(config: EngineConfig) {
  const startTime = Date.now();
  let scannedCount = 0;

  try {
    // ── 자가 학습: 최신 스냅샷 로딩 ──
    let learning = null;
    try { learning = await loadLatestLearning(); } catch { /* 학습 로딩 실패 시 기본값 사용 */ }

    const applied = applyLearning(learning, config);

    const maxPerTrade = config.maxPerTrade ?? 1000000;
    const maxDailyTrades = config.maxDailyTrades ?? 5;
    const takeProfitRatio = applied.takeProfitRatio;
    const dailyLossLimit = config.dailyLossLimit ?? -3;
    const customWeights = applied.weights;

    const actions: Array<{ type: string; code: string; name?: string; detail: string }> = [];
    let tradeCount = 0;

    // ═══ STEP 0: 미체결 취소 + 시장 모멘텀 ═══
    const [cancelResult, marketTrend] = await Promise.all([
      cancelOpenBuyOrders(config),
      getMarketTrend(config),
    ]);
    if (cancelResult.cancelled > 0 || cancelResult.failed > 0) {
      actions.push({
        type: "cancel_open_orders", code: "",
        detail: `미체결 취소: 성공 ${cancelResult.cancelled}건, 실패 ${cancelResult.failed}건`,
      });
    }
    if (marketTrend.label) {
      actions.push({ type: "market_context", code: "", detail: `시장: ${marketTrend.label} (보정 ${marketTrend.bonus > 0 ? "+" : ""}${marketTrend.bonus}점)` });
    }

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
      const holdAtrMultipliers: AtrMultipliers = applied.atrMultipliers;
      let holdStopLoss = config.stopLoss ?? -5;
      let holdTakeProfit = config.takeProfit ?? 5;
      let holdTrailingStop = config.trailingStop ?? -3;

      if (config.dynamicRisk) {
        const holdCandles = await getDailyCandles(config, code);
        if (holdCandles.length >= 15) {
          const holdAtr = calcATR(holdCandles);
          const dynamic = calcDynamicRisk(holdAtr, currentPrice, holdAtrMultipliers);
          holdStopLoss = dynamic.stopLoss;
          holdTakeProfit = dynamic.takeProfit;
          holdTrailingStop = dynamic.trailingStop;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      const risk = checkRisk(avgPrice, currentPrice, highPrice, holdStopLoss, holdTakeProfit, holdTrailingStop);

      // ── 보유 기간 초과 강제 청산 ──
      const pos = await getOpenPosition(code);
      const maxHoldDays = config.maxHoldDays ?? 5;
      if (pos && risk.action === "hold") {
        const holdDays = Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
        if (holdDays >= maxHoldDays) {
          const result = await sellOrder(config, code, qty);
          actions.push({
            type: result.success ? "max_hold_sell" : "sell_failed", code, name,
            detail: result.success
              ? `보유 ${holdDays}일 초과 (최대 ${maxHoldDays}일) → 전량 청산 ${qty}주 (${result.msg})`
              : `보유기간 초과 청산 실패: ${result.msg}`,
          });
          if (result.success) {
            const holdDaysVal = Math.max(1, Math.ceil((Date.now() - new Date(pos?.entry_date).getTime()) / 86400000));
            const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
            const pnlAmt = (currentPrice - avgPrice) * qty;
            await closePosition(code, currentPrice, qty, "max_hold");
            await closeTradeMemory(code, pnlPct, pnlAmt, holdDaysVal, "max_hold");
            tradeCount++;
          }
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      }

      if (risk.action !== "hold") {
        // #1 분할 매도: 익절 시 takeProfitRatio%만 매도
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
          const sellPnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
          const sellPnlAmt = (currentPrice - avgPrice) * sellQty;
          const holdDaysVal = pos ? Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)) : 1;
          if (sellQty >= qty) {
            await closePosition(code, currentPrice, sellQty, risk.action);
            await closeTradeMemory(code, sellPnlPct, sellPnlAmt, holdDaysVal, risk.action);
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

      const qtyOverride = sig.signal_data?.qty_override ? Number(sig.signal_data.qty_override) : 0;
      const qty = qtyOverride > 0 ? qtyOverride : Math.floor((maxPerTrade * 0.5) / price);
      if (qty <= 0) continue;

      const result = await limitBuyOrder(config, sig.stock_code, qty, price);
      actions.push({
        type: result.success ? "approved_buy" : "approved_buy_failed",
        code: sig.stock_code, name,
        detail: result.success
          ? `승인 지정가 매수 ${qty}주 @ ${result.limitPrice.toLocaleString()}원 (점수: ${sig.signal_score}) (${result.msg})`
          : `승인 매수 실패: ${result.msg}`,
      });

      if (result.success) {
        await openPosition(sig.stock_code, name, result.limitPrice, qty, { strength: "weak", side: "buy", totalScore: sig.signal_score, comment: sig.signal_comment, indicators: [], raw: sig.signal_data || {}, matchCount: 0 } as SignalResult, "initial");
        tradeCount++;
      }

      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      await new Promise((r) => setTimeout(r, 200));
    }

    // ═══ 장 초반 흐름 보너스 (09:00 스냅샷 기반) ═══
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const { data: snapshots } = await supabase.from("market_snapshots").select("*").eq("date", today);
    const snapshotMap = new Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.stock_code, { open_price: Number(s.open_price), snapshot_price: Number(s.snapshot_price), snapshot_volume: Number(s.snapshot_volume) });
    }

    function getOpeningBonus(code: string): number {
      const snap = snapshotMap.get(code);
      if (!snap || snap.open_price <= 0) return 0;
      const gap = (snap.snapshot_price - snap.open_price) / snap.open_price;
      if (gap > 0.01 && snap.snapshot_volume > 50000) return 15;
      if (gap > 0.005) return 8;
      if (gap < -0.02) return -20;
      if (gap < -0.01) return -10;
      return 0;
    }

    // ═══ STEP 2: 관심종목 신호 분석 (매수) ═══
    const watchlist: string[] = config.watchlist ?? [];
    const availableWatchlist = watchlist.filter(
      (code) => !holdings.some((h: Record<string, string>) => h.pdno === code && Number(h.hldg_qty) > 0)
    );

    const wCandleMap = await batchFetch(availableWatchlist, (code) => getDailyCandles(config, code));
    const wInvestorMap = await batchFetch(availableWatchlist, (code) => getInvestorTrend(config, code));
    scannedCount += availableWatchlist.length;

    for (const code of watchlist) {
      if (tradeCount >= maxDailyTrades) break;
      if (!wCandleMap.has(code)) continue;

      const candles = wCandleMap.get(code)!;
      if (candles.length < 26) continue;

      const baseSignal = analyzeSignal(candles);
      const learnedSignal = customWeights ? analyzeSignalWithWeights(candles, customWeights) : baseSignal;

      const openingBonus = getOpeningBonus(code);
      const investor = wInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
      const totalBonus = openingBonus + investor.bonus + marketTrend.bonus;
      const adjustedScore = learnedSignal.totalScore + totalBonus;
      const adjustedStrength = adjustedScore >= 70 ? "strong" : adjustedScore >= 40 ? "weak" : "none";
      const weightsSource: "learned" | "default" = customWeights ? "learned" : "default";
      const bonusTag = [
        openingBonus !== 0 ? `장초반 ${openingBonus > 0 ? "+" : ""}${openingBonus}` : "",
        investor.label ? `[${investor.label}]` : "",
        marketTrend.label ? `[${marketTrend.label}]` : "",
      ].filter(Boolean).join(" ");

      if (adjustedStrength === "strong" && learnedSignal.side === "buy") {
        const priceData = await getPrice(config, code);
        const price = Number(priceData?.stck_prpr) || 0;
        const name = priceData?.hts_kor_isnm || code;
        if (price <= 0) continue;

        const listingDate = await getListingDate(config, code);
        await new Promise((r) => setTimeout(r, 200));
        const filter = applyStockFilter(priceData as Record<string, string>, listingDate);
        if (!filter.passed) {
          actions.push({ type: "filtered_out", code, name, detail: `종목 필터 탈락: ${filter.reason}` });
          continue;
        }

        const dart = await hasDangerousDisclosure(code);
        await new Promise((r) => setTimeout(r, 200));
        if (dart.danger) {
          actions.push({ type: "dart_filtered", code, name, detail: `DART 위험공시 탈락: ${dart.reason}` });
          continue;
        }

        const existingPos = await getOpenPosition(code);
        const buyRatio = existingPos?.phase === "initial" ? 1 : 0.5;
        const positionSize = calcPositionSize(
          learnedSignal.raw.atr,
          price,
          applied.targetRiskAmount,
          maxPerTrade,
          applied.atrMultipliers.stop
        );
        const qty = Math.floor((positionSize * buyRatio) / price);
        if (qty <= 0) continue;

        const result = await limitBuyOrder(config, code, qty, price);
        const phase = existingPos ? "full" : "initial";
        actions.push({
          type: result.success ? (phase === "initial" ? "split_buy_1" : "split_buy_2") : "buy_failed",
          code, name,
          detail: result.success
            ? `${adjustedScore}점 (${learnedSignal.raw.regime}) B:${baseSignal.totalScore}/L:${learnedSignal.totalScore} ${bonusTag} → ${phase === "initial" ? "1차" : "2차"} 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`
            : `${adjustedScore}점 ${bonusTag} → 매수 실패: ${result.msg}`,
        });

        if (result.success) {
          if (!existingPos) {
            await openPosition(code, name, result.limitPrice, qty, { ...learnedSignal, totalScore: adjustedScore }, "initial");
            await recordTradeMemory({
              code, name, baseSignal, learnedSignal,
              bonuses: { market: marketTrend.bonus, investor: investor.bonus, snapshot: openingBonus },
              adjustedScore, weightsSource,
              positionSize: qty * result.limitPrice,
            });
          }
          tradeCount++;
        }
        await new Promise((r) => setTimeout(r, 200));

      } else if (adjustedStrength === "weak" && learnedSignal.side === "buy") {
        const priceData = await getPrice(config, code);
        const name = priceData?.hts_kor_isnm || code;
        try {
          await supabase.from("pending_signals").insert({
            stock_code: code, stock_name: name,
            signal_score: adjustedScore,
            signal_comment: `${learnedSignal.comment}${bonusTag}`,
            signal_data: { indicators: learnedSignal.indicators, raw: learnedSignal.raw, matchCount: learnedSignal.matchCount, openingBonus, institutionalBonus: investor.bonus },
            source: "watchlist", status: "pending",
          });
        } catch { /* ignore */ }

        actions.push({
          type: "pending_approval", code, name,
          detail: `약한 신호 ${adjustedScore}점${bonusTag} → DB 저장, 승인 대기. ${learnedSignal.comment}`,
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

      const sCandleMap = await batchFetch(candidates, (code) => getDailyCandles(config, code));
      const sInvestorMap = await batchFetch(candidates, (code) => getInvestorTrend(config, code));
      scannedCount += candidates.length;

      for (const code of candidates) {
        if (tradeCount >= maxDailyTrades) break;

        const candles = sCandleMap.get(code) ?? [];
        if (candles.length < 26) continue;

        const surgeBaseSignal = analyzeSignal(candles);
        const surgeLearnedSignal = customWeights ? analyzeSignalWithWeights(candles, customWeights) : surgeBaseSignal;
        const surgeInvestor = sInvestorMap.get(code) ?? { orgn: 0, frgn: 0, bonus: 0, label: "" };
        const surgeAdjustedScore = surgeLearnedSignal.totalScore + surgeInvestor.bonus + marketTrend.bonus;
        const surgeAdjustedStrength = surgeAdjustedScore >= 70 ? "strong" : surgeAdjustedScore >= 40 ? "weak" : "none";
        const surgeWeightsSource: "learned" | "default" = customWeights ? "learned" : "default";
        const surgeInvestorTag = [
          surgeInvestor.label ? `[${surgeInvestor.label}]` : "",
          marketTrend.label ? `[${marketTrend.label}]` : "",
        ].filter(Boolean).join(" ");

        if (surgeAdjustedStrength === "strong" && surgeLearnedSignal.side === "buy") {
          const priceData = await getPrice(config, code);
          const price = Number(priceData?.stck_prpr) || 0;
          const name = priceData?.hts_kor_isnm || code;
          if (price <= 0) continue;

          const surgeListing = await getListingDate(config, code);
          await new Promise((r) => setTimeout(r, 200));
          const surgeFilter = applyStockFilter(priceData as Record<string, string>, surgeListing);
          if (!surgeFilter.passed) {
            actions.push({ type: "filtered_out", code, name, detail: `급등주 필터 탈락: ${surgeFilter.reason}` });
            continue;
          }

          const surgeDart = await hasDangerousDisclosure(code);
          await new Promise((r) => setTimeout(r, 200));
          if (surgeDart.danger) {
            actions.push({ type: "dart_filtered", code, name, detail: `급등주 DART 위험공시 탈락: ${surgeDart.reason}` });
            continue;
          }

          const surgePositionSize = calcPositionSize(
            surgeLearnedSignal.raw.atr,
            price,
            applied.targetRiskAmount,
            maxPerTrade,
            applied.atrMultipliers.stop
          );
          const qty = Math.floor((surgePositionSize * 0.5) / price);
          if (qty <= 0) continue;

          const result = await limitBuyOrder(config, code, qty, price);
          actions.push({
            type: result.success ? "surge_buy" : "surge_buy_failed", code, name,
            detail: result.success
              ? `급등주 ${surgeAdjustedScore}점 (${surgeLearnedSignal.raw.regime}) B:${surgeBaseSignal.totalScore}/L:${surgeLearnedSignal.totalScore}${surgeInvestorTag} → 1차 지정가 ${result.limitPrice.toLocaleString()}원 ${qty}주 (${result.msg})`
              : `급등주 ${surgeAdjustedScore}점${surgeInvestorTag} → 매수 실패: ${result.msg}`,
          });

          if (result.success) {
            await openPosition(code, name, result.limitPrice, qty, { ...surgeLearnedSignal, totalScore: surgeAdjustedScore }, "initial");
            await recordTradeMemory({
              code, name,
              baseSignal: surgeBaseSignal, learnedSignal: surgeLearnedSignal,
              bonuses: { market: marketTrend.bonus, investor: surgeInvestor.bonus, snapshot: 0 },
              adjustedScore: surgeAdjustedScore, weightsSource: surgeWeightsSource,
              positionSize: qty * result.limitPrice,
            });
            tradeCount++;
          }
          await new Promise((r) => setTimeout(r, 200));

        } else if (surgeAdjustedStrength === "weak" && surgeLearnedSignal.side === "buy") {
          const priceData2 = await getPrice(config, code);
          const surgeName = priceData2?.hts_kor_isnm || code;
          try {
            await supabase.from("pending_signals").insert({
              stock_code: code, stock_name: surgeName,
              signal_score: surgeAdjustedScore,
              signal_comment: `${surgeLearnedSignal.comment}${surgeInvestorTag}`,
              signal_data: { indicators: surgeLearnedSignal.indicators, raw: surgeLearnedSignal.raw, matchCount: surgeLearnedSignal.matchCount, institutionalBonus: surgeInvestor.bonus },
              source: "surge", status: "pending",
            });
          } catch { /* ignore */ }

          actions.push({
            type: "surge_pending", code, name: surgeName,
            detail: `급등주 약한 ${surgeAdjustedScore}점${surgeInvestorTag} → DB 저장, 승인 대기. ${surgeLearnedSignal.comment}`,
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
        confidence: learning.confidence,
        sampleSize: learning.sampleSize,
        weightsSource: applied.weights ? "learned" : "default",
        atrSource: learning.atrMultipliers.source,
        applied: {
          takeProfitRatio,
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
