alter table public.indicator_licenses
  add column if not exists platform text not null default 'MT4',
  add column if not exists trading_account_number text;

update public.indicator_licenses
set trading_account_number = mt4_account_id
where trading_account_number is null;

create index if not exists idx_indicator_licenses_platform_account_product
  on public.indicator_licenses (platform, trading_account_number, product_code);

create table if not exists public.indicator_feed_settings (
  setting_key text primary key check (setting_key = 'ctrader_operator_token'),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  rotated_at timestamptz not null default now(),
  rotated_by text
);

alter table public.indicator_feed_settings enable row level security;

drop policy if exists "service_role_indicator_feed_settings" on public.indicator_feed_settings;
create policy "service_role_indicator_feed_settings"
  on public.indicator_feed_settings
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.indicator_feed_settings from anon, authenticated;
