begin;

-- Remove the retired Hermes database API before dropping its storage.
drop function if exists public.get_hermes_learnings();
drop function if exists public.insert_hermes_learning(
  text,
  text,
  text,
  real,
  integer,
  jsonb,
  text[],
  text
);
drop table if exists public.hermes_learnings;

-- Remove the retired Guardian snapshot/notification stores.
drop table if exists public.account_guardian_snapshots;
drop table if exists public.engine_notifications;

-- These tables are accessed only through server-side routes or the engine.
alter table public.pf_waitlist enable row level security;
alter table public.shadow_tracker enable row level security;

revoke all privileges on table
  public.pf_waitlist,
  public.shadow_tracker
from anon, authenticated;

grant all privileges on table
  public.pf_waitlist,
  public.shadow_tracker
to service_role;

-- Remove policies whose names implied service-only access but whose PUBLIC
-- role or unconditional expressions granted browser clients broad access.
drop policy if exists "anon_read_engine_config" on public.engine_config;
drop policy if exists "anon_write_engine_config" on public.engine_config;
drop policy if exists "service_role_engine_config" on public.engine_config;

drop policy if exists "service_role_full_access" on public.ea_executions;
drop policy if exists "service_role_full_access" on public.engine_heartbeat;

drop policy if exists "service_role_all" on public.signal_results;
drop policy if exists "authenticated_read" on public.signal_snapshots;
drop policy if exists "service_role_all" on public.signal_snapshots;
drop policy if exists "Authenticated read" on public.signal_tracker;
drop policy if exists "Service role full access" on public.signal_tracker;
drop policy if exists "Allow service role full access" on public.site_config;
drop policy if exists "Anyone can read site_settings" on public.site_settings;
drop policy if exists "Service role can write site_settings" on public.site_settings;

revoke all privileges on table
  public.engine_config,
  public.ea_executions,
  public.engine_heartbeat,
  public.signal_results,
  public.signal_snapshots,
  public.signal_tracker,
  public.site_config,
  public.site_settings
from anon, authenticated;

grant all privileges on table
  public.engine_config,
  public.ea_executions,
  public.engine_heartbeat,
  public.signal_results,
  public.signal_snapshots,
  public.signal_tracker,
  public.site_config,
  public.site_settings
to service_role;

-- Keep the remaining privileged read helpers internal. Pinning search_path
-- also removes mutable-search-path warnings for these SECURITY DEFINER RPCs.
alter function public.get_dashboard_snapshot() set search_path = public, pg_temp;
revoke execute on function public.get_dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot() to service_role;

alter function public.get_ea_executions() set search_path = public, pg_temp;
revoke execute on function public.get_ea_executions() from public, anon, authenticated;
grant execute on function public.get_ea_executions() to service_role;

alter function public.get_engine_heartbeat() set search_path = public, pg_temp;
revoke execute on function public.get_engine_heartbeat() from public, anon, authenticated;
grant execute on function public.get_engine_heartbeat() to service_role;

alter function public.get_gap_history_sample(text, integer) set search_path = public, pg_temp;
revoke execute on function public.get_gap_history_sample(text, integer) from public, anon, authenticated;
grant execute on function public.get_gap_history_sample(text, integer) to service_role;

alter function public.get_signal_results_summary() set search_path = public, pg_temp;
revoke execute on function public.get_signal_results_summary() from public, anon, authenticated;
grant execute on function public.get_signal_results_summary() to service_role;

commit;
