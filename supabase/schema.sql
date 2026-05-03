-- NEXIO Supabase 스키마 — 국내주식 자동매매

-- 사용자 프로필 (auth.users 확장)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  kis_app_key_enc text,
  kis_app_secret_enc text,
  account_no text,
  created_at timestamptz default now()
);

-- 보유 종목
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  quantity integer not null default 0,
  avg_price numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 매매 이력
create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  side text not null check (side in ('buy', 'sell')),
  quantity integer not null,
  price numeric not null,
  signal_strength text check (signal_strength in ('strong', 'weak', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'executed', 'rejected', 'cancelled')),
  executed_at timestamptz,
  created_at timestamptz default now()
);

-- 매매 신호
create table if not exists signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  side text not null check (side in ('buy', 'sell')),
  strength text not null check (strength in ('strong', 'weak')),
  match_count integer not null default 0,
  indicators jsonb default '[]',
  claude_comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- 전략 파라미터
create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  version text not null,
  params jsonb not null default '{}',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- RLS 정책
alter table profiles enable row level security;
alter table holdings enable row level security;
alter table trades enable row level security;
alter table signals enable row level security;
alter table strategies enable row level security;

create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

create policy "Users can manage own holdings" on holdings for all using (auth.uid() = user_id);
create policy "Users can manage own trades" on trades for all using (auth.uid() = user_id);
create policy "Users can manage own signals" on signals for all using (auth.uid() = user_id);
create policy "Users can manage own strategies" on strategies for all using (auth.uid() = user_id);

-- 인덱스
create index if not exists idx_holdings_user on holdings(user_id);
create index if not exists idx_trades_user on trades(user_id);
create index if not exists idx_trades_executed on trades(executed_at desc);
create index if not exists idx_signals_user_status on signals(user_id, status);
create index if not exists idx_strategies_user_active on strategies(user_id, is_active);

-- ============================================================================
-- NEXIO runtime engine schema
-- ============================================================================

create table if not exists app_config (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);

create table if not exists kis_config (
  id text primary key,
  app_key text,
  app_secret text,
  account_no text,
  token text,
  token_expiry timestamptz,
  updated_at timestamptz default now()
);

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pending_signals (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text,
  signal_score integer,
  signal_comment text,
  signal_data jsonb default '{}'::jsonb,
  source text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'processing', 'expired', 'rejected', 'failed')),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text,
  entry_price integer not null,
  entry_qty integer not null,
  entry_date timestamptz not null default now(),
  entry_signal jsonb,
  signal_strength text,
  phase text not null default 'initial' check (phase in ('initial', 'full', 'partial_tp', 'final_tp')),
  sector text,
  partial_exit_price integer,
  partial_exit_qty integer,
  exit_price integer,
  exit_qty integer,
  exit_date timestamptz,
  exit_reason text,
  pnl_amount integer,
  pnl_percent numeric,
  hold_days integer,
  status text not null default 'open' check (status in ('open', 'closed')),
  updated_at timestamptz default now()
);

create table if not exists pending_orders (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text,
  order_no text not null,
  order_qty integer not null,
  limit_price integer not null,
  signal_score integer,
  strategy_key text,
  created_at timestamptz default now()
);

create table if not exists trade_memory (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text,
  rsi_value numeric,
  macd_histogram numeric,
  ma_cross text,
  bb_position text,
  volume_ratio numeric,
  adx_value numeric,
  candle_pattern text,
  regime text,
  base_score integer,
  learned_score integer,
  total_score integer,
  market_bonus integer,
  investor_bonus integer,
  snapshot_bonus integer,
  weights_source text,
  atr_value numeric,
  position_size integer,
  stop_price integer,
  profit_price integer,
  pnl_percent numeric,
  pnl_amount integer,
  hold_days integer,
  exit_reason text,
  is_win boolean,
  closed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists engine_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  trade_count integer not null default 0,
  scanned_count integer not null default 0,
  duration_ms integer not null default 0,
  actions jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz default now()
);

create table if not exists learning_snapshots (
  id uuid primary key default gen_random_uuid(),
  weights jsonb,
  atr_multipliers jsonb,
  position_sizing jsonb,
  risk jsonb,
  pattern_stats jsonb,
  confidence text,
  sample_size integer,
  win_rate numeric,
  avg_win numeric,
  avg_loss numeric,
  is_active boolean default true,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  total_eval integer not null default 0,
  total_pnl integer not null default 0,
  cash_balance integer not null default 0,
  open_positions integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists engine_state_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  stock_code text,
  entity_table text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_watchlist_active on watchlist(active);
create index if not exists idx_pending_signals_status on pending_signals(status, created_at desc);
create index if not exists idx_positions_status on positions(status, entry_date desc);
create index if not exists idx_pending_orders_created on pending_orders(created_at asc);
create index if not exists idx_trade_memory_created on trade_memory(created_at desc);
create index if not exists idx_trade_memory_closed on trade_memory(closed_at desc);
create index if not exists idx_engine_runs_run_at on engine_runs(run_at desc);
create index if not exists idx_learning_snapshots_created on learning_snapshots(created_at desc);
create index if not exists idx_engine_state_events_created on engine_state_events(created_at desc);
