from pathlib import Path
import unittest


SOURCE = Path(
    "panda-indicators/2026-10-21/panda-levels-ctrader/Panda Levels.cs"
)


class PandaLevelsCTraderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SOURCE.read_text(encoding="utf-8")

    def test_indicator_is_parameter_free_and_informational(self):
        self.assertIn("class PandaLevels", self.text)
        self.assertIn("[Indicator(IsOverlay = true", self.text)
        self.assertNotIn('[Indicator("', self.text)
        self.assertIn("AccessRights = AccessRights.None", self.text)
        self.assertNotIn("[Parameter(", self.text)
        for trading_api in (
            "ExecuteMarketOrder",
            "PlaceLimitOrder",
            "PlaceStopOrder",
            "ClosePosition",
            "ModifyPosition",
        ):
            self.assertNotIn(trading_api, self.text)

    def test_draws_only_three_boxes_and_previous_period_levels(self):
        for label in (
            "Short", "Medium", "Long",
            "PDH", "PDL", "PWH", "PWL", "PMH", "PML", "PYH", "PYL",
        ):
            self.assertIn(f'"{label}"', self.text)

        for excluded in (
            "SuperTrend",
            "Follow Line",
            "Bollinger",
            "BOS",
            "PandaGapThreshold",
            "ShowPanel",
        ):
            self.assertNotIn(excluded, self.text)

    def test_boxes_use_completed_two_period_ranges(self):
        expected_calculations = (
            "Math.Max(d2.High, d3.High)",
            "Math.Min(d2.Low, d3.Low)",
            "Math.Max(w2.High, w3.High)",
            "Math.Min(w2.Low, w3.Low)",
            "Math.Max(m2.High, m3.High)",
            "Math.Min(m2.Low, m3.Low)",
        )
        for calculation in expected_calculations:
            self.assertIn(calculation, self.text)

    def test_previous_period_levels_span_the_chart_and_use_completed_periods(self):
        self.assertIn("DrawPreviousPeriodLevels", self.text)
        self.assertIn("MarketData.GetBars(TimeFrame.Weekly", self.text)
        self.assertIn("MarketData.GetBars(TimeFrame.Monthly", self.text)
        self.assertIn("higherTimeframeBars.Count - 2", self.text)
        self.assertIn("Server.Time.Year - 1", self.text)
        self.assertIn("Chart.DrawHorizontalLine", self.text)
        self.assertIn("LineStyle.Dots", self.text)
        self.assertNotIn("Chart.DrawTrendLine(prefix + \".Line\"", self.text)
        self.assertNotIn('prefix + ".Zone"', self.text)

    def test_history_loading_continues_until_boxes_are_ready_or_server_is_exhausted(self):
        self.assertIn("while (BuildPeriods(_hourlyBars, MonthKey).Count < 4)", self.text)
        self.assertNotIn("attempt < 20", self.text)


if __name__ == "__main__":
    unittest.main()
