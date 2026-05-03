import { supabase } from "@/lib/supabase/api-client";
import {
  calcATR, calcDynamicRisk,
  checkRisk, type AtrMultipliers, type SignalRaw,
} from "@/lib/kis/indicators";
import { getPrice, getDailyCandles, getBalance, limitBuyOrder, cancelOpenBuyOrders } from "@/lib/engine/kis";
import { type DailyCandle } from "@/lib/kis/indicators";
import { applySectorFilter, applyStockFilter, getListingDate } from "@/lib/engine/filters";
import { getMarketTrend, getInvestorTrend } from "@/lib/engine/market";
import { getOpenPosition, getTodayRealizedLoss, getSectorCounts, getPendingOrders, resolvePendingSignal, savePendingOrder, recordTradeMemory } from "@/lib/engine/db";
import { getStrategyBudget, type StrategyKey } from "@/lib/engine/strategies";
import { type EngineAction, type StepContext, type MarketTrend } from "@/lib/engine/types";
import { sendTradeAlert } from "@/lib/engine/notify";
import { APPROVED_BUY_RATIO, SECOND_TP_RATIO, DEFAULT_MARKET_CRASH_THRESHOLD } from "@/lib/engine/constants";
import { batchFetch, getOpeningBonus } from "@/lib/engine/utils";
import { executePartialExit, executeRiskSell, reconcilePendingOrderFill } from "@/lib/engine/position-flow";
import { type PendingSignalStatus } from "@/lib/engine/lifecycle";
export { batchFetch, getOpeningBonus };

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
    const action = await reconcilePendingOrderFill({ ctx, order });
    if (action) actions.push(action);
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
  const holdDays = Math.ceil((Date.now() - new Date(params.pos!.entry_date).getTime()) / 86400000);
  const { action, tradeCount } = await executeRiskSell({
    ctx: params.ctx,
    code: params.code,
    name: params.name,
    qty: params.qty,
    avgPrice: params.avgPrice,
    currentPrice: params.currentPrice,
    entryDate: params.pos?.entry_date,
    actionType: "max_hold",
    detail: `보유 ${holdDays}일 초과 (최대 ${params.maxHoldDays}일) → 전량 청산 ${params.qty}주`,
    alertType: "stop_loss",
  });
  await new Promise((r) => setTimeout(r, 200));
  return { actions: [action], tradeCount };
}

