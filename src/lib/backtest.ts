/**
 * 백테스트 엔진
 * 과거 캔들 데이터로 현재 전략을 시뮬레이션하여 성과 측정
 */

import { analyzeSignal, checkRisk, type DailyCandle } from "@/lib/kis/indicators";

// ─── 타입 ──────────────────────────────────────

export interface BacktestConfig {
  stockCode: string;
  stockName?: string;
  candles: DailyCandle[];
  initialCash: number;
  stopLoss: number;       // % (예: -5)
  trailingStop: number;   // % (예: -3)
  partialExitRatio: number;
  maxHoldDays: number;
  maxPerTrade: number;    // 최대 매수 금액
}

export interface BacktestTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  holdDays: number;
  exitReason: string;
  signal: string;
  patterns: string[];
}

export interface BacktestResult {
  stockCode: string;
  stockName: string;
  period: string;
  totalReturn: number;
  totalPnl: number;
  trades: BacktestTrade[];
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldDays: number;
  monthlyReturns: { month: string; returnPct: number; trades: number }[];
  patternStats: { pattern: string; count: number; winRate: number; avgPnl: number }[];
  equityCurve: { date: string; equity: number }[];
  config: { stopLoss: number; trailingStop: number; partialExitRatio: number; maxHoldDays: number };
}

// ─── 백테스트 실행 ─────────────────────────────

