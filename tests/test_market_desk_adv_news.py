import unittest
from datetime import datetime, timezone

from test_snapshot_layout import _load_app


class MarketDeskAdvNewsTests(unittest.TestCase):
    def test_current_watchlist_stays_on_actual_score_while_adv_covers_new_bias(self):
        app = _load_app()
        app.snapshot_adv_forecast = lambda row, now=None: "TMRW +7" if row["symbol"] == "EURJPY" else "TMRW -7"
        app.summarize_nearby_levels = lambda *_: {"label": "", "names": ""}
        rows = [
            {"symbol": "EURJPY", "bias": "WAIT", "gap": 2, "base_score": 3, "quote_score": 1},
            {"symbol": "GBPJPY", "bias": "BUY", "gap": 10, "base_score": 6, "quote_score": -4},
        ]
        watch = app._market_desk_pair_rows(rows)
        self.assertEqual(watch[0][1], "GBPJPY")
        projected = app._market_desk_adv_rows(rows)
        self.assertEqual(projected[0][0], "EURJPY")
        self.assertIn("NEXT BUY +7", projected[0][2])
        self.assertIn("New projected bias", projected[0][3])

    def test_news_agreement_uses_adv_even_when_current_bias_is_wait(self):
        app = _load_app()
        now = datetime(2026, 10, 28, 18, 0, tzinfo=timezone.utc)
        app.fetch_news_feed = lambda: [{
            "impact": "High", "country": "USD", "title": "CPI m/m",
            "date": "2026-10-28T19:00:00+00:00", "forecast": "0.4%", "previous": "0.2%",
        }]
        rows = [
            {"symbol": "EURUSD", "bias": "WAIT", "gap": -2, "hard_invalid": False},
            {"symbol": "GBPUSD", "bias": "SELL", "gap": -8, "hard_invalid": False},
        ]
        app.snapshot_adv_forecast = lambda row, _: "TMRW -7" if row["symbol"] == "EURUSD" else "TMRW +6"
        news = app._market_desk_news_rows(rows, now)
        self.assertIn("EURUSD SELL", news[0][4])
        self.assertNotIn("GBPUSD", news[0][4])
        self.assertEqual(news[0][3], "SUPPORT")

    def test_news_feed_failure_is_not_reported_as_no_news(self):
        app = _load_app()
        app.fetch_news_feed = lambda: []
        news = app._market_desk_news_rows([])
        self.assertIn("unavailable", news[0][1])

    def test_evening_adv_and_2_am_actual_slots_do_not_repeat(self):
        app = _load_app()
        app.is_market_closed = lambda: False
        for hour in (0, 2, 22, 23):
            now = datetime(2026, 10, 28, hour, 1)
            due, mark = app.daily_market_desk_due(now, None)
            self.assertTrue(due)
            self.assertEqual(app.daily_market_desk_due(now, mark), (False, mark))
            self.assertEqual(app.market_desk_report_type(now), "current" if hour == 2 else "adv")
        self.assertFalse(app.daily_market_desk_due(datetime(2026, 10, 28, 21, 1), None)[0])

    def test_midnight_keeps_the_previous_evening_adv_horizon(self):
        app = _load_app()
        midnight_dubai = datetime(2026, 10, 29, 20, 1, tzinfo=timezone.utc)
        reference = app._market_desk_forecast_reference(midnight_dubai)
        self.assertEqual(reference, datetime(2026, 10, 29, 18, 1, tzinfo=timezone.utc))
        self.assertEqual(reference.weekday(), 3)


if __name__ == "__main__":
    unittest.main()
