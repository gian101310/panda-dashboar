import builtins
import importlib.util
import io
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class _FakeFastAPI:
    def add_middleware(self, *args, **kwargs):
        return None

    def post(self, *args, **kwargs):
        return lambda fn: fn

    get = post
    on_event = post


def _load_app():
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
    pil.Image = types.ModuleType("PIL.Image")
    pil.ImageDraw = types.ModuleType("PIL.ImageDraw")
    pil.ImageFont = types.ModuleType("PIL.ImageFont")
    sys.modules["PIL"] = pil
    sys.modules["PIL.Image"] = pil.Image
    sys.modules["PIL.ImageDraw"] = pil.ImageDraw
    sys.modules["PIL.ImageFont"] = pil.ImageFont

    stdout = sys.stdout
    stderr = sys.stderr
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
    sys.stderr = open(os.devnull, "w", encoding="utf-8")
    spec = importlib.util.spec_from_file_location("panda_app_mt4_parse_test", ROOT / "app.py")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    finally:
        sys.stdout = stdout
        sys.stderr = stderr
    return module


class Mt4FileParseTests(unittest.TestCase):
    def test_parses_current_mt4_whitespace_format(self):
        app = _load_app()
        complete = (
            "AUD      D1: +1 H4: +1 H1:  0\n"
            "CAD      D1: -4 H4: -3 H1:  0\n"
            "ADV : AUD      D1: -1 H4:  0 H1:  0\n"
            "ADV : CAD      D1: -4 H4:  0 H1:  0\n"
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "mt4_audcad.txt"
            source.write_text(complete, encoding="utf-8")
            app.MT4_PATH = temp_dir
            result = app.parse_mt4_file("AUDCAD")

        self.assertIsNotNone(result)
        self.assertEqual(result["base_cur"], "AUD")
        self.assertEqual(result["quote_cur"], "CAD")
        self.assertEqual(result["adv_base_d1"], -1)
        self.assertEqual(result["adv_quote_d1"], -4)

    def test_retries_when_mt4_file_is_incomplete_during_write(self):
        app = _load_app()
        complete = (
            "AUD      D1: +1 H4: +1 H1:  0\n"
            "CAD      D1: -4 H4: -3 H1:  0\n"
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "mt4_audcad.txt"
            source.write_text(complete, encoding="utf-8")
            app.MT4_PATH = temp_dir
            real_open = builtins.open
            reads = [io.StringIO("AUD      D1: +1 H4: +1 H1:  0\n"), None]

            def open_while_mt4_writes(path, *args, **kwargs):
                if Path(path) == source and reads:
                    next_read = reads.pop(0)
                    if next_read is not None:
                        return next_read
                return real_open(path, *args, **kwargs)

            with patch("builtins.open", side_effect=open_while_mt4_writes), patch.object(app.time, "sleep"):
                result = app.parse_mt4_file("AUDCAD")

        self.assertIsNotNone(result)
        self.assertEqual(result["base_cur"], "AUD")
        self.assertEqual(result["quote_cur"], "CAD")


if __name__ == "__main__":
    unittest.main()
