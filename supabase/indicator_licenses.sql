create table if not exists indicator_licenses (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  contact text not null,
  mt4_account_id text not null,
  account_server text,
  product_code text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DISABLED','EXPIRED')),
  paid_confirmed boolean not null default false,
  expires_at timestamptz,
  last_verified_at timestamptz,
  last_denied_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_indicator_licenses_account_product
  on indicator_licenses (mt4_account_id, product_code);

create index if not exists idx_indicator_licenses_status
  on indicator_licenses (status);

alter table indicator_licenses enable row level security;

drop policy if exists "service_role_indicator_licenses" on indicator_licenses;
create policy "service_role_indicator_licenses" on indicator_licenses
  for all
  to service_role
  using (true)
  with check (true);
