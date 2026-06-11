create table if not exists account_guardian_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  balance numeric,
  equity numeric,
  net_profit numeric,
  daily_loss_limit numeric,
  daily_loss_used numeric,
  daily_remaining numeric,
  max_loss_limit numeric,
  max_loss_used numeric,
  max_loss_remaining numeric,
  profit_target numeric,
  mode text,
  open_positions jsonb not null default '[]'::jsonb,
  pending_orders jsonb not null default '[]'::jsonb,
  guardian_state text not null,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb
);

create index if not exists account_guardian_snapshots_created_idx
on account_guardian_snapshots (created_at desc);
