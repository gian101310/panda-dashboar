from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "mt4" / "Panda_Position_Drawer.mq4"


def read_source() -> str:
    return SOURCE.read_text(encoding="utf-8")


class PositionDrawerSourceTest(unittest.TestCase):
    def test_position_drawer_has_user_toggle_and_mode_controls(self):
        source = read_source()

        self.assertIn("input bool              InpEnabled", source)
        self.assertIn("input bool              InpShowButtons", source)
        self.assertIn("enum PandaPositionSide", source)
        self.assertIn("PANDA_LONG", source)
        self.assertIn("PANDA_SHORT", source)
        self.assertIn("RemovePositionObjects();", source)

    def test_position_drawer_supports_drag_resize_without_engine_bias(self):
        source = read_source()

        self.assertIn("input bool              InpAllowBoxResize", source)
        self.assertIn("OBJPROP_SELECTABLE, InpAllowBoxResize", source)
        self.assertIn("CHARTEVENT_OBJECT_DRAG", source)
        self.assertIn("SyncBoxPrices", source)
        self.assertNotIn("LoadEngineBiasSide", source)
        self.assertNotIn("InpBiasFileName", source)
        self.assertNotIn("TBG_BIAS", source)

    def test_position_drawer_has_chart_buttons_for_fast_side_switching(self):
        source = read_source()

        self.assertIn("input bool              InpShowButtons", source)
        self.assertIn("DrawControlButtons", source)
        self.assertIn("CHARTEVENT_OBJECT_CLICK", source)
        self.assertIn("g_longButtonName", source)
        self.assertIn("g_shortButtonName", source)
        self.assertIn("g_offButtonName", source)
        self.assertIn("ApplyButtonMode", source)


if __name__ == "__main__":
    unittest.main()
