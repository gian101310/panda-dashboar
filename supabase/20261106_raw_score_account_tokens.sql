-- Reuse the existing per-license hashed token flow for Raw Score Engine.
-- Existing product/platform restrictions and RLS remain in place.
alter table public.indicator_confluence_tokens
  drop constraint indicator_confluence_tokens_product_code_check;
alter table public.indicator_confluence_tokens
  add constraint indicator_confluence_tokens_product_code_check
  check (product_code in ('ctrader_trend_confluence_v1', 'mt5_trend_confluence_v1', 'ctrader_raw_score_engine'));
