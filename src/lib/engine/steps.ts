import { supabase } from "@/lib/supabase/api-client";
import {
  calcATR, calcDynamicRisk,
  checkRisk, type AtrMultipliers, type SignalResult, type SignalRaw,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, getBalance, sellOrder, limitBuyOrder, cancelOpenBuyOrders, checkOrderFill } from "@/lib/engine/kis";
import { type DailyCandle } from "@/lib/kis/indicators";
import { applySectorFilter, applyStockFilter, getListingDate } from "@/lib/engine/filters";
import { getMarketTrend, getInvestorTrend } from "@/lib/engine/market";
import { openPosition, closePosition, closeTradeMemory, getOpenPosition, getTodayRealizedLoss, getSectorCounts, updatePositionPhase, recordPartialExit, getPendingOrders, deletePendingOrder, savePendingOrder } from "@/lib/engine/db";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";
import { OPENING_BONUS_STRONG, OPENING_BONUS_MILD, OPENING_PENALTY_MILD, OPENING_PENALTY_STRONG, APPROVED_BUY_RATIO, SECOND_TP_RATIO, DEFAULT_MARKET_CRASH_THRESHOLD, OPENING_GAP_STRONG, OPENING_GAP_MILD, OPENING_GAP_DROP_STRONG, OPENING_GAP_DROP_MILD } from "@/lib/engine/constants";

// 외부 신호(pending_signals)에서 openPosition 호출 시 사용하는 빈 SignalRaw placeholder
const EMPTY_RAW: SignalRaw = { rsi: 0, macd: 0, macdSignal: 0, macdCrossover: "none", ma5: 0, ma20: 0, ema5: 0, ema20: 0, bbPosition: "middle", volumeRatio: 100, atr: 0, adx: 0, regime: "ranging", stochRsiK: 50, stochRsiD: 50, obvSlope: 0, disparity: 0, patternSellHit: false };

