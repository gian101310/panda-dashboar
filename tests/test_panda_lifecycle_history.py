import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from lib.panda_lifecycle_history import build_history_observation
from lib.panda_signal_lifecycle import build_lifecycle_snapshot, export_lifecycle_snapshot


NOW = datetime(2026, 10, 30, 15, 0, tzinfo=timezone.utc)


class LifecycleHistoryTests(unittest.TestCase):
    def test_records_scores_pips_session_sources_and_missing_boxes(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)
            for name, content in {
                "mt4_EURUSD.txt": "ADV : EUR : D1 : +3 | H4 : +2 | H1 : +1\n"
                                  "ADV : USD : D1 : -2 | H4 : -1 | H1 : 0\n",
                "panda_score_EURUSD.txt": "GAP:9\nBIAS:BUY\n",
                "tbg_EURUSD.txt": "TBG_ZONE:ABOVE\nTBG_G1:VALID\nTBG_BOS:BULLISH\nPDH:1.101\n",
            }.items():
                path = source / name
                path.write_text(content, encoding="utf-8")
                os.utime(path, (NOW.timestamp(), NOW.timestamp()))
            rows = [{"symbol": "EURUSD", "bias": "BUY", "gap": 9,
                     "pl_price": 1.1000, "hard_invalid": False},
                    {"symbol": "EURJPY", "bias": "BUY", "gap": 6,
                     "pl_price": 160.0, "hard_invalid": False}]
            parsed = {"EURUSD": {"base_cur": "EUR", "quote_cur": "USD",
                                 "base_d1": 5, "base_h4": 4, "base_h1": 3,
                                 "quote_d1": -4, "quote_h4": -2, "quote_h1": -1,
                                 "raw_base_line": "EUR D1: +5/-1 H4: +4 H1: +3",
                                 "raw_quote_line": "USD D1: -4 H4: -2 H1: -1",
                                 "boxes": [{"name": "H1Box", "start_ts": 1000000,
                                            "end_ts": 1000000 + 2 * 86400,
                                            "open_price": 1.099, "close_price": 1.101}]}}
            snapshot = build_lifecycle_snapshot(rows, parsed, now=NOW)
            history = build_history_observation(snapshot, rows, parsed, source, NOW)
            item = history["pairs"]["EURUSD"]
            self.assertEqual(history["record_schema"], 3)
            self.assertEqual(history["session"], "NEW_YORK")
            self.assertEqual(history["generated_dubai"], "2026-10-30T19:00:00+04:00")
            self.assertEqual(item["scores"]["base"]["current_components"]["D1"], [5, -1])
            self.assertEqual(item["scores"]["base"]["adv_components"]["D1"], [3])
            self.assertEqual(item["levels"]["PDH"]["level_minus_price_pips"], 10)
            self.assertEqual(item["boxes"]["H1"]["width_pips"], 20)
            self.assertFalse(item["boxes"]["H4"]["available"])
            self.assertIs(item["panda_line"]["g1_valid"], True)
            self.assertTrue(item["sources"]["tbg"]["fresh"])
            self.assertIn("EURJPY", [r["symbol"] for r in item["related_pairs"]])
            os.utime(source / "tbg_EURUSD.txt", (NOW.timestamp() - 3600, NOW.timestamp() - 3600))
            stale = build_history_observation(snapshot, rows, parsed, source, NOW)["pairs"]["EURUSD"]
            self.assertFalse(stale["sources"]["tbg"]["fresh"])
            self.assertIsNone(stale["levels"]["PDH"]["price"])

    def test_rich_history_is_separate_from_calibration_history(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "panda_lifecycle_snapshot.json"
            rows = [{"symbol": "EURUSD", "bias": "BUY", "gap": 9,
                     "pl_price": 1.1, "hard_invalid": False}]
            export_lifecycle_snapshot(rows, {}, target=target, now=NOW)
            compact = json.loads((Path(folder) / "history" / "2026-10-30.jsonl").read_text())
            rich = json.loads((Path(folder) / "history" / "analytics" / "2026-10-30.jsonl").read_text())
            self.assertNotIn("record_schema", compact)
            self.assertEqual(rich["record_schema"], 3)
            self.assertEqual(rich["pairs"]["EURUSD"]["pip_size"], 0.0001)


if __name__ == "__main__":
    unittest.main()
