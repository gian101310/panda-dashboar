import unittest

from lib.signal_alerts import render_immediate_message
from lib.signal_price_levels import describe_price_levels


def box(days, first, second):
    return {"start_ts": 1800000000, "end_ts": 1800000000 + days * 86400,
            "open_price": first, "close_price": second}


class SignalPriceLevelTests(unittest.TestCase):
    def test_stacked_resistance_warns_buy_without_changing_gap(self):
        context = describe_price_levels(
            "EURUSD", {"boxes": [box(62, 1.1020, 1.1000), box(14, 1.1015, 1.0990)]},
            {"pl_price": 1.1010, "pdh": 1.1018}, "BUY", 1.1010)
        self.assertIn("Caution: 3 nearby resistance levels", context)
        self.assertIn("D1 box top", context)
        self.assertIn("H4 box top", context)
        self.assertIn("PDH", context)
        message = render_immediate_message([{"symbol": "EURUSD", "alert_type": "early_entry",
                                             "bias": "BUY", "gap": 9, "price_context": context}])
        self.assertIn("gap +9", message)
        self.assertIn("nearby resistance", message)

    def test_stacked_support_warns_sell_with_jpy_pips(self):
        context = describe_price_levels(
            "USDJPY", {"boxes": [box(62, 149.90, 150.30), box(14, 149.95, 150.20)]},
            {"pl_price": 150.00, "pdl": 149.92}, "SELL", 150.00)
        self.assertIn("nearby support", context)
        self.assertIn("D1 box bottom 10p", context)

    def test_crossing_is_provisional_and_missing_h1_is_not_invented(self):
        context = describe_price_levels(
            "EURUSD", {"boxes": [box(62, 1.0900, 1.1000), box(14, 1.0920, 1.0990)]},
            {"pl_price": 1.1003}, "BUY", 1.0980)
        self.assertIn("D1 box: live price above top by 3.0p", context)
        self.assertIn("unconfirmed by candle close", context)
        self.assertNotIn("H1", context)
        steady = describe_price_levels("EURUSD", {"boxes": [box(62, 1.0900, 1.1000)]},
                                       {"pl_price": 1.1020}, "BUY", 1.1010)
        self.assertNotIn("box: live price above", steady)

    def test_missing_price_or_invalid_box_is_silent(self):
        self.assertEqual(describe_price_levels("EURUSD", {"boxes": [box(14, 1.1, 1.2)]},
                                               {"pl_price": None}, "BUY"), "")
        self.assertEqual(describe_price_levels("EURUSD", {"boxes": [box(200, 1.1, 1.2)]},
                                               {"pl_price": 1.15}, "BUY"), "")


if __name__ == "__main__":
    unittest.main()
