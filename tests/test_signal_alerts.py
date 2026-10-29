import unittest

from lib.signal_alerts import RecoveryGate, build_idempotency_key, classify_gap_move, consolidate_candidates, render_immediate_message


class SignalAlertTests(unittest.TestCase):
    def test_surge_requires_actual_same_direction_magnitude_gain(self):
        self.assertIsNone(classify_gap_move(8, 8, "BUY"))
        self.assertIsNone(classify_gap_move(8, 7, "BUY"))
        self.assertIsNone(classify_gap_move(7, 9, "BUY"))
        self.assertEqual(classify_gap_move(6, 9, "BUY"), "GAP SURGE")
        self.assertEqual(classify_gap_move(1, 9, "BUY"), "GAP SURGE")
        self.assertEqual(classify_gap_move(-6, -9, "SELL"), "GAP SURGE")
        self.assertEqual(classify_gap_move(4, 5, "BUY"), "GAP CROSSOVER")

    def test_recovery_requires_two_valid_cycles(self):
        gate = RecoveryGate()
        self.assertFalse(gate.mark("EURUSD", True))
        self.assertTrue(gate.mark("EURUSD", True))
        self.assertTrue(gate.mark("EURUSD", True))
        self.assertFalse(gate.mark("EURUSD", False))
        self.assertFalse(gate.mark("EURUSD", True))
        self.assertTrue(gate.mark("EURUSD", True))

    def test_recovery_requires_distinct_cycle_marks(self):
        gate = RecoveryGate()
        self.assertFalse(gate.mark("EURUSD", True, "2026-10-20T16:00:00+00:00"))
        self.assertFalse(gate.mark("EURUSD", True, "2026-10-20T16:00:00+00:00"))
        self.assertTrue(gate.mark("EURUSD", True, "2026-10-20T16:05:00+00:00"))

    def test_consolidates_pair_and_keeps_supporting_evidence(self):
        cycle = "2026-10-20T16:00:00+00:00"
        candidates = [
            {"symbol": "EURUSD", "alert_type": "momentum", "cycle_at": cycle, "detail": "building", "gap": 9, "bias": "BUY"},
            {"symbol": "EURUSD", "alert_type": "early_entry", "cycle_at": cycle, "detail": "new crossover", "gap": 9, "bias": "BUY"},
            {"symbol": "EURUSD", "alert_type": "gap_zone", "cycle_at": cycle, "detail": "Panda Lines confirmed", "gap": 9, "bias": "BUY"},
            {"symbol": "EURUSD", "alert_type": "structure", "cycle_at": cycle, "detail": "bullish BOS", "event_id": "bos:123", "gap": 9, "bias": "BUY"},
            {"symbol": "GBPUSD", "alert_type": "early_entry", "cycle_at": cycle, "detail": "new crossover", "gap": 6, "bias": "BUY"},
        ]
        rows = consolidate_candidates(candidates)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["alert_type"], "structure")
        self.assertEqual(rows[0]["symbol"], "EURUSD")
        self.assertEqual(len(rows[0]["evidence"]), 4)
        self.assertEqual(build_idempotency_key(rows[0]), build_idempotency_key(rows[0]))

    def test_group_message_keeps_pairs_together_and_escapes_html(self):
        rows = [
            {"symbol": "EURUSD", "alert_type": "structure", "gap": 9, "bias": "BUY", "detail": "BOS <confirmed>", "evidence": []},
            {"symbol": "GBPUSD", "alert_type": "early_entry", "gap": 6, "bias": "BUY", "detail": "new crossover", "evidence": []},
        ]
        text = render_immediate_message(rows)
        self.assertIn("EURUSD", text)
        self.assertIn("GBPUSD", text)
        self.assertIn("&lt;confirmed&gt;", text)
        self.assertIn("\n\n━━━━━━━━━━━━━━━━━━━━\n\n", text)
        self.assertIn("EURUSD</b> · Structure change\nBUY | gap +9", text)
        self.assertNotIn("ENTER NOW", text)
        self.assertLess(len(text), 4000)

    def test_conflicting_direction_does_not_enrich_primary_as_confirmation(self):
        cycle = "2026-10-20T16:00:00+00:00"
        rows = consolidate_candidates([
            {"symbol": "EURUSD", "alert_type": "structure", "cycle_at": cycle,
             "bias": "SELL", "detail": "Bearish FLIP"},
            {"symbol": "EURUSD", "alert_type": "gap_zone", "cycle_at": cycle,
             "bias": "BUY", "gap": 9, "detail": "Bullish gap confirmed"},
        ])
        self.assertTrue(rows[0]["conflict"])
        text = render_immediate_message(rows)
        self.assertIn("MIXED", text)
        self.assertNotIn("Bullish gap confirmed", text)


if __name__ == "__main__":
    unittest.main()
