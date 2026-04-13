// NEXIO 자가 학습 엔진 v2
// 매매 경험(trade_memory) 기반으로 지표 가중치 + ATR 배수 + 포지션 사이징 자동 조정
// 신뢰도 등급별 적용 범위 차등화 (none/low/medium/high)

import { createClient } from "@supabase/supabase-js";
import { AtrMultipliers, DEFAULT_ATR_MULTIPLIERS } from "@/lib/kis/indicators";

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

// ─── 타입 정의 ──────────────────────────────────

export interface LearnedWeights {
  trending: Record<string, number>;
  ranging: Record<string, number>;
  source: "learned" | "default";
  sampleSize: number;
  learnedAt: string;
}

export interface LearnedAtrMultipliers {
  stop: number;
  profit: number;
  trailing: number;
  source: "learned" | "default";
  sampleSize: number;
}

export interface LearnedPositionSizing {
  targetRiskAmount: number;
  source: "learned" | "default";
}

export interface PatternStats {
  rsiRanges: Array<{
    range: string;
    count: number;
    winRate: number;
    avgPnl: number;
  }>;
  macdPatterns: Array<{
    pattern: string;
    count: number;
    winRate: number;
    avgPnl: number;
  }>;
  combos: Array<{
    combo: string;
    count: number;
    winRate: number;
    avgPnl: number;
  }>;
}

export interface LearningResult {
  weights: LearnedWeights;
  atrMultipliers: LearnedAtrMultipliers;
  positionSizing: LearnedPositionSizing;
  risk: { takeProfitRatio: number; source: "learned" | "default" };
  patternStats: PatternStats;
  confidence: "none" | "low" | "medium" | "high";
  sampleSize: number;
  timestamp: string;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

// learning_snapshots DB 행 타입
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
  pattern_stats: PatternStats | null;
  is_active: boolean;
  expires_at: string;
}

// ─── 신뢰도 계산 ────────────────────────────────
export function calcConfidence(sampleSize: number): "none" | "low" | "medium" | "high" {
  if (sampleSize < 10) return "none";
  if (sampleSize < 30) return "low";
  if (sampleSize < 50) return "medium";
  return "high";
}

