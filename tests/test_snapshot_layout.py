import importlib.util
import asyncio
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
    image_font.truetype = lambda font_path, size: ("truetype", font_path, size)
    image_font.load_default = lambda: ("default",)
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

    def test_snapshot_font_loader_uses_existing_scalable_font_file(self):
        app = _load_app()

        font = app._load_snapshot_font("arialbd.ttf", 72)

        self.assertEqual(font[0], "truetype")
        self.assertTrue(Path(font[1]).is_absolute())
        self.assertTrue(Path(font[1]).exists())
        self.assertEqual(font[2], 72)


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


class SchedulerTimingTests(unittest.TestCase):
    def test_hourly_snapshot_still_runs_when_scheduler_wakes_after_first_10_seconds(self):
        app = _load_app()
        delayed_tick = datetime(2026, 6, 9, 2, 1, 12)

        due, mark = app.hourly_snapshot_due(delayed_tick, last_hour_mark=None)

        self.assertTrue(due)
        self.assertEqual(mark, datetime(2026, 6, 9, 2, 0, 0))

    def test_hourly_snapshot_runs_once_per_hour_after_delayed_tick(self):
        app = _load_app()
        first_tick = datetime(2026, 6, 9, 2, 3, 45)
        duplicate_tick = datetime(2026, 6, 9, 2, 59, 5)

        due, mark = app.hourly_snapshot_due(first_tick, last_hour_mark=None)
        duplicate_due, duplicate_mark = app.hourly_snapshot_due(duplicate_tick, mark)

        self.assertTrue(due)
        self.assertFalse(duplicate_due)
        self.assertEqual(duplicate_mark, mark)

    def test_scheduler_steps_run_in_worker_thread(self):
        app = _load_app()
        calls = []

        async def fake_to_thread(fn):
            calls.append(fn.__name__)
            return fn()

        def first_step():
            calls.append("first_ran")

        def second_step():
            calls.append("second_ran")

        original_to_thread = app.asyncio.to_thread
        app.asyncio.to_thread = fake_to_thread
        try:
            asyncio.run(app.run_scheduler_step("test", first_step, second_step))
        finally:
            app.asyncio.to_thread = original_to_thread

        self.assertEqual(calls, ["first_step", "first_ran", "second_step", "second_ran"])


class TelegramAiUpdateTests(unittest.TestCase):
    def test_ai_snapshot_fallback_uses_polished_market_update_format(self):
        app = _load_app()
        active = [
            {"symbol": "EURUSD", "bias": "BUY", "gap": 8.4, "momentum": "BUILDING", "pl_zone": "ABOVE"},
            {"symbol": "GBPJPY", "bias": "SELL", "gap": -7.2, "momentum": "STRONG", "pl_zone": "BELOW"},
            {"symbol": "AUDCAD", "bias": "BUY", "gap": 5.6, "momentum": "COOLING", "pl_zone": "BELOW"},
        ]

        fallback = app.build_ai_snapshot_fallback(active, "LONDON")

        self.assertIn("LONDON session", fallback)
        self.assertIn("EURUSD BUY", fallback)
        self.assertIn("GBPJPY SELL", fallback)
        self.assertNotIn("gap:", fallback)
        self.assertNotIn("mom:", fallback)
        self.assertLessEqual(len(fallback.splitlines()), 4)

    def test_ai_snapshot_fallback_handles_no_active_pairs(self):
        app = _load_app()

        fallback = app.build_ai_snapshot_fallback([], "ASIAN")

        self.assertEqual(
            fallback,
            "ASIAN session is quiet right now, with no active pairs above the signal gap threshold.\n"
            "Current dashboard data is still available in the snapshot image."
        )


class NewsAlertTimingTests(unittest.TestCase):
    def test_news_alert_threshold_selects_current_warning_bucket(self):
        app = _load_app()

        self.assertEqual(app.select_news_alert_threshold(181), None)
        self.assertEqual(app.select_news_alert_threshold(180), (180, "3H"))
        self.assertEqual(app.select_news_alert_threshold(59), (60, "1H"))
        self.assertEqual(app.select_news_alert_threshold(14), (15, "15M"))
        self.assertEqual(app.select_news_alert_threshold(2), (2, "2M"))
        self.assertEqual(app.select_news_alert_threshold(-1), None)

    def test_news_alert_key_includes_threshold_label(self):
        app = _load_app()
        event = {"country": "USD", "date": "2026-06-10", "time": "8:30am", "title": "CPI m/m"}

        self.assertEqual(
            app.build_news_alert_key(event, "1H"),
            "USD_2026-06-10_8:30am_CPI m/m_1H",
        )
        self.assertNotEqual(
            app.build_news_alert_key(event, "1H"),
            app.build_news_alert_key(event, "15M"),
        )


if __name__ == "__main__":
    unittest.main()