// ─── STEP 1 내부 헬퍼: 2단계 익절 실행 ──────────────
// ═══ STEP 1: 보유종목 손절/익절/기간초과 감시 ═══
export async function runStep1(ctx: StepContext, _marketTrend: MarketTrend): Promise<{
  actions: EngineAction[];
  tradeCount: number;
  holdings: Record<string, string>[];
}> {
  void _marketTrend;
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
          const { action, tradeCount: sold } = await executeRiskSell({
            ctx,
            code,
            name,
            qty,
            avgPrice,
            currentPrice,
            entryDate: pos?.entry_date,
            actionType: "orgn_flip_sell",
            detail: `기관 순매도 전환 청산 (${investor.orgn.toFixed(0)}억) → 매도 ${qty}주`,
            alertType: "stop_loss",
          });
          actions.push(action);
          tradeCount += sold;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      } catch { /* 기관 데이터 조회 실패 시 ATR 로직으로 폴백 */ }
    }

    if (risk.action !== "hold") {
      if (risk.action === "take_profit") {
        const r = await executePartialExit({
          ctx,
          code,
          name,
          qty,
          avgPrice,
          currentPrice,
          entryDate: pos?.entry_date,
          currentPhase: pos?.phase,
          riskAction: risk.action,
          riskReason: risk.reason,
          secondTakeProfitRatio: SECOND_TP_RATIO,
        });
        actions.push(...r.actions);
        tradeCount += r.tradeCount;
      } else {
        const { action, tradeCount: sold } = await executeRiskSell({
          ctx,
          code,
          name,
          qty,
          avgPrice,
          currentPrice,
          entryDate: pos?.entry_date,
          actionType: risk.action,
          detail: `${risk.reason} → 매도 ${qty}주`,
          alertType: risk.action as "sell" | "stop_loss" | "take_profit",
        });
        actions.push(action);
        tradeCount += sold;
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

  async function resolveSignal(id: string, status: PendingSignalStatus, detail?: string) {
    await resolvePendingSignal(id, status, detail);
  }

  type PendingSignalRow = {
    id: string;
    stock_code: string;
    stock_name?: string | null;
    signal_score: number;
    signal_comment?: string | null;
    signal_data?: {
      qty_override?: number | string;
      strategyKey?: StrategyKey;
      allocationPct?: number | string;
      raw?: SignalRaw;
      indicators?: unknown[];
      matchCount?: number;
      openingBonus?: number;
      institutionalBonus?: number;
    } | null;
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
      await resolveSignal(sig.id, "expired", "이미 보유 중이라 자동 만료");
      continue;
    }

    const priceData = await getPrice(ctx.config, sig.stock_code);
    const price = Number(priceData?.stck_prpr) || 0;
    const name = priceData?.hts_kor_isnm || sig.stock_name || sig.stock_code;
    if (price <= 0) {
      await resolveSignal(sig.id, "failed", "현재가 조회 실패");
      actions.push({ type: "approved_buy_failed", code: sig.stock_code, name, detail: "현재가 조회 실패" });
      continue;
    }

    const sector15 = (priceData as Record<string, string>).bstp_kor_isnm || null;
    const sectorFilter15 = applySectorFilter(sector15, sectorCounts15, ctx.maxPerSector);
    if (!sectorFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: sectorFilter15.reason });
      await resolveSignal(sig.id, "rejected", sectorFilter15.reason);
      continue;
    }

    // 수동매수 포함 모든 경로: 관리종목/정리매매 필터 적용
    const listingDate15 = await getListingDate(ctx.config, sig.stock_code);
    const stockFilter15 = applyStockFilter(priceData as Record<string, string>, listingDate15);
    if (!stockFilter15.passed) {
      actions.push({ type: "skip", code: sig.stock_code, name, detail: `종목 필터: ${stockFilter15.reason}` });
      await resolveSignal(sig.id, "rejected", `종목 필터: ${stockFilter15.reason}`);
      continue;
    }

    const qtyOverride = sig.signal_data?.qty_override ? Math.min(Number(sig.signal_data.qty_override), 10_000) : 0;
    const strategyKey = sig.signal_data?.strategyKey;
    const allocationPct = Number(sig.signal_data?.allocationPct);
    const allocatedBudget = strategyKey
      ? getStrategyBudget(
          ctx.maxPerTrade,
          Number.isFinite(allocationPct) ? allocationPct : ctx.strategyAllocations[strategyKey]
        )
      : ctx.maxPerTrade;
    const qty = qtyOverride > 0 ? qtyOverride : Math.floor((allocatedBudget * APPROVED_BUY_RATIO) / price);
    if (qty <= 0) {
      await resolveSignal(sig.id, "failed", "주문 수량이 0주로 계산됨");
      actions.push({ type: "approved_buy_failed", code: sig.stock_code, name, detail: "주문 수량이 0주로 계산됨" });
      continue;
    }

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
      await sendTradeAlert({ type: "buy", code: sig.stock_code, name, qty, price: result.limitPrice, score: sig.signal_score });
      if (sig.signal_data?.raw) {
        const storedRaw = sig.signal_data.raw;
        const syntheticSignal = {
          indicators: (sig.signal_data.indicators ?? []) as import("@/lib/kis/indicators").IndicatorResult[],
          totalScore: sig.signal_score,
          matchCount: sig.signal_data.matchCount ?? 0,
          strength: "strong" as const,
          side: "buy" as const,
          comment: "",
          raw: storedRaw,
        };
        await recordTradeMemory({
          code: sig.stock_code,
          name,
          baseSignal: syntheticSignal,
          learnedSignal: syntheticSignal,
          bonuses: {
            market: 0,
            investor: sig.signal_data.institutionalBonus ?? 0,
            snapshot: sig.signal_data.openingBonus ?? 0,
          },
          adjustedScore: sig.signal_score,
          weightsSource: "default",
          positionSize: qty * result.limitPrice,
        });
      }
      // 섹터 카운트 즉시 갱신 — 루프 내 중복 매수 방지
      if (sector15) sectorCounts15.set(sector15, (sectorCounts15.get(sector15) ?? 0) + 1);
      tradeCount++;
      await resolveSignal(sig.id, "expired", "주문 접수 완료");
    } else {
      await resolveSignal(sig.id, "failed", result.msg);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return { actions, tradeCount };
}