// ─── 1. 지표별 적중률 기반 가중치 자동 조정 ──────
// trade_memory 우선, 없으면 positions 테이블 폴백
export async function learnWeights(lookbackDays = 30): Promise<LearnedWeights> {
  const defaults: LearnedWeights = {
    trending: { ...BASE_WEIGHTS.trending },
    ranging: { ...BASE_WEIGHTS.ranging },
    source: "default", sampleSize: 0, learnedAt: new Date().toISOString(),
  };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();

    // trade_memory 우선 사용
    const { data: tmData } = await supabase
      .from("trade_memory")
      .select("regime, is_win, rsi_value, macd_histogram, ma_cross, bb_position, volume_ratio, candle_pattern")
      .not("closed_at", "is", null)
      .gte("closed_at", since);

    // trade_memory 데이터가 충분하면 사용
    if (tmData && tmData.length >= 10) {
      const regimeStats: Record<string, Record<string, { total: number; wins: number }>> = {
        trending: {}, ranging: {},
      };
      for (const name of INDICATOR_NAMES) {
        regimeStats.trending[name] = { total: 0, wins: 0 };
        regimeStats.ranging[name] = { total: 0, wins: 0 };
      }

      for (const row of tmData) {
        const regime = row.regime === "trending" ? "trending" : "ranging";
        const isWin = row.is_win === true;

        // 각 지표 hit 여부 판정 (trade_memory 컬럼 기준)
        const hits: Record<string, boolean> = {
          RSI: (row.rsi_value ?? 50) < 30,
          MACD: row.macd_histogram > 0,
          이동평균: row.ma_cross === "golden",
          볼린저: row.bb_position === "below",
          거래량: (row.volume_ratio ?? 100) >= 200,
          캔들패턴: row.candle_pattern !== "없음" && row.candle_pattern !== "(백필)" && !!row.candle_pattern,
        };

        for (const name of INDICATOR_NAMES) {
          if (hits[name]) {
            regimeStats[regime][name].total++;
            if (isWin) regimeStats[regime][name].wins++;
          }
        }
      }

      const adjustWeights = (regime: "trending" | "ranging") => {
        const base = { ...BASE_WEIGHTS[regime] };
        const stats = regimeStats[regime];
        const adjustments: Record<string, number> = {};

        for (const name of INDICATOR_NAMES) {
          const s = stats[name];
          if (s.total < 3) { adjustments[name] = base[name]; continue; }
          const accuracy = s.wins / s.total;
          const multiplier = 0.4 + accuracy * 1.2;
          adjustments[name] = Math.round(base[name] * multiplier);
        }

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
        source: "learned", sampleSize: tmData.length, learnedAt: new Date().toISOString(),
      };
    }

    // 폴백: positions 테이블 사용 (기존 로직)
    const { data } = await supabase.from("positions").select("*")
      .eq("status", "closed").gte("exit_date", since);

    if (!data || data.length < 10) return defaults;

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
        if (stat) { stat.total++; if (isWin) stat.wins++; }
      }
    }

    const adjustWeights = (regime: "trending" | "ranging") => {
      const base = { ...BASE_WEIGHTS[regime] };
      const stats = regimeStats[regime];
      const adjustments: Record<string, number> = {};

      for (const name of INDICATOR_NAMES) {
        const s = stats[name];
        if (s.total < 3) { adjustments[name] = base[name]; continue; }
        const accuracy = s.wins / s.total;
        const multiplier = 0.4 + accuracy * 1.2;
        adjustments[name] = Math.round(base[name] * multiplier);
      }

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
      source: "learned", sampleSize: data.length, learnedAt: new Date().toISOString(),
    };
  } catch {
    return defaults;
  }
}

// ─── 2. ATR 배수 자동 튜닝 ────────────────────────
// 실제 청산 건의 ATR 배수 중앙값으로 최적화
export async function learnAtrMultipliers(lookbackDays = 60): Promise<LearnedAtrMultipliers> {
  const defaults: LearnedAtrMultipliers = {
    ...DEFAULT_ATR_MULTIPLIERS,
    source: "default",
    sampleSize: 0,
  };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase
      .from("trade_memory")
      .select("exit_reason, pnl_percent, atr_value, position_size, created_at")
      .not("closed_at", "is", null)
      .not("atr_value", "is", null)
      .gt("atr_value", 0)
      .gte("closed_at", since);

    if (!data || data.length < 5) return defaults;

    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };

    const stopMults: number[] = [];
    const profitMults: number[] = [];
    const trailingMults: number[] = [];

    for (const row of data) {
      const atr = Number(row.atr_value);
      // position_size가 없으면 추정 불가이므로 스킵
      if (atr <= 0 || !row.pnl_percent) continue;

      const pnlAbs = Math.abs(Number(row.pnl_percent));
      // 실제배수 = abs(pnl%) / (atr_value / 추정가격 * 100) — 근사값
      // position_size는 투자금이므로 단가 추정 어려움 → pnl_percent만으로 배수 역산 불가
      // 대신: 청산 유형별 pnl% 분포로 배수 조정 (직접 역산보다 안정적)
      const estimatedMult = pnlAbs / 2; // ATR 2배 = 기본 손절 기준 상대 추정

      if (row.exit_reason === "stop_loss") stopMults.push(Math.min(estimatedMult, 5));
      else if (row.exit_reason === "take_profit") profitMults.push(Math.min(estimatedMult, 8));
      else if (row.exit_reason === "trailing_stop") trailingMults.push(Math.min(estimatedMult, 4));
    }

    const stopMed = stopMults.length >= 5 ? median(stopMults) : DEFAULT_ATR_MULTIPLIERS.stop;
    const profitMed = profitMults.length >= 5 ? median(profitMults) : DEFAULT_ATR_MULTIPLIERS.profit;
    const trailingMed = trailingMults.length >= 5 ? median(trailingMults) : DEFAULT_ATR_MULTIPLIERS.trailing;

    return {
      stop: Math.max(stopMed, 1.0),
      profit: Math.max(profitMed, 1.5),
      trailing: Math.max(trailingMed, 0.5),
      source: (stopMults.length >= 5 || profitMults.length >= 5) ? "learned" : "default",
      sampleSize: data.length,
    };
  } catch {
    return defaults;
  }
}

