-- Dedicated Signal-group outbox. Only the engine's service-role client may use it.
create table if not exists public.signal_alert_outbox (
    id uuid primary key default gen_random_uuid(),
    idempotency_key text not null unique,
    symbol text not null,
    alert_type text not null,
    bias text,
    cycle_at timestamptz not null,
    payload jsonb not null,
    status text not null default 'pending'
        check (status in ('pending', 'sending', 'sent', 'failed', 'uncertain', 'expired')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    next_attempt_at timestamptz not null default now(),
    expires_at timestamptz not null,
    lease_expires_at timestamptz,
    last_error text,
    telegram_message_id bigint,
    created_at timestamptz not null default now(),
    sent_at timestamptz
);

create index if not exists signal_alert_outbox_due_idx
    on public.signal_alert_outbox (next_attempt_at, cycle_at)
    where status = 'pending';
create index if not exists signal_alert_outbox_symbol_idx
    on public.signal_alert_outbox (symbol, alert_type, bias, created_at desc);
create index if not exists signal_alert_outbox_lease_idx
    on public.signal_alert_outbox (lease_expires_at)
    where status = 'sending';

alter table public.signal_alert_outbox enable row level security;
revoke all on public.signal_alert_outbox from anon, authenticated;
grant select, insert, update on public.signal_alert_outbox to service_role;
