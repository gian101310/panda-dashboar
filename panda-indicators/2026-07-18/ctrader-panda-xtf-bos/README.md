# Panda Engine Personal XTF BOS for cTrader

Private cTrader port of the TradingView `Panda Engine Personal TV XTF BOS`
indicator. It computes everything locally from broker market data — no Panda
token, account approval, website API, Supabase, or Windows engine — runs with
`AccessRights.None`, and never places or manages trades. Personal use only;
never publish this binary.

## What it draws and shows

- The three offset Panda Boxes (short = completed days 2-3, medium = completed
  weeks 2-3, long = completed months 2-3) built from H1 data, drawn on the
  chart with the TradingView colors (orange / green / blue).
- Panda Lines: the proven legacy cTrader simple-ATR SuperTrend (10, factor 3,
  evaluated from the prior closed bar) and previous-bar BB(21, 1.0) /
  SMA-TR(5) Follow Line, with confirmed `PL+` / `PL-` flip markers.
- Confirmed one-shot Break of Structure from swing pivots (default length 5),
  with dashed active swing levels and `BOS+` / `BOS-` markers.
- The XTF BOS signal: the selected H1/H4 Box gates a READY state, and a
  matching confirmed BOS prints a one-shot `BUY` / `SELL` trigger marker.
- A draggable, minimizable panel with the same rows as TradingView: BIAS, GAP,
  BASE XTF, QUOTE XTF, XTF, XTF BOX, OTHER BOX, SIGNAL, BOX H1, BOX H4,
  PANDA LINES, FLIP, BOS.

## Scoring (identical contract to the TV script)

21 non-CHF pairs vote per currency on each of the three boxes (above = +1,
below = -1, inside = 0; base gets the vote, quote the inverse). Strongest
takes the extreme with ties = 0; a currency showing both a +4 and a -4 across
D1/H4/H1 is conflicted; two sub-4 currencies are a neutral matchup; either
condition marks HARD_INVALID. GAP = base strongest - quote strongest; BIAS is
BUY at +5, SELL at -5, else WAIT. BASE/QUOTE XTF list every |score| >= 4 in
D1 -> H4 -> H1 order.

## Differences from the TradingView original

- Data comes from the broker's H1 feeds (not OANDA), and day/week/month
  boundaries use UTC server time, so box edges and votes can differ slightly
  around session boundaries.
- No alerts in this first version (TradingView alertconditions are not
  ported); triggers are chart markers and the SIGNAL panel row.
- The panel needs all 21 pairs loaded; the footer shows `n/21 pairs` while
  history loads (BIAS shows DATA UNAVAILABLE until ready).

## Build and install

Build `PandaXtfBos-Personal/PandaXtfBos-Personal/PandaXtfBos.Personal.csproj`
with `dotnet build -c Release` (cTrader.Automate package). The `.algo` lands
in `bin/Release/net6.0/` and, when built on a machine with cTrader, is also
installed to `~/cAlgo/Sources/Indicators` automatically. `dist/` holds the
released binary and its SHA256SUMS. In cTrader, attach
`Panda Engine Personal XTF BOS` to a supported pair chart (H1 recommended).

> **Build required after the July 19 Panda Lines correction:** the repository
> source now matches the legacy cTrader Panda Lines behaviour, but the checked-in
> `dist/PandaXtfBos-Personal.algo` predates that correction. Rebuild this project
> on Windows/cTrader before installing or distributing the corrected binary.
