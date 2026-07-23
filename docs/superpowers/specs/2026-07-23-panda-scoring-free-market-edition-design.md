# Panda Scoring Free Market Edition Design

## Objective

Prepare the existing MT4 `Panda Scoring v1` indicator as a clean, permanently free MQL Market edition. The default chart presentation shows only the scoring panel. Customers may optionally enable signal triggers and alerts, but cannot expose or alter the internal scoring and strategy configuration.

The free edition contains no expiry, account-number lock, remote shutdown, dashboard dependency, or other custom licensing restriction. A future paid Pro edition will be a separate Market product and may expose Panda Lines and selected advanced settings.

## Source and Deliverable

- Modify only the repository source at `panda-indicators/2026-07-20/mt4-xtf-bos/Panda Scoring v1.mq4`.
- Do not modify the external Claude output copy.
- Preserve all scoring formulas and signal logic. This change affects configuration visibility and chart presentation only.
- Produce an MT4 source that can be compiled into the free Market `.ex4`.

## Customer-Facing Inputs

Keep these controls visible in the MT4 Inputs tab:

- Alerts: master enable, popup, and sound.
- Panel: show/hide, corner, X/Y position, width, font size, background color, border color, title color, buy color, sell color, wait color, text color, and label color.
- Triggers: show/hide trigger markers.

`ShowTriggers` defaults to `false`, ensuring that the first-run chart contains only the panel.

## Internal Configuration

Convert the remaining customer inputs to internal constants or variables while preserving their current calculation values:

- Gap threshold and refresh interval.
- Box calculation timeframe, spans, and offsets.
- Panda Lines, SuperTrend, and Follow Line calculation/drawing settings.
- XTF structure selection and swing length.
- BOS, flip, and score-grid display settings.
- Box colors.

Chart drawings default as follows:

- Boxes: permanently disabled in the free edition.
- Panda Lines: disabled.
- SuperTrend: disabled.
- Follow Line: disabled.
- BOS arrows: disabled.
- Flip dots: disabled.
- Trigger markers: disabled by default but customer-selectable.
- Score grid: disabled.

Internal calculations required by the scoring panel continue to run even when their chart drawings are disabled.

## Panel Layout

Retain the eight-row panel:

1. Panda Scoring and current pair
2. Bias
3. Gap
4. Execution
5. Setup
6. Market Structure H1
7. Market Structure H4
8. Panda Lines price zone

Move the value column far enough right that both Market Structure labels are fully visible and do not overlap their values. Increase the default panel width accordingly. Because panel width remains customer-configurable, enforce a safe minimum layout width internally so reducing the input cannot recreate the overlap.

The panel remains responsive to the selected chart corner and X/Y margins.

## Free and Pro Product Boundary

The free edition is permanently functional and contains no deliberate time, account, broker, symbol, or server restriction.

The future Pro edition will be designed separately. Its candidate differences include:

- Visible Panda Lines.
- Optional SuperTrend and Follow Line drawings.
- Additional XTF/BOS controls.
- Selected calculation and display settings.

The exact Pro feature set is intentionally deferred until market feedback is available. MQL Market will provide licensing and activation for the future paid product.

## Failure Handling

- If broker symbol data is unavailable, retain the indicator's existing invalid/wait behavior.
- Hidden drawings must not leave stale chart objects after settings change, reinitialization, or indicator removal.
- Panel placement must clamp to the visible chart area as it does currently.
- No network, API key, engine file, dashboard, or external license service is introduced.

## Verification

- Confirm only the approved alert, panel, color, and trigger controls appear in the Inputs tab.
- Confirm a fresh attachment shows only the panel.
- Confirm no boxes, Panda Lines, SuperTrend, Follow Line, BOS arrows, flip dots, score grid, or trigger markers appear by default.
- Enable triggers and confirm markers can appear without enabling other drawings.
- Test each panel corner and verify Market Structure H1/H4 labels and values do not overlap.
- Reduce the configured panel width and verify the safe minimum still prevents overlap.
- Confirm scoring, bias, gap, execution, setup, H1/H4 structure, and Panda Lines zone values continue updating.
- Compile with zero errors and review warnings.
- Run the repository duplicate check and Next.js build required by the project workflow before the implementation commit.

