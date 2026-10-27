import unittest
from datetime import datetime, timezone

from test_snapshot_layout import _load_app


class MarketDeskAdvNewsTests(unittest.TestCase):
    def test_adv_agreement_ranks_watchlist_first(self):
        app = _load_app()
        app.snapshot_adv_forecast = lambda row: "TMRW +7" if row["symbol"] == "EURJPY" else "TMRW -7"
        app.summarize_nearby_levels = lambda *_: {"label": "", "names": ""}
        rows = [
            {"symbol": "EURJPY", "bias": "BUY", "gap": 7, "base_score": 5, "quote_score": -2},
            {"symbol": "GBPJPY", "bias": "BUY", "gap": 10, "base_score": 6, "quote_score": -4},
        ]
        watch = app._market_desk_pair_rows(rows)
        self.assertEqual(watch[0][1], "EURJPY")
        self.assertIn("ADV TMRW +7: agrees", watch[0][5])

    def test_news_agreement_requires_current_bias_and_adv(self):
        app = _load_app()
        now = datetime(2026, 10, 28, 18, 0, tzinfo=timezone.utc)
        app.fetch_news_feed = lambda: [{
            "impact": "High", "country": "USD", "title": "CPI m/m",
            "date": "2026-10-28T19:00:00+00:00", "forecast": "0.4%", "previous": "0.2%",
        }]
        rows = [
            {"symbol": "EURUSD", "bias": "SELL", "gap": -9, "hard_invalid": False},
            {"symbol": "GBPUSD", "bias": "SELL", "gap": -8, "hard_invalid": False},
        ]
        app.snapshot_adv_forecast = lambda row, _: "TMRW -7" if row["symbol"] == "EURUSD" else "TMRW +6"
        news = app._market_desk_news_rows(rows, now)
        self.assertIn("EURUSD SELL", news[0][4])
        self.assertNotIn("GBPUSD", news[0][4])
        self.assertEqual(news[0][3], "SUPPORT")

    def test_exact_dubai_slots_do_not_repeat(self):
        app = _load_app()
        app.is_market_closed = lambda: False
        for hour in (0, 2, 22, 23):
            now = datetime(2026, 10, 28, hour, 1)
            due, mark = app.daily_market_desk_due(now, None)
            self.assertTrue(due)
            self.assertEqual(app.daily_market_desk_due(now, mark), (False, mark))
        self.assertFalse(app.daily_market_desk_due(datetime(2026, 10, 28, 21, 1), None)[0])


if __name__ == "__main__":
    unittest.main()
