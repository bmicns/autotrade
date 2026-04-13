-- ============================================================
-- adaptive-engine: trade_memory + learning_snapshots 테이블
-- 매매 경험 기반 자가학습 엔진 (P1~P6)
-- 생성일: 2026-04-11
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. trade_memory 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  stock_code      TEXT NOT NULL,
  stock_name      TEXT,

  -- 지표 스냅샷 (7종) — 실제 코드 값 기준
  rsi_value       NUMERIC,
  macd_histogram  NUMERIC,
  ma_cross        TEXT,     -- 'golden' | 'dead' | 'none'
  bb_position     TEXT,     -- 'below' | 'middle' | 'above'  ⚠️ lower/upper 아님
  volume_ratio    NUMERIC,
  adx_value       NUMERIC,
  candle_pattern  TEXT,

  -- 진입 컨텍스트
  regime          TEXT,     -- 'trending' | 'ranging'
  base_score      INT,      -- analyzeSignal() 결과 (기본 가중치)
  learned_score   INT,      -- analyzeSignalWithWeights() 결과 (없으면 base_score)
  total_score     INT,      -- 보정 포함 최종 점수 (adjustedScore)
  market_bonus    INT,
  investor_bonus  INT,
  snapshot_bonus  INT,
  weights_source  TEXT,     -- 'learned' | 'default'
  atr_value       NUMERIC,
  position_size   INT,      -- 실제 투자금액 (원)

  -- 결과 (청산 시 UPDATE)
  pnl_percent     NUMERIC,
  pnl_amount      NUMERIC,
  hold_days       INT,
  exit_reason     TEXT,     -- 'stop_loss' | 'take_profit' | 'trailing_stop' | 'max_hold'
  is_win          BOOLEAN,
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_memory_code
  ON trade_memory(stock_code);

CREATE INDEX IF NOT EXISTS idx_trade_memory_created
  ON trade_memory(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_memory_closed
  ON trade_memory(closed_at DESC)
  WHERE closed_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2. learning_snapshots 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  sample_size         INT,
  confidence          TEXT,   -- 'none' | 'low' | 'medium' | 'high'

  -- 지표 가중치
  weights_trending    JSONB,
  weights_ranging     JSONB,
  weights_source      TEXT,   -- 'learned' | 'default'

  -- ATR 배수 (P1)
  atr_mult_stop       NUMERIC DEFAULT 2.0,
  atr_mult_profit     NUMERIC DEFAULT 3.0,
  atr_mult_trailing   NUMERIC DEFAULT 1.5,
  atr_source          TEXT,   -- 'learned' | 'default'

  -- 포지션 사이징 (P2)
  target_risk_amount  INT DEFAULT 30000,
  sizing_source       TEXT,   -- 'learned' | 'default'

  -- 기존 learnRiskParams() 유지 항목
  take_profit_ratio   INT DEFAULT 50,
  risk_source         TEXT,   -- 'learned' | 'default'

  -- 성과 요약
  win_rate            NUMERIC,
  avg_win             NUMERIC,
  avg_loss            NUMERIC,

  -- 세부 패턴 통계 (P4)
  -- { rsi_ranges, macd_patterns, combos }
  pattern_stats       JSONB,

  is_active           BOOLEAN DEFAULT false,
  expires_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learning_active
  ON learning_snapshots(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_expires
  ON learning_snapshots(expires_at DESC);

-- ────────────────────────────────────────────────────────────
-- 3. positions → trade_memory 백필 SQL
-- (배포 직후 Supabase SQL Editor에서 1회 실행)
-- entry_signal JSONB 컬럼이 있는 청산 완료 건만 처리
-- ────────────────────────────────────────────────────────────
/*
INSERT INTO trade_memory (
  created_at, stock_code, stock_name,
  rsi_value, macd_histogram, ma_cross, bb_position,
  volume_ratio, adx_value, candle_pattern,
  regime, base_score, learned_score, total_score,
  weights_source, atr_value,
  pnl_percent, pnl_amount, hold_days, exit_reason,
  is_win, closed_at
)
SELECT
  entry_date,
  stock_code,
  stock_name,
  (entry_signal->'raw'->>'rsi')::numeric,
  (entry_signal->'raw'->>'macd')::numeric,
  CASE
    WHEN (entry_signal->'raw'->>'macdCrossover') = 'golden' THEN 'golden'
    WHEN (entry_signal->'raw'->>'macdCrossover') = 'dead'   THEN 'dead'
    ELSE 'none'
  END,
  entry_signal->'raw'->>'bbPosition',
  (entry_signal->'raw'->>'volumeRatio')::numeric,
  (entry_signal->'raw'->>'adx')::numeric,
  '(백필)' AS candle_pattern,
  entry_signal->'raw'->>'regime',
  (entry_signal->>'totalScore')::int,
  (entry_signal->>'totalScore')::int,
  (entry_signal->>'totalScore')::int,
  'default',
  (entry_signal->'raw'->>'atr')::numeric,
  pnl_percent,
  pnl_amount,
  hold_days,
  exit_reason,
  CASE WHEN pnl_amount > 0 THEN true ELSE false END,
  exit_date
FROM positions
WHERE status = 'closed'
  AND exit_date IS NOT NULL
  AND entry_signal IS NOT NULL;
*/
