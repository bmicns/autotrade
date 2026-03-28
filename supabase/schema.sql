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
