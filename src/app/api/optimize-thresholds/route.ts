import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/api-client";

const RSI_BUY_CANDIDATES      = [15, 20, 25, 30, 35, 40];
const STRONG_SCORE_CANDIDATES = [50, 55, 60, 65, 70, 75, 80];
const WEAK_OFFSETS            = [25, 30, 35]; // strong_score - offset
const DEFAULT_WEAK_OFFSET     = 30; // WEAK_OFFSETS 탐색 실패 시 fallback
const MIN_SAMPLE = 5;

interface TradeRecord {
  rsi_value:   number | null;
  total_score: number | null;
  is_win:      boolean | null;
  pnl_percent: number | null;
}

// ─── 복합 스코어: 승률 40% + 평균수익률 35% + 샤프지수 25% ───────────
function compositeScore(trades: TradeRecord[]): number {
  if (trades.length === 0) return 0;

  const winRate  = trades.filter((t) => t.is_win === true).length / trades.length;
  const returns  = trades.map((t) => t.pnl_percent ?? 0);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const mean     = avgReturn;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std      = Math.sqrt(variance) || 1;
  const sharpe   = mean / std;

  // 정규화 후 가중 합산
  return (
    winRate * 0.4 +
    Math.min(Math.max(avgReturn / 10, 0), 1) * 0.35 +
    Math.min(Math.max(sharpe, 0), 1) * 0.25
  );
}

interface GridResult {
  best:       number;
  bestScore:  number;
  winRate:    number;
  sharpe:     number;
}

function gridSearch(
  records: TradeRecord[],
  getValue:  (r: TradeRecord) => number | null,
  passes:    (val: number, candidate: number) => boolean,
  candidates: number[],
): GridResult {
  const mid   = candidates[Math.floor(candidates.length / 2)];
  let best      = mid;
  let bestScore = -Infinity;
  let bestWin   = 0;
  let bestSharpe = 0;

  for (const candidate of candidates) {
    const subset = records.filter((r) => {
      const v = getValue(r);
      return v !== null && passes(v, candidate);
    });
    if (subset.length === 0) continue;

    const score  = compositeScore(subset);
    const wins   = subset.filter((r) => r.is_win === true).length;
    const wr     = wins / subset.length;
    const returns = subset.map((r) => r.pnl_percent ?? 0);
    const mean   = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const sharpe  = mean / (Math.sqrt(variance) || 1);

    if (score > bestScore) {
      bestScore = score;
      best      = candidate;
      bestWin   = wr;
      bestSharpe = sharpe;
    }
  }

  return {
    best,
    bestScore: bestScore < 0 ? 0 : bestScore,
    winRate:   bestWin,
    sharpe:    bestSharpe,
  };
}

// GET /api/optimize-thresholds
// 인증 불필요 — 읽기 전용, middleware.ts 가 /api/* 전체를 보호함
export async function GET() {
  const { data, error } = await supabase
    .from("trade_memory")
    .select("rsi_value, total_score, is_win, pnl_percent")
    .not("closed_at", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const records: TradeRecord[] = (data ?? []) as TradeRecord[];

  if (records.length < MIN_SAMPLE) {
    return NextResponse.json(
      { error: "데이터 부족", minRequired: MIN_SAMPLE, current: records.length },
      { status: 422 },
    );
  }

  // 현재 저장된 임계값 조회
  const { data: cfgRows } = await supabase
    .from("app_config")
    .select("key, value")
    .in("key", ["rsi_buy", "rsi_sell", "strong_score", "weak_score"]);
  const cfgMap = new Map(
    (cfgRows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]),
  );
  const currentRsiBuy      = Number(cfgMap.get("rsi_buy")      ?? 30);
  const currentRsiSell     = Number(cfgMap.get("rsi_sell")     ?? 70);
  const currentStrongScore = Number(cfgMap.get("strong_score") ?? 70);
  const currentWeakScore   = Number(cfgMap.get("weak_score")   ?? 40);

  // RSI buy 그리드 서치: rsi_value < threshold
  const rsiBuyResult = gridSearch(
    records,
    (r) => r.rsi_value,
    (val, candidate) => val < candidate,
    RSI_BUY_CANDIDATES,
  );

  // Strong score 그리드 서치: total_score >= threshold
  const strongScoreResult = gridSearch(
    records,
    (r) => r.total_score,
    (val, candidate) => val >= candidate,
    STRONG_SCORE_CANDIDATES,
  );

  // weakScore: best offset 탐색 (strong_score - offset)
  let bestWeakOffset = DEFAULT_WEAK_OFFSET;
  let bestWeakScore  = -Infinity;
  for (const offset of WEAK_OFFSETS) {
    const weakCandidate = strongScoreResult.best - offset;
    if (weakCandidate <= 0) continue;
    const subset = records.filter((r) => {
      const v = r.total_score;
      return v !== null && v >= weakCandidate && v < strongScoreResult.best;
    });
    const score = compositeScore(subset);
    if (score > bestWeakScore) {
      bestWeakScore  = score;
      bestWeakOffset = offset;
    }
  }

  const recRsiBuy      = rsiBuyResult.best;
  const recRsiSell     = 100 - recRsiBuy;
  const recStrongScore = strongScoreResult.best;
  const recWeakScore   = Math.max(1, recStrongScore - bestWeakOffset);

  return NextResponse.json({
    sampleSize: records.length,
    current: {
      rsiBuy:      currentRsiBuy,
      rsiSell:     currentRsiSell,
      strongScore: currentStrongScore,
      weakScore:   currentWeakScore,
    },
    recommended: {
      rsiBuy:      recRsiBuy,
      rsiSell:     recRsiSell,
      strongScore: recStrongScore,
      weakScore:   recWeakScore,
    },
    analysis: {
      rsiBuyWinRate:       Math.round(rsiBuyResult.winRate * 100) / 100,
      strongScoreWinRate:  Math.round(strongScoreResult.winRate * 100) / 100,
      rsiBuySharpe:        Math.round(rsiBuyResult.sharpe * 100) / 100,
      strongScoreSharpe:   Math.round(strongScoreResult.sharpe * 100) / 100,
      rsiBuyComposite:     Math.round(rsiBuyResult.bestScore * 100) / 100,
      strongScoreComposite: Math.round(strongScoreResult.bestScore * 100) / 100,
      weakOffset:          bestWeakOffset,
    },
  });
}
