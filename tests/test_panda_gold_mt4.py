import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from lib.panda_gold_mt4 import read_gold_state


NOW = datetime.fromtimestamp(1_800_000_000, timezone.utc)


class GoldMt4BridgeTest(unittest.TestCase):
    def write_state(self, root, *, generated=1_800_000_000, event=1_799_999_940,
                    active=1, direction=-1, filter_ready=1):
        fields = ["PANDA_GOLD_MT4_V1", generated, 12345, "XAUUSD", 60,
                  1_799_999_900, event, direction, active, "4012.50", "4022.50",
                  "4002.50", "3992.50", "3982.50", -2, filter_ready]
        (Path(root) / "panda_gold_mt4_XAUUSD_60.txt").write_text(
            "|".join(map(str, fields)) + "\n", encoding="utf-8")

    def test_fresh_signal_carries_mt4_prices_and_identity(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_state(root)
            state = read_gold_state(root, now=NOW)
            self.assertEqual((state["source"], state["status"], state["entry"], state["sl"]),
                             ("MT4", "SHORT", 4012.5, 4022.5))
            self.assertTrue(state["new_signal"])
            self.assertIn("12345:XAUUSD:60", state["signal_time"])

    def test_old_event_keeps_plan_without_realert(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_state(root, event=1_799_998_000)
            state = read_gold_state(root, now=NOW)
            self.assertEqual(state["status"], "SHORT")
            self.assertFalse(state["new_signal"])

    def test_confirmed_indicator_flip_survives_unavailable_usd_refresh(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_state(root, filter_ready=0)
            state = read_gold_state(root, now=NOW)
            self.assertTrue(state["new_signal"])
            self.assertEqual(state["filter"], "USD UNAVAILABLE")

    def test_stale_state_is_offline_and_does_not_fall_back(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_state(root, generated=1_799_999_000)
            state = read_gold_state(root, now=NOW)
            self.assertEqual(state["status"], "OFFLINE")
            self.assertFalse(state["new_signal"])

    def test_no_export_allows_legacy_source(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertIsNone(read_gold_state(root, now=NOW))


if __name__ == "__main__":
    unittest.main()
