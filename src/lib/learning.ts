// NEXIO 자가 학습 엔진 v2
// 매매 경험(trade_memory) 기반으로 지표 가중치 + ATR 배수 + 포지션 사이징 자동 조정
// 신뢰도 등급별 적용 범위 차등화 (none/low/medium/high)

import { supabase } from "@/lib/supabase/api-client";
import { AtrMultipliers, DEFAULT_ATR_MULTIPLIERS } from "@/lib/kis/indicators";
import {
  calcConfidence,
  learnWeights,
  learnAtrMultipliers,
  learnPositionSizing,
  learnRiskParamsTakeProfitRatio,
  learnPatternStats,
  saveLearning,
  calcOverallStats,
} from "@/lib/learning-engine";

// 타입 re-export (외부에서 @/lib/learning에서 import 가능)
export type {
  LearnedWeights,
  LearnedAtrMultipliers,
  LearnedPositionSizing,
  PatternStats,
  LearningResult,
} from "@/lib/learning-engine";

// calcConfidence re-export
export { calcConfidence };

// ─── 기본 가중치 (레짐별, snapshotToResult에서 사용) ──────────
const BASE_WEIGHTS = {
  trending: { RSI: 8, MACD: 26, 이동평균: 22, 볼린저: 8, 거래량: 21, 캔들패턴: 15 },
  ranging:  { RSI: 21, MACD: 13, 이동평균: 13, 볼린저: 21, 거래량: 17, 캔들패턴: 15 },
};

// ─── learning_snapshots DB 행 타입 ───────────────
export interface LearningSnapshot {
  id: string;
  created_at: string;
  sample_size: number;
  confidence: "none" | "low" | "medium" | "high";
  weights_trending: Record<string, number>;
  weights_ranging: Record<string, number>;
  weights_source: string;
  atr_mult_stop: number;
  atr_mult_profit: number;
  atr_mult_trailing: number;
  atr_source: string;
  target_risk_amount: number;
  sizing_source: string;
  take_profit_ratio: number;
  risk_source: string;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  pattern_stats: import("@/lib/learning-engine").PatternStats | null;
  is_active: boolean;
  expires_at: string;
}

// ─── 7. 최신 학습 결과 로딩 (만료 폴백 포함) ─────
export async function loadLatestLearning(): Promise<import("@/lib/learning-engine").LearningResult | null> {
  try {
    const { data: active } = await supabase
      .from("learning_snapshots")
      .select("*")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (active) return snapshotToResult(active as LearningSnapshot, false);

    const { data: fallback } = await supabase
      .from("learning_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fallback) {
      const daysSince = Math.floor(
        (Date.now() - new Date(fallback.created_at).getTime()) / 86400000
      );
      console.warn(`⚠️ 학습 만료됨 (${daysSince}일 전). 폴백 스냅샷 사용 중.`);
      return snapshotToResult(fallback as LearningSnapshot, true);
    }

    return null;
  } catch {
    return null;
  }
}

function snapshotToResult(snap: LearningSnapshot, isExpired: boolean): import("@/lib/learning-engine").LearningResult {
  void isExpired;
  return {
    weights: {
      trending: snap.weights_trending ?? { ...BASE_WEIGHTS.trending },
      ranging: snap.weights_ranging ?? { ...BASE_WEIGHTS.ranging },
      source: (snap.weights_source ?? "default") as "learned" | "default",
      sampleSize: snap.sample_size ?? 0,
      learnedAt: snap.created_at,
    },
    atrMultipliers: {
      stop: snap.atr_mult_stop ?? DEFAULT_ATR_MULTIPLIERS.stop,
      profit: snap.atr_mult_profit ?? DEFAULT_ATR_MULTIPLIERS.profit,
      trailing: snap.atr_mult_trailing ?? DEFAULT_ATR_MULTIPLIERS.trailing,
      source: (snap.atr_source ?? "default") as "learned" | "default",
      sampleSize: snap.sample_size ?? 0,
    },
    positionSizing: {
      targetRiskAmount: snap.target_risk_amount ?? 30000,
      source: (snap.sizing_source ?? "default") as "learned" | "default",
    },
    risk: {
      takeProfitRatio: snap.take_profit_ratio ?? 50,
      source: (snap.risk_source ?? "default") as "learned" | "default",
    },
    patternStats: snap.pattern_stats ?? { rsiRanges: [], macdPatterns: [], combos: [] },
    confidence: snap.confidence ?? "none",
    sampleSize: snap.sample_size ?? 0,
    timestamp: snap.created_at,
    winRate: snap.win_rate ?? 0,
    avgWin: snap.avg_win ?? 0,
    avgLoss: snap.avg_loss ?? 0,
  };
}

