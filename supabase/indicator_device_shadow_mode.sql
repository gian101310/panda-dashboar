-- Report-only device licensing dry run. All products remain OFF after migration.

alter table public.indicator_device_enforcement
  add column if not exists mode text;

update public.indicator_device_enforcement
set mode = case when enabled is true then 'ENFORCED' else 'OFF' end
where mode is null;

alter table public.indicator_device_enforcement
  alter column mode set default 'OFF';

alter table public.indicator_device_enforcement
  alter column mode set not null;

alter table public.indicator_device_enforcement
  drop constraint if exists indicator_device_enforcement_mode_check;

alter table public.indicator_device_enforcement
  add constraint indicator_device_enforcement_mode_check
  check (mode in ('OFF', 'SHADOW', 'ENFORCED'));

-- Safety lock: deployment prepares shadow mode but never enables it automatically.
update public.indicator_device_enforcement
set enabled = false, mode = 'OFF', updated_at = now();

create table if not exists public.indicator_device_shadow_events (
  id bigint generated always as identity primary key,
  license_id uuid not null references public.indicator_licenses(id) on delete cascade,
  product_code text not null,
  platform text not null check (platform in ('CTRADER', 'MT4', 'MT5')),
  would_status text not null check (char_length(would_status) between 3 and 64),
  installation_present boolean not null default false,
  token_present boolean not null default false,
  bucket_start timestamptz not null,
  event_count bigint not null default 1 check (event_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, product_code, platform, would_status, bucket_start)
);

create index if not exists indicator_device_shadow_events_product_time
  on public.indicator_device_shadow_events (product_code, last_seen_at desc);

alter table public.indicator_device_shadow_events enable row level security;

drop policy if exists "service_role_indicator_device_shadow_events" on public.indicator_device_shadow_events;
create policy "service_role_indicator_device_shadow_events"
  on public.indicator_device_shadow_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.indicator_device_shadow_events from anon, authenticated;
grant select, insert, update, delete on table public.indicator_device_shadow_events to service_role;
grant usage, select on sequence public.indicator_device_shadow_events_id_seq to service_role;

create or replace function public.record_indicator_device_shadow_event(
  p_license_id uuid,
  p_product_code text,
  p_platform text,
  p_would_status text,
  p_installation_present boolean,
  p_token_present boolean,
  p_now timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bucket timestamptz := date_trunc('hour', p_now);
begin
  insert into public.indicator_device_shadow_events (
    license_id, product_code, platform, would_status,
    installation_present, token_present, bucket_start,
    event_count, first_seen_at, last_seen_at
  ) values (
    p_license_id, p_product_code, p_platform, p_would_status,
    coalesce(p_installation_present, false), coalesce(p_token_present, false), v_bucket,
    1, p_now, p_now
  )
  on conflict (license_id, product_code, platform, would_status, bucket_start)
  do update set
    event_count = public.indicator_device_shadow_events.event_count + 1,
    installation_present = excluded.installation_present,
    token_present = excluded.token_present,
    last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.record_indicator_device_shadow_event(uuid, text, text, text, boolean, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.record_indicator_device_shadow_event(uuid, text, text, text, boolean, boolean, timestamptz) to service_role;

create or replace function public.get_indicator_device_shadow_summary()
returns table (
  product_code text,
  would_status text,
  event_count bigint,
  last_seen_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.product_code,
    e.would_status,
    sum(e.event_count)::bigint as event_count,
    max(e.last_seen_at) as last_seen_at
  from public.indicator_device_shadow_events e
  group by e.product_code, e.would_status
  order by e.product_code, event_count desc;
$$;

revoke all on function public.get_indicator_device_shadow_summary() from public, anon, authenticated;
grant execute on function public.get_indicator_device_shadow_summary() to service_role;
