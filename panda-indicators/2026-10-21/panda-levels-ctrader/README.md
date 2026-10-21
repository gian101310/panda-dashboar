# Panda Levels for cTrader

Standalone, parameter-free cTrader overlay for personal use.

It draws the three established Panda Boxes from broker H1 data:

- Short box: completed days 2–3, orange
- Medium box: completed weeks 2–3, green
- Long box: completed months 2–3, blue

It also draws the previous completed day's high and low as fixed orange
dotted levels with light zones, labelled `PDH` and `PDL`.

There are no user inputs, Panda Lines, signals, alerts, scoring, panel,
licensing, network access, or trading functions. Period boundaries use UTC.

Open the `PandaLevels/PandaLevels` project in cTrader Automate and build it,
then add **Panda Levels** to any chart.
