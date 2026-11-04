# Windows handoff — 2026-11-04 V5 pullback zone

- User reported NZDCAD gap -7/SELL with a `POSSIBLE SELL PULLBACK` drawing below current chart price. The drawing was based on a confirmed H1 close and kept a stable level while live price moved.
- V5 now checks the current chart bid before drawing. It removes a SELL area once bid is above the entire zone or a BUY area once bid is below it, relabels an area currently reached as `AT LEVEL • WAIT`, and limits the area to the 5–8 pullback path.
- V5 market context (9+ gap) keeps its existing checks and does not use a pullback drawing. No Panda score, V5 decision, order, or risk-plan rule changed.
- Rebuild, tests, deployment, and live chart verification are recorded in the related commit and final response.