// ─── 배치 병렬 패치 ─────────────────────────────────
export async function batchFetch<T>(
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

// ─── 장 초반 스냅샷 보너스 ───────────────────────────
export function getOpeningBonus(
  code: string,
  snapshotMap: Map<string, { open_price: number; snapshot_price: number; snapshot_volume: number }>
): number {
  const snap = snapshotMap.get(code);
  if (!snap || snap.open_price <= 0) return 0;
  const gap = (snap.snapshot_price - snap.open_price) / snap.open_price;
  if (gap > OPENING_GAP_STRONG && snap.snapshot_volume > 50000) return OPENING_BONUS_STRONG;
  if (gap > OPENING_GAP_MILD) return OPENING_BONUS_MILD;
  if (gap < OPENING_GAP_DROP_STRONG) return OPENING_PENALTY_STRONG;
  if (gap < OPENING_GAP_DROP_MILD) return OPENING_PENALTY_MILD;
  return 0;
}

// ═══ STEP 0: 미체결 취소 + 시장 모멘텀 + 일일 손실 체크 ═══
export async function runStep0(ctx: StepContext): Promise<{
  actions: EngineAction[];
  marketTrend: MarketTrend;
  halted: boolean;
  haltReason?: string;
}> {
  const actions: EngineAction[] = [];

  const [cancelResult, marketTrend] = await Promise.all([
    cancelOpenBuyOrders(ctx.config),
    getMarketTrend(ctx.config),
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

  // ─── 승인 대기 신호 자동 만료 (2시간 초과) ──────────
  try {
    const { data: expiredSignals } = await supabase
      .from("pending_signals")
      .update({ status: "expired", resolved_at: new Date().toISOString() })
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 2 * 3600 * 1000).toISOString())
      .select("id");
    const expiredCount = expiredSignals?.length ?? 0;
    if (expiredCount > 0) {
      actions.push({ type: "signals_expired", code: "", detail: `승인 대기 만료: ${expiredCount}건` });
    }
  } catch { /* 만료 처리 실패가 엔진 실행에 영향 주지 않음 */ }

  // ─── 미체결 주문 체결 확인 ────────────────────────
  // Vercel 10s timeout 보호: 최대 5건만 처리 (나머지는 다음 크론에서 처리)
  const pendingOrders = (await getPendingOrders()).slice(0, 5);
  for (const order of pendingOrders) {
    const fillResult = await checkOrderFill(ctx.config, order.order_no, order.stock_code);
    if (fillResult.filled && fillResult.filledQty > 0) {
      await deletePendingOrder(order.id);
      // 고아 포지션 방지: 체결 확인 시점에 DB 포지션이 없으면 복구
      // "initial" phase — 체결 직후이므로 아직 1차TP 이전 단계가 안전한 가정
      const existingPos = await getOpenPosition(order.stock_code);
      if (!existingPos) {
        await openPosition(
          order.stock_code,
          order.stock_name ?? null,
          fillResult.filledPrice,
          fillResult.filledQty,
          { strength: "weak", side: "buy", totalScore: order.signal_score ?? 0, comment: "체결 복구", indicators: [], raw: EMPTY_RAW, matchCount: 0 },
          "initial",
        );
      }
      actions.push({
        type: "order_filled",
        code: order.stock_code,
        name: order.stock_name ?? order.stock_code,
        detail: `체결 확인: ${fillResult.filledQty}주 @ ${fillResult.filledPrice.toLocaleString()}원`,
      });
    } else {
      const ageMin = (Date.now() - new Date(order.created_at).getTime()) / 60000;
      if (ageMin >= 30) {
        await deletePendingOrder(order.id);
        actions.push({
          type: "order_cancelled_timeout",
          code: order.stock_code,
          name: order.stock_name ?? order.stock_code,
          detail: `미체결 ${Math.round(ageMin)}분 경과 → 자동 삭제`,
        });
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // ─── 시장 급락 감지 ──────────────────────────────
  const crashThreshold = ctx.config.marketCrashThreshold ?? DEFAULT_MARKET_CRASH_THRESHOLD;
  const kospiRate = marketTrend.kospiRate;
  if (kospiRate <= crashThreshold) {
    return {
      actions: [
        ...actions,
        {
          type: "market_crash_halt", code: "",
          detail: `시장 급락 감지 (KOSPI ${kospiRate.toFixed(2)}% ≤ ${crashThreshold}%)`,
        },
      ],
      marketTrend,
      halted: true,
      haltReason: `시장 급락 감지 (KOSPI ${kospiRate.toFixed(2)}%)`,
    };
  }

  const todayLoss = await getTodayRealizedLoss();
  if (todayLoss <= ctx.dailyLossLimit) {
    return {
      actions: [...actions, { type: "daily_loss_halt", code: "", detail: `일일 손실 한도 도달 (${todayLoss.toFixed(1)}% ≤ ${ctx.dailyLossLimit}%)` }],
      marketTrend,
      halted: true,
      haltReason: `일일 손실 한도 ${todayLoss.toFixed(1)}%`,
    };
  }

  return { actions, marketTrend, halted: false };
}

// ─── STEP 1 내부 헬퍼: 보유기간 초과 청산 ───────────
async function executeMaxHoldSell(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pos: { entry_date: string } | null;
  maxHoldDays: number;
}): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const { ctx, code, name, qty, avgPrice, currentPrice, pos, maxHoldDays } = params;
  const actions: EngineAction[] = [];
  const holdDays = Math.ceil((Date.now() - new Date(pos!.entry_date).getTime()) / 86400000);

  const result = await sellOrder(ctx.config, code, qty);
  actions.push({
    type: result.success ? "max_hold_sell" : "sell_failed", code, name,
    detail: result.success
      ? `보유 ${holdDays}일 초과 (최대 ${maxHoldDays}일) → 전량 청산 ${qty}주 (${result.msg})`
      : `보유기간 초과 청산 실패: ${result.msg}`,
  });

  let tradeCount = 0;
  if (result.success) {
    const holdDaysVal = Math.max(1, Math.ceil((Date.now() - new Date(pos!.entry_date).getTime()) / 86400000));
    const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
    const pnlAmt = (currentPrice - avgPrice) * qty;
    await closePosition(code, currentPrice, qty, "max_hold");
    await closeTradeMemory(code, pnlPct, pnlAmt, holdDaysVal, "max_hold");
    await sendTradeAlert({ type: "max_hold_sell", code, name, qty, price: currentPrice, pnlPct });
    tradeCount++;
  }
  await new Promise((r) => setTimeout(r, 200));
  return { actions, tradeCount };
}

// ─── STEP 1 내부 헬퍼: 2단계 익절 실행 ──────────────
async function executePartialTakeProfit(params: {
  ctx: StepContext;
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pos: { entry_date: string; phase?: string } | null;
  riskAction: string;
  riskReason: string;
}): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const { ctx, code, name, qty, avgPrice, currentPrice, pos, riskAction, riskReason } = params;
  const actions: EngineAction[] = [];
  const currentPhase = pos?.phase ?? "initial";

  if (currentPhase === "final_tp") {
    actions.push({ type: "trailing_only", code, name, detail: `2차 익절 완료 상태 — 트레일링 스탑 대기 중` });
    await new Promise((r) => setTimeout(r, 200));
    return { actions, tradeCount: 0 };
  }

  const isSmallPosition = qty <= 3;
  let sellQty: number;
  let nextPhase: string;
  let phaseLabel: string;

  if (isSmallPosition || currentPhase === "initial") {
    sellQty = isSmallPosition ? qty : Math.max(1, Math.floor(qty * ctx.takeProfitRatio / 100));
    nextPhase = isSmallPosition ? "final_tp" : "partial_tp";
    phaseLabel = isSmallPosition ? "전량 익절" : "1차 익절";
  } else {
    sellQty = Math.max(1, Math.floor(qty * SECOND_TP_RATIO / 100));
    nextPhase = "final_tp";
    phaseLabel = "2차 익절";
  }

  const result = await sellOrder(ctx.config, code, sellQty);
  actions.push({
    type: result.success ? riskAction : "sell_failed", code, name,
    detail: result.success
      ? `${phaseLabel}: ${riskReason} → 매도 ${sellQty}/${qty}주 (${result.msg})`
      : `${phaseLabel} 매도 실패: ${result.msg}`,
  });

  let tradeCount = 0;
  if (result.success) {
    const sellPnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
    const sellPnlAmt = (currentPrice - avgPrice) * sellQty;
    const holdDaysVal = pos ? Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)) : 1;
    const remainingQty = qty - sellQty;
    if (remainingQty <= 0) {
      await closePosition(code, currentPrice, sellQty, riskAction);
      await closeTradeMemory(code, sellPnlPct, sellPnlAmt, holdDaysVal, riskAction);
    } else {
      // 부분익절: 가격·수량 기록 (최종 청산 시 블렌드 PnL 산출용)
      await recordPartialExit(code, currentPrice, sellQty, nextPhase);
    }
    await sendTradeAlert({ type: "take_profit", code, name, qty: sellQty, price: currentPrice, pnlPct: sellPnlPct });
    tradeCount++;
  }
  await new Promise((r) => setTimeout(r, 200));
  return { actions, tradeCount };
}

