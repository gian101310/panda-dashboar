from pathlib import Path
import unittest


SOURCE = Path(
    "panda-indicators/2026-07-02/panda-lines-v2-ctrader/"
    "Panda Lines v2 cTrader.cs"
)


class PandaLinesV2CTraderTests(unittest.TestCase):
    def test_ctrader_indicator_contains_full_mt4_contract(self):
        text = SOURCE.read_text(encoding="utf-8")
        required = [
            "class PandaLinesV2",
            "ST Period",
            "ST Multiplier",
            "ST Use ATR",
            "ST Show Signals",
            "BB Period",
            "BB Deviations",
            "BB Use ATR",
            "BB ATR Period",
            "BB Hide Labels",
            "S/R Show",
            "S/R Daily",
            "S/R Weekly",
            "S/R Monthly",
            "S/R Yearly",
            "S/R Zone Width %",
            "S/R Extend Left",
            "Alert SuperTrend",
            "Alert BB",
            "CalculateSuperTrend",
            "CalculateBBTrend",
            "DrawAllSrZones",
            "GetPreviousYearHighLow",
            "Notifications.PlaySound",
            "Chart.DrawRectangle",
            "Chart.DrawHorizontalLine",
            "Chart.DrawText",
            "Chart.DrawIcon",
            "MarketData.GetBars",
        ]

        missing = [token for token in required if token not in text]
        self.assertFalse(missing, f"missing cTrader features: {missing}")

    def test_port_uses_direct_sma_atr_and_population_stddev(self):
        text = SOURCE.read_text(encoding="utf-8")

        self.assertIn("sum / period", text)
        self.assertIn("Math.Sqrt(sum / period)", text)
        self.assertNotIn("Indicators.AverageTrueRange", text)
        self.assertNotIn("Indicators.BollingerBands", text)

    def test_alerts_are_closed_bar_only_and_idempotent(self):
        text = SOURCE.read_text(encoding="utf-8")

        self.assertIn("index != Bars.Count - 1", text)
        self.assertIn("index - 1", text)
        self.assertIn("index - 2", text)
        self.assertIn("_lastAlertedClosedBarTime", text)

    def test_source_does_not_request_elevated_access(self):
        text = SOURCE.read_text(encoding="utf-8")

        self.assertIn("AccessRights = AccessRights.None", text)
        self.assertNotIn("ExecuteMarketOrder", text)
        self.assertNotIn("Http.", text)


if __name__ == "__main__":
    unittest.main()
