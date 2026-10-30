import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from lib.panda_lifecycle_calibration import calculate_report


class CalibrationTests(unittest.TestCase):
    def test_completed_nonoverlapping_four_hour_outcomes_can_validate(self):
        now = datetime(2026, 10, 30, 18, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as folder:
            by_day = {}
            for day in range(24):
                base = now - timedelta(days=24 - day)
                for hour in (0, 8):
                    start = base.replace(hour=hour, minute=0, second=0, microsecond=0)
                    for offset, price, phase in ((0, 1.20, "STRONG CONTINUATION"),
                                                 (4, 1.21, "CONTINUING / UNCONFIRMED")):
                        stamp = start + timedelta(hours=offset)
                        record = {"version": 2, "generated_utc": stamp.isoformat(), "pairs": {
                            "EURUSD": {"price": price, "gap": 9, "bias": "BUY",
                                       "valid": True, "phase": phase}}}
                        by_day.setdefault(stamp.date().isoformat(), []).append(record)
            for date, records in by_day.items():
                with (Path(folder) / f"{date}.jsonl").open("w") as stream:
                    for record in records:
                        stream.write(json.dumps(record) + "\n")
            result = calculate_report(folder, now)["EURUSD"]["STRONG"]
            self.assertEqual(result["status"], "VALIDATED")
            self.assertEqual(result["percent"], 100)
            self.assertGreaterEqual(result["samples"], 45)
            self.assertGreaterEqual(result["days"], 20)

    def test_one_day_never_shows_percentage(self):
        now = datetime(2026, 10, 30, 18, tzinfo=timezone.utc)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "2026-10-30.jsonl"
            with path.open("w") as stream:
                for hour in (0, 4, 8, 12):
                    stamp = now.replace(hour=hour)
                    stream.write(json.dumps({"version": 2, "generated_utc": stamp.isoformat(), "pairs": {
                        "EURUSD": {"price": 1.20 + hour * .001, "gap": 9,
                                   "bias": "BUY", "valid": True,
                                   "phase": "STRONG CONTINUATION"}}}) + "\n")
            result = calculate_report(folder, now)["EURUSD"]["STRONG"]
            self.assertEqual(result["status"], "COLLECTING")
            self.assertNotIn("percent", result)


if __name__ == "__main__":
    unittest.main()
