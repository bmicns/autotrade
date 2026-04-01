// NEXIO 자가 학습 엔진
// 과거 매매 성과 기반으로 지표 가중치 + 리스크 파라미터 자동 조정

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── 기본 가중치 (레짐별) ────────────────────────
const BASE_WEIGHTS = {
  trending: { RSI: 8, MACD: 26, 이동평균: 22, 볼린저: 8, 거래량: 21, 캔들패턴: 15 },
  ranging:  { RSI: 21, MACD: 13, 이동평균: 13, 볼린저: 21, 거래량: 17, 캔들패턴: 15 },
};

const INDICATOR_NAMES = ["RSI", "MACD", "이동평균", "볼린저", "거래량", "캔들패턴"] as const;

export interface LearnedWeights {
  trending: Record<string, number>;
  ranging: Record<string, number>;
  source: "learned" | "default";
  sampleSize: number;
  learnedAt: string;
}

export interface LearnedRiskParams {
  stopLoss: number;
  takeProfit: number;
  trailingStop: number;
  takeProfitRatio: number;
  source: "learned" | "default";
  winRate: number;
  avgWin: number;
  avgLoss: number;
  sampleSize: number;
}

// ─── 1. 지표별 적중률 기반 가중치 자동 조정 ──────
export async function learnWeights(lookbackDays = 30): Promise<LearnedWeights> {
  const defaults: LearnedWeights = {
    trending: { ...BASE_WEIGHTS.trending },
    ranging: { ...BASE_WEIGHTS.ranging },
    source: "default", sampleSize: 0, learnedAt: new Date().toISOString(),
  };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase.from("positions").select("*")
      .eq("status", "closed").gte("exit_date", since);

    if (!data || data.length < 10) return defaults; // 최소 10건 필요

    // 레짐별 지표 성과 수집
    const regimeStats: Record<string, Record<string, { total: number; wins: number }>> = {
      trending: {}, ranging: {},
    };
    for (const name of INDICATOR_NAMES) {
      regimeStats.trending[name] = { total: 0, wins: 0 };
      regimeStats.ranging[name] = { total: 0, wins: 0 };
    }

    for (const pos of data) {
      const signal = pos.entry_signal as {
        indicators?: Array<{ name: string; hit: boolean }>;
        raw?: { regime?: string };
      } | null;
      if (!signal?.indicators) continue;

      const regime = signal.raw?.regime === "trending" ? "trending" : "ranging";
      const isWin = (Number(pos.pnl_amount) || 0) > 0;

      for (const ind of signal.indicators) {
        if (!ind.hit) continue;
        const stat = regimeStats[regime][ind.name];
        if (stat) {
          stat.total++;
          if (isWin) stat.wins++;
        }
      }
    }

    // 적중률 기반 가중치 조정
    const adjustWeights = (regime: "trending" | "ranging") => {
      const base = { ...BASE_WEIGHTS[regime] };
      const stats = regimeStats[regime];
      const adjustments: Record<string, number> = {};

      for (const name of INDICATOR_NAMES) {
        const s = stats[name];
        if (s.total < 3) {
          adjustments[name] = base[name]; // 데이터 부족: 기본값 유지
          continue;
        }
        const accuracy = s.wins / s.total; // 0~1
        // 적중률 50% 기준으로 가중치 조정 (±50% 범위)
        // 적중률 80% → 가중치 1.6배, 적중률 20% → 가중치 0.4배
        const multiplier = 0.4 + accuracy * 1.2; // 0.4 ~ 1.6
        adjustments[name] = Math.round(base[name] * multiplier);
      }

      // 합계 100으로 정규화
      const sum = Object.values(adjustments).reduce((s, v) => s + v, 0);
      if (sum > 0) {
        for (const name of INDICATOR_NAMES) {
          adjustments[name] = Math.round((adjustments[name] / sum) * 100);
        }
      }

      return adjustments;
    };

    return {
      trending: adjustWeights("trending"),
      ranging: adjustWeights("ranging"),
      source: "learned",
      sampleSize: data.length,
      learnedAt: new Date().toISOString(),
    };
  } catch {
    return defaults;
  }
}

