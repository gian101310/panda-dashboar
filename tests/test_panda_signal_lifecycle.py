import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from lib.panda_signal_lifecycle import build_lifecycle_snapshot, export_lifecycle_snapshot


NOW = datetime(2026, 10, 30, 10, 0, tzinfo=timezone.utc)


def row(symbol, bias, gap, price, **extra):
    return {"symbol": symbol, "bias": bias, "gap": gap, "pl_price": price,
            "hard_invalid": False, "pl_zone": "ABOVE" if bias == "BUY" else "BELOW", **extra}


class LifecycleTests(unittest.TestCase):
    def test_related_currency_breadth_and_strong_continuation(self):
        rows = [row("EURUSD", "BUY", 9, 1.11), row("EURJPY", "BUY", 8, 160),
                row("EURGBP", "BUY", 6, .87), row("GBPUSD", "BUY", 7, 1.25),
                row("AUDUSD", "BUY", 7, .66)]
        boxes = {"EURUSD": {"boxes": [
            {"start_ts": 1000000, "end_ts": 1000000 + 2 * 86400,
             "open_price": 1.09, "close_price": 1.10},
            {"start_ts": 1000000, "end_ts": 1000000 + 14 * 86400,
             "open_price": 1.08, "close_price": 1.105}]}}
        previous = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                    "pairs": {"EURUSD": {"bias": "BUY", "gap": 8, "price": 1.108,
                                       "box_position": {"H1": "INSIDE", "H4": "ABOVE", "D1": "UNKNOWN"}},
                              "EURJPY": {"price": 159.9}, "EURGBP": {"price": .869},
                              "GBPUSD": {"price": 1.249}, "AUDUSD": {"price": .659}}}
        result = build_lifecycle_snapshot(rows, boxes, previous, NOW)["pairs"]["EURUSD"]
        self.assertEqual(result["phase"], "STRONG ALIGNMENT / EARLY")
        self.assertEqual(result["base_breadth"]["agree"], 2)
        self.assertEqual(result["quote_breadth"]["agree"], 2)
        self.assertEqual(result["box_position"]["H1"], "ABOVE")
        self.assertEqual(result["box_changes"], ["H1 INSIDE -> ABOVE"])
        previous["pairs"]["EURUSD"]["trend_start_utc"] = (NOW - timedelta(hours=2)).isoformat()
        mature = build_lifecycle_snapshot(rows, boxes, previous, NOW)["pairs"]["EURUSD"]
        self.assertEqual(mature["phase"], "STRONG CONTINUATION")

    def test_near_opposing_level_is_prominent_context(self):
        current = build_lifecycle_snapshot(
            [row("GBPUSD", "BUY", 7, 1.33840, pdh=1.33845)], {}, now=NOW)["pairs"]["GBPUSD"]
        self.assertTrue(current["level_review"])
        self.assertEqual(current["nearest_opposing_level"],
                         {"name": "PDH", "distance_pips": 0.5})

    def test_fading_buy_and_stale_previous(self):
        rows = [row("EURUSD", "BUY", 5, 1.10), row("EURJPY", "SELL", -6, 160),
                row("GBPUSD", "SELL", -6, 1.25)]
        previous = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                    "pairs": {"EURUSD": {"bias": "BUY", "gap": 8, "price": 1.101}}}
        current = build_lifecycle_snapshot(rows, {}, previous, NOW)["pairs"]["EURUSD"]
        self.assertEqual(current["phase"], "MIXED / SLOWING")
        self.assertEqual(current["base_breadth"]["oppose"], 1)
        self.assertEqual(current["quote_breadth"]["oppose"], 1)
        self.assertEqual(current["adverse_streak"], 1)
        previous["generated_utc"] = (NOW - timedelta(minutes=21)).isoformat()
        stale = build_lifecycle_snapshot(rows, {}, previous, NOW)["pairs"]["EURUSD"]
        self.assertEqual(stale["phase"], "BASELINE / UNCONFIRMED")
        self.assertIsNone(stale["gap_change_with_bias"])

    def test_export_excludes_stale_price_file(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "panda_lifecycle_snapshot.json"
            export_lifecycle_snapshot([row("EURUSD", "BUY", 9, 1.11)], {}, target,
                                      NOW, price_source_dir=folder)
            saved = json.loads(target.read_text(encoding="utf-8"))["pairs"]["EURUSD"]
            self.assertIsNone(saved["price"])
            self.assertEqual(saved["box_position"]["H1"], "UNKNOWN")
            self.assertEqual(saved["four_hour_evidence"]["status"], "COLLECTING")

    def test_new_valid_bias_is_starting(self):
        prior = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                 "pairs": {"EURUSD": {"bias": "BUY", "valid": False, "gap": 0, "price": 1.10}}}
        current = build_lifecycle_snapshot([row("EURUSD", "BUY", 5, 1.101)], {}, prior, NOW)
        self.assertEqual(current["pairs"]["EURUSD"]["phase"], "STARTING / UNCONFIRMED")
        recent = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                  "pairs": {"EURUSD": {"bias": "BUY", "valid": True, "gap": 5,
                                       "price": 1.10,
                                       "trend_start_utc": (NOW - timedelta(minutes=10)).isoformat()}}}
        persisted = build_lifecycle_snapshot([row("EURUSD", "BUY", 5, 1.101)], {}, recent, NOW)
        self.assertEqual(persisted["pairs"]["EURUSD"]["phase"], "STARTING / UNCONFIRMED")

    def test_invalidated_signal_is_labeled_ended_once(self):
        prior = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                 "pairs": {"EURUSD": {"bias": "BUY", "valid": True, "gap": 5, "price": 1.10}}}
        ended = build_lifecycle_snapshot([row("EURUSD", "WAIT", 3, 1.10)], {}, prior, NOW)
        self.assertEqual(ended["pairs"]["EURUSD"]["phase"], "PANDA SIGNAL ENDED")

    def test_flat_gap_and_small_pullback_do_not_mark_trend_mature(self):
        rows = [row("USDCAD", "SELL", -9, 1.39627, dayl=1.39582),
                row("GBPUSD", "BUY", 9, 1.34), row("AUDCAD", "SELL", -5, 0.91),
                row("EURCAD", "SELL", -10, 1.51)]
        boxes = {"USDCAD": {"boxes": [
            {"start_ts": 1000000, "end_ts": 1000000 + 2 * 86400,
             "open_price": 1.39890, "close_price": 1.40685},
            {"start_ts": 1000000, "end_ts": 1000000 + 14 * 86400,
             "open_price": 1.39890, "close_price": 1.41343}]}}
        prior = {"generated_utc": (NOW - timedelta(minutes=5)).isoformat(),
                 "pairs": {"USDCAD": {"bias": "SELL", "valid": True, "gap": -9,
                                      "price": 1.39619, "trend_start_utc": (NOW - timedelta(hours=8)).isoformat()},
                           "GBPUSD": {"price": 1.339}, "AUDCAD": {"price": .911},
                           "EURCAD": {"price": 1.511}}}
        current = build_lifecycle_snapshot(rows, boxes, prior, NOW)["pairs"]["USDCAD"]
        self.assertEqual(current["phase"], "STRONG CONTINUATION")
        self.assertEqual(current["nearest_opposing_level"], {"name": "DAYL", "distance_pips": 4.5})
        self.assertTrue(current["level_review"])


if __name__ == "__main__":
    unittest.main()
