import unittest
from datetime import datetime, timezone

from test_snapshot_layout import _load_app


class MarketDeskAdvNewsTests(unittest.TestCase):
    def test_report_names_separate_pre_market_from_market_open(self):
        app = _load_app()
        self.assertEqual(app.market_desk_display_name("adv"), "PANDA PRE-MARKET DESK")
        self.assertEqual(app.market_desk_display_name("current"), "PANDA MARKET DESK")

    def test_current_watchlist_stays_on_actual_score_while_adv_covers_new_bias(self):
        app = _load_app()
        app.snapshot_adv_forecast = lambda row, now=None: "TMRW +7" if row["symbol"] == "EURJPY" else "TMRW -7"
        app.summarize_nearby_levels = lambda *_: {"label": "", "names": ""}
        rows = [
            {"symbol": "EURJPY", "bias": "WAIT", "gap": 2, "base_score": 3, "quote_score": 1},
            {"symbol": "GBPJPY", "bias": "BUY", "gap": 9, "base_score": 5, "quote_score": -4},
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

    def test_month_boundary_uses_adv_d1_for_next_trading_session(self):
        app = _load_app()
        row = {
            "base_d1": 6, "base_h4": 0, "adv_base_d1": -6,
            "adv_base_h4": 0, "adv_base_h1": 0,
            "quote_d1": 0, "quote_h4": 0, "adv_quote_d1": 0,
            "adv_quote_h4": 0, "adv_quote_h1": 0,
        }
        self.assertEqual(app.snapshot_adv_forecast(
            row, datetime(2026, 10, 30, 18, tzinfo=timezone.utc)), "MTH -6")
        self.assertEqual(app.snapshot_adv_forecast(
            row, datetime(2026, 10, 31, 18, tzinfo=timezone.utc)), "MTH -6")
        self.assertEqual(app.snapshot_adv_forecast(
            row, datetime(2026, 11, 1, 18, tzinfo=timezone.utc)), "WK +6")
        self.assertEqual(app.snapshot_adv_forecast(
            row, datetime(2026, 10, 29, 18, tzinfo=timezone.utc)), "TMRW +6")

    def test_opposing_extreme_forecast_scores_are_invalid(self):
        app = _load_app()
        monday = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)
        row = {
            "symbol": "EURUSD", "bias": "HARD_INVALID", "hard_invalid": True,
            "gap": 0, "base_d1": -5, "base_h4": -1, "base_h1": 4,
            "adv_base_d1": 0, "adv_base_h4": 1, "adv_base_h1": 4,
            "quote_d1": 2, "quote_h4": 0, "quote_h1": 1,
            "adv_quote_d1": 0, "adv_quote_h4": 0, "adv_quote_h1": 1,
        }
        self.assertEqual(app.snapshot_adv_forecast(row, monday), "TMRW INVALID")
        self.assertEqual(app._market_desk_adv_rows([row], monday)[0][1], "WAIT")
        row["base_d1"] = -3
        self.assertEqual(app.snapshot_adv_forecast(row, monday), "TMRW +2")

    def test_hard_invalid_snapshot_card_is_not_yellow_watch(self):
        app = _load_app()
        self.assertEqual(app.snapshot_card_classification(
            False, True, 0, True, "WAIT"), ("WHITE", "INVALID"))
        self.assertEqual(app.snapshot_card_classification(
            False, False, 2, True, "WAIT"), ("YELLOW", "WATCH"))
        self.assertEqual(app.snapshot_card_classification(
            False, False, 1, True, "WAIT"), ("WHITE", "INVALID"))
        self.assertEqual(app.snapshot_card_classification(
            False, False, 0, True, "WAIT"), ("WHITE", "INVALID"))
        self.assertEqual(app.snapshot_card_classification(
            True, False, 10, True, "BUY"), ("WHITE", "INVALID"))
        self.assertEqual(app.snapshot_card_classification(
            True, False, 10, True, "SELL"), ("WHITE", "INVALID"))
        self.assertEqual(app.snapshot_card_classification(
            True, False, 9, True, "BUY"), ("BUY", "BUY"))
        self.assertEqual(app.snapshot_card_classification(
            True, False, 6, True, "BUY"), ("YELLOW", "BUY"))

    def test_market_desk_marks_opposing_currency_scores_invalid(self):
        app = _load_app()
        rows = [
            {"symbol": "EURUSD", "base_currency": "EUR", "base_d1": -5,
             "base_h4": -1, "base_h1": 4, "base_score": -5,
             "quote_currency": "USD", "quote_d1": 2, "quote_h4": 0,
             "quote_h1": 1, "quote_score": 2},
            {"symbol": "EURAUD", "base_currency": "EUR", "base_d1": -6,
             "base_h4": -1, "base_h1": -1, "base_score": -6,
             "quote_currency": "AUD", "quote_d1": 1, "quote_h4": 0,
             "quote_h1": -4, "quote_score": -4},
        ]
        eur = next(item for item in app._market_desk_currency_rows(rows) if item[0] == "EUR")
        self.assertEqual(eur[:6], ["EUR", "-5", "-1", "+4", "—", "INVALID"])
        self.assertIn("D1 -5 / H1 +4", eur[6])
        split = [{"symbol": "EURUSD", "base_d1": 0, "base_h4": 0,
                  "base_h1": 5, "base_score_tf": "H1+5 H1-4"}]
        eur_split = next(item for item in app._market_desk_currency_rows(split) if item[0] == "EUR")
        self.assertEqual(eur_split[5], "INVALID")

    def test_market_desk_excludes_snapshot_only_ten_gap(self):
        app = _load_app()
        app.summarize_nearby_levels = lambda *_: {"label": "", "names": ""}
        row = {"symbol": "GBPAUD", "bias": "BUY", "gap": 10,
               "base_score": 5, "quote_score": -5,
               "base_currency": "GBP", "quote_currency": "AUD"}
        self.assertEqual(app._market_desk_pair_rows([row])[0][1], "NO SETUP")
        app.snapshot_adv_forecast = lambda *_: "TMRW +7"
        projected = app._market_desk_adv_rows([row])[0]
        self.assertEqual(projected[1], "INVALID +10")
        self.assertIn("Current invalid", projected[3])


if __name__ == "__main__":
    unittest.main()