// ─── 3. 포지션 사이징 자동 조정 ──────────────────
export async function learnPositionSizing(): Promise<LearnedPositionSizing> {
  const defaults: LearnedPositionSizing = { targetRiskAmount: 30000, source: "default" };

  try {
    const { data } = await supabase
      .from("trade_memory")
      .select("pnl_amount")
      .eq("exit_reason", "stop_loss")
      .not("pnl_amount", "is", null)
      .not("closed_at", "is", null);

    if (!data || data.length < 10) return defaults;

    const avgLossAmount = data.reduce((s, r) => s + Math.abs(Number(r.pnl_amount)), 0) / data.length;
    const currentTarget = 30000;
    const ratio = avgLossAmount / currentTarget;

    // 0.8~1.2 범위 내면 현재 값 유지
    if (ratio >= 0.8 && ratio <= 1.2) return defaults;

    return { targetRiskAmount: Math.round(avgLossAmount / 1000) * 1000, source: "learned" };
  } catch {
    return defaults;
  }
}

// ─── 4. 익절 비율 (takeProfitRatio) 학습 ─────────
export async function learnRiskParamsTakeProfitRatio(
  lookbackDays = 60
): Promise<{ takeProfitRatio: number; source: "learned" | "default" }> {
  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase
      .from("trade_memory")
      .select("is_win")
      .not("closed_at", "is", null)
      .gte("closed_at", since);

    if (!data || data.length < 10) return { takeProfitRatio: 50, source: "default" };

    const wins = data.filter((r) => r.is_win === true).length;
    const winRate = wins / data.length;

    let takeProfitRatio = 50;
    if (winRate > 0.6) takeProfitRatio = 30;
    else if (winRate > 0.5) takeProfitRatio = 40;
    else if (winRate < 0.35) takeProfitRatio = 70;

    return { takeProfitRatio, source: "learned" };
  } catch {
    return { takeProfitRatio: 50, source: "default" };
  }
}

