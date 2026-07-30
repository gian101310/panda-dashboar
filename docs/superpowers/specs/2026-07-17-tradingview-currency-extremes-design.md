# TradingView Currency Extremes Design

## Goal

Show the engine-style extreme timeframe readings for the chart pair's base and
quote currencies in both private TradingView overlays.

## Behaviour

- Reuse the overlays' existing computed D1, H4, and H1 currency scores.
- An extreme is any signed score whose absolute value is at least 4. This
  covers positive and negative values such as `+4`, `+5`, `+6`, `-4`, `-5`,
  and `-6`.
- List every qualifying timeframe in `D1`, `H4`, `H1` order. For example:
  `GBP: H4 +5 · H1 +4` and `JPY: D1 -6`.
- If a currency has no qualifying timeframe, show `<currency>: NONE`.
- Add the two display-only rows beneath `GAP` in both panels: `BASE XTF` and
  `QUOTE XTF`.

## Boundaries

- Do not change the locked Python engine scoring functions.
- Do not change Pine score calculation, Bias, Box, Panda Lines, BOS, or the
  XTF/BOS trigger gates.
- Do not add network requests, credentials, trading orders, alerts, or API
  integration.
