-- watchlist 테이블 (관심종목)
CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text,
  active boolean DEFAULT true,
  added_at timestamptz DEFAULT now()
);

-- pending_signals 테이블 (약한 신호 승인 대기)
CREATE TABLE IF NOT EXISTS pending_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code text NOT NULL,
  stock_name text,
  signal_score numeric,
  signal_comment text,
  signal_data jsonb,
  source text DEFAULT 'watchlist',  -- watchlist / surge
  status text DEFAULT 'pending',     -- pending / approved / rejected / expired
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_watchlist_active ON watchlist(active);
CREATE INDEX IF NOT EXISTS idx_pending_signals_status ON pending_signals(status);
CREATE INDEX IF NOT EXISTS idx_pending_signals_created ON pending_signals(created_at);
