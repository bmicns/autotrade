-- portfolio_snapshots: 일별 포트폴리오 평가금액 기록
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date date NOT NULL UNIQUE,
  total_eval integer NOT NULL,
  created_at timestamptz DEFAULT now()
);
