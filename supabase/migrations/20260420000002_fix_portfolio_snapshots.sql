-- portfolio_snapshots 스키마 수정: snapshot_date → date, 컬럼 추가
DROP TABLE IF EXISTS portfolio_snapshots;
CREATE TABLE portfolio_snapshots (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date           date NOT NULL UNIQUE,
  total_eval     bigint NOT NULL,
  total_pnl      bigint NOT NULL DEFAULT 0,
  cash_balance   bigint NOT NULL DEFAULT 0,
  open_positions integer NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);
