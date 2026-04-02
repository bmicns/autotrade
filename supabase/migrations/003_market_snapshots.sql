-- 장 초반 시세 스냅샷 (09:00 수집 → 09:30 엔진에서 참조)
create table if not exists market_snapshots (
  id uuid default gen_random_uuid() primary key,
  stock_code text not null,
  stock_name text,
  open_price numeric,
  snapshot_price numeric,
  snapshot_volume bigint,
  captured_at timestamptz default now(),
  date text not null
);
create index if not exists idx_snapshots_date_code on market_snapshots(date, stock_code);