// ─── 5. 세부 패턴 통계 학습 ──────────────────────
export async function learnPatternStats(lookbackDays = 60): Promise<PatternStats> {
  const emptyStats: PatternStats = { rsiRanges: [], macdPatterns: [], combos: [] };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase
      .from("trade_memory")
      .select("rsi_value, macd_histogram, bb_position, volume_ratio, is_win, pnl_percent")
      .not("closed_at", "is", null)
      .gte("closed_at", since);

    if (!data || data.length < 5) return emptyStats;

    // RSI 구간별 통계
    const rsiBuckets: Record<string, { wins: number; total: number; pnlSum: number }> = {};
    const rsiRangeLabels = ["0-20", "20-30", "30-40", "40-50", "50-60", "60-70", "70-80", "80-100"];
    for (const label of rsiRangeLabels) rsiBuckets[label] = { wins: 0, total: 0, pnlSum: 0 };

    for (const row of data) {
      const rsi = Number(row.rsi_value ?? 50);
      const label = rsiRangeLabels.find((l) => {
        const [lo, hi] = l.split("-").map(Number);
        return rsi >= lo && rsi < hi;
      }) ?? "50-60";
      rsiBuckets[label].total++;
      if (row.is_win) rsiBuckets[label].wins++;
      rsiBuckets[label].pnlSum += Number(row.pnl_percent ?? 0);
    }

    const rsiRanges = rsiRangeLabels
      .map((range) => {
        const b = rsiBuckets[range];
        return {
          range,
          count: b.total,
          winRate: b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0,
          avgPnl: b.total > 0 ? Math.round((b.pnlSum / b.total) * 100) / 100 : 0,
        };
      })
      .filter((r) => r.count > 0);

    // MACD 패턴별 통계
    const macdBuckets: Record<string, { wins: number; total: number; pnlSum: number }> = {
      golden_cross_pos: { wins: 0, total: 0, pnlSum: 0 },
      golden_cross_neg: { wins: 0, total: 0, pnlSum: 0 },
    };

    for (const row of data) {
      const hist = Number(row.macd_histogram ?? 0);
      const key = hist >= 0 ? "golden_cross_pos" : "golden_cross_neg";
      macdBuckets[key].total++;
      if (row.is_win) macdBuckets[key].wins++;
      macdBuckets[key].pnlSum += Number(row.pnl_percent ?? 0);
    }

    const macdPatterns = Object.entries(macdBuckets)
      .map(([pattern, b]) => ({
        pattern,
        count: b.total,
        winRate: b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0,
        avgPnl: b.total > 0 ? Math.round((b.pnlSum / b.total) * 100) / 100 : 0,
      }))
      .filter((r) => r.count > 0);

    // 조합 패턴 (6종)
    type ComboKey = "RSI<30+Vol>200" | "RSI<30+MACD골든" | "BB하단+거래량급등" | "RSI>70+BB상단" | "RSI<30+BB하단" | "MACD골든+거래량급등";
    type TradeRow = { rsi_value: number | null; macd_histogram: number | null; bb_position: string | null; volume_ratio: number | null; is_win: boolean | null; pnl_percent: number | null };
    const comboDefs: Array<{ key: ComboKey; check: (r: TradeRow) => boolean }> = [
      { key: "RSI<30+Vol>200", check: (r) => Number(r.rsi_value) < 30 && Number(r.volume_ratio) >= 200 },
      { key: "RSI<30+MACD골든", check: (r) => Number(r.rsi_value) < 30 && Number(r.macd_histogram) >= 0 },
      { key: "BB하단+거래량급등", check: (r) => r.bb_position === "below" && Number(r.volume_ratio) >= 200 },
      { key: "RSI>70+BB상단", check: (r) => Number(r.rsi_value) > 70 && r.bb_position === "above" },
      { key: "RSI<30+BB하단", check: (r) => Number(r.rsi_value) < 30 && r.bb_position === "below" },
      { key: "MACD골든+거래량급등", check: (r) => Number(r.macd_histogram) >= 0 && Number(r.volume_ratio) >= 200 },
    ];

    const comboBuckets: Record<string, { wins: number; total: number; pnlSum: number }> = {};
    for (const { key } of comboDefs) comboBuckets[key] = { wins: 0, total: 0, pnlSum: 0 };

    for (const row of data) {
      for (const { key, check } of comboDefs) {
        if (check(row)) {
          comboBuckets[key].total++;
          if (row.is_win) comboBuckets[key].wins++;
          comboBuckets[key].pnlSum += Number(row.pnl_percent ?? 0);
        }
      }
    }

    const combos = Object.entries(comboBuckets)
      .map(([combo, b]) => ({
        combo,
        count: b.total,
        winRate: b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0,
        avgPnl: b.total > 0 ? Math.round((b.pnlSum / b.total) * 100) / 100 : 0,
      }))
      .filter((r) => r.count > 0);

    return { rsiRanges, macdPatterns, combos };
  } catch {
    return emptyStats;
  }
}

