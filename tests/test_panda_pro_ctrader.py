from pathlib import Path
import unittest


ROOT = Path("panda-indicators/2026-07-03/panda-pro")
LICENSED = ROOT / "Panda Pro Licensed.cs"
UNLICENSED = ROOT / "Panda Pro No License.cs"


class PandaProContractTests(unittest.TestCase):
    def test_registry_recognizes_panda_pro(self):
        registry = Path("lib/indicatorProducts.mjs").read_text(encoding="utf-8")
        self.assertIn("code: 'panda_pro'", registry)

    def test_both_variants_are_locked_down(self):
        for source in (LICENSED, UNLICENSED):
            with self.subTest(source=source.name):
                self.assertTrue(source.exists(), f"missing {source}")
                text = source.read_text(encoding="utf-8")
                self.assertNotIn("[Parameter", text)
                self.assertIn("ZoneWidthPercent = 0.02", text)
                self.assertIn("ExtendBars = 5000", text)
                self.assertNotIn("Chart.DrawText", text)
                self.assertNotIn("Chart.DrawIcon", text)
                self.assertNotIn("Notifications.", text)
                self.assertIn('Output("Panda Pro 1"', text)
                self.assertIn('Output("Panda Pro 4"', text)

    def test_licensed_variant_is_fail_closed(self):
        self.assertTrue(LICENSED.exists(), f"missing {LICENSED}")
        text = LICENSED.read_text(encoding="utf-8")
        for token in (
            "panda_pro",
            "Account.Number",
            "Account.BrokerName",
            "Http.Send",
            "LicenseCheckInterval",
            "LicenseGracePeriod",
            "DisableOutputs",
            "DENY|",
        ):
            self.assertIn(token, text)

    def test_unlicensed_variant_has_no_license_transport(self):
        self.assertTrue(UNLICENSED.exists(), f"missing {UNLICENSED}")
        text = UNLICENSED.read_text(encoding="utf-8")
        self.assertNotIn("indicator-license", text)
        self.assertNotIn("Http.Send", text)

    def test_neither_variant_can_trade_or_request_full_access(self):
        for source in (LICENSED, UNLICENSED):
            with self.subTest(source=source.name):
                self.assertTrue(source.exists(), f"missing {source}")
                text = source.read_text(encoding="utf-8")
                self.assertIn("AccessRights = AccessRights.None", text)
                self.assertNotIn("ExecuteMarketOrder", text)
                self.assertNotIn("AccessRights.FullAccess", text)


if __name__ == "__main__":
    unittest.main()
