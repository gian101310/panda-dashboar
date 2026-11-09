# Panda Box and Lines Licensed for MT4

This is a separate licensed version of Panda Box and Lines. The original, unlicensed indicator in `2026-11-06/mt4-standalone-scoring` is unchanged.

The indicator calculates current and ADV scores, bias, boxes, and Panda Levels directly from MT4 broker history. It does not read MT4 export files. The companion Expert Advisor checks Panda Engine for approval of the current MT4 account number. It does not trade.

The short scoring box follows the cTrader Panda Levels V2 trading-day rollover. Current and ADV short windows skip weekends; weekly and monthly windows remain unchanged.

The EA calls `POST https://pandaengine.app/api/panda-box-lines-license` with `account_number`. The server looks up the approved `mt4_panda_box_and_lines` license. Approval in License Admin also marks payment confirmed, so no token is issued or entered. The EA writes a short-lived approval state to MT4 terminal global variables. The indicator hides scores, boxes, and levels when approval is denied, missing, or more than 10 minutes old.

Install and activation steps are in `INSTALL-MT4.txt`. The package in `dist` contains both compiled EX4 files.

The licensed indicator exposes only upper-left/upper-right panel placement. Box calculation parameters are internal. Boxes default to yellow and panel text to blue. The license EA has no customer inputs.

Panel, box, and level chart object names are stable per chart. Startup removes copies saved by previous template refreshes so a second panel does not accumulate.

Account-number-only approval is a convenience control, not cryptographic proof of terminal identity. A modified local client could bypass it. This version is intended for account-approved distribution, while the original remains the owner's personal build.