// ─── 6. 학습 결과 저장 ───────────────────────────
export async function saveLearning(result: LearningResult): Promise<void> {
  try {
    // ① 기존 is_active=true → false (실패해도 계속)
    await supabase
      .from("learning_snapshots")
      .update({ is_active: false })
      .eq("is_active", true);
  } catch { /* 비중요 실패 무시 */ }

  // ② 신규 스냅샷 INSERT
  await supabase.from("learning_snapshots").insert({
    sample_size: result.sampleSize,
    confidence: result.confidence,
    weights_trending: result.weights.trending,
    weights_ranging: result.weights.ranging,
    weights_source: result.weights.source,
    atr_mult_stop: result.atrMultipliers.stop,
    atr_mult_profit: result.atrMultipliers.profit,
    atr_mult_trailing: result.atrMultipliers.trailing,
    atr_source: result.atrMultipliers.source,
    target_risk_amount: result.positionSizing.targetRiskAmount,
    sizing_source: result.positionSizing.source,
    take_profit_ratio: result.risk.takeProfitRatio,
    risk_source: result.risk.source,
    win_rate: result.winRate,
    avg_win: result.avgWin,
    avg_loss: result.avgLoss,
    pattern_stats: result.patternStats,
    is_active: true,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ─── 7. 최신 학습 결과 로딩 (만료 폴백 포함) ─────
export async function loadLatestLearning(): Promise<LearningResult | null> {
  try {
    // 1차: 유효한 스냅샷
    const { data: active } = await supabase
      .from("learning_snapshots")
      .select("*")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (active) return snapshotToResult(active as LearningSnapshot, false);

    // 폴백: 만료된 최신 스냅샷
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

function snapshotToResult(snap: LearningSnapshot, isExpired: boolean): LearningResult {
  // isExpired는 현재 LearningResult에 포함하지 않으나 로그용으로 파라미터 유지
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
export async function runLearning(): Promise<LearningResult> {
  const [weights, atrMultipliers, positionSizing, riskParams, patternStats] = await Promise.all([
    learnWeights(30),
    learnAtrMultipliers(60),
    learnPositionSizing(),
    learnRiskParamsTakeProfitRatio(60),
    learnPatternStats(60),
  ]);

  // 전체 샘플 수 기반 신뢰도 계산
  const sampleSize = Math.max(weights.sampleSize, atrMultipliers.sampleSize);
  const confidence = calcConfidence(sampleSize);

  // 전체 승률/평균 손익 계산
  const { winRate, avgWin, avgLoss } = await calcOverallStats(60);

  const result: LearningResult = {
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

async function calcOverallStats(lookbackDays: number) {
  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase
      .from("trade_memory")
      .select("is_win, pnl_percent")
      .not("closed_at", "is", null)
      .gte("closed_at", since);

    if (!data || data.length === 0) return { winRate: 0, avgWin: 0, avgLoss: 0 };

    const wins = data.filter((r) => r.is_win === true);
    const losses = data.filter((r) => r.is_win === false);

    const winRate = Math.round((wins.length / data.length) * 100);
    const avgWin = wins.length > 0
      ? Math.round(wins.reduce((s, r) => s + Number(r.pnl_percent ?? 0), 0) / wins.length * 100) / 100
      : 0;
    const avgLoss = losses.length > 0
      ? Math.round(Math.abs(losses.reduce((s, r) => s + Number(r.pnl_percent ?? 0), 0) / losses.length) * 100) / 100
      : 0;

    return { winRate, avgWin, avgLoss };
  } catch {
    return { winRate: 0, avgWin: 0, avgLoss: 0 };
  }
}

// ─── 9. 신뢰도 등급별 학습 적용 범위 ─────────────
export interface AppliedLearning {
  weights: { trending: Record<string, number>; ranging: Record<string, number> } | undefined;
  atrMultipliers: AtrMultipliers;
  targetRiskAmount: number;
  takeProfitRatio: number;
}

export function applyLearning(
  learned: LearningResult | null,
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
    // ATR 배수 + 포지션 사이징만 적용
    return {
      ...defaults,
      atrMultipliers: learned.atrMultipliers,
      targetRiskAmount: learned.positionSizing.targetRiskAmount,
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
