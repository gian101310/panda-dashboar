alter table public.indicator_licenses
  add column if not exists device_limit integer not null default 1;

alter table public.indicator_licenses
  drop constraint if exists indicator_licenses_device_limit_check;

alter table public.indicator_licenses
  add constraint indicator_licenses_device_limit_check
  check (device_limit between 1 and 100);

create table if not exists public.indicator_license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.indicator_licenses(id) on delete cascade,
  product_code text not null,
  platform text not null check (platform in ('CTRADER', 'MT4', 'MT5')),
  device_id_hash text not null check (char_length(device_id_hash) = 64),
  device_token_hash text not null check (char_length(device_token_hash) = 64),
  device_fingerprint text not null check (char_length(device_fingerprint) = 12),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists indicator_license_devices_active_unique
  on public.indicator_license_devices (license_id, device_id_hash)
  where status = 'ACTIVE';

create index if not exists indicator_license_devices_license_status
  on public.indicator_license_devices (license_id, status, activated_at desc);

alter table public.indicator_license_devices enable row level security;

drop policy if exists "service_role_indicator_license_devices" on public.indicator_license_devices;
create policy "service_role_indicator_license_devices"
  on public.indicator_license_devices
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.indicator_license_devices from anon, authenticated;
grant select, insert, update, delete on table public.indicator_license_devices to service_role;

-- Device enforcement stays disabled until each replacement Licensed binary is live.
create table if not exists public.indicator_device_enforcement (
  product_code text primary key,
  enabled boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.indicator_device_enforcement enable row level security;

drop policy if exists "service_role_indicator_device_enforcement" on public.indicator_device_enforcement;
create policy "service_role_indicator_device_enforcement"
  on public.indicator_device_enforcement
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.indicator_device_enforcement from anon, authenticated;
grant select, insert, update, delete on table public.indicator_device_enforcement to service_role;

insert into public.indicator_device_enforcement (product_code, enabled)
values
  ('ctrader_dashboard_overlay', false),
  ('mt4_dashboard_overlay', false),
  ('mt5_dashboard_overlay', false)
on conflict (product_code) do nothing;

insert into public.store_products (
  code,
  name,
  description,
  currency,
  price,
  pay_link,
  category,
  active,
  sort
)
values
  (
    'ctrader_dashboard_overlay',
    'Panda cTrader Dashboard Overlay',
    'Licensed cTrader scoring and bias overlay. Contact for price until admin adds a payment link.',
    'USD',
    0,
    null,
    'indicator',
    true,
    100
  ),
  (
    'mt4_dashboard_overlay',
    'Panda MT4 Dashboard Overlay',
    'Licensed MT4 scoring and bias overlay. Contact for price until admin adds a payment link.',
    'USD',
    0,
    null,
    'indicator',
    true,
    110
  ),
  (
    'mt5_dashboard_overlay',
    'Panda MT5 Dashboard Overlay',
    'Licensed MT5 scoring and bias overlay. Contact for price until admin adds a payment link.',
    'USD',
    0,
    null,
    'indicator',
    true,
    120
  )
on conflict (code) do nothing;

create or replace function public.register_indicator_device(
  p_license_id uuid,
  p_product_code text,
  p_platform text,
  p_device_id_hash text,
  p_device_token_hash text,
  p_device_fingerprint text,
  p_now timestamptz default now()
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_license record;
  v_active_count integer;
begin
  if char_length(coalesce(p_device_id_hash, '')) <> 64
     or char_length(coalesce(p_device_token_hash, '')) <> 64
     or char_length(coalesce(p_device_fingerprint, '')) <> 12 then
    return 'DEVICE_AUTH_ERROR';
  end if;

  select
    id,
    product_code,
    platform,
    status,
    paid_confirmed,
    expires_at,
    device_limit
  into v_license
  from public.indicator_licenses
  where id = p_license_id
  for update;

  if not found then return 'NOT_FOUND'; end if;
  if v_license.product_code <> p_product_code or v_license.platform <> p_platform then
    return 'NOT_FOUND';
  end if;
  if v_license.status = 'DISABLED' then return 'DISABLED'; end if;
  if v_license.status = 'PENDING' then return 'PENDING'; end if;
  if v_license.status = 'EXPIRED' or (v_license.expires_at is not null and p_now > v_license.expires_at) then
    return 'EXPIRED';
  end if;
  if v_license.status <> 'APPROVED' then return 'NOT_APPROVED'; end if;
  if v_license.paid_confirmed is false then return 'PAYMENT_PENDING'; end if;

  update public.indicator_license_devices
  set
    device_token_hash = p_device_token_hash,
    device_fingerprint = p_device_fingerprint,
    last_seen_at = p_now,
    updated_at = p_now
  where license_id = p_license_id
    and device_id_hash = p_device_id_hash
    and status = 'ACTIVE';

  if found then return 'DEVICE_REISSUED'; end if;

  select count(*)::integer
  into v_active_count
  from public.indicator_license_devices
  where license_id = p_license_id
    and status = 'ACTIVE';

  if v_active_count >= v_license.device_limit then
    return 'DEVICE_LIMIT_REACHED';
  end if;

  insert into public.indicator_license_devices (
    license_id,
    product_code,
    platform,
    device_id_hash,
    device_token_hash,
    device_fingerprint,
    status,
    activated_at,
    last_seen_at,
    created_at,
    updated_at
  ) values (
    p_license_id,
    p_product_code,
    p_platform,
    p_device_id_hash,
    p_device_token_hash,
    p_device_fingerprint,
    'ACTIVE',
    p_now,
    p_now,
    p_now,
    p_now
  );

  return 'DEVICE_ACTIVATED';
end;
$$;

revoke execute on function public.register_indicator_device(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_indicator_device(uuid, text, text, text, text, text, timestamptz)
  to service_role;
