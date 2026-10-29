import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from test_snapshot_layout import _load_app


class SignalAlertIntegrationTests(unittest.TestCase):
    def test_market_desk_marks_near_support_without_changing_bias(self):
        app = _load_app()
        rows = [{"symbol": "EURJPY", "gap": -11, "bias": "SELL", "hard_invalid": False,
                 "base_score": -5, "quote_score": 6, "pl_zone": "BELOW",
                 "pl_price": 175.743, "pdl": 175.542}]
        watch = app._market_desk_pair_rows(rows)
        self.assertEqual(watch[0][3], "SELL -11")
        self.assertIn("NEAR SUPPORT (PDL)", watch[0][5])

    def test_phase_digest_shows_short_level_label(self):
        app = _load_app()
        class EmptyQuery:
            def __getattr__(self, name):
                if name == "execute":
                    return lambda: SimpleNamespace(data=[])
                return lambda *args, **kwargs: self
        app.supabase = SimpleNamespace(table=lambda _: EmptyQuery())
        app.SIGNAL_BOT_TOKEN = "test"
        app.SIGNAL_CHAT_ID = "test"
        app.is_market_closed = lambda: False
        app.classify_phase_server = lambda _: {"dir": "SELL", "gap": -11, "pdr_ok": False}
        app.verdict_action_word = lambda *_: "EXECUTE"
        queued = []
        app.enqueue_alert = lambda client, candidate, **kwargs: queued.append(candidate)
        app.send_phase_digest(
            [{"symbol": "EURJPY", "pl_zone": "BELOW"}], set(),
            "2026-10-23T00:00:00+00:00",
            {"EURJPY": {"priority": "REVIEW", "short_label": "NEAR SUPPORT"}},
        )
        self.assertIn("NEAR SUPPORT", queued[0]["text"])

    def test_structure_seeds_on_recovery_and_waits_for_durable_queue(self):
        app = _load_app()
        cycle = "2026-10-20T16:00:00+00:00"
        self.assertEqual(app.check_structure_alerts("EURUSD", {"pl_zone": "ABOVE"}, cycle, False), [])
        events = app.check_structure_alerts("EURUSD", {"pl_zone": "BELOW"}, cycle, True)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["alert_type"], "structure")
        self.assertEqual(app.PREV_ZONE["EURUSD"], "ABOVE")

    def test_same_pair_overlap_queues_one_prioritized_event(self):
        app = _load_app()
        cycle = "2026-10-20T16:00:00+00:00"
        app.PREV_ZONE["EURUSD"] = "ABOVE"
        queued = []
        app.enqueue_alert = lambda client, candidate, **kwargs: queued.append(candidate) or {"id": "queued"}
        symbols = app.dispatch_signal_candidates(
            cycle,
            [{"symbol": "EURUSD", "alert_type": "structure", "cycle_at": cycle,
              "detail": "Panda Lines FLIP", "state_zone": "BELOW", "event_id": "flip:1"}],
            [{"symbol": "EURUSD", "gap": -9, "bias": "SELL", "pl_zone": "BELOW"}],
            [{"symbol": "EURUSD", "gap": -9, "bias": "SELL", "reason": "GAP SURGE", "prev_gap": -6}],
            [{"symbol": "EURUSD", "gap": -9, "bias": "SELL", "momentum": "BUILDING"}],
            None,
        )
        self.assertEqual(len(queued), 1)
        self.assertEqual(queued[0]["alert_type"], "structure")
        self.assertEqual(queued[0]["gap"], -9)
        self.assertEqual(queued[0]["bias"], "SELL")
        self.assertEqual(len(queued[0]["evidence"]), 4)
        self.assertEqual(symbols, {"EURUSD"})
        self.assertEqual(app.PREV_ZONE["EURUSD"], "BELOW")

    def test_early_alert_displays_actual_previous_and_current_gap(self):
        app = _load_app()
        queued = []
        app.enqueue_alert = lambda client, candidate, **kwargs: queued.append(candidate) or {"id": "queued"}
        app.dispatch_signal_candidates(
            "2026-10-21T00:45:00+00:00", [], [],
            [{"symbol": "EURUSD", "gap": 9, "bias": "BUY", "reason": "GAP SURGE", "prev_gap": 1}],
            [], None,
        )
        self.assertEqual(queued[0]["detail"],
                         "GAP SURGE: gap +1 → +9 (magnitude +8 since previous cycle)")

    def test_gap_change_includes_fresh_pl_status_and_marks_stale_pl_unverified(self):
        app = _load_app()
        queued = []
        app.enqueue_alert = lambda client, candidate, **kwargs: queued.append(candidate) or {"id": "queued"}
        app._fresh_signal_level_file = lambda symbol: symbol == "EURUSD"
        app.dispatch_signal_candidates(
            "2026-10-21T00:45:00+00:00", [], [],
            [{"symbol": "EURUSD", "gap": 9, "bias": "BUY", "reason": "GAP SURGE", "prev_gap": 6},
             {"symbol": "GBPUSD", "gap": 6, "bias": "BUY", "reason": "GAP CROSSOVER", "prev_gap": 4}],
            [], None, pl_map={
                "EURUSD": {"pl_zone": "ABOVE", "pl_price": 1.1020, "pl_st": 1.1000, "pl_fl": 1.0990},
                "GBPUSD": {"pl_zone": "ABOVE", "pl_price": 1.3020, "pl_st": 1.3000, "pl_fl": 1.2990},
            },
        )
        by_symbol = {item["symbol"]: item for item in queued}
        self.assertEqual(by_symbol["EURUSD"]["pl_status"], "BELOW")
        self.assertEqual(by_symbol["GBPUSD"]["pl_status"], "UNVERIFIED")
        from lib.signal_alerts import render_immediate_message
        rendered = render_immediate_message(queued)
        self.assertIn("EURUSD</b> · Gap change\nBUY | gap +9 | PL BELOW", rendered)
        self.assertIn("GBPUSD</b> · Gap change\nBUY | gap +6 | PL UNVERIFIED", rendered)

    def test_level_review_enriches_alert_and_bias_digest_without_blocking(self):
        app = _load_app()
        app._fresh_signal_level_file = lambda _: True
        queued = []
        app.enqueue_alert = lambda client, candidate, **kwargs: queued.append(candidate) or {"id": "queued"}
        box = {"start_ts": 1800000000, "end_ts": 1800000000 + 14 * 86400,
               "open_price": 1.1000, "close_price": 1.1020}
        assessments = {}
        symbols = app.dispatch_signal_candidates(
            "2026-10-21T00:45:00+00:00", [], [],
            [{"symbol": "EURUSD", "gap": 9, "bias": "BUY", "reason": "GAP SURGE", "prev_gap": 6}],
            [], None,
            {"EURUSD": {"boxes": [box]}},
            {"EURUSD": {"pl_price": 1.1010, "pdh": 1.1015}},
            [{"symbol": "EURUSD", "gap": 9, "bias": "BUY", "momentum": "STRONG"}],
            assessments,
        )
        self.assertEqual(symbols, {"EURUSD"})
        self.assertEqual(queued[0]["level_priority"], "CAUTION")
        self.assertEqual(queued[0]["price_context"], "BETWEEN SUPPORT AND RESISTANCE")
        self.assertNotIn("PDH", queued[0]["price_context"])
        self.assertEqual(assessments["EURUSD"]["priority"], "CAUTION")

    def test_momentum_only_does_not_queue_immediate_message(self):
        app = _load_app()
        app.enqueue_alert = Mock()
        symbols = app.dispatch_signal_candidates(
            "2026-10-20T16:00:00+00:00", [], [], [],
            [{"symbol": "EURUSD", "gap": 6, "bias": "BUY", "momentum": "SPARK"}], None,
        )
        self.assertEqual(symbols, set())
        app.enqueue_alert.assert_not_called()

    def test_digest_key_changes_after_retry_window(self):
        from lib.signal_alerts import build_idempotency_key
        signature = "same market state"
        first = {"symbol": "DIGEST", "alert_type": "digest", "cycle_at": "2026-10-20T16:00:00+00:00",
                 "event_id": f"{signature}|{int(__import__('datetime').datetime.fromisoformat('2026-10-20T16:00:00+00:00').timestamp() // 900)}"}
        later = dict(first, cycle_at="2026-10-20T16:15:00+00:00",
                     event_id=f"{signature}|{int(__import__('datetime').datetime.fromisoformat('2026-10-20T16:15:00+00:00').timestamp() // 900)}")
        self.assertNotEqual(build_idempotency_key(first), build_idempotency_key(later))

    def test_relevance_rejects_reversed_structure(self):
        app = _load_app()
        app.parse_pl_file = lambda _: {"pl_zone": "BELOW", "pl_bos": "NONE", "pl_bos_t": 0}
        row = {"symbol": "EURUSD", "alert_type": "structure",
               "payload": {"symbol": "EURUSD", "state_zone": "ABOVE", "bias": "BUY"}}
        self.assertFalse(app.signal_outbox_relevant(row))

    def test_relevance_rejects_changed_gap_direction(self):
        app = _load_app()
        app.supabase = Mock()
        app.supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"symbol": "EURUSD", "gap": -9, "bias": "SELL", "hard_invalid": False,
             "pl_zone": "BELOW", "updated_at": datetime.now(timezone.utc).isoformat()}]
        row = {"symbol": "EURUSD", "alert_type": "gap_zone",
               "payload": {"symbol": "EURUSD", "bias": "BUY"}}
        self.assertFalse(app.signal_outbox_relevant(row))
