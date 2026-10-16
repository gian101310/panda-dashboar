# Scoring mismatch audit - 2026-10-16

Pre-fix audit evidence. **Boss-G confirmed the dominant component is correct:
`+3/-1 -> +3`, not +2.** The net-field comparison column below records the
incorrect alternative; it must not be used to replace the existing gap scorer.

Confirmed stored snapshot: **19:55:08 Dubai / 15:55:08 UTC**, all 21 pairs.
The gap column and displayed timeframe fields disagree for the pairs listed below.
Net-field comparison uses the existing scorer on the stored numeric TF values.
This comparison is not yet an approved scoring rule.

| Pair | Stored gap | Gap from displayed TF values |
|---|---:|---:|
| AUDCAD | -8 | -7 |
| AUDJPY | -2 | -5 |
| AUDNZD | +0 | +0 |
| AUDUSD | -1 | -1 |
| CADJPY | +0 | +0 |
| EURAUD | +1 | +1 |
| EURCAD | -7 | -6 |
| EURGBP | -7 | -6 |
| EURJPY | -1 | -4 |
| EURNZD | +0 | +0 |
| EURUSD | +0 | +0 |
| GBPAUD | +8 | +7 |
| GBPCAD | +0 | +0 |
| GBPJPY | +0 | +0 |
| GBPNZD | +0 | +0 |
| GBPUSD | +7 | +6 |
| NZDCAD | +0 | +0 |
| NZDJPY | +0 | +0 |
| NZDUSD | +0 | +0 |
| USDCAD | -7 | -6 |
| USDJPY | -1 | -4 |


## Reproduction

`AUD D1:+1 H4:-1 H1:-5` scores -5.
`CAD D1:+2 H4:+2 H1:+3/-1` is displayed as +2/+2/+2, but the
current extractor scores CAD +3 because it treats split components separately.
Hence gap -8, whereas net CAD +2 gives gap -7. This is a representative
reproduction; the historical raw line was not preserved in the database.

The live current source files were also checked across all 21 pairs: each repeated
currency had one consistent raw line. At the later live sample CAD was an unsplit
+3, so a current -8 at that later time is not evidence the 19:55 net values were +3.
Do not mix these timestamps.

## Final correction following Boss-G clarification

Fix `parse_tf_score`, which incorrectly summed split components for display.
Display the dominant component by absolute magnitude. Equal opposing magnitudes
display zero, consistent with the existing strongest-score tie rule. Base/quote
and ADV timeframe fields now use this parser consistently. Consumers of these
fields, including USD-strength reporting/filtering, receive dominant values.

Example: AUD -5 and CAD +3 -> AUDCAD -8, with CAD H1 now showing +3.
Do not replace this with -7 based on the former summed display cell.

`extract_panda_score`, `compute_scores_all_pairs` and `run_gap_once` stay
unchanged, verified by AST comparison. Raw lines are preserved, so opposing
extreme conflict detection and global invalidation remain intact. BB/INTRA,
gap thresholds and PREV_GAP ordering are unchanged. Historical snapshots are
retained as evidence; only subsequent cycles receive corrected display fields.
