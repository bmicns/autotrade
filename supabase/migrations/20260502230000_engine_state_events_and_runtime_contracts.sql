-- Runtime contract hardening for NEXIO

create table if not exists engine_state_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  stock_code text,
  entity_table text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_engine_state_events_created
  on engine_state_events(created_at desc);

alter table positions
  add column if not exists partial_exit_price integer,
  add column if not exists partial_exit_qty integer,
  add column if not exists updated_at timestamptz default now();

alter table pending_orders
  add column if not exists strategy_key text;

alter table trade_memory
  add column if not exists stop_price integer,
  add column if not exists profit_price integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'positions_phase_check'
  ) then
    alter table positions
      add constraint positions_phase_check
      check (phase in ('initial', 'full', 'partial_tp', 'final_tp'));
  end if;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'positions_status_check'
  ) then
    alter table positions
      add constraint positions_status_check
      check (status in ('open', 'closed'));
  end if;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pending_signals_status_check'
  ) then
    alter table pending_signals
      add constraint pending_signals_status_check
      check (status in ('pending', 'approved', 'processing', 'expired', 'rejected', 'failed'));
  end if;
exception
  when duplicate_object then null;
end
$$;
