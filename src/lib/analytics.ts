// NEXIO 성과 분석 엔진

export interface Position {
  id: string;
  stock_code: string;
  stock_name: string | null;
  entry_price: number;
  entry_qty: number;
  entry_date: string;
  entry_signal: Record<string, unknown> | null;
  signal_strength: string | null;
  exit_price: number | null;
  exit_date: string | null;
  exit_reason: string | null;
  pnl_amount: number | null;
  pnl_percent: number | null;
  hold_days: number | null;
  status: string;
}

export interface PerformanceStats {
  totalTrades: number;
  openPositions: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;           // 0~100 %
  avgReturn: number;         // 평균 수익률 %
  totalPnl: number;          // 총 실현 손익 (원)
  profitFactor: number;      // 총이익 / 총손실
  maxDrawdown: number;       // 최대 낙폭 %
  avgHoldDays: number;       // 평균 보유일
  bestTrade: { code: string; name: string; pnl: number } | null;
  worstTrade: { code: string; name: string; pnl: number } | null;
  indicatorAccuracy: IndicatorAccuracy[];
  monthlyBreakdown: MonthlyPnl[];
  exitReasonBreakdown: ExitReasonCount[];
}

export interface IndicatorAccuracy {
  name: string;
  totalUsed: number;     // 해당 지표가 hit인 상태로 진입한 횟수
  winCount: number;       // 그 중 수익 낸 횟수
  accuracy: number;       // 적중률 %
}

export interface MonthlyPnl {
  month: string;   // "2026-03"
  pnl: number;
  trades: number;
  winRate: number;
}

export interface ExitReasonCount {
  reason: string;
  count: number;
  avgPnl: number;
}

// ─── 승률 ────────────────────────────────────────
function calcWinRate(closed: Position[]): { winCount: number; lossCount: number; winRate: number } {
  if (closed.length === 0) return { winCount: 0, lossCount: 0, winRate: 0 };
  const winCount = closed.filter((p) => (p.pnl_amount ?? 0) > 0).length;
  const lossCount = closed.length - winCount;
  return { winCount, lossCount, winRate: (winCount / closed.length) * 100 };
}

// ─── Profit Factor ───────────────────────────────
function calcProfitFactor(closed: Position[]): number {
  let grossProfit = 0, grossLoss = 0;
  for (const p of closed) {
    const pnl = p.pnl_amount ?? 0;
    if (pnl > 0) grossProfit += pnl;
    else grossLoss += Math.abs(pnl);
  }
  return grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
}

// ─── MDD (Maximum Drawdown) ─────────────────────
function calcMDD(closed: Position[]): number {
  if (closed.length === 0) return 0;
  // 시간 순 정렬
  const sorted = [...closed].sort((a, b) =>
    new Date(a.exit_date!).getTime() - new Date(b.exit_date!).getTime()
  );
  let cumPnl = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of sorted) {
    cumPnl += p.pnl_amount ?? 0;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ─── 지표별 적중률 ──────────────────────────────
function calcIndicatorAccuracy(closed: Position[]): IndicatorAccuracy[] {
  const INDICATOR_NAMES = ["RSI", "MACD", "이동평균", "볼린저", "거래량"];
  const stats = INDICATOR_NAMES.map((name) => ({ name, totalUsed: 0, winCount: 0 }));

  for (const p of closed) {
    const signal = p.entry_signal as { indicators?: Array<{ name: string; hit: boolean }> } | null;
    if (!signal?.indicators) continue;
    const isWin = (p.pnl_amount ?? 0) > 0;

    for (const ind of signal.indicators) {
      if (!ind.hit) continue;
      const stat = stats.find((s) => s.name === ind.name);
      if (stat) {
        stat.totalUsed++;
        if (isWin) stat.winCount++;
      }
    }
  }

  return stats.map((s) => ({
    ...s,
    accuracy: s.totalUsed > 0 ? (s.winCount / s.totalUsed) * 100 : 0,
  }));
}

// ─── 월별 손익 ──────────────────────────────────
function calcMonthlyBreakdown(closed: Position[]): MonthlyPnl[] {
  const map = new Map<string, { pnl: number; trades: number; wins: number }>();

  for (const p of closed) {
    if (!p.exit_date) continue;
    const month = p.exit_date.slice(0, 7); // "2026-03"
    const entry = map.get(month) || { pnl: 0, trades: 0, wins: 0 };
    entry.pnl += p.pnl_amount ?? 0;
    entry.trades++;
    if ((p.pnl_amount ?? 0) > 0) entry.wins++;
    map.set(month, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      pnl: v.pnl,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
    }));
}

// ─── 청산 사유별 분석 ───────────────────────────
function calcExitReasonBreakdown(closed: Position[]): ExitReasonCount[] {
  const map = new Map<string, { count: number; totalPnl: number }>();

  for (const p of closed) {
    const reason = p.exit_reason || "unknown";
    const entry = map.get(reason) || { count: 0, totalPnl: 0 };
    entry.count++;
    entry.totalPnl += p.pnl_amount ?? 0;
    map.set(reason, entry);
  }

  return Array.from(map.entries()).map(([reason, v]) => ({
    reason,
    count: v.count,
    avgPnl: v.count > 0 ? v.totalPnl / v.count : 0,
  }));
}

// ─── 종합 성과 분석 ─────────────────────────────
export function analyzePerformance(positions: Position[]): PerformanceStats {
  const closed = positions.filter((p) => p.status === "closed");
  const open = positions.filter((p) => p.status === "open");

  const { winCount, lossCount, winRate } = calcWinRate(closed);
  const profitFactor = calcProfitFactor(closed);
  const maxDrawdown = calcMDD(closed);
  const indicatorAccuracy = calcIndicatorAccuracy(closed);
  const monthlyBreakdown = calcMonthlyBreakdown(closed);
  const exitReasonBreakdown = calcExitReasonBreakdown(closed);

  const totalPnl = closed.reduce((s, p) => s + (p.pnl_amount ?? 0), 0);
  const avgReturn = closed.length > 0
    ? closed.reduce((s, p) => s + (p.pnl_percent ?? 0), 0) / closed.length
    : 0;
  const avgHoldDays = closed.length > 0
    ? closed.reduce((s, p) => s + (p.hold_days ?? 0), 0) / closed.length
    : 0;

  let bestTrade: PerformanceStats["bestTrade"] = null;
  let worstTrade: PerformanceStats["worstTrade"] = null;
  for (const p of closed) {
    const pnl = p.pnl_amount ?? 0;
    if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { code: p.stock_code, name: p.stock_name || p.stock_code, pnl };
    if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { code: p.stock_code, name: p.stock_name || p.stock_code, pnl };
  }

  return {
    totalTrades: positions.length,
    openPositions: open.length,
    closedTrades: closed.length,
    winCount, lossCount, winRate,
    avgReturn, totalPnl, profitFactor,
    maxDrawdown, avgHoldDays,
    bestTrade, worstTrade,
    indicatorAccuracy, monthlyBreakdown, exitReasonBreakdown,
  };
}
