-- NEXIO 고도화: 포지션 라이프사이클 + 엔진 실행 로그
-- Supabase Dashboard > SQL Editor에서 실행

-- 포지션 테이블 (매수→매도 연결 추적)
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code text NOT NULL,
  stock_name text,
  entry_price numeric NOT NULL,
  entry_qty int NOT NULL,
  entry_date timestamptz DEFAULT now(),
  entry_signal jsonb,          -- 진입 시 지표 스냅샷
  signal_strength text,        -- strong / weak
  exit_price numeric,
  exit_qty int,
  exit_date timestamptz,
  exit_reason text,            -- stop_loss, take_profit, trailing_stop, signal_sell
  pnl_amount numeric,          -- 실현 손익 (원)
  pnl_percent numeric,         -- 실현 수익률 (%)
  hold_days int,               -- 보유일수
  phase text DEFAULT 'full',   -- initial(분할매수 1차) / full(전량)
  status text DEFAULT 'open',  -- open / closed
  created_at timestamptz DEFAULT now()
);

-- 엔진 실행 로그
CREATE TABLE IF NOT EXISTS engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz DEFAULT now(),
  trade_count int DEFAULT 0,
  actions jsonb,
  scanned_count int DEFAULT 0,
  duration_ms int,
  error text
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_entry_date ON positions(entry_date);
CREATE INDEX IF NOT EXISTS idx_positions_exit_date ON positions(exit_date);
CREATE INDEX IF NOT EXISTS idx_engine_runs_run_at ON engine_runs(run_at);
