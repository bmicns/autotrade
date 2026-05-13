// NEXIO 자가 학습 엔진 v2 — 내부 학습 로직
// learnWeights, learnAtrMultipliers, learnPositionSizing, learnRiskParams, learnPatternStats, saveLearning 등 내부 함수

import { supabase } from "@/lib/supabase/api-client";
import { DEFAULT_ATR_MULTIPLIERS } from "@/lib/kis/indicators";

// ─── 타입 정의 (engine 내부 + learning.ts에서 re-export) ──────
export interface LearnedWeights {
  trending: Record<string, number>;
  ranging: Record<string, number>;
  source: "learned" | "default";
  sampleSize: number;
  learnedAt: string;
}

export interface LearnedAtrMultipliers {
  stop: number;
  trailing: number;
  source: "learned" | "default";
  sampleSize: number;
}

export interface LearnedPositionSizing {
  targetRiskAmount: number;
  source: "learned" | "default";
}

export interface PatternStats {
  rsiRanges: Array<{ range: string; count: number; winRate: number; avgPnl: number }>;
  macdPatterns: Array<{ pattern: string; count: number; winRate: number; avgPnl: number }>;
  combos: Array<{ combo: string; count: number; winRate: number; avgPnl: number }>;
}

export interface LearningDatasetSummary {
  sampleCount: number;
  winRate: number;
  avgPnl: number;
  avgHoldDays: number;
  strategyStats: Array<{ key: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
  surgeEntryStats: Array<{ tag: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
  timeBucketStats: Array<{ bucket: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
  keywordStats: Array<{ keyword: string; count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
  riskHints: Array<{ label: string; count: number; winRate: number; stopLossRate: number; avgPnl: number; reason: string }>;
}

export interface LearningResult {
  weights: LearnedWeights;
  atrMultipliers: LearnedAtrMultipliers;
  positionSizing: LearnedPositionSizing;
  risk: { partialExitRatio: number; source: "learned" | "default" };
  patternStats: PatternStats;
  confidence: "none" | "low" | "medium" | "high";
  sampleSize: number;
  timestamp: string;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}


// ─── 기본 가중치 (레짐별) ────────────────────────
const BASE_WEIGHTS = {
  trending: { RSI: 8, MACD: 26, 이동평균: 22, 볼린저: 8, 거래량: 21, 캔들패턴: 15 },
  ranging:  { RSI: 21, MACD: 13, 이동평균: 13, 볼린저: 21, 거래량: 17, 캔들패턴: 15 },
};

const INDICATOR_NAMES = ["RSI", "MACD", "이동평균", "볼린저", "거래량", "캔들패턴"] as const;

type RegimeStats = Record<string, Record<string, { total: number; wins: number }>>;
type StatBucket = { wins: number; total: number; pnlSum: number };

// ─── 공통 헬퍼: 중앙값 계산 ─────────────────────
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ─── 공통 헬퍼: 버킷 → 통계 배열 변환 ───────────
function mapBuckets<K extends string>(
  buckets: Record<string, StatBucket>,
  keyField: K
): Array<Record<K, string> & { count: number; winRate: number; avgPnl: number }> {
  return Object.entries(buckets)
    .map(([key, b]) => ({
      [keyField]: key,
      count: b.total,
      winRate: b.total > 0 ? Math.round((b.wins / b.total) * 100) : 0,
      avgPnl: b.total > 0 ? Math.round((b.pnlSum / b.total) * 100) / 100 : 0,
    } as Record<K, string> & { count: number; winRate: number; avgPnl: number }))
    .filter((r) => r.count > 0);
}

// ─── 공통 헬퍼: 빈 레짐 통계 초기화 ─────────────
function initRegimeStats(): RegimeStats {
  const stats: RegimeStats = { trending: {}, ranging: {} };
  for (const name of INDICATOR_NAMES) {
    stats.trending[name] = { total: 0, wins: 0 };
    stats.ranging[name] = { total: 0, wins: 0 };
  }
  return stats;
}

// ─── 공통 헬퍼: 레짐별 가중치 계산 ──────────────
function calcAdjustedWeights(regime: "trending" | "ranging", stats: RegimeStats): Record<string, number> {
  const base = { ...BASE_WEIGHTS[regime] };
  const regStats = stats[regime];
  const adj: Record<string, number> = {};
  for (const name of INDICATOR_NAMES) {
    const s = regStats[name];
    adj[name] = s.total < 3 ? base[name] : Math.round(base[name] * (0.4 + (s.wins / s.total) * 1.2));
  }
  const sum = Object.values(adj).reduce((s, v) => s + v, 0);
  if (sum > 0) for (const name of INDICATOR_NAMES) adj[name] = Math.round((adj[name] / sum) * 100);
  return adj;
}

// ─── 신뢰도 계산 ────────────────────────────────
export function calcConfidence(sampleSize: number): "none" | "low" | "medium" | "high" {
  if (sampleSize < 10) return "none";
  if (sampleSize < 30) return "low";
  if (sampleSize < 50) return "medium";
  return "high";
}

// ─── 내부 헬퍼: trade_memory 기반 가중치 계산 ────
function weightsFromTradeMemory(
  tmData: Array<{ regime: string; is_win: boolean; rsi_value: number | null; macd_histogram: number; ma_cross: string; bb_position: string; volume_ratio: number | null; candle_pattern: string }>
): LearnedWeights {
  const regimeStats = initRegimeStats();
  for (const row of tmData) {
    const regime = row.regime === "trending" ? "trending" : "ranging";
    const isWin = row.is_win === true;
    const hits: Record<string, boolean> = {
      RSI: (row.rsi_value ?? 50) < 30,
      MACD: row.macd_histogram > 0,
      이동평균: row.ma_cross === "golden",
      볼린저: row.bb_position === "below",
      거래량: (row.volume_ratio ?? 100) >= 200,
      캔들패턴: row.candle_pattern !== "없음" && row.candle_pattern !== "(백필)" && !!row.candle_pattern,
    };
    for (const name of INDICATOR_NAMES) {
      if (hits[name]) { regimeStats[regime][name].total++; if (isWin) regimeStats[regime][name].wins++; }
    }
  }
  return {
    trending: calcAdjustedWeights("trending", regimeStats),
    ranging: calcAdjustedWeights("ranging", regimeStats),
    source: "learned", sampleSize: tmData.length, learnedAt: new Date().toISOString(),
  };
}

// ─── 내부 헬퍼: positions 폴백 기반 가중치 계산 ──
function weightsFromPositions(
  data: Array<{ entry_signal: unknown; pnl_amount: unknown }>
): LearnedWeights {
  const regimeStats = initRegimeStats();
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
  return {
    trending: calcAdjustedWeights("trending", regimeStats),
    ranging: calcAdjustedWeights("ranging", regimeStats),
    source: "learned", sampleSize: data.length, learnedAt: new Date().toISOString(),
  };
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
    const { data: tmData } = await supabase
      .from("trade_memory")
      .select("regime, is_win, rsi_value, macd_histogram, ma_cross, bb_position, volume_ratio, candle_pattern")
      .not("closed_at", "is", null)
      .gte("closed_at", since);

    if (tmData && tmData.length >= 10) return weightsFromTradeMemory(tmData);

    // 폴백: positions 테이블 사용
    const { data } = await supabase.from("positions").select("*")
      .eq("status", "closed").gte("exit_date", since);

    if (!data || data.length < 10) return defaults;
    return weightsFromPositions(data);
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

    const stopMults: number[] = [], trailingMults: number[] = [];
    for (const row of data) {
      const atr = Number(row.atr_value);
      if (atr <= 0 || !row.pnl_percent) continue;
      // pnl% 분포로 배수 추정 (직접 역산보다 안정적). ATR 2배 = 기본 기준
      const estimatedMult = Math.abs(Number(row.pnl_percent)) / 2;
      if (row.exit_reason === "stop_loss") stopMults.push(Math.min(estimatedMult, 5));
      else if (row.exit_reason === "trailing_stop") trailingMults.push(Math.min(estimatedMult, 4));
    }

    const stopMed = stopMults.length >= 5 ? median(stopMults) : DEFAULT_ATR_MULTIPLIERS.stop;
    const trailingMed = trailingMults.length >= 5 ? median(trailingMults) : DEFAULT_ATR_MULTIPLIERS.trailing;

    return {
      stop: Math.max(stopMed, 1.0),
      trailing: Math.max(trailingMed, 0.5),
      source: (stopMults.length >= 5 || trailingMults.length >= 5) ? "learned" : "default",
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
    const { data } = await supabase.from("trade_memory").select("pnl_amount")
      .eq("exit_reason", "stop_loss").not("pnl_amount", "is", null).not("closed_at", "is", null);
    if (!data || data.length < 10) return defaults;
    const avg = data.reduce((s, r) => s + Math.abs(Number(r.pnl_amount)), 0) / data.length;
    const ratio = avg / 30000;
    if (ratio >= 0.8 && ratio <= 1.2) return defaults;
    return { targetRiskAmount: Math.round(avg / 1000) * 1000, source: "learned" };
  } catch { return defaults; }
}

// ─── 4. 부분청산 비율 (partialExitRatio) 학습 ─────
export async function learnRiskParamsPartialExitRatio(
  lookbackDays = 60
): Promise<{ partialExitRatio: number; source: "learned" | "default" }> {
  const def = { partialExitRatio: 50, source: "default" as const };
  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase.from("trade_memory").select("is_win")
      .not("closed_at", "is", null).gte("closed_at", since);
    if (!data || data.length < 10) return def;
    const wr = data.filter((r) => r.is_win === true).length / data.length;
    const partialExitRatio = wr > 0.6 ? 30 : wr > 0.5 ? 40 : wr < 0.35 ? 70 : 50;
    return { partialExitRatio, source: "learned" };
  } catch { return def; }
}

// ─── 패턴 통계 내부 헬퍼들 ──────────────────────
type PatternRow = { rsi_value: number | null; macd_histogram: number | null; bb_position: string | null; volume_ratio: number | null; is_win: boolean | null; pnl_percent: number | null };

function accBucket(bucket: StatBucket, isWin: boolean | null, pnlPct: number | null) {
  bucket.total++;
  if (isWin) bucket.wins++;
  bucket.pnlSum += Number(pnlPct ?? 0);
}

function calcRsiRanges(data: PatternRow[]) {
  const labels = ["0-20", "20-30", "30-40", "40-50", "50-60", "60-70", "70-80", "80-100"];
  const buckets: Record<string, StatBucket> = Object.fromEntries(labels.map((l) => [l, { wins: 0, total: 0, pnlSum: 0 }]));
  for (const row of data) {
    const rsi = Number(row.rsi_value ?? 50);
    const label = labels.find((l) => { const [lo, hi] = l.split("-").map(Number); return rsi >= lo && rsi < hi; }) ?? "50-60";
    accBucket(buckets[label], row.is_win, row.pnl_percent);
  }
  return mapBuckets(buckets, "range");
}

function calcMacdPatterns(data: PatternRow[]) {
  const buckets: Record<string, StatBucket> = { golden_cross_pos: { wins: 0, total: 0, pnlSum: 0 }, golden_cross_neg: { wins: 0, total: 0, pnlSum: 0 } };
  for (const row of data) {
    accBucket(buckets[Number(row.macd_histogram ?? 0) >= 0 ? "golden_cross_pos" : "golden_cross_neg"], row.is_win, row.pnl_percent);
  }
  return mapBuckets(buckets, "pattern");
}

function calcCombos(data: PatternRow[]) {
  const defs = [
    { key: "RSI<30+Vol>200", check: (r: PatternRow) => Number(r.rsi_value) < 30 && Number(r.volume_ratio) >= 200 },
    { key: "RSI<30+MACD골든", check: (r: PatternRow) => Number(r.rsi_value) < 30 && Number(r.macd_histogram) >= 0 },
    { key: "BB하단+거래량급등", check: (r: PatternRow) => r.bb_position === "below" && Number(r.volume_ratio) >= 200 },
    { key: "RSI>70+BB상단", check: (r: PatternRow) => Number(r.rsi_value) > 70 && r.bb_position === "above" },
    { key: "RSI<30+BB하단", check: (r: PatternRow) => Number(r.rsi_value) < 30 && r.bb_position === "below" },
    { key: "MACD골든+거래량급등", check: (r: PatternRow) => Number(r.macd_histogram) >= 0 && Number(r.volume_ratio) >= 200 },
  ];
  const buckets: Record<string, StatBucket> = Object.fromEntries(defs.map(({ key }) => [key, { wins: 0, total: 0, pnlSum: 0 }]));
  for (const row of data) {
    for (const { key, check } of defs) { if (check(row)) accBucket(buckets[key], row.is_win, row.pnl_percent); }
  }
  return mapBuckets(buckets, "combo");
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
    return {
      rsiRanges: calcRsiRanges(data),
      macdPatterns: calcMacdPatterns(data),
      combos: calcCombos(data),
    };
  } catch {
    return emptyStats;
  }
}

// ─── 6. 학습 결과 저장 ───────────────────────────
export async function saveLearning(result: LearningResult): Promise<void> {
  try { await supabase.from("learning_snapshots").update({ is_active: false }).eq("is_active", true); } catch { /* 비중요 실패 무시 */ }
  const r = result;
  await supabase.from("learning_snapshots").insert({
    sample_size: r.sampleSize, confidence: r.confidence,
    weights_trending: r.weights.trending, weights_ranging: r.weights.ranging, weights_source: r.weights.source,
    atr_mult_stop: r.atrMultipliers.stop,
    atr_mult_trailing: r.atrMultipliers.trailing, atr_source: r.atrMultipliers.source,
    target_risk_amount: r.positionSizing.targetRiskAmount, sizing_source: r.positionSizing.source,
    take_profit_ratio: r.risk.partialExitRatio, risk_source: r.risk.source,
    win_rate: r.winRate, avg_win: r.avgWin, avg_loss: r.avgLoss,
    pattern_stats: r.patternStats, is_active: true,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ─── 전체 승률/평균 손익 계산 (내부용) ───────────
export async function calcOverallStats(lookbackDays: number) {
  const zero = { winRate: 0, avgWin: 0, avgLoss: 0 };
  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase.from("trade_memory").select("is_win, pnl_percent")
      .not("closed_at", "is", null).gte("closed_at", since);
    if (!data || data.length === 0) return zero;
    const wins = data.filter((r) => r.is_win === true);
    const losses = data.filter((r) => r.is_win === false);
    const sumPnl = (arr: typeof wins) => arr.reduce((s, r) => s + Number(r.pnl_percent ?? 0), 0);
    return {
      winRate: Math.round((wins.length / data.length) * 100),
      avgWin: wins.length > 0 ? Math.round(sumPnl(wins) / wins.length * 100) / 100 : 0,
      avgLoss: losses.length > 0 ? Math.round(Math.abs(sumPnl(losses) / losses.length) * 100) / 100 : 0,
    };
  } catch { return zero; }
}

function resolveTimeBucket(entryDate: string): string {
  const hour = new Date(entryDate).getHours();
  if (hour <= 9) return "장초반";
  if (hour <= 11) return "오전";
  if (hour <= 14) return "오후";
  return "장마감";
}

type DatasetAgg = { count: number; wins: number; pnlSum: number; stopLossCount: number };

function pushAgg(map: Map<string, DatasetAgg>, key: string, pnlAmount: number, exitReason: string | null) {
  const current = map.get(key) ?? { count: 0, wins: 0, pnlSum: 0, stopLossCount: 0 };
  current.count += 1;
  current.pnlSum += pnlAmount;
  if (pnlAmount > 0) current.wins += 1;
  if ((exitReason ?? "unknown") === "stop_loss") current.stopLossCount += 1;
  map.set(key, current);
}

function mapDatasetAgg(map: Map<string, DatasetAgg>, labelField: "key" | "tag" | "bucket") {
  return Array.from(map.entries()).map(([label, value]) => ({
    [labelField]: label,
    count: value.count,
    winRate: value.count > 0 ? (value.wins / value.count) * 100 : 0,
    avgPnl: value.count > 0 ? value.pnlSum / value.count : 0,
    stopLossRate: value.count > 0 ? (value.stopLossCount / value.count) * 100 : 0,
  })) as Array<{ [K in typeof labelField]: string } & { count: number; winRate: number; avgPnl: number; stopLossRate: number }>;
}

export async function buildLearningDatasetSummary(lookbackDays = 180): Promise<LearningDatasetSummary> {
  const empty: LearningDatasetSummary = {
    sampleCount: 0,
    winRate: 0,
    avgPnl: 0,
    avgHoldDays: 0,
    strategyStats: [],
    surgeEntryStats: [],
    timeBucketStats: [],
    keywordStats: [],
    riskHints: [],
  };

  try {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data } = await supabase
      .from("positions")
      .select("entry_date, exit_reason, pnl_amount, hold_days, entry_signal, status")
      .eq("status", "closed")
      .gte("exit_date", since);

    if (!data || data.length === 0) return empty;

    const strategyMap = new Map<string, DatasetAgg>();
    const surgeEntryMap = new Map<string, DatasetAgg>();
    const timeBucketMap = new Map<string, DatasetAgg>();
    const keywordMap = new Map<string, DatasetAgg>();
    let wins = 0;
    let pnlSum = 0;
    let holdDaysSum = 0;

    for (const row of data) {
      const entrySignal = (row.entry_signal as { strategyKey?: string; entryTag?: string; newsKeywords?: string[] } | null) ?? null;
      const strategyKey = entrySignal?.strategyKey ?? "unclassified";
      const entryTag = entrySignal?.entryTag ?? "unknown";
      const newsKeywords = Array.isArray(entrySignal?.newsKeywords) ? entrySignal.newsKeywords : [];
      const pnlAmount = Number(row.pnl_amount ?? 0);
      const exitReason = (row.exit_reason as string | null) ?? null;
      const bucket = resolveTimeBucket(String(row.entry_date ?? ""));

      if (pnlAmount > 0) wins += 1;
      pnlSum += pnlAmount;
      holdDaysSum += Number(row.hold_days ?? 0);

      pushAgg(strategyMap, strategyKey, pnlAmount, exitReason);
      pushAgg(timeBucketMap, bucket, pnlAmount, exitReason);
      if (strategyKey === "surge_momentum") pushAgg(surgeEntryMap, entryTag, pnlAmount, exitReason);
      for (const keyword of newsKeywords) {
        pushAgg(keywordMap, keyword, pnlAmount, exitReason);
      }
    }

    const strategyStats = mapDatasetAgg(strategyMap, "key")
      .sort((a, b) => b.count - a.count || b.avgPnl - a.avgPnl)
      .slice(0, 6);
    const surgeEntryStats = mapDatasetAgg(surgeEntryMap, "tag")
      .sort((a, b) => b.count - a.count || b.avgPnl - a.avgPnl)
      .slice(0, 6);
    const timeBucketStats = mapDatasetAgg(timeBucketMap, "bucket")
      .sort((a, b) => b.count - a.count);
    const keywordStats = mapDatasetAgg(keywordMap, "key")
      .map((item) => ({
        keyword: item.key,
        count: item.count,
        winRate: item.winRate,
        avgPnl: item.avgPnl,
        stopLossRate: item.stopLossRate,
      }))
      .sort((a, b) => b.count - a.count || a.avgPnl - b.avgPnl)
      .slice(0, 12);

    const riskHints = [
      ...strategyStats
        .filter((item) => item.count >= 5 && (item.winRate < 45 || item.stopLossRate >= 35 || item.avgPnl < 0))
        .map((item) => ({
          label: item.key,
          count: item.count,
          winRate: item.winRate,
          stopLossRate: item.stopLossRate,
          avgPnl: item.avgPnl,
          reason: "전략 실패 패턴",
        })),
      ...surgeEntryStats
        .filter((item) => item.count >= 4 && (item.winRate < 45 || item.stopLossRate >= 35 || item.avgPnl < 0))
        .map((item) => ({
          label: item.tag,
          count: item.count,
          winRate: item.winRate,
          stopLossRate: item.stopLossRate,
          avgPnl: item.avgPnl,
          reason: "급등주 진입 타입 리스크",
        })),
      ...timeBucketStats
        .filter((item) => item.count >= 4 && (item.winRate < 45 || item.stopLossRate >= 35 || item.avgPnl < 0))
        .map((item) => ({
          label: item.bucket,
          count: item.count,
          winRate: item.winRate,
          stopLossRate: item.stopLossRate,
          avgPnl: item.avgPnl,
          reason: "시간대 리스크",
        })),
      ...keywordStats
        .filter((item) => item.count >= 4 && (item.winRate < 45 || item.stopLossRate >= 35 || item.avgPnl < 0))
        .map((item) => ({
          label: item.keyword,
          count: item.count,
          winRate: item.winRate,
          stopLossRate: item.stopLossRate,
          avgPnl: item.avgPnl,
          reason: "뉴스 키워드 리스크",
        })),
    ]
      .sort((a, b) => b.stopLossRate - a.stopLossRate || a.winRate - b.winRate || a.avgPnl - b.avgPnl)
      .slice(0, 8);

    return {
      sampleCount: data.length,
      winRate: data.length > 0 ? (wins / data.length) * 100 : 0,
      avgPnl: data.length > 0 ? pnlSum / data.length : 0,
      avgHoldDays: data.length > 0 ? holdDaysSum / data.length : 0,
      strategyStats,
      surgeEntryStats,
      timeBucketStats,
      keywordStats,
      riskHints,
    };
  } catch {
    return empty;
  }
}
