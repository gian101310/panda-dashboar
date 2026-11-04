-- One revocable token per approved Trend Confluence account license.
-- Only the SHA-256 digest is stored; the clear token is returned once at issue time.
create table if not exists public.indicator_confluence_tokens (
  license_id uuid primary key references public.indicator_licenses(id) on delete cascade,
  product_code text not null check (product_code in ('ctrader_trend_confluence_v1', 'mt5_trend_confluence_v1')),
  platform text not null check (platform in ('CTRADER', 'MT5')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz not null default now(),
  issued_by text not null
);

create index if not exists idx_indicator_confluence_tokens_product
  on public.indicator_confluence_tokens (product_code, platform);

alter table public.indicator_confluence_tokens enable row level security;
revoke all on table public.indicator_confluence_tokens from anon, authenticated;
grant select, insert, update, delete on table public.indicator_confluence_tokens to service_role;

drop policy if exists service_role_indicator_confluence_tokens on public.indicator_confluence_tokens;
create policy service_role_indicator_confluence_tokens
  on public.indicator_confluence_tokens for all to service_role
  using (true) with check (true);
