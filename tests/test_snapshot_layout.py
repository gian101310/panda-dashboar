import importlib.util
import os
import sys
import types
from datetime import datetime, timezone
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class _FakeFastAPI:
    def add_middleware(self, *args, **kwargs):
        return None

    def post(self, *args, **kwargs):
        def decorator(fn):
            return fn
        return decorator

    def get(self, *args, **kwargs):
        def decorator(fn):
            return fn
        return decorator

    def on_event(self, *args, **kwargs):
        def decorator(fn):
            return fn
        return decorator


def _install_import_fakes():
    fastapi = types.ModuleType("fastapi")
    fastapi.FastAPI = lambda *args, **kwargs: _FakeFastAPI()
    fastapi.Request = object
    sys.modules["fastapi"] = fastapi

    cors = types.ModuleType("fastapi.middleware.cors")
    cors.CORSMiddleware = object
    sys.modules["fastapi.middleware"] = types.ModuleType("fastapi.middleware")
    sys.modules["fastapi.middleware.cors"] = cors

    supabase = types.ModuleType("supabase")
    supabase.create_client = lambda *args, **kwargs: object()
    sys.modules["supabase"] = supabase

    requests = types.ModuleType("requests")
    requests.get = lambda *args, **kwargs: None
    requests.post = lambda *args, **kwargs: None
    sys.modules["requests"] = requests

    pil = types.ModuleType("PIL")
    image = types.ModuleType("PIL.Image")
    image_draw = types.ModuleType("PIL.ImageDraw")
    image_font = types.ModuleType("PIL.ImageFont")
    pil.Image = image
    pil.ImageDraw = image_draw
    pil.ImageFont = image_font
    sys.modules["PIL"] = pil
    sys.modules["PIL.Image"] = image
    sys.modules["PIL.ImageDraw"] = image_draw
    sys.modules["PIL.ImageFont"] = image_font


def _load_app():
    _install_import_fakes()
    stdout = sys.stdout
    stderr = sys.stderr
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
    sys.stderr = open(os.devnull, "w", encoding="utf-8")
    spec = importlib.util.spec_from_file_location("panda_app_for_test", ROOT / "app.py")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    finally:
        sys.stdout = stdout
        sys.stderr = stderr
    return module


class SnapshotLayoutTests(unittest.TestCase):
    def test_telegram_snapshot_layout_keeps_all_context_readable(self):
        app = _load_app()

        layout = app.build_snapshot_layout(21)

        self.assertEqual(layout["columns"], 2)
        self.assertEqual(layout["width"], 3504)
        self.assertEqual(layout["height"], 3816)
        self.assertLessEqual(layout["height"], 4096)
        self.assertGreaterEqual(layout["row_h"], 300)
        self.assertEqual(
            layout["fields"],
            ["PAIR", "GAP", "BIAS", "H1/H4", "PL", "SCORE"],
        )
        self.assertGreaterEqual(layout["top_offsets"]["gap"], 420)
        self.assertGreaterEqual(layout["top_offsets"]["bias"], 650)
        self.assertGreaterEqual(layout["line_offsets"]["metrics"] - layout["line_offsets"]["box"], 55)
        self.assertGreaterEqual(layout["bottom_offsets"]["score"], 640)

    def test_telegram_snapshot_caption_is_ascii_only(self):
        app = _load_app()

        caption = app.build_snapshot_caption(
            buy_count=5,
            sell_count=3,
            yellow_count=3,
            white_count=10,
            now=datetime(2026, 6, 3, 21, 53),
        )

        self.assertEqual(
            caption,
            "PANDA ENGINE v3.0\n"
            "2026-06-03 21:53\n"
            "BUY: 5 | SELL: 3\n"
            "Watch: 3 | Idle: 10",
        )
        self.assertTrue(caption.isascii())


class MarketHoursTests(unittest.TestCase):
    def test_market_allows_friday_midnight_dubai_final_cycle(self):
        app = _load_app()

        final_cycle = datetime(2026, 5, 29, 20, 0, 30, tzinfo=timezone.utc)

        self.assertFalse(app.is_market_closed(final_cycle))

    def test_market_closes_after_friday_midnight_dubai_until_monday_open(self):
        app = _load_app()

        after_final_cycle = datetime(2026, 5, 29, 20, 1, 0, tzinfo=timezone.utc)
        sunday_before_open = datetime(2026, 5, 31, 21, 59, 0, tzinfo=timezone.utc)
        monday_dubai_open = datetime(2026, 5, 31, 22, 0, 0, tzinfo=timezone.utc)

        self.assertTrue(app.is_market_closed(after_final_cycle))
        self.assertTrue(app.is_market_closed(sunday_before_open))
        self.assertFalse(app.is_market_closed(monday_dubai_open))


if __name__ == "__main__":
    unittest.main()
