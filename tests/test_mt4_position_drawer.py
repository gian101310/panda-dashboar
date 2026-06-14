from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "mt4" / "Panda_RiskReward_Tool.mq4"


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
        self.assertIn("DrawFloatingPanel", source)
        self.assertIn("CHARTEVENT_OBJECT_CLICK", source)
        self.assertIn("g_longButtonName", source)
        self.assertIn("g_shortButtonName", source)
        self.assertIn("g_offButtonName", source)
        self.assertIn("ApplyButtonMode", source)

    def test_position_drawer_has_visible_draggable_lines_and_tags(self):
        source = read_source()

        self.assertIn("g_panelName", source)
        self.assertIn("g_entryTagName", source)
        self.assertIn("DrawPriceTag", source)
        self.assertIn("OBJPROP_SELECTED, true", source)
        self.assertIn("DrawLine(g_entryName, g_entry, InpEntryColor, STYLE_SOLID, 3", source)

    def test_dragging_entry_moves_whole_position(self):
        source = read_source()

        self.assertIn("MoveWholePositionFromEntry", source)
        self.assertIn("double delta = newEntry - g_entry", source)
        self.assertIn("g_stop = NormalizeDouble(g_stop + delta, _Digits)", source)
        self.assertIn("g_target = NormalizeDouble(g_target + delta, _Digits)", source)

    def test_position_survives_timeframe_changes(self):
        source = read_source()

        self.assertIn("LoadSavedState", source)
        self.assertIn("SaveState", source)
        self.assertIn("GlobalVariableSet(StateKey(\"entry\")", source)
        self.assertIn("GlobalVariableGet(StateKey(\"entry\"))", source)
        self.assertIn("SaveState();", source)

    def test_delete_button_removes_drawings_and_saved_state(self):
        source = read_source()

        self.assertIn("g_deleteButtonName", source)
        self.assertIn('"DELETE"', source)
        self.assertIn("DeleteAllDrawings", source)
        self.assertIn("ClearSavedState", source)
        self.assertIn("GlobalVariableDel(StateKey(\"entry\"))", source)
        self.assertIn("ObjectsTotal(0, -1, -1)", source)


if __name__ == "__main__":
    unittest.main()
