-- Persistent transition state for the report-only engine heartbeat monitor.
-- This monitor never starts, stops, or modifies the Windows engine.

create table if not exists public.engine_monitor_state (
  monitor_key text primary key,
  status text not null default 'HEALTHY' check (status in ('HEALTHY', 'STALE')),
  last_heartbeat_at timestamptz,
  last_alert_at timestamptz,
  last_recovery_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint engine_monitor_singleton check (monitor_key = 'engine')
);

alter table public.engine_monitor_state enable row level security;

drop policy if exists "service_role_engine_monitor_state" on public.engine_monitor_state;
create policy "service_role_engine_monitor_state"
  on public.engine_monitor_state
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.engine_monitor_state from anon, authenticated;
grant select, insert, update, delete on table public.engine_monitor_state to service_role;

insert into public.engine_monitor_state (monitor_key, status)
values ('engine', 'HEALTHY')
on conflict (monitor_key) do nothing;