// ─── 8. 통합 학습 실행 ──────────────────────────
export async function runLearning(): Promise<import("@/lib/learning-engine").LearningResult> {
  const [weights, atrMultipliers, positionSizing, riskParams, patternStats] = await Promise.all([
    learnWeights(30),
    learnAtrMultipliers(60),
    learnPositionSizing(),
    learnRiskParamsTakeProfitRatio(60),
    learnPatternStats(60),
  ]);

  const sampleSize = Math.max(weights.sampleSize, atrMultipliers.sampleSize);
  const confidence = calcConfidence(sampleSize);
  const { winRate, avgWin, avgLoss } = await calcOverallStats(60);

  const result: import("@/lib/learning-engine").LearningResult = {
    weights,
    atrMultipliers,
    positionSizing,
    risk: riskParams,
    patternStats,
    confidence,
    sampleSize,
    timestamp: new Date().toISOString(),
    winRate,
    avgWin,
    avgLoss,
  };

  await saveLearning(result);
  return result;
}

// ─── 9. 신뢰도 등급별 학습 적용 범위 ─────────────
export interface AppliedLearning {
  weights: { trending: Record<string, number>; ranging: Record<string, number> } | undefined;
  atrMultipliers: AtrMultipliers;
  targetRiskAmount: number;
  takeProfitRatio: number;
}

export function applyLearning(
  learned: import("@/lib/learning-engine").LearningResult | null,
  config: { takeProfitRatio?: number }
): AppliedLearning {
  const defaults: AppliedLearning = {
    weights: undefined,
    atrMultipliers: DEFAULT_ATR_MULTIPLIERS,
    targetRiskAmount: 30000,
    takeProfitRatio: config.takeProfitRatio ?? 50,
  };

  if (!learned || learned.confidence === "none") return defaults;

  if (learned.confidence === "low") {
    // 콜드 스타트 완화: 학습 가중치 50% + 기본 가중치 50% 블렌딩
    const partialWeight = 0.5;
    const blendedWeights: { trending: Record<string, number>; ranging: Record<string, number> } = {
      trending: Object.fromEntries(
        Object.keys(BASE_WEIGHTS.trending).map((k) => [
          k,
          (learned.weights.trending[k] ?? BASE_WEIGHTS.trending[k as keyof typeof BASE_WEIGHTS.trending]) * partialWeight +
          BASE_WEIGHTS.trending[k as keyof typeof BASE_WEIGHTS.trending] * (1 - partialWeight),
        ])
      ),
      ranging: Object.fromEntries(
        Object.keys(BASE_WEIGHTS.ranging).map((k) => [
          k,
          (learned.weights.ranging[k] ?? BASE_WEIGHTS.ranging[k as keyof typeof BASE_WEIGHTS.ranging]) * partialWeight +
          BASE_WEIGHTS.ranging[k as keyof typeof BASE_WEIGHTS.ranging] * (1 - partialWeight),
        ])
      ),
    };
    return {
      weights: blendedWeights,
      atrMultipliers: learned.atrMultipliers,
      targetRiskAmount: learned.positionSizing.targetRiskAmount,
      takeProfitRatio: defaults.takeProfitRatio,
    };
  }

  // medium / high: 전체 적용
  return {
    weights: learned.weights,
    atrMultipliers: learned.atrMultipliers,
    targetRiskAmount: learned.positionSizing.targetRiskAmount,
    takeProfitRatio: learned.risk.takeProfitRatio,
  };
}