export function runBacktest(config: BacktestConfig): BacktestResult {
  const {
    stockCode, stockName = stockCode, candles, initialCash,
    stopLoss, trailingStop, partialExitRatio, maxHoldDays, maxPerTrade,
  } = config;

  const trades: BacktestTrade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  const patternMap = new Map<string, { wins: number; total: number; pnlSum: number }>();

  let cash = initialCash;
  let position: {
    entryDate: string;
    entryPrice: number;
    quantity: number;
    highSinceEntry: number;
    phase: "initial" | "partial_tp";
    partialExitPrice: number | null;
    partialExitQty: number;
    signal: string;
    patterns: string[];
  } | null = null;

  // 최소 26일 필요 (지표 계산용)
  const startIdx = Math.max(26, 5);

  for (let i = startIdx; i < candles.length; i++) {
    const today = candles[i];
    const window = candles.slice(0, i + 1);

    // 기술 지표 분석 (캔들 패턴은 analyzeSignal 내부에서 처리)
    const signal = analyzeSignal(window);
    const patternIndicator = signal.indicators.find((ind) => ind.name === "캔들패턴");
    const patternNames = patternIndicator && patternIndicator.value !== "패턴 없음"
      ? patternIndicator.value.split(", ") : [];

    // ── 보유 중: 리스크 체크 ──
    if (position) {
      position.highSinceEntry = Math.max(position.highSinceEntry, today.high);

      const risk = checkRisk(
        position.entryPrice,
        today.close,
        position.highSinceEntry,
        stopLoss,
        trailingStop,
      );

      // 매도 신호 체크
      const sellSignal = signal.side === "sell";
      const holdDays = Math.max(1, Math.round((new Date(today.date).getTime() - new Date(position.entryDate).getTime()) / 86400000));
      const pnlPercentNow = ((today.close - position.entryPrice) / position.entryPrice) * 100;
      const shouldMaxHoldSell = holdDays >= maxHoldDays && pnlPercentNow <= 0;

      if (risk.action === "trailing_stop" && position.phase === "initial" && position.quantity > 1) {
        const partialQty = Math.max(1, Math.floor(position.quantity * partialExitRatio / 100));
        const remainingQty = position.quantity - partialQty;

        if (remainingQty > 0) {
          cash += partialQty * today.close;
          position.quantity = remainingQty;
          position.phase = "partial_tp";
          position.partialExitPrice = today.close;
          position.partialExitQty = partialQty;
        }
      } else if (risk.action !== "hold" || sellSignal || shouldMaxHoldSell) {
        const exitReason = shouldMaxHoldSell
          ? "max_hold_sell"
          : risk.action !== "hold"
            ? risk.reason
            : "signal_sell";
        const partialPnl = position.partialExitPrice && position.partialExitQty > 0
          ? (position.partialExitPrice - position.entryPrice) * position.partialExitQty
          : 0;
        const finalPnl = (today.close - position.entryPrice) * position.quantity;
        const totalQty = position.quantity + position.partialExitQty;
        const pnl = partialPnl + finalPnl;
        const pnlPercent = totalQty > 0 && position.entryPrice > 0
          ? (pnl / (position.entryPrice * totalQty)) * 100
          : 0;

        trades.push({
          entryDate: position.entryDate,
          entryPrice: position.entryPrice,
          exitDate: today.date,
          exitPrice: today.close,
          quantity: totalQty,
          pnl: Math.round(pnl),
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          holdDays,
          exitReason,
          signal: position.signal,
          patterns: position.patterns,
        });

        // 패턴 통계 업데이트
        for (const pName of position.patterns) {
          const stat = patternMap.get(pName) ?? { wins: 0, total: 0, pnlSum: 0 };
          stat.total++;
          stat.pnlSum += pnlPercent;
          if (pnl > 0) stat.wins++;
          patternMap.set(pName, stat);
        }

        cash += position.quantity * today.close;
        position = null;
      }
    }

    // ── 미보유: 매수 신호 체크 ──
    if (!position) {
      const buyCondition = signal.strength !== "none" && signal.side === "buy";

      if (buyCondition && today.close > 0) {
        const investAmount = Math.min(cash, maxPerTrade);
        const quantity = Math.floor(investAmount / today.close);

        if (quantity > 0) {
          const cost = quantity * today.close;
          cash -= cost;
          position = {
            entryDate: today.date,
            entryPrice: today.close,
            quantity,
            highSinceEntry: today.close,
            phase: "initial",
            partialExitPrice: null,
            partialExitQty: 0,
            signal: signal.comment,
            patterns: patternNames,
          };
        }
      }
    }

    // equity curve
    const stockValue = position ? position.quantity * today.close : 0;
    equityCurve.push({ date: today.date, equity: Math.round(cash + stockValue) });
  }

  // 미청산 포지션 마지막 봉에서 강제 청산
  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    const partialPnl = position.partialExitPrice && position.partialExitQty > 0
      ? (position.partialExitPrice - position.entryPrice) * position.partialExitQty
      : 0;
    const pnl = partialPnl + (last.close - position.entryPrice) * position.quantity;
    const totalQty = position.quantity + position.partialExitQty;
    const pnlPercent = totalQty > 0 && position.entryPrice > 0
      ? (pnl / (position.entryPrice * totalQty)) * 100
      : 0;
    const holdDays = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(position.entryDate).getTime()) / 86400000));

    trades.push({
      entryDate: position.entryDate,
      entryPrice: position.entryPrice,
      exitDate: last.date,
      exitPrice: last.close,
      quantity: totalQty,
      pnl: Math.round(pnl),
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      holdDays,
      exitReason: "backtest_end",
      signal: position.signal,
      patterns: position.patterns,
    });

    for (const pName of position.patterns) {
      const stat = patternMap.get(pName) ?? { wins: 0, total: 0, pnlSum: 0 };
      stat.total++;
      stat.pnlSum += pnlPercent;
      if (pnl > 0) stat.wins++;
      patternMap.set(pName, stat);
    }

    cash += position.quantity * last.close;
  }

  // ── 결과 집계 ──
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // MDD
  let peak = initialCash;
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = ((peak - point.equity) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe (일별 수익률 기반, 연환산)
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity);
  }
  const avgDailyReturn = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
  const stdDailyReturn = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - avgDailyReturn) ** 2, 0) / (dailyReturns.length || 1));
  const sharpeRatio = stdDailyReturn > 0 ? (avgDailyReturn / stdDailyReturn) * Math.sqrt(252) : 0;

  // 월별 수익률
  const monthlyMap = new Map<string, { pnl: number; trades: number }>();
  for (const t of trades) {
    const month = t.exitDate.slice(0, 7); // YYYY-MM
    const m = monthlyMap.get(month) ?? { pnl: 0, trades: 0 };
    m.pnl += t.pnl;
    m.trades++;
    monthlyMap.set(month, m);
  }
  const monthlyReturns = Array.from(monthlyMap.entries())
    .map(([month, { pnl, trades: count }]) => ({
      month,
      returnPct: Math.round((pnl / initialCash) * 10000) / 100,
      trades: count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 패턴 통계
  const patternStats = Array.from(patternMap.entries()).map(([pattern, stat]) => ({
    pattern,
    count: stat.total,
    winRate: stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : 0,
    avgPnl: stat.total > 0 ? Math.round((stat.pnlSum / stat.total) * 100) / 100 : 0,
  })).sort((a, b) => b.count - a.count);

  // 기간 문자열
  const periodStr = candles.length > 0
    ? `${candles[startIdx]?.date ?? "?"} ~ ${candles[candles.length - 1]?.date ?? "?"}`
    : "";

  const finalEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCash;

  return {
    stockCode,
    stockName,
    period: periodStr,
    totalReturn: Math.round(((finalEquity - initialCash) / initialCash) * 10000) / 100,
    totalPnl: Math.round(finalEquity - initialCash),
    trades,
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: trades.length > 0 ? Math.round((wins.length / trades.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    avgHoldDays: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length) : 0,
    monthlyReturns,
    patternStats,
    equityCurve,
    config: { stopLoss, trailingStop, partialExitRatio, maxHoldDays },
  };
}