// ═══ STEP 1: 보유종목 손절/익절/기간초과 감시 ═══
export async function runStep1(ctx: StepContext, marketTrend: MarketTrend): Promise<{
  actions: EngineAction[];
  tradeCount: number;
  holdings: Record<string, string>[];
}> {
  const actions: EngineAction[] = [];
  let tradeCount = 0;

  const balanceData = await getBalance(ctx.config);
  const holdings: Record<string, string>[] = balanceData?.output1 || [];

  const activeCodes = holdings.filter((h) => Number(h.hldg_qty) > 0).map((h) => h.pdno);
  const candleMap = ctx.config.dynamicRisk
    ? await batchFetch(activeCodes, (code) => getDailyCandles(ctx.config, code))
    : new Map<string, DailyCandle[]>();

  for (const h of holdings) {
    const code = h.pdno;
    const qty = Number(h.hldg_qty) || 0;
    if (qty <= 0) continue;

    const avgPrice = Number(h.pchs_avg_pric) || 0;
    const currentPrice = Number(h.prpr) || 0;
    const highPrice = Number(h.stck_hgpr) || currentPrice;
    const name = h.prdt_name || code;

    const holdAtrMultipliers: AtrMultipliers = ctx.applied.atrMultipliers;
    let holdStopLoss = ctx.config.stopLoss ?? -5;
    let holdTakeProfit = ctx.config.takeProfit ?? 5;
    let holdTrailingStop = ctx.config.trailingStop ?? -3;

    if (ctx.config.dynamicRisk) {
      const holdCandles = candleMap.get(code) ?? [];
      if (holdCandles.length >= 15) {
        const holdAtr = calcATR(holdCandles);
        const dynamic = calcDynamicRisk(holdAtr, currentPrice, holdAtrMultipliers);
        holdStopLoss = dynamic.stopLoss;
        holdTakeProfit = dynamic.takeProfit;
        holdTrailingStop = dynamic.trailingStop;
      } else {
        actions.push({ type: "dynamic_risk_skipped", code, name, detail: `캔들 부족 (${holdCandles.length}개) — 기본값 적용` });
      }
    }

    const risk = checkRisk(avgPrice, currentPrice, highPrice, holdStopLoss, holdTakeProfit, holdTrailingStop);

    const pos = await getOpenPosition(code);
    const maxHoldDays = ctx.config.maxHoldDays ?? 5;
    if (pos && risk.action === "hold") {
      const holdDays = Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000);
      if (holdDays >= maxHoldDays) {
        const r = await executeMaxHoldSell({ ctx, code, name, qty, avgPrice, currentPrice, pos, maxHoldDays });
        actions.push(...r.actions);
        tradeCount += r.tradeCount;
        continue;
      }
    }

    // 기관 순매도 전환 청산 (ATR 청산 조건이 없을 때만 체크)
    if (risk.action === "hold") {
      try {
        const investor = await getInvestorTrend(ctx.config, code);
        const orgnFlipThreshold = -100; // 기관 3일 합산 -100억 이하 시 청산
        if (investor.orgn < orgnFlipThreshold) {
          const result = await sellOrder(ctx.config, code, qty);
          actions.push({
            type: result.success ? "orgn_flip_sell" : "sell_failed", code, name,
            detail: result.success
              ? `기관 순매도 전환 청산 (${investor.orgn.toFixed(0)}억) → 매도 ${qty}주 (${result.msg})`
              : `기관 청산 실패: ${result.msg}`,
          });
          if (result.success) {
            const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
            const pnlAmt = (currentPrice - avgPrice) * qty;
            const holdDaysVal = pos ? Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)) : 1;
            await closePosition(code, currentPrice, qty, "orgn_flip_sell");
            await closeTradeMemory(code, pnlPct, pnlAmt, holdDaysVal, "orgn_flip_sell");
            await sendTradeAlert({ type: "stop_loss", code, name, qty, price: currentPrice, pnlPct });
            tradeCount++;
          }
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      } catch { /* 기관 데이터 조회 실패 시 ATR 로직으로 폴백 */ }
    }

    if (risk.action !== "hold") {
      if (risk.action === "take_profit") {
        const r = await executePartialTakeProfit({ ctx, code, name, qty, avgPrice, currentPrice, pos, riskAction: risk.action, riskReason: risk.reason });
        actions.push(...r.actions);
        tradeCount += r.tradeCount;
      } else {
        // 손절 / 트레일링 / 기타: 기존 로직 유지
        const result = await sellOrder(ctx.config, code, qty);
        actions.push({
          type: result.success ? risk.action : "sell_failed", code, name,
          detail: result.success
            ? `${risk.reason} → 매도 ${qty}주 (${result.msg})`
            : `${risk.reason} → 매도 실패: ${result.msg}`,
        });

        if (result.success) {
          const sellPnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
          const sellPnlAmt = (currentPrice - avgPrice) * qty;
          const holdDaysVal = pos ? Math.max(1, Math.ceil((Date.now() - new Date(pos.entry_date).getTime()) / 86400000)) : 1;
          await closePosition(code, currentPrice, qty, risk.action);
          await closeTradeMemory(code, sellPnlPct, sellPnlAmt, holdDaysVal, risk.action);
          await sendTradeAlert({ type: risk.action as "sell" | "stop_loss" | "take_profit", code, name, qty, price: currentPrice, pnlPct: sellPnlPct });
          tradeCount++;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  return { actions, tradeCount, holdings };
}

// ═══ STEP 1.5: 승인된 신호 매수 실행 ═══
export async function runStep15(
  ctx: StepContext,
  holdings: Record<string, string>[],
  tradeCount: number
): Promise<{ actions: EngineAction[]; tradeCount: number }> {
  const actions: EngineAction[] = [];

  type PendingSignalRow = {
    id: string;
    stock_code: string;
    stock_name?: string | null;
    signal_score: number;
    signal_comment?: string | null;
    signal_data?: { qty_override?: number | string } | null;
    source?: string | null;
  };

  // 조회와 동시에 status → "processing" 으로 전환 (중복 실행 방지)
  // resolved_at IS NULL 조건으로 이미 다른 인스턴스가 처리 중인 행 제외
  const { data: claimedSignals } = await supabase.from("pending_signals")
    .update({ status: "processing", resolved_at: new Date().toISOString() })
    .eq("status", "approved")
    .is("resolved_at", null)
    .select("*");
  const approvedSignals = claimedSignals;

  const openCount = () => holdings.filter((h) => Number(h.hldg_qty) > 0).length;
  const sectorCounts15 = await getSectorCounts();

  for (const sig of (approvedSignals ?? []) as PendingSignalRow[]) {
    if (tradeCount >= ctx.maxDailyTrades) break;
    if (openCount() >= ctx.maxPositions) break;
    if (holdings.some((h) => h.pdno === sig.stock_code && Number(h.hldg_qty) > 0)) {
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      continue;
    }

    const priceData = await getPrice(ctx.config, sig.stock_code);
    const price = Number(priceData?.stck_prpr) || 0;
    const name = priceData?.hts_kor_isnm || sig.stock_name || sig.stock_code;
    if (price <= 0) continue;

    const sector15 = (priceData as Record<string, string>).bstp_kor_isnm || null;
    const sectorFilter15 = applySectorFilter(sector15, sectorCounts15, ctx.maxPerSector);
    if (!sectorFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: sectorFilter15.reason });
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      continue;
    }

    // 수동매수 포함 모든 경로: 관리종목/정리매매 필터 적용
    const listingDate15 = await getListingDate(ctx.config, sig.stock_code);
    const stockFilter15 = applyStockFilter(priceData as Record<string, string>, listingDate15);
    if (!stockFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: `종목 필터: ${stockFilter15.reason}` });
      await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
      continue;
    }

    const qtyOverride = sig.signal_data?.qty_override ? Math.min(Number(sig.signal_data.qty_override), 10_000) : 0;
    const qty = qtyOverride > 0 ? qtyOverride : Math.floor((ctx.maxPerTrade * APPROVED_BUY_RATIO) / price);
    if (qty <= 0) continue;

    const result = await limitBuyOrder(ctx.config, sig.stock_code, qty, price);
    actions.push({
      type: result.success ? "approved_buy" : "approved_buy_failed",
      code: sig.stock_code, name,
      detail: result.success
        ? `승인 지정가 매수 ${qty}주 @ ${result.limitPrice.toLocaleString()}원 (점수: ${sig.signal_score}) (${result.msg})`
        : `승인 매수 실패: ${result.msg}`,
    });

    if (result.success) {
      await savePendingOrder({
        stock_code: sig.stock_code,
        stock_name: name,
        order_no: result.ordNo ?? "",
        order_qty: qty,
        limit_price: result.limitPrice,
        signal_score: sig.signal_score ?? null,
      });
      const existingPos15 = await getOpenPosition(sig.stock_code);
      if (!existingPos15) {
        await openPosition(sig.stock_code, name, result.limitPrice, qty, { strength: "weak", side: "buy", totalScore: sig.signal_score, comment: sig.signal_comment ?? "", indicators: [], raw: EMPTY_RAW, matchCount: 0 } as SignalResult, "initial", sector15 ?? undefined);
      }
      await sendTradeAlert({ type: "buy", code: sig.stock_code, name, qty, price: result.limitPrice, score: sig.signal_score });
      // 섹터 카운트 즉시 갱신 — 루프 내 중복 매수 방지
      if (sector15) sectorCounts15.set(sector15, (sectorCounts15.get(sector15) ?? 0) + 1);
      tradeCount++;
    }

    await supabase.from("pending_signals").update({ status: "expired", resolved_at: new Date().toISOString() }).eq("id", sig.id);
    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount };
}

