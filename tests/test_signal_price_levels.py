import unittest

from lib.signal_alerts import render_immediate_message
from lib.signal_price_levels import (assess_price_levels, describe_price_levels,
                                     related_h4_breadth, summarize_nearby_levels)


def box(days, first, second):
    return {"start_ts": 1800000000, "end_ts": 1800000000 + days * 86400,
            "open_price": first, "close_price": second}


class SignalPriceLevelTests(unittest.TestCase):
    def test_plain_nearby_labels_follow_price_and_show_a_same_side_stack(self):
        support = summarize_nearby_levels(
            "EURJPY", None, {"pl_price": 175.743, "pdl": 175.542})
        self.assertEqual(support, {"label": "NEAR SUPPORT", "names": "PDL"})
        resistance = summarize_nearby_levels(
            "USDJPY", None, {"pl_price": 156.639, "pdl": 156.690})
        self.assertEqual(resistance["label"], "NEAR RESISTANCE")
        stack = summarize_nearby_levels(
            "NZDCAD", None, {"pl_price": 0.79576, "pdl": 0.79502, "pwl": 0.79424})
        self.assertEqual(stack, {"label": "STACKED SUPPORT", "names": "PDL + PWL"})
        both = summarize_nearby_levels(
            "EURUSD", None, {"pl_price": 1.1000, "pdl": 1.0990, "pdh": 1.1010})
        self.assertEqual(both["label"], "BETWEEN SUPPORT AND RESISTANCE")

    def test_stacked_resistance_warns_buy_without_changing_gap(self):
        context = describe_price_levels(
            "EURUSD", {"boxes": [box(62, 1.1020, 1.1000), box(14, 1.1015, 1.0990)]},
            {"pl_price": 1.1010, "pdh": 1.1018}, "BUY", 1.1010)
        self.assertIn("Low-priority review: 3 nearby resistance levels", context)
        self.assertIn("D1 box top", context)
        self.assertIn("H4 box top", context)
        self.assertIn("PDH", context)
        message = render_immediate_message([{"symbol": "EURUSD", "alert_type": "early_entry",
                                             "bias": "BUY", "gap": 9, "price_context": context}])
        self.assertIn("gap +9", message)
        self.assertIn("nearby resistance", message)

    def test_previous_day_lines_alone_count_and_strong_momentum_keeps_review(self):
        weak = assess_price_levels("EURUSD", {}, {"pl_price": 1.1010, "pdh": 1.1015,
                                                  "pdl": 1.1018}, "BUY", gap=6, momentum="COOLING")
        self.assertEqual(weak["priority"], "LOW PRIORITY")
        self.assertIn("PDH 5p", weak["text"])
        self.assertIn("PDL 8p", weak["text"])
        strong = assess_price_levels("EURUSD", {"boxes": [box(14, 1.1000, 1.1020)]},
                                    {"pl_price": 1.1010, "pdh": 1.1015},
                                    "BUY", gap=9, momentum="STRONG")
        self.assertEqual(strong["priority"], "CAUTION")
        self.assertIn("H4 box: price inside range", strong["text"])
        self.assertIn("Strong gap or momentum present", strong["text"])
        rendered = render_immediate_message([{"symbol": "EURUSD", "alert_type": "early_entry",
                                              "bias": "BUY", "gap": 9,
                                              "price_context": strong["text"],
                                              "level_priority": strong["priority"]}])
        self.assertIn("LEVEL REVIEW", rendered)
        self.assertNotIn("LOW PRIORITY", rendered)

    def test_related_h4_breadth_handles_quote_orientation(self):
        parsed = {"EURUSD": {"boxes": [box(14, 1.09, 1.10)]},
                  "EURGBP": {"boxes": [box(14, 0.80, 0.81)]},
                  "EURAUD": {"boxes": [box(14, 1.50, 1.51)]},
                  "GBPEUR": {"boxes": [box(14, 1.20, 1.21)]}}
        pl = {"EURUSD": {"pl_price": 1.11}, "EURGBP": {"pl_price": 0.82},
              "EURAUD": {"pl_price": 1.52}, "GBPEUR": {"pl_price": 1.19}}
        breadth = related_h4_breadth("EURUSD", "BUY", parsed, pl)
        self.assertEqual((breadth["matched"], breadth["available"]), (3, 3))
        assessment = assess_price_levels("EURUSD", parsed["EURUSD"], pl["EURUSD"],
                                         "BUY", gap=9, momentum="STRONG", h4_breadth=breadth)
        self.assertIn("H4 breadth: 3/3 fresh EUR pairs", assessment["text"])
        self.assertIn("not a score change", assessment["text"])

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
