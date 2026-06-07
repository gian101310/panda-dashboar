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
        self.assertIn("enum PandaPositionMode", source)
        self.assertIn("PANDA_MODE_MANUAL_LONG", source)
        self.assertIn("PANDA_MODE_MANUAL_SHORT", source)
        self.assertIn("PANDA_MODE_ENGINE_BIAS", source)
        self.assertIn("RemovePositionObjects();", source)

    def test_position_drawer_supports_drag_resize_and_optional_bias_file(self):
        source = read_source()

        self.assertIn("input bool              InpAllowBoxResize", source)
        self.assertIn("OBJPROP_SELECTABLE, InpAllowBoxResize", source)
        self.assertIn("CHARTEVENT_OBJECT_DRAG", source)
        self.assertIn("SyncBoxPrices", source)
        self.assertIn("LoadEngineBiasSide", source)
        self.assertIn("InpBiasFileName", source)


if __name__ == "__main__":
    unittest.main()