// ─── 2. 리스크 파라미터 자동 튜닝 ────────────────
export async function learnRiskParams(lookbackDays = 60): Promise<LearnedRiskParams> {
  const defaults: LearnedRiskParams = {
    stopLoss: -5, takeProfit: 5, trailingStop: -3, takeProfitRatio: 50,
    source: "default", winRate: 0, avgWin: 0, avgLoss: 0, sampleSize: 0,
  };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase.from("positions").select("*")
      .eq("status", "closed").gte("exit_date", since);

    if (!data || data.length < 10) return defaults;

    const wins = data.filter((p) => (Number(p.pnl_percent) || 0) > 0);
    const losses = data.filter((p) => (Number(p.pnl_percent) || 0) <= 0);

    const winRate = wins.length / data.length;
    const avgWin = wins.length > 0
      ? wins.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0) / wins.length
      : 5;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((s, p) => s + (Number(p.pnl_percent) || 0), 0) / losses.length)
      : 5;

    // ── 청산 사유별 분석 ──
    const exitStats: Record<string, { count: number; avgPnl: number }> = {};
    for (const p of data) {
      const reason = p.exit_reason || "unknown";
      if (!exitStats[reason]) exitStats[reason] = { count: 0, avgPnl: 0 };
      exitStats[reason].count++;
      exitStats[reason].avgPnl += Number(p.pnl_percent) || 0;
    }
    for (const key of Object.keys(exitStats)) {
      exitStats[key].avgPnl /= exitStats[key].count;
    }

    // ── 파라미터 최적화 로직 ──

    // 손절: 손절로 나간 거래의 평균 손실이 크면 → 더 빨리 손절
    // 손절로 나간 거래가 적으면 → 현재 수준 유지
    let stopLoss = -5;
    if (exitStats.stop_loss) {
      const stopLossAvgPnl = exitStats.stop_loss.avgPnl;
      // 평균 손절 손실이 -7% 이하면 너무 늦음 → 좁히기
      if (stopLossAvgPnl < -7) stopLoss = -3;
      else if (stopLossAvgPnl < -5) stopLoss = -4;
      else stopLoss = -5;
    }

    // 익절: 평균 수익률 기반 조정
    // 평균 수익이 높으면 → 익절 라인을 올려서 더 큰 수익 추구
    let takeProfit = 5;
    if (avgWin > 8) takeProfit = 8;
    else if (avgWin > 5) takeProfit = 6;
    else if (avgWin > 3) takeProfit = 5;
    else takeProfit = 3;

    // 트레일링: 트레일링으로 나간 거래의 평균 수익이 높으면 → 현재 적절
    let trailingStop = -3;
    if (exitStats.trailing_stop) {
      const tsAvgPnl = exitStats.trailing_stop.avgPnl;
      // 트레일링 청산 수익이 낮으면 → 더 타이트하게
      if (tsAvgPnl < 2) trailingStop = -2;
      else if (tsAvgPnl > 5) trailingStop = -4; // 수익 좋으면 여유
      else trailingStop = -3;
    }

    // 익절 비율: 승률 기반
    // 승률 높으면 → 적게 팔고 나머지 트레일링 (30%)
    // 승률 낮으면 → 많이 팔아 확정 수익 (70%)
    let takeProfitRatio = 50;
    if (winRate > 0.6) takeProfitRatio = 30;
    else if (winRate > 0.5) takeProfitRatio = 40;
    else if (winRate < 0.35) takeProfitRatio = 70;
    else takeProfitRatio = 50;

    return {
      stopLoss, takeProfit, trailingStop, takeProfitRatio,
      source: "learned", winRate: Math.round(winRate * 100),
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      sampleSize: data.length,
    };
  } catch {
    return defaults;
  }
}

// ─── 3. 통합 학습 실행 ──────────────────────────
export interface LearningResult {
  weights: LearnedWeights;
  risk: LearnedRiskParams;
  timestamp: string;
}

export async function runLearning(): Promise<LearningResult> {
  const [weights, risk] = await Promise.all([
    learnWeights(30),
    learnRiskParams(60),
  ]);
  return { weights, risk, timestamp: new Date().toISOString() };
}
