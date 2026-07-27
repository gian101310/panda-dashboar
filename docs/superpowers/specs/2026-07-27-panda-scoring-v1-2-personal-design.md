# Panda Scoring v1.2 Personal Edition Design

## Objective

Create a separate personal-use MT4 indicator named `Panda Scoring v1.2` with the full original configuration surface and the corrected non-overlapping panel layout.

## Source and Output

- Use the repository's current corrected Free-edition source as the base.
- Create `panda-indicators/2026-07-20/mql4/Panda Scoring v1.2.mq4`.
- Keep `Panda Scoring Free.mq4` unchanged and available as a separate edition.
- Set `IndicatorShortName` and the source header to `Panda Scoring v1.2`.
- Preserve all scoring, market-structure, Panda Lines, BOS, trigger, and alert logic.

## Inputs

Expose every original configuration group:

- Scoring threshold, box calculation timeframe, box spans/offsets, and refresh interval.
- Panda Lines, SuperTrend, Follow Line, and their calculation parameters.
- XTF structure, swing length, boxes, BOS, flips, and triggers.
- Alerts.
- Panel visibility, corner, position, width, font size, colors, and score grid.
- Box colors.

Use clean chart defaults:

- Boxes: off.
- Panda Lines: off.
- SuperTrend: off.
- Follow Line: off.
- BOS arrows: off.
- Flip dots: off.
- Trigger markers: off.
- Score grid: off.

All settings remain available for manual enabling.

## Panel Layout

- Preserve the 410 px effective minimum width.
- Preserve the value column at 220 px from the panel's left edge.
- Preserve all eight panel rows.
- Continue clamping the panel inside the visible chart area.

## Licensing and Dependencies

- Personal use only.
- No licensing, expiry, account restriction, remote shutdown, dashboard, API, network, or external-file dependency.

## Verification

- Confirm every original parameter appears in the MT4 Inputs tab.
- Confirm a default attachment shows only the panel.
- Confirm each optional drawing can be enabled individually.
- Confirm Market Structure H1/H4 labels do not overlap their values at every panel corner.
- Compile in MetaEditor with zero errors.
- Run `python3 check_dupes.py` and `npx next build` before committing implementation.

